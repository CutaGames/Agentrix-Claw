/**
 * Push → navigation dispatch — M2 slice B1 (MTR-R10.1 / MTR-R04.5).
 *
 * `resolvePushDestination` (M0.4.2) turns a notification payload into a
 * product surface. This module turns the surfaces the Work tab owns into a
 * navigator target and delivers it — once the navigator is ready and the
 * session is authenticated. Cold start (`getLastNotificationResponseAsync`
 * fires before `NavigationContainer` is ready and before the session is
 * restored) and warm resume (listener while the app is up) therefore reach
 * the *same* screen with the *same* params.
 *
 * The payload stays a routing hint: the destination screen re-authenticates
 * and fresh-reads; nothing here is a decision input. Pure module — no
 * expo-notifications, no React Navigation import — so it is unit tested.
 */
import { resolveDeveloperApprovalPushDestination } from "./developerWorkspaceApprovals";
import type { PushDestination } from "./pushDestination";

export type PushNavigationTarget = {
  readonly tab: "Work";
  readonly screen: "WorkApprovals";
  readonly params: { readonly approvalRef: string; readonly source: "push" };
};

/**
 * Surfaces with a navigator target today. `work_inbox_approval` is the M2.2
 * inbox; the other Work surfaces (handoff / receipt / agenda) need an agent
 * scope a push cannot carry safely and stay "recorded" until their slices.
 */
export function pushDestinationToNavigationTarget(
  destination: PushDestination,
): PushNavigationTarget | null {
  if (destination.ok !== true) return null;
  if (destination.surface !== "work_inbox_approval") return null;
  // Same validator the client layer uses (bounded opaque ref, nothing else in
  // the payload): a ref the Work face would refuse is not navigable either.
  const resolved = resolveDeveloperApprovalPushDestination({
    approvalRef: destination.params.approvalRef,
  });
  if (resolved.ok !== true) return null;
  return {
    tab: resolved.tab,
    screen: resolved.screen,
    params: resolved.params,
  };
}

export interface PushNavigationLike {
  navigate: (...args: any[]) => void;
  isReady?: () => boolean;
}

export type PushDispatchOutcome =
  | "navigated"
  | "deferred"
  | "unroutable"
  | "recorded";

export type PushNavigationDispatcher = {
  /** Route a resolved destination; defers when the navigator / session is not ready yet. */
  dispatch(destination: PushDestination): PushDispatchOutcome;
  /** Deliver a deferred target if the navigator and session are ready now. */
  flush(): boolean;
  pending(): PushNavigationTarget | null;
};

export function createPushNavigationDispatcher(deps: {
  getNavigation: () => PushNavigationLike | null | undefined;
  isAuthenticated: () => boolean;
  /** Called for `destination-error`-class payloads (unknown type, missing ref, malformed). */
  onUnroutable: (destination: Extract<PushDestination, { ok: false }>) => void;
  /** Called for surfaces without a navigator target yet (kept visible in logs, not dropped). */
  onRecorded?: (destination: Extract<PushDestination, { ok: true }>) => void;
}): PushNavigationDispatcher {
  let pending: PushNavigationTarget | null = null;

  const ready = (): PushNavigationLike | null => {
    const navigation = deps.getNavigation();
    if (!navigation || typeof navigation.navigate !== "function") return null;
    if (typeof navigation.isReady === "function" && !navigation.isReady())
      return null;
    if (!deps.isAuthenticated()) return null;
    return navigation;
  };

  const deliver = (
    navigation: PushNavigationLike,
    target: PushNavigationTarget,
  ): boolean => {
    try {
      navigation.navigate(target.tab, {
        screen: target.screen,
        params: target.params,
      });
      return true;
    } catch {
      return false;
    }
  };

  return {
    dispatch(destination) {
      if (destination.ok !== true) {
        deps.onUnroutable(destination);
        return "unroutable";
      }
      const target = pushDestinationToNavigationTarget(destination);
      if (!target) {
        if (destination.surface === "work_inbox_approval") {
          // An approval push whose ref the Work face would refuse: fail closed
          // to destination-error rather than guessing a screen.
          deps.onUnroutable({
            ok: false,
            reason: "invalid_payload",
            type: destination.type,
          });
          return "unroutable";
        }
        deps.onRecorded?.(destination);
        return "recorded";
      }
      const navigation = ready();
      if (navigation && deliver(navigation, target)) {
        pending = null;
        return "navigated";
      }
      // Latest tap wins: a newer approval push replaces an undelivered one.
      pending = target;
      return "deferred";
    },
    flush() {
      if (!pending) return false;
      const navigation = ready();
      if (!navigation) return false;
      const target = pending;
      if (!deliver(navigation, target)) return false;
      pending = null;
      return true;
    },
    pending: () => pending,
  };
}
