/**
 * navigationRef — shared module-scope NavigationContainerRef.
 *
 * The P-9 CompanionLayer (floating ball + bottom sheets + capsules) mounts
 * as a SIBLING of the tab navigators — inside <NavigationContainer> but
 * OUTSIDE any Stack/Tab navigator. In that position React Navigation's
 * `useNavigation()` hook THROWS ("Couldn't find a navigation object. Is your
 * component inside a screen in a navigator?") because `NavigationContext` is
 * only provided by navigators, not by NavigationContainer itself.
 *
 * That throw was the root cause of the long-standing "dead companion ball"
 * report: GlobalFloatingBall (and every sheet/capsule) called
 * `useNavigation()` at mount → threw → CompanionLayer's error boundaries
 * swapped the real ball for the static fallback and rendered the sheets as
 * null.
 *
 * The fix: all companion components navigate through THIS shared ref, which
 * needs no navigator context. App.tsx assigns it to <NavigationContainer
 * ref={navigationRef}> so it's live for the whole app session.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<
  Record<string, object | undefined>
>();

/**
 * Safe navigate that no-ops (with a console warning) if the container isn't
 * ready yet, instead of throwing. Mirrors the `navigation.navigate(...)`
 * call signature used across the companion components.
 */
export function navRefNavigate(...args: any[]): void {
  try {
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate(...args);
    } else {
      // Container not mounted yet (very early cold launch). Drop silently —
      // companion navigation is always user-initiated, so "not ready" only
      // happens in edge timing windows.
      // eslint-disable-next-line no-console
      console.warn('[navigationRef] navigate before ready:', args?.[0]);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[navigationRef] navigate failed:', (e as Error)?.message);
  }
}

/**
 * Reset the whole navigation tree to a single top-level route through the
 * shared container ref. Safe no-op (with a console warning) if the container
 * isn't ready yet.
 *
 * Used by AuthCallbackScreen (Change 2, 2026-06): the "Authentication
 * successful!" landing screen must NEVER be a dead-end. After committing /
 * confirming auth (or if the user is already authenticated when the screen is
 * reached via a stray deep link), it resets to `Main` so the user always
 * proceeds into the app — regardless of whether the screen was entered from a
 * login redirect or any other OAuth callback. Routing through the shared ref
 * (not `useNavigation`) lets it jump across navigator boundaries (Auth stack →
 * root `Main`), which the Auth-stack navigator cannot do on its own.
 */
export function navRefReset(routeName: string, params?: object): void {
  try {
    if (navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: routeName, params }] });
    } else {
      // eslint-disable-next-line no-console
      console.warn('[navigationRef] reset before ready:', routeName);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[navigationRef] reset failed:', (e as Error)?.message);
  }
}

/**
 * Name of the deepest currently-active route (e.g. `WorldHub`, `Plaza`,
 * `AgentChat`), or null if the container isn't ready yet.
 *
 * Used by Companion_QA (Task 5.1 / R9.3) to tag each chat request with the
 * scene the user asked from, so the answer can be context-aware. Reads
 * through the shared ref because companion surfaces mount OUTSIDE any
 * navigator and cannot call `useNavigationState()`.
 */
export function getCurrentRouteName(): string | null {
  try {
    if (!navigationRef.isReady()) return null;
    return navigationRef.getCurrentRoute()?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to navigation state changes through the shared container ref.
 * Returns an unsubscribe function (a no-op if the container isn't ready or
 * the listener can't be attached).
 *
 * Used by SoulBirthHost's suspend/resume logic: when BirthStep sends the user
 * off to a full-screen detour (camera scanner / skin market), the onboarding
 * overlay suspends so it doesn't occlude the destination. This listener lets
 * the host detect when the user navigates back so it can re-show the overlay
 * at the same step — without coupling onboarding to any navigator context
 * (the host mounts OUTSIDE every navigator, like the companion surfaces).
 */
export function addRouteChangeListener(callback: () => void): () => void {
  try {
    if (navigationRef.isReady()) {
      // Container ref emits a 'state' event on every navigation state change.
      return navigationRef.addListener('state', callback);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[navigationRef] addListener failed:', (e as Error)?.message);
  }
  return () => {};
}
