/**
 * Order of the 我的 home rows (pure, testable). Product doc 5.4: the first
 * three cards are 带入与备份, 设备, 钱包 (带回家 / 替你办事 / 替你创收).
 */
import { NAV_CATALOG, type NavTab } from '../navCatalog';

export const MY_HOME_FEATURED_TABS = ['import', 'devices', 'wallet'] as const;

export function myHomeTabOrder(): NavTab[] {
  const tabs = NAV_CATALOG.my.tabs.filter((tab) => tab.id !== NAV_CATALOG.my.defaultTab);
  const featured = MY_HOME_FEATURED_TABS.map((id) => tabs.find((tab) => tab.id === id)).filter(
    (tab): tab is NavTab => !!tab,
  );
  const rest = tabs.filter((tab) => !(MY_HOME_FEATURED_TABS as readonly string[]).includes(tab.id));
  return [...featured, ...rest];
}
