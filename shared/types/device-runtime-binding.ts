/**
 * 桌面设备绑定与运行时凭据（合同 v0 草案；E32、REQ-desktop-018）。
 *
 * 顺序（桌面 Rust 一条命令里跑完 1–3，用户 JWT 只在这里用一次，Rust 不保存）：
 * 1. 配对：`POST /api/v1/devices/pair/ticket` + `POST /api/v1/devices/pair`（`device-pairing-proof.ts`），
 *    `device_class: 'desktop'`。
 * 2. 登记签名凭据：`POST /api/v1/devices/:deviceId/signing-credentials/register`，带持有证明
 *    （`device-signing-credential.ts`），`purpose: 'device-auth'`。
 * 3. 建桌面绑定：`POST /api/v1/devices/:deviceId/desktop-binding`，请求体 `DesktopDeviceBindingCreateCommandV1`，
 *    用第 2 步登记的钥匙 K 签 `desktopDeviceBindingMessageV1`。返回 `DesktopDeviceBindingResultV1`。
 *    - `audience` 只有 `developer_runtime`：这份绑定只给这台设备上的开发者运行时用，Soul Shell 的其他入口不认它。
 *    - `runtimeRef.id` = `runtimeId`，`keyRef` = `signerRef`（必填），不给 `walletSession`。
 *    - 幂等：同一用户、同一设备、同一 `requestId` 重放返回同一份绑定；参数不同返回 409。
 *    - 续期：带 `supersedesBindingRef` 建后继绑定。第 3 片起这一步用运行时凭据（第 4 步）调，不再需要用户 JWT：
 *      运行时凭据只能续它自己那份绑定（`supersedesBindingRef` = 凭据的 `bindingRef`，`runtimeId`、`signerRef`、
 *      设备都不变），否则 403 `DESKTOP_BINDING_RENEWAL_ONLY`。接着用后继绑定刷新凭据（第 4 步 refresh），
 *      服务端顺手把前一份 supersede 掉（结果里 `predecessorBindingRetired`）。两份同时有效的时间要尽量短：
 *      远程执行在只有一份有效绑定时才会自动选中它。
 *    - 等待中的审批碰上续期：审批验签接受"从审批记下的那份绑定 supersede 过来、`keyRef` 不变"的后继绑定
 *      （REQ-desktop-018 做法 a）。
 * 4.（第 3 片）运行时短期凭据，见文件后半部分 `DEVELOPER_RUNTIME_CREDENTIAL_*`。
 * 5.（第 4 片）绑定前在线登记，见文件末尾 `DEVELOPER_RUNTIME_PRESENCE_*`。
 */
import { computeDigest, type DigestRef } from './trust-loop-primitives';

export const DESKTOP_DEVICE_BINDING_SCHEMA_VERSION = 1 as const;
export const DESKTOP_RUNTIME_AUDIENCE = 'developer_runtime' as const;
export const DESKTOP_DEVICE_BINDING_DOMAIN_V1 = 'agentrix.desktop.binding.v1' as const;
/** Rust 生成、存钥匙串：`drt_` + 32 位小写十六进制。 */
export const DESKTOP_RUNTIME_ID_PATTERN = /^drt_[0-9a-f]{32}$/;
/** 签名时间和服务端时间最多差这么多（秒）。 */
export const DESKTOP_BINDING_SIGNATURE_MAX_SKEW_SECONDS = 300;
export const DESKTOP_BINDING_MIN_TTL_SECONDS = 60;
export const DESKTOP_BINDING_MAX_TTL_SECONDS = 24 * 60 * 60;

export const DESKTOP_BINDING_ERROR_CODES = {
  invalid: 'DESKTOP_BINDING_INVALID',
  signatureInvalid: 'DESKTOP_BINDING_SIGNATURE_INVALID',
  signatureStale: 'DESKTOP_BINDING_SIGNATURE_STALE',
  /** 403：用运行时凭据调，但不是续它自己那份绑定。 */
  renewalOnly: 'DESKTOP_BINDING_RENEWAL_ONLY',
} as const;

export interface DesktopDeviceBindingCreateCommandV1 {
  schemaVersion: typeof DESKTOP_DEVICE_BINDING_SCHEMA_VERSION;
  /** 幂等键。 */
  requestId: string;
  /** 本人的个人 Agent（桌面默认用主 Agent，界面上写明）。 */
  agentAccountId: string;
  runtimeId: string;
  /** 第 2 步登记的签名凭据 `credentialRef`，写进 `binding.keyRef`。 */
  signerRef: string;
  ttlSeconds?: number;
  supersedesBindingRef?: { type: 'shell_session_binding'; id: string; version: number };
  signedAt: string;
  /** K 对 `desktopDeviceBindingMessageV1` 的 ECDSA-SHA256 签名，P1363，base64url（86 字符）。 */
  signature: string;
}

export interface DesktopDeviceBindingResultV1 {
  schemaVersion: typeof DESKTOP_DEVICE_BINDING_SCHEMA_VERSION;
  binding: {
    bindingId: string;
    bindingVersion: number;
    deviceId: string;
    runtimeRef: { type: 'runtime'; id: string };
    keyRef: string;
    audience: string[];
    expiresAt: string;
    supersedesBindingId?: string;
  };
  shellSessionRef: { type: 'shell_session_binding'; id: string; version: number };
}

/** 六行，`\n` 分隔，没有结尾换行。 */
export function desktopDeviceBindingMessageV1(input: {
  deviceId: string;
  requestId: string;
  runtimeId: string;
  signerRef: string;
  signedAt: string;
}): string {
  return [DESKTOP_DEVICE_BINDING_DOMAIN_V1, input.deviceId, input.requestId, input.runtimeId, input.signerRef, input.signedAt].join('\n');
}

const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SIGNER_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEYS = new Set(['schemaVersion', 'requestId', 'agentAccountId', 'runtimeId', 'signerRef', 'ttlSeconds', 'supersedesBindingRef', 'signedAt', 'signature']);

export function validateDesktopDeviceBindingCreateCommandV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['command: expected object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (!KEYS.has(key)) errors.push(`${key}: unexpected field`);
  if (record.schemaVersion !== DESKTOP_DEVICE_BINDING_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof record.requestId !== 'string' || !OPAQUE.test(record.requestId)) errors.push('requestId: invalid');
  if (typeof record.agentAccountId !== 'string' || !UUID.test(record.agentAccountId)) errors.push('agentAccountId: invalid');
  if (typeof record.runtimeId !== 'string' || !DESKTOP_RUNTIME_ID_PATTERN.test(record.runtimeId)) errors.push('runtimeId: must look like drt_<32 hex>');
  if (typeof record.signerRef !== 'string' || !SIGNER_REF.test(record.signerRef)) errors.push('signerRef: invalid');
  if (
    record.ttlSeconds !== undefined &&
    !(
      typeof record.ttlSeconds === 'number' &&
      Number.isInteger(record.ttlSeconds) &&
      record.ttlSeconds >= DESKTOP_BINDING_MIN_TTL_SECONDS &&
      record.ttlSeconds <= DESKTOP_BINDING_MAX_TTL_SECONDS
    )
  ) {
    errors.push('ttlSeconds: integer between 60 and 86400');
  }
  if (record.supersedesBindingRef !== undefined) {
    const ref = record.supersedesBindingRef as Record<string, unknown> | null;
    if (
      !ref ||
      typeof ref !== 'object' ||
      ref.type !== 'shell_session_binding' ||
      typeof ref.id !== 'string' ||
      !UUID.test(ref.id) ||
      !Number.isInteger(ref.version) ||
      (ref.version as number) < 1
    ) {
      errors.push('supersedesBindingRef: invalid');
    }
  }
  if (typeof record.signedAt !== 'string' || !Number.isFinite(Date.parse(record.signedAt))) errors.push('signedAt: invalid timestamp');
  if (typeof record.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(record.signature)) errors.push('signature: 64-byte P1363 signature in base64url required');
  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------------------------------------
 * 第 4 步：开发者运行时短期凭据（E32 做法 B；REQ-desktop-018 第 3 片）
 *
 * - 签发：`POST /api/v1/devices/:deviceId/runtime-credentials`，主人登录凭据（用户 JWT）+ K 签
 *   `developerRuntimeCredentialIssueMessageV1`。和第 1–3 步在同一条命令里做完，之后 Rust 不再需要用户 JWT。
 * - 使用：`Authorization: Bearer <token>`。只有 `/api/v1/developer/runtime/*`、第 3 步的续期和本节的吊销认它；
 *   其他所有接口（包括 WebSocket 网关）都拒绝它：它用单独派生的密钥签，普通登录校验验不过。
 *   反过来，运行时接口默认不再认用户 JWT（`AGENTRIX_DEVELOPER_RUNTIME_ACCEPT_USER_JWT=1` 才认，只给 Gate B 过渡）。
 * - 有效期 30 分钟，不超过绑定的到期时间；签发后 20 分钟起可以刷新（`refreshAfter`）。
 * - 刷新：`POST .../runtime-credentials/refresh`，带旧 token（过期 10 分钟内也行）+ K 签
 *   `developerRuntimeCredentialRefreshMessageV1`。`bindingRef` 填凭据现在那份绑定，或者续期后的直接后继。
 *   刷新成功后旧 token 立刻失效。同一 `requestId` 重放返回同一张新凭据（同一 `credentialRef`、同一到期时间）。
 * - 每次请求服务端都重查，下面任何一条不满足就 401 `DEVELOPER_RUNTIME_CREDENTIAL_REJECTED`：凭据是 active；
 *   没过期；设备还在、可用；签名钥匙（`signerRef`）还是 active；绑定还是 active、没过期；账号还在。
 *   收到 401：先刷新一次；刷新也 401（`..._REFRESH_REJECTED`），就要主人重新登录走第 3–4 步。
 *   运行时接口的错误体是运行时信封 `{ success: false, error: { code, reason, retriable } }`：本文件的
 *   `DEVELOPER_RUNTIME_*` 码原样放在 `code` 里，其他错误照旧是 `fail_closed` / `not_found` / `invalid` 等通用码。
 * - 钥匙轮换以后旧凭据失效（它绑在旧 `signerRef` 上），要重新走第 3–4 步。
 * - 吊销：`POST .../runtime-credentials/revoke`。主人登录凭据：吊销这台设备的全部（或指定的一张）；
 *   运行时凭据：只能吊销自己（桌面退出登录时用）。重复吊销返回 `revoked: 0`。
 * - 同一台设备、同一个 `runtimeId` 同时只有一张 active 凭据：重新签发会吊销旧的。
 * ---------------------------------------------------------------------------------------------- */
export const DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION = 1 as const;
export const DEVELOPER_RUNTIME_CREDENTIAL_ISSUE_DOMAIN_V1 = 'agentrix.developer-runtime.credential.issue.v1' as const;
export const DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_DOMAIN_V1 = 'agentrix.developer-runtime.credential.refresh.v1' as const;
/** `drc_` + 32 位小写十六进制；也是 token 的 `jti`。 */
export const DEVELOPER_RUNTIME_CREDENTIAL_REF_PATTERN = /^drc_[0-9a-f]{32}$/;
export const DEVELOPER_RUNTIME_CREDENTIAL_TTL_SECONDS = 30 * 60;
export const DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_AFTER_SECONDS = 20 * 60;
/** 过期多久以内还能拿来刷新。 */
export const DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_GRACE_SECONDS = 10 * 60;
/** 绑定剩余有效期少于这个值就不签发 / 不刷新到它上面（先续期绑定）。 */
export const DEVELOPER_RUNTIME_CREDENTIAL_MIN_BINDING_REMAINING_SECONDS = 60;
export const DEVELOPER_RUNTIME_CREDENTIAL_ROUTES = {
  issue: '/api/v1/devices/:deviceId/runtime-credentials',
  refresh: '/api/v1/devices/:deviceId/runtime-credentials/refresh',
  revoke: '/api/v1/devices/:deviceId/runtime-credentials/revoke',
} as const;
export const DEVELOPER_RUNTIME_CREDENTIAL_ERROR_CODES = {
  /** 400：请求体不合格式。 */
  invalid: 'DEVELOPER_RUNTIME_CREDENTIAL_INVALID',
  /** 403：K 的签名不对。 */
  signatureInvalid: 'DEVELOPER_RUNTIME_CREDENTIAL_SIGNATURE_INVALID',
  /** 403：`signedAt` 和服务端时间差超过 5 分钟。 */
  signatureStale: 'DEVELOPER_RUNTIME_CREDENTIAL_SIGNATURE_STALE',
  /** 409：绑定不是这台设备 / 这个运行时 / 这把钥匙的，已失效，或快到期了。 */
  bindingUnavailable: 'DEVELOPER_RUNTIME_CREDENTIAL_BINDING_UNAVAILABLE',
  /** 409：`requestId` 用过了，但参数不同。 */
  replay: 'DEVELOPER_RUNTIME_CREDENTIAL_REPLAY',
  /** 401：旧凭据已吊销 / 已被刷新 / 过期超过 10 分钟 / 验不过。要主人重新登录走第 3–4 步。 */
  refreshRejected: 'DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_REJECTED',
  /** 401：每次请求的重查没通过。先刷新一次。 */
  rejected: 'DEVELOPER_RUNTIME_CREDENTIAL_REJECTED',
  /** 401：运行时接口收到用户 JWT，而过渡开关没开。 */
  required: 'DEVELOPER_RUNTIME_CREDENTIAL_REQUIRED',
} as const;
export interface DeveloperRuntimeBindingRefV1 {
  type: 'shell_session_binding';
  id: string;
  version: number;
}
export interface DeveloperRuntimeCredentialIssueCommandV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION;
  /** 幂等键，也在签名里。 */
  requestId: string;
  runtimeId: string;
  /** 绑定的 `keyRef`，签名用的钥匙。 */
  signerRef: string;
  /** 第 3 步返回的 `shellSessionRef`。 */
  bindingRef: DeveloperRuntimeBindingRefV1;
  signedAt: string;
  /** K 对 `developerRuntimeCredentialIssueMessageV1` 的 ECDSA-SHA256 签名，P1363，base64url（86 字符）。 */
  signature: string;
}
export interface DeveloperRuntimeCredentialRefreshCommandV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION;
  requestId: string;
  /** 凭据现在那份绑定，或续期后的直接后继（`supersedesBindingId` 指向现在那份、同一把钥匙）。 */
  bindingRef: DeveloperRuntimeBindingRefV1;
  signedAt: string;
  /** K 对 `developerRuntimeCredentialRefreshMessageV1` 的签名，格式同上。 */
  signature: string;
}
export interface DeveloperRuntimeCredentialV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION;
  credentialRef: string;
  /** 只放钥匙串，不写日志。 */
  token: string;
  tokenType: 'Bearer';
  audience: typeof DESKTOP_RUNTIME_AUDIENCE;
  deviceId: string;
  runtimeId: string;
  bindingRef: DeveloperRuntimeBindingRefV1;
  issuedAt: string;
  expiresAt: string;
  refreshAfter: string;
  /** 只在刷新到后继绑定时出现：前一份绑定是否已由服务端 supersede（revocation v1 没开时是 false）。 */
  predecessorBindingRetired?: boolean;
}
export interface DeveloperRuntimeCredentialRevokeCommandV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION;
  /** 省略：主人登录凭据 = 这台设备的全部；运行时凭据 = 自己。 */
  credentialRef?: string;
}
export interface DeveloperRuntimeCredentialRevokeResultV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION;
  revoked: number;
}
/** 八行，`\n` 分隔，没有结尾换行。 */
export function developerRuntimeCredentialIssueMessageV1(input: {
  deviceId: string;
  requestId: string;
  runtimeId: string;
  signerRef: string;
  bindingRef: { id: string; version: number };
  signedAt: string;
}): string {
  return [
    DEVELOPER_RUNTIME_CREDENTIAL_ISSUE_DOMAIN_V1,
    input.deviceId,
    input.requestId,
    input.runtimeId,
    input.signerRef,
    input.bindingRef.id,
    String(input.bindingRef.version),
    input.signedAt,
  ].join('\n');
}
/** 七行，`\n` 分隔，没有结尾换行。`credentialRef` 是旧凭据的。 */
export function developerRuntimeCredentialRefreshMessageV1(input: {
  deviceId: string;
  credentialRef: string;
  requestId: string;
  bindingRef: { id: string; version: number };
  signedAt: string;
}): string {
  return [
    DEVELOPER_RUNTIME_CREDENTIAL_REFRESH_DOMAIN_V1,
    input.deviceId,
    input.credentialRef,
    input.requestId,
    input.bindingRef.id,
    String(input.bindingRef.version),
    input.signedAt,
  ].join('\n');
}
function isRuntimeBindingRef(value: unknown): value is DeveloperRuntimeBindingRefV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return (
    Object.keys(ref).every((key) => key === 'type' || key === 'id' || key === 'version') &&
    ref.type === 'shell_session_binding' &&
    typeof ref.id === 'string' &&
    UUID.test(ref.id) &&
    Number.isInteger(ref.version) &&
    (ref.version as number) >= 1
  );
}
function checkSignedCommon(record: Record<string, unknown>, errors: string[]): void {
  if (record.schemaVersion !== DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof record.requestId !== 'string' || !OPAQUE.test(record.requestId)) errors.push('requestId: invalid');
  if (!isRuntimeBindingRef(record.bindingRef)) errors.push('bindingRef: invalid');
  if (typeof record.signedAt !== 'string' || !Number.isFinite(Date.parse(record.signedAt))) errors.push('signedAt: invalid timestamp');
  if (typeof record.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(record.signature)) errors.push('signature: 64-byte P1363 signature in base64url required');
}
const ISSUE_KEYS = new Set(['schemaVersion', 'requestId', 'runtimeId', 'signerRef', 'bindingRef', 'signedAt', 'signature']);
const REFRESH_KEYS = new Set(['schemaVersion', 'requestId', 'bindingRef', 'signedAt', 'signature']);
const REVOKE_KEYS = new Set(['schemaVersion', 'credentialRef']);
export function validateDeveloperRuntimeCredentialIssueCommandV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['command: expected object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (!ISSUE_KEYS.has(key)) errors.push(`${key}: unexpected field`);
  checkSignedCommon(record, errors);
  if (typeof record.runtimeId !== 'string' || !DESKTOP_RUNTIME_ID_PATTERN.test(record.runtimeId)) errors.push('runtimeId: must look like drt_<32 hex>');
  if (typeof record.signerRef !== 'string' || !SIGNER_REF.test(record.signerRef)) errors.push('signerRef: invalid');
  return { valid: errors.length === 0, errors };
}
export function validateDeveloperRuntimeCredentialRefreshCommandV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['command: expected object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (!REFRESH_KEYS.has(key)) errors.push(`${key}: unexpected field`);
  checkSignedCommon(record, errors);
  return { valid: errors.length === 0, errors };
}
export function validateDeveloperRuntimeCredentialRevokeCommandV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['command: expected object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (!REVOKE_KEYS.has(key)) errors.push(`${key}: unexpected field`);
  if (record.schemaVersion !== DEVELOPER_RUNTIME_CREDENTIAL_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (
    record.credentialRef !== undefined &&
    (typeof record.credentialRef !== 'string' || !DEVELOPER_RUNTIME_CREDENTIAL_REF_PATTERN.test(record.credentialRef))
  ) {
    errors.push('credentialRef: must look like drc_<32 hex>');
  }
  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------------------------------------
 * 第 5 步：绑定前在线登记（E32 缺口 2；REQ-desktop-018 第 4 片）
 *
 * `POST /api/v1/developer/runtime/presence`，只认运行时凭据（过渡开关下的用户 JWT 也不行），外加 K 签
 * `developerRuntimePresenceMessageV1`。签发 bootstrap 之前用它建 machine、登记 workspace：
 * - `deviceRef` / `runtimeId` 必须是凭据自己的；machine 的 `agentId` 取自凭据那份绑定，不由请求指定。
 * - 这台设备、这个运行时还没有 machine 时新建一台：离线（`awaiting_bootstrap`）、能力全是 `unknown`，
 *   不产生 offer、claim、session，不开任何执行面。已有 machine（比如 heartbeat 建的）就不动它。
 * - 每个 workspace 按 `pathDigest` 对上同一台 machine 已有的 workspace（没有就新建，ref 由服务端给）。
 *   `trusted` 记成已信任（信任证据是这次签名登记）；`untrusted` 把已有的改成未信任。列表里没出现的不动。
 * - 同一 `requestId` 重放返回同一份结果；参数不同 409。每台设备每小时最多 30 次，超了 429。
 * - 之后用同一张运行时凭据调 `POST /api/v1/developer/runtime/binding/bootstraps`（`machineRef` 用这里返回的），
 *   第一次 heartbeat 带 `machineRef` 和 `expectedVersion` = 这里返回的 `machineVersion`。
 * - 路径摘要不加盐，常见路径能被猜出来；只有主人自己看得到。以后改 HMAC 要双方一起改。
 * ---------------------------------------------------------------------------------------------- */
export const DEVELOPER_RUNTIME_PRESENCE_SCHEMA_VERSION = 1 as const;
export const DEVELOPER_RUNTIME_PRESENCE_DOMAIN_V1 = 'agentrix.developer-runtime.presence.v1' as const;
export const DEVELOPER_RUNTIME_PRESENCE_ROUTE = '/api/v1/developer/runtime/presence' as const;
export const DEVELOPER_RUNTIME_PRESENCE_MAX_WORKSPACES = 20;
export const DEVELOPER_RUNTIME_PRESENCE_PER_DEVICE_PER_HOUR = 30;
export const DEVELOPER_RUNTIME_PRESENCE_ERROR_CODES = {
  /** 400 */
  invalid: 'DEVELOPER_RUNTIME_PRESENCE_INVALID',
  /** 403：K 的签名不对 / 验不了。 */
  signatureInvalid: 'DEVELOPER_RUNTIME_PRESENCE_SIGNATURE_INVALID',
  /** 403：`signedAt` 和服务端时间差超过 5 分钟。 */
  signatureStale: 'DEVELOPER_RUNTIME_PRESENCE_SIGNATURE_STALE',
  /** 429 */
  rateLimited: 'DEVELOPER_RUNTIME_PRESENCE_RATE_LIMITED',
} as const;
export interface DeveloperRuntimePresenceWorkspaceV1 {
  /** Rust `workspace_trust::path_digest`：JCS(`{ canonicalPath }`) 的 sha-256，和 heartbeat 的 `workspaceDigest` 同一种。 */
  pathDigest: DigestRef;
  /** 默认是文件夹名，1–64 字。 */
  displayName: string;
  trust: 'trusted' | 'untrusted';
  trustSource: 'owner_folder_pick';
  /** 主人在本机选中这个文件夹的时间；不能晚于 `signedAt`。省略就用服务端时间。 */
  trustedAt?: string;
}
export interface DeveloperRuntimePresenceV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_PRESENCE_SCHEMA_VERSION;
  /** 幂等键，也在签名里。 */
  requestId: string;
  deviceRef: string;
  runtimeId: string;
  machine: { label: string; os: 'macos' | 'windows' | 'linux' };
  /** 0–20 个，`pathDigest` 不能重复。 */
  workspaces: DeveloperRuntimePresenceWorkspaceV1[];
  signedAt: string;
  /** K 对 `developerRuntimePresenceMessageV1` 的签名，P1363，base64url（86 字符）。 */
  signature: string;
}
export interface DeveloperRuntimePresenceResultV1 {
  schemaVersion: typeof DEVELOPER_RUNTIME_PRESENCE_SCHEMA_VERSION;
  machineRef: string;
  machineVersion: number;
  /** 这次新建了 machine。 */
  machineCreated: boolean;
  workspaces: Array<{ workspaceRef: string; pathDigest: string; trust: 'trusted' | 'untrusted' }>;
}
/** 签名覆盖的摘要：去掉 `signature` 以后整个请求体的 JCS sha-256（小写十六进制）。 */
export function developerRuntimePresenceDigestV1(presence: Omit<DeveloperRuntimePresenceV1, 'signature'> | DeveloperRuntimePresenceV1): string {
  const { signature: _signature, ...unsigned } = presence as DeveloperRuntimePresenceV1;
  return computeDigest(unsigned).value;
}
/** 四行，`\n` 分隔，没有结尾换行。 */
export function developerRuntimePresenceMessageV1(input: { requestId: string; digest: string; signedAt: string }): string {
  return [DEVELOPER_RUNTIME_PRESENCE_DOMAIN_V1, input.requestId, input.digest, input.signedAt].join('\n');
}
const PRESENCE_KEYS = new Set(['schemaVersion', 'requestId', 'deviceRef', 'runtimeId', 'machine', 'workspaces', 'signedAt', 'signature']);
const PRESENCE_WORKSPACE_KEYS = new Set(['pathDigest', 'displayName', 'trust', 'trustSource', 'trustedAt']);
const DIGEST_KEYS = new Set(['algorithm', 'canonicalization', 'value']);
function isDisplayText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && [...value].length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validateDeveloperRuntimePresenceV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['presence: expected object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (!PRESENCE_KEYS.has(key)) errors.push(`${key}: unexpected field`);
  if (record.schemaVersion !== DEVELOPER_RUNTIME_PRESENCE_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof record.requestId !== 'string' || !OPAQUE.test(record.requestId)) errors.push('requestId: invalid');
  if (typeof record.deviceRef !== 'string' || !OPAQUE.test(record.deviceRef)) errors.push('deviceRef: invalid');
  if (typeof record.runtimeId !== 'string' || !DESKTOP_RUNTIME_ID_PATTERN.test(record.runtimeId)) errors.push('runtimeId: must look like drt_<32 hex>');
  const machine = record.machine as Record<string, unknown> | null | undefined;
  if (!machine || typeof machine !== 'object' || Array.isArray(machine)) {
    errors.push('machine: expected object');
  } else {
    for (const key of Object.keys(machine)) if (key !== 'label' && key !== 'os') errors.push(`machine.${key}: unexpected field`);
    if (!isDisplayText(machine.label, 64)) errors.push('machine.label: 1-64 printable characters');
    if (machine.os !== 'macos' && machine.os !== 'windows' && machine.os !== 'linux') errors.push('machine.os: expected macos, windows or linux');
  }
  const signedAtMs = typeof record.signedAt === 'string' ? Date.parse(record.signedAt) : NaN;
  if (!Number.isFinite(signedAtMs)) errors.push('signedAt: invalid timestamp');
  if (!Array.isArray(record.workspaces)) {
    errors.push('workspaces: expected array');
  } else {
    if (record.workspaces.length > DEVELOPER_RUNTIME_PRESENCE_MAX_WORKSPACES) errors.push('workspaces: at most 20');
    const seen = new Set<string>();
    record.workspaces.forEach((entry, index) => {
      const at = `workspaces[${index}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`${at}: expected object`);
        return;
      }
      const workspace = entry as Record<string, unknown>;
      for (const key of Object.keys(workspace)) if (!PRESENCE_WORKSPACE_KEYS.has(key)) errors.push(`${at}.${key}: unexpected field`);
      const digest = workspace.pathDigest as Record<string, unknown> | null | undefined;
      if (
        !digest ||
        typeof digest !== 'object' ||
        Array.isArray(digest) ||
        !Object.keys(digest).every((key) => DIGEST_KEYS.has(key)) ||
        digest.algorithm !== 'sha-256' ||
        digest.canonicalization !== 'jcs/1' ||
        typeof digest.value !== 'string' ||
        !/^[0-9a-f]{64}$/.test(digest.value)
      ) {
        errors.push(`${at}.pathDigest: { algorithm: 'sha-256', canonicalization: 'jcs/1', value: 64 lower-case hex }`);
      } else if (seen.has(digest.value as string)) {
        errors.push(`${at}.pathDigest: duplicate`);
      } else {
        seen.add(digest.value as string);
      }
      if (!isDisplayText(workspace.displayName, 64)) errors.push(`${at}.displayName: 1-64 printable characters`);
      if (workspace.trust !== 'trusted' && workspace.trust !== 'untrusted') errors.push(`${at}.trust: expected trusted or untrusted`);
      if (workspace.trustSource !== 'owner_folder_pick') errors.push(`${at}.trustSource: expected owner_folder_pick`);
      if (workspace.trustedAt !== undefined) {
        const trustedAtMs = typeof workspace.trustedAt === 'string' ? Date.parse(workspace.trustedAt) : NaN;
        if (!Number.isFinite(trustedAtMs)) errors.push(`${at}.trustedAt: invalid timestamp`);
        else if (Number.isFinite(signedAtMs) && trustedAtMs > signedAtMs) errors.push(`${at}.trustedAt: cannot be after signedAt`);
        if (workspace.trust !== 'trusted') errors.push(`${at}.trustedAt: only for trusted`);
      }
    });
  }
  if (typeof record.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(record.signature)) errors.push('signature: 64-byte P1363 signature in base64url required');
  return { valid: errors.length === 0, errors };
}
