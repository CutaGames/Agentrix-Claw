/**
 * Plaza 5-segment navigation contract tests.
 *
 * PlazaStackNavigator exposes one route per plaza segment (Feed/Skills/
 * Tasks/Pets/Play). If anyone renames the screens or drops a route, the
 * PlazaScreen Segmented control would silently break — this test fails
 * fast to catch that.
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
  const REQUIRED_SEGMENT_ROUTES = [
    'PlazaRoot',
    'Feed',
    'Skills',
    'Tasks',
    'Pets',
    'Play',
  ];

  describe('5-segment core routes', () => {
    it.each(REQUIRED_SEGMENT_ROUTES)('declares <Stack.Screen name="%s">', (name) => {
      expect(hasStackScreen(name)).toBe(true);
    });
  });

  describe('secondary routes wired from segments', () => {
    it.each([
      'Messaging',
      'DirectMessage',
      'GroupChat',
      'SkillDetail',
      'Checkout',
      'SkillInstall',
      'TaskDetail',
      'PostTask',
      'PetsSkins',
      'SkinAuctionDetail',
      'PetAuctionDetail',
      'Predict',
      'CoRaisingInvite',
      'CoRaisingLanding',
      'GreetingCardCompose',
      'GreetingCardInbox',
      'ShareCard',
      'CreateLink',
      'ToyCustom',
    ])('declares <Stack.Screen name="%s">', (name) => {
      expect(hasStackScreen(name)).toBe(true);
    });
  });

  describe('param-list surface', () => {
    it('PlazaStackParamList declares each segment route in types.ts', () => {
      const typesPath = path.resolve(__dirname, '..', 'types.ts');
      const typesSource = fs.readFileSync(typesPath, 'utf8');
      REQUIRED_SEGMENT_ROUTES.forEach((name) => {
        // either "name: undefined" (no-params) or "name: { ... }" is acceptable
        const re = new RegExp(`\\s${name}\\s*:\\s*(undefined|\\{)`);
        expect(re.test(typesSource)).toBe(true);
      });
    });
  });
});
