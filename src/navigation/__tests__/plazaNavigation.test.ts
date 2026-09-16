/**
 * Plaza navigation contract tests.
 *
 * After the marketplace tab refactor (agentrix-marketplace-tab-refactor),
 * the Plaza tab is a single-layer trading marketplace. The 5 market
 * segments (predictions/skills/tasks/pets/resources) switch in-screen
 * inside `MarketplaceScreen` — they are NOT stack routes. The stack only
 * holds the root + each segment's secondary detail/checkout screens.
 *
 * 广场(Feed/Messaging/GreetingCard) and 玩乐(Play/Predict/PredictionMarket/
 * EventsCenter/PhotoMimic/CoRaising) were decommissioned — their routes
 * must NOT be registered. This test fails fast if anyone re-adds them or
 * drops a kept route.
 *
 * Note: we can't actually mount <PlazaStackNavigator/> here because the
 * root jest config is "testEnvironment: node" (no RN runtime) — instead
 * we parse the source file and assert the screen map directly.
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_PATH = path.resolve(
  __dirname,
  '..',
  'PlazaStackNavigator.tsx',
);

const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

function hasStackScreen(name: string): boolean {
  return new RegExp(`<Stack\\.Screen\\s+name="${name}"`).test(SOURCE);
}

describe('PlazaStackNavigator', () => {
  const REQUIRED_ROUTES = [
    'PlazaRoot',
    'Skills',
    'Tasks',
    'Pets',
  ];

  // Routes decommissioned with 广场/玩乐 — must not be re-registered.
  const REMOVED_ROUTES = [
    'Feed',
    'PostDetail',
    'ShowcaseDetail',
    'UserProfile',
    'CreatePost',
    'Messaging',
    'DirectMessage',
    'GroupChat',
    'Play',
    'Predict',
    'PredictionMarket',
    'EventsCenter',
    'PhotoMimic',
    'CoRaisingInvite',
    'CoRaisingLanding',
    'GreetingCardCompose',
    'GreetingCardInbox',
  ];

  describe('core routes', () => {
    it.each(REQUIRED_ROUTES)('declares <Stack.Screen name="%s">', (name) => {
      expect(hasStackScreen(name)).toBe(true);
    });
  });

  describe('secondary routes wired from segments', () => {
    it.each([
      'SkillDetail',
      'Checkout',
      'SkillInstall',
      'TaskDetail',
      'PostTask',
      'PetsSkins',
      'SkinAuctionDetail',
      'PetAuctionDetail',
      'ShareCard',
      'CreateLink',
      'ToyCustom',
    ])('declares <Stack.Screen name="%s">', (name) => {
      expect(hasStackScreen(name)).toBe(true);
    });
  });

  describe('decommissioned 广场/玩乐 routes are removed', () => {
    it.each(REMOVED_ROUTES)('does NOT declare <Stack.Screen name="%s">', (name) => {
      expect(hasStackScreen(name)).toBe(false);
    });
  });

  describe('param-list surface', () => {
    it('PlazaStackParamList declares each kept route in types.ts', () => {
      const typesPath = path.resolve(__dirname, '..', 'types.ts');
      const typesSource = fs.readFileSync(typesPath, 'utf8');
      REQUIRED_ROUTES.forEach((name) => {
        // either "name: undefined" (no-params) or "name: { ... }" is acceptable
        const re = new RegExp(`\\s${name}\\s*:\\s*(undefined|\\{)`);
        expect(re.test(typesSource)).toBe(true);
      });
    });
  });
});
