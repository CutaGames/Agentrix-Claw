import fs from 'fs';
import path from 'path';
import { MOBILE_M0_ENABLED, MOBILE_M0_NEEDS_YOU_LABEL, MOBILE_M0_TAB_ICONS, mobileM0Enabled } from '../mobileM0';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');

describe('M0 of the phone redesign', () => {
  it('is on only when the build sets exactly 1, and off in this test build', () => {
    expect(mobileM0Enabled('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 1]) expect(mobileM0Enabled(v)).toBe(false);
    expect(MOBILE_M0_ENABLED).toBe(false);
    expect(MOBILE_M0_NEEDS_YOU_LABEL).toEqual({ zh: '需要你', en: 'Needs you' });
  });

  it('every M0 change sits behind the switch: 需要你 first and leading with the decision cards, the QR screen and its button', () => {
    const nav = read('navigation/four-zone/FourZoneTabNavigator.tsx');
    expect(nav).toMatch(/initialRouteName=\{MOBILE_M0_ENABLED \? 'Matters' : 'Companion'\}/);
    expect(nav).toMatch(/title: MOBILE_M0_ENABLED \? t\(MOBILE_M0_NEEDS_YOU_LABEL\) : t\(NAV_CATALOG\.matters\.label\)/);
    expect(nav).toMatch(/\{MOBILE_M0_ENABLED \? <TwinStack\.Screen name="TwinQr"/);
    const matters = read('screens/four-zone/MattersHomeScreen.tsx');
    expect(matters).toMatch(/\{MOBILE_M0_ENABLED \? <NeedsYouSection \/> : null\}/);
    const twin = read('screens/four-zone/TwinHomeScreen.tsx');
    expect(twin).toMatch(/\{MOBILE_M0_ENABLED \? \(\s*<TouchableOpacity[\s\S]*?navigate\('TwinQr'/);
  });

  it('the QR screen only encodes an https link and never opens the web', () => {
    const qr = read('screens/four-zone/TwinQrScreen.tsx');
    expect(qr).toMatch(/\/\^https:\\\/\\\/\/\.test\(params\.link\)/);
    expect(qr).not.toMatch(/Linking\.openURL/);
    const section = read('components/NeedsYouSection.tsx');
    expect(section).not.toMatch(/Linking\.openURL|getTwinWebUrl|openWeb/);
  });

  it('icons, not glyphs: M0 tabs use Ionicons names that exist (filled when focused), and the mic button has no emoji', () => {
    const glyphs = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'), 'utf8'),
    ) as Record<string, number>;
    for (const [tab, icon] of Object.entries(MOBILE_M0_TAB_ICONS)) {
      expect([tab, icon.focused in glyphs, icon.idle in glyphs]).toEqual([tab, true, true]);
      expect(icon.idle).toBe(`${icon.focused}-outline`);
    }
    const nav = read('navigation/four-zone/FourZoneTabNavigator.tsx');
    for (const tab of ['Companion', 'Matters', 'Twin', 'My']) {
      expect(nav).toMatch(new RegExp(`icon=\\{MOBILE_M0_ENABLED \\? MOBILE_M0_TAB_ICONS\\.${tab} : undefined\\}`));
    }
    expect(nav).toMatch(/<Ionicons name=\{\(focused \? icon\.focused : icon\.idle\) as TabIconName\}/);
    const ptt = read('components/GlobalPushToTalk.tsx');
    expect(ptt).toMatch(/<Ionicons name="mic"/);
    expect(ptt).not.toMatch(/🎙/);
  });
});
