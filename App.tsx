import React, { useEffect, useMemo, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator, Text, AppState, AppStateStatus, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from './src/stores/authStore';
import { setApiConfig, loadTokenFromStorage, apiFetch } from './src/services/api';
import { fetchCurrentUser } from './src/services/auth';
import { getMyInstances } from './src/services/openclaw.service';
import { colors } from './src/theme/colors';
import { useSettingsStore } from './src/stores/settingsStore';
import { useNotificationStore } from './src/stores/notificationStore';
import { startNotificationPolling, stopNotificationPolling } from './src/services/realtime.service';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { checkAndPromptUpdate, silentBackgroundUpdate } from './src/services/appUpdate.service';
import { migrateFromAsyncStorage } from './src/stores/mmkvStorage';
import { applyVoiceUiE2EBootstrap, isVoiceUiE2EEnabled } from './src/testing/e2e';
import { resolveMobileWakeWordConfig } from './src/config/wakeWord';
import { hasLocalWakeWordModel, thresholdFromSensitivity } from './src/services/localWakeWord.service';
import {
  isAndroidBackgroundWakeWordAvailable,
  startAndroidBackgroundWakeWordService,
  stopAndroidBackgroundWakeWordService,
  syncAndroidBackgroundWakeWordConfig,
} from './src/services/androidBackgroundWakeWord.service';
import { initLlamaBridge } from './src/services/llamaRnBridge';
import { OtaModelDownloadService } from './src/services/otaModelDownload.service';

// Register llama.rn bridge for on-device LLM inference
initLlamaBridge();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

function SplashScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -1 }}>AX</Text>
      </View>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ color: colors.textMuted, marginTop: 16, fontSize: 14 }}>Agentrix</Text>
    </View>
  );
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
    if (migrationResult.invalidatedModelIds.length === 0) {
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
    }

    console.warn(
      'Invalidated stale on-device model packages during startup migration:',
      migrationResult.invalidatedModelIds.join(', '),
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

  useEffect(() => {
    if (isVoiceUiE2E && applyVoiceUiE2EBootstrap()) {
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
                const storeInstances = instances.map((inst: any) => ({
                  id: inst.id,
                  name: inst.name || 'My Agent',
                  instanceUrl: inst.instanceUrl || '',
                  status: (inst.status || 'active') as 'active' | 'disconnected' | 'error',
                  deployType: (inst.deployType || 'cloud') as 'cloud' | 'local' | 'server' | 'existing',
                  version: inst.version,
                  lastSyncAt: inst.lastSyncAt,
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

    // Check for OTA updates after session restore
    checkAndPromptUpdate().catch(() => {});

    // Silent update check when app returns to foreground
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        silentBackgroundUpdate().catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopNotificationPolling();
      appStateSub.remove();
    };
  }, [clearAuth, isVoiceUiE2E, setAuth, setInitialized]);

  useEffect(() => {
    if (isVoiceUiE2E) {
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
  }, [isVoiceUiE2E, notificationsEnabled]);

  useEffect(() => {
    if (isVoiceUiE2E) {
      return;
    }

    notifSubRef.current?.remove();
    notifSubRef.current = null;

    if (!notificationsEnabled) {
      return;
    }

    notifSubRef.current = Notifications.addNotificationReceivedListener((notification) => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({
        type: (notification.request.content.data?.type ?? 'system') as any,
        title: notification.request.content.title ?? 'Notification',
        body: notification.request.content.body ?? '',
        data: (notification.request.content.data as Record<string, any>) ?? {},
      });
    });

    return () => {
      notifSubRef.current?.remove();
      notifSubRef.current = null;
    };
  }, [isVoiceUiE2E, notificationsEnabled]);

  useEffect(() => {
    if (isVoiceUiE2E || !isInitialized || !isAuthenticated || !token || !notificationsEnabled) {
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
  }, [isAuthenticated, isInitialized, isVoiceUiE2E, notificationsEnabled, token]);

  if (!isInitialized) return <SplashScreen />;

  if (isVoiceUiE2E) {
    const { VoiceUiE2EApp } = require('./src/testing/VoiceUiE2EApp');
    return <VoiceUiE2EApp />;
  }

  const { RootNavigator } = require('./src/navigation/RootNavigator');
  return <RootNavigator />;
}

// Deep link config
const linking = {
  // Production: Linking.createURL('/') resolves to "agentrix://" (scheme from app.json).
  // Development (Expo Go): resolves to "exp://...". Both are included so QR pairing
  // works on both dev and production builds.
  prefixes: [Linking.createURL('/'), 'agentrix://', 'clawlink://', 'https://clawlink.app', 'https://agentrix.top'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          AuthCallback: 'auth/callback',
        },
      },
      Onboarding: {
        screens: {
          DeploySelect: 'onboarding/deploy',
          CloudDeploy: 'onboarding/cloud',
          ConnectExisting: 'onboarding/connect',
        },
      },
      Main: {
        screens: {
          MainTabs: {
            screens: {
              Agent: {
                initialRouteName: 'AgentChat',
                screens: {
                  AgentChat: '',
                  AgentConsole: 'agent/console',
                  VoiceChat: 'voice-chat',
                  OpenClawBind: 'agent/bind',
                  // Desktop installer QR code deep link:
                  // agentrix://connect?instanceId=<id>&token=<tok>&host=<ip>&port=<port>
                  LocalConnect: 'connect',
                },
              },
              Explore: { screens: { Marketplace: 'market', SkillDetail: 'market/skill/:skillId' } },
              Social: { screens: { Feed: 'social' } },
              Me: { screens: { Profile: 'me', ReferralDashboard: 'me/referral', Settings: 'me/settings' } },
            },
          },
        },
      },
    },
  },
};

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer linking={linking as any}>
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
