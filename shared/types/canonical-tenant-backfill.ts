/**
 * Canonical tenant backfill reconciliation — CCR-06 second half.
 *
 * Tenant columns were written independently by migrations 1880, 1883, 1889, 1890
 * and 1891 before the Canonical Tenant Authority existed. This contract defines
 * how those legacy values are *classified* against the authority, and what may
 * and may not be written as a result.
 *
 * Two rules are structural, not advisory:
 *
 *  1. **The authority never invents tenancy.** A tenant may only be proposed when
 *     the legacy row carries enough authoritative linkage for the Tenant
 *     Authority to resolve an existing active assignment. Deriving a tenant from
 *     an owner id, an email, a slug or a name is owner inference relocated into a
 *     write and is forbidden.
 *  2. **The authority never writes another domain's table.** Reconciliation is
 *     query-only and produces verdicts. Each domain owner applies its own column
 *     using those verdicts, so the Tenant Authority does not become a second
 *     writer for Authority, Shell, Portability, Continuity or Trust data.
 */
import { computeDigest, type DigestRef } from './trust-loop-primitives';
import {
  CANONICAL_TENANT_FORBIDDEN_IDS_V1,
  isCanonicalTenantIdV1,
  type CanonicalTenantEnvironmentV1,
} from './canonical-tenant-authority';

export const CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION = 1 as const;
export const CANONICAL_TENANT_BACKFILL_DOMAIN =
  'AGENTRIX_CANONICAL_TENANT_BACKFILL_V1' as const;

/**
 * How much authoritative linkage a legacy row carries.
 *
 *  - `agent_and_owner`: the row has an Agent account id **and** an owner user id,
 *    so the authority can resolve an assignment with full binding.
 *  - `agent_only`: the row identifies the Agent but not the owner principal the
 *    authority query requires.
 *  - `owner_only`: the row identifies only a principal. Resolving from this alone
 *    is owner inference and is refused.
 *  - `none`: no usable linkage.
 */
export const CANONICAL_TENANT_LINKAGE_LEVELS_V1 = [
  'agent_and_owner',
  'agent_only',
  'owner_only',
  'none',
] as const;
export type CanonicalTenantLinkageLevelV1 =
  (typeof CANONICAL_TENANT_LINKAGE_LEVELS_V1)[number];

/** Only this level can ever produce an automatic proposal. */
export const CANONICAL_TENANT_RECONCILABLE_LINKAGE_V1: CanonicalTenantLinkageLevelV1 =
  'agent_and_owner';

export type CanonicalTenantLegacyStorageV1 = 'text' | 'jsonb';

/**
 * Frozen inventory of every legacy tenant column, with the owner that must apply
 * any change. Adding a column here does not grant the authority write access.
 */
export interface CanonicalTenantLegacyColumnV1 {
  table: string;
  column: string;
  storage: CanonicalTenantLegacyStorageV1;
  /** Migration that created the column. */
  migration: string;
  /** Domain owner responsible for applying an update to this column. */
  ownerDomain:
    | 'authority'
    | 'soul_shell'
    | 'agent_portability'
    | 'soul_core_continuity'
    | 'trust_core';
  linkage: CanonicalTenantLinkageLevelV1;
  /** Column holding the Agent account id, when present. */
  agentAccountColumn?: string;
  /** Column holding the owner user id, when present. */
  ownerUserColumn?: string;
  /** Notes a real hazard observed in the schema. */
  hazard?: string;
}

export const CANONICAL_TENANT_LEGACY_COLUMNS_V1: readonly CanonicalTenantLegacyColumnV1[] = [
  {
    table: 'authority_grants',
    column: 'tenant_ref',
    storage: 'jsonb',
    migration: '1880000000000',
    ownerDomain: 'authority',
    linkage: 'agent_only',
    agentAccountColumn: 'agent_account_id',
    hazard:
      'sibling column tenant_key defaults to the forbidden literal "global"; rows carrying it must never be treated as tenanted',
  },
  {
    table: 'shell_session_bindings',
    column: 'tenant_ref',
    storage: 'jsonb',
    migration: '1883000000000',
    ownerDomain: 'soul_shell',
    linkage: 'agent_only',
    agentAccountColumn: 'agent_account_id',
  },
  {
    table: 'agent_portability_import_jobs',
    column: 'tenant_ref',
    storage: 'text',
    migration: '1889000000000',
    ownerDomain: 'agent_portability',
    linkage: 'owner_only',
    hazard: 'no Agent account column, so any resolution would be owner inference',
  },
  {
    table: 'agent_portability_staged_archives',
    column: 'tenant_ref',
    storage: 'text',
    migration: '1889000000000',
    ownerDomain: 'agent_portability',
    linkage: 'owner_only',
    hazard: 'no Agent account column, so any resolution would be owner inference',
  },
  {
    table: 'agent_portability_staging_access_audit',
    column: 'tenant_ref',
    storage: 'text',
    migration: '1889000000000',
    ownerDomain: 'agent_portability',
    linkage: 'owner_only',
    hazard: 'audit evidence; must be reconciled by appending, never by rewriting',
  },
  {
    table: 'agent_portability_archive_scans',
    column: 'tenant_ref',
    storage: 'text',
    migration: '1889000000000',
    ownerDomain: 'agent_portability',
    linkage: 'owner_only',
    hazard: 'no Agent account column, so any resolution would be owner inference',
  },
  {
    table: 'soul_core_continuity_snapshots',
    column: 'tenant_id',
    storage: 'text',
    migration: '1890000000000',
    ownerDomain: 'soul_core_continuity',
    linkage: 'agent_and_owner',
    agentAccountColumn: 'agent_account_id',
    ownerUserColumn: 'owner_principal_ref',
    hazard:
      'agent_account_id and owner_principal_ref are varchar, so each row needs a UUID check before the authority is queried; sealed snapshot evidence is immutable and must be reconciled by supersession, not update',
  },
  {
    table: 'trust_core_challenge_journal',
    column: 'tenant_id',
    storage: 'text',
    migration: '1891000000000',
    ownerDomain: 'trust_core',
    // The linkage is a fact about the row and stays accurate. Whether the column
    // may be written is a separate axis, decided by the immutable-evidence list.
    linkage: 'agent_and_owner',
    agentAccountColumn: 'agent_account_id',
    ownerUserColumn: 'owner_user_id',
    hazard:
      'migration 1891 locks this column with six independent storage-level guards, any one of which blocks a write: ' +
      'the trigger lists tenant_id among immutable request facts; chk_trust_core_challenge_request requires ' +
      "request_snapshot->>'tenantId' to equal the column while the same trigger forbids editing request_snapshot; " +
      'request_digest seals tenantId and is immutable; chk_trust_core_challenge_receipt binds a terminal receipt to ' +
      'the column and terminal receipts are immutable; optimistic_version must advance by exactly one, which the ' +
      'shared accessor signature cannot express; and uq_trust_core_challenge_idempotency includes tenant_id, so a ' +
      'rewrite can collide. Supersession is also unavailable: the row is an idempotency reservation, so a corrected ' +
      'duplicate would let one logical operation execute under two tenants.',
  },
];

/**
 * Per-row verdict. `reconcilable` is the only classification an owner may apply
 * automatically.
 */
export const CANONICAL_TENANT_BACKFILL_CLASSIFICATIONS_V1 = [
  'already_canonical',
  'reconcilable',
  'conflicting',
  'unresolvable',
  'malformed',
  'linkage_absent',
  'forbidden_literal',
] as const;
export type CanonicalTenantBackfillClassificationV1 =
  (typeof CANONICAL_TENANT_BACKFILL_CLASSIFICATIONS_V1)[number];

/**
 * The whole safety property of this design in one constant: nothing except a
 * fully linked, authority-confirmed, non-conflicting row may be written.
 */
export const CANONICAL_TENANT_BACKFILL_APPLICABLE_CLASSIFICATIONS_V1: readonly CanonicalTenantBackfillClassificationV1[] =
  ['reconcilable'];

export function isCanonicalTenantBackfillApplicableV1(
  classification: CanonicalTenantBackfillClassificationV1,
): boolean {
  return CANONICAL_TENANT_BACKFILL_APPLICABLE_CLASSIFICATIONS_V1.includes(classification);
}

export const CANONICAL_TENANT_BACKFILL_REASONS_V1 = [
  'value_already_canonical',
  'authority_assignment_found',
  'authority_disagrees_with_stored_value',
  'authority_assignment_absent',
  'authority_assignment_ambiguous',
  'authority_unavailable',
  'value_not_canonical_form',
  'value_is_forbidden_literal',
  'row_lacks_agent_and_owner_linkage',
  'owner_inference_refused',
  'immutable_evidence_requires_supersession',
] as const;
export type CanonicalTenantBackfillReasonV1 =
  (typeof CANONICAL_TENANT_BACKFILL_REASONS_V1)[number];

export interface CanonicalTenantBackfillVerdictV1 {
  schemaVersion: typeof CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION;
  table: string;
  column: string;
  /** Primary key of the legacy row. */
  rowRef: string;
  environment: CanonicalTenantEnvironmentV1;
  /** Stored value as observed. Never rewritten in place by the authority. */
  observedValue: string | null;
  classification: CanonicalTenantBackfillClassificationV1;
  reasonCode: CanonicalTenantBackfillReasonV1;
  /** Present only for `reconcilable`. */
  proposedTenantId?: string;
  /** The assignment that justifies the proposal. */
  authorityAssignmentRef?: string;
  /** True only when the owning domain may apply this verdict automatically. */
  applicable: boolean;
  observedAt: string;
  verdictDigest: DigestRef;
}

export interface CanonicalTenantBackfillCountsV1 {
  already_canonical: number;
  reconcilable: number;
  conflicting: number;
  unresolvable: number;
  malformed: number;
  linkage_absent: number;
  forbidden_literal: number;
}

export interface CanonicalTenantBackfillReportV1 {
  schemaVersion: typeof CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION;
  reportDomain: typeof CANONICAL_TENANT_BACKFILL_DOMAIN;
  environment: CanonicalTenantEnvironmentV1;
  /** Always true: this contract has no apply path. */
  dryRun: true;
  scanned: readonly { table: string; column: string; rows: number }[];
  counts: CanonicalTenantBackfillCountsV1;
  verdicts: readonly CanonicalTenantBackfillVerdictV1[];
  /** Columns the authority refuses to classify automatically, with the reason. */
  refusedColumns: readonly {
    table: string;
    column: string;
    reasonCode: CanonicalTenantBackfillReasonV1;
  }[];
  observedAt: string;
  reportDigest: DigestRef;
}

export type CanonicalTenantBackfillResultV1 =
  | { status: 'reported'; report: CanonicalTenantBackfillReportV1 }
  | {
      status: 'unavailable';
      reasonCode: 'authority_disabled' | 'backfill_disabled' | 'source_unreadable';
    };

export interface CanonicalTenantBackfillScanRequestV1 {
  schemaVersion: typeof CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION;
  environment: CanonicalTenantEnvironmentV1;
  /** Restrict the scan; omit to cover every registered column. */
  tables?: readonly string[];
  /** Bounded batch so a scan cannot become an unbounded table walk. */
  limitPerTable: number;
}

/**
 * Query-only reconciliation port. `appliesUpdates: false` and
 * `writesForeignTables: false` are literal types, so an implementation that
 * mutates another domain's data cannot satisfy this interface.
 */
export interface CanonicalTenantBackfillReconciliationPortV1 {
  readonly portId: string;
  readonly available: boolean;
  readonly appliesUpdates: false;
  readonly writesForeignTables: false;
  scan(
    request: CanonicalTenantBackfillScanRequestV1,
  ): Promise<CanonicalTenantBackfillResultV1>;
}

export function computeCanonicalTenantBackfillVerdictDigestV1(
  verdict: Omit<CanonicalTenantBackfillVerdictV1, 'verdictDigest'>,
): DigestRef {
  return computeDigest({ domain: CANONICAL_TENANT_BACKFILL_DOMAIN, verdict });
}

export function sealCanonicalTenantBackfillVerdictV1(
  unsigned: Omit<CanonicalTenantBackfillVerdictV1, 'verdictDigest'>,
): CanonicalTenantBackfillVerdictV1 {
  return {
    ...unsigned,
    verdictDigest: computeCanonicalTenantBackfillVerdictDigestV1(unsigned),
  };
}

export function emptyCanonicalTenantBackfillCountsV1(): CanonicalTenantBackfillCountsV1 {
  return {
    already_canonical: 0,
    reconcilable: 0,
    conflicting: 0,
    unresolvable: 0,
    malformed: 0,
    linkage_absent: 0,
    forbidden_literal: 0,
  };
}

/**
 * Classifies one legacy value against the authority's answer.
 *
 * `authorityTenantId` must be `undefined` unless the caller resolved it through
 * the Tenant Authority using full Agent plus owner linkage. Passing a value
 * derived any other way defeats the whole policy.
 */
export function classifyCanonicalTenantLegacyValueV1(input: {
  column: CanonicalTenantLegacyColumnV1;
  observedValue: string | null;
  linkage: CanonicalTenantLinkageLevelV1;
  authorityStatus?: 'found' | 'not_found' | 'ambiguous' | 'unavailable';
  authorityTenantId?: string;
}): {
  classification: CanonicalTenantBackfillClassificationV1;
  reasonCode: CanonicalTenantBackfillReasonV1;
  proposedTenantId?: string;
} {
  const { observedValue } = input;
  const trimmed = observedValue === null ? null : observedValue.trim();

  // A forbidden literal is never a tenant, even if a column happens to store it.
  if (
    trimmed !== null &&
    (CANONICAL_TENANT_FORBIDDEN_IDS_V1 as readonly string[]).includes(trimmed.toLowerCase())
  ) {
    return {
      classification: 'forbidden_literal',
      reasonCode: 'value_is_forbidden_literal',
    };
  }

  const storedIsCanonical = isCanonicalTenantIdV1(trimmed);

  // Without full linkage the authority must not be consulted for a proposal.
  if (input.linkage !== CANONICAL_TENANT_RECONCILABLE_LINKAGE_V1) {
    if (storedIsCanonical) {
      return { classification: 'already_canonical', reasonCode: 'value_already_canonical' };
    }
    return {
      classification: 'linkage_absent',
      reasonCode:
        input.linkage === 'owner_only'
          ? 'owner_inference_refused'
          : 'row_lacks_agent_and_owner_linkage',
    };
  }

  switch (input.authorityStatus) {
    case 'unavailable':
      return { classification: 'unresolvable', reasonCode: 'authority_unavailable' };
    case 'ambiguous':
      return { classification: 'unresolvable', reasonCode: 'authority_assignment_ambiguous' };
    case 'not_found':
      return storedIsCanonical
        ? { classification: 'already_canonical', reasonCode: 'value_already_canonical' }
        : { classification: 'unresolvable', reasonCode: 'authority_assignment_absent' };
    case 'found':
      break;
    default:
      return { classification: 'unresolvable', reasonCode: 'authority_assignment_absent' };
  }

  const authorityTenantId = input.authorityTenantId;
  if (!isCanonicalTenantIdV1(authorityTenantId)) {
    return { classification: 'malformed', reasonCode: 'value_not_canonical_form' };
  }

  if (storedIsCanonical) {
    // Both sides are canonical. Agreement is a no-op; disagreement is never
    // silently overwritten, because one of the two is a real integrity problem.
    return trimmed === authorityTenantId
      ? { classification: 'already_canonical', reasonCode: 'value_already_canonical' }
      : {
          classification: 'conflicting',
          reasonCode: 'authority_disagrees_with_stored_value',
        };
  }

  return {
    classification: 'reconcilable',
    reasonCode: 'authority_assignment_found',
    proposedTenantId: authorityTenantId,
  };
}

export function computeCanonicalTenantBackfillReportDigestV1(
  report: Omit<CanonicalTenantBackfillReportV1, 'reportDigest'>,
): DigestRef {
  return computeDigest({ domain: CANONICAL_TENANT_BACKFILL_DOMAIN, report });
}

export interface CanonicalTenantBackfillValidationResultV1 {
  valid: boolean;
  errors: string[];
}

/**
 * Verifies a report is self-consistent and, above all, that nothing outside the
 * applicable classification is marked applicable.
 */
export function validateCanonicalTenantBackfillReportV1(
  report: unknown,
): CanonicalTenantBackfillValidationResultV1 {
  const errors: string[] = [];
  if (typeof report !== 'object' || report === null) {
    return { valid: false, errors: ['report must be an object'] };
  }
  const value = report as CanonicalTenantBackfillReportV1;

  if (value.schemaVersion !== CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION) {
    errors.push('report.schemaVersion is unsupported');
  }
  if (value.reportDomain !== CANONICAL_TENANT_BACKFILL_DOMAIN) {
    errors.push('report.reportDomain is unsupported');
  }
  if (value.dryRun !== true) errors.push('report.dryRun must be true');
  if (!Array.isArray(value.verdicts)) {
    errors.push('report.verdicts must be an array');
    return { valid: false, errors };
  }

  const counts = emptyCanonicalTenantBackfillCountsV1();
  for (const verdict of value.verdicts) {
    const classification = verdict.classification as CanonicalTenantBackfillClassificationV1;
    if (
      !(CANONICAL_TENANT_BACKFILL_CLASSIFICATIONS_V1 as readonly string[]).includes(classification)
    ) {
      errors.push(`unsupported classification ${String(verdict.classification)}`);
      continue;
    }
    counts[classification] += 1;

    const shouldApply = isCanonicalTenantBackfillApplicableV1(classification);
    if (verdict.applicable !== shouldApply) {
      errors.push(
        `${verdict.table}.${verdict.column}#${verdict.rowRef}: applicable must be ${String(shouldApply)} for ${verdict.classification}`,
      );
    }
    if (classification === 'reconcilable') {
      if (!isCanonicalTenantIdV1(verdict.proposedTenantId)) {
        errors.push(
          `${verdict.table}#${verdict.rowRef}: a reconcilable verdict requires a canonical proposedTenantId`,
        );
      }
      if (!verdict.authorityAssignmentRef) {
        errors.push(
          `${verdict.table}#${verdict.rowRef}: a reconcilable verdict requires an authority assignment reference`,
        );
      }
    } else if (verdict.proposedTenantId !== undefined) {
      errors.push(
        `${verdict.table}#${verdict.rowRef}: only a reconcilable verdict may carry a proposedTenantId`,
      );
    }

    const expected = computeCanonicalTenantBackfillVerdictDigestV1({
      schemaVersion: verdict.schemaVersion,
      table: verdict.table,
      column: verdict.column,
      rowRef: verdict.rowRef,
      environment: verdict.environment,
      observedValue: verdict.observedValue,
      classification: verdict.classification,
      reasonCode: verdict.reasonCode,
      ...(verdict.proposedTenantId === undefined
        ? {}
        : { proposedTenantId: verdict.proposedTenantId }),
      ...(verdict.authorityAssignmentRef === undefined
        ? {}
        : { authorityAssignmentRef: verdict.authorityAssignmentRef }),
      applicable: verdict.applicable,
      observedAt: verdict.observedAt,
    });
    if (expected.value !== verdict.verdictDigest?.value) {
      errors.push(`${verdict.table}#${verdict.rowRef}: verdictDigest does not match content`);
    }
  }

  for (const key of Object.keys(counts) as (keyof CanonicalTenantBackfillCountsV1)[]) {
    if (value.counts?.[key] !== counts[key]) {
      errors.push(`report.counts.${key} disagrees with the verdict list`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------------- *
 * Owner-side apply path
 *
 * The scan above is deliberately `dryRun: true` forever. Applying a verdict is a
 * write to a domain's own column, so it belongs to that domain's owner — the
 * authority publishing an apply method would make it a second writer for
 * Authority, Shell, Portability, Continuity and Trust data at once.
 *
 * What is shared is the *shape* of that apply, because the dangerous parts are
 * identical everywhere and must not be re-derived per owner:
 *
 *  - only `reconcilable` + `applicable` verdicts may be applied;
 *  - the verdict digest must be re-verified, since verdicts travel through a
 *    ledger table and a re-sealed or edited row must not be trusted;
 *  - the row must still hold the value the verdict was computed from, otherwise a
 *    concurrent legitimate write would be silently clobbered;
 *  - the proposed tenant must be a canonical id, never a forbidden literal;
 *  - an owner may only touch tables the inventory assigns to it.
 *
 * **As of this contract, zero columns are auto-applicable.**
 *
 * An earlier revision claimed exactly one — `trust_core_challenge_journal.tenant_id`.
 * The Trust Core owner then implemented the requested accessor and reported back
 * that the column cannot be written at all: migration 1891 guards it with six
 * independent storage-level rules, and supersession is unavailable because the row
 * is an idempotency reservation. That was verified against the DDL, so the column
 * is now registered as immutable evidence and the count is zero.
 *
 * Zero is the correct, stable answer rather than an embarrassing gap. It matches
 * the CCR-06 forward-only decision, and it now rests on DDL rather than on policy:
 * every remaining legacy column is either `owner_only`/`none` linkage (resolution
 * would be owner inference) or immutable evidence. The apply path therefore exists
 * to be provably refused, and stays published so a future column that genuinely is
 * writable inherits the safety ordering instead of re-deriving it.
 * ------------------------------------------------------------------------- */

/** Why a single verdict was not applied. Distinct from the scan reasons. */
export const CANONICAL_TENANT_APPLY_SKIP_REASONS_V1 = [
  'not_applicable',
  'not_reconcilable',
  'foreign_owner_domain',
  'unknown_column',
  /**
   * The column is registered and the owner is correct, but the row is immutable
   * evidence, so no write is possible at any version.
   *
   * Added because no existing member states this without asserting something
   * false. `unknown_column` claims the inventory does not know the column, when it
   * does. `not_applicable` asserts `verdict.applicable === false`, which is untrue
   * for a verdict that reconciled correctly. `stale_observation` asserts a
   * competing writer that does not exist. The distinction matters operationally: a
   * caller must stop rather than fix inputs and retry.
   */
  'column_is_immutable_evidence',
  'verdict_digest_mismatch',
  'proposal_absent',
  'proposal_not_canonical',
  'proposal_forbidden_literal',
  'environment_mismatch',
  /** The row no longer holds the observed value the verdict was computed from. */
  'stale_observation',
  'row_absent',
  'already_applied',
] as const;
export type CanonicalTenantApplySkipReasonV1 =
  (typeof CANONICAL_TENANT_APPLY_SKIP_REASONS_V1)[number];

export type CanonicalTenantApplyOutcomeV1 =
  | { rowRef: string; status: 'applied' }
  | { rowRef: string; status: 'skipped'; reasonCode: CanonicalTenantApplySkipReasonV1 }
  /** The write could not be confirmed. Must be reconciled, never blindly retried. */
  | { rowRef: string; status: 'unknown' };

export interface CanonicalTenantApplyRequestV1 {
  schemaVersion: typeof CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION;
  environment: CanonicalTenantEnvironmentV1;
  verdicts: readonly CanonicalTenantBackfillVerdictV1[];
  /**
   * Defaults to true at every call site in this contract. A caller must opt in to
   * mutating anything, so an accidental invocation reports instead of writing.
   */
  dryRun: boolean;
}

export interface CanonicalTenantApplyReportV1 {
  schemaVersion: typeof CANONICAL_TENANT_BACKFILL_SCHEMA_VERSION;
  reportDomain: typeof CANONICAL_TENANT_BACKFILL_DOMAIN;
  ownerDomain: CanonicalTenantLegacyColumnV1['ownerDomain'];
  environment: CanonicalTenantEnvironmentV1;
  dryRun: boolean;
  outcomes: readonly CanonicalTenantApplyOutcomeV1[];
  applied: number;
  skipped: number;
  unknown: number;
  observedAt: string;
  reportDigest: DigestRef;
}

export type CanonicalTenantApplyResultV1 =
  | { status: 'reported'; report: CanonicalTenantApplyReportV1 }
  | {
      status: 'unavailable';
      reasonCode: 'authority_disabled' | 'apply_disabled' | 'owner_unavailable' | 'source_unreadable';
    };

/**
 * Owner-side apply port. `writesForeignTables: false` stays a literal: an owner
 * applies only its own columns, and the base implementation refuses verdicts for
 * tables the inventory assigns elsewhere.
 */
export interface CanonicalTenantBackfillApplyPortV1 {
  readonly portId: string;
  readonly available: boolean;
  readonly ownerDomain: CanonicalTenantLegacyColumnV1['ownerDomain'];
  readonly writesForeignTables: false;
  /** Columns this owner is willing to apply, a subset of its inventory entries. */
  readonly appliedColumns: readonly { table: string; column: string }[];
  apply(request: CanonicalTenantApplyRequestV1): Promise<CanonicalTenantApplyResultV1>;
}

export function computeCanonicalTenantApplyReportDigestV1(
  report: Omit<CanonicalTenantApplyReportV1, 'reportDigest'>,
): DigestRef {
  return computeDigest({ domain: CANONICAL_TENANT_BACKFILL_DOMAIN, apply: report });
}

/**
 * Columns that may ever be applied automatically, derived from the inventory so
 * the two can never disagree. Immutable-evidence tables are excluded here rather
 * than only inside the scan, so an owner cannot reach them through the apply path.
 */
export const CANONICAL_TENANT_IMMUTABLE_EVIDENCE_TABLES_V1: readonly string[] = [
  'soul_core_continuity_snapshots',
  'agent_portability_staging_access_audit',
  /**
   * Registered on the Trust Core owner's report, verified against migration 1891.
   * Listing it here is what makes the refusal structural: without it,
   * `canonicalTenantAutoApplicableColumnsV1()` keeps advertising a column that the
   * database will reject, and the refusal depends on the owner remembering to
   * decline.
   */
  'trust_core_challenge_journal',
];

export function canonicalTenantAutoApplicableColumnsV1(): readonly CanonicalTenantLegacyColumnV1[] {
  return canonicalTenantApplicableColumnsFromV1(CANONICAL_TENANT_LEGACY_COLUMNS_V1);
}

/**
 * Single decision point for whether one verdict may be applied by one owner.
 * Returns the skip reason instead of a boolean so callers report why, and so the
 * ordering of checks is fixed for every owner.
 */
/**
 * A string discriminant rather than a boolean one: this repository compiles with
 * `strictNullChecks: false`, where narrowing on `eligible: true | false` does not
 * hold and the skip branch loses its `reasonCode`.
 */
export type CanonicalTenantApplyEligibilityV1 =
  | { decision: 'eligible'; column: CanonicalTenantLegacyColumnV1 }
  | { decision: 'skip'; reasonCode: CanonicalTenantApplySkipReasonV1 };

/**
 * Derives the applicable set from an arbitrary inventory.
 *
 * Exists because the real inventory now yields zero applicable columns, which
 * leaves the shared apply path's write logic — compare-and-set, unknown outcomes,
 * absent versus already-applied versus stale — unreachable and therefore
 * untestable. Conformance suites supply a synthetic writable column instead.
 *
 * The immutable-evidence filter is applied here rather than by the caller, so a
 * supplied inventory can never be used to reach an immutable-evidence table no
 * matter what it claims.
 */
export function canonicalTenantApplicableColumnsFromV1(
  inventory: readonly CanonicalTenantLegacyColumnV1[],
): readonly CanonicalTenantLegacyColumnV1[] {
  return inventory.filter(
    (column) =>
      column.linkage === CANONICAL_TENANT_RECONCILABLE_LINKAGE_V1 &&
      !CANONICAL_TENANT_IMMUTABLE_EVIDENCE_TABLES_V1.includes(column.table),
  );
}

export function classifyCanonicalTenantApplyEligibilityV1(input: {
  verdict: CanonicalTenantBackfillVerdictV1;
  ownerDomain: CanonicalTenantLegacyColumnV1['ownerDomain'];
  environment: CanonicalTenantEnvironmentV1;
  /**
   * Conformance seam, defaulting to the frozen real inventory. Supplying one
   * cannot widen reach to immutable evidence; that filter is unconditional.
   */
  inventory?: readonly CanonicalTenantLegacyColumnV1[];
}): CanonicalTenantApplyEligibilityV1 {
  const { verdict, ownerDomain, environment } = input;
  const inventory = input.inventory ?? CANONICAL_TENANT_LEGACY_COLUMNS_V1;

  if (verdict.environment !== environment) {
    return { decision: 'skip', reasonCode: 'environment_mismatch' };
  }

  const column = canonicalTenantApplicableColumnsFromV1(inventory).find(
    (entry) => entry.table === verdict.table && entry.column === verdict.column,
  );
  if (!column) {
    /**
     * Separated so the caller learns which of two very different situations it is
     * in. Immutable evidence will never become writable, so the caller must stop
     * permanently; an unknown column may simply be missing from the inventory,
     * which is a contract gap someone can close.
     *
     * Immutability is checked against the global registry rather than the supplied
     * inventory, because it is a permanent property of the table and must report
     * the same way to every caller.
     */
    if (CANONICAL_TENANT_IMMUTABLE_EVIDENCE_TABLES_V1.includes(verdict.table)) {
      return { decision: 'skip', reasonCode: 'column_is_immutable_evidence' };
    }
    return { decision: 'skip', reasonCode: 'unknown_column' };
  }
  if (column.ownerDomain !== ownerDomain) {
    return { decision: 'skip', reasonCode: 'foreign_owner_domain' };
  }

  if (verdict.classification !== 'reconcilable') {
    return { decision: 'skip', reasonCode: 'not_reconcilable' };
  }
  if (!verdict.applicable) return { decision: 'skip', reasonCode: 'not_applicable' };

  // Re-seal and compare: verdicts arrive via a ledger, so the digest is the only
  // thing tying the row back to the scan that produced it.
  const { verdictDigest, ...body } = verdict;
  if (computeCanonicalTenantBackfillVerdictDigestV1(body).value !== verdictDigest.value) {
    return { decision: 'skip', reasonCode: 'verdict_digest_mismatch' };
  }

  const proposal = verdict.proposedTenantId;
  if (!proposal) return { decision: 'skip', reasonCode: 'proposal_absent' };
  if ((CANONICAL_TENANT_FORBIDDEN_IDS_V1 as readonly string[]).includes(proposal)) {
    return { decision: 'skip', reasonCode: 'proposal_forbidden_literal' };
  }
  if (!isCanonicalTenantIdV1(proposal)) {
    return { decision: 'skip', reasonCode: 'proposal_not_canonical' };
  }

  return { decision: 'eligible', column };
}
