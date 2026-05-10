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
      ['agentrix://agent/console', 'agentrix://home'],
      ['agentrix://agent/console/anything', 'agentrix://home'],
      ['agentrix://agent/memory', 'agentrix://home/pet/memory'],
      ['agentrix://agent/memory-management', 'agentrix://home/pet/memory'],
      ['agentrix://agent/dreaming', 'agentrix://home/pet/memory/dreaming'],
      ['agentrix://agent/logs', 'agentrix://home/pet/memory/logs'],
      ['agentrix://agent/workflow', 'agentrix://home/pet/skills/workflow'],
      ['agentrix://agent/workflow/42', 'agentrix://home/pet/skills/workflow/42'],
      ['agentrix://agent/tools', 'agentrix://home/pet/skills'],
      ['agentrix://agent/account', 'agentrix://home/pet/wallet'],
      ['agentrix://agent/balance', 'agentrix://home/pet/wallet/balance'],
      ['agentrix://agent/permissions', 'agentrix://home/pet/permissions'],
      ['agentrix://agent/agent-space', 'agentrix://home/pet/space'],
      ['agentrix://agent/agent-space/foo', 'agentrix://home/pet/space/foo'],
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

  describe('Pet → Home drawer', () => {
    it.each([
      ['agentrix://pet', 'agentrix://home'],
      ['agentrix://pet/companion', 'agentrix://home'],
      ['agentrix://pet/creator', 'agentrix://home/pet/creator'],
      ['agentrix://pet/wardrobe', 'agentrix://home/pet/wardrobe'],
      ['agentrix://pet/soul-picker', 'agentrix://home/pet/soul'],
      ['agentrix://pet/breed', 'agentrix://home/pet/breed'],
      ['agentrix://pet/pet-team', 'agentrix://home/pet/team'],
      ['agentrix://pet/team', 'agentrix://home/pet/team'],
      ['agentrix://pet/playground', 'agentrix://home/pet/play'],
      ['agentrix://pet/skin-marketplace', 'agentrix://plaza/pets/skins'],
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
      ['agentrix://discover/predict', 'agentrix://plaza/play/predict'],
      ['agentrix://discover/marketplace', 'agentrix://plaza/skills'],
      ['agentrix://discover/feed', 'agentrix://plaza/feed'],
      ['agentrix://discover/post/p-42', 'agentrix://plaza/feed/post/p-42'],
      ['agentrix://discover/user/u-7', 'agentrix://plaza/feed/user/u-7'],
      ['agentrix://discover/task-market', 'agentrix://plaza/tasks'],
      ['agentrix://discover/task/t-1', 'agentrix://plaza/tasks/t-1'],
    ])('%s → %s', (input, expected) => {
      expect(resolveLegacyRoute(input)).toBe(expected);
    });
  });

  describe('Social → Plaza Feed/Messaging', () => {
    it.each([
      ['agentrix://social', 'agentrix://plaza/feed'],
      ['agentrix://social/feed', 'agentrix://plaza/feed'],
      ['agentrix://social/post/p-1', 'agentrix://plaza/feed/post/p-1'],
      ['agentrix://social/user/u-2', 'agentrix://plaza/feed/user/u-2'],
      ['agentrix://social/dm/list', 'agentrix://plaza/messaging'],
      ['agentrix://social/dm/user-9', 'agentrix://plaza/messaging/user-9'],
      ['agentrix://social/group/g-3', 'agentrix://plaza/messaging/group/g-3'],
      ['agentrix://social/chat-list', 'agentrix://plaza/messaging'],
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
      ['agentrix://airdrop', 'agentrix://plaza/feed'],
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
      expect(resolveLegacyRoute('agentrix://agent/agent-space')).toBe('agentrix://home/pet/space');
    });
    it('agent/wearable-monitor/:id beats agent/wearable', () => {
      expect(resolveLegacyRoute('agentrix://agent/wearable-monitor/d-99')).toBe(
        'agentrix://me/devices/wearable/monitor/d-99',
      );
    });
  });
});
