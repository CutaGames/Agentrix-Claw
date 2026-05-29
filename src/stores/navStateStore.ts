/**
 * navStateStore — Wave 17 v6 (2026-05-24).
 *
 * Centralized React Navigation root state, populated by App.tsx's
 * NavigationContainer `onReady` + `onStateChange` callbacks. Replaces
 * the navigationRef-polling pattern in CompanionBall / GlobalFloatingBall
 * which was racy (the ref's `current` was sometimes still null when the
 * ball mounted, so listeners never attached and the ball stayed hidden
 * forever).
 *
 * Pattern: NavigationContainer is the single source of truth for nav
 * state changes — its callbacks fire once on mount and on every state
 * mutation. We just stuff that state into a zustand store; consumers
 * subscribe via selectors and re-render automatically.
 */
import { create } from 'zustand';

interface NavStateStore {
  state: any | null;
  setState: (next: any) => void;
}

export const useNavStateStore = create<NavStateStore>((set) => ({
  state: null,
  setState: (next) => set({ state: next }),
}));

/**
 * Walks down to the deepest active leaf route name.
 * Used by GlobalFloatingBall + screens that need the current route
 * regardless of how many nested navigators are stacked.
 */
export function resolveLeafRouteName(rootState: any): string {
  if (!rootState) return '';
  let route = rootState.routes?.[rootState.index];
  if (!route) return '';
  for (let depth = 0; depth < 6; depth++) {
    const nested = route?.state as any;
    if (!nested?.routes || nested.index == null) break;
    route = nested.routes[nested.index];
  }
  return route?.name || '';
}

/**
 * The Main tab navigator sits below Root. Walks one level into the
 * Main screen's nested state to get the active tab name.
 */
export function resolveTopTab(rootState: any): string {
  if (!rootState) return '';
  const main = rootState.routes?.find((r: any) => r.name === 'Main');
  if (!main?.state) {
    // Direct case — the very top might already be the tab navigator.
    const r = rootState.routes?.[rootState.index];
    return r?.name || '';
  }
  const topTab = main.state.routes[main.state.index];
  return topTab?.name || '';
}
