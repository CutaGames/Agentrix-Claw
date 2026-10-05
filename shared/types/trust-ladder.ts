/**
 * Trust ladder, v0 (L6-6): look -> suggest -> prepare -> commit (查 -> 建议 -> 准备 -> 承诺).
 *
 * The owner picks how far an Agent may go on its own. Each level fixes, per tool class, whether the Agent may act
 * without asking, must ask, or may not act; and it maps onto the D1 spending budget (`spend-budget.ts`): below
 * `commit` every limit is 0, so no payment can run on its own; `commit` uses limits the owner states explicitly.
 * v0 stores the level and applies the budget mapping; enforcing the tool classes in chat comes later.
 *
 * Server switch: `TRUST_LADDER_V0_ENABLED` exactly `1` (and D1 budget settings on); otherwise 404.
 * Web: `NEXT_PUBLIC_TRUST_LADDER_ENABLED` exactly `1`.
 */

export const TRUST_LADDER_ROUTES_V0 = {
  read: 'GET /api/trust-ladder/:agentAccountId',
  update: 'PUT /api/trust-ladder/:agentAccountId',
} as const;

export const TRUST_LADDER_LEVELS_V0 = ['look', 'suggest', 'prepare', 'commit'] as const;
export type TrustLadderLevelV0 = (typeof TRUST_LADDER_LEVELS_V0)[number];

/** read: look things up. draft: prepare something the owner can send. commit: pay, book, send or sign. */
export const TRUST_LADDER_TOOL_CLASSES_V0 = ['read', 'draft', 'commit'] as const;
export type TrustLadderToolClassV0 = (typeof TRUST_LADDER_TOOL_CLASSES_V0)[number];
export type TrustLadderDecisionV0 = 'allow' | 'ask' | 'deny';

export const TRUST_LADDER_POLICY_V0: Readonly<Record<TrustLadderLevelV0, Readonly<Record<TrustLadderToolClassV0, TrustLadderDecisionV0>>>> = {
  look: { read: 'allow', draft: 'deny', commit: 'deny' },
  suggest: { read: 'allow', draft: 'ask', commit: 'deny' },
  prepare: { read: 'allow', draft: 'allow', commit: 'ask' },
  commit: { read: 'allow', draft: 'allow', commit: 'allow' },
};

/** A new Agent starts here. */
export const TRUST_LADDER_DEFAULT_LEVEL_V0: TrustLadderLevelV0 = 'suggest';

export const TRUST_LADDER_ERROR_CODES_V0 = {
  invalid: 'TRUST_LADDER_INVALID',
  /** `commit` needs the four limits in the request; the server never invents them. */
  limitsRequired: 'TRUST_LADDER_LIMITS_REQUIRED',
} as const;

export interface TrustLadderLimitsV0 {
  singleTxLimitCents: number;
  dailyLimitCents: number;
  monthlyLimitCents: number;
  freeApprovalCents: number;
}

export interface TrustLadderUpdateV0 {
  level: TrustLadderLevelV0;
  /** The D1 settings revision the owner last saw (optimistic concurrency, 409 `SPEND_BUDGET_SETTINGS_STALE`). */
  budgetRevision: number;
  /** Required for `commit`, ignored otherwise. */
  limits?: TrustLadderLimitsV0;
}

export type TrustLadderStepStatusV0 = 'done' | 'todo' | 'unknown';

export interface TrustLadderViewV0 {
  agentAccountId: string;
  level: TrustLadderLevelV0;
  /** Null until the owner picks a level. */
  updatedAt: string | null;
  budgetRevision: number;
  /** First-week walk-through: connect the calendar for the first booking, set a budget for the first payment. */
  checklist: { connectCalendar: TrustLadderStepStatusV0; setBudget: TrustLadderStepStatusV0 };
}

const MAX_CENTS = 100_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrustLadderLevelV0(value: unknown): value is TrustLadderLevelV0 {
  return typeof value === 'string' && (TRUST_LADDER_LEVELS_V0 as readonly string[]).includes(value);
}

export function trustLadderDecisionV0(level: TrustLadderLevelV0, toolClass: TrustLadderToolClassV0): TrustLadderDecisionV0 {
  return TRUST_LADDER_POLICY_V0[level][toolClass];
}

function isCents(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_CENTS;
}

/** Keeps only the four limits; any missing or out-of-range one gives null. */
export function decodeTrustLadderLimitsV0(value: unknown): TrustLadderLimitsV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { singleTxLimitCents, dailyLimitCents, monthlyLimitCents, freeApprovalCents } = raw;
  if (!isCents(singleTxLimitCents) || !isCents(dailyLimitCents) || !isCents(monthlyLimitCents) || !isCents(freeApprovalCents)) return null;
  if (singleTxLimitCents > dailyLimitCents || dailyLimitCents > monthlyLimitCents || freeApprovalCents > singleTxLimitCents) return null;
  return { singleTxLimitCents, dailyLimitCents, monthlyLimitCents, freeApprovalCents };
}

export function decodeTrustLadderUpdateV0(value: unknown): { ok: true; update: TrustLadderUpdateV0 } | { ok: false; code: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: TRUST_LADDER_ERROR_CODES_V0.invalid };
  const raw = value as Record<string, unknown>;
  if (!isTrustLadderLevelV0(raw.level) || !Number.isInteger(raw.budgetRevision) || (raw.budgetRevision as number) < 0) {
    return { ok: false, code: TRUST_LADDER_ERROR_CODES_V0.invalid };
  }
  if (raw.level !== 'commit') return { ok: true, update: { level: raw.level, budgetRevision: raw.budgetRevision as number } };
  const limits = decodeTrustLadderLimitsV0(raw.limits);
  if (!limits) return { ok: false, code: TRUST_LADDER_ERROR_CODES_V0.limitsRequired };
  return { ok: true, update: { level: 'commit', budgetRevision: raw.budgetRevision as number, limits } };
}

/** The D1 limits a level asks for: all zero below `commit`, exactly the owner's limits at `commit`. */
export function trustLadderBudgetLimitsV0(update: TrustLadderUpdateV0): TrustLadderLimitsV0 {
  if (update.level === 'commit' && update.limits) return { ...update.limits };
  return { singleTxLimitCents: 0, dailyLimitCents: 0, monthlyLimitCents: 0, freeApprovalCents: 0 };
}

export function decodeTrustLadderViewV0(value: unknown): TrustLadderViewV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.agentAccountId !== 'string' || !UUID.test(raw.agentAccountId)) return null;
  if (!isTrustLadderLevelV0(raw.level)) return null;
  if (raw.updatedAt !== null && (typeof raw.updatedAt !== 'string' || Number.isNaN(Date.parse(raw.updatedAt)))) return null;
  if (!Number.isInteger(raw.budgetRevision) || (raw.budgetRevision as number) < 0) return null;
  const checklist = raw.checklist as Record<string, unknown> | null | undefined;
  const step = (v: unknown): v is TrustLadderStepStatusV0 => v === 'done' || v === 'todo' || v === 'unknown';
  if (!checklist || typeof checklist !== 'object' || !step(checklist.connectCalendar) || !step(checklist.setBudget)) return null;
  return {
    agentAccountId: raw.agentAccountId,
    level: raw.level,
    updatedAt: raw.updatedAt as string | null,
    budgetRevision: raw.budgetRevision as number,
    checklist: { connectCalendar: checklist.connectCalendar, setBudget: checklist.setBudget },
  };
}
