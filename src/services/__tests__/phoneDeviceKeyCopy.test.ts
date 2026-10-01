/**
 * 这台手机 has words for every error the key and the enrollment can raise (phoneDeviceKeyCopy.ts), in both
 * languages, and the screen only shows the section when the native key is there.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { PHONE_DEVICE_KEY_COPY, PHONE_DEVICE_KEY_ERROR_COPY, PHONE_KEY_HARDWARE_COPY, phoneDeviceKeyErrorText } from '../phoneDeviceKeyCopy';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function raisedCodes(): Set<string> {
  const codes = new Set<string>();
  const add = (text: string, pattern: RegExp) => {
    for (const m of text.matchAll(pattern)) codes.add(m[1]);
  };
  add(read('src/services/phoneDeviceKey.ts'), /fail\('([a-z_]+)'\)/g);
  add(read('src/services/phoneDeviceKey.ts'), /new PhoneDeviceKeyError\((?:[^'()]*\? )?'([a-z_]+)'/g);
  add(read('src/services/phoneDeviceKey.ts'), /: '([a-z_]+)'\);/g);
  add(read('src/services/phoneDeviceEnrollment.ts'), /new PhoneDeviceKeyError\('([a-z_]+)'\)/g);
  add(read('src/services/phoneDeviceKeyNative.ts'), /code: '([a-z_]+)'/g);
  add(read('modules/agentrix-device-key/android/src/main/java/app/agentrix/devicekey/AgentrixDeviceKeyModule.kt'), /DeviceKeyException\("([a-z_]+)"/g);
  add(read('modules/agentrix-device-key/ios/AgentrixDeviceKeyModule.swift'), /DeviceKeyError\(code: "([a-z_]+)"/g);
  return codes;
}

describe('error words', () => {
  it('every raised code has text in both languages', () => {
    const codes = raisedCodes();
    expect(codes.size).toBeGreaterThan(15);
    for (const code of codes) {
      expect([code, PHONE_DEVICE_KEY_ERROR_COPY[code]?.zh?.length > 0 && PHONE_DEVICE_KEY_ERROR_COPY[code]?.en?.length > 0]).toEqual([code, true]);
    }
  });

  it('an unknown code still says something', () => {
    expect(phoneDeviceKeyErrorText('nope').zh.length).toBeGreaterThan(0);
    expect(phoneDeviceKeyErrorText(undefined).en.length).toBeGreaterThan(0);
  });

  it('every hardware kind and every label has both languages; the explanation does not promise approvals', () => {
    for (const copy of [...Object.values(PHONE_KEY_HARDWARE_COPY), ...Object.values(PHONE_DEVICE_KEY_COPY)]) {
      expect(copy.zh.length).toBeGreaterThan(0);
      expect(copy.en.length).toBeGreaterThan(0);
    }
    expect(PHONE_DEVICE_KEY_COPY.explain.zh).toContain('不能替你批准');
  });
});

describe('the screen', () => {
  const screen = read('src/screens/four-zone/MyDevicesScreen.tsx');
  it('shows 这台手机 only when the native key is available, and labels its own row', () => {
    expect(screen).toMatch(/\{thisPhone\.data\?\.available \? \(/);
    expect(screen).toMatch(/device\.deviceId === thisPhoneId \?/);
    expect(screen).toMatch(/enrollThisPhone\(t\(PHONE_DEVICE_KEY_COPY\.prompt\)\)/);
    expect(screen).toMatch(/invalidateQueries\(\{ queryKey: registryKey \}\)/);
  });
});
