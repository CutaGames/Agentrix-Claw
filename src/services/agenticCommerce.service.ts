/**
 * agenticCommerce — runtime gate for the pet's autonomous buying.
 *
 * P-9 Companion Redesign T19.
 *
 * Decision matrix (priority order):
 *   1. feature-disabled        — agenticCommerce.enabled === false
 *   2. emergency-frozen        — emergencyFreezeUntilMs > now
 *   3. category-not-allowed    — request.category not in whitelist
 *   4. over-per-tx-limit       — request.amount > perTransactionMax
 *   5. over-daily-limit        — todaySpend + amount > dailyMax
 *   6. below-min-balance       — balance - amount < minSafeBalance
 *   7. auto-execute            — within all limits, ship it
 *
 * Decisions 4 / 5 / 6 fall through to `request-approval` so the user
 * sees the Trust3SigningSheet for consent rather than a hard block.
 *
 * Phase 1 lookups:
 *   - Limits read from MMKV under `agentic_commerce_limits/v1`.
 *   - Today's total queried via `/v1/agent-cost/today?petId=`.
 *   - Wallet balance via existing wallet service (Phase 1: stubbed
 *     fetcher, real wire to mpcWallet/balance API once exposed).
 *
 * Spec: requirements.md R7.1-R7.10.
 */
import { addVoiceDiagnostic } from './voiceDiagnostics';
import { companionEvents } from './companionEvents.service';

// Storage shim — MMKV only loads under react-native runtime; tests inject
// an in-memory replacement via _setEvaluateAgenticDeps so the matrix
// is testable in pure-Node jest. Production runtime uses MMKV via lazy
// require to avoid the module-load explosion in jest.
interface Storage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

let _storage: Storage = {
  getString: () => undefined,
  set: () => undefined,
};
let _storageBound = false;

function getStorage(): Storage {
  if (_storageBound) return _storage;
  try {
    // Lazy require so jest never tries to load react-native-mmkv.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mmkvMod = require('../stores/mmkvStorage') as typeof import('../stores/mmkvStorage');
    _storage = mmkvMod.mmkv as unknown as Storage;
  } catch {
    /* keep no-op storage */
  }
  _storageBound = true;
  return _storage;
}

export type AgenticCategory =
  | 'world-engine-quota'
  | 'task-market-accept'
  | 'free-skill-install'
  | 'subscribed-skill-renew'
  | 'world-asset-purchase';

export interface AgenticCommerceLimits {
  enabled: boolean;
  perTransactionMax: number; // USD
  dailyMax: number; // USD
  whitelistCategories: AgenticCategory[];
  emergencyFreezeUntilMs: number; // 0 = no freeze
  minSafeBalance: number; // USD; below this we block
}

export interface AgenticCommerceRequest {
  petId: string;
  category: AgenticCategory;
  amount: number;
  description: string;
  /** Optional override balance for tests / pre-known wallet state. */
  knownBalance?: number;
  /** Optional override today's spend (test injection). */
  knownTodaySpend?: number;
}

export type AgenticCommerceDecision =
  | { action: 'auto-execute'; reason: 'within-limits' }
  | {
      action: 'request-approval';
      reason: 'over-per-tx-limit' | 'over-daily-limit' | 'below-min-balance';
    }
  | {
      action: 'block';
      reason:
        | 'feature-disabled'
        | 'emergency-frozen'
        | 'category-not-allowed';
    };

const STORAGE_KEY = 'agentic_commerce_limits/v1';

export const DEFAULT_LIMITS: AgenticCommerceLimits = {
  enabled: false, // off by default; user opts in via Companion_Settings
  perTransactionMax: 30,
  dailyMax: 100,
  whitelistCategories: [
    'world-engine-quota',
    'task-market-accept',
    'free-skill-install',
    'subscribed-skill-renew',
  ],
  emergencyFreezeUntilMs: 0,
  minSafeBalance: 5,
};

export function getLimits(): AgenticCommerceLimits {
  try {
    const raw = getStorage().getString(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIMITS };
    const parsed = JSON.parse(raw);
    // Shallow merge defaults so newly-added fields don't crash.
    return { ...DEFAULT_LIMITS, ...parsed };
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}

export function setLimits(patch: Partial<AgenticCommerceLimits>): AgenticCommerceLimits {
  const next = { ...getLimits(), ...patch };
  try {
    getStorage().set(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Triggered by the "Emergency freeze 24h" button in Companion_Settings. */
export function emergencyFreeze(hours: number = 24): void {
  setLimits({ emergencyFreezeUntilMs: Date.now() + hours * 60 * 60 * 1000 });
  addVoiceDiagnostic('agentic-commerce', 'emergency-frozen', { hours });
}

export function clearEmergencyFreeze(): void {
  setLimits({ emergencyFreezeUntilMs: 0 });
  addVoiceDiagnostic('agentic-commerce', 'emergency-cleared');
}

/**
 * Returns true if a freeze is currently active.
 */
export function isFrozen(now: number = Date.now()): boolean {
  const lim = getLimits();
  return lim.emergencyFreezeUntilMs > now;
}

interface TodaySpendDeps {
  fetchTodaySpend?: (petId: string) => Promise<number>;
  fetchPetBalance?: (petId: string) => Promise<number>;
}

let _deps: TodaySpendDeps = {};

/** Test injection — replaces fetchers. */
export function _setEvaluateAgenticDeps(deps: TodaySpendDeps): void {
  _deps = deps;
}

/** Test-only — replace storage with an in-memory Map. */
export function _setStorageForTests(storage: Storage): void {
  _storage = storage;
  _storageBound = true;
}

async function defaultFetchTodaySpend(petId: string): Promise<number> {
  try {
    // Lazy require so jest tests that don't hit this branch never load
    // expo-secure-store via api.ts.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { apiFetch } = require('./api') as typeof import('./api');
    const res = await apiFetch<{ totalUsd: number }>(
      `/v1/agent-cost/today?petId=${encodeURIComponent(petId)}`,
    );
    return Number(res?.totalUsd) || 0;
  } catch {
    // Network failure → assume worst case (full daily budget already spent)
    // so we don't accidentally over-spend silently. The decision matrix
    // will route to request-approval for any amount, which is safer.
    return Number.MAX_SAFE_INTEGER;
  }
}

async function defaultFetchPetBalance(_petId: string): Promise<number> {
  // Phase 1 — wallet balance fetcher hookup deferred. Returning MAX
  // means below-min-balance only triggers when caller passes
  // knownBalance explicitly. Real impl wires to mpcWallet.balance API
  // when that endpoint is exposed (wave 9).
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Evaluate an agentic action against the current limits.
 *
 * Caller (Conversation_Bubble / mcp tool-call dispatcher / agent
 * autopilot) is expected to:
 *   - On 'auto-execute' → call the actual API + emit
 *     `companionEvents.emit('agentic-commerce', { action:'executed', ... })`.
 *   - On 'request-approval' → emit `trust3-signing-request` + show
 *     ApprovalAlertCapsule.
 *   - On 'block' → respond to LLM as failure so it falls back gracefully.
 */
export async function evaluateAgenticAction(
  req: AgenticCommerceRequest,
): Promise<AgenticCommerceDecision> {
  const limits = getLimits();

  if (!limits.enabled) {
    return logAndReturn(req, { action: 'block', reason: 'feature-disabled' });
  }
  if (limits.emergencyFreezeUntilMs > Date.now()) {
    return logAndReturn(req, { action: 'block', reason: 'emergency-frozen' });
  }
  if (!limits.whitelistCategories.includes(req.category)) {
    return logAndReturn(req, { action: 'block', reason: 'category-not-allowed' });
  }
  if (req.amount > limits.perTransactionMax) {
    return logAndReturn(req, { action: 'request-approval', reason: 'over-per-tx-limit' });
  }

  const todaySpend =
    req.knownTodaySpend ??
    (await (_deps.fetchTodaySpend ?? defaultFetchTodaySpend)(req.petId));
  if (todaySpend + req.amount > limits.dailyMax) {
    return logAndReturn(req, { action: 'request-approval', reason: 'over-daily-limit' });
  }

  const balance =
    req.knownBalance ??
    (await (_deps.fetchPetBalance ?? defaultFetchPetBalance)(req.petId));
  if (balance - req.amount < limits.minSafeBalance) {
    return logAndReturn(req, { action: 'request-approval', reason: 'below-min-balance' });
  }

  return logAndReturn(req, { action: 'auto-execute', reason: 'within-limits' });
}

function logAndReturn(
  req: AgenticCommerceRequest,
  decision: AgenticCommerceDecision,
): AgenticCommerceDecision {
  addVoiceDiagnostic('agentic-commerce', decision.action, {
    category: req.category,
    amount: req.amount,
    reason: decision.reason,
  });
  if (decision.action === 'block' || decision.action === 'request-approval') {
    companionEvents.emit({
      type: 'agentic-commerce',
      action: decision.action === 'block' ? 'blocked' : 'over-limit',
      kind: req.category,
      amount: req.amount,
      reason: decision.reason,
    });
  }
  return decision;
}
