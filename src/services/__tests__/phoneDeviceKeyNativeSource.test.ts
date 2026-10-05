/**
 * The native device key (modules/agentrix-device-key). Kotlin and Swift do not compile in this repo's jest run
 * or on this machine, so these checks pin the security properties in the checked-in sources; the Claw CI
 * build compiles them.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) =>
  fs
    .readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
const MODULE = 'modules/agentrix-device-key';
const kotlin = read(`${MODULE}/android/src/main/java/app/agentrix/devicekey/AgentrixDeviceKeyModule.kt`);
const swift = read(`${MODULE}/ios/AgentrixDeviceKeyModule.swift`);
const adapter = read('src/services/phoneDeviceKeyNative.ts');

describe('the module is wired under one name', () => {
  it('config, Kotlin, Swift and the JS adapter agree', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, MODULE, 'expo-module.config.json'), 'utf8'));
    expect(config.android.modules).toEqual(['app.agentrix.devicekey.AgentrixDeviceKeyModule']);
    expect(config.ios.modules).toEqual(['AgentrixDeviceKeyModule']);
    expect(kotlin).toMatch(/^package app\.agentrix\.devicekey$/m);
    expect(kotlin).toMatch(/class AgentrixDeviceKeyModule : Module\(\)/);
    expect(swift).toMatch(/public class AgentrixDeviceKeyModule: Module/);
    for (const src of [kotlin, swift]) {
      expect(src).toMatch(/Name\("AgentrixDeviceKey"\)/);
      for (const fn of ['getPublicKey', 'createKey', 'sign']) expect(src).toMatch(new RegExp(`AsyncFunction(<[^\\n]*?>)?\\("${fn}"\\)`));
    }
    expect(adapter).toMatch(/requireOptionalNativeModule<AgentrixDeviceKeyModuleV1>\('AgentrixDeviceKey'\)/);
    // No new third-party libraries: platform APIs and the existing expo modules only.
    const gradle = fs.readFileSync(path.join(ROOT, MODULE, 'android/build.gradle'), 'utf8');
    expect(gradle).not.toMatch(/^\s*(implementation|api)\s/m);
    const podspec = fs.readFileSync(path.join(ROOT, MODULE, 'ios/AgentrixDeviceKey.podspec'), 'utf8');
    expect(podspec.match(/s\.dependency\s+'([^']+)'/g)).toEqual(["s.dependency 'ExpoModulesCore'"]);
  });
});

describe('Android Keystore key', () => {
  it('P-256, sign only, SHA-256, needs the owner within a short window, never exported', () => {
    expect(kotlin).toMatch(/KeyGenParameterSpec\.Builder\(ALIAS, KeyProperties\.PURPOSE_SIGN\)/);
    expect(kotlin).not.toMatch(/PURPOSE_(ENCRYPT|DECRYPT|AGREE_KEY|WRAP_KEY)/);
    expect(kotlin).toMatch(/ECGenParameterSpec\("secp256r1"\)/);
    expect(kotlin).toMatch(/setDigests\(KeyProperties\.DIGEST_SHA256\)/);
    expect(kotlin).toMatch(/setUserAuthenticationRequired\(true\)/);
    expect(kotlin).not.toMatch(/setUserAuthenticationRequired\(false\)/);
    expect(kotlin).toMatch(/AUTH_BIOMETRIC_STRONG or KeyProperties\.AUTH_DEVICE_CREDENTIAL/);
    expect(kotlin).not.toMatch(/AUTH_BIOMETRIC_WEAK|BIOMETRIC_WEAK/);
    expect(kotlin).not.toMatch(/setInvalidatedByBiometricEnrollment\(false\)/);
    const window = Number(kotlin.match(/AUTH_WINDOW_SECONDS = (\d+)/)?.[1]);
    expect(window).toBeGreaterThan(0);
    expect(window).toBeLessThanOrEqual(30);
    expect(kotlin).toMatch(/KeyPairGenerator\.getInstance\(KeyProperties\.KEY_ALGORITHM_EC, KEYSTORE\)/);
    // The private key is only ever used, never read out; nothing is logged.
    expect(kotlin).not.toMatch(/\.encoded\b|getEncoded\(/);
    expect(kotlin).not.toMatch(/\bLog\.|println\(/);
    expect(kotlin).toMatch(/Signature\.getInstance\("SHA256withECDSA"\)/);
    expect(kotlin).toMatch(/message\.toByteArray\(Charsets\.UTF_8\)/);
  });

  it('a failed StrongBox attempt falls back to the TEE only, never to a software key', () => {
    expect(kotlin).toMatch(/setIsStrongBoxBacked\(true\)/);
    const generators = kotlin.match(/KeyPairGenerator\.getInstance\([^)]*\)/g) ?? [];
    expect(generators.length).toBeGreaterThan(0);
    for (const call of generators) expect(call).toContain('KEYSTORE');
    expect(kotlin).not.toMatch(/getInstance\("EC"\)|"BC"|SpongyCastle|BouncyCastle/);
  });
});

describe('Secure Enclave key', () => {
  it('only in the Secure Enclave, every use asks the owner, only while a passcode is set', () => {
    expect(swift).toMatch(/kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave/);
    expect(swift).toMatch(/\[\.privateKeyUsage, \.userPresence\]/);
    expect(swift).toMatch(/kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly/);
    expect(swift).not.toMatch(/kSecAttrAccessibleAlways|AfterFirstUnlock(?!ThisDeviceOnly)/);
    expect(swift).toMatch(/kSecAttrKeySizeInBits as String: 256/);
    expect(swift).toMatch(/\.ecdsaSignatureMessageX962SHA256/);
    // One way to create a key, and it carries the Secure Enclave token.
    expect(swift.match(/SecKeyCreateRandomKey\(/g)).toHaveLength(1);
    expect(swift).toMatch(/secure_enclave_unavailable/);
    expect(swift).not.toMatch(/\bprint\(|NSLog\(/);
  });
});

describe('the JS adapter', () => {
  it('is off unless the build asks for it, and Android asks the owner before signing', () => {
    expect(adapter).toMatch(/PHONE_DEVICE_KEY_ENABLED = process\.env\.EXPO_PUBLIC_PHONE_DEVICE_KEY === '1'/);
    expect(adapter).toMatch(/if \(!PHONE_DEVICE_KEY_ENABLED/);
    expect(adapter).toMatch(/biometricsSecurityLevel: 'strong'/);
    expect(adapter).toMatch(/if \(!result\.success\) throw/);
    const reuse = Number(adapter.match(/ANDROID_REUSE_AUTH_MS = ([\d_]+)/)?.[1].replace(/_/g, ''));
    const window = Number(kotlin.match(/AUTH_WINDOW_SECONDS = (\d+)/)?.[1]) * 1000;
    expect(reuse).toBeGreaterThan(0);
    expect(reuse).toBeLessThan(window);
  });
});
