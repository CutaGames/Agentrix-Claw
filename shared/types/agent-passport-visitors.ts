/**
 * 分享回执里的来访 Agent 列表（合同 v1 草案；D21，REQ-web-013 第 4 节，E56）。
 *
 * 规则：
 * - 只记能证明身份的来访 Agent。人类访客和证明不了身份的 Agent 一样，只计入次数（按天），不记任何
 *   可识别的信息：不记 IP、UA、cookie，也不记 token。
 * - 只在凭分享链接成功读取时记录（`GET /api/a2a/agents/:agentRef/card?g=` 和 `…/passport?g=`）。
 *   裸卡、失败的读取都不记。
 * - v1 的身份证明只有一种，签名请求（`signed_request`）：
 *   - 来访 Agent 在请求头里带自己的外部编号、签名时间，以及对 `passportVisitMessageV1` 的 EIP-191 签名。
 *     签名用的是它在 Agentrix 登记的 `publicKey`（`AgentKeyService.verifyWithPublicKey`，和付款验签是同一条路径；
 *     来访方由服务端按外部编号自己查，查不到只算未核验，不让读取失败）。
 *   - 签名只绑定"谁、看谁、什么时候"，不带分享 token，也不带任何秘密。
 *   - 签名时间和服务器时间相差超过 5 分钟、签名不对、来访方不是 active 的 Agentrix Agent、
 *     来访方就是被看的 Agent 自己：都只计入未核验次数。读取本身照常成功，不因此报错。
 *   - 同一个签名只算一次：每个 (分享, 来访 Agent) 记下最近一次核验通过的 `signedAt`
 *     （`lastSignedAt`），新请求的 `signedAt` 不晚于它就只当未核验、不加次数（`passportVisitIsFreshV1`）。
 *     已知残余风险：拿到同一被访方另一条分享 token 的人，可以在 5 分钟内把签名重放到那条分享上；
 *     这需要另一条分享的 token，所以不把 token 放进签名。
 * - 保留 90 天：核验过的来访记录按最后一次来访时间算，未核验次数按天分桶，超过 90 天的删除。
 * - 只给主人看：`GET /api/agent-accounts/:id/passport/shares/:shareId/visitors`（主人本人的登录凭据；
 *   不是主人返回 404，和别的主人接口一样）→ `{ success: true, data: { visitors: PassportShareVisitorsV1 } }`。
 * - A2A card 上告知：每一张卡的 `x-agentrix.visitorNotice` 都是 `PASSPORT_VISITOR_NOTICE_V1`。
 * - `AgentPassportShareGrantV1.viewerAgentRef` 以后一直是 `null`，来访信息改看这里。
 */

export const PASSPORT_VISITORS_SCHEMA_VERSION = 'agentrix.passport-visitors.v1' as const;
export const PASSPORT_VISITOR_RETENTION_DAYS = 90;
export const PASSPORT_VISITOR_LIST_MAX = 200;
export const PASSPORT_VISIT_SIGNATURE_DOMAIN_V1 = 'AGENTRIX_PASSPORT_VISIT_V1' as const;
export const PASSPORT_VISIT_MAX_SKEW_SECONDS = 300;

/** 请求头（小写，Node 收到的就是小写）。 */
export const PASSPORT_VISIT_HEADERS_V1 = {
  agent: 'x-agentrix-visitor-agent',
  signedAt: 'x-agentrix-visitor-signed-at',
  signature: 'x-agentrix-visitor-signature',
} as const;

export const PASSPORT_VISITOR_PROOFS_V1 = ['signed_request'] as const;
export type PassportVisitorProofV1 = (typeof PASSPORT_VISITOR_PROOFS_V1)[number];

const AGENT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

/** 来访 Agent 签的那一段文字。三行之间用 `\n`，没有结尾换行。 */
export function passportVisitMessageV1(input: { visitorAgentRef: string; targetAgentRef: string; signedAt: string }): string {
  return `${PASSPORT_VISIT_SIGNATURE_DOMAIN_V1}\n${input.visitorAgentRef}\n${input.targetAgentRef}\n${input.signedAt}`;
}

export interface PassportVisitClaimV1 {
  visitorAgentRef: string;
  signedAt: string;
  signature: string;
}

/**
 * 从请求头读出来访方的声明；缺一项、格式不对、同名头出现多次都返回 `null`（按未核验计）。
 * 这里只看格式，签名和来访方是否 active 由服务端再验。
 */
export function readPassportVisitClaimV1(headers: Record<string, string | string[] | undefined> | null | undefined): PassportVisitClaimV1 | null {
  if (!headers) return null;
  const one = (name: string): string | null => {
    const value = headers[name];
    return typeof value === 'string' ? value.trim() : null;
  };
  const visitorAgentRef = one(PASSPORT_VISIT_HEADERS_V1.agent);
  const signedAt = one(PASSPORT_VISIT_HEADERS_V1.signedAt);
  const signature = one(PASSPORT_VISIT_HEADERS_V1.signature);
  if (!visitorAgentRef || !signedAt || !signature) return null;
  if (!AGENT_REF_PATTERN.test(visitorAgentRef) || !SIGNATURE_PATTERN.test(signature)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(signedAt) || !Number.isFinite(Date.parse(signedAt))) return null;
  return { visitorAgentRef, signedAt, signature };
}

/** 签名时间在服务器时间前后 5 分钟以内。 */
export function passportVisitTimelyV1(signedAt: string, nowMs: number): boolean {
  const at = Date.parse(signedAt);
  return Number.isFinite(at) && Math.abs(nowMs - at) <= PASSPORT_VISIT_MAX_SKEW_SECONDS * 1000;
}

/**
 * 同一个签名只算一次：`signedAt` 必须晚于这个 (分享, 来访 Agent) 上一次核验通过的 `lastSignedAt`。
 * 没有记录时（第一次来访）算新的。时间解析不了一律不算新的。
 */
export function passportVisitIsFreshV1(signedAt: string, lastSignedAt: string | null | undefined): boolean {
  const at = Date.parse(signedAt);
  if (!Number.isFinite(at)) return false;
  if (lastSignedAt === null || lastSignedAt === undefined) return true;
  const last = Date.parse(lastSignedAt);
  return Number.isFinite(last) && at > last;
}

/** 这个时刻之前的来访记录和未核验分桶都要删除。 */
export function passportVisitorRetentionCutoffV1(nowMs: number): string {
  return new Date(nowMs - PASSPORT_VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** 未核验次数的分桶（UTC 日期）。 */
export function passportVisitDayV1(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

export interface PassportShareVisitorV1 {
  /** 来访 Agent 的外部编号。 */
  agentRef: string;
  /** 来访 Agent 的公开名字（它自己的护照名），读不到时为 `null`。 */
  name: string | null;
  proof: PassportVisitorProofV1;
  firstSeenAt: string;
  lastSeenAt: string;
  visits: number;
}

export interface PassportShareVisitorsV1 {
  schemaVersion: typeof PASSPORT_VISITORS_SCHEMA_VERSION;
  shareId: string;
  /** 最近来访的在前，最多 `PASSPORT_VISITOR_LIST_MAX` 条。 */
  verified: PassportShareVisitorV1[];
  /** 核验过的来访 Agent 一共有几个。大于 `verified.length` 时列表被截断了。 */
  verifiedAgents: number;
  /** 保留期内未核验的来访次数。 */
  unverifiedVisits: number;
  retentionDays: typeof PASSPORT_VISITOR_RETENTION_DAYS;
  /** 统计窗口的起点（= 现在往前 90 天）。 */
  since: string;
}

export type PassportShareVisitorsDecodeResultV1 = { ok: true; value: PassportShareVisitorsV1 } | { ok: false; reason: string };

/** 消费端解码：只取已知字段，任何一条不对就整条拒绝（Web 显示"来访记录暂时读不到"）。 */
export function decodePassportShareVisitorsV1(input: unknown): PassportShareVisitorsDecodeResultV1 {
  if (!isRecord(input) || input.schemaVersion !== PASSPORT_VISITORS_SCHEMA_VERSION) return { ok: false, reason: 'schema' };
  if (typeof input.shareId !== 'string' || !input.shareId) return { ok: false, reason: 'shareId' };
  if (!Array.isArray(input.verified) || input.verified.length > PASSPORT_VISITOR_LIST_MAX) return { ok: false, reason: 'verified' };
  const verified: PassportShareVisitorV1[] = [];
  for (const raw of input.verified) {
    if (!isRecord(raw) || typeof raw.agentRef !== 'string' || !AGENT_REF_PATTERN.test(raw.agentRef)) return { ok: false, reason: 'verified.agentRef' };
    if (raw.name !== null && typeof raw.name !== 'string') return { ok: false, reason: 'verified.name' };
    if (!(PASSPORT_VISITOR_PROOFS_V1 as readonly unknown[]).includes(raw.proof)) return { ok: false, reason: 'verified.proof' };
    if (!isIso(raw.firstSeenAt) || !isIso(raw.lastSeenAt) || !isCount(raw.visits) || raw.visits < 1) return { ok: false, reason: 'verified.times' };
    verified.push({
      agentRef: raw.agentRef,
      name: raw.name as string | null,
      proof: raw.proof as PassportVisitorProofV1,
      firstSeenAt: raw.firstSeenAt,
      lastSeenAt: raw.lastSeenAt,
      visits: raw.visits,
    });
  }
  if (!isCount(input.verifiedAgents) || input.verifiedAgents < verified.length) return { ok: false, reason: 'verifiedAgents' };
  if (!isCount(input.unverifiedVisits)) return { ok: false, reason: 'unverifiedVisits' };
  if (input.retentionDays !== PASSPORT_VISITOR_RETENTION_DAYS || !isIso(input.since)) return { ok: false, reason: 'window' };
  return {
    ok: true,
    value: {
      schemaVersion: PASSPORT_VISITORS_SCHEMA_VERSION,
      shareId: input.shareId,
      verified,
      verifiedAgents: input.verifiedAgents,
      unverifiedVisits: input.unverifiedVisits,
      retentionDays: PASSPORT_VISITOR_RETENTION_DAYS,
      since: input.since,
    },
  };
}

// ---------------------------------------------------------------------------
// A2A card 上的告知

export interface PassportVisitorNoticeV1 {
  v: typeof PASSPORT_VISITORS_SCHEMA_VERSION;
  /** 只记核验过身份的来访 Agent（签名请求）；其余来访，包括人类访客，只计次数。 */
  records: 'verified_agents_only';
  unverified: 'count_only';
  humans: 'count_only';
  retentionDays: typeof PASSPORT_VISITOR_RETENTION_DAYS;
  /** 被记录的只有凭分享链接的读取。 */
  scope: 'share_link_reads';
  /** 想被主人认出来的 Agent 怎么做。 */
  identifyWith: { headers: typeof PASSPORT_VISIT_HEADERS_V1; signs: typeof PASSPORT_VISIT_SIGNATURE_DOMAIN_V1; scheme: 'eip191' };
}

export const PASSPORT_VISITOR_NOTICE_V1: PassportVisitorNoticeV1 = {
  v: PASSPORT_VISITORS_SCHEMA_VERSION,
  records: 'verified_agents_only',
  unverified: 'count_only',
  humans: 'count_only',
  retentionDays: PASSPORT_VISITOR_RETENTION_DAYS,
  scope: 'share_link_reads',
  identifyWith: { headers: PASSPORT_VISIT_HEADERS_V1, signs: PASSPORT_VISIT_SIGNATURE_DOMAIN_V1, scheme: 'eip191' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
