/**
 * 审批卡（三端同一张；合同 v1 草案，CONTRACTS.md；产品文档 7.4、8.3；REQ-desktop-001、REQ-mobile-020、REQ-backend-010）。
 *
 * 读：`GET /api/desktop-sync/state` 的 `approvals[]`、`GET /api/desktop-sync/approvals/pending` → `ApprovalCardV1`。
 * 写：`POST /api/desktop-sync/approvals/:approvalId/respond`，请求体 `ApprovalRespondRequestV1`。
 *
 * 规则（`approvalResponseRequirementV1`）：
 * - 拒绝：任何风险级别、任何一端都可以，只要带 `requestDigest`。过期之后也可以拒绝（拒绝是收紧类）。
 * - 批准：
 *   - L0 / L1：任何一端都可以，带 `requestDigest`。
 *   - L2 / L3：只能在发起审批的那台电脑上批准，要带 `localConfirmation`（设备签名）。
 *     手机和 Web 上不给批准按钮，只给拒绝。以前的"远程回执"路径（`authorityReceiptRef` + `decisionReceiptRef`）
 *     只校验格式、不校验来源，v1 起不再接受；等 backend 能签发可验证的回执时再加回来。
 *   - 未知风险级别按 L3 处理。
 *   - 过期后不能批准。
 * - `rememberForSession` 只允许 L0 / L1。
 * - 以谁为准（REQ-backend-010、REQ-backend-019.re-desktop）：
 *   - 远程来源的命令（手机或后端下发、手机遥控）：只在读回 `status: 'approved'` 之后执行；桌面本机和后端
 *     任何一方不允许，就不执行。
 *   - 本机发起、本机确认的操作（人在这台电脑前、在本机界面里点的批准）：以本机确认为准，执行不依赖后端读回。
 *     后端记录照常建、照常回写，用于三端同步和审计；回写被拒（例如还没有登记签名凭据）时桌面显示"未同步"，
 *     记录停在 `pending` 直到过期。别的端对这类记录只能拒绝，拒绝会让本机等待立即失败。
 *
 * 设备签名（`localConfirmation`）：
 * - 密钥：发起审批的那台设备在 device registry 里登记的签名凭据（`device_signing_credentials`，ECDSA P-256 或
 *   secp256k1）。私钥由桌面 Rust 侧生成并存在系统钥匙串里，WebView 拿不到。后端按审批创建时绑定的设备和绑定
 *   （`expectedBindingId` / `expectedBindingVersion`）重新解析这台设备当前的有效凭据来验签；设备解绑、凭据吊销
 *   之后签名一律无效。只有 `device-dst:` 兜底凭据（没有公钥）的设备不能批准 L2 / L3。
 * - `ref`：一次性的本机确认引用，由桌面在用户本机确认时生成（`l3c-` + 至少 16 位十六进制，
 *   即 Rust `mint_confirmation_ref`）。同一个审批只能被决定一次，`ref` 也随决定一起记下。
 * - 签名原文：`approvalLocalConfirmationMessageV1`（UTF-8，五行，`\n` 分隔，无结尾换行）；ECDSA-SHA256，
 *   IEEE P1363（r||s）编码，base64url 无填充（64 字节 → 86 个字符）。
 *
 * 过期：服务端默认 `APPROVAL_DEFAULT_TTL_SECONDS`（创建时可以更短）。读的时候 `pending` 且已过 `expiresAt`
 * 的投影成 `expired`（`projectApprovalStatusV1`）。桌面本地等待不应长于记录里的 `expiresAt`。
 *
 * 错误（HTTP 400 / 409，响应体 `code` 与 `reasonCode`，见 shared/types/api-error.ts）：`APPROVAL_ERROR_CODES`。
 */

export const APPROVAL_CARD_SCHEMA_VERSION = 'agentrix.approval-card.v1' as const;
export const APPROVAL_DEFAULT_TTL_SECONDS = 600;

export const APPROVAL_RISK_LEVELS = ['L0', 'L1', 'L2', 'L3'] as const;
export type ApprovalRiskLevelV1 = (typeof APPROVAL_RISK_LEVELS)[number];

export const APPROVAL_DECISIONS = ['approved', 'rejected'] as const;
export type ApprovalDecisionV1 = (typeof APPROVAL_DECISIONS)[number];

/** 读态。`expired` 只出现在读的投影里，库里仍是 `pending`。 */
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type ApprovalStatusV1 = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_LOCAL_CONFIRMATION_DOMAIN_V1 = 'agentrix.desktop.approval.local.v1' as const;
export const APPROVAL_LOCAL_CONFIRMATION_REF_PATTERN = /^l3c-[0-9a-f]{16,128}$/;
export const APPROVAL_REQUEST_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export const APPROVAL_ERROR_CODES = {
  digestMismatch: 'REMOTE_APPROVAL_DIGEST_MISMATCH',
  expired: 'REMOTE_APPROVAL_EXPIRED',
  rememberForbidden: 'REMOTE_APPROVAL_REMEMBER_FORBIDDEN',
  /** L2 / L3 批准缺 `localConfirmation`，或者不是在发起审批的那台设备上。 */
  confirmationRequired: 'REMOTE_APPROVAL_CONFIRMATION_REQUIRED',
  /** `localConfirmation` 格式不对、设备凭据不可用或签名无效。 */
  confirmationInvalid: 'REMOTE_APPROVAL_CONFIRMATION_INVALID',
  decisionConflict: 'REMOTE_APPROVAL_DECISION_CONFLICT',
} as const;

/** 读模型（三端同一张卡）。字段和现在 `approvalEntityToRecord` 输出的一致，只多了 `expired` 这个读态。 */
export interface ApprovalCardV1 {
  approvalId: string;
  /** 发起审批的那台设备。L2 / L3 只能在它上面批准。 */
  deviceId: string;
  taskId: string;
  timelineEntryId?: string;
  title: string;
  description: string;
  riskLevel: string;
  sessionKey?: string;
  status: ApprovalStatusV1;
  requestedAt: string;
  respondedAt?: string;
  responseDeviceId?: string;
  rememberForSession: boolean;
  /** 回写时原样带回。 */
  requestDigest?: string;
  decisionDigest?: string;
  commandArgsDigest?: string;
  expiresAt?: string;
  localConfirmationRef?: string;
}

export interface ApprovalLocalConfirmationV1 {
  ref: string;
  /** base64url(P1363 r||s)，对 `approvalLocalConfirmationMessageV1` 的 ECDSA-SHA256 签名。 */
  signature: string;
}

export interface ApprovalRespondRequestV1 {
  decision: ApprovalDecisionV1;
  requestDigest: string;
  /** 只允许 L0 / L1。 */
  rememberForSession?: boolean;
  /** L2 / L3 批准必填；其余情况不需要，带了也会校验。 */
  localConfirmation?: ApprovalLocalConfirmationV1;
  metadata?: Record<string, unknown>;
}

export interface ApprovalResponseRequirementV1 {
  requestDigest: true;
  localConfirmation: boolean;
  rememberAllowed: boolean;
  /** `any`：任何一端；`requesting_device`：只能在发起审批的那台设备上。 */
  surface: 'any' | 'requesting_device';
  allowedAfterExpiry: boolean;
}

/** 未知级别按 L3。 */
export function normalizeApprovalRiskLevelV1(value: unknown): ApprovalRiskLevelV1 {
  return typeof value === 'string' && (APPROVAL_RISK_LEVELS as readonly string[]).includes(value)
    ? (value as ApprovalRiskLevelV1)
    : 'L3';
}

export function approvalResponseRequirementV1(riskLevel: unknown, decision: ApprovalDecisionV1): ApprovalResponseRequirementV1 {
  const risk = normalizeApprovalRiskLevelV1(riskLevel);
  const high = risk === 'L2' || risk === 'L3';
  if (decision === 'rejected') {
    return { requestDigest: true, localConfirmation: false, rememberAllowed: !high, surface: 'any', allowedAfterExpiry: true };
  }
  return {
    requestDigest: true,
    localConfirmation: high,
    rememberAllowed: !high,
    surface: high ? 'requesting_device' : 'any',
    allowedAfterExpiry: false,
  };
}

/** 读态投影：`pending` 且已过期 → `expired`。 */
export function projectApprovalStatusV1(status: string, expiresAt: string | Date | null | undefined, nowMs: number = Date.now()): ApprovalStatusV1 {
  if (status === 'approved' || status === 'rejected') return status;
  if (status !== 'pending') return 'rejected';
  if (expiresAt) {
    const ms = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
    if (Number.isFinite(ms) && ms <= nowMs) return 'expired';
  }
  return 'pending';
}

/** 设备要签名的原文。五行，`\n` 分隔，没有结尾换行。 */
export function approvalLocalConfirmationMessageV1(input: {
  approvalId: string;
  requestDigest: string;
  decision: ApprovalDecisionV1;
  ref: string;
}): string {
  return [APPROVAL_LOCAL_CONFIRMATION_DOMAIN_V1, input.approvalId, input.requestDigest, input.decision, input.ref].join('\n');
}

export function validateApprovalLocalConfirmationShapeV1(value: unknown): { valid: boolean; errors: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['localConfirmation: must be an object'] };
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) {
    if (key !== 'ref' && key !== 'signature') errors.push(`localConfirmation.${key}: unexpected field`);
  }
  if (typeof record.ref !== 'string' || !APPROVAL_LOCAL_CONFIRMATION_REF_PATTERN.test(record.ref)) {
    errors.push('localConfirmation.ref: must look like l3c-<hex>');
  }
  if (typeof record.signature !== 'string' || record.signature.length !== 86 || !BASE64URL.test(record.signature)) {
    errors.push('localConfirmation.signature: must be a 64-byte P1363 signature in base64url');
  }
  return { valid: errors.length === 0, errors };
}

/** 客户端用：这一端能不能显示某个按钮。`onRequestingDevice` = 当前就是发起审批的那台电脑。 */
export function approvalActionAvailableV1(input: {
  riskLevel: unknown;
  decision: ApprovalDecisionV1;
  status: ApprovalStatusV1;
  onRequestingDevice: boolean;
  canSignLocally: boolean;
}): boolean {
  const requirement = approvalResponseRequirementV1(input.riskLevel, input.decision);
  if (input.status === 'approved' || input.status === 'rejected') return false;
  if (input.status === 'expired' && !requirement.allowedAfterExpiry) return false;
  if (requirement.surface === 'requesting_device' && !input.onRequestingDevice) return false;
  if (requirement.localConfirmation && !input.canSignLocally) return false;
  return true;
}
