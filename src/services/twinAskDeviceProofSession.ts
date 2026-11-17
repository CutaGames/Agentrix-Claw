/**
 * Binds twinAskDeviceProof.ts to this phone: the registered device id (phone enrollment) and the phone key that asks
 * the owner before every signature (phoneDeviceKeyNative.ts). Null when this build has confirming answers off or has no
 * phone key module; the device id is null while this phone has no registered key.
 */
import { readThisPhone } from './phoneDeviceEnrollment';
import { phoneDeviceKeyNative } from './phoneDeviceKeyNative';
import { signWithPhoneKey } from './phoneDeviceKey';
import { TWIN_ASK_DEVICE_PROOF_ENABLED, type TwinAskDeviceProofDeps } from './twinAskDeviceProof';

export async function twinAskDeviceProofDeps(prompt: string): Promise<TwinAskDeviceProofDeps | null> {
  if (!TWIN_ASK_DEVICE_PROOF_ENABLED) return null;
  const native = phoneDeviceKeyNative();
  if (!native) return null;
  const phone = await readThisPhone().catch(() => null);
  return {
    deviceId: phone && phone.registered ? phone.deviceId : null,
    sign: (message) => signWithPhoneKey(native, message, prompt),
  };
}

/** What sending an answer from this phone will do, without asking the owner or the network. */
export async function twinAskDeviceProofReadiness(): Promise<'ready' | 'no_key' | 'off'> {
  if (!TWIN_ASK_DEVICE_PROOF_ENABLED) return 'off';
  if (!phoneDeviceKeyNative()) return 'off';
  const phone = await readThisPhone().catch(() => null);
  return phone && phone.registered && phone.deviceId ? 'ready' : 'no_key';
}
