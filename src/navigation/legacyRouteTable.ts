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
  'agentrix://agent/console': 'agentrix://home',
  'agentrix://agent/console/*': 'agentrix://home',
  // Pet-owned features → Home pet drawer
  'agentrix://agent/memory': 'agentrix://home/pet/memory',
  'agentrix://agent/memory-management': 'agentrix://home/pet/memory',
  'agentrix://agent/dreaming': 'agentrix://home/pet/memory/dreaming',
  'agentrix://agent/logs': 'agentrix://home/pet/memory/logs',
  'agentrix://agent/workflow': 'agentrix://home/pet/skills/workflow',
  'agentrix://agent/workflow/*': 'agentrix://home/pet/skills/workflow/*',
  'agentrix://agent/tools': 'agentrix://home/pet/skills',
  'agentrix://agent/account': 'agentrix://home/pet/wallet',
  'agentrix://agent/balance': 'agentrix://home/pet/wallet/balance',
  'agentrix://agent/permissions': 'agentrix://home/pet/permissions',
  'agentrix://agent/agent-space': 'agentrix://home/pet/space',
  'agentrix://agent/agent-space/*': 'agentrix://home/pet/space/*',
  'agentrix://agent/agent-tools': 'agentrix://home/pet/skills',
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
  'agentrix://pet': 'agentrix://home',
  'agentrix://pet/companion': 'agentrix://home',
  'agentrix://pet/creator': 'agentrix://home/pet/creator',
  'agentrix://pet/wardrobe': 'agentrix://home/pet/wardrobe',
  'agentrix://pet/soul-picker': 'agentrix://home/pet/soul',
  'agentrix://pet/breed': 'agentrix://home/pet/breed',
  'agentrix://pet/pet-team': 'agentrix://home/pet/team',
  'agentrix://pet/team': 'agentrix://home/pet/team',
  'agentrix://pet/playground': 'agentrix://home/pet/play',
  // Pet skin market now lives in Plaza·Pets·Skins
  'agentrix://pet/skin-marketplace': 'agentrix://plaza/pets/skins',

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

  // ========== Special deep links — unchanged ==========
  'agentrix://connect': 'agentrix://me/devices/local-connect', // desktop QR pairing
  'agentrix://auth/callback': 'agentrix://auth/callback',
  'agentrix://login': 'agentrix://login',
  'agentrix://invitation-gate': 'agentrix://invitation-gate',
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
 * Hook-style helper for integrating with React Navigation's `linking.getStateFromPath`.
 * The linking config passes `path` (no scheme), so we re-prepend scheme, resolve,
 * then strip scheme again for getStateFromPath to parse.
 */
export function resolveLegacyPath(path: string): string {
  const withScheme = `agentrix://${path.replace(/^\//, '')}`;
  const resolved = resolveLegacyRoute(withScheme);
  return resolved.replace(/^agentrix:\/\//, '');
}
