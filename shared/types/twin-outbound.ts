/**
 * Twin outbound posts (L9.2 batch 15, S6). The owner sends one of their share pages, their twin's public page or one of
 * their sent twin updates to X, Telegram or Discord: the server writes a draft from a fixed template (no model), the owner
 * may edit the text, and nothing leaves until the owner confirms that exact text (its `bodyHash`). There is no automatic,
 * scheduled or twin-written post.
 *
 * Every platform sits behind a port that says no by default. The recording stand-in sends nothing, answers
 * `recording:<ref>`, and is never wired in production. Batch 18 adds real Telegram and Discord adapters: the owner proves
 * they manage the chat or server when connecting, the bot re-checks before each post, and the bot tokens stay in the server
 * environment; no table here holds a token.
 *
 * The link is chosen by the server and always points at a public page: a share page's public address, or the twin's public
 * page (where people outside can follow). Never an update's detail page, which only followers may open. The text itself
 * may not carry any other link.
 */

/** Server switch: every `/twin-outbound` route answers 404 (and reads nothing) unless it is exactly '1'. */
export const TWIN_OUTBOUND_V1_FLAG = 'TWIN_OUTBOUND_V1_ENABLED';
/**
 * 'recording' wires the recording stand-in, outside production only; 'platform' wires the real Telegram and Discord adapters
 * whose settings are complete (batch 18); any other value keeps the default refusal.
 */
export const TWIN_OUTBOUND_PUBLISHER_MODE_ENV_V1 = 'TWIN_OUTBOUND_PUBLISHER_MODE';
/** Web switch for `/twin/outbound` and its two entries (share pages, twin panel); exactly '1'. */
export const TWIN_OUTBOUND_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_OUTBOUND_ENABLED';

export const TWIN_OUTBOUND_PLATFORMS_V1 = ['x', 'telegram', 'discord'] as const;
export type TwinOutboundPlatformV1 = (typeof TWIN_OUTBOUND_PLATFORMS_V1)[number];

export const TWIN_OUTBOUND_ADAPTERS_V1 = ['recording', 'telegram_bot', 'discord_bot'] as const;
export type TwinOutboundAdapterV1 = (typeof TWIN_OUTBOUND_ADAPTERS_V1)[number];

/** How the web connects a platform: the demo form (stand-in), the Telegram login, Discord sign-in, or not at all. */
export const TWIN_OUTBOUND_CONNECT_METHODS_V1 = ['none', 'demo', 'telegram_login', 'discord_oauth'] as const;
export type TwinOutboundConnectMethodV1 = (typeof TWIN_OUTBOUND_CONNECT_METHODS_V1)[number];

/** Why a real connection could not be made: the `reasonCode` of `TWIN_OUTBOUND_PLATFORM_VERIFY_FAILED`. */
export const TWIN_OUTBOUND_VERIFY_FAILURES_V1 = ['not_configured', 'login_invalid', 'target_not_found', 'target_unsupported', 'not_manager', 'bot_cannot_post', 'unavailable'] as const;
export type TwinOutboundVerifyFailureV1 = (typeof TWIN_OUTBOUND_VERIFY_FAILURES_V1)[number];

/** The web page Discord sends the owner back to; the redirect registered with the Discord application is this path. */
export const TWIN_OUTBOUND_DISCORD_RETURN_PATH_V1 = '/twin/outbound';

export const TWIN_OUTBOUND_CONNECTION_STATES_V1 = ['active', 'revoked'] as const;
export type TwinOutboundConnectionStateV1 = (typeof TWIN_OUTBOUND_CONNECTION_STATES_V1)[number];

export const TWIN_OUTBOUND_SOURCE_KINDS_V1 = ['share_page', 'twin_profile', 'twin_update'] as const;
export type TwinOutboundSourceKindV1 = (typeof TWIN_OUTBOUND_SOURCE_KINDS_V1)[number];

export const TWIN_OUTBOUND_POST_STATES_V1 = ['draft', 'sent', 'failed', 'cancelled', 'expired'] as const;
export type TwinOutboundPostStateV1 = (typeof TWIN_OUTBOUND_POST_STATES_V1)[number];

/**
 * Characters per post, the link and the line break before it included. X is counted in code points; Telegram and Discord
 * in UTF-16 units (an emoji counts 2), which never asks more of either platform than it allows (L9.2 batch 18).
 */
export const TWIN_OUTBOUND_MAX_CHARS_V1: Readonly<Record<TwinOutboundPlatformV1, number>> = Object.freeze({ x: 280, telegram: 4096, discord: 2000 });

export const TWIN_OUTBOUND_LIMITS_V1 = {
  /** Posts sent per owner in the last 24 hours, all platforms together. */
  perOwnerPerDay: 10,
  /** Posts sent per owner and platform in the last 24 hours. */
  perPlatformPerDay: 5,
  draftTtlSeconds: 24 * 60 * 60,
  /** The same source goes to the same platform at most once in this window. */
  sameSourceWindowSeconds: 24 * 60 * 60,
  displayHandleMax: 60,
  sourceRefMax: 80,
  /** Open drafts per owner; older ones expire or are cancelled first. */
  openDraftsMax: 20,
  listMax: 50,
} as const;

export const TWIN_OUTBOUND_POST_REF_PATTERN_V1 = /^top_[0-9a-f]{32}$/;
export const TWIN_OUTBOUND_CONNECTION_ID_PATTERN_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TWIN_OUTBOUND_BODY_HASH_PATTERN_V1 = /^[0-9a-f]{64}$/;

/** Anything that reads as a link: a scheme, `www.`, or a bare domain with a common ending. */
export const TWIN_OUTBOUND_LINK_PATTERN_V1 =
  /(?:[a-z][a-z0-9+.-]{1,15}:\/\/|\bwww\.|\b[a-z0-9-]{1,63}\.(?:com|net|org|io|ai|co|me|app|xyz|cn|ly|gg|link|to|dev|info|biz|site|online|top|tv|so|sh)\b)/i;
/** Mentions that would reach everyone in a channel or group. */
export const TWIN_OUTBOUND_MASS_MENTION_PATTERN_V1 = /@(?:everyone|here|all|channel)\b/i;

/** Length as `TWIN_OUTBOUND_MAX_CHARS_V1` counts it on that platform; code points without one. */
export function twinOutboundCharCountV1(text: string, platform?: TwinOutboundPlatformV1): number {
  return platform === 'telegram' || platform === 'discord' ? text.length : Array.from(text).length;
}

/** The text that is sent: the owner's text, a line break, the server's link. */
export function twinOutboundComposeV1(body: string, linkUrl: string): string {
  return `${body}\n${linkUrl}`;
}

/** How many characters the owner's text may have on this platform with this link. */
export function twinOutboundBodyBudgetV1(platform: TwinOutboundPlatformV1, linkUrl: string): number {
  return Math.max(0, TWIN_OUTBOUND_MAX_CHARS_V1[platform] - 1 - twinOutboundCharCountV1(linkUrl, platform));
}

/** Cuts a template text to the budget as the platform counts it, never inside a code point, ending with an ellipsis when cut. */
export function twinOutboundFitV1(text: string, budget: number, platform?: TwinOutboundPlatformV1): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  if (twinOutboundCharCountV1(chars.join(''), platform) <= budget) return chars.join('');
  if (budget <= 1) return '';
  let kept = 0;
  let used = 0;
  while (kept < chars.length && used + twinOutboundCharCountV1(chars[kept], platform) <= budget - 1) {
    used += twinOutboundCharCountV1(chars[kept], platform);
    kept += 1;
  }
  return `${chars.slice(0, kept).join('').trimEnd()}…`;
}

export type TwinOutboundBodyProblemV1 = 'empty' | 'too_long' | 'link_in_text' | 'mass_mention' | 'control_chars';

/** Checks the owner's text for a platform and link; null when it may be sent. */
export function twinOutboundBodyProblemV1(body: string, platform: TwinOutboundPlatformV1, linkUrl: string): TwinOutboundBodyProblemV1 | null {
  if (body.trim().length === 0) return 'empty';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(body)) return 'control_chars';
  if (TWIN_OUTBOUND_LINK_PATTERN_V1.test(body)) return 'link_in_text';
  if (TWIN_OUTBOUND_MASS_MENTION_PATTERN_V1.test(body)) return 'mass_mention';
  if (twinOutboundCharCountV1(body, platform) > twinOutboundBodyBudgetV1(platform, linkUrl)) return 'too_long';
  return null;
}

/** The `code` of every refusal the outbound routes answer with (the web maps them to text). */
export const TWIN_OUTBOUND_ERROR_CODES_V1 = {
  signInRequired: 'TWIN_OUTBOUND_SIGN_IN_REQUIRED',
  invalid: 'TWIN_OUTBOUND_INVALID',
  notFound: 'TWIN_OUTBOUND_NOT_FOUND',
  platformNotConfigured: 'TWIN_OUTBOUND_PLATFORM_NOT_CONFIGURED',
  alreadyConnected: 'TWIN_OUTBOUND_ALREADY_CONNECTED',
  notConnected: 'TWIN_OUTBOUND_NOT_CONNECTED',
  sourceUnavailable: 'TWIN_OUTBOUND_SOURCE_UNAVAILABLE',
  linkUnavailable: 'TWIN_OUTBOUND_LINK_UNAVAILABLE',
  bodyRejected: 'TWIN_OUTBOUND_BODY_REJECTED',
  notDraft: 'TWIN_OUTBOUND_NOT_DRAFT',
  expired: 'TWIN_OUTBOUND_DRAFT_EXPIRED',
  hashMismatch: 'TWIN_OUTBOUND_BODY_HASH_MISMATCH',
  locked: 'TWIN_OUTBOUND_LOCKED',
  dailyLimit: 'TWIN_OUTBOUND_DAILY_LIMIT',
  platformDailyLimit: 'TWIN_OUTBOUND_PLATFORM_DAILY_LIMIT',
  sameSource: 'TWIN_OUTBOUND_SAME_SOURCE_RECENTLY',
  tooManyDrafts: 'TWIN_OUTBOUND_TOO_MANY_DRAFTS',
  verificationRequired: 'TWIN_OUTBOUND_VERIFICATION_REQUIRED',
  platformVerifyFailed: 'TWIN_OUTBOUND_PLATFORM_VERIFY_FAILED',
  verifyRateLimited: 'TWIN_OUTBOUND_VERIFY_RATE_LIMITED',
} as const;
export type TwinOutboundErrorCodeV1 = (typeof TWIN_OUTBOUND_ERROR_CODES_V1)[keyof typeof TWIN_OUTBOUND_ERROR_CODES_V1];

export interface TwinOutboundConnectionViewV1 {
  id: string;
  platform: TwinOutboundPlatformV1;
  adapter: TwinOutboundAdapterV1;
  displayHandle: string;
  state: TwinOutboundConnectionStateV1;
  /** True for the recording stand-in: the page says "demo connection, nothing is really sent". */
  demo: boolean;
  createdAt: string;
}

export interface TwinOutboundPostViewV1 {
  ref: string;
  platform: TwinOutboundPlatformV1;
  connectionId: string;
  sourceKind: TwinOutboundSourceKindV1;
  sourceRef: string;
  body: string;
  /** Send this back with `confirm`: it binds the platform, the link and exactly this text. */
  bodyHash: string;
  linkUrl: string;
  /** Characters the text may have on this platform with this link. */
  bodyMax: number;
  state: TwinOutboundPostStateV1;
  demo: boolean;
  providerPostRef: string | null;
  failureCode: string | null;
  createdAt: string;
  confirmedAt: string | null;
  sentAt: string | null;
  expiresAt: string;
}

export interface TwinOutboundConnectionInputV1 {
  platform: TwinOutboundPlatformV1;
  displayHandle: string;
}

export interface TwinOutboundConnectOptionsV1 {
  methods: Record<TwinOutboundPlatformV1, TwinOutboundConnectMethodV1>;
  /** The bot the Telegram login names; null when Telegram cannot really be connected. */
  telegramBotUsername: string | null;
}

/** After Discord sign-in: the server's channels the owner may pick, and a ticket proving the sign-in (10 minutes). */
export interface TwinOutboundDiscordChoiceV1 {
  ticket: string;
  guildName: string | null;
  channels: Array<{ id: string; name: string }>;
}

export interface TwinOutboundDraftInputV1 {
  platform: TwinOutboundPlatformV1;
  sourceKind: TwinOutboundSourceKindV1;
  sourceRef: string;
}

export type TwinOutboundDecodeFailureV1 = { ok: false; reasonCode: 'unsupported_shape' | 'unknown_field' | 'missing_field' | 'invalid_value'; field: string };
type Decoded<T> = { ok: true; value: T } | TwinOutboundDecodeFailureV1;

function record(value: unknown, allowed: readonly string[]): { ok: true; value: Record<string, unknown> } | TwinOutboundDecodeFailureV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reasonCode: 'unsupported_shape', field: '' };
  const row = value as Record<string, unknown>;
  const extra = Object.keys(row).find((key) => !allowed.includes(key));
  if (extra !== undefined) return { ok: false, reasonCode: 'unknown_field', field: extra };
  return { ok: true, value: row };
}

function oneOf<T extends string>(row: Record<string, unknown>, field: string, values: readonly T[]): Decoded<T> {
  const raw = row[field];
  if (raw === undefined || raw === null) return { ok: false, reasonCode: 'missing_field', field };
  if (typeof raw !== 'string' || !(values as readonly string[]).includes(raw)) return { ok: false, reasonCode: 'invalid_value', field };
  return { ok: true, value: raw as T };
}

export function decodeTwinOutboundConnectionInputV1(value: unknown): Decoded<TwinOutboundConnectionInputV1> {
  const r = record(value, ['platform', 'displayHandle']);
  if (r.ok === false) return r;
  const platform = oneOf(r.value, 'platform', TWIN_OUTBOUND_PLATFORMS_V1);
  if (platform.ok === false) return platform;
  const raw = r.value.displayHandle;
  if (raw === undefined || raw === null) return { ok: false, reasonCode: 'missing_field', field: 'displayHandle' };
  if (typeof raw !== 'string') return { ok: false, reasonCode: 'invalid_value', field: 'displayHandle' };
  const displayHandle = raw.replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (!displayHandle || twinOutboundCharCountV1(displayHandle) > TWIN_OUTBOUND_LIMITS_V1.displayHandleMax || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(displayHandle)) {
    return { ok: false, reasonCode: 'invalid_value', field: 'displayHandle' };
  }
  return { ok: true, value: { platform: platform.value, displayHandle } };
}

export function decodeTwinOutboundDraftInputV1(value: unknown): Decoded<TwinOutboundDraftInputV1> {
  const r = record(value, ['platform', 'sourceKind', 'sourceRef']);
  if (r.ok === false) return r;
  const platform = oneOf(r.value, 'platform', TWIN_OUTBOUND_PLATFORMS_V1);
  if (platform.ok === false) return platform;
  const sourceKind = oneOf(r.value, 'sourceKind', TWIN_OUTBOUND_SOURCE_KINDS_V1);
  if (sourceKind.ok === false) return sourceKind;
  const sourceRef = r.value.sourceRef;
  if (sourceRef === undefined || sourceRef === null) return { ok: false, reasonCode: 'missing_field', field: 'sourceRef' };
  if (typeof sourceRef !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(sourceRef)) return { ok: false, reasonCode: 'invalid_value', field: 'sourceRef' };
  return { ok: true, value: { platform: platform.value, sourceKind: sourceKind.value, sourceRef } };
}

/** `PUT drafts/:ref`: only the text; the platform, source and link stay as the server set them. */
export function decodeTwinOutboundBodyInputV1(value: unknown): Decoded<{ body: string }> {
  const r = record(value, ['body']);
  if (r.ok === false) return r;
  const body = r.value.body;
  if (body === undefined || body === null) return { ok: false, reasonCode: 'missing_field', field: 'body' };
  if (typeof body !== 'string' || body.length > 8192) return { ok: false, reasonCode: 'invalid_value', field: 'body' };
  return { ok: true, value: { body: body.replace(/\r\n?/g, '\n').trim() } };
}

export function decodeTwinOutboundConfirmInputV1(value: unknown): Decoded<{ bodyHash: string }> {
  const r = record(value, ['bodyHash']);
  if (r.ok === false) return r;
  const bodyHash = r.value.bodyHash;
  if (bodyHash === undefined || bodyHash === null) return { ok: false, reasonCode: 'missing_field', field: 'bodyHash' };
  if (typeof bodyHash !== 'string' || !TWIN_OUTBOUND_BODY_HASH_PATTERN_V1.test(bodyHash)) return { ok: false, reasonCode: 'invalid_value', field: 'bodyHash' };
  return { ok: true, value: { bodyHash } };
}

/** `POST connections/telegram`: the Login Widget data as Telegram gave it, and the chat (`@handle` or numeric id). */
export function decodeTwinOutboundTelegramConnectInputV1(value: unknown): Decoded<{ login: Record<string, unknown>; chat: string }> {
  const r = record(value, ['login', 'chat']);
  if (r.ok === false) return r;
  const login = r.value.login;
  if (login === undefined || login === null) return { ok: false, reasonCode: 'missing_field', field: 'login' };
  if (typeof login !== 'object' || Array.isArray(login) || Object.keys(login).length > 7) return { ok: false, reasonCode: 'invalid_value', field: 'login' };
  const chat = r.value.chat;
  if (chat === undefined || chat === null) return { ok: false, reasonCode: 'missing_field', field: 'chat' };
  if (typeof chat !== 'string' || !/^(?:@[A-Za-z][A-Za-z0-9_]{3,31}|-?[1-9][0-9]{0,15})$/.test(chat.trim())) return { ok: false, reasonCode: 'invalid_value', field: 'chat' };
  return { ok: true, value: { login: login as Record<string, unknown>, chat: chat.trim() } };
}

/** `POST connections/discord/verify`: what Discord sent back to the return page. */
export function decodeTwinOutboundDiscordVerifyInputV1(value: unknown): Decoded<{ code: string; state: string }> {
  const r = record(value, ['code', 'state']);
  if (r.ok === false) return r;
  for (const field of ['code', 'state'] as const) {
    const raw = r.value[field];
    if (raw === undefined || raw === null) return { ok: false, reasonCode: 'missing_field', field };
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_.-]{1,1024}$/.test(raw)) return { ok: false, reasonCode: 'invalid_value', field };
  }
  return { ok: true, value: { code: r.value.code as string, state: r.value.state as string } };
}

/** `POST connections/discord`: the ticket from the sign-in and the channel picked from its list. */
export function decodeTwinOutboundDiscordConnectInputV1(value: unknown): Decoded<{ ticket: string; channelId: string }> {
  const r = record(value, ['ticket', 'channelId']);
  if (r.ok === false) return r;
  const ticket = r.value.ticket;
  if (ticket === undefined || ticket === null) return { ok: false, reasonCode: 'missing_field', field: 'ticket' };
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{1,1000}\.[A-Za-z0-9_-]{43}$/.test(ticket)) return { ok: false, reasonCode: 'invalid_value', field: 'ticket' };
  const channelId = r.value.channelId;
  if (channelId === undefined || channelId === null) return { ok: false, reasonCode: 'missing_field', field: 'channelId' };
  if (typeof channelId !== 'string' || !/^[0-9]{17,20}$/.test(channelId)) return { ok: false, reasonCode: 'invalid_value', field: 'channelId' };
  return { ok: true, value: { ticket, channelId } };
}
