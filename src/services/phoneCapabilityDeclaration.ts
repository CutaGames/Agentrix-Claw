/**
 * phoneCapabilityDeclaration — this phone's capability declaration, signed with its P-256 device key and
 * uploaded (L5 B2 phone, `DEVICE_MESH_ROUTES_V0.declare`, contract `device-capability.ts` sections 2 and 6).
 *
 * - What the phone declares: the three `owner_presence` types (`notify.push.v1` when a push token is
 *   registered, `approve.owner.v1` once enrolled, `key.sign.v1` only with a hardware-backed key) and, only
 *   while the app is in the foreground, the `personal_sensor` types the OS has granted (contract 6 b).
 * - The signature is the enrolled E32 key over `deviceCapabilityDeclarationMessageV0` (five lines, the digest
 *   of the canonical declaration), P1363 base64url. That key asks the owner every time, so uploads are an
 *   explicit owner action; the separate no-verification declaration key (contract 6 a) needs native work.
 * - Off unless the build sets `EXPO_PUBLIC_DEVICE_MESH_ENABLED=1` and the server's switch table
 *   (`GET /api/device-mesh/config`, read with the contract decoder; unreadable or stale means off) has
 *   `DEVICE_MESH_V0_ENABLED=1`. A rejected upload is reported with its status and code, never retried.
 * No React Native import: the native key and the HTTP calls are injected.
 */
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS,
  DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION,
  DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0,
  decodeDeviceCapabilityDeclarationV0,
  decodeDeviceMeshConfigV0,
  deviceCapabilityDeclarationDigestV0,
  deviceCapabilityDeclarationMessageV0,
  type DeviceCapabilityDeclarationV0,
  type DeviceCapabilityItemV0,
  type DeviceMeshConfigV0,
} from '../../shared/types/device-capability';
import { PhoneDeviceKeyError, signWithPhoneKey, type PhoneDeviceKeyNativeV1 } from './phoneDeviceKey';

export const PHONE_DEVICE_MESH_SERVER_FLAG = 'DEVICE_MESH_V0_ENABLED';

/** The sensors the phone may declare, and only in the foreground. */
export const PHONE_SENSOR_TYPES = ['sensor.location.v1', 'sensor.camera.v1', 'sensor.microphone.v1'] as const;
export type PhoneSensorType = (typeof PHONE_SENSOR_TYPES)[number];

export interface PhoneDeclarationInput {
  deviceId: string;
  /** The E32 `keyRef` from enrollment; null until the phone is registered. */
  credentialRef: string | null;
  shellBinding: { id: string; version: number } | null;
  /** A fresh UUID v4 per declaration. */
  declarationId: string;
  now: Date;
  pushReachable: boolean;
  hardwareKey: boolean;
  foreground: boolean;
  grantedSensors?: readonly PhoneSensorType[];
  onPower?: boolean | null;
  ttlSeconds?: number;
}

export type PhoneDeclarationResult =
  | { ok: true; declaration: DeviceCapabilityDeclarationV0 }
  | { ok: false; reason: 'not_enrolled' | 'no_shell_binding' | 'invalid' };

function isoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

const presence = (type: string, available: boolean): DeviceCapabilityItemV0 => ({
  type,
  category: 'owner_presence',
  state: available ? 'available' : 'unavailable',
  limits: {},
});

export function buildPhoneCapabilityDeclaration(input: PhoneDeclarationInput): PhoneDeclarationResult {
  if (!input.credentialRef) return { ok: false, reason: 'not_enrolled' };
  if (!input.shellBinding) return { ok: false, reason: 'no_shell_binding' };
  const ttl = Math.min(Math.max(input.ttlSeconds ?? DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS, 60), DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS);
  const observed = new Date(Math.floor(input.now.getTime() / 1000) * 1000);
  const sensors = input.foreground
    ? PHONE_SENSOR_TYPES.filter((type) => input.grantedSensors?.includes(type)).map(
        (type): DeviceCapabilityItemV0 => ({ type, category: 'personal_sensor', state: 'available', limits: {} }),
      )
    : [];
  const declaration: DeviceCapabilityDeclarationV0 = {
    schemaVersion: DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION,
    declarationId: input.declarationId,
    deviceId: input.deviceId,
    kind: 'mobile',
    shellBindingRef: { type: 'shell_session_binding', id: input.shellBinding.id, version: input.shellBinding.version },
    attestedBy: 'device_key',
    signerRef: input.credentialRef,
    items: [
      presence('notify.push.v1', input.pushReachable),
      presence('approve.owner.v1', true),
      presence('key.sign.v1', input.hardwareKey),
      ...sensors,
    ],
    conditions: { onPower: input.onPower ?? null, thermalOk: null, idle: null, foreground: input.foreground },
    observedAt: isoSeconds(observed),
    expiresAt: isoSeconds(new Date(observed.getTime() + ttl * 1000)),
  };
  return decodeDeviceCapabilityDeclarationV0(declaration, input.now).ok ? { ok: true, declaration } : { ok: false, reason: 'invalid' };
}

export interface PhoneCapabilityUploadDeps {
  /** `process.env.EXPO_PUBLIC_DEVICE_MESH_ENABLED === '1'`. */
  localEnabled: boolean;
  nowMs: () => number;
  getJson: (path: string) => Promise<{ status: number; body: unknown }>;
  postJson: (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;
  native: PhoneDeviceKeyNativeV1;
  /** What the owner sees when the key asks. */
  prompt: string;
}

export type PhoneCapabilityUploadResult =
  | { ok: true; expiresAt: string; replayed: boolean }
  | { ok: false; reason: 'off' | 'user_cancelled' | 'sign_failed' | 'network' | 'rejected'; status?: number; code?: string | null };

export async function readPhoneDeviceMeshConfig(deps: Pick<PhoneCapabilityUploadDeps, 'getJson' | 'nowMs'>): Promise<DeviceMeshConfigV0 | null> {
  try {
    const response = await deps.getJson('/device-mesh/config');
    return response.status === 200 ? decodeDeviceMeshConfigV0(response.body, deps.nowMs()) : null;
  } catch {
    return null;
  }
}

export async function uploadPhoneCapabilityDeclaration(
  declaration: DeviceCapabilityDeclarationV0,
  deps: PhoneCapabilityUploadDeps,
): Promise<PhoneCapabilityUploadResult> {
  if (!deps.localEnabled) return { ok: false, reason: 'off' };
  const config = await readPhoneDeviceMeshConfig(deps);
  if (config?.flags[PHONE_DEVICE_MESH_SERVER_FLAG] !== '1') return { ok: false, reason: 'off' };

  const digest = deviceCapabilityDeclarationDigestV0(declaration);
  const message = deviceCapabilityDeclarationMessageV0({
    deviceId: declaration.deviceId,
    declarationId: declaration.declarationId,
    digest,
    observedAt: declaration.observedAt,
  });
  let signature: string;
  try {
    signature = await signWithPhoneKey(deps.native, message, deps.prompt);
  } catch (error) {
    return { ok: false, reason: error instanceof PhoneDeviceKeyError && error.code === 'user_cancelled' ? 'user_cancelled' : 'sign_failed' };
  }
  if (!DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0.test(signature)) return { ok: false, reason: 'sign_failed' };

  let response: { status: number; body: unknown };
  try {
    response = await deps.postJson(`/devices/${encodeURIComponent(declaration.deviceId)}/capabilities`, { declaration, signature });
  } catch {
    return { ok: false, reason: 'network' };
  }
  const body = (response.body ?? {}) as { expiresAt?: unknown; replayed?: unknown };
  if (response.status === 200 && typeof body.expiresAt === 'string') return { ok: true, expiresAt: body.expiresAt, replayed: body.replayed === true };
  return { ok: false, reason: 'rejected', status: response.status, code: parseApiErrorBodyV1(response.body).code };
}
