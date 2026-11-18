/**
 * 「在 Telegram 里也能接」v0 的合同（设计 `.agents/tasks/twin-social-net/telegram-design.md`）。
 *
 * 发起人拿到的个人链接（「问遍身边人」和「分身们商量」的链接码）可以换成一条 Telegram 链接：
 * `https://t.me/<机器人>?start=a_<码>`（提问）或 `…?start=h_<码>`（商量）。朋友点开就进到机器人的私聊，
 * 点按钮选时间、确认来不来、回一句话。底下走的就是链接页那套入口，规矩一样：答案标「未验证」，可以撤回。
 *
 * - 机器人不主动找人：对方没点开过，它发不了消息。链接还是发起人自己转。
 * - 服务器不存对方的 Telegram 账号，也不加新表；「正在答哪一条」只在内存里记一会儿。
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
