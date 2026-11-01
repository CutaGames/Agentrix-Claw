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

// ── Signed OTA manifest v1 (L8 batch 4, lane 4B hw, B5; the Gadget GA of D1 uses the same message) ────────────────────
//
// The ClawCore OTA service (`device-registry/ota.service.ts`) used to serve a manifest with only a SHA-256. With
// `OTA_SIGNED_MANIFEST_V1_ENABLED` = '1' it also serves an Ed25519 signature over the message below, and a device (the
// simulator in `packages/device-simulator/`, a real board later) installs only when the signature verifies against a key
// id it has pinned AND the version is strictly newer than both the running version and the highest version it ever
// accepted (the anti-rollback counter). No downgrade, no same-version re-install, no unsigned manifest.
//
// Key: the server reads one Ed25519 private key from `OTA_MANIFEST_SIGNING_KEY` (PKCS#8 PEM; a literal `\n` in an env
// file is accepted). Not configured = it refuses to publish (no other key, never `JWT_SECRET`); a package already signed is still served as stored and the device decides with the key it pinned.
// Key id = `ota-` + first 16 hex characters of SHA-256 of the 32 raw public-key bytes, so rotating the key changes the id.
// Signature = Ed25519 over the UTF-8 bytes of `otaManifestSigningMessageV1`, base64url without padding (86 characters).

/** Server switch. Exactly '1' turns it on; off, the OTA service behaves as before (unsigned manifest). */
export const OTA_SIGNED_MANIFEST_V1_FLAG = 'OTA_SIGNED_MANIFEST_V1_ENABLED';
export const OTA_MANIFEST_SIGNING_KEY_ENV_V1 = 'OTA_MANIFEST_SIGNING_KEY';
export const OTA_MANIFEST_SIGNATURE_DOMAIN_V1 = 'agentrix.ota.manifest.v1' as const;

export const OTA_MANIFEST_REASON_CODES_V1 = [
  'unsupported_shape',
  'unknown_field',
  'missing_field',
  'invalid_value',
  'signature_invalid',
  'unknown_key',
  'version_invalid',
  'same_version',
  'downgrade_refused',
  'min_version_not_met',
  'signing_key_not_configured',
  'signing_key_invalid',
  'unsigned_package',
] as const;
export type OtaManifestReasonCodeV1 = (typeof OTA_MANIFEST_REASON_CODES_V1)[number];

/** The fields the signature covers. `minVersion` null is signed as an empty line. */
export interface OtaSignedManifestFieldsV1 {
  deviceClass: string;
  version: string;
  minVersion: string | null;
  channel: string;
  sizeBytes: number;
  sha256: string;
  keyId: string;
}

/** The manifest as `GET /v1/ota/manifest` serves it with the switch on (snake_case like the unsigned one). */
export interface OtaSignedManifestWireV1 {
  package_id: string;
  device_class: string;
  version: string;
  min_version: string | null;
  channel: string;
  size_bytes: number;
  sha256: string;
  chunk_size: number;
  chunk_count: number;
  mandatory: boolean;
  key_id: string;
  signature: string;
}

const OTA_DEVICE_CLASS = /^[a-z][a-z0-9_-]{1,31}$/;
const OTA_CHANNEL = /^[a-z][a-z0-9_-]{1,15}$/;
const OTA_KEY_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const OTA_PACKAGE_ID = /^[A-Za-z0-9-]{1,64}$/;
const OTA_WIRE_KEYS = [
  'package_id', 'device_class', 'version', 'min_version', 'channel', 'size_bytes', 'sha256',
  'chunk_size', 'chunk_count', 'mandatory', 'key_id', 'signature',
];

/** The text the Ed25519 signature covers: the domain and seven fields, eight lines joined with `\n`, no trailing newline. */
export function otaManifestSigningMessageV1(fields: OtaSignedManifestFieldsV1): string {
  return [
    OTA_MANIFEST_SIGNATURE_DOMAIN_V1,
    fields.deviceClass,
    fields.version,
    fields.channel,
    String(fields.sizeBytes),
    fields.sha256,
    fields.minVersion ?? '',
    fields.keyId,
  ].join('\n');
}

/** The same message for a Gadget firmware manifest (D1): the board model is the device class. */
export function gadgetFirmwareManifestSigningMessageV1(manifest: GadgetFirmwareManifestV0): string {
  return otaManifestSigningMessageV1({
    deviceClass: manifest.boardModel,
    version: manifest.version,
    minVersion: manifest.minVersion,
    channel: manifest.channel,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
    keyId: manifest.keyId,
  });
}

/** What the signature covers, read back from a decoded wire manifest. */
export function otaSignedManifestFieldsV1(wire: OtaSignedManifestWireV1): OtaSignedManifestFieldsV1 {
  return {
    deviceClass: wire.device_class,
    version: wire.version,
    minVersion: wire.min_version,
    channel: wire.channel,
    sizeBytes: wire.size_bytes,
    sha256: wire.sha256,
    keyId: wire.key_id,
  };
}

/** Shape check only; the signature is checked by the caller (server: node crypto; device: its own Ed25519). */
export function decodeOtaSignedManifestWireV1(
  value: unknown,
): { ok: true; value: OtaSignedManifestWireV1 } | { ok: false; reasonCode: OtaManifestReasonCodeV1; field: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reasonCode: 'unsupported_shape', field: 'manifest' };
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!OTA_WIRE_KEYS.includes(key)) return { ok: false, reasonCode: 'unknown_field', field: key };
  for (const key of OTA_WIRE_KEYS) if (!(key in raw)) return { ok: false, reasonCode: 'missing_field', field: key };
  const bad = (field: string) => ({ ok: false as const, reasonCode: 'invalid_value' as const, field });
  if (typeof raw.package_id !== 'string' || !OTA_PACKAGE_ID.test(raw.package_id)) return bad('package_id');
  if (typeof raw.device_class !== 'string' || !OTA_DEVICE_CLASS.test(raw.device_class)) return bad('device_class');
  if (typeof raw.version !== 'string' || !SEMVER.test(raw.version)) return { ok: false, reasonCode: 'version_invalid', field: 'version' };
  let floor: string | null = null;
  if (raw.min_version !== null) {
    if (typeof raw.min_version !== 'string' || !SEMVER.test(raw.min_version)) return bad('min_version');
    const order = compareGadgetVersionsV0(raw.min_version, raw.version);
    if (order === null || order > 0) return bad('min_version');
    floor = raw.min_version;
  }
  if (typeof raw.channel !== 'string' || !OTA_CHANNEL.test(raw.channel)) return bad('channel');
  if (typeof raw.size_bytes !== 'number' || !Number.isInteger(raw.size_bytes) || raw.size_bytes <= 0 || raw.size_bytes > GADGET_FIRMWARE_MAX_BYTES_V0) return bad('size_bytes');
  if (typeof raw.sha256 !== 'string' || !HEX64.test(raw.sha256)) return bad('sha256');
  if (typeof raw.chunk_size !== 'number' || !Number.isInteger(raw.chunk_size) || raw.chunk_size < 256 || raw.chunk_size > 65536) return bad('chunk_size');
  if (typeof raw.chunk_count !== 'number' || raw.chunk_count !== Math.ceil(raw.size_bytes / raw.chunk_size)) return bad('chunk_count');
  if (typeof raw.mandatory !== 'boolean') return bad('mandatory');
  if (typeof raw.key_id !== 'string' || !OTA_KEY_ID.test(raw.key_id)) return bad('key_id');
  if (typeof raw.signature !== 'string' || !ED25519_SIG.test(raw.signature)) return bad('signature');
  return {
    ok: true,
    value: {
      package_id: raw.package_id,
      device_class: raw.device_class,
      version: raw.version,
      min_version: floor,
      channel: raw.channel,
      size_bytes: raw.size_bytes,
      sha256: raw.sha256,
      chunk_size: raw.chunk_size,
      chunk_count: raw.chunk_count,
      mandatory: raw.mandatory,
      key_id: raw.key_id,
      signature: raw.signature,
    },
  };
}

/**
 * Device side: install or refuse. `signatureValid` is the result of the device's own Ed25519 check against the key it
 * pinned for `manifest.keyId`; this function never trusts a manifest whose key id is not in `pinnedKeyIds`.
 * Order of refusal: key, signature, version shape, same version, downgrade (running OR highest ever accepted), floor.
 */
export function otaInstallDecisionV1(input: {
  runningVersion: string;
  /** The anti-rollback counter the device keeps: the highest version it ever installed. Null on a fresh board. */
  highestAcceptedVersion: string | null;
  pinnedKeyIds: readonly string[];
  manifest: OtaSignedManifestFieldsV1;
  signatureValid: boolean;
}): { allowed: true } | { allowed: false; reasonCode: OtaManifestReasonCodeV1 } {
  const { runningVersion, highestAcceptedVersion, pinnedKeyIds, manifest, signatureValid } = input;
  if (!pinnedKeyIds.includes(manifest.keyId)) return { allowed: false, reasonCode: 'unknown_key' };
  if (signatureValid !== true) return { allowed: false, reasonCode: 'signature_invalid' };
  const against = compareGadgetVersionsV0(manifest.version, runningVersion);
  if (against === null) return { allowed: false, reasonCode: 'version_invalid' };
  if (against === 0) return { allowed: false, reasonCode: 'same_version' };
  if (against < 0) return { allowed: false, reasonCode: 'downgrade_refused' };
  if (highestAcceptedVersion !== null) {
    const counter = compareGadgetVersionsV0(manifest.version, highestAcceptedVersion);
    if (counter === null) return { allowed: false, reasonCode: 'version_invalid' };
    if (counter <= 0) return { allowed: false, reasonCode: 'downgrade_refused' };
  }
  if (manifest.minVersion !== null) {
    const floor = compareGadgetVersionsV0(runningVersion, manifest.minVersion);
    if (floor === null || floor < 0) return { allowed: false, reasonCode: 'min_version_not_met' };
  }
  return { allowed: true };
}

// ── Board check records (L8 batch 4, lane 4B hw, D1) ──────────────────────────────────────────────────────────────────
//
// A record says which checks were run on one board, with what result, who ran them and when. It states facts only: it is
// not a certification, nothing built on it may call a board "certified" to the public, and a failed or missing check is
// shown as it is. Records are append-only (a re-check is a new record). Admin-only to write and to read in this release.

/** Server switch for the record routes. Exactly '1' turns them on; off they answer 404. */
export const GADGET_BOARD_RECORDS_V1_FLAG = 'GADGET_BOARD_RECORDS_V1_ENABLED';
/** Web switch for the flashing page (checklist and steps only, no flashing code in the page). */
export const GADGET_FLASH_PAGE_WEB_FLAG_V1 = 'NEXT_PUBLIC_GADGET_FLASH_PAGE_ENABLED';

export const GADGET_BOARD_CHECKS_V1 = ['secure_boot', 'nvs_encrypted', 'device_key', 'pairing_proof', 'ota_signature_verified', 'downgrade_refused'] as const;
export type GadgetBoardCheckV1 = (typeof GADGET_BOARD_CHECKS_V1)[number];
export const GADGET_BOARD_CHECK_RESULTS_V1 = ['passed', 'failed', 'not_run'] as const;
export type GadgetBoardCheckResultV1 = (typeof GADGET_BOARD_CHECK_RESULTS_V1)[number];
export const GADGET_BOARD_RECORD_REF_PATTERN_V1 = /^gbr_[0-9a-f]{32}$/;
export const GADGET_BOARD_RECORD_NOTE_V1 = 'This is a record of checks run on one board. It is not a certification.';
export const GADGET_BOARD_RECORD_LIMITS_V1 = { listMax: 100 } as const;

export interface GadgetBoardRecordInputV1 {
  boardId: string;
  boardModel: string;
  firmwareVersion: string;
  /** All six checks, each with its result. */
  results: Record<GadgetBoardCheckV1, GadgetBoardCheckResultV1>;
}

export interface GadgetBoardRecordViewV1 extends GadgetBoardRecordInputV1 {
  recordRef: string;
  /** The admin who ran and recorded the checks. */
  verifiedBy: string;
  verifiedAt: string;
}

export type GadgetBoardRecordDecodeV1 =
  | { ok: true; value: GadgetBoardRecordInputV1 }
  | { ok: false; reasonCode: 'unsupported_shape' | 'unknown_field' | 'missing_field' | 'invalid_value'; field: string };

/** Shape check of the body an admin posts: exactly boardId, boardModel, firmwareVersion and one result per check. */
export function decodeGadgetBoardRecordInputV1(value: unknown): GadgetBoardRecordDecodeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reasonCode: 'unsupported_shape', field: 'record' };
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!['boardId', 'boardModel', 'firmwareVersion', 'results'].includes(key)) return { ok: false, reasonCode: 'unknown_field', field: key };
  for (const key of ['boardId', 'boardModel', 'firmwareVersion', 'results']) if (!(key in raw)) return { ok: false, reasonCode: 'missing_field', field: key };
  if (typeof raw.boardId !== 'string' || !ID.test(raw.boardId)) return { ok: false, reasonCode: 'invalid_value', field: 'boardId' };
  if (typeof raw.boardModel !== 'string' || !ID.test(raw.boardModel)) return { ok: false, reasonCode: 'invalid_value', field: 'boardModel' };
  if (typeof raw.firmwareVersion !== 'string' || !SEMVER.test(raw.firmwareVersion)) return { ok: false, reasonCode: 'invalid_value', field: 'firmwareVersion' };
  const results = raw.results;
  if (!results || typeof results !== 'object' || Array.isArray(results)) return { ok: false, reasonCode: 'invalid_value', field: 'results' };
  const entries = results as Record<string, unknown>;
  for (const key of Object.keys(entries)) if (!(GADGET_BOARD_CHECKS_V1 as readonly string[]).includes(key)) return { ok: false, reasonCode: 'unknown_field', field: `results.${key}` };
  const kept = {} as Record<GadgetBoardCheckV1, GadgetBoardCheckResultV1>;
  for (const check of GADGET_BOARD_CHECKS_V1) {
    const result = entries[check];
    if (result === undefined) return { ok: false, reasonCode: 'missing_field', field: `results.${check}` };
    if (typeof result !== 'string' || !(GADGET_BOARD_CHECK_RESULTS_V1 as readonly string[]).includes(result)) return { ok: false, reasonCode: 'invalid_value', field: `results.${check}` };
    kept[check] = result as GadgetBoardCheckResultV1;
  }
  return { ok: true, value: { boardId: raw.boardId as string, boardModel: raw.boardModel as string, firmwareVersion: raw.firmwareVersion as string, results: kept } };
}

/** The checks that passed, in the fixed order. A summary of facts, not a verdict. */
export function gadgetBoardPassedChecksV1(results: Record<GadgetBoardCheckV1, GadgetBoardCheckResultV1>): GadgetBoardCheckV1[] {
  return GADGET_BOARD_CHECKS_V1.filter((check) => results[check] === 'passed');
}
