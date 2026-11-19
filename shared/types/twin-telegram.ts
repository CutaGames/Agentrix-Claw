/**
 * 「在 Telegram 里也能接」v0 的合同（设计 `.agents/tasks/twin-social-net/telegram-design.md`）。
 *
 * 发起人拿到的个人链接（「问遍身边人」和「分身们商量」的链接码）可以换成一条 Telegram 链接：
 * `https://t.me/<机器人>?start=a_<码>`（提问）或 `…?start=h_<码>`（商量）。朋友点开就进到机器人的私聊，
 * 点按钮选时间、确认来不来、回一句话。底下走的就是链接页那套入口，规矩一样：答案标「未验证」，可以撤回。
 *
 * - 机器人不主动找人：对方没点开过，它发不了消息。链接还是发起人自己转。
 * - 服务器不存对方的 Telegram 账号；「正在答哪一条」只在内存里记一会儿。
 * - 例外是「机器人主动提醒」（`TWIN_TELEGRAM_PUSH_V0_ENABLED`，设计 `telegram-push-design.md`）：在私聊里点开过商量链接的
 *   人，服务器记下这个私聊号和那个名额（只存链接码的 SHA-256），这件事有进展就在那个私聊里说，单结束就删。
 * - 链接码在 Telegram 链接里是查询参数，会经过 Telegram；网页链接里它在 `#` 后面，不出浏览器。
 *
 * 开关只认精确的 `'1'`。关着时机器人对这两种链接和以前一样（当成不认识的绑定码），手机上也没有 Telegram 按钮。
 */
import { TWIN_ASK_LINK_CODE_PATTERN_V0 } from './twin-ask';
import { TWIN_HUDDLE_LINK_CODE_PATTERN_V0 } from './twin-huddle';

export const TWIN_TELEGRAM_SCHEMA_VERSION_V0 = 'agentrix.twin-telegram.v0' as const;
export const TWIN_TELEGRAM_FLAG_V0 = 'TWIN_TELEGRAM_V0_ENABLED';
export const TWIN_TELEGRAM_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_TELEGRAM';

export const TWIN_TELEGRAM_KINDS_V0 = ['ask', 'huddle'] as const;
export type TwinTelegramKindV0 = (typeof TWIN_TELEGRAM_KINDS_V0)[number];

const PREFIX: Readonly<Record<TwinTelegramKindV0, string>> = { ask: 'a_', huddle: 'h_' };
const CODE: Readonly<Record<TwinTelegramKindV0, RegExp>> = { ask: TWIN_ASK_LINK_CODE_PATTERN_V0, huddle: TWIN_HUDDLE_LINK_CODE_PATTERN_V0 };

/** Telegram 的用户名：字母开头，字母数字下划线，5–32 位。 */
export const TWIN_TELEGRAM_BOT_NAME_PATTERN_V0 = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export interface TwinTelegramStartV0 {
  kind: TwinTelegramKindV0;
  code: string;
}

/** `/start` 后面那一段。Telegram 只让用 `A-Za-z0-9_-`，最多 64 位；这里是 2 位前缀加 22 位链接码。 */
export function twinTelegramStartPayloadV0(kind: TwinTelegramKindV0, code: string): string | null {
  return CODE[kind].test(code) ? `${PREFIX[kind]}${code}` : null;
}

export function parseTwinTelegramStartPayloadV0(payload: unknown): TwinTelegramStartV0 | null {
  if (typeof payload !== 'string') return null;
  for (const kind of TWIN_TELEGRAM_KINDS_V0) {
    if (!payload.startsWith(PREFIX[kind])) continue;
    const code = payload.slice(PREFIX[kind].length);
    return CODE[kind].test(code) ? { kind, code } : null;
  }
  return null;
}

export function twinTelegramStartLinkV0(botName: string, kind: TwinTelegramKindV0, code: string): string | null {
  const payload = twinTelegramStartPayloadV0(kind, code);
  if (payload === null || !TWIN_TELEGRAM_BOT_NAME_PATTERN_V0.test(botName)) return null;
  return `https://t.me/${botName}?start=${payload}`;
}

/** 手机上只有拼好的网页链接（码在 `#` 后面）：从它换出 Telegram 链接。 */
export function twinTelegramLinkFromGuestUrlV0(botName: string, kind: TwinTelegramKindV0, guestUrl: string): string | null {
  const at = guestUrl.lastIndexOf('#');
  if (at < 0) return null;
  return twinTelegramStartLinkV0(botName, kind, guestUrl.slice(at + 1));
}

/** `GET /twin-telegram/link-base`：手机拼 Telegram 链接要用的机器人名。 */
export interface TwinTelegramLinkBaseV0 {
  schemaVersion: typeof TWIN_TELEGRAM_SCHEMA_VERSION_V0;
  botName: string;
}

export function decodeTwinTelegramLinkBaseV0(value: unknown): TwinTelegramLinkBaseV0 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { schemaVersion, botName } = value as Record<string, unknown>;
  if (schemaVersion !== TWIN_TELEGRAM_SCHEMA_VERSION_V0 || typeof botName !== 'string' || !TWIN_TELEGRAM_BOT_NAME_PATTERN_V0.test(botName)) return null;
  return { schemaVersion, botName };
}

// ── 机器人主动提醒 ────────────────────────────────────────────────────────────

/** 只有服务器有这个开关，还要 `TWIN_TELEGRAM_V0_ENABLED` 开着。关着时不记关注、不主动发。 */
export const TWIN_TELEGRAM_PUSH_FLAG_V0 = 'TWIN_TELEGRAM_PUSH_V0_ENABLED';

/** 主动发的几种：请确认、定下来了、开始前提醒、发起人取消了、没定成。每个名额每一种只说一次。 */
export const TWIN_TELEGRAM_PUSH_NODES_V0 = ['confirm', 'settled', 'remind', 'cancelled', 'ended'] as const;
export type TwinTelegramPushNodeV0 = (typeof TWIN_TELEGRAM_PUSH_NODES_V0)[number];

export const TWIN_TELEGRAM_PUSH_LIMITS_V0 = Object.freeze({
  /** 定下来的时间开始前多久提醒。 */
  remindBeforeMs: 2 * 60 * 60 * 1000,
  /** 一条关注最多留多久，不管单结没结束。 */
  followMaxMs: 14 * 24 * 60 * 60 * 1000,
});

/** 开始前 2 小时提醒；那一刻已经过了（离开始不到 2 小时）或者时间不对，就不提醒，返回 null。 */
export function twinTelegramRemindAtV0(startAt: string, now: string): string | null {
  const start = Date.parse(startAt);
  const current = Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(current)) return null;
  const at = start - TWIN_TELEGRAM_PUSH_LIMITS_V0.remindBeforeMs;
  return at > current ? new Date(at).toISOString() : null;
}

// ── 发到群里 ──────────────────────────────────────────────────────────────────

/**
 * 「发到群里」（设计 `.agents/tasks/twin-social-net/telegram-group-design.md` 的做法 A）：发起人把机器人拉进一个 Telegram 群，
 * 机器人在群里贴一份名单，每个走链接的名额一个按钮；点了是打开和机器人的私聊，回答还在私聊里。之后机器人在群里只报
 * 人数和结果，不说谁答了什么。
 *
 * - 群口令：发起人登录后要一个（一张单一个，再要就换掉旧的），服务器只存 SHA-256。一个口令只能把名单绑到一个群。
 * - 名单上的按钮是 `https://t.me/<机器人>?start=g_<口令>_<第几个>`，链接码本身不进群。口令在群里看得到：群里谁都能点
 *   任何一个名额，所以答案照旧标「未验证」；发起人换口令或撤下，旧按钮就失效。
 * - 服务器记群号（负数）、口令的哈希、是哪张单，不记群名、群成员、群里的话。单结束、撤下、换链接、机器人被移出群都删。
 *
 * 服务器开关 `TWIN_TELEGRAM_GROUP_V0_ENABLED`，还要 `TWIN_TELEGRAM_V0_ENABLED` 开着；关着时机器人在群里和以前一样，手机上也没有
 * 「发到群里」。
 */
export const TWIN_TELEGRAM_GROUP_FLAG_V0 = 'TWIN_TELEGRAM_GROUP_V0_ENABLED';
export const TWIN_TELEGRAM_GROUP_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_TELEGRAM_GROUP';

/** 群口令和链接码一个写法：22 位 `A-Za-z0-9_-`。 */
export const TWIN_TELEGRAM_GROUP_TOKEN_PATTERN_V0 = /^[A-Za-z0-9_-]{22}$/;
const GROUP_PREFIX = 'g_';
const GROUP_TOKEN_LENGTH = 22;

export const TWIN_TELEGRAM_GROUP_LIMITS_V0 = Object.freeze({
  /** 名单上最多几个名额（一张单最多约 9 个人）。 */
  seatsMax: 9,
  /** 群里报「已有几人回复」最多多久一条。 */
  progressEveryMs: 10 * 60 * 1000,
  /** 一条群绑定最多留多久，不管单结没结束。 */
  bindingMaxMs: 14 * 24 * 60 * 60 * 1000,
});

export interface TwinTelegramGroupStartV0 {
  token: string;
  /** 名单上第几个名额（从 1 起）；拉机器人进群用的那一条没有。 */
  seat: number | null;
}

/** `/start` 后面那一段：`g_<口令>`（拉进群）或 `g_<口令>_<第几个>`（名单上的按钮）。 */
export function twinTelegramGroupPayloadV0(token: string, seat: number | null = null): string | null {
  if (!TWIN_TELEGRAM_GROUP_TOKEN_PATTERN_V0.test(token)) return null;
  if (seat === null) return `${GROUP_PREFIX}${token}`;
  if (!Number.isInteger(seat) || seat < 1 || seat > TWIN_TELEGRAM_GROUP_LIMITS_V0.seatsMax) return null;
  return `${GROUP_PREFIX}${token}_${seat}`;
}

/** 口令里也会有 `_`，所以按位置拆：前缀、22 位口令，后面要么没有，要么是 `_` 加一位序号。 */
export function parseTwinTelegramGroupPayloadV0(payload: unknown): TwinTelegramGroupStartV0 | null {
  if (typeof payload !== 'string' || !payload.startsWith(GROUP_PREFIX)) return null;
  const token = payload.slice(GROUP_PREFIX.length, GROUP_PREFIX.length + GROUP_TOKEN_LENGTH);
  if (!TWIN_TELEGRAM_GROUP_TOKEN_PATTERN_V0.test(token)) return null;
  const rest = payload.slice(GROUP_PREFIX.length + GROUP_TOKEN_LENGTH);
  if (rest === '') return { token, seat: null };
  const match = /^_([1-9])$/.exec(rest);
  return match ? { token, seat: Number(match[1]) } : null;
}

/** 把机器人拉进群的链接：Telegram 让发起人选一个群，机器人进群后收到带口令的 `/start`。 */
export function twinTelegramGroupAddLinkV0(botName: string, token: string): string | null {
  const payload = twinTelegramGroupPayloadV0(token);
  if (payload === null || !TWIN_TELEGRAM_BOT_NAME_PATTERN_V0.test(botName)) return null;
  return `https://t.me/${botName}?startgroup=${payload}`;
}

/** 名单上一个名额的按钮：打开和机器人的私聊。 */
export function twinTelegramGroupSeatLinkV0(botName: string, token: string, seat: number): string | null {
  const payload = twinTelegramGroupPayloadV0(token, seat);
  if (payload === null || !TWIN_TELEGRAM_BOT_NAME_PATTERN_V0.test(botName)) return null;
  return `https://t.me/${botName}?start=${payload}`;
}

/** 一张单在群里的样子：没发（`none`）、口令给了还没绑到群（`waiting`）、名单已经在一个群里（`posted`）。 */
export const TWIN_TELEGRAM_GROUP_STATES_V0 = ['none', 'waiting', 'posted'] as const;
export type TwinTelegramGroupStateNameV0 = (typeof TWIN_TELEGRAM_GROUP_STATES_V0)[number];

/** `GET /twin-telegram/huddles/:huddleId/group`，和 `DELETE` 同一个地址（撤下后是 `none`）。 */
export interface TwinTelegramGroupStateV0 {
  schemaVersion: typeof TWIN_TELEGRAM_SCHEMA_VERSION_V0;
  state: TwinTelegramGroupStateNameV0;
}

/** `POST /twin-telegram/huddles/:huddleId/group`：新口令只在这一次返回，服务器之后给不出来。 */
export interface TwinTelegramGroupIssuedV0 {
  schemaVersion: typeof TWIN_TELEGRAM_SCHEMA_VERSION_V0;
  state: 'waiting';
  botName: string;
  token: string;
}

export function decodeTwinTelegramGroupStateV0(value: unknown): TwinTelegramGroupStateV0 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { schemaVersion, state } = value as Record<string, unknown>;
  if (schemaVersion !== TWIN_TELEGRAM_SCHEMA_VERSION_V0) return null;
  const name = TWIN_TELEGRAM_GROUP_STATES_V0.find((item) => item === state);
  return name === undefined ? null : { schemaVersion, state: name };
}

export function decodeTwinTelegramGroupIssuedV0(value: unknown): TwinTelegramGroupIssuedV0 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { schemaVersion, state, botName, token } = value as Record<string, unknown>;
  if (schemaVersion !== TWIN_TELEGRAM_SCHEMA_VERSION_V0 || state !== 'waiting') return null;
  if (typeof botName !== 'string' || !TWIN_TELEGRAM_BOT_NAME_PATTERN_V0.test(botName)) return null;
  if (typeof token !== 'string' || !TWIN_TELEGRAM_GROUP_TOKEN_PATTERN_V0.test(token)) return null;
  return { schemaVersion, state, botName, token };
}
