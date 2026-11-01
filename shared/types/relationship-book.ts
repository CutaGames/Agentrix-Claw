/**
 * Relationship book (L8 batch 2, R4). One row per person the owner has dealt with: who they are, how they were
 * verified, a tier label, where they came from, the last contact, what is still open and the owner's own note.
 * It is the owner's private record. It is never shown to a Visitor except the part the Visitor left themselves, never
 * given to the public twin, and an Agent only reads a thin slice of it through an Agent Pass (category
 * `relationship_book`, see `agent-pass.ts`).
 *
 * Behind `RELATIONSHIP_BOOK_V1_ENABLED` (server, default off, exactly `'1'`); every route answers 404 while it is off,
 * and nothing is written to the book. Clients: web `NEXT_PUBLIC_RELATIONSHIP_BOOK_ENABLED`, mobile
 * `EXPO_PUBLIC_RELATIONSHIP_BOOK`, desktop `VITE_RELATIONSHIP_BOOK_ENABLED`.
 *
 * Owner routes (`/relationships`, signed in, the caller's own rows only):
 * - `GET  ?tier=&limit=`            → `{ success, data: { items: RelationshipContactSummaryV1[] } }` (no contact details)
 * - `GET  :contactRef`              → `{ success, data: RelationshipContactViewV1 }` (with contact details)
 * - `POST`                          body `RelationshipContactInputV1` (name required) → the new `RelationshipContactViewV1`
 * - `PATCH :contactRef`             body `RelationshipContactInputV1` (any subset) → `RelationshipContactViewV1`
 * - `POST :contactRef/open-items/clear` body `{ kind, ref }` → `RelationshipContactViewV1`
 * - `DELETE :contactRef`            → `{ deleted: true }` (the sealed contact details are deleted with it)
 *
 * Visitor routes (the Visitor's own entries only; sign in, or send the lead's session id in `x-visitor-session`):
 * - `GET  /relationships/visitor/entries`            → `{ success, data: { items: RelationshipVisitorEntryV1[] } }`
 * - `DELETE /relationships/visitor/entries/:entryRef` → `{ withdrawn: true }`
 *
 * The tier is a label for the owner. It does not grant anything: what a counterpart may do still comes from the
 * relationship table and the Agent Pass.
 */
import { AGENT_PASS_TIER_PRESETS_V1, type AgentPassTierPresetV1 } from './agent-pass';

export const RELATIONSHIP_BOOK_FLAG_V1 = 'RELATIONSHIP_BOOK_V1_ENABLED';
export const RELATIONSHIP_BOOK_WEB_FLAG_V1 = 'NEXT_PUBLIC_RELATIONSHIP_BOOK_ENABLED';
export const RELATIONSHIP_BOOK_MOBILE_FLAG_V1 = 'EXPO_PUBLIC_RELATIONSHIP_BOOK';
export const RELATIONSHIP_BOOK_DESKTOP_FLAG_V1 = 'VITE_RELATIONSHIP_BOOK_ENABLED';

export const RELATIONSHIPS_PATH_V1 = '/relationships';
export const RELATIONSHIP_VISITOR_ENTRIES_PATH_V1 = '/relationships/visitor/entries';
/** The header a Visitor without an account sends: the session id they got when they left their details. */
export const RELATIONSHIP_VISITOR_SESSION_HEADER_V1 = 'x-visitor-session';
/** Shorter ids are never accepted as a credential. */
export const RELATIONSHIP_VISITOR_SESSION_MIN_CHARS_V1 = 16;

/** Where a person came from. `referral` is reserved for R7 (nothing writes it yet). */
export const RELATIONSHIP_SOURCE_KINDS_V1 = [
  'card',
  'qr',
  'share_page',
  'external_agent',
  'referral',
  'event',
  'lead',
  'booking',
  'channel',
  'manual',
] as const;
export type RelationshipSourceKindV1 = (typeof RELATIONSHIP_SOURCE_KINDS_V1)[number];

/** How we know who they are. `account` = a signed-in Agentrix user; `mutual_scan` = both sides confirmed in person. */
export const RELATIONSHIP_VERIFICATIONS_V1 = ['none', 'passport', 'dns', 'account', 'mutual_scan'] as const;
export type RelationshipVerificationV1 = (typeof RELATIONSHIP_VERIFICATIONS_V1)[number];

/** The four R2 tiers (client, collaborator, family, community). Empty means not sorted yet. */
export const RELATIONSHIP_TIERS_V1 = AGENT_PASS_TIER_PRESETS_V1;
export type RelationshipTierV1 = AgentPassTierPresetV1;

/**
 * A Visitor who left details through the public twin was promised they are deleted after this many days
 * (`DIGITAL_TWIN_LEAD_RETENTION_DAYS_V1`); the book clears the contact and message on a lead-session row at the same age.
 */
export const RELATIONSHIP_LEAD_DETAILS_RETENTION_DAYS_V1 = 90 as const;

export const RELATIONSHIP_OPEN_ITEM_KINDS_V1 = ['booking', 'deposit', 'reply_promised'] as const;
export type RelationshipOpenItemKindV1 = (typeof RELATIONSHIP_OPEN_ITEM_KINDS_V1)[number];

export const RELATIONSHIP_LIMITS_V1 = {
  displayNameMax: 120,
  ownerNoteMax: 1000,
  metNoteMax: 200,
  eventTagMax: 60,
  emailMax: 254,
  phoneMax: 40,
  otherContactMax: 120,
  visitorMessageMax: 500,
  openItemsMax: 20,
  openItemRefMax: 64,
  listDefault: 50,
  listMax: 200,
} as const;

/** Who a row is about, for de-duplication and for a Visitor to find their own entries. Hashed before it is stored. */
export const RELATIONSHIP_IDENTITY_KINDS_V1 = ['session', 'user', 'agent', 'telegram', 'contact', 'reply'] as const;
export type RelationshipIdentityKindV1 = (typeof RELATIONSHIP_IDENTITY_KINDS_V1)[number];

export interface RelationshipOpenItemV1 {
  kind: RelationshipOpenItemKindV1;
  /** An opaque reference to the booking, order or lead behind it. Never content. */
  ref: string;
  since: string;
}

export interface RelationshipContactDetailsV1 {
  email: string | null;
  phone: string | null;
  /** A contact the Visitor gave in another channel (WeChat and so on). */
  other: string | null;
  /** What the Visitor wrote when they left their details. */
  visitorMessage: string | null;
}

/** `plain` = stored in the clear (the owner key switch was off); `sealed` = opened from the sealed table; `unreadable` = sealed and cannot be opened now. */
export const RELATIONSHIP_CONTACT_STATES_V1 = ['none', 'plain', 'sealed', 'unreadable'] as const;
export type RelationshipContactStateV1 = (typeof RELATIONSHIP_CONTACT_STATES_V1)[number];

export interface RelationshipContactSummaryV1 {
  contactRef: string;
  displayName: string | null;
  verification: RelationshipVerificationV1;
  tier: RelationshipTierV1 | null;
  sourceKind: RelationshipSourceKindV1;
  metNote: string | null;
  eventTag: string | null;
  firstSeenAt: string;
  lastContactAt: string;
  openItems: RelationshipOpenItemV1[];
  hasContact: boolean;
  /** True when the person can see and withdraw what they left (they have an account or a lead session). */
  visitorCanWithdraw: boolean;
}

export interface RelationshipContactViewV1 extends RelationshipContactSummaryV1 {
  ownerNote: string | null;
  contactState: RelationshipContactStateV1;
  contact: RelationshipContactDetailsV1 | null;
}

/** The owner creates or edits a row. Every field is optional on edit; `null` clears a field. */
export interface RelationshipContactInputV1 {
  displayName?: string | null;
  tier?: RelationshipTierV1 | null;
  ownerNote?: string | null;
  metNote?: string | null;
  eventTag?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** What a Visitor sees of their own entry: only what they left. Never the tier, the note, the open items or other people. */
export interface RelationshipVisitorEntryV1 {
  entryRef: string;
  /** The name of the Agent whose owner holds the entry. */
  agentLabel: string | null;
  sourceKind: RelationshipSourceKindV1;
  leftAt: string;
  /** The contact the Visitor left, masked (`a***@example.com`). */
  contactMasked: string | null;
  message: string | null;
}

/** An Agent holding a Pass reads only this. No contact details, no notes, no open items. */
export interface RelationshipAgentViewV1 {
  contactRef: string;
  displayName: string | null;
  tier: RelationshipTierV1 | null;
  sourceKind: RelationshipSourceKindV1;
  lastContactAt: string;
}

export const RELATIONSHIP_REASON_CODES_V1 = ['invalid_type', 'invalid_value', 'unknown_field', 'missing_field'] as const;
export type RelationshipReasonCodeV1 = (typeof RELATIONSHIP_REASON_CODES_V1)[number];

export type RelationshipDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: RelationshipReasonCodeV1; field: string };

export function relationshipContactPathV1(contactRef: string): string {
  return `${RELATIONSHIPS_PATH_V1}/${encodeURIComponent(contactRef)}`;
}
export function relationshipOpenItemsClearPathV1(contactRef: string): string {
  return `${relationshipContactPathV1(contactRef)}/open-items/clear`;
}
export function relationshipVisitorEntryPathV1(entryRef: string): string {
  return `${RELATIONSHIP_VISITOR_ENTRIES_PATH_V1}/${encodeURIComponent(entryRef)}`;
}

// ── text rules (server and clients share them) ───────────────────────────────────────────────

/** Control characters out, runs of white space folded, trimmed. `null` when nothing is left or the text is too long. */
export function cleanRelationshipTextV1(value: unknown, max: number, options: { multiline?: boolean } = {}): string | null {
  if (typeof value !== 'string') return null;
  // A line break or tab in a single-line field is a space, not a gap that glues two words together.
  const spaced = options.multiline ? value : value.replace(/[\t\n\r\u000b\u000c]/g, ' ');
  // eslint-disable-next-line no-control-regex
  const stripped = spaced.replace(options.multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '');
  const text = options.multiline ? stripped.trim() : stripped.replace(/\s+/g, ' ').trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

export function isRelationshipEmailV1(value: string): boolean {
  return value.length <= RELATIONSHIP_LIMITS_V1.emailMax && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function isRelationshipPhoneV1(value: string): boolean {
  return value.length <= RELATIONSHIP_LIMITS_V1.phoneMax && /^\+?[0-9][0-9 -]{5,}$/.test(value);
}

/** `a***@example.com`, `+65 ****1234`. Enough for a person to recognise their own, not enough to copy. */
export function maskRelationshipContactV1(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const at = value.indexOf('@');
  if (at > 0) return `${value.slice(0, 1)}***${value.slice(at)}`;
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 6) return `${value.startsWith('+') ? '+' : ''}****${digits.slice(-4)}`;
  return `${value.slice(0, 1)}***`;
}

// ── decoding ──────────────────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: RelationshipReasonCodeV1; field: string };

function fail(reasonCode: RelationshipReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

const INPUT_KEYS = ['displayName', 'tier', 'ownerNote', 'metNote', 'eventTag', 'email', 'phone'] as const;

/** An owner create / edit body. Unknown fields are refused; `null` clears; a name is required when `requireName`. */
export function decodeRelationshipContactInputV1(value: unknown, options: { requireName?: boolean } = {}): RelationshipDecodeResultV1<RelationshipContactInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (!(INPUT_KEYS as readonly string[]).includes(key)) return fail('unknown_field', key);
  if (options.requireName && (value.displayName === undefined || value.displayName === null)) return fail('missing_field', 'displayName');
  const out: RelationshipContactInputV1 = {};
  const text = (key: 'displayName' | 'ownerNote' | 'metNote' | 'eventTag', max: number, multiline = false): Failure | null => {
    const raw = value[key];
    if (raw === undefined) return null;
    if (raw === null) {
      out[key] = null;
      return null;
    }
    if (typeof raw !== 'string') return fail('invalid_type', key);
    const cleaned = cleanRelationshipTextV1(raw, max, { multiline });
    if (cleaned === null) return fail('invalid_value', key);
    out[key] = cleaned;
    return null;
  };
  const bad =
    text('displayName', RELATIONSHIP_LIMITS_V1.displayNameMax) ??
    text('ownerNote', RELATIONSHIP_LIMITS_V1.ownerNoteMax, true) ??
    text('metNote', RELATIONSHIP_LIMITS_V1.metNoteMax) ??
    text('eventTag', RELATIONSHIP_LIMITS_V1.eventTagMax);
  if (bad) return bad;
  if (value.tier !== undefined) {
    if (value.tier === null) out.tier = null;
    else if (typeof value.tier !== 'string') return fail('invalid_type', 'tier');
    else if (!oneOf(RELATIONSHIP_TIERS_V1, value.tier)) return fail('invalid_value', 'tier');
    else out.tier = value.tier;
  }
  for (const key of ['email', 'phone'] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (raw === null) {
      out[key] = null;
      continue;
    }
    if (typeof raw !== 'string') return fail('invalid_type', key);
    const cleaned = cleanRelationshipTextV1(raw, key === 'email' ? RELATIONSHIP_LIMITS_V1.emailMax : RELATIONSHIP_LIMITS_V1.phoneMax);
    if (cleaned === null || !(key === 'email' ? isRelationshipEmailV1(cleaned) : isRelationshipPhoneV1(cleaned))) return fail('invalid_value', key);
    out[key] = cleaned;
  }
  return { ok: true, value: out };
}

export function decodeRelationshipOpenItemClearV1(value: unknown): RelationshipDecodeResultV1<{ kind: RelationshipOpenItemKindV1; ref: string }> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (key !== 'kind' && key !== 'ref') return fail('unknown_field', key);
  if (!oneOf(RELATIONSHIP_OPEN_ITEM_KINDS_V1, value.kind)) return fail(value.kind === undefined ? 'missing_field' : 'invalid_value', 'kind');
  if (typeof value.ref !== 'string' || value.ref.length < 1 || value.ref.length > RELATIONSHIP_LIMITS_V1.openItemRefMax) return fail(value.ref === undefined ? 'missing_field' : 'invalid_value', 'ref');
  return { ok: true, value: { kind: value.kind, ref: value.ref } };
}

function decodeOpenItems(value: unknown): RelationshipOpenItemV1[] | null {
  if (!Array.isArray(value) || value.length > RELATIONSHIP_LIMITS_V1.openItemsMax) return null;
  const out: RelationshipOpenItemV1[] = [];
  for (const item of value) {
    if (!isRecord(item) || !oneOf(RELATIONSHIP_OPEN_ITEM_KINDS_V1, item.kind) || typeof item.ref !== 'string' || !isIso(item.since)) return null;
    out.push({ kind: item.kind, ref: item.ref, since: item.since });
  }
  return out;
}

function decodeSummaryFields(value: Record<string, unknown>): RelationshipContactSummaryV1 | null {
  if (typeof value.contactRef !== 'string' || !/^rel_[0-9a-f]{32}$/.test(value.contactRef)) return null;
  if (value.displayName !== null && typeof value.displayName !== 'string') return null;
  if (!oneOf(RELATIONSHIP_VERIFICATIONS_V1, value.verification)) return null;
  if (value.tier !== null && !oneOf(RELATIONSHIP_TIERS_V1, value.tier)) return null;
  if (!oneOf(RELATIONSHIP_SOURCE_KINDS_V1, value.sourceKind)) return null;
  if (value.metNote !== null && typeof value.metNote !== 'string') return null;
  if (value.eventTag !== null && typeof value.eventTag !== 'string') return null;
  if (!isIso(value.firstSeenAt) || !isIso(value.lastContactAt)) return null;
  const openItems = decodeOpenItems(value.openItems);
  if (!openItems) return null;
  if (typeof value.hasContact !== 'boolean' || typeof value.visitorCanWithdraw !== 'boolean') return null;
  return {
    contactRef: value.contactRef,
    // The backend build runs without strictNullChecks, where `!== null && typeof …` does not narrow `unknown`: cast what was checked.
    displayName: value.displayName as string | null,
    verification: value.verification,
    tier: value.tier as RelationshipTierV1 | null,
    sourceKind: value.sourceKind,
    metNote: value.metNote as string | null,
    eventTag: value.eventTag as string | null,
    firstSeenAt: value.firstSeenAt,
    lastContactAt: value.lastContactAt,
    openItems,
    hasContact: value.hasContact,
    visitorCanWithdraw: value.visitorCanWithdraw,
  };
}

function unwrap(body: unknown): unknown {
  return isRecord(body) && isRecord(body.data) && body.items === undefined && body.contactRef === undefined ? body.data : body;
}

/** `GET /relationships` → the list, or `null` when any row cannot be read. */
export function decodeRelationshipListV1(body: unknown): RelationshipContactSummaryV1[] | null {
  const outer = unwrap(body);
  if (!isRecord(outer) || !Array.isArray(outer.items)) return null;
  const out: RelationshipContactSummaryV1[] = [];
  for (const item of outer.items) {
    const decoded = isRecord(item) ? decodeSummaryFields(item) : null;
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

export function decodeRelationshipContactViewV1(body: unknown): RelationshipContactViewV1 | null {
  const value = unwrap(body);
  if (!isRecord(value)) return null;
  const summary = decodeSummaryFields(value);
  if (!summary) return null;
  if (value.ownerNote !== null && typeof value.ownerNote !== 'string') return null;
  if (!oneOf(RELATIONSHIP_CONTACT_STATES_V1, value.contactState)) return null;
  let contact: RelationshipContactDetailsV1 | null = null;
  if (value.contact !== null) {
    const c = value.contact;
    if (!isRecord(c)) return null;
    for (const key of ['email', 'phone', 'other', 'visitorMessage'] as const) if (c[key] !== null && typeof c[key] !== 'string') return null;
    contact = { email: c.email as string | null, phone: c.phone as string | null, other: c.other as string | null, visitorMessage: c.visitorMessage as string | null };
  }
  return { ...summary, ownerNote: value.ownerNote as string | null, contactState: value.contactState, contact };
}

export function decodeRelationshipVisitorEntriesV1(body: unknown): RelationshipVisitorEntryV1[] | null {
  const outer = unwrap(body);
  if (!isRecord(outer) || !Array.isArray(outer.items)) return null;
  const out: RelationshipVisitorEntryV1[] = [];
  for (const item of outer.items) {
    if (!isRecord(item) || typeof item.entryRef !== 'string' || !/^rel_[0-9a-f]{32}$/.test(item.entryRef)) return null;
    if (item.agentLabel !== null && typeof item.agentLabel !== 'string') return null;
    if (!oneOf(RELATIONSHIP_SOURCE_KINDS_V1, item.sourceKind) || !isIso(item.leftAt)) return null;
    if (item.contactMasked !== null && typeof item.contactMasked !== 'string') return null;
    if (item.message !== null && typeof item.message !== 'string') return null;
    out.push({
      entryRef: item.entryRef,
      agentLabel: item.agentLabel as string | null,
      sourceKind: item.sourceKind,
      leftAt: item.leftAt,
      contactMasked: item.contactMasked as string | null,
      message: item.message as string | null,
    });
  }
  return out;
}

// ── words for the screens ─────────────────────────────────────────────────────────────────────

export interface RelationshipCopyV1 {
  zh: string;
  en: string;
}

export const RELATIONSHIP_TIER_COPY_V1: Readonly<Record<RelationshipTierV1, RelationshipCopyV1>> = {
  client: { zh: '客户', en: 'Client' },
  collaborator: { zh: '合作者', en: 'Collaborator' },
  family: { zh: '家人', en: 'Family' },
  community: { zh: '学员 / 社群', en: 'Students / community' },
};

export const RELATIONSHIP_SOURCE_COPY_V1: Readonly<Record<RelationshipSourceKindV1, RelationshipCopyV1>> = {
  card: { zh: '名片', en: 'Card' },
  qr: { zh: '二维码', en: 'QR code' },
  share_page: { zh: '共享页', en: 'Shared page' },
  external_agent: { zh: '别人的 Agent', en: "Someone else's Agent" },
  referral: { zh: '引荐', en: 'Referral' },
  event: { zh: '活动', en: 'Event' },
  lead: { zh: '留下联系方式', en: 'Left their details' },
  booking: { zh: '预约', en: 'Booking' },
  channel: { zh: '聊天渠道', en: 'Chat channel' },
  manual: { zh: '自己添加', en: 'Added by you' },
};

export const RELATIONSHIP_VERIFICATION_COPY_V1: Readonly<Record<RelationshipVerificationV1, RelationshipCopyV1>> = {
  none: { zh: '未核实', en: 'Not verified' },
  passport: { zh: '护照签名已核实', en: 'Passport signature verified' },
  dns: { zh: '域名已核实', en: 'Domain verified' },
  account: { zh: '已登录账号', en: 'Signed-in account' },
  mutual_scan: { zh: '当面互扫确认', en: 'Confirmed in person' },
};

export const RELATIONSHIP_OPEN_ITEM_COPY_V1: Readonly<Record<RelationshipOpenItemKindV1, RelationshipCopyV1>> = {
  booking: { zh: '有一个预约', en: 'A booking' },
  deposit: { zh: '定金没结', en: 'A deposit is open' },
  reply_promised: { zh: '答应了要回复', en: 'You owe a reply' },
};

export function relationshipOpenItemsLabelV1(items: readonly RelationshipOpenItemV1[], language: 'zh' | 'en'): string {
  return items.map((item) => RELATIONSHIP_OPEN_ITEM_COPY_V1[item.kind][language]).join(language === 'zh' ? '、' : ', ');
}

export function isRelationshipBookClientEnabledV1(value: string | undefined): boolean {
  return value === '1';
}
