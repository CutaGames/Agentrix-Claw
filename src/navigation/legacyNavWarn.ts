/**
 * Legacy navigation-name warning helper — Sprint D A6 tooling.
 *
 * Purpose: detect any remaining `navigation.navigate('Agent'|'Discover'|
 * 'Today'|'Pet'|'Team'|'Wallet', ...)` call sites that weren't migrated
 * to the new 4-tab IA (Home/Summon/Plaza/Me). We keep the hidden legacy
 * tabs mounted (see MainTabNavigator §2.7) so these calls still reach
 * their screens — but they take a suboptimal path through a hidden tab.
 *
 * How to use:
 *   import { wrapNavigateWithLegacyWarning } from '.../legacyNavWarn';
 *   const nav = useNavigation();
 *   // Sprint E: wrap once at app root to flag every violation.
 *
 * Not wired into the global RootNavigator yet — just a building block
 * so Sprint E can enable it at will (e.g. on __DEV__ builds first,
 * then upgrade to throw in production).
 */

const LEGACY_TAB_NAMES = new Set([
  'Agent',
  'Discover',
  'Today',
  'Pet',
  'Team',
  'Wallet',
]);

const MIGRATION_HINT: Record<string, string> = {
  Agent: '→ Summon (chat) or Home (pet features)',
  Discover: '→ Plaza (all 5 segments)',
  Today: '→ Home',
  Pet: '→ Home (pet drawer)',
  Team: '→ Me (team collapsible) — for now legacy Team stack still handles TaskBoard',
  Wallet: '→ Me → Wallet',
};

const warned = new Set<string>();

/** Log a single warning per legacy tab name (dedupe noise). */
export function warnLegacyTabNav(tabName: string) {
  if (!LEGACY_TAB_NAMES.has(tabName) || !__DEV__) return;
  if (warned.has(tabName)) return;
  warned.add(tabName);
  // eslint-disable-next-line no-console
  console.warn(
    `[nav:legacy] navigate('${tabName}', …) still in use. ` +
      `${MIGRATION_HINT[tabName] ?? ''}. ` +
      `These hidden tabs will be removed in Sprint E — please migrate.`,
  );
}

/**
 * Wraps a navigation.navigate call to emit a one-shot warning when a
 * legacy tab name is used as the first argument. The wrapped function
 * still calls through so existing behavior is preserved.
 *
 * Usage pattern (Sprint E follow-up):
 *   const rawNavigate = navigation.navigate;
 *   navigation.navigate = wrapNavigateWithLegacyWarning(rawNavigate);
 */
export function wrapNavigateWithLegacyWarning<
  T extends (...args: any[]) => any,
>(original: T): T {
  const wrapped = ((...args: any[]) => {
    const first = args[0];
    if (typeof first === 'string') {
      warnLegacyTabNav(first);
    }
    return original(...args);
  }) as T;
  return wrapped;
}

/** For unit tests / diagnostics. */
export function _resetLegacyNavWarnings() {
  warned.clear();
}
