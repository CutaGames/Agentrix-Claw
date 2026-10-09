/**
 * New markets, v0 contract only (L7-8): LINE for Japan, Taiwan and Thailand, Malaysia on the channels we already run,
 * and each market's local payment methods. It waits for seed data, a LINE official account and per-market payment
 * contracts, so nothing reads this in v0; the payment method ids are a draft.
 */

/** Future server switch; nothing reads it in v0. */
export const MARKET_EXPANSION_V0_FLAG = 'MARKET_EXPANSION_V0_ENABLED';
/** Future channel switch, named like AGENT_CHANNEL_WHATSAPP_ENABLED; nothing reads it in v0. */
export const AGENT_CHANNEL_LINE_FLAG_V0 = 'AGENT_CHANNEL_LINE_ENABLED';

export const MARKET_CHANNELS_V0 = ['line', 'whatsapp', 'telegram'] as const;
export type MarketChannelV0 = (typeof MARKET_CHANNELS_V0)[number];

export interface MarketProfileV0 {
  /** ISO 3166-1 alpha-2. */
  market: string;
  locale: string;
  currency: string;
  channels: readonly MarketChannelV0[];
  paymentMethods: readonly string[];
}

export const MARKET_PROFILES_V0: readonly MarketProfileV0[] = [
  { market: 'JP', locale: 'ja-JP', currency: 'JPY', channels: ['line'], paymentMethods: ['card', 'konbini', 'paypay'] },
  { market: 'TW', locale: 'zh-TW', currency: 'TWD', channels: ['line'], paymentMethods: ['card', 'line_pay', 'jkopay'] },
  { market: 'TH', locale: 'th-TH', currency: 'THB', channels: ['line'], paymentMethods: ['card', 'promptpay'] },
  { market: 'MY', locale: 'ms-MY', currency: 'MYR', channels: ['whatsapp', 'telegram'], paymentMethods: ['card', 'fpx', 'duitnow', 'touch_n_go'] },
];

/** The part of a LINE Messaging API webhook text event the channel needs; one-to-one chats only in v0. */
export interface LineTextEventV0 {
  userId: string;
  text: string;
  replyToken: string;
  timestamp: number;
}

const LINE_USER_ID = /^U[0-9a-f]{32}$/;
const LINE_TEXT_MAX = 5000;

export function marketProfileV0(market: string): MarketProfileV0 | null {
  return MARKET_PROFILES_V0.find((profile) => profile.market === market) ?? null;
}

export function marketChannelAllowedV0(market: string, channel: string): boolean {
  const profile = marketProfileV0(market);
  return profile !== null && (profile.channels as readonly string[]).includes(channel);
}

export function decodeLineTextEventV0(value: unknown): LineTextEventV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { type, message, source, replyToken, timestamp } = raw;
  if (type !== 'message' || typeof replyToken !== 'string' || !replyToken || replyToken.length > 256) return null;
  if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp <= 0) return null;
  if (!message || typeof message !== 'object' || !source || typeof source !== 'object') return null;
  const m = message as Record<string, unknown>;
  const s = source as Record<string, unknown>;
  const messageType = m.type;
  const text = m.text;
  const sourceType = s.type;
  const userId = s.userId;
  if (messageType !== 'text' || typeof text !== 'string' || !text.trim() || text.length > LINE_TEXT_MAX) return null;
  if (sourceType !== 'user' || typeof userId !== 'string' || !LINE_USER_ID.test(userId)) return null;
  return { userId, text, replyToken, timestamp };
}
