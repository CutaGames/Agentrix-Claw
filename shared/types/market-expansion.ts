/**
 * New markets (L7-8 contract, read by L8 D7): LINE for Japan, Taiwan and Thailand, Malaysia on the channels we already
 * run, and each market's local payment methods. Opening a market is a public launch, so both switches below are off by
 * default and only the exact `'1'` turns them on. It still waits for seed data, a LINE official account (the owner opens
 * it) and per-market payment contracts: the code is exercised against a fake LINE service and Stripe test mode only.
 */

/** Opens the new markets' extra currencies and local payment methods (Stripe **test mode only**). */
export const MARKET_EXPANSION_V0_FLAG = 'MARKET_EXPANSION_V0_ENABLED';
/** The LINE channel (also needs `AGENT_CHANNEL_V0_ENABLED` and `MARKET_EXPANSION_V0_ENABLED`). */
export const AGENT_CHANNEL_LINE_FLAG_V0 = 'AGENT_CHANNEL_LINE_ENABLED';
/** The LINE Messaging API channel secret (webhook signature) and channel access token (reply API); read per call, never logged. */
export const LINE_CHANNEL_SECRET_ENV_V0 = 'LINE_CHANNEL_SECRET';
export const LINE_CHANNEL_ACCESS_TOKEN_ENV_V0 = 'LINE_CHANNEL_ACCESS_TOKEN';

import { AGENT_CHANNEL_V0_FLAG } from './agent-channel';

type FlagEnv = Readonly<Record<string, string | undefined>>;

/** Market expansion is on (the currencies and the local payment methods). */
export function marketExpansionEnabledV0(env: FlagEnv): boolean {
  return env[MARKET_EXPANSION_V0_FLAG] === '1';
}

/** The LINE channel is on: its own switch, the channel feature it stands on, and market expansion. Anything else: off. */
export function lineChannelEnabledV0(env: FlagEnv): boolean {
  return env[AGENT_CHANNEL_LINE_FLAG_V0] === '1' && env[AGENT_CHANNEL_V0_FLAG] === '1' && marketExpansionEnabledV0(env);
}

/**
 * Currencies an order offer may be priced in once market expansion is on, next to USD and SGD: Malaysia (MYR, for FPX)
 * and Thailand (THB, for PromptPay). Two decimals, like the others. Orders in them stay in Stripe test mode.
 */
export const MARKET_EXTRA_OFFER_CURRENCIES_V0 = ['MYR', 'THB'] as const;

/**
 * Local payment methods Stripe Checkout can add next to cards, each bound to the one currency it settles in. They are
 * offered only in Stripe test mode (an order whose environment is `test`, paid with a test key).
 */
export const LOCAL_PAYMENT_METHODS_V0 = [
  { id: 'paynow', market: 'SG', currency: 'SGD' },
  { id: 'fpx', market: 'MY', currency: 'MYR' },
  { id: 'promptpay', market: 'TH', currency: 'THB' },
] as const;
export type LocalPaymentMethodIdV0 = (typeof LOCAL_PAYMENT_METHODS_V0)[number]['id'];

/** The local payment methods for an order currency (upper-case ISO code); none for any other currency. */
export function localPaymentMethodsForCurrencyV0(currency: string): LocalPaymentMethodIdV0[] {
  return LOCAL_PAYMENT_METHODS_V0.filter((method) => method.currency === currency).map((method) => method.id);
}

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

/** A LINE user removed the official account (blocked or unfriended it): the chat bound to that user ends. */
export interface LineUnfollowEventV0 {
  userId: string;
}

/** The webhook body is at most this many events; LINE sends a handful, so more is not LINE. */
export const LINE_WEBHOOK_EVENTS_MAX_V0 = 100;

/** The `events` array of a webhook body, or null when the body is not a LINE webhook body. */
export function decodeLineWebhookEventsV0(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const events = (value as Record<string, unknown>).events;
  return Array.isArray(events) && events.length <= LINE_WEBHOOK_EVENTS_MAX_V0 ? events : null;
}

export function decodeLineUnfollowEventV0(value: unknown): LineUnfollowEventV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const source = raw.source;
  if (raw.type !== 'unfollow' || !source || typeof source !== 'object') return null;
  const s = source as Record<string, unknown>;
  return s.type === 'user' && typeof s.userId === 'string' && LINE_USER_ID.test(s.userId) ? { userId: s.userId } : null;
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
