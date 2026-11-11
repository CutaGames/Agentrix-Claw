/**
 * Digital Twin · Self Model inventory and auto-link (Seed Trial; tasks 4.4 / 4.5
 * follow-up "memory → twin", 2026-09-14).
 *
 * The twin owns no memory. These contracts only describe:
 *
 *  1. what the Agent's canonical memory owner currently lets the twin read —
 *     counts per kind / sensitivity / Facet, never text, never ids of items;
 *  2. which committed Agent Portability import jobs target this Agent and
 *     whether the twin has linked them, so a Creator who already brought memory
 *     home (workbench Bring Memory, MCP handoff, paste) does not have to import
 *     it a second time before `ready_private` can be derived.
 *
 * Nothing here is a grant, a consent or a Facet promotion. Auto-link only adds
 * refs to jobs whose committed receipt the Portability owner read corroborates
 * for this exact Agent (same rule as the single-job link).
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_FACETS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  decodeDigitalTwinSelfModelSummaryV1,
  isDigitalTwinRefV1,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinFacetV1,
  type DigitalTwinRefV1,
  type DigitalTwinSelfModelSummaryV1,
} from './digital-twin';
import {
  DIGITAL_TWIN_CONTEXT_KINDS_V1,
  DIGITAL_TWIN_CONTEXT_SENSITIVITIES_V1,
  digitalTwinFacetAllowsItemV1,
  type DigitalTwinContextKindV1,
  type DigitalTwinContextSensitivityV1,
  type TwinContextItemV1,
} from './digital-twin-answer';

const { isRecord, isNonEmptyString, isIsoTimestamp, unknownKeys, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

/** Hard ceiling of the owner read the twin consumes today (`AGENT_IMPORTED_FACTS_OWNER_READ`, newest first). */
export const DIGITAL_TWIN_SELF_MODEL_CONTEXT_CAP_V1 = 200;

/** Upper bound of committed import jobs the inventory lists (newest first). */
export const DIGITAL_TWIN_SELF_MODEL_JOB_LIST_LIMIT_V1 = 50;

export interface DigitalTwinSelfModelContextInventoryV1 {
  status: 'ok' | 'unavailable';
  /** Port or flag that made the read unavailable; absent when `ok`. */
  blockedBy?: string;
  /** Items the owner read returned (≤ `cap`). */
  total: number;
  /** The owner read hit its cap: older items exist that the twin cannot see today. */
  truncated: boolean;
  cap: number;
  byKind: Record<DigitalTwinContextKindV1, number>;
  bySensitivity: Record<DigitalTwinContextSensitivityV1, number>;
  /** How many of `total` each Facet may read (`public` sees `public` sensitivity only). */
  readableByFacet: Record<DigitalTwinFacetV1, number>;
}

export interface DigitalTwinImportJobInventoryEntryV1 {
  /** `kind: 'import_job'`; the Portability job id is opaque (`import_<hex>` in production). */
  importJobRef: DigitalTwinRefV1;
  committedAt: string;
  /** The twin already holds a corroborated link for this job. */
  linked: boolean;
}

export interface DigitalTwinImportJobInventoryV1 {
  status: 'ok' | 'unavailable';
  blockedBy?: string;
  /** Committed jobs whose target is this Agent, newest first, bounded by `DIGITAL_TWIN_SELF_MODEL_JOB_LIST_LIMIT_V1`. */
  jobs: DigitalTwinImportJobInventoryEntryV1[];
  unlinkedCount: number;
}

export interface DigitalTwinSelfModelInventoryV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  context: DigitalTwinSelfModelContextInventoryV1;
  importJobs: DigitalTwinImportJobInventoryV1;
  linked: DigitalTwinSelfModelSummaryV1;
  projectedAt: string;
}

export const DIGITAL_TWIN_AUTO_LINK_SKIP_REASONS_V1 = ['unverified'] as const;
export type DigitalTwinAutoLinkSkipReasonV1 = (typeof DIGITAL_TWIN_AUTO_LINK_SKIP_REASONS_V1)[number];

export interface DigitalTwinAutoLinkSelfModelResultV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  /** Jobs linked by this call. */
  linked: DigitalTwinRefV1[];
  /** Jobs that were already linked before this call. */
  alreadyLinked: DigitalTwinRefV1[];
  /** Committed jobs for this Agent the read could not corroborate (no receipt); retry later. */
  skipped: Array<{ importJobRef: DigitalTwinRefV1; reason: DigitalTwinAutoLinkSkipReasonV1 }>;
  summary: DigitalTwinSelfModelSummaryV1;
}

// ---------------------------------------------------------------------------
// Pure helpers (shared by backend and tests)
// ---------------------------------------------------------------------------

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = 0;
  return out;
}

/**
 * Counts what a Facet-bounded retrieval would be allowed to see. Deterministic,
 * text-free; the same allowlist the answer pipeline applies.
 */
export function summarizeDigitalTwinContextInventoryV1(input: {
  status: 'ok' | 'unavailable';
  items: readonly TwinContextItemV1[];
  truncated: boolean;
  blockedBy?: string;
  cap?: number;
  /** Public Facet approvals matching the live items (`digitalTwinApprovedPublicIdsV1`); counted into `readableByFacet.public`. */
  approvedPublicIds?: ReadonlySet<string>;
}): DigitalTwinSelfModelContextInventoryV1 {
  const byKind = zeroRecord(DIGITAL_TWIN_CONTEXT_KINDS_V1);
  const bySensitivity = zeroRecord(DIGITAL_TWIN_CONTEXT_SENSITIVITIES_V1);
  const readableByFacet = zeroRecord(DIGITAL_TWIN_FACETS_V1);
  if (input.status === 'ok') {
    for (const item of input.items) {
      byKind[item.kind] += 1;
      bySensitivity[item.sensitivity] += 1;
      for (const facet of DIGITAL_TWIN_FACETS_V1) {
        if (digitalTwinFacetAllowsItemV1(item, facet, input.approvedPublicIds)) readableByFacet[facet] += 1;
      }
    }
  }
  return {
    status: input.status,
    ...(input.status === 'unavailable' && input.blockedBy ? { blockedBy: input.blockedBy } : {}),
    total: input.status === 'ok' ? input.items.length : 0,
    truncated: input.status === 'ok' && input.truncated,
    cap: input.cap ?? DIGITAL_TWIN_SELF_MODEL_CONTEXT_CAP_V1,
    byKind,
    bySensitivity,
    readableByFacet,
  };
}

// ---------------------------------------------------------------------------
// Strict decoders
// ---------------------------------------------------------------------------

function isCountRecord<K extends string>(value: unknown, keys: readonly K[]): value is Record<K, number> {
  if (!isRecord(value)) return false;
  if (unknownKeys(value, keys).length > 0) return false;
  return keys.every((key) => Number.isInteger(value[key]) && (value[key] as number) >= 0);
}

function decodeContextInventory(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinSelfModelContextInventoryV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['context']);
  const extra = unknownKeys(input, ['status', 'blockedBy', 'total', 'truncated', 'cap', 'byKind', 'bySensitivity', 'readableByFacet']);
  if (extra.length > 0) return fail('unknown_field', extra.map((key) => `context.${key}`));
  if (input.status !== 'ok' && input.status !== 'unavailable') return fail('invalid_enum', ['context.status']);
  if (input.blockedBy !== undefined && !isNonEmptyString(input.blockedBy)) return fail('invalid_shape', ['context.blockedBy']);
  if (!Number.isInteger(input.total) || (input.total as number) < 0) return fail('invalid_shape', ['context.total']);
  if (typeof input.truncated !== 'boolean') return fail('invalid_shape', ['context.truncated']);
  if (!Number.isInteger(input.cap) || (input.cap as number) <= 0) return fail('invalid_shape', ['context.cap']);
  if (!isCountRecord(input.byKind, DIGITAL_TWIN_CONTEXT_KINDS_V1)) return fail('invalid_shape', ['context.byKind']);
  if (!isCountRecord(input.bySensitivity, DIGITAL_TWIN_CONTEXT_SENSITIVITIES_V1)) return fail('invalid_shape', ['context.bySensitivity']);
  if (!isCountRecord(input.readableByFacet, DIGITAL_TWIN_FACETS_V1)) return fail('invalid_shape', ['context.readableByFacet']);
  return { ok: true, value: input as unknown as DigitalTwinSelfModelContextInventoryV1 };
}

function decodeJobEntry(input: unknown, path: string): DigitalTwinDecodeResultV1<DigitalTwinImportJobInventoryEntryV1> {
  if (!isRecord(input)) return fail('invalid_shape', [path]);
  const extra = unknownKeys(input, ['importJobRef', 'committedAt', 'linked']);
  if (extra.length > 0) return fail('unknown_field', extra.map((key) => `${path}.${key}`));
  if (!isDigitalTwinRefV1(input.importJobRef) || input.importJobRef.kind !== 'import_job') return fail('invalid_ref', [`${path}.importJobRef`]);
  if (!isIsoTimestamp(input.committedAt)) return fail('invalid_timestamp', [`${path}.committedAt`]);
  if (typeof input.linked !== 'boolean') return fail('invalid_shape', [`${path}.linked`]);
  return { ok: true, value: input as unknown as DigitalTwinImportJobInventoryEntryV1 };
}

function decodeJobInventory(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinImportJobInventoryV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['importJobs']);
  const extra = unknownKeys(input, ['status', 'blockedBy', 'jobs', 'unlinkedCount']);
  if (extra.length > 0) return fail('unknown_field', extra.map((key) => `importJobs.${key}`));
  if (input.status !== 'ok' && input.status !== 'unavailable') return fail('invalid_enum', ['importJobs.status']);
  if (input.blockedBy !== undefined && !isNonEmptyString(input.blockedBy)) return fail('invalid_shape', ['importJobs.blockedBy']);
  if (!Array.isArray(input.jobs)) return fail('invalid_shape', ['importJobs.jobs']);
  const jobs: DigitalTwinImportJobInventoryEntryV1[] = [];
  for (let index = 0; index < input.jobs.length; index += 1) {
    const decoded = decodeJobEntry(input.jobs[index], `importJobs.jobs[${index}]`);
    if (decoded.ok === false) return decoded as DigitalTwinDecodeResultV1<DigitalTwinImportJobInventoryV1>;
    jobs.push(decoded.value);
  }
  if (!Number.isInteger(input.unlinkedCount) || (input.unlinkedCount as number) < 0) return fail('invalid_shape', ['importJobs.unlinkedCount']);
  if ((input.unlinkedCount as number) !== jobs.filter((job) => !job.linked).length) return fail('invalid_shape', ['importJobs.unlinkedCount mismatch']);
  return { ok: true, value: { ...(input as unknown as DigitalTwinImportJobInventoryV1), jobs } };
}

export function decodeDigitalTwinSelfModelInventoryV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinSelfModelInventoryV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['inventory must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  const extra = unknownKeys(input, ['schemaVersion', 'context', 'importJobs', 'linked', 'projectedAt']);
  if (extra.length > 0) return fail('unknown_field', extra);
  const context = decodeContextInventory(input.context);
  if (context.ok === false) return context as DigitalTwinDecodeResultV1<DigitalTwinSelfModelInventoryV1>;
  const importJobs = decodeJobInventory(input.importJobs);
  if (importJobs.ok === false) return importJobs as DigitalTwinDecodeResultV1<DigitalTwinSelfModelInventoryV1>;
  const linked = decodeDigitalTwinSelfModelSummaryV1(input.linked);
  if (linked.ok === false) return linked as DigitalTwinDecodeResultV1<DigitalTwinSelfModelInventoryV1>;
  if (!isIsoTimestamp(input.projectedAt)) return fail('invalid_timestamp', ['projectedAt']);
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      context: context.value,
      importJobs: importJobs.value,
      linked: linked.value,
      projectedAt: input.projectedAt,
    },
  };
}

function decodeImportJobRefArray(value: unknown, path: string): DigitalTwinDecodeResultV1<DigitalTwinRefV1[]> {
  if (!Array.isArray(value)) return fail('invalid_shape', [path]);
  if (!value.every((ref) => isDigitalTwinRefV1(ref) && ref.kind === 'import_job')) return fail('invalid_ref', [path]);
  return { ok: true, value: value as DigitalTwinRefV1[] };
}

export function decodeDigitalTwinAutoLinkSelfModelResultV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinAutoLinkSelfModelResultV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['auto-link result must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  const extra = unknownKeys(input, ['schemaVersion', 'linked', 'alreadyLinked', 'skipped', 'summary']);
  if (extra.length > 0) return fail('unknown_field', extra);
  const linked = decodeImportJobRefArray(input.linked, 'linked');
  if (linked.ok === false) return linked as DigitalTwinDecodeResultV1<DigitalTwinAutoLinkSelfModelResultV1>;
  const alreadyLinked = decodeImportJobRefArray(input.alreadyLinked, 'alreadyLinked');
  if (alreadyLinked.ok === false) return alreadyLinked as DigitalTwinDecodeResultV1<DigitalTwinAutoLinkSelfModelResultV1>;
  if (!Array.isArray(input.skipped)) return fail('invalid_shape', ['skipped']);
  const skipped: DigitalTwinAutoLinkSelfModelResultV1['skipped'] = [];
  for (let index = 0; index < input.skipped.length; index += 1) {
    const entry = input.skipped[index];
    if (!isRecord(entry) || unknownKeys(entry, ['importJobRef', 'reason']).length > 0) return fail('invalid_shape', [`skipped[${index}]`]);
    if (!isDigitalTwinRefV1(entry.importJobRef) || entry.importJobRef.kind !== 'import_job') return fail('invalid_ref', [`skipped[${index}].importJobRef`]);
    if (!(DIGITAL_TWIN_AUTO_LINK_SKIP_REASONS_V1 as readonly string[]).includes(entry.reason as string)) return fail('invalid_enum', [`skipped[${index}].reason`]);
    skipped.push({ importJobRef: entry.importJobRef, reason: entry.reason as DigitalTwinAutoLinkSkipReasonV1 });
  }
  const summary = decodeDigitalTwinSelfModelSummaryV1(input.summary);
  if (summary.ok === false) return summary as DigitalTwinDecodeResultV1<DigitalTwinAutoLinkSelfModelResultV1>;
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      linked: linked.value,
      alreadyLinked: alreadyLinked.value,
      skipped,
      summary: summary.value,
    },
  };
}
