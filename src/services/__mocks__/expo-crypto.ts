/**
 * Jest mock for `expo-crypto` (the native module cannot load outside React Native). Only the subset the
 * services use; random bytes come from Node's CSPRNG, like the real module on a device.
 */
import { randomBytes } from 'crypto';

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return new Uint8Array(randomBytes(byteCount));
}

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}
