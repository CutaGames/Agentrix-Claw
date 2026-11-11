/**
 * 设备配对的持有证明（REQ-mobile-009，合同草案 v1）。
 *
 * 问题：`POST /v1/devices/pair` 只要"票据 + device_id"。device_id 会在 BLE 广播里出现，
 * 任何已登录用户拿到一台还没配对的设备的 device_id，就能把它登记到自己名下（抢注）。
 *
 * 做法：设备自证身份（self-certifying device id），不依赖出厂密钥库。
 * 1. 设备首次启动生成一对 EC 密钥（P-256 或 secp256k1），私钥不出设备。
 * 2. device_id = `dev_` + 公钥 thumbprint 的前 32 位小写十六进制。
 *    thumbprint = SHA-256( canonical JSON {"crv","kty","x","y"} )，键按字典序、无空白，
 *    与 `DeviceSigningCredentialService` 已用的 `computeEmbeddedCanonicalSha256V1` 相同。
 * 3. 手机向后端申请票据（`POST /v1/devices/pair/ticket`），经 BLE 交给设备；
 *    设备对 `devicePairingProofMessageV1({ ticket, deviceId })` 做 ECDSA-SHA256 签名，
 *    签名用 IEEE P1363（r||s）编码，再 base64url；公钥和签名经 BLE 回给手机。
 * 4. 手机调用 `POST /v1/devices/pair`，带上 `proof`。后端核对：
 *    device_id 由 proof 里的公钥推导而来；签名对这张票据有效。
 *
 * 这样，没有设备私钥就无法为这个 device_id 出具证明，抢注不再可能；后端也不需要保存公钥。
 * 旧固件（device_id 不是由公钥推导的）只有在服务端显式打开兼容开关时才能配对。
 */
import type { DeviceSigningPublicJwkV1 } from './device-signing-credential';

export const DEVICE_PAIRING_PROOF_SCHEMA_VERSION = 1 as const;
export const DEVICE_PAIRING_PROOF_DOMAIN_V1 = 'agentrix.device.pair.v1' as const;
export const DEVICE_PAIRING_PROOF_ALGORITHMS_V1 = ['ecdsa-p256-sha256', 'ecdsa-secp256k1-sha256'] as const;
export type DevicePairingProofAlgorithmV1 = (typeof DEVICE_PAIRING_PROOF_ALGORITHMS_V1)[number];

/** 自证 device_id 的格式：`dev_` + 32 位小写十六进制。 */
export const SELF_CERTIFYING_DEVICE_ID_PATTERN_V1 = /^dev_[0-9a-f]{32}$/;
export const SELF_CERTIFYING_DEVICE_ID_HEX_LENGTH_V1 = 32;

/** 未带证明、而服务端又没打开旧固件兼容时，`POST /v1/devices/pair` 返回的错误码。 */
export const DEVICE_PAIRING_PROOF_REQUIRED_CODE = 'DEVICE_PAIRING_PROOF_REQUIRED' as const;
export const DEVICE_PAIRING_PROOF_INVALID_CODE = 'DEVICE_PAIRING_PROOF_INVALID' as const;

export interface DevicePairingProofV1 {
  schemaVersion: typeof DEVICE_PAIRING_PROOF_SCHEMA_VERSION;
  algorithm: DevicePairingProofAlgorithmV1;
  publicJwk: DeviceSigningPublicJwkV1;
  /** ECDSA-SHA256 签名，IEEE P1363（r||s）编码，base64url 无填充。 */
  signature: string;
}

/** `POST /v1/devices/pair` 请求体（新增 `proof`；其余字段不变）。 */
export interface DevicePairRequestV1 {
  ticket: string;
  device_id: string;
  device_class?: string;
  vendor?: string;
  firmware_version?: string;
  label?: string;
  request_id?: string;
  proof?: DevicePairingProofV1;
}

/** 设备要签名的原文（UTF-8）。三行，用 `\n` 分隔，没有结尾换行。 */
export function devicePairingProofMessageV1(input: { ticket: string; deviceId: string }): string {
  return `${DEVICE_PAIRING_PROOF_DOMAIN_V1}\n${input.ticket}\n${input.deviceId}`;
}

/** 由公钥 thumbprint（64 位小写十六进制）推导自证 device_id。 */
export function deriveSelfCertifyingDeviceIdV1(thumbprintHex: string): string {
  const normalized = String(thumbprintHex || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('thumbprint must be 64 lowercase hex characters');
  }
  return `dev_${normalized.slice(0, SELF_CERTIFYING_DEVICE_ID_HEX_LENGTH_V1)}`;
}

export interface DevicePairingProofShapeResultV1 {
  valid: boolean;
  errors: string[];
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** 只做结构校验；签名与 device_id 推导由后端校验。 */
export function validateDevicePairingProofShapeV1(value: unknown): DevicePairingProofShapeResultV1 {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['proof: must be an object'] };
  }
  const proof = value as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'algorithm', 'publicJwk', 'signature']);
  for (const key of Object.keys(proof)) {
    if (!allowed.has(key)) errors.push(`proof.${key}: unexpected field`);
  }
  if (proof.schemaVersion !== DEVICE_PAIRING_PROOF_SCHEMA_VERSION) errors.push('proof.schemaVersion: must be 1');
  if (!(DEVICE_PAIRING_PROOF_ALGORITHMS_V1 as readonly unknown[]).includes(proof.algorithm)) {
    errors.push('proof.algorithm: unsupported');
  }
  const jwk = proof.publicJwk as Record<string, unknown> | undefined;
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) {
    errors.push('proof.publicJwk: must be an object');
  } else {
    if (jwk.kty !== 'EC') errors.push('proof.publicJwk.kty: must be EC');
    if (jwk.crv !== 'P-256' && jwk.crv !== 'secp256k1') errors.push('proof.publicJwk.crv: unsupported');
    if (proof.algorithm === 'ecdsa-p256-sha256' && jwk.crv !== 'P-256') errors.push('proof.publicJwk.crv: algorithm mismatch');
    if (proof.algorithm === 'ecdsa-secp256k1-sha256' && jwk.crv !== 'secp256k1') errors.push('proof.publicJwk.crv: algorithm mismatch');
    for (const coordinate of ['x', 'y'] as const) {
      const v = jwk[coordinate];
      if (typeof v !== 'string' || v.length !== 43 || !BASE64URL.test(v)) {
        errors.push(`proof.publicJwk.${coordinate}: must be 32-byte base64url`);
      }
    }
    for (const key of Object.keys(jwk)) {
      if (!['kty', 'crv', 'x', 'y'].includes(key)) errors.push(`proof.publicJwk.${key}: unexpected field`);
    }
  }
  if (typeof proof.signature !== 'string' || proof.signature.length !== 86 || !BASE64URL.test(proof.signature)) {
    errors.push('proof.signature: must be a 64-byte P1363 signature in base64url');
  }
  return { valid: errors.length === 0, errors };
}
