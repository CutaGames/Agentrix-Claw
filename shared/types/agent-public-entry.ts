/**
 * 一个 Agent 的公开入口：`/share/agent/<slug>` 解析成"这只 Agent 公开了什么"，以及分身名片的
 * 收录列表（合同 v1 草案；产品文档 7.4、7.5，D17，REQ-web-013，E56）。
 *
 * 一个 URL 两个视图：人看分身名片，Agent 看 Agent 护照（A2A card）。以前 slug 有两种意思：
 * 外部编号（`AGT-…`）只显示护照，账户 UUID（分身工作台打印的 `shareRoute`）只显示分身。
 * 现在两种 slug 都先调这里：
 *
 *   GET /api/v1/public/agents/:slug          → { success: true, data: AgentPublicEntryV1 }
 *   GET /api/v1/public/agents/indexed        → { success: true, data: AgentPublicIndexedPageV1 }（`?cursor=`）
 *
 * 规则：
 * - 匿名：不需要登录，不读 cookie，响应不因调用方而变（Web 服务端 `getServerSideProps` 直接调）。
 *   `Cache-Control: no-store`：急停、取消公开要马上反映到页面的 robots 上。
 * - 防枚举：slug 格式不对、Agent 不存在、Agent 不是 active，一律 404
 *   `{ code: 'agent_public_not_found' }`，响应体完全一样。格式不对的 slug 不查库。
 * - 只有 active 的 Agent 有公开入口，和 A2A card（`getPublicByRef`）一致。分身投影
 *   `GET /v1/public/twin/agents/:agentId` 实现时对非 active 的 Agent 也改成同样的 404。
 * - 分身的 `shareRoute` 改成 `/share/agent/<外部编号>`。旧的 UUID 链接继续能用：Web 用这里的
 *   `canonicalPath` 做 308 跳转（`?g=` 只出现在外部编号链接上，跳转时原样带上查询串）。
 * - 返回的 id 只有外部编号；账户 UUID 只在分身已公开（`available` / `paused`）时给出，因为访客
 *   问答、留联系方式的接口按它寻址。
 * - robots：护照视图永远 `noindex`；分身视图只有 `twin.indexing === 'index'` 时才 `index`；任何
 *   情况都带 `noarchive`（`agentPublicRobotsV1`）。
 * - 收录列表只含此刻 `effectiveDigitalTwinIndexingV1` 为 `index` 的分身（服务端逐条按实时状态算，
 *   不信存储值），Web 用它输出 sitemap。取消公开或暂停的分身下一次读就不在列表里。
 */
import {
  DIGITAL_TWIN_INDEXING_VALUES_V1,
  DIGITAL_TWIN_PUBLIC_STATES_V1,
  type DigitalTwinIndexingV1,
  type DigitalTwinPublicStateV1,
} from './digital-twin-public';

export const AGENT_PUBLIC_ENTRY_SCHEMA_VERSION = 'agentrix.public-entry.v1' as const;
export const AGENT_PUBLIC_NOT_FOUND_CODE = 'agent_public_not_found' as const;
export const AGENT_PUBLIC_SHARE_PATH_PREFIX = '/share/agent/' as const;
/** Web 自己用的 slug（`/share/agent/card?c=` 是本机生成的卡片），不查库。 */
export const AGENT_PUBLIC_RESERVED_SLUGS: readonly string[] = ['card', 'indexed'];
export const AGENT_PUBLIC_INDEXED_PAGE_MAX = 1000;

export const AGENT_ACCOUNT_ID_PATTERN_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 外部编号：`AGT-<时间戳>-<随机>`、`PET-AGT-…` 和历史导入的编号。只允许这些字符，按原值精确查。 */
export const AGENT_EXTERNAL_ID_PATTERN_V1 = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;

export type AgentPublicSlugV1 = { kind: 'account_id'; value: string } | { kind: 'external_id'; value: string };

/** `null`：不是合法 slug，直接 404，不查库。 */
export function classifyAgentPublicSlugV1(input: unknown): AgentPublicSlugV1 | null {
  if (typeof input !== 'string') return null;
  const slug = input.trim();
  if (!slug || slug.length > 80 || AGENT_PUBLIC_RESERVED_SLUGS.includes(slug)) return null;
  if (AGENT_ACCOUNT_ID_PATTERN_V1.test(slug)) return { kind: 'account_id', value: slug.toLowerCase() };
  if (AGENT_EXTERNAL_ID_PATTERN_V1.test(slug)) return { kind: 'external_id', value: slug };
  return null;
}

export function agentPublicCanonicalPathV1(externalId: string): string {
  return `${AGENT_PUBLIC_SHARE_PATH_PREFIX}${encodeURIComponent(externalId)}`;
}

export type AgentPublicTwinEntryV1 =
  | {
      state: Exclude<DigitalTwinPublicStateV1, 'unavailable'>;
      /** 访客问答、留联系方式的接口按它寻址；只在分身已公开时给出。 */
      agentAccountId: string;
      /** `index` 只可能出现在 `available` 上。 */
      indexing: DigitalTwinIndexingV1;
    }
  | { state: 'unavailable' };

export type AgentPublicViewV1 = 'twin' | 'passport';

export interface AgentPublicEntryV1 {
  schemaVersion: typeof AGENT_PUBLIC_ENTRY_SCHEMA_VERSION;
  /** 外部编号（护照、A2A card 用它）。 */
  externalId: string;
  /** `/share/agent/<外部编号>`；slug 不是它时 Web 308 跳过去。 */
  canonicalPath: string;
  twin: AgentPublicTwinEntryV1;
  /** 人默认看到的视图：分身已公开（含已暂停，页面显示"已暂停"）时是分身名片，否则是护照。 */
  defaultView: AgentPublicViewV1;
}

/** 服务端读到的事实。`agent` 为 `null` 表示不存在。 */
export interface AgentPublicEntryFactsV1 {
  agent: { externalId: string; agentAccountId: string; active: boolean } | null;
  /** 实时的公开闸门（`PublicTwinService.gate`）和 `effectiveDigitalTwinIndexingV1` 的结果。 */
  twin: { state: DigitalTwinPublicStateV1; indexing: DigitalTwinIndexingV1 };
}

/** 服务端用它组装响应；`null` 一律回同一个 404。 */
export function buildAgentPublicEntryV1(facts: AgentPublicEntryFactsV1): AgentPublicEntryV1 | null {
  const agent = facts.agent;
  if (!agent || !agent.active || !AGENT_EXTERNAL_ID_PATTERN_V1.test(agent.externalId)) return null;
  const twin: AgentPublicTwinEntryV1 =
    facts.twin.state === 'unavailable'
      ? { state: 'unavailable' }
      : {
          state: facts.twin.state,
          agentAccountId: agent.agentAccountId,
          indexing: facts.twin.state === 'available' && facts.twin.indexing === 'index' ? 'index' : 'noindex',
        };
  return {
    schemaVersion: AGENT_PUBLIC_ENTRY_SCHEMA_VERSION,
    externalId: agent.externalId,
    canonicalPath: agentPublicCanonicalPathV1(agent.externalId),
    twin,
    defaultView: twin.state === 'unavailable' ? 'passport' : 'twin',
  };
}

export type AgentPublicEntryDecodeResultV1 = { ok: true; value: AgentPublicEntryV1 } | { ok: false; reason: string };

/** 消费端解码：只拿已知字段，任何一条规则不对就整条拒绝（Web 按"入口读不到"处理，只显示护照）。 */
export function decodeAgentPublicEntryV1(input: unknown): AgentPublicEntryDecodeResultV1 {
  if (!isRecord(input)) return { ok: false, reason: 'shape' };
  if (input.schemaVersion !== AGENT_PUBLIC_ENTRY_SCHEMA_VERSION) return { ok: false, reason: 'schema' };
  const externalId = input.externalId;
  if (typeof externalId !== 'string' || !AGENT_EXTERNAL_ID_PATTERN_V1.test(externalId)) return { ok: false, reason: 'externalId' };
  if (input.canonicalPath !== agentPublicCanonicalPathV1(externalId)) return { ok: false, reason: 'canonicalPath' };
  const rawTwin = input.twin;
  if (!isRecord(rawTwin) || !(DIGITAL_TWIN_PUBLIC_STATES_V1 as readonly unknown[]).includes(rawTwin.state)) return { ok: false, reason: 'twin.state' };
  let twin: AgentPublicTwinEntryV1;
  if (rawTwin.state === 'unavailable') {
    if ('agentAccountId' in rawTwin || 'indexing' in rawTwin) return { ok: false, reason: 'twin:unavailable_has_fields' };
    twin = { state: 'unavailable' };
  } else {
    const state = rawTwin.state as Exclude<DigitalTwinPublicStateV1, 'unavailable'>;
    const agentAccountId = rawTwin.agentAccountId;
    const indexing = rawTwin.indexing;
    if (typeof agentAccountId !== 'string' || !AGENT_ACCOUNT_ID_PATTERN_V1.test(agentAccountId)) return { ok: false, reason: 'twin.agentAccountId' };
    if (!(DIGITAL_TWIN_INDEXING_VALUES_V1 as readonly unknown[]).includes(indexing)) return { ok: false, reason: 'twin.indexing' };
    if (indexing === 'index' && state !== 'available') return { ok: false, reason: 'twin.indexing:only_when_available' };
    twin = { state, agentAccountId, indexing: indexing as DigitalTwinIndexingV1 };
  }
  const defaultView: AgentPublicViewV1 = twin.state === 'unavailable' ? 'passport' : 'twin';
  if (input.defaultView !== defaultView) return { ok: false, reason: 'defaultView' };
  return { ok: true, value: { schemaVersion: AGENT_PUBLIC_ENTRY_SCHEMA_VERSION, externalId, canonicalPath: input.canonicalPath, twin, defaultView } };
}

/** Web 服务端输出的 `<meta name="robots">` 和 `X-Robots-Tag`。入口读不到（`null`）按护照处理。 */
export function agentPublicRobotsV1(view: AgentPublicViewV1, entry: AgentPublicEntryV1 | null): 'index, noarchive' | 'noindex, noarchive' {
  if (view !== 'twin' || !entry || entry.twin.state !== 'available') return 'noindex, noarchive';
  return entry.twin.indexing === 'index' ? 'index, noarchive' : 'noindex, noarchive';
}

// ---------------------------------------------------------------------------
// 收录列表（sitemap 用）

export interface AgentPublicIndexedItemV1 {
  externalId: string;
  canonicalPath: string;
  /** 分身名片最后一次变化：公开时间和打开收录时间里较晚的那个。 */
  lastModified: string;
}

export interface AgentPublicIndexedPageV1 {
  schemaVersion: typeof AGENT_PUBLIC_ENTRY_SCHEMA_VERSION;
  items: AgentPublicIndexedItemV1[];
  /** 不透明游标；`null` 表示没有下一页。 */
  nextCursor: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
