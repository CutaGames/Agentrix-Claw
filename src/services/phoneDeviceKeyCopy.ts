/**
 * What 我的 → 设备 → 这台手机 says (phoneDeviceKey.ts, modules/agentrix-device-key). No React Native import,
 * so a test can check that every error code the key and the enrollment can raise has words.
 */
import type { PhoneKeyHardwareV1 } from './phoneDeviceKey';

export type PhoneKeyCopyV1 = { zh: string; en: string };

export const PHONE_DEVICE_KEY_COPY = {
  section: { zh: '这台手机', en: 'This phone' },
  explain: {
    zh: '登记以后，这台手机有一把只存在手机安全芯片里的钥匙，用来证明"是你的这台手机"。每次用钥匙都要你本人确认（指纹、面容或锁屏密码）。现在只用来登记设备，不能替你批准任何事。',
    en: 'Once registered, this phone has a key that stays in its secure hardware and proves "this is your phone". Every use asks you (fingerprint, face or the screen lock). For now it only registers the device; it cannot approve anything for you.',
  },
  enroll: { zh: '把这台手机登记为你的设备', en: 'Register this phone as your device' },
  enrolling: { zh: '正在登记…', en: 'Registering…' },
  enrolled: { zh: '已登记为你的设备', en: 'Registered as your device' },
  prompt: { zh: '确认把这台手机登记为你的设备', en: 'Confirm registering this phone as your device' },
  thisPhone: { zh: '这台手机', en: 'This phone' },
  failedTitle: { zh: '没有登记成功', en: 'Not registered' },
} as const;

export const PHONE_KEY_HARDWARE_COPY: Readonly<Record<PhoneKeyHardwareV1, PhoneKeyCopyV1>> = {
  strongbox: { zh: '钥匙在独立安全芯片里', en: 'Key in a separate security chip' },
  tee: { zh: '钥匙在手机的安全区里', en: "Key in the phone's secure area" },
  secure_enclave: { zh: '钥匙在安全隔区里', en: 'Key in the Secure Enclave' },
  software: { zh: '钥匙不在安全硬件里', en: 'Key not in secure hardware' },
  unknown: { zh: '钥匙所在的位置读不出来', en: 'Where the key is could not be read' },
};

/** Every code phoneDeviceKey.ts and the native module can raise. */
export const PHONE_DEVICE_KEY_ERROR_COPY: Readonly<Record<string, PhoneKeyCopyV1>> = {
  user_cancelled: { zh: '你取消了确认。', en: 'You cancelled the confirmation.' },
  no_lock_screen: { zh: '请先给手机设置锁屏密码，再登记。', en: 'Set a screen lock on this phone first.' },
  key_not_hardware_backed: { zh: '这台手机没有可用的安全硬件，不能登记。', en: 'This phone has no usable secure hardware.' },
  secure_enclave_unavailable: { zh: '这台设备没有安全隔区，不能登记。', en: 'This device has no Secure Enclave.' },
  key_invalidated: { zh: '手机的指纹或面容有变化，原来的钥匙已失效，请重新登记。', en: 'The fingerprints or face on this phone changed; register again with a new key.' },
  user_not_authenticated: { zh: '确认已过期，请再试一次。', en: 'The confirmation timed out. Try again.' },
  network: { zh: '连不上 Agentrix，请检查网络后重试。', en: 'Could not reach Agentrix. Check the network and try again.' },
  pair_ticket_rejected: { zh: '服务器没有给出配对票据，请重新登录后再试。', en: 'The server gave no pairing ticket. Sign in again and retry.' },
  pair_rejected: { zh: '服务器没有接受配对。', en: 'The server did not accept the pairing.' },
  pair_device_mismatch: { zh: '服务器返回的设备和这台手机对不上，已停止。', en: "The server's device does not match this phone; stopped." },
  devices_rejected: { zh: '读不到你的设备列表，请稍后再试。', en: 'Could not read your devices. Try again later.' },
  device_not_owned: { zh: '这台手机不在你的设备列表里，已停止。', en: 'This phone is not in your devices; stopped.' },
  signer_rejected: { zh: '服务器没有接受这把钥匙。', en: 'The server did not accept the key.' },
  signer_mismatch: { zh: '服务器登记的钥匙不是这台手机的，已停止。', en: "The server's key is not this phone's; stopped." },
  unexpected_response: { zh: '服务器的回答看不懂，已停止。', en: 'The server answer could not be read; stopped.' },
  signature_invalid: { zh: '钥匙的签名格式不对，已停止。', en: 'The key signature was malformed; stopped.' },
  sign_failed: { zh: '钥匙没能签名，请再试一次。', en: 'The key could not sign. Try again.' },
  key_invalid: { zh: '钥匙的公钥格式不对，已停止。', en: 'The public key was malformed; stopped.' },
  key_unavailable: { zh: '手机的钥匙用不了，请稍后再试。', en: 'The key on this phone is not available. Try again later.' },
  no_key: { zh: '这台手机还没有钥匙。', en: 'This phone has no key yet.' },
  unavailable: { zh: '这个版本还不能登记手机。', en: 'This version cannot register the phone.' },
};

export function phoneDeviceKeyErrorText(code: unknown): PhoneKeyCopyV1 {
  return (typeof code === 'string' && PHONE_DEVICE_KEY_ERROR_COPY[code]) || { zh: '没有登记成功，请稍后再试。', en: 'Not registered. Try again later.' };
}
