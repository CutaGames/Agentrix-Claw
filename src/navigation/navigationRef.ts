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
