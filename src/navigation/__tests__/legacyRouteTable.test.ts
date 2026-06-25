/**
 * Legacy Deep-Link Regression Tests — Sprint D verification.
 *
 * Ensures that every legacy `agentrix://...` deep link referenced in the
 * Sprint A legacy route table resolves to a canonical new-IA path. If
 * anyone ever accidentally removes a mapping or renames a target, these
 * tests fail fast.
 *
 * Run: `npm test -- --testPathPattern=legacyRouteTable`
 */
import { resolveLegacyRoute, resolveLegacyPath } from '../legacyRouteTable';

describe('Legacy deep-link resolver', () => {
  describe('Today/Home', () => {
    it('agentrix://today → agentrix://home', () => {
      expect(resolveLegacyRoute('agentrix://today')).toBe('agentrix://home');
    });
    it('agentrix://today/pet → agentrix://home/pet', () => {
      expect(resolveLegacyRoute('agentrix://today/pet')).toBe('agentrix://home/pet');
    });
  });

  describe('Agent → Summon / Home / Me', () => {
    it.each([
      ['agentrix://agent/chat', 'agentrix://summon'],
      ['agentrix://agent/chat/session-123', 'agentrix://summon/session-123'],
      ['agentrix://agent/voice-chat', 'agentrix://summon/voice'],
      ['agentrix://agent/console', 'agentrix://world'],
      ['agentrix://agent/console/anything', 'agentrix://world'],
      ['agentrix://agent/memory', 'agentrix://me/pet/memory'],
      ['agentrix://agent/memory-management', 'agentrix://me/pet/memory'],
      ['agentrix://agent/dreaming', 'agentrix://me/pet/memory'],
      ['agentrix://agent/logs', 'agentrix://me/pet/memory'],
      ['agentrix://agent/workflow', 'agentrix://me/skills/workflow'],
      ['agentrix://agent/workflow/42', 'agentrix://me/skills/workflow/42'],
      ['agentrix://agent/tools', 'agentrix://me/skills'],
      ['agentrix://agent/account', 'agentrix://me/wallet/connect'],
      ['agentrix://agent/balance', 'agentrix://me/wallet/connect'],
      ['agentrix://agent/permissions', 'agentrix://me'],
      ['agentrix://agent/agent-space', 'agentrix://me'],
      ['agentrix://agent/agent-space/foo', 'agentrix://me'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });

    it.each([
      ['agentrix://agent/plugin-hub', 'agentrix://me/advanced/plugin'],
      ['agentrix://agent/memory-wiki', 'agentrix://me/advanced/memory-wiki'],
      ['agentrix://agent/mcp', 'agentrix://me/advanced/mcp'],
      ['agentrix://agent/mcp-manager', 'agentrix://me/advanced/mcp'],
      ['agentrix://agent/acp', 'agentrix://me/advanced/acp'],
      ['agentrix://agent/acp-sessions', 'agentrix://me/advanced/acp'],
      ['agentrix://agent/skill-pack', 'agentrix://me/advanced/skill-pack'],
      ['agentrix://agent/storage', 'agentrix://me/advanced/storage'],
      ['agentrix://agent/storage-plan', 'agentrix://me/advanced/storage'],
    ])('advanced: %s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });

    it.each([
      ['agentrix://agent/team-space', 'agentrix://me/team/space'],
      ['agentrix://agent/team-invite', 'agentrix://me/team/invite'],
      ['agentrix://agent/wearable', 'agentrix://me/devices/wearable'],
      ['agentrix://agent/wearable-hub', 'agentrix://me/devices/wearable'],
      ['agentrix://agent/wearable-monitor/d-1', 'agentrix://me/devices/wearable/monitor/d-1'],
      ['agentrix://agent/desktop-control', 'agentrix://me/devices/desktop'],
      ['agentrix://agent/openclaw-bind', 'agentrix://me/devices/openclaw'],
      ['agentrix://agent/deploy-select', 'agentrix://me/devices/add'],
      ['agentrix://agent/cloud-deploy', 'agentrix://me/devices/add/cloud'],
      ['agentrix://agent/connect-existing', 'agentrix://me/devices/add/existing'],
      ['agentrix://agent/local-deploy', 'agentrix://me/devices/add/local'],
      ['agentrix://agent/local-connect', 'agentrix://me/devices/local-connect'],
      ['agentrix://agent/social-bind/inst-42', 'agentrix://me/devices/social/inst-42'],
      ['agentrix://agent/scan', 'agentrix://scan'],
      ['agentrix://agent/skill-install', 'agentrix://plaza/skills/install'],
      ['agentrix://agent/skill-install/s-9', 'agentrix://plaza/skills/install/s-9'],
    ])('device/team: %s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Pet → Me drawer (Q1 re-home)', () => {
    it.each([
      ['agentrix://pet', 'agentrix://world'],
      ['agentrix://pet/companion', 'agentrix://me'],
      ['agentrix://pet/creator', 'agentrix://world/create/text'],
      ['agentrix://pet/wardrobe', 'agentrix://me/pet/wardrobe'],
      ['agentrix://pet/soul-picker', 'agentrix://me/pet/soul'],
      ['agentrix://pet/breed', 'agentrix://me/pet/breed'],
      ['agentrix://pet/pet-team', 'agentrix://me/pet/playground'],
      ['agentrix://pet/team', 'agentrix://me/pet/playground'],
      ['agentrix://pet/playground', 'agentrix://me/pet/playground'],
      ['agentrix://pet/skin-marketplace', 'agentrix://me/pet/skins'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Market → Plaza', () => {
    it.each([
      ['agentrix://market', 'agentrix://plaza/skills'],
      ['agentrix://market/skill', 'agentrix://plaza/skills'],
      ['agentrix://market/skill/sk-123', 'agentrix://plaza/skills/sk-123'],
      ['agentrix://market/checkout/order-9', 'agentrix://plaza/checkout/order-9'],
      ['agentrix://market/task', 'agentrix://plaza/tasks'],
      ['agentrix://market/task/t-42', 'agentrix://plaza/tasks/t-42'],
      ['agentrix://market/post-task', 'agentrix://plaza/tasks/post'],
      ['agentrix://market/publish-task', 'agentrix://plaza/tasks/post'],
      ['agentrix://market/create-link', 'agentrix://plaza/share-card'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Discover → Plaza', () => {
    it.each([
      ['agentrix://discover', 'agentrix://plaza'],
      // 玩乐/广场已下线 → 集市 root
      ['agentrix://discover/predict', 'agentrix://plaza'],
      ['agentrix://discover/marketplace', 'agentrix://plaza/skills'],
      ['agentrix://discover/feed', 'agentrix://plaza'],
      ['agentrix://discover/post/p-42', 'agentrix://plaza'],
      ['agentrix://discover/user/u-7', 'agentrix://plaza'],
      ['agentrix://discover/task-market', 'agentrix://plaza/tasks'],
      ['agentrix://discover/task/t-1', 'agentrix://plaza/tasks/t-1'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Social → 集市 root (广场/私信已下线)', () => {
    it.each([
      ['agentrix://social', 'agentrix://plaza'],
      ['agentrix://social/feed', 'agentrix://plaza'],
      ['agentrix://social/post/p-1', 'agentrix://plaza'],
      ['agentrix://social/user/u-2', 'agentrix://plaza'],
      ['agentrix://social/dm/list', 'agentrix://plaza'],
      ['agentrix://social/dm/user-9', 'agentrix://plaza'],
      ['agentrix://social/group/g-3', 'agentrix://plaza'],
      ['agentrix://social/chat-list', 'agentrix://plaza'],
      ['agentrix://social/listener', 'agentrix://me/advanced/social-listener'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Me (mostly stable)', () => {
    it.each([
      ['agentrix://me/profile', 'agentrix://me'],
      ['agentrix://me/settings', 'agentrix://me/settings'],
      ['agentrix://me/referral', 'agentrix://me/promote'],
      ['agentrix://me/api-keys', 'agentrix://me/advanced/api-keys'],
      ['agentrix://me/local-ai-model', 'agentrix://me/advanced/local-ai'],
      ['agentrix://me/wallet-connect', 'agentrix://me/wallet/connect'],
      ['agentrix://me/wallet-setup', 'agentrix://me/wallet/setup'],
      ['agentrix://me/wallet-backup', 'agentrix://me/wallet/backup'],
      ['agentrix://me/notifications', 'agentrix://inbox'],
      ['agentrix://me/share-card', 'agentrix://plaza/share-card'],
      ['agentrix://me/share-card/x-9', 'agentrix://plaza/share-card/x-9'],
      ['agentrix://me/scan', 'agentrix://scan'],
      ['agentrix://me/wearable-hub', 'agentrix://me/devices/wearable'],
      ['agentrix://me/social-listener', 'agentrix://me/advanced/social-listener'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Deprecated screens', () => {
    it.each([
      ['agentrix://quick-pay', 'agentrix://me/wallet'],
      ['agentrix://identity-activation', 'agentrix://me'],
      ['agentrix://identity-activation/dev', 'agentrix://me'],
      ['agentrix://airdrop', 'agentrix://plaza'],
      ['agentrix://alliance', 'agentrix://me/advanced/alliance'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Special (unchanged)', () => {
    it.each([
      ['agentrix://connect', 'agentrix://me/devices/local-connect'],
      ['agentrix://auth/callback', 'agentrix://auth/callback'],
      ['agentrix://login', 'agentrix://login'],
      ['agentrix://invitation-gate', 'agentrix://invitation-gate'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Scheme normalization', () => {
    it('clawlink:// → agentrix://', () => {
      expect(resolveLegacyRoute('clawlink://agent/chat')).toBe('agentrix://summon');
    });
    it('https://agentrix.top → agentrix://', () => {
      expect(resolveLegacyRoute('https://agentrix.top/market/skill/42')).toBe(
        'agentrix://plaza/skills/42',
      );
    });
    it('https://clawlink.app → agentrix://', () => {
      expect(resolveLegacyRoute('https://clawlink.app/me/referral')).toBe(
        'agentrix://me/promote',
      );
    });
    it('exp:// Expo dev URL pass-through', () => {
      const expUrl = 'exp://192.168.1.10:8081/--/home';
      expect(resolveLegacyRoute(expUrl)).toBe(expUrl);
    });
    it('Unknown URL forward-compat (returns untouched)', () => {
      expect(resolveLegacyRoute('agentrix://future/feature')).toBe('agentrix://future/feature');
    });
  });

  describe('resolveLegacyPath (path-only helper)', () => {
    it('strips scheme and re-applies mapping', () => {
      expect(resolveLegacyPath('agent/chat')).toBe('summon');
      expect(resolveLegacyPath('market/skill/foo')).toBe('plaza/skills/foo');
      expect(resolveLegacyPath('/me/referral')).toBe('me/promote');
    });
  });

  describe('Edge: longest-prefix match wins', () => {
    it('agent/agent-space (more specific) beats agent (less specific)', () => {
      expect(resolveLegacyRoute('agentrix://agent/agent-space')).toBe('agentrix://me');
    });
    it('agent/wearable-monitor/:id beats agent/wearable', () => {
      expect(resolveLegacyRoute('agentrix://agent/wearable-monitor/d-99')).toBe(
        'agentrix://me/devices/wearable/monitor/d-99',
      );
    });
  });
});
