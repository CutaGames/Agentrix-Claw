/**
 * Yowo Gadget firmware GA, v0 contract only (L7-1): what a board must prove before it is certified (Secure Boot,
 * encrypted NVS, a device key) and the signed over-the-air update manifest. It waits for the development boards
 * (OA-107), G0 / G1 feedback and the lawyer (Apache 2.0 notice), so nothing reads this in v0. The board checks the
 * signature with the pinned release key; this contract fixes the shape and the no-downgrade rule.
 */

/** Future server switch; nothing reads it in v0. */
export const GADGET_FIRMWARE_V0_FLAG = 'GADGET_FIRMWARE_V0_ENABLED';

export const GADGET_FIRMWARE_CHANNELS_V0 = ['stable', 'beta'] as const;
export type GadgetFirmwareChannelV0 = (typeof GADGET_FIRMWARE_CHANNELS_V0)[number];

export const GADGET_FIRMWARE_MAX_BYTES_V0 = 16 * 1024 * 1024;

/** What a board reports about itself when it asks to be certified. */
export interface GadgetBoardSecurityReportV0 {
  boardId: string;
  secureBoot: boolean;
  nvsEncrypted: boolean;
  /** SHA-256 of the device public key, lowercase hex; null when the board has no device key. */
  deviceKeyThumbprint: string | null;
}

export interface GadgetFirmwareManifestV0 {
  boardModel: string;
  version: string;
  /** A board below this version must install it first, so the rollback counter only moves forward. */
  minVersion: string | null;
  channel: GadgetFirmwareChannelV0;
  sizeBytes: number;
  sha256: string;
  /** Release key id and Ed25519 signature (base64url) over the manifest without `signature`. */
  keyId: string;
  signature: string;
}

const ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const SEMVER = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ED25519_SIG = /^[A-Za-z0-9_-]{86}$/;

/** -1, 0 or 1; null when either side is not x.y.z. */
export function compareGadgetVersionsV0(a: string, b: string): number | null {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) {
    const d = Number(x[i]) - Number(y[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Certified only with Secure Boot on, NVS encrypted and a device key. */
export function gadgetBoardCertifiableV0(report: GadgetBoardSecurityReportV0): boolean {
  const thumbprint = report.deviceKeyThumbprint;
  return report.secureBoot === true && report.nvsEncrypted === true && typeof thumbprint === 'string' && HEX64.test(thumbprint);
}

/** Installs only when newer than the running version and the board is at or above `minVersion`. */
export function gadgetFirmwareUpdateAllowedV0(runningVersion: string, manifest: GadgetFirmwareManifestV0): boolean {
  const newer = compareGadgetVersionsV0(manifest.version, runningVersion);
  if (newer === null || newer <= 0) return false;
  if (manifest.minVersion === null) return true;
  const floor = compareGadgetVersionsV0(runningVersion, manifest.minVersion);
  return floor !== null && floor >= 0;
}

export function decodeGadgetFirmwareManifestV0(value: unknown): GadgetFirmwareManifestV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { boardModel, version, minVersion, channel, sizeBytes, sha256, keyId, signature } = raw;
  if (typeof boardModel !== 'string' || !ID.test(boardModel) || typeof keyId !== 'string' || !ID.test(keyId)) return null;
  if (typeof version !== 'string' || !SEMVER.test(version)) return null;
  let floor: string | null = null;
  if (minVersion !== null && minVersion !== undefined) {
    if (typeof minVersion !== 'string' || !SEMVER.test(minVersion)) return null;
    const order = compareGadgetVersionsV0(minVersion, version);
    if (order === null || order > 0) return null;
    floor = minVersion;
  }
  if (typeof channel !== 'string' || !(GADGET_FIRMWARE_CHANNELS_V0 as readonly string[]).includes(channel)) return null;
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > GADGET_FIRMWARE_MAX_BYTES_V0) return null;
  if (typeof sha256 !== 'string' || !HEX64.test(sha256)) return null;
  if (typeof signature !== 'string' || !ED25519_SIG.test(signature)) return null;
  return { boardModel, version, minVersion: floor, channel: channel as GadgetFirmwareChannelV0, sizeBytes, sha256, keyId, signature };
}
