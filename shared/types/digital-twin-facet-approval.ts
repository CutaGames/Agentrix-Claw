/**
 * Digital Twin · public Facet approval ("memory → public twin", Seed Trial,
 * 2026-09-15; follow-up to the Self Model inventory / auto-link slice).
 *
 * Memory brought home through Agent Portability is `private` by default, so
 * the public twin cannot read any of it (`DIGITAL_TWIN_FACET_SENSITIVITY_ALLOWLIST_V1`).
 * DT-R07 / spec §8.3 forbid a blind one-click promotion: every item the public
 * Facet may use must be approved by the Creator or derive from an approved
 * public source. This module is that approval:
 *
 *  - a **scan** groups the Creator's own readable items deterministically
 *    (expertise / services / views / style / other; privacy, third-party and
 *    `restricted` items are excluded up front) and shows what is approved,
 *    stale or still private;
 *  - an **approve / revoke** command stores refs only — `{canonicalId, kind,
 *    version, digest}` — in the DT-owned `interim_seed_facet_approval` record.
 *    Nothing is written to the canonical memory owner; the item's own
 *    `sensitivity` stays `private`.
 *  - at answer time the public Facet may read an item when its sensitivity is
 *    `public` **or** its approval matches the live version and digest. A
 *    changed item is `stale` and is not read until re-approved.
 *
 * This record is `notAGrant`: it is the Creator's product decision inside the
 * twin, not an authority, consent or Trust fact. It migrates or is taken over
 * by the Memory owner before DT-G5 like every `interim_seed_*` record.
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinDecodeResultV1,
} from './digital-twin';
import {
  DIGITAL_TWIN_CONTEXT_KINDS_V1,
  DIGITAL_TWIN_CONTEXT_SENSITIVITIES_V1,
  DIGITAL_TWIN_FACET_SENSITIVITY_ALLOWLIST_V1,
  DIGITAL_TWIN_HARD_CEILING_V1,
  type DigitalTwinContextKindV1,
  type DigitalTwinContextSensitivityV1,
  type TwinContextItemV1,
} from './digital-twin-answer';

const { isRecord, isNonEmptyString, isIsoTimestamp, isMember, unknownKeys, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_FACET_APPROVAL_RECORD_V1 = 'interim_seed_facet_approval' as const;
/** Items per approve / revoke command; the scan itself is bounded by the owner read cap. */
export const DIGITAL_TWIN_FACET_APPROVAL_MAX_ITEMS_V1 = 200;
export const DIGITAL_TWIN_FACET_APPROVAL_EXCERPT_CHARS_V1 = 160;

export const DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1 = ['expertise', 'services', 'views', 'style', 'other', 'excluded'] as const;
export type DigitalTwinFacetApprovalGroupV1 = (typeof DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1)[number];

export const DIGITAL_TWIN_FACET_APPROVAL_ACTIONS_V1 = ['approve', 'revoke'] as const;
export type DigitalTwinFacetApprovalActionV1 = (typeof DIGITAL_TWIN_FACET_APPROVAL_ACTIONS_V1)[number];

export const DIGITAL_TWIN_FACET_APPROVAL_STATES_V1 = ['none', 'current', 'stale'] as const;
export type DigitalTwinFacetApprovalStateV1 = (typeof DIGITAL_TWIN_FACET_APPROVAL_STATES_V1)[number];

export const DIGITAL_TWIN_FACET_APPROVAL_SKIP_REASONS_V1 = [
  /** The live read no longer contains this item (deleted, or beyond the owner read cap). */
  'not_found',
  /** The item changed since the Creator saw it; scan again and approve the new version. */
  'version_changed',
  /** Privacy / third-party / `restricted` items cannot be promoted to the public Facet. */
  'excluded',
  /** Already `public` by its own sensitivity; no approval needed. */
  'already_public',
  'already_approved',
  'not_approved',
] as const;
export type DigitalTwinFacetApprovalSkipReasonV1 = (typeof DIGITAL_TWIN_FACET_APPROVAL_SKIP_REASONS_V1)[number];

/**
 * Words that keep an item out of the public candidate list regardless of
 * group (design DT-R07: relationships, family, health, money, credentials).
 * Deliberately plain so the rule is auditable; the hard ceiling's
 * privacy/third-party list applies as well.
 */
export const DIGITAL_TWIN_FACET_EXCLUDE_KEYWORDS_V1: readonly string[] = [
  '家人', '老婆', '妻子', '丈夫', '老公', '孩子', '女儿', '儿子', '父母', '爸爸', '妈妈', '男友', '女友', '恋人', '前任', '亲戚',
  '病史', '体检', '确诊', '抑郁', '工资', '薪资', '薪水', '存款', '贷款', '房贷', '负债', '密码', '住址', '身份证', '银行卡', '社保',
  'wife', 'husband', 'my kid', 'my son', 'my daughter', 'girlfriend', 'boyfriend', 'my parents', 'my mother', 'my father',
  'salary', 'password', 'diagnosed', 'therapy', 'mortgage', 'debt', 'medical record',
];

/** Group keywords; the first group whose list matches wins (services → expertise → views). */
export const DIGITAL_TWIN_FACET_GROUP_KEYWORDS_V1: Readonly<Record<'services' | 'expertise' | 'views', readonly string[]>> = {
  services: [
    '服务', '收费', '价格', '报价', '套餐', '合作', '客户', '交付', '咨询', '课程', '培训', '周期', '交期', '预约', '排期',
    'service', 'pricing', 'price', 'rate', 'package', 'client', 'consult', 'deliver', 'course', 'engagement', 'booking',
  ],
  expertise: [
    '擅长', '经验', '专长', '领域', '方法论', '技术栈', '工具', '案例', '做过', '负责', '主导', '架构', '设计', '开发', '研究',
    'expert', 'experience', 'skill', 'specializ', 'stack', 'framework', 'worked on', 'built', 'led', 'architect', 'research',
  ],
  views: [
    '认为', '观点', '相信', '主张', '原则', '反对', '支持', '看法', '判断', '倾向', '价值观', '理念',
    'think', 'believe', 'opinion', 'principle', 'view', 'stance', 'prefer', 'value',
  ],
};

export interface DigitalTwinFacetApprovedItemV1 {
  canonicalId: string;
  kind: DigitalTwinContextKindV1;
  /** Owner-read `currentVersion` / `sourceItemDigest` at approval time; a change makes the approval stale. */
  version: string;
  digest: string;
  approvedAt: string;
}

/** DT-owned Seed Trial record; refs only, never text. Stored in the interim record JSON. */
export interface DigitalTwinFacetApprovalRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: typeof DIGITAL_TWIN_FACET_APPROVAL_RECORD_V1;
  notAGrant: true;
  facet: 'public';
  items: DigitalTwinFacetApprovedItemV1[];
  /** Bumped on every approve / revoke that changed the list; part of the public decision's `policyVersion`. */
  version: number;
  updatedAt: string;
}

/** One item as the Creator sees it in the scan (owner view of the Creator's own memory; never shown to a Visitor). */
export interface DigitalTwinFacetApprovalCandidateV1 {
  canonicalId: string;
  kind: DigitalTwinContextKindV1;
  sensitivity: DigitalTwinContextSensitivityV1;
  version: string;
  digest: string;
  excerpt: string;
  group: DigitalTwinFacetApprovalGroupV1;
  /** Readable by the public Facet through its own sensitivity; approval is neither needed nor recorded. */
  alreadyPublic: boolean;
  approval: DigitalTwinFacetApprovalStateV1;
}

export interface DigitalTwinFacetApprovalScanV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  facet: 'public';
  status: 'ok' | 'unavailable';
  blockedBy?: string;
  candidates: DigitalTwinFacetApprovalCandidateV1[];
  groups: Record<DigitalTwinFacetApprovalGroupV1, number>;
  approved: {
    /** Refs in the record. */
    total: number;
    /** Refs whose live version and digest still match. */
    current: number;
    /** Refs whose item changed since approval; not read until re-approved. */
    stale: number;
    /** Refs whose item the live read no longer contains. */
    missing: number;
  };
  /** Items the public Facet can read right now: own `public` sensitivity + current approvals. */
  publicReadable: number;
  /** The owner read hit its cap; older items exist that neither the scan nor the twin can see today. */
  truncated: boolean;
  record: DigitalTwinFacetApprovalRecordV1 | null;
  /** `public` capability edge as the projection reports it; approvals are stored either way and take effect once it is on and the twin is published. */
  publicCapability: 'available' | 'unavailable';
  scannedAt: string;
}

export interface DigitalTwinFacetApprovalItemRefV1 {
  canonicalId: string;
  /** Required for `approve` (what the Creator saw); ignored for `revoke`. */
  version?: string;
  digest?: string;
}

export interface DigitalTwinFacetApprovalCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  facet: 'public';
  action: DigitalTwinFacetApprovalActionV1;
  items: DigitalTwinFacetApprovalItemRefV1[];
}

export interface DigitalTwinFacetApprovalResultV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: DigitalTwinFacetApprovalActionV1;
  /** Canonical ids this call approved / revoked. */
  applied: string[];
  skipped: Array<{ canonicalId: string; reason: DigitalTwinFacetApprovalSkipReasonV1 }>;
  record: DigitalTwinFacetApprovalRecordV1;
}

// ---------------------------------------------------------------------------
// Pure helpers (shared by backend, client and tests)
// ---------------------------------------------------------------------------

function includesAny(lower: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/** Deterministic grouping; a model may later refine groups but never un-exclude an item. */
export function groupDigitalTwinFacetCandidateV1(item: Pick<TwinContextItemV1, 'kind' | 'text' | 'sensitivity'>): DigitalTwinFacetApprovalGroupV1 {
  if (item.sensitivity === 'restricted') return 'excluded';
  const lower = item.text.toLowerCase();
  if (includesAny(lower, DIGITAL_TWIN_HARD_CEILING_V1.privacy_or_third_party) || includesAny(lower, DIGITAL_TWIN_FACET_EXCLUDE_KEYWORDS_V1)) return 'excluded';
  if (item.kind === 'persona' || item.kind === 'preference') return 'style';
  for (const group of ['services', 'expertise', 'views'] as const) {
    if (includesAny(lower, DIGITAL_TWIN_FACET_GROUP_KEYWORDS_V1[group])) return group;
  }
  return 'other';
}

/** Whether the Facet may read this item on its own sensitivity (no approval considered). */
export function digitalTwinItemPublicBySensitivityV1(item: Pick<TwinContextItemV1, 'sensitivity'>): boolean {
  return DIGITAL_TWIN_FACET_SENSITIVITY_ALLOWLIST_V1.public.includes(item.sensitivity);
}

/**
 * Canonical ids whose approval matches the live item (same version and digest).
 * This is the only thing the answer pipeline consumes; stale and missing
 * approvals contribute nothing.
 */
export function digitalTwinApprovedPublicIdsV1(
  record: DigitalTwinFacetApprovalRecordV1 | null | undefined,
  items: readonly Pick<TwinContextItemV1, 'canonicalId' | 'currentVersion' | 'sourceItemDigest'>[],
): Set<string> {
  const approved = new Set<string>();
  if (!record || record.items.length === 0) return approved;
  const byId = new Map(record.items.map((entry) => [entry.canonicalId, entry] as const));
  for (const item of items) {
    const entry = byId.get(item.canonicalId);
    if (entry && entry.version === item.currentVersion && entry.digest === item.sourceItemDigest) approved.add(item.canonicalId);
  }
  return approved;
}

/** The record before any approval: version 0, no items. */
export function emptyDigitalTwinFacetApprovalRecordV1(now: string): DigitalTwinFacetApprovalRecordV1 {
  return {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    record: DIGITAL_TWIN_FACET_APPROVAL_RECORD_V1,
    notAGrant: true,
    facet: 'public',
    items: [],
    version: 0,
    updatedAt: now,
  };
}

function zeroGroups(): Record<DigitalTwinFacetApprovalGroupV1, number> {
  const out = {} as Record<DigitalTwinFacetApprovalGroupV1, number>;
  for (const group of DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1) out[group] = 0;
  return out;
}

export function buildDigitalTwinFacetApprovalScanV1(input: {
  status: 'ok' | 'unavailable';
  blockedBy?: string;
  items: readonly TwinContextItemV1[];
  truncated: boolean;
  record: DigitalTwinFacetApprovalRecordV1 | null | undefined;
  publicCapability: 'available' | 'unavailable';
  now: string;
}): DigitalTwinFacetApprovalScanV1 {
  const record = input.record ?? null;
  const groups = zeroGroups();
  const candidates: DigitalTwinFacetApprovalCandidateV1[] = [];
  const approvedById = new Map(record?.items.map((entry) => [entry.canonicalId, entry] as const) ?? []);
  const seen = new Set<string>();
  let current = 0;
  let stale = 0;
  let publicReadable = 0;
  if (input.status === 'ok') {
    for (const item of input.items) {
      seen.add(item.canonicalId);
      const group = groupDigitalTwinFacetCandidateV1(item);
      groups[group] += 1;
      const alreadyPublic = digitalTwinItemPublicBySensitivityV1(item);
      const entry = approvedById.get(item.canonicalId);
      let approval: DigitalTwinFacetApprovalStateV1 = 'none';
      if (entry) {
        approval = entry.version === item.currentVersion && entry.digest === item.sourceItemDigest ? 'current' : 'stale';
        if (approval === 'current') current += 1;
        else stale += 1;
      }
      if (alreadyPublic || approval === 'current') publicReadable += 1;
      candidates.push({
        canonicalId: item.canonicalId,
        kind: item.kind,
        sensitivity: item.sensitivity,
        version: item.currentVersion,
        digest: item.sourceItemDigest,
        excerpt: item.text.replace(/\s+/g, ' ').trim().slice(0, DIGITAL_TWIN_FACET_APPROVAL_EXCERPT_CHARS_V1),
        group,
        alreadyPublic,
        approval,
      });
    }
  }
  const missing = input.status === 'ok' ? (record?.items ?? []).filter((entry) => !seen.has(entry.canonicalId)).length : 0;
  return {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    facet: 'public',
    status: input.status,
    ...(input.status === 'unavailable' && input.blockedBy ? { blockedBy: input.blockedBy } : {}),
    candidates,
    groups,
    approved: { total: record?.items.length ?? 0, current, stale, missing },
    publicReadable,
    truncated: input.status === 'ok' && input.truncated,
    record,
    publicCapability: input.publicCapability,
    scannedAt: input.now,
  };
}

/**
 * Applies an approve / revoke command against the live read. Pure: returns the
 * next record (same object when nothing changed) plus what was applied or
 * skipped and why. `approve` re-validates every ref: the item must exist in the
 * live read, carry the same version and digest the Creator saw, not be excluded,
 * and not already be public or approved.
 */
export function applyDigitalTwinFacetApprovalV1(input: {
  record: DigitalTwinFacetApprovalRecordV1 | null | undefined;
  items: readonly TwinContextItemV1[];
  command: DigitalTwinFacetApprovalCommandV1;
  now: string;
}): { record: DigitalTwinFacetApprovalRecordV1; applied: string[]; skipped: DigitalTwinFacetApprovalResultV1['skipped']; changed: boolean } {
  const base = input.record ?? emptyDigitalTwinFacetApprovalRecordV1(input.now);
  const live = new Map(input.items.map((item) => [item.canonicalId, item] as const));
  const approvedById = new Map(base.items.map((entry) => [entry.canonicalId, entry] as const));
  const applied: string[] = [];
  const skipped: DigitalTwinFacetApprovalResultV1['skipped'] = [];
  const nextItems = [...base.items];

  for (const ref of input.command.items) {
    if (input.command.action === 'approve') {
      const item = live.get(ref.canonicalId);
      if (!item) {
        skipped.push({ canonicalId: ref.canonicalId, reason: 'not_found' });
        continue;
      }
      if (item.currentVersion !== ref.version || item.sourceItemDigest !== ref.digest) {
        skipped.push({ canonicalId: ref.canonicalId, reason: 'version_changed' });
        continue;
      }
      if (groupDigitalTwinFacetCandidateV1(item) === 'excluded') {
        skipped.push({ canonicalId: ref.canonicalId, reason: 'excluded' });
        continue;
      }
      if (digitalTwinItemPublicBySensitivityV1(item)) {
        skipped.push({ canonicalId: ref.canonicalId, reason: 'already_public' });
        continue;
      }
      const existing = approvedById.get(ref.canonicalId);
      if (existing && existing.version === item.currentVersion && existing.digest === item.sourceItemDigest) {
        skipped.push({ canonicalId: ref.canonicalId, reason: 'already_approved' });
        continue;
      }
      const entry: DigitalTwinFacetApprovedItemV1 = {
        canonicalId: item.canonicalId,
        kind: item.kind,
        version: item.currentVersion,
        digest: item.sourceItemDigest,
        approvedAt: input.now,
      };
      const index = nextItems.findIndex((candidate) => candidate.canonicalId === ref.canonicalId);
      if (index >= 0) nextItems[index] = entry; // stale → re-approved at the new version
      else nextItems.push(entry);
      approvedById.set(ref.canonicalId, entry);
      applied.push(ref.canonicalId);
    } else {
      const index = nextItems.findIndex((candidate) => candidate.canonicalId === ref.canonicalId);
      if (index < 0) {
        skipped.push({ canonicalId: ref.canonicalId, reason: 'not_approved' });
        continue;
      }
      nextItems.splice(index, 1);
      approvedById.delete(ref.canonicalId);
      applied.push(ref.canonicalId);
    }
  }

  if (applied.length === 0) return { record: base, applied, skipped, changed: false };
  return {
    record: { ...base, items: nextItems, version: base.version + 1, updatedAt: input.now },
    applied,
    skipped,
    changed: true,
  };
}

// ---------------------------------------------------------------------------
// Strict decoders
// ---------------------------------------------------------------------------

const CANONICAL_ID_RE = /^[0-9A-Za-z_:./-]{1,160}$/;

export function decodeDigitalTwinFacetApprovalCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  const extra = unknownKeys(input, ['schemaVersion', 'facet', 'action', 'items']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.facet !== 'public') return fail('invalid_enum', ['facet']);
  if (!isMember(DIGITAL_TWIN_FACET_APPROVAL_ACTIONS_V1, input.action)) return fail('invalid_enum', ['action']);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > DIGITAL_TWIN_FACET_APPROVAL_MAX_ITEMS_V1) {
    return fail('invalid_shape', ['items']);
  }
  const items: DigitalTwinFacetApprovalItemRefV1[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < input.items.length; index += 1) {
    const ref = input.items[index];
    const path = `items[${index}]`;
    if (!isRecord(ref)) return fail('invalid_shape', [path]);
    const refExtra = unknownKeys(ref, ['canonicalId', 'version', 'digest']);
    if (refExtra.length > 0) return fail('unknown_field', refExtra.map((key) => `${path}.${key}`));
    if (!isNonEmptyString(ref.canonicalId) || !CANONICAL_ID_RE.test(ref.canonicalId)) return fail('invalid_ref', [`${path}.canonicalId`]);
    if (seen.has(ref.canonicalId)) return fail('invalid_shape', [`${path}.canonicalId duplicate`]);
    seen.add(ref.canonicalId);
    if (input.action === 'approve') {
      if (!isNonEmptyString(ref.version) || !isNonEmptyString(ref.digest)) return fail('invalid_shape', [`${path} approve needs version and digest`]);
      items.push({ canonicalId: ref.canonicalId, version: ref.version, digest: ref.digest });
    } else {
      if (ref.version !== undefined && typeof ref.version !== 'string') return fail('invalid_shape', [`${path}.version`]);
      if (ref.digest !== undefined && typeof ref.digest !== 'string') return fail('invalid_shape', [`${path}.digest`]);
      items.push({ canonicalId: ref.canonicalId });
    }
  }
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, facet: 'public', action: input.action, items } };
}

function decodeApprovedItem(input: unknown, path: string): DigitalTwinDecodeResultV1<DigitalTwinFacetApprovedItemV1> {
  if (!isRecord(input)) return fail('invalid_shape', [path]);
  const extra = unknownKeys(input, ['canonicalId', 'kind', 'version', 'digest', 'approvedAt']);
  if (extra.length > 0) return fail('unknown_field', extra.map((key) => `${path}.${key}`));
  if (!isNonEmptyString(input.canonicalId)) return fail('invalid_ref', [`${path}.canonicalId`]);
  if (!isMember(DIGITAL_TWIN_CONTEXT_KINDS_V1, input.kind)) return fail('invalid_enum', [`${path}.kind`]);
  if (!isNonEmptyString(input.version) || !isNonEmptyString(input.digest)) return fail('invalid_shape', [`${path}.version/digest`]);
  if (!isIsoTimestamp(input.approvedAt)) return fail('invalid_timestamp', [`${path}.approvedAt`]);
  return { ok: true, value: input as unknown as DigitalTwinFacetApprovedItemV1 };
}

export function decodeDigitalTwinFacetApprovalRecordV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalRecordV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['record']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['record.schemaVersion']);
  const extra = unknownKeys(input, ['schemaVersion', 'record', 'notAGrant', 'facet', 'items', 'version', 'updatedAt']);
  if (extra.length > 0) return fail('unknown_field', extra.map((key) => `record.${key}`));
  if (input.record !== DIGITAL_TWIN_FACET_APPROVAL_RECORD_V1) return fail('invalid_enum', ['record.record']);
  if (input.notAGrant !== true) return fail('invalid_shape', ['record.notAGrant']);
  if (input.facet !== 'public') return fail('invalid_enum', ['record.facet']);
  if (!Array.isArray(input.items)) return fail('invalid_shape', ['record.items']);
  const items: DigitalTwinFacetApprovedItemV1[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < input.items.length; index += 1) {
    const decoded = decodeApprovedItem(input.items[index], `record.items[${index}]`);
    if (decoded.ok === false) return decoded as DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalRecordV1>;
    if (seen.has(decoded.value.canonicalId)) return fail('invalid_shape', [`record.items[${index}] duplicate`]);
    seen.add(decoded.value.canonicalId);
    items.push(decoded.value);
  }
  if (!Number.isInteger(input.version) || (input.version as number) < 0) return fail('invalid_shape', ['record.version']);
  if (!isIsoTimestamp(input.updatedAt)) return fail('invalid_timestamp', ['record.updatedAt']);
  return { ok: true, value: { ...(input as unknown as DigitalTwinFacetApprovalRecordV1), items } };
}

function decodeCandidate(input: unknown, path: string): DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalCandidateV1> {
  if (!isRecord(input)) return fail('invalid_shape', [path]);
  const extra = unknownKeys(input, ['canonicalId', 'kind', 'sensitivity', 'version', 'digest', 'excerpt', 'group', 'alreadyPublic', 'approval']);
  if (extra.length > 0) return fail('unknown_field', extra.map((key) => `${path}.${key}`));
  if (!isNonEmptyString(input.canonicalId)) return fail('invalid_ref', [`${path}.canonicalId`]);
  if (!isMember(DIGITAL_TWIN_CONTEXT_KINDS_V1, input.kind)) return fail('invalid_enum', [`${path}.kind`]);
  if (!isMember(DIGITAL_TWIN_CONTEXT_SENSITIVITIES_V1, input.sensitivity)) return fail('invalid_enum', [`${path}.sensitivity`]);
  if (!isNonEmptyString(input.version) || !isNonEmptyString(input.digest)) return fail('invalid_shape', [`${path}.version/digest`]);
  if (typeof input.excerpt !== 'string' || input.excerpt.length > DIGITAL_TWIN_FACET_APPROVAL_EXCERPT_CHARS_V1) return fail('invalid_shape', [`${path}.excerpt`]);
  if (!isMember(DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1, input.group)) return fail('invalid_enum', [`${path}.group`]);
  if (typeof input.alreadyPublic !== 'boolean') return fail('invalid_shape', [`${path}.alreadyPublic`]);
  if (!isMember(DIGITAL_TWIN_FACET_APPROVAL_STATES_V1, input.approval)) return fail('invalid_enum', [`${path}.approval`]);
  return { ok: true, value: input as unknown as DigitalTwinFacetApprovalCandidateV1 };
}

export function decodeDigitalTwinFacetApprovalScanV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalScanV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['scan must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  const extra = unknownKeys(input, [
    'schemaVersion', 'facet', 'status', 'blockedBy', 'candidates', 'groups', 'approved', 'publicReadable', 'truncated', 'record', 'publicCapability', 'scannedAt',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.facet !== 'public') return fail('invalid_enum', ['facet']);
  if (input.status !== 'ok' && input.status !== 'unavailable') return fail('invalid_enum', ['status']);
  if (input.blockedBy !== undefined && !isNonEmptyString(input.blockedBy)) return fail('invalid_shape', ['blockedBy']);
  if (!Array.isArray(input.candidates)) return fail('invalid_shape', ['candidates']);
  const candidates: DigitalTwinFacetApprovalCandidateV1[] = [];
  for (let index = 0; index < input.candidates.length; index += 1) {
    const decoded = decodeCandidate(input.candidates[index], `candidates[${index}]`);
    if (decoded.ok === false) return decoded as DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalScanV1>;
    candidates.push(decoded.value);
  }
  if (!isRecord(input.groups) || unknownKeys(input.groups, DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1).length > 0) return fail('invalid_shape', ['groups']);
  for (const group of DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1) {
    if (!Number.isInteger(input.groups[group]) || (input.groups[group] as number) < 0) return fail('invalid_shape', [`groups.${group}`]);
  }
  if (!isRecord(input.approved) || unknownKeys(input.approved, ['total', 'current', 'stale', 'missing']).length > 0) return fail('invalid_shape', ['approved']);
  for (const key of ['total', 'current', 'stale', 'missing'] as const) {
    if (!Number.isInteger(input.approved[key]) || (input.approved[key] as number) < 0) return fail('invalid_shape', [`approved.${key}`]);
  }
  if (!Number.isInteger(input.publicReadable) || (input.publicReadable as number) < 0) return fail('invalid_shape', ['publicReadable']);
  if (typeof input.truncated !== 'boolean') return fail('invalid_shape', ['truncated']);
  let record: DigitalTwinFacetApprovalRecordV1 | null = null;
  if (input.record !== null) {
    const decoded = decodeDigitalTwinFacetApprovalRecordV1(input.record);
    if (decoded.ok === false) return decoded as DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalScanV1>;
    record = decoded.value;
  }
  if (input.publicCapability !== 'available' && input.publicCapability !== 'unavailable') return fail('invalid_enum', ['publicCapability']);
  if (!isIsoTimestamp(input.scannedAt)) return fail('invalid_timestamp', ['scannedAt']);
  // Consistency the client must not recompute: group counts and readable count follow the rows.
  const groups = zeroGroups();
  let readable = 0;
  for (const candidate of candidates) {
    groups[candidate.group] += 1;
    if (candidate.alreadyPublic || candidate.approval === 'current') readable += 1;
  }
  for (const group of DIGITAL_TWIN_FACET_APPROVAL_GROUPS_V1) {
    if (groups[group] !== input.groups[group]) return fail('invalid_shape', [`groups.${group} mismatch`]);
  }
  if (readable !== input.publicReadable) return fail('invalid_shape', ['publicReadable mismatch']);
  return { ok: true, value: { ...(input as unknown as DigitalTwinFacetApprovalScanV1), candidates, record } };
}

export function decodeDigitalTwinFacetApprovalResultV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalResultV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['result must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  const extra = unknownKeys(input, ['schemaVersion', 'action', 'applied', 'skipped', 'record']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isMember(DIGITAL_TWIN_FACET_APPROVAL_ACTIONS_V1, input.action)) return fail('invalid_enum', ['action']);
  if (!Array.isArray(input.applied) || !input.applied.every((id) => isNonEmptyString(id))) return fail('invalid_shape', ['applied']);
  if (!Array.isArray(input.skipped)) return fail('invalid_shape', ['skipped']);
  const skipped: DigitalTwinFacetApprovalResultV1['skipped'] = [];
  for (let index = 0; index < input.skipped.length; index += 1) {
    const entry = input.skipped[index];
    if (!isRecord(entry) || unknownKeys(entry, ['canonicalId', 'reason']).length > 0) return fail('invalid_shape', [`skipped[${index}]`]);
    if (!isNonEmptyString(entry.canonicalId)) return fail('invalid_ref', [`skipped[${index}].canonicalId`]);
    if (!isMember(DIGITAL_TWIN_FACET_APPROVAL_SKIP_REASONS_V1, entry.reason)) return fail('invalid_enum', [`skipped[${index}].reason`]);
    skipped.push({ canonicalId: entry.canonicalId, reason: entry.reason });
  }
  const record = decodeDigitalTwinFacetApprovalRecordV1(input.record);
  if (record.ok === false) return record as DigitalTwinDecodeResultV1<DigitalTwinFacetApprovalResultV1>;
  return {
    ok: true,
    value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: input.action, applied: input.applied as string[], skipped, record: record.value },
  };
}
