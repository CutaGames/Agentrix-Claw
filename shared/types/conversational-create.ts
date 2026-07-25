/**
 * ConversationalCreateResult —— 对话式创作结果的跨端单一来源
 * （world-growth-mobile-experience · task 4.1 · Requirement 6.1/6.2/6.6）。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   §Components and Interfaces 7（Conversational_Create_Card）。
 *
 * 这是 `create_shop` / `create_place` 工具结果透出到聊天流时**唯一权威的字段形状**，
 * 由以下三处共用（AGENTS.md 硬规则 2：两条 chat 路径必须同步）：
 *   1. `/openclaw/proxy/:id/stream`（`openclaw-proxy.service.ts`，task 4.2）；
 *   2. `/claude/chat`（`ai-integration/claude/claude-integration.service.ts`，task 4.3）；
 *   3. 移动端 `components/agent/ConversationalCreateCard`（task 8）。
 *
 * 设计约束：**零依赖、纯类型**，可同时被后端（NestJS）与移动端（RN）导入，避免口径漂移。
 *
 * ── 与既有 ConversationalAuthoringResult 的状态映射 ──────────────────────────
 * 后端编排层（`ConversationalAuthoringService` / `conversational-authoring.tools.ts`）产出的
 * `ConversationalAuthoringResult.status` 有 5 个取值，透出到 chat 流时收敛为本类型的
 * 4-state 契约（对话卡片只需区分「成功 / 追问 / 被拒 / 失败」四态）：
 *
 *   ConversationalAuthoringStatus  →  ConversationalCreateResult.status
 *   ─────────────────────────────     ─────────────────────────────────
 *   'published'                    →  'created'          // 已开店🎉 / 已建成🎉
 *   'need_more_info'               →  'need_more_info'   // 追问缺失必填槽位
 *   'quality_rejected'             →  'rejected'         // 质量门未过（可读理由 + 补齐引导）
 *   'generation_failed'            →  'failed'           // 生成失败（保留可重试草稿）
 *   'error'                        →  'failed'           // 其它错误（发布/审核异常等）
 *
 * 映射由 task 4.2/4.3 的两条 chat 路径在透出时执行；本文件仅定义目标契约与字段。
 *
 * 注：除类型外，本文件还导出**单一权威的映射 + 解析纯函数**
 * （`mapAuthoringResultToConversationalCreate` / `extractConversationalCreate`，task 8.2），
 * 仅依赖同为 shared 的 `creation-cover`，可同时被后端与移动端导入。
 */
import { isRenderableCover } from './creation-cover';

/**
 * 透出到聊天流的结构化 meta 事件判别标记。
 *
 * 两条 chat 路径（`openclaw-proxy.service.ts` / `claude-integration.service.ts`）在
 * `create_shop`/`create_place` 工具执行后，除常规 `tool_result` 外，**额外**发送一条
 * `{ type: 'meta', kind: CONVERSATIONAL_CREATE_META_KIND, conversationalCreate: ConversationalCreateResult }`
 * 事件，供移动端 `ConversationalCreateCard`（task 8）消费。两条路径共用此常量与形状，
 * 保证字段一致（AGENTS.md 硬规则 2 / Requirement 6.6）。
 */
export const CONVERSATIONAL_CREATE_META_KIND = 'conversational_create';

/** 对话式创作结果的 4-state 契约（对话卡片据此渲染）。 */
export type ConversationalCreateStatus = 'created' | 'need_more_info' | 'rejected' | 'failed';

/**
 * `create_shop` / `create_place` 工具结果透出到聊天流的统一字段形状。
 *
 * 两条 chat 路径与移动端卡片共用此单一来源；各可选字段按 `status` 出现：
 *   - `status='created'`：`creationId` / `title` / `coverUrl` / `shareCode` /
 *     `landingUrl` / `deepLink` 齐备，用于渲染「已开店🎉 + 封面 + 分享链接 + 进入」。
 *   - `status='need_more_info'`：`missingRequired` 列出待补齐的必填槽位键。
 *   - `status='rejected' | 'failed'`：`reason` 给出可读理由 + 补齐引导。
 */
export interface ConversationalCreateResult {
  /** 结果状态（4-state 契约）。 */
  status: ConversationalCreateStatus;
  /** 已创建的 Creation id（status='created'，或进入生成阶段后可携带）。 */
  creationId?: string;
  /** 创作标题（status='created'）。 */
  title?: string;
  /** 可渲染的真实封面 URL（Real_Cover_Image，`https://` 开头；status='created'）。 */
  coverUrl?: string;
  /** 可分享短码（status='created'）。 */
  shareCode?: string;
  /** Web 落地页链接（status='created'）。 */
  landingUrl?: string;
  /** App 深链 `agentrix://world/creation/<shareCode>`（status='created'）。 */
  deepLink?: string;
  /** 仍缺失的必填槽位键（status='need_more_info'）——供逐项追问补齐。 */
  missingRequired?: string[];
  /** 面向用户的可读理由 + 补齐引导（status='rejected' | 'failed'）。 */
  reason?: string;
}

/**
 * 透出到聊天流的结构化 meta 事件形状（两条 chat 路径以完全一致的 envelope 发送，
 * 移动端据 `kind === CONVERSATIONAL_CREATE_META_KIND` 识别并渲染 ConversationalCreateCard）。
 */
export interface ConversationalCreateMetaEvent {
  type: 'meta';
  kind: typeof CONVERSATIONAL_CREATE_META_KIND;
  conversationalCreate: ConversationalCreateResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// 单一权威映射 + 解析（world-growth-mobile-experience · task 4.2/4.3/8.2）
//
// 把编排层的 5-state 会话式创作结果映射为透出到聊天流的 4-state 契约，并从各种
// chat 传输载荷（结构化 meta 事件 / 非流式 toolCalls / 直挂字段）中解析出
// {@link ConversationalCreateResult}。**放在跨端单一来源**，供：
//   - 后端两条 chat 路径（`openclaw-proxy.service` / `claude-integration.controller`，
//     经 `conversational-authoring.tools` re-export）；
//   - 移动端两条传输（`services/openclaw.service`、`services/unifiedAgent`）在
//     `AgentChatScreen` 渲染 ConversationalCreateCard。
// 共用同一份逻辑，保证两条路径以**一致字段与渲染**呈现（AGENTS.md 硬规则 2 / R6.6）。
// ─────────────────────────────────────────────────────────────────────────────

/** `create_shop` / `create_place` 平台工具规范名（两链路一致）。 */
export const CREATE_SHOP_TOOL_NAME = 'create_shop';
export const CREATE_PLACE_TOOL_NAME = 'create_place';

/** 会话式创作卡片渲染用的业态 kind（决定「已开店🎉」vs「已建成🎉」及封面 emoji）。 */
export type ConversationalCreateKind = 'shop' | 'place';

/**
 * 编排层会话式创作结果的**结构化子集**（跨端单一来源的映射入参形状）。
 * 后端 `ConversationalAuthoringResult`（5-state，含 kind/creationType/message）结构上可赋值到本形状。
 */
export interface AuthoringResultForCreate {
  /** 5-state：'published' | 'need_more_info' | 'quality_rejected' | 'generation_failed' | 'error'。 */
  status: string;
  creationId?: string;
  title?: string;
  coverUrl?: string;
  shareCode?: string;
  landingUrl?: string;
  deepLink?: string;
  missingRequired?: string[];
  /** 可读消息（追问提示 / 未过理由 / 失败理由）。 */
  message?: string;
}

/**
 * 把编排层的 5-state 结果映射为透出到聊天流的 4-state {@link ConversationalCreateResult}
 * ——两条 chat 路径共用的**单一权威映射**。纯函数、无副作用：
 *   published → created / need_more_info → need_more_info /
 *   quality_rejected → rejected / generation_failed | error → failed。
 */
export function mapAuthoringResultToConversationalCreate(
  raw: AuthoringResultForCreate,
): ConversationalCreateResult {
  const status: ConversationalCreateStatus =
    raw.status === 'published'
      ? 'created'
      : raw.status === 'need_more_info'
        ? 'need_more_info'
        : raw.status === 'quality_rejected'
          ? 'rejected'
          : 'failed'; // generation_failed | error

  const result: ConversationalCreateResult = { status };

  if (raw.creationId) result.creationId = raw.creationId;

  if (status === 'created') {
    if (raw.title) result.title = raw.title;
    if (raw.coverUrl && isRenderableCover(raw.coverUrl)) result.coverUrl = raw.coverUrl;
    if (raw.shareCode) result.shareCode = raw.shareCode;
    if (raw.landingUrl) result.landingUrl = raw.landingUrl;
    if (raw.deepLink) result.deepLink = raw.deepLink;
  } else if (status === 'need_more_info') {
    if (raw.missingRequired?.length) result.missingRequired = [...raw.missingRequired];
  } else {
    // rejected | failed —— 透出可读理由 + 补齐引导。
    if (raw.message) result.reason = raw.message;
  }

  return result;
}

/** 由工具名解析卡片业态 kind；非会话式创作工具返回 undefined。 */
export function toolNameToConversationalCreateKind(
  toolName?: string | null,
): ConversationalCreateKind | undefined {
  if (toolName === CREATE_SHOP_TOOL_NAME) return 'shop';
  if (toolName === CREATE_PLACE_TOOL_NAME) return 'place';
  return undefined;
}

/** 解析结果：4-state 契约 + （可得时的）业态 kind。 */
export interface ParsedConversationalCreate {
  result: ConversationalCreateResult;
  kind?: ConversationalCreateKind;
}

/** 判断一个对象是否已是 4-state 的 {@link ConversationalCreateResult}。 */
function isConversationalCreateResult(v: any): v is ConversationalCreateResult {
  return (
    !!v &&
    typeof v === 'object' &&
    (v.status === 'created' ||
      v.status === 'need_more_info' ||
      v.status === 'rejected' ||
      v.status === 'failed')
  );
}

/** 从（可能被包裹/序列化的）工具输出里取出 5-state 编排结果。 */
function unwrapAuthoringResult(out: any): AuthoringResultForCreate | null {
  let v = out;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  // 常见包裹：{ result }, { output }, { data }, { content: [{ text }] }。
  if (v.status === undefined) {
    v = v.result ?? v.output ?? v.data ?? v.toolResult ?? v;
  }
  if (v && typeof v === 'object' && typeof v.status === 'string') {
    return v as AuthoringResultForCreate;
  }
  return null;
}

/**
 * 从任意 chat 传输载荷中解析出 {@link ConversationalCreateResult}（两条路径统一入口）。
 *
 * 识别以下形状（按序）：
 *   1. 结构化 meta 事件 / legacy meta：`{ kind: CONVERSATIONAL_CREATE_META_KIND, conversationalCreate }`；
 *   2. 直挂字段：`{ conversationalCreate: ConversationalCreateResult }`；
 *   3. 载荷本身即 4-state 结果；
 *   4. 嵌套 `{ meta: {...} }`；
 *   5. 非流式 chat 响应的 `toolCalls[]`：命中 `create_shop`/`create_place` 后，
 *      把其 5-state 输出经单一映射转为 4-state（并据工具名带出 kind）。
 * 无法识别时返回 null。
 */
export function extractConversationalCreate(payload: any): ParsedConversationalCreate | null {
  if (!payload || typeof payload !== 'object') return null;

  // 1 + 2. meta envelope（结构化事件或 legacy meta）或直挂字段。
  if (
    payload.kind === CONVERSATIONAL_CREATE_META_KIND &&
    isConversationalCreateResult(payload.conversationalCreate)
  ) {
    return { result: payload.conversationalCreate as ConversationalCreateResult };
  }
  if (isConversationalCreateResult(payload.conversationalCreate)) {
    return { result: payload.conversationalCreate as ConversationalCreateResult };
  }

  // 3. 载荷本身即 4-state 结果。
  if (isConversationalCreateResult(payload)) {
    return { result: payload as ConversationalCreateResult };
  }

  // 4. 嵌套 meta。
  if (payload.meta && typeof payload.meta === 'object') {
    const fromMeta = extractConversationalCreate(payload.meta);
    if (fromMeta) return fromMeta;
  }

  // 5. 非流式 toolCalls[]（AgentChatScreen 走 `/openclaw/proxy/:id/chat` 的路径）。
  const toolCalls = Array.isArray(payload.toolCalls)
    ? payload.toolCalls
    : Array.isArray(payload.tool_calls)
      ? payload.tool_calls
      : null;
  if (toolCalls) {
    for (const call of toolCalls) {
      if (!call || typeof call !== 'object') continue;
      const name = call.name ?? call.toolName ?? call.function?.name;
      const kind = toolNameToConversationalCreateKind(name);
      if (!kind) continue;
      const rawOut = call.output ?? call.result ?? call.toolResult ?? call.response ?? call.content;
      const authoring = unwrapAuthoringResult(rawOut);
      if (authoring) {
        return { result: mapAuthoringResultToConversationalCreate(authoring), kind };
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConversationalCreateCard 视图模型派生（world-growth-mobile-experience · task 8）
//
// 把 4-state {@link ConversationalCreateResult}（+ 业态 kind）派生为对话卡片渲染所需的
// **纯视图模型**：据 status 判定四态、暴露各态应露出的可交互面（affordances）。
// 抽为跨端纯函数，使卡片渲染与其派生逻辑解耦、可在 pure-logic 套件中独立单测
// （RN 组件渲染受 mobile jest 纯逻辑 harness 限制，无法直接跑）。
//
//   - created         → shareCode / landingUrl / deepLink + 分享/进入入口 + 封面可渲染性（6.1/6.2/6.3）
//   - need_more_info  → missingRequired 追问列表（6.4）
//   - rejected/failed → reason 可读理由（isRejected 区分措辞）（6.5）
// ─────────────────────────────────────────────────────────────────────────────

/** 业态 kind → 封面 emoji（shop=🏪 / place=🏛️）——与卡片成功态标题措辞同源。 */
export function conversationalCreateKindEmoji(kind: ConversationalCreateKind): string {
  return kind === 'place' ? '🏛️' : '🏪';
}

/**
 * ConversationalCreateCard 的纯视图模型：据 `result.status` 派生四态与各态 affordances。
 * 不含运行时状态（如封面 `<Image>` 加载失败）与本地化文案——这些留给组件层。
 */
export interface ConversationalCreateCardViewModel {
  /** 渲染分支（4-state 契约）。 */
  variant: ConversationalCreateStatus;
  /** 业态 kind（决定 emoji 与成功态标题措辞）。 */
  kind: ConversationalCreateKind;
  /** 封面 emoji（渐变兜底封面与成功态用）。 */
  emoji: string;
  // ── created ──
  /** `coverUrl` 是否为可渲染 Real_Cover_Image（决定渲染真图 or 渐变兜底；绝不黑屏）。 */
  hasRenderableCover: boolean;
  /** 可渲染的真实封面 URL（仅当 hasRenderableCover）。 */
  coverUrl?: string;
  /** 创作标题（可空——组件层回退到占位文案）。 */
  title?: string;
  shareCode?: string;
  /** Web 落地页链接（可点击打开）。 */
  landingUrl?: string;
  deepLink?: string;
  /** 分享入口的目标 URL：优先 landingUrl，回退 deepLink，皆无则空串。 */
  shareUrl: string;
  /** 是否露出「一键分享」入口（有可分享 URL 时）。 */
  canShare: boolean;
  /** 是否携带 creationId（决定卡片能否默认导航「进入」CreationDetail）。 */
  hasCreationId: boolean;
  // ── need_more_info ──
  /** 待补齐的必填槽位键（追问列表；非 need_more_info 时为空数组）。 */
  missingRequired: string[];
  // ── rejected | failed ──
  /** rejected（质量门未过）vs failed（生成/其它失败）——区分措辞。 */
  isRejected: boolean;
  /** 面向用户的可读理由 + 补齐引导（rejected/failed）。 */
  reason?: string;
}

/**
 * 据 {@link ConversationalCreateResult}（+ 业态 kind）派生对话卡片纯视图模型。
 * 纯函数、无副作用：四态判定 + 各态 affordances 的单一权威派生。
 */
export function conversationalCreateCardViewModel(
  result: ConversationalCreateResult,
  kind: ConversationalCreateKind = 'shop',
): ConversationalCreateCardViewModel {
  const shareUrl = result.landingUrl || result.deepLink || '';
  return {
    variant: result.status,
    kind,
    emoji: conversationalCreateKindEmoji(kind),
    hasRenderableCover: isRenderableCover(result.coverUrl),
    coverUrl: result.coverUrl,
    title: result.title,
    shareCode: result.shareCode,
    landingUrl: result.landingUrl,
    deepLink: result.deepLink,
    shareUrl,
    canShare: shareUrl.length > 0,
    hasCreationId: typeof result.creationId === 'string' && result.creationId.length > 0,
    missingRequired:
      result.status === 'need_more_info' && result.missingRequired ? [...result.missingRequired] : [],
    isRejected: result.status === 'rejected',
    reason: result.status === 'rejected' || result.status === 'failed' ? result.reason : undefined,
  };
}
