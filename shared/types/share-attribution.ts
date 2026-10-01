/**
 * 名片分享 → 注册的归因（合同 v0 草案，REQ-mobile-022，M4 退出条件）。
 *
 * 第 1 部分（现在就能用）：分享链接上的来源参数。
 * - 只有两个参数 `via`、`ch`，取值是下面两个封闭枚举；不带用户 id，不带自由文本。
 * - 来源名片是谁，取自路由 `/share/agent/<账户 UUID 或外部编号>`，**不从查询串读**。
 * - 旧的账户 id 链接 308 跳到外部编号时，查询串原样带上（`agent-public-entry.ts`），参数不会丢。
 * - 读的一方遇到未知值，整对参数丢弃，不原样记录。
 *
 * 第 2 部分（草案，等 coord 定同意范围后实现）：注册后的认领和主人的计数。
 * - 访客落在分享页时，客户端记下 `{ cardRef, via, ch }`：`cardRef` 就是当时路由里的那一段（不从查询串读），
 *   注册完成后原样带去认领。注册页、登录回跳页的路由里没有名片，所以 `cardRef` 必须和两个参数一起带着走。
 * - 新账户注册完成后，客户端用本人登录凭据调一次 `claim`。
 * - 服务端只认"刚注册的账户"：从**账户创建**（`users.createdAt`）到认领不超过
 *   `SHARE_ATTRIBUTION_CLAIM_WINDOW_MINUTES`。访客打开分享页到注册之间隔多久，服务端不管也不知道。
 * - 每个账户只认一次，名片必须是现在公开可见的，不能是自己的。
 * - 名片主人用 `summary` 看"近 7 天经名片注册 N"：只有数，没有是谁；访客看不到，公开投影里没有。
 */
export const SHARE_ATTRIBUTION_VIA_V0 = ['twin_card', 'passport_card'] as const;
export type ShareAttributionViaV0 = (typeof SHARE_ATTRIBUTION_VIA_V0)[number];
export const SHARE_ATTRIBUTION_CHANNELS_V0 = ['mobile', 'web', 'desktop', 'qr'] as const;
export type ShareAttributionChannelV0 = (typeof SHARE_ATTRIBUTION_CHANNELS_V0)[number];
export interface ShareAttributionParamsV0 {
  via: ShareAttributionViaV0;
  ch: ShareAttributionChannelV0;
}
function isVia(value: unknown): value is ShareAttributionViaV0 {
  return typeof value === 'string' && (SHARE_ATTRIBUTION_VIA_V0 as readonly string[]).includes(value);
}
function isChannel(value: unknown): value is ShareAttributionChannelV0 {
  return typeof value === 'string' && (SHARE_ATTRIBUTION_CHANNELS_V0 as readonly string[]).includes(value);
}
function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
/** 发链接的一方用：`via=twin_card&ch=qr`，接在分享地址的查询串里（已有 `?` 时用 `&`）。 */
export function shareAttributionQueryV0(params: ShareAttributionParamsV0): string {
  if (!isVia(params.via) || !isChannel(params.ch)) throw new Error('share attribution: unknown via / ch');
  return `via=${params.via}&ch=${params.ch}`;
}
/** 把参数加到一个分享地址上；地址里原有的 `via` / `ch` 会被替换，别的参数和 `#` 不动。 */
export function withShareAttributionV0(url: string, params: ShareAttributionParamsV0): string {
  const query = shareAttributionQueryV0(params);
  const hashAt = url.indexOf('#');
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = base.indexOf('?');
  const path = queryAt >= 0 ? base.slice(0, queryAt) : base;
  const kept = (queryAt >= 0 ? base.slice(queryAt + 1) : '')
    .split('&')
    .filter((pair) => pair.length > 0 && !/^(via|ch)(=|$)/.test(pair));
  return `${path}?${[...kept, query].join('&')}${hash}`;
}
/**
 * 读的一方用：从路由的查询对象（Next.js `query`、`URLSearchParams` 转成的对象）里读两个参数。
 * 两个都认识才返回；缺一个或有一个不认识，返回 null（整对丢弃）。重复参数取第一个。
 */
export function readShareAttributionQueryV0(query: Readonly<Record<string, unknown>> | null | undefined): ShareAttributionParamsV0 | null {
  if (!query || typeof query !== 'object') return null;
  const via = firstValue(query.via);
  const ch = firstValue(query.ch);
  return isVia(via) && isChannel(ch) ? { via, ch } : null;
}

// ── 第 2 部分：草案，未实现 ──────────────────────────────────────────────────────────

export const SHARE_ATTRIBUTION_ROUTES_V0 = {
  /** 本人登录凭据；新账户注册后调一次。 */
  claim: 'POST /api/v1/growth/share-attribution',
  /** 本人登录凭据，只能看自己 Agent 的。 */
  summary: 'GET /api/v1/growth/share-attribution/summary?agentAccountId=<uuid>',
} as const;
/** 从账户创建（`users.createdAt`）起，多久内可以认领（分钟）。不是从打开分享页算。 */
export const SHARE_ATTRIBUTION_CLAIM_WINDOW_MINUTES = 30;
export const SHARE_ATTRIBUTION_SUMMARY_WINDOW_DAYS = 7;
/** 账户 UUID（分身链接）或外部编号（护照链接），和 `agent-public-entry.ts` 的两个格式一致。 */
const CARD_REF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CARD_REF_EXTERNAL = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;
export interface ShareAttributionClaimV0 extends ShareAttributionParamsV0 {
  /** 来源名片：访客落地时分享路由里的那一段，原样（落地时记下，认领时带上）。 */
  cardRef: string;
}
/** 服务端和客户端共用：认领请求体；任何一项不对都返回 null（服务端回 400，不记录）。多出来的键丢掉。 */
export function decodeShareAttributionClaimV0(value: unknown): ShareAttributionClaimV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { cardRef, via, ch } = record;
  if (typeof cardRef !== 'string' || !(CARD_REF_UUID.test(cardRef) || CARD_REF_EXTERNAL.test(cardRef))) return null;
  if (!isVia(via) || !isChannel(ch)) return null;
  return { cardRef, via, ch };
}
/**
 * 认领的结果。`recorded: false` 时 `reason` 说明原因；客户端不用区分，失败也不提示访客。
 * - `disabled`：服务端开关关着；
 * - `not_new`：账户不是刚注册的；
 * - `already_claimed`：这个账户认领过了；
 * - `card_unavailable`：名片不存在或现在不公开；
 * - `own_card`：名片是自己的。
 */
export const SHARE_ATTRIBUTION_CLAIM_REASONS_V0 = ['disabled', 'not_new', 'already_claimed', 'card_unavailable', 'own_card'] as const;
export type ShareAttributionClaimReasonV0 = (typeof SHARE_ATTRIBUTION_CLAIM_REASONS_V0)[number];
export interface ShareAttributionClaimResultV0 {
  recorded: boolean;
  reason?: ShareAttributionClaimReasonV0;
}
export interface ShareAttributionSummaryV0 {
  agentAccountId: string;
  windowDays: typeof SHARE_ATTRIBUTION_SUMMARY_WINDOW_DAYS;
  /** 窗口内经这张名片注册的新账户数。 */
  signups: number;
  /** 按渠道分（没有的渠道是 0）。 */
  byChannel: Record<ShareAttributionChannelV0, number>;
}
/** 客户端用：主人计数；任何一项不对返回 null（界面不显示这一块）。 */
export function decodeShareAttributionSummaryV0(value: unknown): ShareAttributionSummaryV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (typeof record.agentAccountId !== 'string' || !CARD_REF_UUID.test(record.agentAccountId)) return null;
  if (record.windowDays !== SHARE_ATTRIBUTION_SUMMARY_WINDOW_DAYS || !count(record.signups)) return null;
  const by = record.byChannel;
  if (!by || typeof by !== 'object' || Array.isArray(by)) return null;
  const byChannel = {} as Record<ShareAttributionChannelV0, number>;
  for (const channel of SHARE_ATTRIBUTION_CHANNELS_V0) {
    const n = (by as Record<string, unknown>)[channel] ?? 0;
    if (!count(n)) return null;
    byChannel[channel] = n;
  }
  const total = SHARE_ATTRIBUTION_CHANNELS_V0.reduce((sum, channel) => sum + byChannel[channel], 0);
  if (total !== record.signups) return null;
  return { agentAccountId: record.agentAccountId, windowDays: SHARE_ATTRIBUTION_SUMMARY_WINDOW_DAYS, signups: record.signups, byChannel };
}
