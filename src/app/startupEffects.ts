/**
 * Startup effect groups — the second cut of M1.5.1.
 *
 * Everything here used to be inline inside `AppNavigator` in `App.tsx`. Each
 * hook keeps the effect bodies, dependency lists and *declaration order* it
 * had there, so React still runs them in the same sequence; `App.tsx` keeps
 * Provider assembly and the root render only. No behaviour change is intended
 * by the move itself — the only new logic is the Pet-surface gate in
 * `useCompanionAdapters` (MTR-R09.8, decision d-32), which is called out inline.
 */
import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../stores/authStore';
import { useSoulBirthStore } from '../stores/soulBirthStore';
import { setApiConfig, loadTokenFromStorage, apiFetch } from '../services/api';
import { fetchCurrentUser } from '../services/auth';
import { getMyInstances } from '../services/openclaw.service';
import { resolveAgentDisplayName } from '../utils/agentDisplayName';
import { useSettingsStore } from '../stores/settingsStore';
import { useNotificationStore } from '../stores/notificationStore';
import { startNotificationPolling, stopNotificationPolling } from '../services/realtime.service';
import { checkAndPromptUpdate, silentBackgroundUpdate } from '../services/appUpdate.service';
import { migrateFromAsyncStorage } from '../stores/mmkvStorage';
import { applyVoiceUiE2EBootstrap } from '../testing/e2e';
import { applyPetSoulE2EBootstrap } from '../testing/petSoulE2E';
import { resolveMobileWakeWordConfig } from '../config/wakeWord';
import { hasLocalWakeWordModel, thresholdFromSensitivity } from '../services/localWakeWord.service';
import {
  isAndroidBackgroundWakeWordAvailable,
  startAndroidBackgroundWakeWordService,
  stopAndroidBackgroundWakeWordService,
  syncAndroidBackgroundWakeWordConfig,
} from '../services/androidBackgroundWakeWord.service';
import { setUser as setCrashUser } from '../services/crashReport';
import { bootPetModeAdapters } from '../services/petModeAdapters';
import { bootVoiceGreetScheduler } from '../services/voiceGreetScheduler.service';
import { bootFormVariantWatcher } from '../services/formVariant.service';
import { bootCompanionHealthWatcher } from '../services/companionHealth.service';
import { initIap, setUser as setIapUser } from '../services/iap.service';
import { trackEvent, setUser as setAnalyticsUser } from '../services/analytics.service';
import { OtaModelDownloadService } from '../services/otaModelDownload.service';
import { WatchDataLayerService } from '../services/wearables/watchDataLayerBridge.service';
import { navigateToDestinationError, type NavigationLike } from '../navigation/destinationError';
import { attachLinkingListener } from '../services/intents/intentBridge';
import { installDefaultIntentHandlers } from '../services/intents/defaultIntentHandlers';
import { isPetSurfaceEnabled } from '../services/mobileV6FeatureFlags';
import { isMaestroE2E } from './bootstrap';
import {
  ensureAndroidNotificationChannels,
  readAndroidNotificationChannelSelfCheck,
  registerForPushNotifications,
  resolveNotificationResponseDestination,
} from './pushRouting';

/** The root `navigationRef` as `App.tsx` holds it; typed loosely on purpose. */
export type RootNavigationRef = { readonly current: unknown };

// ── Maestro E2E auto-login seed ───────────────────────────────────────────────

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
export function seedMaestroE2ESession(): void {
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

// ── On-device model package reconcile (runs inside session restore) ──────────

function reconcileStartupLocalPackages(): void {
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
}

// ── 1. Android background wake word ──────────────────────────────────────────

export interface AndroidBackgroundWakeWordInput {
  readonly isAuthenticated: boolean;
  readonly activeInstance: { id?: string | null; name?: string | null } | null | undefined;
  readonly wakeWordSettings: Parameters<typeof resolveMobileWakeWordConfig>[0];
}

export function useAndroidBackgroundWakeWord({
  isAuthenticated,
  activeInstance,
  wakeWordSettings,
}: AndroidBackgroundWakeWordInput): void {
  const wakeWordConfig = useMemo(() => resolveMobileWakeWordConfig(wakeWordSettings), [wakeWordSettings]);
  // Kept for parity with the pre-split `AppNavigator` (it computed this too).
  hasLocalWakeWordModel(wakeWordConfig.localModel);
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
}

// ── 2. System assistant intents ──────────────────────────────────────────────

/**
 * System assistant intents (Siri / Google Assistant / 小爱 / 小艺 / 鸿蒙).
 * Boots the cross-vendor intent dispatcher exactly once. It listens for
 * `agentrix://intent/<name>?...` deep links and routes them through the
 * handler set wired in `defaultIntentHandlers.ts`. Without this, V4 PRD
 * §8 intents (create-pet / switch-skin / market-search / pet-mood) reach
 * the JS bundle but no handler answers, so Siri/Assistant get a silent
 * "I couldn't do that".
 */
export function useSystemIntentBridge(navigationRef: RootNavigationRef): void {
  useEffect(() => {
    const detachHandlers = installDefaultIntentHandlers(() => navigationRef.current as any);
    const detachLinking = attachLinkingListener();
    return () => {
      try { detachLinking(); } catch { /* ignore */ }
      try { detachHandlers(); } catch { /* ignore */ }
    };
  }, []);
}

// ── 3. Session restore ───────────────────────────────────────────────────────

export interface SessionRestoreInput {
  readonly isVoiceUiE2E: boolean;
  readonly isPetSoulE2E: boolean;
  readonly skipStartupIntegrations: boolean;
}

export function useSessionRestore({
  isVoiceUiE2E,
  isPetSoulE2E,
  skipStartupIntegrations,
}: SessionRestoreInput): void {
  const { setAuth, setInitialized, clearAuth } = useAuthStore.getState();

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
          // No stored token — check if Zustand persist says user is authenticated
          // (edge case: SecureStore was cleared but AsyncStorage persist wasn't)
          const cachedStore = useAuthStore.getState();
          if (!cachedStore.isAuthenticated) {
            setInitialized(true);
            return;
          }
          // isAuthenticated persisted but token gone — force re-login
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
            // Token expired or revoked — force re-login
            await clearAuth();
            stopNotificationPolling();
            useNotificationStore.getState().setPushToken(null);
          } else {
            // Network error or 5xx — keep user logged in with last cached session
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
}

// ── 4. Wear OS auth sync ─────────────────────────────────────────────────────

export interface WatchAuthSyncInput {
  readonly isAuthenticated: boolean;
  readonly token: string | null | undefined;
  readonly skipStartupIntegrations: boolean;
}

export function useWatchAuthSync({ isAuthenticated, token, skipStartupIntegrations }: WatchAuthSyncInput): void {
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
}

// ── 5. Pet-mode adapters + Companion producers ───────────────────────────────

export interface CompanionAdaptersInput {
  readonly isAuthenticated: boolean;
  readonly token: string | null | undefined;
  readonly skipStartupIntegrations: boolean;
}

/**
 * Sprint P-6 Phase 6.4 (2026-05-22): once authenticated, wire the backend
 * pet-presence socket and wearable wrist-trigger emitter into the unified
 * petMode bus. The adapters return a disposer the effect uses to clean up on
 * logout / unmount.
 *
 * MTR-R09.8 (decision d-32): the three Companion *producers* — Voice_Greet
 * scheduler, Form_Variant watcher, health nudges — only run while the Pet
 * surface is enabled (`isPetSurfaceEnabled()`, read inside the effect, never
 * at module scope). They exist solely to animate the floating ball; with the
 * Companion layer unmounted they would poll sensors and schedule greetings
 * nobody can see. The presence socket / wearable adapters are NOT gated: the
 * watch surface consumes them independently of the phone-side overlay.
 */
export function useCompanionAdapters({ isAuthenticated, token, skipStartupIntegrations }: CompanionAdaptersInput): void {
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
      if (!isPetSurfaceEnabled()) {
        // Companion layer is hidden under this IA: no greet / variant / health
        // producers. The adapters disposer above is still the cleanup path.
        return;
      }
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
}

// ── 6. Crash / analytics / IAP user binding ──────────────────────────────────

export interface ObservabilityUserBindingInput {
  readonly isAuthenticated: boolean;
  readonly skipStartupIntegrations: boolean;
}

/**
 * Bind the current user to Sentry so subsequent crash reports are scoped to
 * them. We only send the opaque user id, never email or wallet — see
 * crashReport.ts beforeSend sanitization.
 */
export function useObservabilityUserBinding({ isAuthenticated, skipStartupIntegrations }: ObservabilityUserBindingInput): void {
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
}

// ── 7. Push runtime (channels / handler / response / received / token) ───────

export interface PushRuntimeInput {
  readonly pushEnabled: boolean;
  readonly notificationsEnabled: boolean;
  readonly isInitialized: boolean;
  readonly isAuthenticated: boolean;
  readonly token: string | null | undefined;
  readonly navigationRef: RootNavigationRef;
}

export function usePushRuntime({
  pushEnabled,
  notificationsEnabled,
  isInitialized,
  isAuthenticated,
  token,
  navigationRef,
}: PushRuntimeInput): void {
  const notifSubRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!pushEnabled) {
      return;
    }

    // M0.4.1 — the only place Android channels are created. The retired
    // `src/services/notifications.ts` had the same code with no importer, so
    // no custom channel has ever existed at runtime.
    void ensureAndroidNotificationChannels()
      .then(readAndroidNotificationChannelSelfCheck)
      .then((selfCheck) => {
        if (!selfCheck.ok && selfCheck.platform === 'android') {
          console.warn('[push] missing notification channels:', selfCheck.missing.join(', '));
        }
      })
      .catch((error) => console.warn('[push] channel setup failed:', error));

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: notificationsEnabled,
        shouldShowBanner: notificationsEnabled,
        shouldShowList: notificationsEnabled,
        shouldPlaySound: notificationsEnabled,
        shouldSetBadge: notificationsEnabled,
      }),
    });
  }, [pushEnabled, notificationsEnabled]);

  // MTR-R04.5 — a tapped notification only decides *where* to go. The
  // destination re-authenticates and fresh-reads; nothing from the payload is
  // used as a decision input.
  useEffect(() => {
    if (!pushEnabled) {
      return;
    }
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const destination = resolveNotificationResponseDestination(response);
      if (!destination.ok) {
        navigateToDestinationError(navigationRef as unknown as NavigationLike, 'unknown_route');
        return;
      }
      // Surface → route mapping lands with the IA switch (M1.4); until then the
      // resolution is recorded rather than silently dropped.
      console.info('[push] destination', destination.type, destination.surface);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch(() => {});
    return () => subscription.remove();
  }, [pushEnabled]);

  useEffect(() => {
    if (!pushEnabled) {
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
            '../services/wearables/multiAgentWearableAck.service'
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
  }, [pushEnabled, notificationsEnabled]);

  useEffect(() => {
    if (!pushEnabled || !isInitialized || !isAuthenticated || !token || !notificationsEnabled) {
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
  }, [isAuthenticated, isInitialized, pushEnabled, notificationsEnabled, token]);
}
