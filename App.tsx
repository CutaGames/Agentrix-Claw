import React, { useEffect, useMemo, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator, Text, AppState, AppStateStatus, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from './src/stores/authStore';
import { useSoulBirthStore } from './src/stores/soulBirthStore';
import { setApiConfig, loadTokenFromStorage, apiFetch } from './src/services/api';
import { fetchCurrentUser } from './src/services/auth';
import { getMyInstances } from './src/services/openclaw.service';
import { resolveAgentDisplayName } from './src/utils/agentDisplayName';
import { colors } from './src/theme/colors';
import { useThemeMode } from './src/theme/useTheme';
import { useSettingsStore } from './src/stores/settingsStore';
import { useNotificationStore } from './src/stores/notificationStore';
import { startNotificationPolling, stopNotificationPolling } from './src/services/realtime.service';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { checkAndPromptUpdate, silentBackgroundUpdate } from './src/services/appUpdate.service';
import { migrateFromAsyncStorage } from './src/stores/mmkvStorage';
import { applyVoiceUiE2EBootstrap, isVoiceUiE2EEnabled } from './src/testing/e2e';
import { applyPetSoulE2EBootstrap, isPetSoulE2EEnabled } from './src/testing/petSoulE2E';
import { resolveMobileWakeWordConfig } from './src/config/wakeWord';
import { hasLocalWakeWordModel, thresholdFromSensitivity } from './src/services/localWakeWord.service';
import {
  isAndroidBackgroundWakeWordAvailable,
  startAndroidBackgroundWakeWordService,
  stopAndroidBackgroundWakeWordService,
  syncAndroidBackgroundWakeWordConfig,
} from './src/services/androidBackgroundWakeWord.service';
import { initLlamaBridge } from './src/services/llamaRnBridge';
import { initCrashReport, setUser as setCrashUser } from './src/services/crashReport';
import { bootPetModeBus } from './src/services/petMode';
import { bootPetModeAdapters } from './src/services/petModeAdapters';
import { bootVoiceGreetScheduler } from './src/services/voiceGreetScheduler.service';
import { bootFormVariantWatcher } from './src/services/formVariant.service';
import { bootCompanionHealthWatcher } from './src/services/companionHealth.service';
import { initIap, setUser as setIapUser } from './src/services/iap.service';
import {
  initAnalytics,
  trackEvent,
  setUser as setAnalyticsUser,
} from './src/services/analytics.service';
import { OtaModelDownloadService } from './src/services/otaModelDownload.service';
import { WatchDataLayerService } from './src/services/wearables/watchDataLayerBridge.service';
import { AxpToastHost } from './src/components/AxpToastHost';
import { MobilePetProactiveBanner } from './src/components/pet/MobilePetProactiveBanner';
import { CompanionLayer } from './src/components/companion/CompanionLayer';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { resolveLegacyPath } from './src/navigation/legacyRouteTable';
import {
  isMobileV7RouteCandidate,
  normalizeMobileV7Route,
} from './src/navigation/v7/routeContract';
import { navigationRef as sharedNavigationRef } from './src/navigation/navigationRef';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { attachLinkingListener } from './src/services/intents/intentBridge';
import { installDefaultIntentHandlers } from './src/services/intents/defaultIntentHandlers';
import { resolveDeveloperApprovalPushDestination } from './src/services/developerWorkspaceApprovals';

// Register llama.rn bridge for on-device LLM inference
initLlamaBridge();

// Sprint P-6 (2026-05-22): boot the pet form-state bus so the
// GlobalFloatingBall and any future pet surfaces can subscribe to a
// single source of truth for "what is the pet doing right now". Mirror
// of the desktop bus, mobile-tailored (no Pro Mode, no Computer Use).
bootPetModeBus();

// Initialize Sentry crash reporting (no-op if SENTRY_DSN unset)
initCrashReport();

// Initialize mobile analytics (no-op if user has not opted in)
initAnalytics();
trackEvent('mobile_launch', { platform: Platform.OS });

// Singleton ref so the system-assistant intent handlers + the P-9 companion
// layer (ball / sheets / capsules) can navigate the React Navigation root
// without prop drilling AND without useNavigation() (which throws at the
// CompanionLayer sibling position). Defined in its own module so any file
// can import it. Assigned to <NavigationContainer ref={navigationRef}>.
const navigationRef = sharedNavigationRef;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

const isMaestroE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E === '1';
const isAgentFirstBuild = process.env.EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA === '1';
let pendingDeveloperApprovalRef: string | null = null;
const handledNotificationResponseIds = new Set<string>();

function openDeveloperApproval(approvalRef: string): boolean {
  const auth = useAuthStore.getState();
  if (!isAgentFirstBuild) return false;
  if (
    !auth.isInitialized
    || !auth.isAuthenticated
    || !navigationRef.isReady()
  ) {
    pendingDeveloperApprovalRef = approvalRef;
    return false;
  }
  (navigationRef as any).navigate('Main', {
    screen: 'Work',
    params: {
      screen: 'WorkApprovals',
      params: {
        approvalRef,
        source: 'push',
      },
    },
  });
  pendingDeveloperApprovalRef = null;
  return true;
}

function drainPendingDeveloperApproval(): void {
  if (pendingDeveloperApprovalRef) {
    openDeveloperApproval(pendingDeveloperApprovalRef);
  }
}

/**
 * Maestro E2E auto-login seed (native, device-side).
 *
 * The Maestro UI-test APK (built with EXPO_PUBLIC_MAESTRO_E2E=1) is a fresh
 * install with NO persisted session, so it boots to the Login screen. Every
 * `.maestro` flow that exercises an authenticated surface (tabs / drawer /
 * sheets) then fails its non-optional assertVisible because the tab bar isn't
 * present. We seed a synthetic authenticated session so the full RootNavigator
 * renders and flows can drive the real screens.
 *
 * STRICTLY gated on the compile-time EXPO_PUBLIC_MAESTRO_E2E flag — production
 * APKs are built WITHOUT it, so this is dead code there (never auto-logs-in a
 * real user). Unlike applyVoiceUiE2EBootstrap (web/Playwright, window-based),
 * this is native-safe: it seeds the zustand stores directly, no `window`.
 */
let __maestroSeeded = false;
function seedMaestroE2ESession(): void {
  if (__maestroSeeded) return;
  __maestroSeeded = true;
  try {
    const instance = {
      id: 'e2e-instance-1',
      name: 'QA Agent',
      instanceUrl: 'https://agentrix.top/e2e',
      status: 'active' as const,
      deployType: 'cloud' as const,
      agentAccountId: 'e2e-agent-account-1',
      metadata: { agentAccountId: 'e2e-agent-account-1' },
    };
    useAuthStore.setState({
      user: {
        id: 'e2e-user-1',
        agentrixId: 'maestro-e2e',
        nickname: 'Maestro E2E',
        roles: ['tester'],
        provider: 'email',
        activeInstanceId: instance.id,
        openClawInstances: [instance],
      } as any,
      token: 'e2e-token',
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
      hasCompletedOnboarding: true,
      hasValidInvitation: true,
      activeInstance: instance as any,
    } as any);
    setApiConfig({ token: 'e2e-token' });
    // The SoulBirthHost overlay is mounted UNCONDITIONALLY over the Main
    // (tabs) branch and self-gates on the SEPARATE `soulBirthStore`. A freshly
    // seeded authenticated user has terminated=false → SoulBirthHost computes
    // active=true, step='birth' and renders the BirthStep as a full-screen
    // absoluteFill overlay that COVERS the tab bar — so Maestro never finds
    // `tab-world/...` and every authenticated flow fails. Mark Soul_Birth as
    // terminated (and bind it to the seeded user id so SoulBirthHost's
    // bindUser('e2e-user-1') sees the SAME user → no-op → keeps terminated)
    // so the overlay returns null and the real tabs render.
    useSoulBirthStore.setState({
      boundUserId: 'e2e-user-1',
      terminated: true,
      replaying: false,
      suspended: false,
      completed: { birth: true, first_words: true, connect_desktop: true, settle_aeon: true },
    } as any);
  } catch (e) {
    console.warn('[maestro-e2e] seed session failed:', e);
  }
}

function SplashScreen() {
  // P-9 wave 12 (T23.1): brand the splash with the active pet sprite
  // instead of the placeholder "AX" tile. Pure require — no network.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { PetSpriteImage } = require('./src/components/PetSpriteImage') as typeof import('./src/components/PetSpriteImage');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 96, height: 96, borderRadius: 24, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderColor: colors.accent, borderWidth: 2 }}>
        <PetSpriteImage sprite="idle" size={72} testID="splash-pet-sprite" />
      </View>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ color: colors.textMuted, marginTop: 16, fontSize: 14 }}>Agentrix</Text>
    </View>
  );
}

/**
 * Sprint P-8 v0.4.6 (2026-05-22) — kept here as a no-op shim. The
 * earlier root-level mount of `<GlobalFloatingBall />` as a
 * NavigationContainer sibling crashed cold launch with "Couldn't get
 * the navigation state" because `useNavigation()` requires an
 * enclosing navigator screen. The ball is now mounted directly inside
 * `HomeScreen` (and any other screen that wants it) where the
 * navigation context resolves correctly.
 */
function AuthenticatedFloatingBall() {
  return null;
}

async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '96a641e0-ce03-45ff-9de7-2cd89c488236',
    });
    return tokenData.data;
  } catch (e) {
    console.warn('Push token registration failed:', e);
    return null;
  }
}

function AppNavigator() {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const wakeWordSettings = useSettingsStore((s) => s.wakeWordConfig);
  const { setAuth, setInitialized, clearAuth } = useAuthStore.getState();
  const notifSubRef = useRef<Notifications.Subscription | null>(null);
  const isVoiceUiE2E = isVoiceUiE2EEnabled();
  const isPetSoulE2E = isPetSoulE2EEnabled();
  const skipStartupIntegrations = isVoiceUiE2E || isPetSoulE2E || isMaestroE2E;
  const wakeWordConfig = useMemo(() => resolveMobileWakeWordConfig(wakeWordSettings), [wakeWordSettings]);
  const hasLocalModel = hasLocalWakeWordModel(wakeWordConfig.localModel);
  const backgroundWakeWordEnabled = Platform.OS === 'android'
    && isAndroidBackgroundWakeWordAvailable()
    && isAuthenticated
    && wakeWordConfig.enabled;
  const backgroundWakeWordConfigRef = useRef({
    enabled: false,
    displayName: '',
    threshold: 0.81,
    activeInstanceId: null as string | null,
    activeInstanceName: null as string | null,
    model: null as typeof wakeWordConfig.localModel,
  });

  const reconcileStartupLocalPackages = () => {
    const migrationResult = OtaModelDownloadService.runStartupPackageMigration();
    if (
      migrationResult.invalidatedModelIds.length === 0
      && migrationResult.removedArtifacts.length === 0
    ) {
      return;
    }

    const settingsState = useSettingsStore.getState();
    const activeLocalModelWasInvalidated = migrationResult.invalidatedModelIds.includes(settingsState.localAiModelId)
      || migrationResult.invalidatedModelIds.includes(settingsState.selectedModelId);

    if (activeLocalModelWasInvalidated) {
      useSettingsStore.setState({
        localAiEnabled: false,
        localAiStatus: 'not_downloaded',
        localAiProgress: 0,
      });
    } else {
      const currentLocalModelDownloaded = OtaModelDownloadService.isModelDownloaded(settingsState.localAiModelId);
      const artifactStatuses = OtaModelDownloadService.getArtifactStatuses(settingsState.localAiModelId);
      const downloadedBytes = artifactStatuses.reduce((sum, item) => sum + (item.downloaded ? item.sizeBytes : 0), 0);
      const totalBytes = artifactStatuses.reduce((sum, item) => sum + item.sizeBytes, 0);
      const packagePercent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

      useSettingsStore.setState({
        localAiEnabled: currentLocalModelDownloaded,
        localAiProgress: currentLocalModelDownloaded ? packagePercent : 0,
      });
    }

    console.warn(
      'Invalidated stale on-device model artifacts during startup migration:',
      JSON.stringify(migrationResult),
    );
  };

  useEffect(() => {
    backgroundWakeWordConfigRef.current = {
      enabled: backgroundWakeWordEnabled,
      displayName: wakeWordConfig.displayName,
      threshold: thresholdFromSensitivity(wakeWordConfig.sensitivity),
      activeInstanceId: activeInstance?.id ?? null,
      activeInstanceName: activeInstance?.name ?? null,
      model: wakeWordConfig.localModel,
    };
  }, [activeInstance?.id, activeInstance?.name, backgroundWakeWordEnabled, wakeWordConfig.displayName, wakeWordConfig.localModel, wakeWordConfig.sensitivity]);

  useEffect(() => {
    if (!isAndroidBackgroundWakeWordAvailable()) {
      return;
    }

    const payload = backgroundWakeWordConfigRef.current;
    void syncAndroidBackgroundWakeWordConfig(payload).catch((error) => {
      console.warn('Failed to sync Android background wake-word config:', error);
    });

    if (!backgroundWakeWordEnabled || AppState.currentState === 'active') {
      void stopAndroidBackgroundWakeWordService().catch(() => {});
    }
  }, [backgroundWakeWordEnabled, activeInstance?.id, activeInstance?.name, wakeWordConfig.displayName, wakeWordConfig.localModel, wakeWordConfig.sensitivity]);

  useEffect(() => {
    if (!isAndroidBackgroundWakeWordAvailable()) {
      return;
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void stopAndroidBackgroundWakeWordService().catch(() => {});
        return;
      }

      if (state === 'background' || state === 'inactive') {
        const payload = backgroundWakeWordConfigRef.current;
        if (!payload.enabled) {
          void stopAndroidBackgroundWakeWordService().catch(() => {});
          return;
        }

        void (async () => {
          try {
            await syncAndroidBackgroundWakeWordConfig(payload);
            await startAndroidBackgroundWakeWordService();
          } catch (error) {
            console.warn('Failed to start Android background wake-word service:', error);
          }
        })();
      }
    });

    return () => sub.remove();
  }, []);

  // ── System assistant intents (Siri / Google Assistant / 小爱 / 小艺 / 鸿蒙) ──
  // Boots the cross-vendor intent dispatcher exactly once. It listens for
  // `agentrix://intent/<name>?...` deep links and routes them through the
  // handler set wired in `defaultIntentHandlers.ts`. Without this, V4 PRD
  // §8 intents (create-pet / switch-skin / market-search / pet-mood) reach
  // the JS bundle but no handler answers, so Siri/Assistant get a silent
  // "I couldn't do that".
  useEffect(() => {
    const detachHandlers = installDefaultIntentHandlers(() => navigationRef.current as any);
    const detachLinking = attachLinkingListener();
    return () => {
      try { detachLinking(); } catch { /* ignore */ }
      try { detachHandlers(); } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (isPetSoulE2E && applyPetSoulE2EBootstrap()) {
      setInitialized(true);
      return;
    }

    if (isVoiceUiE2E && applyVoiceUiE2EBootstrap()) {
      setInitialized(true);
      return;
    }

    if (isMaestroE2E) {
      // Seed a synthetic authenticated session so the Maestro UI-test build
      // boots into the full authenticated app (tabs/drawer present) instead of
      // the Login screen. Gated on the compile-time flag — no-op in prod.
      seedMaestroE2ESession();
      setInitialized(true);
      return;
    }

    const restoreSession = async () => {
      try {
        // Migrate AsyncStorage data to MMKV (one-time, on first launch after update)
        await migrateFromAsyncStorage();
        reconcileStartupLocalPackages();

        // Load token from SecureStore (key: 'clawlink_token')
        const token = await loadTokenFromStorage();
        if (!token) {
          // No stored token �?check if Zustand persist says user is authenticated
          // (edge case: SecureStore was cleared but AsyncStorage persist wasn't)
          const cachedStore = useAuthStore.getState();
          if (!cachedStore.isAuthenticated) {
            setInitialized(true);
            return;
          }
          // isAuthenticated persisted but token gone �?force re-login
          await clearAuth();
          setInitialized(true);
          return;
        }
        setApiConfig({ token });
        const cachedState = useAuthStore.getState();
        if (cachedState.user && !cachedState.isAuthenticated) {
          cachedState.setAuth(cachedState.user, token);
        } else if (!cachedState.user) {
          useAuthStore.setState({ token, isAuthenticated: true });
        }
        try {
          const user = await fetchCurrentUser();
          if (user) {
            await setAuth(user, token);

            // Restore OpenClaw instances (session restore path – mirrors handleLoginResult)
            try {
              const instances = await getMyInstances();
              if (instances && instances.length > 0) {
                const storeInstances = instances.map((inst: any, index: number) => ({
                  ...inst,
                  id: inst.id,
                  name: resolveAgentDisplayName(inst, `Agent ${index + 1}`),
                  instanceUrl: inst.instanceUrl || '',
                  status: (inst.status || 'active') as 'active' | 'disconnected' | 'error',
                  deployType: (inst.deployType || 'cloud') as 'cloud' | 'local' | 'server' | 'existing',
                  version: inst.version,
                  lastSyncAt: inst.lastSyncAt,
                  metadata: inst.metadata,
                  agentAccountId: inst.agentAccountId ?? inst.metadata?.agentAccountId,
                }));
                const currentState = useAuthStore.getState();
                currentState.updateUser({ openClawInstances: storeInstances });
                if (!currentState.activeInstance && storeInstances.length > 0) {
                  useAuthStore.setState({ activeInstance: storeInstances[0] ?? null });
                }
              }
            } catch (instanceErr) {
              console.warn('Failed to restore instances during session restore:', instanceErr);
            }

          } else {
            await clearAuth();
            stopNotificationPolling();
            useNotificationStore.getState().setPushToken(null);
          }
        } catch (e: any) {
          const msg = e?.message || '';
          if (msg.includes('401') || msg.includes('Unauthorized')) {
            // Token expired or revoked �?force re-login
            await clearAuth();
            stopNotificationPolling();
            useNotificationStore.getState().setPushToken(null);
          } else {
            // Network error or 5xx �?keep user logged in with last cached session
            console.warn('Session validation network error (using cached session):', msg);
          }
        }
      } catch (e) {
        console.warn('Session restore failed:', e);
      } finally {
        setInitialized(true);
      }
    };
    restoreSession();

    if (!skipStartupIntegrations) {
      checkAndPromptUpdate().catch(() => {});
    }

    const handleAppStateChange = (state: AppStateStatus) => {
      if (!skipStartupIntegrations && state === 'active') {
        silentBackgroundUpdate().catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopNotificationPolling();
      appStateSub.remove();
    };
  }, [clearAuth, isVoiceUiE2E, setAuth, setInitialized, skipStartupIntegrations]);

  useEffect(() => {
    if (skipStartupIntegrations || Platform.OS !== 'android') {
      return;
    }

    const syncCurrentAuth = () => {
      const currentState = useAuthStore.getState();
      if (!currentState.token) {
        return;
      }
      void WatchDataLayerService.syncAuthState({
        accessToken: currentState.token,
        userId: currentState.user?.id ?? null,
        expiresAt: null,
      }).catch((error) => {
        console.warn('Failed to sync watch auth state:', error);
      });
    };

    void WatchDataLayerService.startListening()
      .then(syncCurrentAuth)
      .catch((error) => {
        console.warn('Failed to start Wear Data Layer listener:', error);
      });

    const unsubscribeAuthRequest = WatchDataLayerService.onMessage('/agentrix/auth/request', syncCurrentAuth);
    return () => {
      unsubscribeAuthRequest();
      void WatchDataLayerService.stopListening().catch(() => {});
    };
  }, [isAuthenticated, skipStartupIntegrations, token]);

  // Sprint P-6 Phase 6.4 (2026-05-22): once authenticated, wire the
  // backend pet-presence socket and wearable wrist-trigger emitter
  // into the unified petMode bus. The adapters return a disposer the
  // effect uses to clean up on logout / unmount.
  useEffect(() => {
    if (skipStartupIntegrations || !isAuthenticated || !token) return;

    let dispose: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // Reuse the same per-install device id used by MobilePetProactiveBanner
      // so the backend keeps a single device row instead of two.
      let deviceId = 'mobile-anon';
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const cached = await AsyncStorage.getItem('agentrix.deviceId');
        if (cached) deviceId = cached;
      } catch {
        /* ignore — defaults to mobile-anon */
      }
      if (cancelled) return;
      dispose = bootPetModeAdapters({ token, deviceId });
      // P-9 wave 6 — Voice_Greet scheduler hooks AppState transitions
      // for morning / evening / comeback windows. We compose the
      // scheduler disposer with the adapters disposer so the cleanup
      // path stays single-source.
      const disposeGreet = bootVoiceGreetScheduler();
      // P-9 wave 9 — Form_Variant watcher (15min poll + AppState foreground).
      const disposeVariant = bootFormVariantWatcher();
      // P-9 wave 12 — Health/movement nudges (steps + sitting + late reminder).
      const disposeHealth = bootCompanionHealthWatcher();
      const composed = dispose;
      dispose = () => {
        try { composed?.(); } catch { /* noop */ }
        try { disposeGreet(); } catch { /* noop */ }
        try { disposeVariant(); } catch { /* noop */ }
        try { disposeHealth(); } catch { /* noop */ }
      };
    })();

    return () => {
      cancelled = true;
      if (dispose) {
        try { dispose(); } catch { /* noop */ }
        dispose = null;
      }
    };
  }, [isAuthenticated, skipStartupIntegrations, token]);

  // Bind the current user to Sentry so subsequent crash reports are
  // scoped to them. We only send the opaque user id, never email or
  // wallet — see crashReport.ts beforeSend sanitization.
  useEffect(() => {
    if (skipStartupIntegrations) return;
    const userId = isAuthenticated ? useAuthStore.getState().user?.id ?? null : null;
    setCrashUser(userId);
    setAnalyticsUser(userId);
    if (userId) {
      trackEvent('mobile_login');
    }
    // Also rebind RevenueCat so subsequent purchases attach to this account.
    void initIap(userId).then(() => setIapUser(userId));
  }, [isAuthenticated, skipStartupIntegrations]);

  useEffect(() => {
    if (skipStartupIntegrations) {
      return;
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: notificationsEnabled,
        shouldShowBanner: notificationsEnabled,
        shouldShowList: notificationsEnabled,
        shouldPlaySound: notificationsEnabled,
        shouldSetBadge: notificationsEnabled,
      }),
    });
  }, [skipStartupIntegrations, notificationsEnabled]);

  useEffect(() => {
    if (skipStartupIntegrations) {
      return;
    }

    notifSubRef.current?.remove();
    notifSubRef.current = null;

    if (!notificationsEnabled) {
      return;
    }

    notifSubRef.current = Notifications.addNotificationReceivedListener((notification) => {
      const { addNotification } = useNotificationStore.getState();
      const data = (notification.request.content.data as Record<string, any>) ?? {};
      const developerApproval = resolveDeveloperApprovalPushDestination(data);
      if (developerApproval.ok) {
        addNotification({
          type: 'approval',
          title: 'Developer approval',
          body: 'Open to review the latest request.',
          data: { approvalRef: developerApproval.params.approvalRef },
        });
        return;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'approvalRef')) {
        return;
      }
      addNotification({
        type: (notification.request.content.data?.type ?? 'system') as any,
        title: notification.request.content.title ?? 'Notification',
        body: notification.request.content.body ?? '',
        data,
      });
      // Multi-Agent v2.1 P2 #15 — fan out wearable haptic + watch
      // complication when a sub-task completion push arrives. Lazy import
      // to keep startup cost zero when feature unused. Best-effort.
      void (async () => {
        try {
          const { handleSubTaskAck } = await import(
            './src/services/wearables/multiAgentWearableAck.service'
          );
          await handleSubTaskAck({
            title: notification.request.content.title ?? undefined,
            body: notification.request.content.body ?? undefined,
            data,
          });
        } catch {
          /* ignore — wearable ack is non-critical */
        }
      })();
    });

    return () => {
      notifSubRef.current?.remove();
      notifSubRef.current = null;
    };
  }, [skipStartupIntegrations, notificationsEnabled]);

  useEffect(() => {
    if (skipStartupIntegrations) return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      const responseId = `${identifier}:${response.actionIdentifier}`;
      if (handledNotificationResponseIds.has(responseId)) return;
      const data = response.notification.request.content.data as unknown;
      const destination = resolveDeveloperApprovalPushDestination(data);
      if (!destination.ok) return;
      if (openDeveloperApproval(destination.params.approvalRef)) {
        handledNotificationResponseIds.add(responseId);
      }
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch(() => {});
    return () => subscription.remove();
  }, [skipStartupIntegrations]);

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      drainPendingDeveloperApproval();
    }
  }, [isAuthenticated, isInitialized]);

  useEffect(() => {
    if (skipStartupIntegrations || !isInitialized || !isAuthenticated || !token || !notificationsEnabled) {
      stopNotificationPolling();
      useNotificationStore.getState().setPushToken(null);
      return;
    }

    startNotificationPolling(token, 30_000, { immediate: false });

    let cancelled = false;
    void registerForPushNotifications().then(async (pushToken) => {
      if (!cancelled) {
        useNotificationStore.getState().setPushToken(pushToken);
        // Register push token with backend so server can send push notifications
        if (pushToken) {
          try {
            await apiFetch('/notifications/register', {
              method: 'POST',
              body: JSON.stringify({
                token: pushToken,
                platform: Platform.OS,
              }),
            });
          } catch (e) {
            console.warn('Failed to register push token with backend:', e);
          }
        }
      }
    });

    return () => {
      cancelled = true;
      stopNotificationPolling();
    };
  }, [isAuthenticated, isInitialized, skipStartupIntegrations, notificationsEnabled, token]);

  if (!isInitialized) return <SplashScreen />;

  if (isPetSoulE2E) {
    const { PetSoulE2EApp } = require('./src/testing/PetSoulE2EApp');
    return <PetSoulE2EApp />;
  }

  if (isVoiceUiE2E) {
    const { VoiceUiE2EApp } = require('./src/testing/VoiceUiE2EApp');
    return <VoiceUiE2EApp />;
  }

  const { RootNavigator } = require('./src/navigation/RootNavigator');
  return <RootNavigator />;
}

/**
 * Wave 17 hotfix — gate CompanionLayer mount on isInitialized so we don't
 * call useNavigationState before AppNavigator has had a chance to mount
 * RootNavigator (the registered Navigator subtree). Without this gate,
 * the SplashScreen render → CompanionBall mount → useNavigationState
 * happens with no Navigator in the tree, throwing "Couldn't get the
 * navigation state. Is your component inside a navigator?".
 *
 * Also waits for `isAuthenticated` because CompanionBall + sheets only
 * make sense after login; the legacy floating ball does the same.
 */
function CompanionLayerGate() {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isPetSoulE2EOnce = isPetSoulE2EEnabled();
  const isVoiceUiE2EOnce = isVoiceUiE2EEnabled();
  if (!isInitialized) return null;
  // Don't mount during the E2E surrogate apps either — they swap
  // AppNavigator for a stripped-down PetSoulE2EApp / VoiceUiE2EApp that
  // doesn't expose Main / World / Plaza routes.
  if (isPetSoulE2EOnce || isVoiceUiE2EOnce) return null;
  // Keep the Companion mounted in the normal Maestro baseline so the same
  // authenticated APK can verify the user-visible floating entry. Extremely
  // constrained CI emulators may opt out explicitly; hiding it merely because
  // Maestro auto-login is enabled created a permanent false-green blind spot.
  if (isMaestroE2E && process.env.EXPO_PUBLIC_MAESTRO_DISABLE_COMPANION === '1') return null;
  if (!isAuthenticated) return null;
  return <CompanionLayer navigationRef={navigationRef} />;
}

// Deep link config
//
// MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 Sprint A:
//   - 4-tab IA: Home / Summon / Plaza / Me (canonical)
//   - Legacy tab names (Agent/Discover/Team/Pet/Wallet/Today) kept as
//     hidden aliases so existing deep links keep working.
//   - `resolveLegacyPath()` rewrites incoming paths from the old IA to
//     the new canonical paths before React Navigation parses them.
const linking = {
  // Production: Linking.createURL('/') resolves to "agentrix://" (scheme from app.json).
  // Development (Expo Go): resolves to "exp://...". Both are included so QR pairing
  // works on both dev and production builds.
  prefixes: [Linking.createURL('/'), 'agentrix://', 'clawlink://', 'https://clawlink.app', 'https://agentrix.top'],
  getStateFromPath: (path: string, options: any) => {
    if (isAgentFirstBuild && isMobileV7RouteCandidate(path)) {
      const result = normalizeMobileV7Route(path);
      const strictPath = result.ok === true
        ? result.path
        : `/destination-error?reason=${encodeURIComponent(result.error.code)}`;
      return defaultGetStateFromPath(strictPath, options);
    }
    const normalized = resolveLegacyPath(path);
    return defaultGetStateFromPath(normalized, options);
  },
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          AuthCallback: 'auth/callback',
        },
      },
      InvitationGate: 'invitation-gate',
      Onboarding: {
        screens: {
          DeploySelect: 'onboarding/deploy',
          CloudDeploy: 'onboarding/cloud',
          ConnectExisting: 'onboarding/connect',
          LocalDeploy: 'onboarding/local',
          SocialBind: 'onboarding/social/:instanceId',
        },
      },
      Main: {
        screens: {
          ...(isAgentFirstBuild ? {
            Agent: {
              screens: {
                AgentHome: 'agents',
                GoalComposer: 'actions/new',
                CandidateCompare: 'actions/compare',
                AuthorityReview: 'actions/:actionId/authority',
                ActionTracking: 'agents/:agentId/actions/:actionId',
                Companion: 'agent/companion',
                HardwareAssurance: 'agents/:agentId/assurance',
                AgentSoulCore: 'agents/:agentId/soul-core',
                DestinationError: 'destination-error',
              },
            },
            Work: {
              screens: {
                WorkHome: 'work',
                ActionsHome: 'work/actions',
                WorkMachines: 'work/machines/:machineRef?',
                WorkSessions: 'work/sessions/:sessionRef?',
                WorkApprovals: 'work/approvals/:approvalRef?',
                WorkReceipts: 'work/receipts/:actionRef?',
                WorkHandoffs: 'work/handoffs/:handoffRef?',
              },
            },
            Economy: {
              screens: {
                EconomyHome: 'economy',
                CreationHome: 'economy/seller',
                CreationFeed: 'economy/seller/feed',
                CreationCreator: 'economy/seller/new',
                CreationExperience: 'economy/seller/experience/:creationId',
                CreationDetail: 'economy/seller/:creationId',
                MyWorld: 'economy/seller/mine',
                UnifiedWorldMap: 'economy/seller/map',
                WorldCreationMarketplace: 'economy/seller/market',
              },
            },
            Actions: {
              screens: {
                ActionsHome: 'actions',
              },
            },
            Creation: {
              screens: {
                CreationHome: 'creation',
                CreationFeed: 'creation/feed',
                CreationCreator: 'creation/new',
                CreationExperience: 'creation/experience/:creationId',
                CreationDetail: 'creation/:creationId',
                MyWorld: 'creation/mine',
                UnifiedWorldMap: 'creation/map',
                WorldCreationMarketplace: 'creation/market',
              },
            },
            Prediction: 'prediction',
            Lsm: 'lsm',
          } : {}),
          // AI World Creation Platform (v6) — World tab deep links. The World
          // stack previously had NO linking entries, so its v6 surfaces
          // (map / land / market / creator / experience / task) were only
          // reachable by in-app navigation — unreachable to deep links, Siri/
          // Assistant intents, share links, and Maestro E2E. Add canonical
          // `agentrix://world/*` paths. Screens all handle missing/synthetic
          // ids gracefully (empty state / 10s enter-timeout fallback / "not
          // found"), so a bad id never crashes.
          World: {
            screens: {
              WorldMap: 'world/map',
              LandPlots: 'world/plots',
              WorldCreationMarketplace: 'world/market',
              PlotCreator: 'world/create/:substrateTier/:plotId',
              PlotExperience: 'world/plot/:plotId',
              CreationTaskStatus: 'world/task/:taskId',
              // World Creation & Feed — new unified surfaces. Deep-linkable for
              // Siri/Assistant intents, share links, and Maestro E2E. All screens
              // degrade gracefully on synthetic/missing ids (empty state / 10s
              // enter-timeout fallback / not-found), so a bad id never crashes.
              CreationFeed: 'world/feed',
              UnifiedWorldMap: 'world/explore',
              MyWorld: 'world/mine',
              CreationCreator: 'world/new',
              CreationExperience: 'world/experience/:creationId',
              CreationDetail: 'world/creation/:creationId',
              WorldRoot: 'world',
            },
          },
          Summon: {
            screens: {
              SummonRoot: 'summon',
              VoiceChat: 'summon/voice',
            },
          },
          Plaza: {
            screens: {
              PlazaRoot: 'plaza',
              Skills: 'plaza/skills',
              SkillDetail: 'plaza/skills/:skillId',
              Checkout: 'plaza/checkout/:skillId',
              SkillInstall: 'plaza/skills/install/:skillId',
              Tasks: 'plaza/tasks',
              TaskDetail: 'plaza/tasks/:taskId',
              PostTask: 'plaza/tasks/post',
              Pets: 'plaza/pets',
              PetsSkins: 'plaza/pets/skins',
              SkinAuctionDetail: 'plaza/pets/skins/:auctionId',
              PetAuctionDetail: 'plaza/pets/auction/:auctionId',
              ShareCard: 'plaza/share-card',
              CreateLink: 'plaza/share-card/create',
              ToyCustom: 'plaza/toy/custom',
            },
          },
          [isAgentFirstBuild ? 'My' : 'Me']: {
            screens: {
              Profile: 'me',
              Account: 'me/account',
              Settings: 'me/settings',
              ReferralDashboard: 'me/promote',
              ApiKeys: 'me/advanced/api-keys',
              LocalAiModel: 'me/advanced/local-ai',
              WalletConnect: 'me/wallet/connect',
              WalletSetup: 'me/wallet/setup',
              WalletBackup: 'me/wallet/backup',
              NotificationCenter: 'me/notifications',
              MySkills: 'me/skills',
              MyOrders: 'me/orders',
              SocialListener: 'me/advanced/social-listener',
              Scan: 'me/scan',
              WearableHub: 'me/devices/wearable',
              Subscribe: 'me/subscribe',
              AxpCenter: 'me/axp',
              AxpRewardShop: 'me/axp/shop',
              ShareCard: 'me/share-card',
              // P-9 Q1 — re-homed pet screens (former PetStack drawer).
              PetWardrobe: 'me/pet/wardrobe',
              SoulPicker: 'me/pet/soul',
              PetBreed: 'me/pet/breed',
              PetPlayground: 'me/pet/playground',
              PetSkinMarketplace: 'me/pet/skins',
              MemoryManagement: 'me/pet/memory',
            },
          },
          // ── Legacy tabs (hidden, but keep deep link compat) ──
          // These are intentionally minimal: the resolver rewrites old
          // paths to new paths, so legacy `config.screens.Agent.*` style
          // links are no longer needed. They remain accessible via
          // legacy `navigate('Agent', { screen: ... })` call sites.
        },
      },
      Inbox: 'inbox',
      Scan: 'scan',
    },
  },
};

export default function App() {
  // Subscribe the root to theme mode so toggling Light/Dark re-renders the whole tree,
  // letting every (themedStyles-wrapped) screen repaint live — no reload.
  const themeMode = useThemeMode();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BottomSheetModalProvider>
              <NavigationContainer
                ref={navigationRef as any}
                linking={linking as any}
                onReady={drainPendingDeveloperApproval}
              >
                <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
                <AppNavigator />
                {/* Global AXP toast — surfaces +N AXP when earns happen anywhere. */}
                <AxpToastHost />

                {/* Pet companion proactive bubble — surfaces pet greetings/
                    suggestions globally (Phase C). Same backend channel as desktop. */}
                <MobilePetProactiveBanner />

                {/* P-9 Companion Redesign T4: global ball + bottom-sheet
                    layer. Mounts INSIDE NavigationContainer so children can
                    call useNavigation(), but OUTSIDE the tab navigator so
                    it persists across tab switches.

                    Wave 17 hotfix v1: gate by isInitialized to prevent the
                    SplashScreen ≠ "navigator state not ready" crash.

                    Wave 17 hotfix v2 (2026-05-23): even with the gate,
                    useNavigationState is unsafe here because its
                    NavigationStateListenerContext is provided by
                    individual Navigators (Stack/Tab), NOT by
                    NavigationContainer. CompanionLayer is a sibling of
                    AppNavigator, so no listener context exists and the
                    hook throws "Couldn't get the navigation state. Is
                    your component inside a navigator?" on cold launch.
                    CompanionBall + GlobalFloatingBall now read root
                    state via the module-scope navigationRef instead, so
                    they no longer depend on a navigator subtree being
                    in scope. */}
                <CompanionLayerGate />
              </NavigationContainer>
            </BottomSheetModalProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
