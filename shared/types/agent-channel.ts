/**
 * A2 渠道自动回复，合同 v0 草案（E98，REQ-backend-092）。**只有合同，没有实现。**
 *
 * 平台机器人（Telegram 平台 bot、WhatsApp 平台号）把聊天接到 Agent 或分身上：
 * - 主人绑定一个聊天：App 里要一次性绑定码 → 在那个聊天里用**已关联的** Telegram 账号发 `/bind <码>` →
 *   服务端核对"码是你的"和"发信人是你"两项，都对才建绑定（`agent_channel_bindings`，迁移 2006）。
 *   没有证明的绑定一律不路由；旧路由 `POST agent-presence/agents/:id/channels` 在新流程上线后返回 410。
 * - 访客找分身：分享页 / 名片上的深链（`t.me/<bot>?start=tw_<码>`、`wa.me/<号>?text=TW-<码>`）。
 * - 三档：观察（只记录）/ 助理（出草稿，主人逐条批准）/ 代表（自动发）。
 *   分身模式的代表 = 公开分身回答（同一套门槛）；Agent 模式的代表要 `channel.reply.send` 授权，
 *   而且在它自己的开关（`AGENT_CHANNEL_AGENT_REPRESENT_FLAG_V0`，默认关）后面；关着时按助理执行，并告诉主人原因。
 * - 自动发出的消息都标明是 Agent 或分身发的；急停覆盖渠道回复；每个聊天都限频。
 * 消费方：web（渠道绑定设置）、mobile（渠道收件箱、草稿批准）。
 */

export const AGENT_CHANNEL_PLATFORMS_V0 = ['telegram', 'whatsapp'] as const;
export type AgentChannelPlatformV0 = (typeof AGENT_CHANNEL_PLATFORMS_V0)[number];
export const AGENT_CHANNEL_MODES_V0 = ['twin', 'agent'] as const;
export type AgentChannelModeV0 = (typeof AGENT_CHANNEL_MODES_V0)[number];
export const AGENT_CHANNEL_TIERS_V0 = ['observe', 'assist', 'represent'] as const;
export type AgentChannelTierV0 = (typeof AGENT_CHANNEL_TIERS_V0)[number];
export const AGENT_CHANNEL_CHAT_KINDS_V0 = ['private', 'group'] as const;
export type AgentChannelChatKindV0 = (typeof AGENT_CHANNEL_CHAT_KINDS_V0)[number];

/** 整个 A2 的开关（默认关）。 */
export const AGENT_CHANNEL_V0_FLAG = 'AGENT_CHANNEL_V0_ENABLED';
/** Agent 模式的代表档（风险最高的一条路，E98 ③），默认关。 */
export const AGENT_CHANNEL_AGENT_REPRESENT_FLAG_V0 = 'AGENT_CHANNEL_AGENT_REPRESENT_ENABLED';
/** WhatsApp 访客（平台号，Cloud API），默认关。 */
export const AGENT_CHANNEL_WHATSAPP_FLAG_V0 = 'AGENT_CHANNEL_WHATSAPP_ENABLED';

/** 观察档里，群里别人的消息正文最多存 30 天（E98 ②）。 */
export const AGENT_CHANNEL_OBSERVE_RETENTION_DAYS_V0 = 30;
/** 每个聊天每分钟最多自动发几条（超了就只记录，不发）。 */
export const AGENT_CHANNEL_AUTO_REPLIES_PER_CHAT_PER_MINUTE_V0 = 6;
/** 访客会话：最后一条消息后多久内还算"在和这只分身说话"。 */
export const AGENT_CHANNEL_VISITOR_SESSION_HOURS_V0 = 24;
/** WhatsApp 只在访客最后一条消息后的 24 小时内回复（不用模板消息）。 */
export const AGENT_CHANNEL_WHATSAPP_REPLY_WINDOW_HOURS_V0 = 24;

export type AgentChannelEffectiveReasonV0 = 'agent_represent_disabled' | null;

/**
 * 实际按哪一档执行。Agent 模式选了代表、但代表开关关着：按助理执行，`reason` 告诉主人为什么。
 * 分身模式的代表不受这个开关影响（它走公开分身回答的门槛）。
 */
export function agentChannelEffectiveTierV0(
  mode: AgentChannelModeV0,
  tier: AgentChannelTierV0,
  flags: Readonly<Record<string, string | undefined>>,
): { tier: AgentChannelTierV0; reason: AgentChannelEffectiveReasonV0 } {
  if (mode === 'agent' && tier === 'represent' && flags[AGENT_CHANNEL_AGENT_REPRESENT_FLAG_V0] !== '1') {
    return { tier: 'assist', reason: 'agent_represent_disabled' };
  }
  return { tier, reason: null };
}

/** 选代表档（任何模式）要最近登录（E84 B）；降档和解绑不要。 */
export function agentChannelTierChangeNeedsStepUpV0(from: AgentChannelTierV0 | null, to: AgentChannelTierV0): boolean {
  return to === 'represent' && from !== 'represent';
}

// ── 绑定码 ───────────────────────────────────────────────────────────────────────────

/**
 * `POST /api/agent-channels/bind-codes`（本人登录凭据；`tier: 'represent'` 要最近登录）。
 * 码 8 位，去掉了容易认错的字符（没有 0 / O / 1 / I / L），10 分钟，只能用一次；服务端只存哈希。
 * 每个 Telegram 账号的 `/bind` 尝试按 `AGENT_CHANNEL_BIND_ATTEMPTS_PER_HOUR_V0` 限频；错的码不说是过期还是不存在。
 */
export const AGENT_CHANNEL_ROUTES_V0 = {
  createBindCode: 'POST /api/agent-channels/bind-codes',
  listBindings: 'GET /api/agent-channels/bindings?agentAccountId=<uuid>',
  updateBinding: 'PATCH /api/agent-channels/bindings/:bindingRef',
  revokeBinding: 'POST /api/agent-channels/bindings/:bindingRef/revoke',
  listMessages: 'GET /api/agent-channels/bindings/:bindingRef/messages',
  approveDraft: 'POST /api/agent-channels/drafts/:draftRef/approve',
  rejectDraft: 'POST /api/agent-channels/drafts/:draftRef/reject',
  twinVisitorCode: 'POST /api/agent-channels/twin-codes',
} as const;
export const AGENT_CHANNEL_BIND_CODE_PATTERN_V0 = /^[2-9A-HJKMNP-Z]{8}$/;
export const AGENT_CHANNEL_BIND_CODE_TTL_SECONDS_V0 = 10 * 60;
export const AGENT_CHANNEL_BIND_ATTEMPTS_PER_HOUR_V0 = 10;

export interface AgentChannelBindCodeCommandV0 {
  agentAccountId: string;
  platform: 'telegram';
  mode: AgentChannelModeV0;
  tier: AgentChannelTierV0;
}
export interface AgentChannelBindCodeV0 {
  /** 只在这一次响应里出现。 */
  code: string;
  expiresAt: string;
  /** 主人在聊天里要发的那一行。 */
  command: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isOneOf<T extends string>(value: unknown, set: readonly T[]): value is T {
  return typeof value === 'string' && (set as readonly string[]).includes(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

/** 服务端用：解码要绑定码的请求；v0 只有 Telegram 能绑（WhatsApp v0 只给分身访客）。多出来的键丢掉。 */
export function decodeAgentChannelBindCodeCommandV0(value: unknown): AgentChannelBindCodeCommandV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (value.platform !== 'telegram') return null;
  if (!isOneOf(value.mode, AGENT_CHANNEL_MODES_V0) || !isOneOf(value.tier, AGENT_CHANNEL_TIERS_V0)) return null;
  return { agentAccountId: value.agentAccountId, platform: 'telegram', mode: value.mode, tier: value.tier };
}

/** 服务端用：从聊天里的一行读出 `/bind <码>`（也认 `/bind@机器人名 <码>`、码的小写）。不是就返回 null。 */
export function parseAgentChannelBindCommandV0(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const match = /^\/bind(?:@[A-Za-z0-9_]{5,32})?\s+([2-9A-Za-z]{8})\s*$/.exec(text.trim());
  if (!match) return null;
  const code = match[1].toUpperCase();
  return AGENT_CHANNEL_BIND_CODE_PATTERN_V0.test(code) ? code : null;
}

// ── 绑定的读模型 ─────────────────────────────────────────────────────────────────────

export const AGENT_CHANNEL_BINDING_STATUSES_V0 = ['active', 'revoked', 'bot_removed'] as const;
export type AgentChannelBindingStatusV0 = (typeof AGENT_CHANNEL_BINDING_STATUSES_V0)[number];

export interface AgentChannelBindingViewV0 {
  bindingRef: string;
  agentAccountId: string;
  platform: AgentChannelPlatformV0;
  chatKind: AgentChannelChatKindV0;
  /** 群名或者"私聊"；不放手机号、用户名。 */
  chatLabel: string;
  mode: AgentChannelModeV0;
  tier: AgentChannelTierV0;
  /** 实际执行的档位（`agentChannelEffectiveTierV0`）。 */
  effectiveTier: AgentChannelTierV0;
  effectiveReason: AgentChannelEffectiveReasonV0;
  proof: { method: 'telegram_bind_code'; at: string };
  status: AgentChannelBindingStatusV0;
  boundAt: string;
}

/** web / mobile 用：解码一条绑定。任何一项不对返回 null（不显示这一条）。 */
export function decodeAgentChannelBindingViewV0(value: unknown): AgentChannelBindingViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.bindingRef !== 'string' || !/^acb_[0-9a-f]{32}$/.test(value.bindingRef)) return null;
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return null;
  if (!isOneOf(value.platform, AGENT_CHANNEL_PLATFORMS_V0) || !isOneOf(value.chatKind, AGENT_CHANNEL_CHAT_KINDS_V0)) return null;
  if (typeof value.chatLabel !== 'string' || value.chatLabel.trim().length === 0 || value.chatLabel.length > 80) return null;
  if (!isOneOf(value.mode, AGENT_CHANNEL_MODES_V0) || !isOneOf(value.tier, AGENT_CHANNEL_TIERS_V0) || !isOneOf(value.effectiveTier, AGENT_CHANNEL_TIERS_V0)) return null;
  if (value.effectiveReason !== null && value.effectiveReason !== 'agent_represent_disabled') return null;
  // The effective tier can only be the chosen one or a step down from represent to assist, never wider.
  if (value.effectiveTier !== value.tier && !(value.tier === 'represent' && value.effectiveTier === 'assist' && value.effectiveReason === 'agent_represent_disabled')) return null;
  const proof = value.proof;
  if (!isRecord(proof) || proof.method !== 'telegram_bind_code' || !isIso(proof.at)) return null;
  if (!isOneOf(value.status, AGENT_CHANNEL_BINDING_STATUSES_V0) || !isIso(value.boundAt)) return null;
  return value as unknown as AgentChannelBindingViewV0;
}

// ── 访客深链 ─────────────────────────────────────────────────────────────────────────

/**
 * 每只分身一个公开码（不是密钥）：`POST …/twin-codes` 重新生成，旧码立即作废。
 * Telegram：`https://t.me/<bot>?start=tw_<码>`（start 参数只能是 A–Z a–z 0–9 _ -，最长 64）。
 * WhatsApp：`https://wa.me/<号码>?text=TW-<码>`，访客发出的第一条就是这一行。
 */
export const AGENT_CHANNEL_TWIN_CODE_PATTERN_V0 = /^[a-z0-9]{10}$/;

export function agentChannelTelegramTwinLinkV0(botUsername: string, code: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(botUsername) || !AGENT_CHANNEL_TWIN_CODE_PATTERN_V0.test(code)) {
    throw new Error('agent channel: bad bot username or twin code');
  }
  return `https://t.me/${botUsername}?start=tw_${code}`;
}

export function agentChannelWhatsAppTwinLinkV0(phoneDigits: string, code: string): string {
  if (!/^[1-9][0-9]{6,14}$/.test(phoneDigits) || !AGENT_CHANNEL_TWIN_CODE_PATTERN_V0.test(code)) {
    throw new Error('agent channel: bad number or twin code');
  }
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(`TW-${code}`)}`;
}

/**
 * 服务端用：访客发来的第一条是不是"进入分身"的指令。Telegram 是 `/start tw_<码>`，WhatsApp 是 `TW-<码>`。
 * 别的内容（包括主人的 `/bind`）返回 null。
 */
export function parseAgentChannelTwinEntryV0(platform: AgentChannelPlatformV0, text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  const match = platform === 'telegram' ? /^\/start tw_([a-z0-9]{10})$/.exec(trimmed) : /^TW-([a-z0-9]{10})$/i.exec(trimmed);
  if (!match) return null;
  const code = match[1].toLowerCase();
  return AGENT_CHANNEL_TWIN_CODE_PATTERN_V0.test(code) ? code : null;
}

/** WhatsApp：现在还能不能回（访客最后一条消息后 24 小时内）。时间读不出来就不能。 */
export function agentChannelWhatsAppCanReplyV0(lastVisitorMessageAt: string | null, nowMs: number): boolean {
  if (!lastVisitorMessageAt) return false;
  const at = Date.parse(lastVisitorMessageAt);
  return Number.isFinite(at) && at <= nowMs && nowMs - at < AGENT_CHANNEL_WHATSAPP_REPLY_WINDOW_HOURS_V0 * 3600 * 1000;
}

// ── 要说给人听的几句话（E98 ②） ──────────────────────────────────────────────────────

export type AgentChannelLanguageV0 = 'zh' | 'en';

/** 访客会话的第一条回复：这是谁的分身、是 AI、能转给本人。切换到另一只分身时再说一次。 */
export function agentChannelTwinDisclosureV0(language: AgentChannelLanguageV0, ownerDisplayName: string): string {
  const name = sanitizeDisplayName(ownerDisplayName);
  return language === 'zh'
    ? `你好，我是 ${name} 的 AI 分身，不是 ${name} 本人。我按 ${name} 公开的资料回答；需要本人处理的，我会帮你转给 ${name}。`
    : `Hi, I'm ${name}'s AI twin, not ${name} in person. I answer from what ${name} has made public, and I can pass things on to ${name} when they need a person.`;
}

/** 群里绑定成功后，机器人在群里发的一行：谁的 Agent、哪一档、怎么解绑。 */
export function agentChannelGroupNoticeV0(
  language: AgentChannelLanguageV0,
  input: { ownerDisplayName: string; mode: AgentChannelModeV0; effectiveTier: AgentChannelTierV0 },
): string {
  const name = sanitizeDisplayName(input.ownerDisplayName);
  const what = input.mode === 'twin' ? (language === 'zh' ? 'AI 分身' : 'AI twin') : language === 'zh' ? 'AI Agent' : 'AI agent';
  const tier = {
    zh: { observe: '只看，不回复', assist: '起草回复，由本人确认后发出', represent: '会自动回复' },
    en: { observe: 'reads only, does not reply', assist: 'drafts replies that the owner sends', represent: 'replies on its own' },
  }[language][input.effectiveTier];
  return language === 'zh'
    ? `这个群接上了 ${name} 的 ${what}（${tier}）。它发的消息都会标明是 AI。${name} 可以发 /unbind 解除；把机器人移出群也会解除。`
    : `This group is now connected to ${name}'s ${what} (${tier}). Its messages are always marked as AI. ${name} can send /unbind to disconnect; removing the bot also disconnects it.`;
}

/** 自动发出的消息前面加的标注（不冒充本人）。 */
export function agentChannelAutoLabelV0(language: AgentChannelLanguageV0, mode: AgentChannelModeV0, ownerDisplayName: string): string {
  const name = sanitizeDisplayName(ownerDisplayName);
  if (language === 'zh') return mode === 'twin' ? `［${name} 的 AI 分身］` : `［${name} 的 AI Agent］`;
  return mode === 'twin' ? `[${name}'s AI twin]` : `[${name}'s AI agent]`;
}

function sanitizeDisplayName(value: string): string {
  // Display names go into messages other people read: no markup, no links, short.
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>[\]()*_`~|\\]/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : 'Agentrix';
}

// ── 收件箱里的消息和草稿（mobile） ─────────────────────────────────────────────────────

export const AGENT_CHANNEL_MESSAGE_STATES_V0 = ['received', 'draft_pending', 'sent', 'draft_rejected', 'send_failed', 'rate_limited'] as const;
export type AgentChannelMessageStateV0 = (typeof AGENT_CHANNEL_MESSAGE_STATES_V0)[number];

export interface AgentChannelMessageViewV0 {
  messageRef: string;
  bindingRef: string;
  direction: 'inbound' | 'outbound';
  /** 发信人的显示名（群里别人）或"访客"；不放手机号。 */
  senderLabel: string;
  /** 过了保存期或被主人删除时为 null（只剩"有过一条消息"）。 */
  text: string | null;
  state: AgentChannelMessageStateV0;
  /** 出站消息：谁发的。 */
  sentBy: 'owner' | 'agent' | 'twin' | null;
  /** `draft_pending` 时：用来批准 / 拒绝的草稿编号。 */
  draftRef: string | null;
  createdAt: string;
}

/** mobile 用：解码一条消息。状态和字段要对得上（草稿必须有 `draftRef`，入站没有 `sentBy`）。 */
export function decodeAgentChannelMessageViewV0(value: unknown): AgentChannelMessageViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.messageRef !== 'string' || !/^acm_[0-9a-f]{32}$/.test(value.messageRef)) return null;
  if (typeof value.bindingRef !== 'string' || !/^acb_[0-9a-f]{32}$/.test(value.bindingRef)) return null;
  if (value.direction !== 'inbound' && value.direction !== 'outbound') return null;
  if (typeof value.senderLabel !== 'string' || value.senderLabel.length > 80) return null;
  if (value.text !== null && (typeof value.text !== 'string' || value.text.length > 4096)) return null;
  if (!isOneOf(value.state, AGENT_CHANNEL_MESSAGE_STATES_V0)) return null;
  if (value.direction === 'inbound' ? value.state !== 'received' || value.sentBy !== null : value.state === 'received' || !isOneOf(value.sentBy, ['owner', 'agent', 'twin'] as const)) return null;
  if (value.state === 'draft_pending' ? typeof value.draftRef !== 'string' || !/^acd_[0-9a-f]{32}$/.test(value.draftRef) : value.draftRef !== null) return null;
  if (!isIso(value.createdAt)) return null;
  return value as unknown as AgentChannelMessageViewV0;
}

/** 草稿批准的请求体：可以改字（1–4096 字）；不带就按原稿发。只认本人登录凭据。 */
export function decodeAgentChannelDraftApproveV0(value: unknown): { text?: string } | null {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return null;
  if (value.text === undefined) return {};
  if (typeof value.text !== 'string') return null;
  const text = value.text.trim();
  return text.length > 0 && text.length <= 4096 ? { text } : null;
}
