/**
 * Release version guard (I-014 / E36, REQ-mobile-014, REQ-release-025).
 *
 * The 上线 3 release is 1.4.0 / versionCode 5 (I-046). versionCode only goes
 * up: builds already on phones are 1.1.0 / 1 (download page before 上线 2),
 * 1.2.0 / 2 (factory APK), the 1.3.0 / 3 four-zone preview (CI build 528,
 * debug-signed) and 1.3.0 / 4 (上线 2, on the download page since 09-29,
 * L2 §11 B8), and Android refuses to install a lower code over a higher one. The five places a version lives must agree, as in the 1.2.0
 * release (f75f9ed3): CI runs `expo prebuild` without `--clean`, so the
 * checked-in build.gradle has to match app.json too. `runtimeVersion` moves
 * with the version so an OTA published for an older binary never lands on
 * this one (expo-updates is on).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const expo = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');

const SHIPPED_VERSION_CODES = [1, 2, 3, 4];

describe('release version', () => {
  it('我的 → 设置与隐私 shows the app\'s own version, not a fixed string (owner checklist step 1)', () => {
    const settings = fs.readFileSync(path.join(ROOT, 'src', 'screens', 'me', 'ClawSettingsScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(settings).toContain('Constants.expoConfig?.version');
    // The 应用版本 item, up to its closing brace (REQ-mobile-089 made it several lines: an update offer
    // is shown after the installed version, never instead of it).
    const at = settings.indexOf("id: 'version'");
    expect(at).toBeGreaterThan(0);
    const item = settings.slice(at, settings.indexOf('\n        },', at));
    expect(item).toContain("appVersion ? `v${appVersion}` : ''");
    expect(item).toContain('`v${appVersion} · ');
    expect(item).not.toMatch(/value: '\d/);
    expect(item).not.toMatch(/`v\d/);
  });
  it('app.json, runtimeVersion, iOS build number and build.gradle agree', () => {
    const code = expo.android.versionCode;
    expect(Number.isInteger(code)).toBe(true);
    expect(expo.runtimeVersion).toBe(expo.version);
    expect(expo.ios.buildNumber).toBe(String(code));
    expect(gradle).toMatch(new RegExp(`\\bversionCode ${code}\\b`));
    expect(gradle).toMatch(new RegExp(`\\bversionName "${expo.version.replace(/\./g, '\\.')}"`));
    expect(gradle.match(/\bversionCode \d+/g)).toHaveLength(1);
  });

  it('versionCode is above every shipped build and the version is plain semver', () => {
    expect(expo.android.versionCode).toBeGreaterThan(Math.max(...SHIPPED_VERSION_CODES));
    expect(expo.android.versionCode).toBeGreaterThanOrEqual(5);
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    const [major, minor] = expo.version.split('.').map(Number);
    // 1.3.0 is on phones with runtimeVersion 1.3.0; a new binary needs a new runtimeVersion so no
    // 1.3.0 OTA can land on it (and the reverse).
    expect(major * 100 + minor).toBeGreaterThanOrEqual(104);
  });
});
