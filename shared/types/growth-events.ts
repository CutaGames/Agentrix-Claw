/**
 * Growth funnel event contract v7 (marketing-growth-automation-v1 · MGA-1.1).
 *
 * Source of truth: `docs/agentrix-v7-funnel-event-contract-2026-09.zh-CN.md` (T4-04, E-01..E-16).
 * Tool-agnostic: every event lands in `growth_funnel_events` first; third-party analytics
 * (if any) is a forward-only display layer. `first_real_action` (E-11) is DERIVED and never
 * stored.
 *
 * Privacy: metadata is whitelisted per event; values are short strings / numbers / booleans and
 * must never look like an e-mail address, a phone number or free text.
 */

/** Stored v7 funnel events (15). `first_real_action` is derived, see `REAL_ACTION_EVENTS`. */
export const FUNNEL_EVENT_NAMES = [
  'visit',
  'signup',
  'bring_completed',
  'byo_connected',
  'device_online',
  'remote_task_approved',
  'twin_first_public_answer',
  'first_economy_settlement',
  'first_device_job_settled',
  'paid',
  'take_rate_event',
  'shared',
  'share_opened',
  'kill_switch_used',
  'source_vote',
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/** Any of these counts as a "real action" for `first_real_action` and Weekly Acting Agents. */
export type RealActionEvent =
  | 'remote_task_approved'
  | 'twin_first_public_answer'
  | 'first_economy_settlement'
  | 'first_device_job_settled';

export const REAL_ACTION_EVENTS: readonly RealActionEvent[] = [
  'remote_task_approved',
  'twin_first_public_answer',
  'first_economy_settlement',
  'first_device_job_settled',
];

/**
 * Events a guest client may report directly; everything else is recorded server-side.
 * v7.1 (REQ-web-027 ④): `shared` is no longer client-reportable. Creating a passport share or
 * a twin link already needs the owner's sign-in, so the server records `shared` there and a
 * client cannot inflate it.
 */
export const CLIENT_REPORTABLE_FUNNEL_EVENTS: readonly FunnelEventName[] = [
  'visit',
  'share_opened',
  'source_vote',
];

/**
 * Share events (`shared`, `share_opened`; E-14; v7.1, REQ-web-027):
 * - `kind`: which surface was shared, one of `FUNNEL_SHARE_KINDS` (the dashboard filters the
 *   twin visitor loop on `kind = twin`). Any other value is dropped (`bad_value`).
 * - `ref`: reserved for a short server-issued share code. It is never the Agent's public id
 *   (`AGT-<ms>-…`, which the digit-run guard drops anyway) and never the `?g=` grant token.
 *   No share code exists yet, so leave it out; the inviter travels in `attributionRef`.
 * - When the server records `shared` (REQ-mobile-075): a passport counts once per new share
 *   grant; a twin counts each time its link becomes public (the first publish, and a publish
 *   after it was unpublished). Replays and topic edits of a public twin are not new shares.
 */
export const FUNNEL_SHARE_KINDS = ['passport', 'twin'] as const;
export type FunnelShareKind = (typeof FUNNEL_SHARE_KINDS)[number];

/** Per-event closed value sets; a value outside the set is dropped as `bad_value`. */
export const FUNNEL_EVENT_PROP_VALUES: Readonly<Partial<Record<FunnelEventName, Readonly<Record<string, readonly string[]>>>>> = {
  shared: { kind: FUNNEL_SHARE_KINDS },
  share_opened: { kind: FUNNEL_SHARE_KINDS },
};

export type FunnelSurface = 'web' | 'apk' | 'exe' | 'backend';
export type FunnelLang = 'zh' | 'en';
export type FunnelUtmMedium = 'social' | 'search' | 'referral' | 'email' | 'kol' | 'community';

/** Common properties carried by every v7 event (handbook §1.3 UTM rules). */
export interface FunnelCommonProps {
  surface?: FunnelSurface;
  lang?: FunnelLang;
  utm_source?: string;
  utm_medium?: FunnelUtmMedium;
  utm_campaign?: string;
  utm_content?: string;
  /** Source landing page slug (`/sources/<slug>`). */
  src?: string;
  /** KOL handle from the shared handle dictionary. */
  kol?: string;
  /** Invitation batch label (`kol:{handle}` / `earlybird:launch` / `ch:{source}` / `support`). */
  invite_batch?: string;
  /** Agent id for Weekly Acting Agents de-duplication; falls back to userId when absent. */
  agent_id?: string;
}

export const FUNNEL_COMMON_PROP_KEYS: readonly (keyof FunnelCommonProps)[] = [
  'surface',
  'lang',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'src',
  'kol',
  'invite_batch',
  'agent_id',
];

/** Per-event extra property keys (T4-04 §2 "事件属性" column). */
export const FUNNEL_EVENT_PROP_KEYS: Readonly<Record<FunnelEventName, readonly string[]>> = {
  visit: ['path', 'referrer_host'],
  signup: ['method', 'invited'],
  bring_completed: ['source', 'mode', 'items_band'],
  byo_connected: ['provider'],
  device_online: ['device_type', 'os'],
  remote_task_approved: ['surface_approve', 'surface_execute'],
  twin_first_public_answer: ['creator_id', 'visitor_registered'],
  first_economy_settlement: ['role', 'kind', 'amount_band'],
  first_device_job_settled: ['role', 'amount_band'],
  paid: ['plan', 'cycle', 'amount_band'],
  take_rate_event: ['line', 'amount_band'],
  shared: ['ref', 'kind'],
  share_opened: ['ref', 'kind', 'opener_registered'],
  kill_switch_used: ['scope'],
  source_vote: ['source', 'persona'],
};

/** Max length for any string value inside funnel metadata. */
export const FUNNEL_METADATA_MAX_STRING = 64;

/** Looks like an e-mail address. */
const EMAIL_LIKE = /@/;
/** Seven or more consecutive digits (phone numbers, card numbers, ids we must not collect). */
const LONG_DIGIT_RUN = /\d{7,}/;
/** Free text: whitespace-separated words beyond a short slug. */
const FREE_TEXT_LIKE = /\s\S+\s\S+\s/;

export interface FunnelMetadataSanitizeResult {
  /** True when nothing had to be dropped. */
  ok: boolean;
  /** Whitelisted, size-bounded metadata safe to persist (never null; may be empty). */
  metadata: Record<string, string | number | boolean>;
  /** Keys dropped and why (`unknown_key` / `pii_like` / `too_long` / `bad_type` / `bad_value`). */
  rejected: Array<{ key: string; reason: 'unknown_key' | 'pii_like' | 'too_long' | 'bad_type' | 'bad_value' }>;
}

export function isFunnelEventName(value: unknown): value is FunnelEventName {
  return typeof value === 'string' && (FUNNEL_EVENT_NAMES as readonly string[]).includes(value);
}

export function isRealActionEvent(value: unknown): value is RealActionEvent {
  return typeof value === 'string' && (REAL_ACTION_EVENTS as readonly string[]).includes(value);
}

export function isClientReportableFunnelEvent(value: unknown): boolean {
  return (
    typeof value === 'string' && (CLIENT_REPORTABLE_FUNNEL_EVENTS as readonly string[]).includes(value)
  );
}

/** Allowed metadata keys for one event = common keys ∪ per-event keys. */
export function allowedFunnelMetadataKeys(event: FunnelEventName): ReadonlySet<string> {
  return new Set<string>([...FUNNEL_COMMON_PROP_KEYS, ...(FUNNEL_EVENT_PROP_KEYS[event] ?? [])]);
}

/**
 * Whitelist + PII guard for funnel metadata. Pure, never throws.
 * - unknown keys dropped;
 * - strings longer than `FUNNEL_METADATA_MAX_STRING` dropped;
 * - strings containing `@`, 7+ consecutive digits or free-text shape dropped;
 * - keys with a closed value set (`FUNNEL_EVENT_PROP_VALUES`) keep only a string from that set;
 * - only string / finite number / boolean values kept.
 */
export function sanitizeFunnelMetadata(
  event: FunnelEventName,
  input: Record<string, unknown> | null | undefined,
): FunnelMetadataSanitizeResult {
  const allowed = allowedFunnelMetadataKeys(event);
  const closed = FUNNEL_EVENT_PROP_VALUES[event] ?? {};
  const metadata: Record<string, string | number | boolean> = {};
  const rejected: FunnelMetadataSanitizeResult['rejected'] = [];
  if (!input || typeof input !== 'object') {
    return { ok: true, metadata, rejected };
  }
  for (const [key, raw] of Object.entries(input)) {
    if (!allowed.has(key)) {
      rejected.push({ key, reason: 'unknown_key' });
      continue;
    }
    const values = Object.prototype.hasOwnProperty.call(closed, key) ? closed[key] : undefined;
    if (values) {
      if (typeof raw === 'string' && values.includes(raw)) metadata[key] = raw;
      else rejected.push({ key, reason: 'bad_value' });
      continue;
    }
    if (typeof raw === 'boolean') {
      metadata[key] = raw;
      continue;
    }
    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) metadata[key] = raw;
      else rejected.push({ key, reason: 'bad_type' });
      continue;
    }
    if (typeof raw !== 'string') {
      rejected.push({ key, reason: 'bad_type' });
      continue;
    }
    const value = raw.trim();
    if (value.length > FUNNEL_METADATA_MAX_STRING) {
      rejected.push({ key, reason: 'too_long' });
      continue;
    }
    if (EMAIL_LIKE.test(value) || LONG_DIGIT_RUN.test(value) || FREE_TEXT_LIKE.test(` ${value} `)) {
      rejected.push({ key, reason: 'pii_like' });
      continue;
    }
    metadata[key] = value;
  }
  return { ok: rejected.length === 0, metadata, rejected };
}

/**
 * Attribution key precedence (MGA-3 / design §4.2): `ref` > `kol` > `src` > `utm_source`.
 * Returns null when none present.
 */
export function resolveAttributionRef(
  params: Partial<Record<'ref' | 'kol' | 'src' | 'utm_source', string | null | undefined>>,
): string | null {
  for (const key of ['ref', 'kol', 'src', 'utm_source'] as const) {
    const v = params[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}
