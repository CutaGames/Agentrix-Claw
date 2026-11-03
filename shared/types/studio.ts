/**
 * R9 studios (L8 batch 4C): a few owners, each with their own twin, behind one public entry. An enquiry is routed by the
 * studio's rules to one member's twin; when a consultation deposit that came through the entry settles, the proceeds
 * are booked to the members by their agreed shares (test ledger only). The payee of the order stays the one member who
 * took it: the studio changes who the bookkeeping says earned what, never who the money is sent to.
 *
 * Everything is behind `STUDIOS_V1_ENABLED` (default off, only the exact `'1'`), and the split also needs
 * `AGENT_INCOME_V0_ENABLED`. Live money is never split here (B3 and the owner's per-time approval come first).
 */
export const STUDIOS_V1_FLAG = 'STUDIOS_V1_ENABLED';

export const STUDIO_REF_PATTERN_V1 = /^stu_[0-9a-f]{32}$/;
export const STUDIO_MEMBER_REF_PATTERN_V1 = /^stm_[0-9a-f]{32}$/;
export const STUDIO_LEAD_REF_PATTERN_V1 = /^stl_[0-9a-f]{32}$/;

export const STUDIO_LIMITS_V1 = {
  nameMax: 60,
  membersMax: 8,
  /** Studios one owner may have created and not closed. */
  studiosPerOwnerMax: 5,
  topicsMax: 20,
  topicMax: 40,
  /** A lead stays attributable to an order for this long. */
  leadWindowDays: 30,
  /** Enquiries one studio takes per minute (all visitors together), so the entry cannot be used to flood the members. */
  enquiriesPerMinute: 30,
} as const;

/** The only orders that are split: a settled consultation deposit (`consultation_deposit` in the orders module). */
export const STUDIO_SPLIT_ORDER_KIND_V1 = 'consultation_deposit';

/**
 * PLACEHOLDER. The ratio is a term of the studio that the owners agree; the owner of the platform decides the real
 * default (OA). Until then a studio starts from an equal split, with the leftover basis points going to the member
 * listed first (the creator), and every member has to accept the exact numbers before anything is split.
 */
export const STUDIO_DEFAULT_SPLIT_RULE_PLACEHOLDER_V1 = 'equal' as const;

export const STUDIO_MEMBER_STATUSES_V1 = ['invited', 'active', 'left'] as const;
export type StudioMemberStatusV1 = (typeof STUDIO_MEMBER_STATUSES_V1)[number];
export const STUDIO_STATUSES_V1 = ['active', 'closed'] as const;
export type StudioStatusV1 = (typeof STUDIO_STATUSES_V1)[number];

const TOPIC = /^[\p{L}\p{N}_-]+$/u;

/** A topic as the owner writes it and a visitor names it: trimmed, NFKC, lower case, letters / digits / `_` / `-`. */
export function normalizeStudioTopicV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const topic = value.normalize('NFKC').trim().toLowerCase();
  return topic && topic.length <= STUDIO_LIMITS_V1.topicMax && TOPIC.test(topic) ? topic : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** An equal split in basis points; the leftover goes to the first. `n` members: the shares add up to exactly 10,000. */
export function studioEqualSharesBpsV1(count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > STUDIO_LIMITS_V1.membersMax) throw new Error('studio: member count out of range');
  const each = Math.floor(10_000 / count);
  const shares = Array.from({ length: count }, () => each);
  shares[0] += 10_000 - each * count;
  return shares;
}

/**
 * Splits `totalMinor` by `sharesBps` (whole basis points, adding up to exactly 10,000) into whole minor units that add
 * up to exactly `totalMinor`: each share is rounded down, and what is left over (never more than the member count minus
 * one) goes to `remainderIndex`, the member who took the order. Throws on anything that could not add up.
 */
export function splitMinorExactV1(totalMinor: string, sharesBps: readonly number[], remainderIndex: number): string[] {
  if (!/^(0|[1-9][0-9]{0,15})$/.test(totalMinor)) throw new Error('studio split: bad amount');
  if (sharesBps.length < 1 || sharesBps.length > STUDIO_LIMITS_V1.membersMax) throw new Error('studio split: bad member count');
  if (!Number.isInteger(remainderIndex) || remainderIndex < 0 || remainderIndex >= sharesBps.length) throw new Error('studio split: bad remainder member');
  let bpsTotal = 0;
  for (const bps of sharesBps) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error('studio split: bad share');
    bpsTotal += bps;
  }
  if (bpsTotal !== 10_000) throw new Error('studio split: shares must add up to 10000');
  const total = BigInt(totalMinor);
  const parts = sharesBps.map((bps) => (total * BigInt(bps)) / BigInt(10_000));
  const left = total - parts.reduce((sum, part) => sum + part, BigInt(0));
  parts[remainderIndex] += left;
  const sum = parts.reduce((all, part) => all + part, BigInt(0));
  if (sum !== total || parts.some((part) => part < BigInt(0))) throw new Error('studio split: shares do not add up');
  return parts.map((part) => part.toString());
}

export interface StudioRoutingV1 {
  /** Where an enquiry goes when no topic rule matches; a member ref, or null (then only a topic rule routes). */
  defaultMemberRef: string | null;
  /** Normalized topic -> member ref. */
  byTopic: Record<string, string>;
}

/** Decodes routing rules; refs must be member refs. Anything else (unknown keys, too many topics) is refused. */
export function decodeStudioRoutingV1(value: unknown): StudioRoutingV1 | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== 'defaultMemberRef' && key !== 'byTopic')) return null;
  const def = value.defaultMemberRef === undefined ? null : value.defaultMemberRef;
  if (def !== null && (typeof def !== 'string' || !STUDIO_MEMBER_REF_PATTERN_V1.test(def))) return null;
  const rawTopics = value.byTopic === undefined ? {} : value.byTopic;
  if (!isRecord(rawTopics) || Object.keys(rawTopics).length > STUDIO_LIMITS_V1.topicsMax) return null;
  const byTopic: Record<string, string> = {};
  for (const [rawTopic, ref] of Object.entries(rawTopics)) {
    const topic = normalizeStudioTopicV1(rawTopic);
    if (!topic || Object.prototype.hasOwnProperty.call(byTopic, topic) || typeof ref !== 'string' || !STUDIO_MEMBER_REF_PATTERN_V1.test(ref)) return null;
    byTopic[topic] = ref;
  }
  return { defaultMemberRef: def as string | null, byTopic };
}

/**
 * Which member an enquiry on `topic` goes to: the member the topic rule names, else the default member; a member who is
 * not active (invited, left) is never routed to, and a topic rule pointing at one falls back to the default. Null when
 * nobody can take it.
 */
export function resolveStudioRouteV1(routing: StudioRoutingV1, activeMemberRefs: readonly string[], topic: string | null): string | null {
  const active = new Set(activeMemberRefs);
  const ruled = topic !== null && Object.prototype.hasOwnProperty.call(routing.byTopic, topic) ? routing.byTopic[topic] : null;
  if (ruled && active.has(ruled)) return ruled;
  return routing.defaultMemberRef && active.has(routing.defaultMemberRef) ? routing.defaultMemberRef : null;
}

export interface StudioCreateCommandV1 {
  name: string;
  /** The public Agent id (`agentUniqueId`) of the creator's own Agent. */
  agentId: string;
}

const AGENT_ID = /^[A-Za-z0-9_:.-]{1,120}$/;

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2069<>`]/g, '').replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= STUDIO_LIMITS_V1.nameMax && !/(?:https?:\/\/|www\.)/i.test(name) ? name : null;
}

export function decodeStudioCreateCommandV1(value: unknown): StudioCreateCommandV1 | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'name' && key !== 'agentId')) return null;
  const name = cleanName(value.name);
  return name && typeof value.agentId === 'string' && AGENT_ID.test(value.agentId) ? { name, agentId: value.agentId } : null;
}

export function decodeStudioInviteCommandV1(value: unknown): { agentId: string } | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'agentId')) return null;
  return typeof value.agentId === 'string' && AGENT_ID.test(value.agentId) ? { agentId: value.agentId } : null;
}

export interface StudioTermsCommandV1 {
  /** Absent: the equal-split placeholder. Present: one entry per member who has not left, whole basis points adding up to 10,000. */
  sharesBps: Record<string, number> | null;
  /** Absent: the studio keeps the routing it has. */
  routing: StudioRoutingV1 | null;
}

export function decodeStudioTermsCommandV1(value: unknown): StudioTermsCommandV1 | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'sharesBps' && key !== 'routing')) return null;
  let routing: StudioRoutingV1 | null = null;
  if (value.routing !== undefined) {
    routing = decodeStudioRoutingV1(value.routing);
    if (!routing) return null;
  }
  if (value.sharesBps === undefined || value.sharesBps === null) return { sharesBps: null, routing };
  if (!isRecord(value.sharesBps)) return null;
  const sharesBps: Record<string, number> = {};
  let total = 0;
  for (const [ref, bps] of Object.entries(value.sharesBps)) {
    if (!STUDIO_MEMBER_REF_PATTERN_V1.test(ref) || typeof bps !== 'number' || !Number.isInteger(bps) || bps < 0 || bps > 10_000) return null;
    sharesBps[ref] = bps;
    total += bps;
  }
  const count = Object.keys(sharesBps).length;
  return count >= 1 && count <= STUDIO_LIMITS_V1.membersMax && total === 10_000 ? { sharesBps, routing } : null;
}

export function decodeStudioAcceptCommandV1(value: unknown): { termsDigest: string } | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'termsDigest')) return null;
  return typeof value.termsDigest === 'string' && /^[0-9a-f]{64}$/.test(value.termsDigest) ? { termsDigest: value.termsDigest } : null;
}

export interface StudioEnquiryCommandV1 {
  topic: string | null;
  /** Only to recognise the same person at checkout later; kept as a keyed hash, never as an address. */
  email: string | null;
}

/** The enquiry is deliberately small: a topic and optionally an address. No message text is taken or kept. */
export function decodeStudioEnquiryCommandV1(value: unknown): StudioEnquiryCommandV1 | null {
  if (value === undefined || value === null) return { topic: null, email: null };
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'topic' && key !== 'email')) return null;
  let topic: string | null = null;
  if (value.topic !== undefined && value.topic !== null) {
    topic = normalizeStudioTopicV1(value.topic);
    if (!topic) return null;
  }
  let email: string | null = null;
  if (value.email !== undefined && value.email !== null) {
    if (typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) return null;
    email = value.email.trim();
  }
  return { topic, email };
}
