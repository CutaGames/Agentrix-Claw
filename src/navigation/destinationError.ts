/**
 * Navigation failure funnel — MTR-R03.2 / M0.3.2.
 *
 * Every navigation that cannot reach a mounted, canonical destination lands on
 * `DestinationError` with a reason code. Silence is the failure mode this
 * replaces: a `navigate('DesktopControl')` against an unmounted screen is a
 * no-op that looks like an unresponsive button.
 */

export const MOBILE_NAVIGATION_FAILURE_REASONS = [
  /** Target screen exists in the codebase but is not registered in any navigator. */
  'route_not_mounted',
  /** Target belonged to a surface that has been withdrawn from the default IA. */
  'legacy_route_retired',
  /**
   * Target is a hidden route behind an L2 product flag that is off
   * (World / Plaza / Aeon / Market / Social / Team, or the Pet family under
   * its kill switch) — MTR-R09.2 / R09.3, decision d-35.
   */
  'surface_flag_off',
  /** Nothing in the route table matches. */
  'unknown_route',
  /** `navigate()` threw — usually a param-list mismatch. */
  'navigation_threw',
  /** Called before `NavigationContainer` was ready. */
  'navigator_not_ready',
] as const;

export type MobileNavigationFailureReason =
  (typeof MOBILE_NAVIGATION_FAILURE_REASONS)[number];

export interface DestinationErrorTarget {
  readonly tab: 'Agent';
  readonly screen: 'DestinationError';
  readonly params: { readonly reason: MobileNavigationFailureReason };
}

export function isMobileNavigationFailureReason(
  value: unknown,
): value is MobileNavigationFailureReason {
  return typeof value === 'string'
    && (MOBILE_NAVIGATION_FAILURE_REASONS as readonly string[]).includes(value);
}

export function destinationErrorTarget(
  reason: MobileNavigationFailureReason,
): DestinationErrorTarget {
  return { tab: 'Agent', screen: 'DestinationError', params: { reason } };
}

export function destinationErrorPath(reason: MobileNavigationFailureReason): string {
  return `/destination-error?reason=${encodeURIComponent(reason)}`;
}

export interface DestinationErrorCopy {
  readonly en: string;
  readonly zh: string;
}

const GENERIC_DESTINATION_ERROR_COPY: DestinationErrorCopy = Object.freeze({
  en: 'This destination failed strict validation. No action, execution or payment was started.',
  zh: '该目标未通过严格校验；没有启动行动、执行或付款。',
});

/**
 * Per-reason lead copy for the DestinationError card. For the withdrawn
 * surfaces (decision d-35, M0.0.7) this text IS the user migration note —
 * there is no separate announcement — so it must say where the journey now
 * lives rather than just "invalid". Unknown / malformed reasons get the
 * generic honest line.
 */
export function describeDestinationError(reason: unknown): DestinationErrorCopy {
  switch (reason) {
    case 'surface_flag_off':
      return {
        en: 'This part of the app (World, Plaza, Aeon, Market, Social, Team) has been folded into the Agent-first layout. Skills and tasks now live under Economy, conversations and creation under Agent, your account under My. Nothing was deleted and no action was started.',
        zh: '这部分内容（世界 / 广场 / Aeon / 集市 / 社交 / 团队）已收进 Agent 优先的新布局：技能与任务在「经济」，对话与创作在「Agent」，账号与设置在「我的」。数据未删除，也没有启动任何行动。',
      };
    case 'legacy_route_retired':
      return {
        en: 'This entry point has been retired. Sign-in and onboarding now start from the Agent tab; nothing was started on your behalf.',
        zh: '该入口已下线；登录与引导现在从「Agent」页开始，没有替你启动任何操作。',
      };
    case 'route_not_mounted':
      return {
        en: 'This screen is not available in the current app layout. No action, execution or payment was started.',
        zh: '该页面在当前布局中不可用；没有启动行动、执行或付款。',
      };
    default:
      return GENERIC_DESTINATION_ERROR_COPY;
  }
}

export interface NavigationLike {
  navigate: (...args: any[]) => void;
  isReady?: () => boolean;
}

function canNavigate(navigation: NavigationLike | null | undefined): navigation is NavigationLike {
  if (!navigation || typeof navigation.navigate !== 'function') return false;
  if (typeof navigation.isReady === 'function' && !navigation.isReady()) return false;
  return true;
}

/**
 * Send the user to `DestinationError`. Returns `false` when even that is not
 * reachable (legacy IA has no such screen), so the caller can fall back to a
 * visible message instead of assuming it worked.
 */
export function navigateToDestinationError(
  navigation: NavigationLike | null | undefined,
  reason: MobileNavigationFailureReason,
): boolean {
  if (!canNavigate(navigation)) {
    console.warn(`[navigation] destination-error unreachable (${reason})`);
    return false;
  }
  const target = destinationErrorTarget(reason);
  try {
    navigation.navigate(target.tab, { screen: target.screen, params: target.params });
    return true;
  } catch {
    try {
      navigation.navigate(target.screen, target.params);
      return true;
    } catch {
      console.warn(`[navigation] destination-error unreachable (${reason})`);
      return false;
    }
  }
}

/** Shape of the action React Navigation hands to `onUnhandledAction`. */
export interface UnhandledNavigationAction {
  readonly type: string;
  readonly payload?: { readonly name?: unknown; readonly params?: unknown } | null;
}

/** Route names that are themselves part of the funnel; never re-funnel them. */
const FUNNEL_ROUTE_NAMES: ReadonlySet<string> = new Set(['Agent', 'DestinationError']);

let funnelling = false;

/**
 * `NavigationContainer.onUnhandledAction` handler — the single place every
 * `navigate()` to an unmounted route lands (MTR-R03.2). React Navigation
 * otherwise drops the action silently in production, which is exactly the
 * "button does nothing" failure the dead `DesktopControl` entries had.
 *
 * Returns the reason that was funnelled, or `null` when the action was left
 * alone (non-navigate actions, the funnel's own routes, or re-entrancy).
 */
export function handleUnhandledNavigationAction(
  navigation: NavigationLike | null | undefined,
  action: UnhandledNavigationAction | null | undefined,
): MobileNavigationFailureReason | null {
  if (!action || (action.type !== 'NAVIGATE' && action.type !== 'JUMP_TO')) return null;
  const name = action.payload?.name;
  if (typeof name !== 'string' || FUNNEL_ROUTE_NAMES.has(name)) return null;
  if (funnelling) return null;
  funnelling = true;
  try {
    console.warn(`[navigation] unhandled ${action.type} -> "${name}" (route_not_mounted)`);
    navigateToDestinationError(navigation, 'route_not_mounted');
    return 'route_not_mounted';
  } finally {
    funnelling = false;
  }
}

/**
 * Run a navigation attempt and funnel any throw into `DestinationError`.
 */
export function safeNavigate(
  navigation: NavigationLike | null | undefined,
  attempt: () => void,
  reason: MobileNavigationFailureReason = 'navigation_threw',
): boolean {
  try {
    attempt();
    return true;
  } catch {
    return navigateToDestinationError(navigation, reason);
  }
}
