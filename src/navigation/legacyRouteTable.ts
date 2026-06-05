/**
 * Legacy Deep-Link Compatibility Table
 *
 * Source: docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md §8
 *
 * Old notifications, third-party shares (Twitter/Telegram/WeChat), and old
 * QR codes use legacy paths like `agentrix://agent/chat`,
 * `agentrix://pet/companion`, `agentrix://market/skill/:id`. After the
 * 4-tab refactor (Home/Summon/Plaza/Me) these paths must not 404.
 *
 * Usage — `App.tsx` linking config calls `resolveLegacyRoute(url)` before
 * feeding the URL to React Navigation's `getStateFromPath`.
 *
 * Rules:
 *   - Exact match: legacy → canonical, e.g. 'agentrix://today' → 'agentrix://home'
 *   - Prefix+wildcard: pattern ending in `/*` matches any suffix and
 *     preserves it, e.g.
 *       pattern 'agentrix://market/skill/*' → target 'agentrix://plaza/skills/*'
 *       input   'agentrix://market/skill/123' → 'agentrix://plaza/skills/123'
 *   - Unknown URLs are returned untouched (forward-compat).
 */

export const LEGACY_ROUTE_MAP: Record<string, string> = {
  // ========== Today/Home ==========
  'agentrix://today': 'agentrix://home',
  'agentrix://today/*': 'agentrix://home/*',

  // ========== Agent → Summon (conversation) or Home (pet-centric) ==========
  'agentrix://agent/chat': 'agentrix://summon',
  'agentrix://agent/chat/*': 'agentrix://summon/*',
  'agentrix://agent/voice-chat': 'agentrix://summon/voice',
  // AgentConsole废除 — 回家
  'agentrix://agent/console': 'agentrix://world',
  'agentrix://agent/console/*': 'agentrix://world',
  // Pet-owned features → re-homed under Me (Q1) or closest real destination
  'agentrix://agent/memory': 'agentrix://me/pet/memory',
  'agentrix://agent/memory-management': 'agentrix://me/pet/memory',
  'agentrix://agent/dreaming': 'agentrix://me/pet/memory',
  'agentrix://agent/logs': 'agentrix://me/pet/memory',
  'agentrix://agent/workflow': 'agentrix://me/skills/workflow',
  'agentrix://agent/workflow/*': 'agentrix://me/skills/workflow/*',
  'agentrix://agent/tools': 'agentrix://me/skills',
  'agentrix://agent/account': 'agentrix://me/wallet/connect',
  'agentrix://agent/balance': 'agentrix://me/wallet/connect',
  'agentrix://agent/permissions': 'agentrix://me',
  'agentrix://agent/agent-space': 'agentrix://me',
  'agentrix://agent/agent-space/*': 'agentrix://me',
  'agentrix://agent/agent-tools': 'agentrix://me/skills',
  // Advanced features → Me·Advanced
  'agentrix://agent/plugin-hub': 'agentrix://me/advanced/plugin',
  'agentrix://agent/memory-wiki': 'agentrix://me/advanced/memory-wiki',
  'agentrix://agent/mcp': 'agentrix://me/advanced/mcp',
  'agentrix://agent/mcp-manager': 'agentrix://me/advanced/mcp',
  'agentrix://agent/acp': 'agentrix://me/advanced/acp',
  'agentrix://agent/acp-sessions': 'agentrix://me/advanced/acp',
  'agentrix://agent/skill-pack': 'agentrix://me/advanced/skill-pack',
  'agentrix://agent/storage': 'agentrix://me/advanced/storage',
  'agentrix://agent/storage-plan': 'agentrix://me/advanced/storage',
  // Team → Me·Team
  'agentrix://agent/team-space': 'agentrix://me/team/space',
  'agentrix://agent/team-invite': 'agentrix://me/team/invite',
  // Devices → Me·Devices
  'agentrix://agent/wearable': 'agentrix://me/devices/wearable',
  'agentrix://agent/wearable-hub': 'agentrix://me/devices/wearable',
  'agentrix://agent/wearable-monitor/*': 'agentrix://me/devices/wearable/monitor/*',
  'agentrix://agent/desktop-control': 'agentrix://me/devices/desktop',
  'agentrix://agent/openclaw-bind': 'agentrix://me/devices/openclaw',
  'agentrix://agent/deploy-select': 'agentrix://me/devices/add',
  'agentrix://agent/cloud-deploy': 'agentrix://me/devices/add/cloud',
  'agentrix://agent/connect-existing': 'agentrix://me/devices/add/existing',
  'agentrix://agent/local-deploy': 'agentrix://me/devices/add/local',
  'agentrix://agent/local-connect': 'agentrix://me/devices/local-connect',
  'agentrix://agent/social-bind/*': 'agentrix://me/devices/social/*',
  'agentrix://agent/scan': 'agentrix://scan',
  // Skills
  'agentrix://agent/skill-install': 'agentrix://plaza/skills/install',
  'agentrix://agent/skill-install/*': 'agentrix://plaza/skills/install/*',

  // ========== Pet → Home (pet drawer) ==========
  'agentrix://pet': 'agentrix://world',
  'agentrix://pet/companion': 'agentrix://me',
  'agentrix://pet/creator': 'agentrix://world/create/text',
  'agentrix://pet/wardrobe': 'agentrix://me/pet/wardrobe',
  'agentrix://pet/soul-picker': 'agentrix://me/pet/soul',
  'agentrix://pet/breed': 'agentrix://me/pet/breed',
  'agentrix://pet/pet-team': 'agentrix://me/pet/playground',
  'agentrix://pet/team': 'agentrix://me/pet/playground',
  'agentrix://pet/playground': 'agentrix://me/pet/playground',
  // Pet skin market — re-homed under Me (Q1); Plaza still has the auction view
  'agentrix://pet/skin-marketplace': 'agentrix://me/pet/skins',

  // ========== Market → Plaza ==========
  'agentrix://market': 'agentrix://plaza/skills',
  'agentrix://market/skill': 'agentrix://plaza/skills',
  'agentrix://market/skill/*': 'agentrix://plaza/skills/*',
  'agentrix://market/checkout/*': 'agentrix://plaza/checkout/*',
  'agentrix://market/task': 'agentrix://plaza/tasks',
  'agentrix://market/task/*': 'agentrix://plaza/tasks/*',
  'agentrix://market/post-task': 'agentrix://plaza/tasks/post',
  'agentrix://market/publish-task': 'agentrix://plaza/tasks/post',
  'agentrix://market/create-link': 'agentrix://plaza/share-card',

  // ========== Discover → Plaza ==========
  'agentrix://discover': 'agentrix://plaza',
  'agentrix://discover/predict': 'agentrix://plaza/play/predict',
  'agentrix://discover/marketplace': 'agentrix://plaza/skills',
  'agentrix://discover/feed': 'agentrix://plaza/feed',
  'agentrix://discover/post/*': 'agentrix://plaza/feed/post/*',
  'agentrix://discover/user/*': 'agentrix://plaza/feed/user/*',
  'agentrix://discover/task-market': 'agentrix://plaza/tasks',
  'agentrix://discover/task/*': 'agentrix://plaza/tasks/*',

  // ========== Social → Plaza·Feed / Plaza·Messaging ==========
  'agentrix://social': 'agentrix://plaza/feed',
  'agentrix://social/feed': 'agentrix://plaza/feed',
  'agentrix://social/post/*': 'agentrix://plaza/feed/post/*',
  'agentrix://social/user/*': 'agentrix://plaza/feed/user/*',
  'agentrix://social/dm/list': 'agentrix://plaza/messaging',
  'agentrix://social/dm/*': 'agentrix://plaza/messaging/*',
  'agentrix://social/group/*': 'agentrix://plaza/messaging/group/*',
  'agentrix://social/chat-list': 'agentrix://plaza/messaging',
  'agentrix://social/listener': 'agentrix://me/advanced/social-listener',

  // ========== Me (most unchanged, a few repositioned) ==========
  'agentrix://me': 'agentrix://me',
  'agentrix://me/profile': 'agentrix://me',
  'agentrix://me/settings': 'agentrix://me/settings',
  'agentrix://me/account': 'agentrix://me/account',
  'agentrix://me/referral': 'agentrix://me/promote',
  'agentrix://me/api-keys': 'agentrix://me/advanced/api-keys',
  'agentrix://me/local-ai-model': 'agentrix://me/advanced/local-ai',
  'agentrix://me/wallet-connect': 'agentrix://me/wallet/connect',
  'agentrix://me/wallet-setup': 'agentrix://me/wallet/setup',
  'agentrix://me/wallet-backup': 'agentrix://me/wallet/backup',
  'agentrix://me/notifications': 'agentrix://inbox',
  'agentrix://me/share-card': 'agentrix://plaza/share-card',
  'agentrix://me/share-card/*': 'agentrix://plaza/share-card/*',
  'agentrix://me/scan': 'agentrix://scan',
  'agentrix://me/wearable-hub': 'agentrix://me/devices/wearable',
  'agentrix://me/social-listener': 'agentrix://me/advanced/social-listener',

  // ========== Deprecated screens — sensible fallback ==========
  'agentrix://quick-pay': 'agentrix://me/wallet',
  'agentrix://identity-activation': 'agentrix://me',
  'agentrix://identity-activation/*': 'agentrix://me',
  'agentrix://airdrop': 'agentrix://plaza/feed',
  'agentrix://alliance': 'agentrix://me/advanced/alliance',

  // ========== Marketplace Action Deep Links (Web → Mobile) ==========
  // Web frontend generates these action-style deep links with query params:
  //   agentrix://buy?resourceId={skinId}
  //   agentrix://bid?resourceId={auctionId}
  //   agentrix://install_skill?resourceId={skillId}
  //   agentrix://accept_task?resourceId={taskId}
  'agentrix://buy': 'agentrix://plaza/pets/skins',
  'agentrix://bid': 'agentrix://plaza/pets/skins',
  'agentrix://install_skill': 'agentrix://plaza/skills',
  'agentrix://accept_task': 'agentrix://plaza/tasks',

  // ========== Co-Raising & Greeting Deep Links (Sprint E) ==========
  // Mobile share → Web landing → universal link back to App
  //   agentrix://co_raising?inviteToken={tok}
  //   agentrix://greeting?cardToken={tok}
  'agentrix://co_raising': 'agentrix://home/co-raising/landing',
  'agentrix://co-raising': 'agentrix://home/co-raising/landing',
  'agentrix://co-raising/*': 'agentrix://home/co-raising/landing/*',
  'agentrix://greeting': 'agentrix://plaza/greeting-inbox',
  'agentrix://greeting/*': 'agentrix://plaza/greeting-inbox/*',

  // ========== Toy activation (NFC / QR on packaging) ==========
  'agentrix://toy/activate': 'agentrix://me/devices/toy',
  'agentrix://nfc': 'agentrix://pet/nfc-redeem',
  'agentrix://nfc/*': 'agentrix://pet/nfc-redeem/*',

  // ========== Special deep links — unchanged ==========
  'agentrix://connect': 'agentrix://me/devices/local-connect', // desktop QR pairing
  'agentrix://auth/callback': 'agentrix://auth/callback',
  'agentrix://login': 'agentrix://login',
  'agentrix://invitation-gate': 'agentrix://invitation-gate',

  // ========== P-9 Companion Redesign (T2.4): Home tab is GONE ==========
  // The old `agentrix://home` and `agentrix://home/pet/*` routes were the
  // canonical post-Sprint-A targets for many of the legacy mappings above.
  // Phase 1 deletes the Home tab, so we add a second redirection layer
  // that maps `agentrix://home/*` to the new IA (World / Me / etc).
  //
  // Order matters: more-specific patterns must come first so they win the
  // longest-prefix match. The single bare `agentrix://home` falls back to
  // the new default tab (World).
  'agentrix://home': 'agentrix://world',
  // Pet drawer entries — re-homed under Me (Q1 T6.7). These now resolve to
  // the real registered Me-stack routes added in App.tsx linking config.
  'agentrix://home/pet/companion': 'agentrix://me',
  'agentrix://home/pet/skills': 'agentrix://me/skills',
  'agentrix://home/pet/tasks': 'agentrix://plaza/tasks',
  'agentrix://home/pet/wallet': 'agentrix://me/wallet/connect',
  'agentrix://home/pet/wallet/balance': 'agentrix://me/wallet/connect',
  'agentrix://home/pet/memory': 'agentrix://me/pet/memory',
  'agentrix://home/pet/memory/dreaming': 'agentrix://me/pet/memory',
  'agentrix://home/pet/memory/logs': 'agentrix://me/pet/memory',
  'agentrix://home/pet/play': 'agentrix://me/pet/playground',
  'agentrix://home/pet/wardrobe': 'agentrix://me/pet/wardrobe',
  'agentrix://home/pet/soul': 'agentrix://me/pet/soul',
  'agentrix://home/pet/breed': 'agentrix://me/pet/breed',
  'agentrix://home/pet/identity': 'agentrix://me',
  // Creator + camera-scan now live under World tab (T2.1)
  'agentrix://home/pet/creator': 'agentrix://world/create/text',
  'agentrix://home/pet/camera-scan': 'agentrix://world/create/photo',
  'agentrix://home/pet/permissions': 'agentrix://me',
  'agentrix://home/pet/space': 'agentrix://me',
  'agentrix://home/pet/space/*': 'agentrix://me',
  'agentrix://home/pet/team': 'agentrix://me/pet/playground',
  'agentrix://home/pet/skills/workflow': 'agentrix://me/skills/workflow',
  'agentrix://home/pet/skills/workflow/*': 'agentrix://me/skills/workflow/*',
  // World Engine (already under WorldStack but legacy used home/pet/world-*)
  'agentrix://home/pet/world-scan': 'agentrix://world/scan',
  'agentrix://home/pet/world-assets': 'agentrix://world/inventory',
  // Co-Raising → Plaza co-raising entry (where the screens are registered)
  'agentrix://home/co-raising': 'agentrix://plaza/co-raising/invite',
  'agentrix://home/co-raising/landing': 'agentrix://plaza/co-raising/invite',
  'agentrix://home/co-raising/landing/*': 'agentrix://plaza/co-raising/invite',
  'agentrix://home/co-raising/invite': 'agentrix://plaza/co-raising/invite',
  'agentrix://home/co-raising/activity': 'agentrix://plaza/co-raising/invite',
  // Plan Approval reused via global Inbox modal
  'agentrix://home/approvals': 'agentrix://inbox',
  // NFT Mint → World create (closest real destination)
  'agentrix://home/nft-mint': 'agentrix://world',
  // Catch-all for anything else under home/* (lowest specificity)
  'agentrix://home/*': 'agentrix://world',

  // ========== Wallet tab (隐藏) → Me/wallet ==========
  'agentrix://wallet': 'agentrix://me/wallet',
  'agentrix://wallet/*': 'agentrix://me/wallet/*',
};

/**
 * Strip the scheme + normalize to `agentrix://<path>` so matching is uniform.
 * Accepts any of the 5 registered schemes from app.json.
 */
function normalizeUrl(url: string): string {
  if (!url) return '';
  // Expo dev URL "exp://..." — return as-is (no legacy match needed)
  if (url.startsWith('exp://')) return url;
  // Universal link form → convert to scheme form
  if (url.startsWith('https://agentrix.top/')) {
    return 'agentrix://' + url.slice('https://agentrix.top/'.length);
  }
  if (url.startsWith('https://clawlink.app/')) {
    return 'agentrix://' + url.slice('https://clawlink.app/'.length);
  }
  if (url.startsWith('clawlink://')) {
    return 'agentrix://' + url.slice('clawlink://'.length);
  }
  return url;
}

/**
 * Resolve a legacy deep link to its canonical new-IA target.
 *
 * Matching order:
 *   1) Exact URL match
 *   2) Longest prefix match (prefer more specific patterns)
 *   3) Fallback: return normalized original
 */
export function resolveLegacyRoute(rawUrl: string): string {
  const url = normalizeUrl(rawUrl);
  if (!url) return rawUrl;

  // 1) Exact
  if (LEGACY_ROUTE_MAP[url]) {
    return LEGACY_ROUTE_MAP[url];
  }

  // 2) Wildcard — try from longest pattern to shortest for specificity
  const patterns = Object.keys(LEGACY_ROUTE_MAP)
    .filter((p) => p.endsWith('/*'))
    .sort((a, b) => b.length - a.length);

  for (const pattern of patterns) {
    const prefix = pattern.slice(0, -2); // drop "/*"
    if (url === prefix) {
      // Exact match of the non-wildcard base path
      return LEGACY_ROUTE_MAP[pattern].replace('/*', '');
    }
    if (url.startsWith(prefix + '/')) {
      const suffix = url.slice(prefix.length); // includes leading "/"
      return LEGACY_ROUTE_MAP[pattern].replace('/*', suffix);
    }
  }

  // 3) No match — forward untouched
  return url;
}

/**
 * Marketplace action deep links use query params (?resourceId=xxx) rather
 * than path segments. This map defines how to translate the action + query
 * params into a canonical path with route params that React Navigation can
 * parse.
 *
 * The resolved path includes the resourceId as a path segment so it matches
 * the linking config's `:auctionId`, `:skillId`, `:taskId` patterns.
 */
const MARKETPLACE_ACTION_MAP: Record<string, (params: URLSearchParams) => string> = {
  buy: (p) => `plaza/pets/skins/${p.get('resourceId') || ''}`,
  bid: (p) => `plaza/pets/skins/${p.get('resourceId') || ''}`,
  install_skill: (p) => `plaza/skills/install/${p.get('resourceId') || ''}`,
  accept_task: (p) => `plaza/tasks/${p.get('resourceId') || ''}`,
  co_raising: (p) => `home/co-raising/landing?token=${p.get('inviteToken') || p.get('token') || ''}`,
  'co-raising': (p) => `home/co-raising/landing?token=${p.get('inviteToken') || p.get('token') || ''}`,
  greeting: (p) => `plaza/greeting-inbox?token=${p.get('cardToken') || p.get('token') || ''}`,
};

/**
 * Hook-style helper for integrating with React Navigation's `linking.getStateFromPath`.
 * The linking config passes `path` (no scheme), so we re-prepend scheme, resolve,
 * then strip scheme again for getStateFromPath to parse.
 *
 * Also handles marketplace action deep links with query params:
 *   buy?resourceId=xxx → plaza/pets/skins/xxx
 *   bid?resourceId=xxx → plaza/pets/skins/xxx
 *   install_skill?resourceId=xxx → plaza/skills/install/xxx
 *   accept_task?resourceId=xxx → plaza/tasks/xxx
 */
export function resolveLegacyPath(path: string): string {
  // Handle action-style deep links with query params (e.g. "buy?resourceId=abc123")
  const cleanPath = path.replace(/^\//, '');
  const qIdx = cleanPath.indexOf('?');
  if (qIdx !== -1) {
    const action = cleanPath.slice(0, qIdx);
    const resolver = MARKETPLACE_ACTION_MAP[action];
    if (resolver) {
      const params = new URLSearchParams(cleanPath.slice(qIdx + 1));
      return resolver(params);
    }
  } else {
    // Check if the path itself (no query) is a marketplace action
    const resolver = MARKETPLACE_ACTION_MAP[cleanPath];
    if (resolver) {
      return resolver(new URLSearchParams());
    }
  }

  const withScheme = `agentrix://${cleanPath}`;
  const resolved = resolveLegacyRoute(withScheme);
  return resolved.replace(/^agentrix:\/\//, '');
}
