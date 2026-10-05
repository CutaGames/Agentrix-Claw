/**
 * 设备安全事件回执（合同 v1 草案；REQ-desktop-010，产品文档 6.6 桌面 D2："急停 3 秒内生效并留下回执"）。
 *
 * 先覆盖桌面急停：拉下（`engaged`）、解除（`released`）。本机先生效，之后再上报；上报失败不影响本机急停。
 * 服务端只记录，不审批、不能驳回，也不据此改动任何东西（D16：收紧类操作任何一端都能做，立即生效并留回执）。
 *
 * 规则：
 * - 上报要证明来自哪台设备：设备用它在 device registry 登记的签名钥匙，对 `deviceSafetyEventMessageV1` 签名
 *   （ECDSA-SHA256，IEEE P1363，base64url，和桌面绑定、审批确认同一种）。服务端只认这个用户名下、这台设备的
 *   当前有效凭据；`deviceId` 以签名凭据所属的设备为准，请求体里的 `deviceId` 必须和它一致。
 * - 请求要带主人的登录凭据（用户 JWT）；设备签名凭据 v1 没开时返回 503，桌面把事件留在本机、稍后再试。
 * - 同一台设备的同一个事件 `id` 只记一次：内容相同是重放，返回原来的回执；内容不同返回 409。
 * - 回执只给主人本人看（`list`），手机和 Web 放在"事项 → 回执与活动"。不进任何公开投影。
 * - 不收命令内容：`reason` 最多 80 字，只写"为什么拉下"这类说明。
 */
import { canonicalizeJson, sha256Hex, utf8Encode } from './trust-loop-primitives';

export const DEVICE_SAFETY_EVENT_SCHEMA_VERSION = 'agentrix.device-safety-event.v1' as const;

export const DEVICE_SAFETY_EVENT_ROUTES = {
  record: 'POST /api/v1/device-safety-events', // RecordDeviceSafetyEventRequestV1 → { receipt: DeviceSafetyEventReceiptV1, replayed: boolean }
  list: 'GET /api/v1/device-safety-events?limit=&deviceId=', // 主人本人 → { items: DeviceSafetyEventReceiptV1[] }，最新的在前，最多 50 条
} as const;

export const DEVICE_SAFETY_EVENT_KINDS = ['engaged', 'released'] as const;
export type DeviceSafetyEventKindV1 = (typeof DEVICE_SAFETY_EVENT_KINDS)[number];

export const DEVICE_SAFETY_EVENT_ORIGINS = ['tray', 'settings', 'shortcut', 'local-user', 'remote-stop'] as const;
export type DeviceSafetyEventOriginV1 = (typeof DEVICE_SAFETY_EVENT_ORIGINS)[number];

/** 两道闸（Rust 侧闸门、本机开发运行时）各自回读的结论。 */
export const DEVICE_SAFETY_GATE_STATES = ['confirmed', 'not_confirmed', 'unavailable'] as const;
export type DeviceSafetyGateStateV1 = (typeof DEVICE_SAFETY_GATE_STATES)[number];

/** 本机生成的事件 id："es-<毫秒时间戳>-<序号>"，同时是幂等键。 */
export const DEVICE_SAFETY_EVENT_ID_PATTERN = /^es-\d{10,16}-\d{1,6}$/;
/** 产品文档 6.6："3 秒内生效"。 */
export const DEVICE_SAFETY_BUDGET_MS = 3000;
export const DEVICE_SAFETY_REASON_MAX_CHARS = 80;
/** 上报签名时间和服务器时间最多差这么多。事件本身的 `at` 可以更早（离线补报）。 */
export const DEVICE_SAFETY_SIGNATURE_MAX_SKEW_SECONDS = 300;
export const DEVICE_SAFETY_LIST_MAX = 50;

export interface DeviceSafetyEventV1 {
  id: string;
  kind: DeviceSafetyEventKindV1;
  /** 拉下 / 解除那一刻（ISO）。 */
  at: string;
  origin: DeviceSafetyEventOriginV1;
  reason?: string;
  /** 急停时一并驳回的等待中审批数。 */
  approvalsRejected?: number;
  nativeGate: DeviceSafetyGateStateV1;
  /** 本机开发运行时是否已撤销；只在 `engaged` 时有。 */
  runtime?: DeviceSafetyGateStateV1;
  /** 从拉下到两道闸都有结论用了多久。 */
  settledAfterMs?: number;
  /** 桌面自己的判断：两道都确认，且不超过 3000 ms。服务端只核对它不自相矛盾。 */
  withinBudget?: boolean;
}

export interface RecordDeviceSafetyEventRequestV1 {
  deviceId: string;
  /** 签名用的设备签名凭据（`DeviceSigningCredentialV1.credentialRef`）。 */
  signerRef: string;
  signedAt: string;
  signature: string;
  event: DeviceSafetyEventV1;
}

export interface DeviceSafetyEventReceiptV1 {
  schemaVersion: typeof DEVICE_SAFETY_EVENT_SCHEMA_VERSION;
  receiptRef: string;
  deviceId: string;
  event: DeviceSafetyEventV1;
  eventDigest: string;
  verifiedBy: 'device_signature';
  recordedAt: string;
}

export const DEVICE_SAFETY_EVENT_ERROR_CODES = {
  invalid: 'device_safety_event_invalid', // 400，带 errors
  signatureInvalid: 'device_safety_signature_invalid', // 403，签名不对，或者凭据不属于这台设备 / 这个用户
  signatureStale: 'device_safety_signature_stale', // 403，signedAt 和服务器时间相差超过 5 分钟
  conflict: 'device_safety_event_conflict', // 409，同一个 id 已经记过另一份内容
  unavailable: 'device_safety_unavailable', // 503，设备签名凭据 v1 没开，或者存储不可用
} as const;

export const DEVICE_SAFETY_EVENT_DIGEST_DOMAIN_V1 = 'AGENTRIX_DEVICE_SAFETY_EVENT_V1' as const;
export const DEVICE_SAFETY_EVENT_SIGNATURE_DOMAIN_V1 = 'AGENTRIX_DEVICE_SAFETY_EVENT_SIGNATURE_V1' as const;

/** 事件摘要：`sha256:` + sha256(域串 + "\n" + 规范 JSON)。只覆盖事件本身。 */
export function deviceSafetyEventDigestV1(event: DeviceSafetyEventV1): string {
  return `sha256:${sha256Hex(utf8Encode(`${DEVICE_SAFETY_EVENT_DIGEST_DOMAIN_V1}\n${canonicalizeJson(event)}`))}`;
}

/** 设备签的那段文字：五行，`\n` 分隔，没有结尾换行。 */
export function deviceSafetyEventMessageV1(input: { deviceId: string; signerRef: string; eventDigest: string; signedAt: string }): string {
  return [DEVICE_SAFETY_EVENT_SIGNATURE_DOMAIN_V1, input.deviceId, input.signerRef, input.eventDigest, input.signedAt].join('\n');
}

type Validation = { valid: boolean; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
function isInt(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

const EVENT_KEYS = ['id', 'kind', 'at', 'origin', 'reason', 'approvalsRejected', 'nativeGate', 'runtime', 'settledAfterMs', 'withinBudget'];

export function validateDeviceSafetyEventV1(value: unknown): Validation {
  if (!isRecord(value)) return { valid: false, errors: ['event: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!EVENT_KEYS.includes(key)) errors.push(`event.${key}: unexpected field`);
  if (typeof value.id !== 'string' || !DEVICE_SAFETY_EVENT_ID_PATTERN.test(value.id)) errors.push('event.id: es-<ms>-<seq>');
  if (!(DEVICE_SAFETY_EVENT_KINDS as readonly unknown[]).includes(value.kind)) errors.push('event.kind: engaged or released');
  // Exactly `Date.prototype.toISOString()` form, so the digest is the same after a round trip through storage.
  if (!isIso(value.at) || new Date(value.at).toISOString() !== value.at) errors.push('event.at: toISOString() form, e.g. 2026-09-29T08:00:00.000Z');
  if (!(DEVICE_SAFETY_EVENT_ORIGINS as readonly unknown[]).includes(value.origin)) errors.push('event.origin: invalid');
  if (value.reason !== undefined) {
    const ok = typeof value.reason === 'string' && value.reason.trim().length > 0 && [...value.reason].length <= DEVICE_SAFETY_REASON_MAX_CHARS && !/[\u0000-\u001f\u007f]/.test(value.reason);
    if (!ok) errors.push(`event.reason: 1-${DEVICE_SAFETY_REASON_MAX_CHARS} characters, one line`);
  }
  if (value.approvalsRejected !== undefined && !isInt(value.approvalsRejected, 0, 10_000)) errors.push('event.approvalsRejected: 0-10000');
  if (!(DEVICE_SAFETY_GATE_STATES as readonly unknown[]).includes(value.nativeGate)) errors.push('event.nativeGate: invalid');
  if (value.runtime !== undefined) {
    if (!(DEVICE_SAFETY_GATE_STATES as readonly unknown[]).includes(value.runtime)) errors.push('event.runtime: invalid');
    if (value.kind === 'released') errors.push('event.runtime: only when engaged');
  }
  if (value.settledAfterMs !== undefined && !isInt(value.settledAfterMs, 0, 3_600_000)) errors.push('event.settledAfterMs: 0-3600000');
  if (value.withinBudget !== undefined) {
    if (typeof value.withinBudget !== 'boolean') errors.push('event.withinBudget: boolean');
    // "Within budget" cannot be claimed without a confirmed gate settled in time.
    else if (
      value.withinBudget &&
      (value.nativeGate !== 'confirmed' || typeof value.settledAfterMs !== 'number' || value.settledAfterMs > DEVICE_SAFETY_BUDGET_MS)
    ) {
      errors.push('event.withinBudget: true needs nativeGate confirmed and settledAfterMs <= 3000');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateRecordDeviceSafetyEventRequestV1(value: unknown): Validation {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!['deviceId', 'signerRef', 'signedAt', 'signature', 'event'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (typeof value.deviceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.deviceId)) errors.push('deviceId: invalid');
  if (typeof value.signerRef !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(value.signerRef)) errors.push('signerRef: invalid');
  if (!isIso(value.signedAt)) errors.push('signedAt: ISO timestamp (UTC)');
  if (typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(value.signature)) errors.push('signature: base64url');
  errors.push(...validateDeviceSafetyEventV1(value.event).errors);
  return { valid: errors.length === 0, errors };
}

export type DeviceSafetyEventReceiptDecodeResultV1 = { ok: true; value: DeviceSafetyEventReceiptV1 } | { ok: false; reason: string };

/** 消费端（手机、Web）解码：只取已知字段；事件不合格或摘要对不上整条拒绝。 */
export function decodeDeviceSafetyEventReceiptV1(input: unknown): DeviceSafetyEventReceiptDecodeResultV1 {
  if (!isRecord(input) || input.schemaVersion !== DEVICE_SAFETY_EVENT_SCHEMA_VERSION) return { ok: false, reason: 'schema' };
  if (typeof input.receiptRef !== 'string' || !/^dse_[0-9a-f]{32}$/.test(input.receiptRef)) return { ok: false, reason: 'receiptRef' };
  if (typeof input.deviceId !== 'string' || !input.deviceId) return { ok: false, reason: 'deviceId' };
  if (!validateDeviceSafetyEventV1(input.event).valid) return { ok: false, reason: 'event' };
  const raw = input.event as Record<string, unknown>;
  const event = Object.fromEntries(EVENT_KEYS.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]])) as unknown as DeviceSafetyEventV1;
  if (input.eventDigest !== deviceSafetyEventDigestV1(event)) return { ok: false, reason: 'eventDigest' };
  if (input.verifiedBy !== 'device_signature') return { ok: false, reason: 'verifiedBy' };
  if (!isIso(input.recordedAt)) return { ok: false, reason: 'recordedAt' };
  return {
    ok: true,
    value: {
      schemaVersion: DEVICE_SAFETY_EVENT_SCHEMA_VERSION,
      receiptRef: input.receiptRef,
      deviceId: input.deviceId,
      event,
      eventDigest: input.eventDigest as string,
      verifiedBy: 'device_signature',
      recordedAt: input.recordedAt,
    },
  };
}
