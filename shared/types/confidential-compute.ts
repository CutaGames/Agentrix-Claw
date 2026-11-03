/**
 * User-held keys and confidential computing, v0 contract only (L7-6): where the owner's Soul Key lives
 * (`soul-key-envelope.ts` has the envelope itself) and when server-side code may open owner data: never with a
 * user-held key, and with a TEE-sealed key only inside an attested enclave. Counterpart of Muse's Confidential VM.
 * Nothing reads this in v0.
 */

/** Future server switch; nothing reads it in v0. */
export const CONFIDENTIAL_COMPUTE_V0_FLAG = 'CONFIDENTIAL_COMPUTE_V0_ENABLED';

export const SOUL_KEY_CUSTODY_MODES_V0 = ['platform_managed', 'tee_sealed', 'user_held'] as const;
export type SoulKeyCustodyModeV0 = (typeof SOUL_KEY_CUSTODY_MODES_V0)[number];

export const TEE_PLATFORMS_V0 = ['amd_sev_snp', 'intel_tdx', 'aws_nitro'] as const;
export type TeePlatformV0 = (typeof TEE_PLATFORMS_V0)[number];

export interface TeeAttestationV0 {
  platform: TeePlatformV0;
  /** Launch measurement (SHA-384 on all three platforms), lowercase hex. */
  measurement: string;
  /** The verifier's nonce, 32 bytes, lowercase hex. */
  nonce: string;
  issuedAt: string;
}

export const TEE_ATTESTATION_MAX_AGE_MS_V0 = 5 * 60 * 1000;
/** How far ahead of our clock an enclave's timestamp may be. */
export const TEE_ATTESTATION_CLOCK_SKEW_MS_V0 = 30 * 1000;

const HEX96 = /^[0-9a-f]{96}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** Accepts only an allowlisted measurement, our nonce, and a report at most five minutes old. */
export function teeAttestationAcceptableV0(attestation: TeeAttestationV0, allowedMeasurements: readonly string[], expectedNonce: string, nowMs: number): boolean {
  const issued = Date.parse(attestation.issuedAt);
  if (Number.isNaN(issued) || issued - nowMs > TEE_ATTESTATION_CLOCK_SKEW_MS_V0 || nowMs - issued > TEE_ATTESTATION_MAX_AGE_MS_V0) return false;
  return allowedMeasurements.includes(attestation.measurement) && attestation.nonce === expectedNonce;
}

/** Whether server-side code may open owner data under this custody mode. */
export function serverMayOpenOwnerDataV0(custody: SoulKeyCustodyModeV0, attestationAccepted: boolean): boolean {
  if (custody === 'user_held') return false;
  if (custody === 'tee_sealed') return attestationAccepted === true;
  return true;
}

export function decodeTeeAttestationV0(value: unknown): TeeAttestationV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { platform, measurement, nonce, issuedAt } = raw;
  if (typeof platform !== 'string' || !(TEE_PLATFORMS_V0 as readonly string[]).includes(platform)) return null;
  if (typeof measurement !== 'string' || !HEX96.test(measurement) || typeof nonce !== 'string' || !HEX64.test(nonce)) return null;
  if (typeof issuedAt !== 'string' || Number.isNaN(Date.parse(issuedAt))) return null;
  return { platform: platform as TeePlatformV0, measurement, nonce, issuedAt };
}
