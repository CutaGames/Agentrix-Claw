import React, { useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator, Text } from 'react-native';
import { useAuthStore } from './src/stores/authStore';
import { colors } from './src/theme/colors';
import { useThemeMode } from './src/theme/useTheme';
import { useSettingsStore } from './src/stores/settingsStore';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { isVoiceUiE2EEnabled } from './src/testing/e2e';
import { isPetSoulE2EEnabled } from './src/testing/petSoulE2E';
import { AxpToastHost } from './src/components/AxpToastHost';
import { MobilePetProactiveBanner } from './src/components/pet/MobilePetProactiveBanner';
import { CompanionLayer } from './src/components/companion/CompanionLayer';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { navigationRef as sharedNavigationRef } from './src/navigation/navigationRef';
import { handleUnhandledNavigationAction } from './src/navigation/destinationError';
import {
  bootMobileIntegrations,
  configureMobileFeatureFlagsOnce,
  createAppQueryClient,
  isMaestroE2E,
  shouldRunPushListeners,
} from './src/app/bootstrap';
import { createMobileLinking } from './src/app/linking';
import { isPetSurfaceEnabled } from './src/services/mobileV6FeatureFlags';
import {
  useAndroidBackgroundWakeWord,
  useCompanionAdapters,
  useObservabilityUserBinding,
  usePushRuntime,
  useSessionRestore,
  useSystemIntentBridge,
  useWatchAuthSync,
} from './src/app/startupEffects';

// ── Import-order contract (design §3 / MTR-R06.4) ──
// The flag table is configured here, at the earliest module scope, before any
// call site reads it. `isAgentFirstBuild` used to be a module-level const
// reading process.env directly; it is now `isAgentFirstIaEnabled()`, resolved
// at each call, so tabs / deep links / push can never disagree.
configureMobileFeatureFlagsOnce();
bootMobileIntegrations();

// Singleton ref so the system-assistant intent handlers + the P-9 companion
// layer (ball / sheets / capsules) can navigate the React Navigation root
// without prop drilling AND without useNavigation() (which throws at the
// CompanionLayer sibling position). Defined in its own module so any file
// can import it. Assigned to <NavigationContainer ref={navigationRef}>.
const navigationRef = sharedNavigationRef;

const queryClient = createAppQueryClient();

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

function AppNavigator() {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const wakeWordSettings = useSettingsStore((s) => s.wakeWordConfig);
  const isVoiceUiE2E = isVoiceUiE2EEnabled();
  const isPetSoulE2E = isPetSoulE2EEnabled();
  const skipStartupIntegrations = isVoiceUiE2E || isPetSoulE2E || isMaestroE2E;
  // M0.0.6 — push listeners have their own switch so an E2E build can keep
  // them while still skipping the heavyweight startup integrations.
  const pushEnabled = shouldRunPushListeners({ skipStartupIntegrations });

  // M1.5.1 (second cut): the startup effect groups live in
  // `src/app/startupEffects.ts`. Declaration order here == effect order there.
  useAndroidBackgroundWakeWord({ isAuthenticated, activeInstance, wakeWordSettings });
  useSystemIntentBridge(navigationRef);
  useSessionRestore({ isVoiceUiE2E, isPetSoulE2E, skipStartupIntegrations });
  useWatchAuthSync({ isAuthenticated, token, skipStartupIntegrations });
  useCompanionAdapters({ isAuthenticated, token, skipStartupIntegrations });
  useObservabilityUserBinding({ isAuthenticated, skipStartupIntegrations });
  usePushRuntime({ pushEnabled, notificationsEnabled, isInitialized, isAuthenticated, token, navigationRef });

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
 *
 * MTR-R09.8 (decision d-32, 2026-09-16): the whole Pet surface — this layer
 * and `MobilePetProactiveBanner` below — is behind `isPetSurfaceEnabled()`:
 * always on in the legacy IA, off under Agent-first unless the L2 product
 * flag `mobile.pet_l2_surface` is on. Read per render, never at module scope
 * (the unconfigured flag table would answer with the legacy "on").
 */
function PetSurfaceGate({ children }: { children: React.ReactNode }) {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  // Re-evaluated on every auth-state change, which is also when the flag
  // table has certainly been configured (bootstrap runs at module scope).
  if (!isInitialized) return null;
  if (!isPetSurfaceEnabled()) return null;
  return <>{children}</>;
}

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

export default function App() {
  // Subscribe the root to theme mode so toggling Light/Dark re-renders the whole tree,
  // letting every (themedStyles-wrapped) screen repaint live — no reload.
  const themeMode = useThemeMode();
  // Built inside the component so the flag table (configured at module scope
  // above) is already in place — see the import-order note in `linking.ts`.
  const linking = useMemo(() => createMobileLinking(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <BottomSheetModalProvider>
              <NavigationContainer
                ref={navigationRef as any}
                linking={linking as any}
                // MTR-R03.2: a navigate() to an unmounted route lands on
                // destination-error(route_not_mounted) instead of a silent no-op.
                onUnhandledAction={(action) => {
                  handleUnhandledNavigationAction(navigationRef as any, action as any);
                }}
              >
                <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
                <AppNavigator />
                {/* Global AXP toast — surfaces +N AXP when earns happen anywhere. */}
                <AxpToastHost />

                {/* MTR-R09.8 — the ONLY mount point of components/pet/** and
                    components/companion/** at the root. Both sit inside
                    PetSurfaceGate so "routes hidden but overlay still there"
                    (the half-withdrawn state R09.8 forbids) cannot happen. */}
                <PetSurfaceGate>
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
                </PetSurfaceGate>
              </NavigationContainer>
            </BottomSheetModalProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
