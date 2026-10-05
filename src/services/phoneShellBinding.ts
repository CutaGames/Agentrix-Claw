/**
 * phoneShellBinding — the shell binding a phone capability declaration has to name (L5 B2 phone; without it every
 * declaration stopped at `no_shell_binding`). `POST /api/soul-shell/bindings/handshake` creates one
 * ShellSessionBindingV1 (shared/types/shell-session-binding.ts); the device mesh only accepts a declaration that
 * names an active binding of the same owner, device and Agent (backend device-capability.service.ts).
 *
 * - Asked for with shell `mobile`, shell id `agentrix-mobile-<device id>`, the enrolled device id and its E32
 *   credential as the signer (the server checks that credential is this owner's, on this device; nothing is signed,
 *   so the owner is not asked) and no capabilities, so never a wallet session. No lifetime is sent: the server's
 *   default is 15 minutes, the same as a declaration's.
 * - A kept binding is reused only for the same device, key and Agent and while it has two minutes left.
 * - The answer must pass the shared validator and match what was asked (device, key, shell id, active, not expired,
 *   `shellSessionRef` = the binding); anything else is unreadable and nothing is kept. 404 is the server's
 *   `SOUL_SHELL_PROTOCOL_ENABLED` being off, or an Agent that is not the caller's.
 * No React Native import: the HTTP call, the store and the clock are injected.
 */
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import { SHELL_SESSION_BINDING_SCHEMA_VERSION, validateShellSessionBindingV1 } from '../../shared/types/shell-session-binding';

export const PHONE_SHELL_BINDING_PATH = '/soul-shell/bindings/handshake';
export const PHONE_SHELL_KIND = 'mobile' as const;
export const PHONE_SHELL_BINDING_MIN_REMAINING_MS = 2 * 60 * 1000;

const SAFE_ID = /^[0-9a-zA-Z_-]{8,80}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SIGNER_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PhoneShellBindingRequestV1 {
  schemaVersion: typeof SHELL_SESSION_BINDING_SCHEMA_VERSION;
  agentAccountId: string;
  shell: typeof PHONE_SHELL_KIND;
  shellId: string;
  capabilities: Record<string, never>;
  deviceId: string;
  signerRef: string;
}

/** What the phone keeps, and what a declaration names (`id`, `version`). */
export interface PhoneShellBindingV1 {
  id: string;
  version: number;
  agentAccountId: string;
  deviceId: string;
  keyRef: string;
  expiresAt: string;
}

export interface PhoneShellBindingStoreV1 {
  load(): Promise<unknown>;
  save(binding: PhoneShellBindingV1): Promise<void>;
  clear(): Promise<void>;
}

export interface PhoneShellBindingInput {
  agentAccountId: string;
  deviceId: string;
  credentialRef: string;
}

export interface PhoneShellBindingDepsV1 {
  postJson: (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;
  store: PhoneShellBindingStoreV1;
  nowMs: () => number;
}

export type PhoneShellBindingResult =
  | { ok: true; binding: PhoneShellBindingV1; reused: boolean }
  | { ok: false; reason: 'invalid' | 'closed' | 'network' | 'unreadable' }
  | { ok: false; reason: 'rejected'; status: number; code: string | null };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function phoneShellId(deviceId: string): string {
  return `agentrix-mobile-${deviceId}`;
}

export function buildPhoneShellBindingRequest(input: PhoneShellBindingInput): PhoneShellBindingRequestV1 | null {
  if (!SAFE_ID.test(input.agentAccountId) || !SIGNER_REF.test(input.credentialRef)) return null;
  const shellId = phoneShellId(input.deviceId);
  if (!OPAQUE_ID.test(input.deviceId) || !OPAQUE_ID.test(shellId)) return null;
  return {
    schemaVersion: SHELL_SESSION_BINDING_SCHEMA_VERSION,
    agentAccountId: input.agentAccountId,
    shell: PHONE_SHELL_KIND,
    shellId,
    capabilities: {},
    deviceId: input.deviceId,
    signerRef: input.credentialRef,
  };
}

/** `{ success, data: { schemaVersion: 1, binding, shellSessionRef } }` for exactly what was asked; anything else is null. */
export function decodePhoneShellBindingAnswer(body: unknown, asked: PhoneShellBindingRequestV1, nowMs: number): PhoneShellBindingV1 | null {
  const data = record(record(body)?.data);
  const binding = record(data?.binding);
  const ref = record(data?.shellSessionRef);
  if (!data || !binding || !ref || data.schemaVersion !== SHELL_SESSION_BINDING_SCHEMA_VERSION) return null;
  if (!validateShellSessionBindingV1(binding, { now: new Date(nowMs).toISOString() }).valid) return null;
  if (
    binding.status !== 'active'
    || typeof binding.bindingId !== 'string' || !UUID.test(binding.bindingId)
    || binding.deviceId !== asked.deviceId
    || binding.keyRef !== asked.signerRef
    || binding.shellId !== asked.shellId
  ) return null;
  if (ref.type !== 'shell_session_binding' || ref.id !== binding.bindingId || ref.version !== binding.bindingVersion) return null;
  return {
    id: binding.bindingId,
    version: binding.bindingVersion as number,
    agentAccountId: asked.agentAccountId,
    deviceId: asked.deviceId,
    keyRef: asked.signerRef,
    expiresAt: binding.expiresAt as string,
  };
}

export function decodeStoredPhoneShellBinding(value: unknown): PhoneShellBindingV1 | null {
  const kept = record(value);
  if (!kept || typeof kept.id !== 'string' || !UUID.test(kept.id)) return null;
  if (!Number.isInteger(kept.version) || (kept.version as number) < 1) return null;
  if (typeof kept.agentAccountId !== 'string' || typeof kept.deviceId !== 'string' || typeof kept.keyRef !== 'string') return null;
  if (typeof kept.expiresAt !== 'string' || !Number.isFinite(Date.parse(kept.expiresAt))) return null;
  return {
    id: kept.id,
    version: kept.version as number,
    agentAccountId: kept.agentAccountId,
    deviceId: kept.deviceId,
    keyRef: kept.keyRef,
    expiresAt: kept.expiresAt,
  };
}

/** The kept binding when it still fits, otherwise a new one from the server (kept for next time). */
export async function ensurePhoneShellBinding(input: PhoneShellBindingInput, deps: PhoneShellBindingDepsV1): Promise<PhoneShellBindingResult> {
  const asked = buildPhoneShellBindingRequest(input);
  if (!asked) return { ok: false, reason: 'invalid' };
  const kept = decodeStoredPhoneShellBinding(await deps.store.load().catch(() => null));
  if (
    kept
    && kept.agentAccountId === asked.agentAccountId
    && kept.deviceId === asked.deviceId
    && kept.keyRef === asked.signerRef
    && Date.parse(kept.expiresAt) - deps.nowMs() >= PHONE_SHELL_BINDING_MIN_REMAINING_MS
  ) {
    return { ok: true, binding: kept, reused: true };
  }

  let response: { status: number; body: unknown };
  try {
    response = await deps.postJson(PHONE_SHELL_BINDING_PATH, asked);
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.status === 404) return { ok: false, reason: 'closed' };
  if (response.status !== 200 && response.status !== 201) {
    return { ok: false, reason: 'rejected', status: response.status, code: parseApiErrorBodyV1(response.body).code };
  }
  const binding = decodePhoneShellBindingAnswer(response.body, asked, deps.nowMs());
  if (!binding) return { ok: false, reason: 'unreadable' };
  await deps.store.save(binding).catch(() => undefined);
  return { ok: true, binding, reused: false };
}
