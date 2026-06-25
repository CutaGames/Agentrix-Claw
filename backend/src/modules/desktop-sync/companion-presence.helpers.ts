/**
 * Companion Presence Helpers — typed emitters for the 4 P-9 cross-domain topics
 * surfaced through the unified Companion_Ball UI on mobile / desktop / web.
 *
 * The shared shape lives in `shared/types/pet-presence.ts`; here we provide
 * server-side wrappers so each producer site (wallet / world-engine /
 * skill) calls a single function with strongly-typed args, rather than
 * hand-writing topic strings.
 *
 * All four helpers fan out via the existing `desktopSyncEventBus` /
 * `PresenceGateway` which delivers `server.to('user:${userId}').emit(event, payload)`.
 */
import { emitDesktopSyncEvent } from './desktop-sync.events';

// Mirror shared/types/pet-presence.ts so this file can be imported without
// pulling the whole shared types graph into the backend tsconfig (which is
// already sliced for excluding ../shared at compile time per
// AGENTS.md TypeORM SnakeNamingStrategy comments). Producers should use the
// strongly-typed args below; consumers will see the canonical shape.
const PRESENCE_TOPICS = {
  WALLET_DELTA: 'presence:wallet.delta' as const,
  WORLD_ENGINE_BATTLE_PENDING: 'presence:world-engine.battle-pending' as const,
  WORLD_ENGINE_ASSET_READY: 'presence:world-engine.asset.ready' as const,
  SKILL_UPDATE: 'presence:skill.update' as const,
};

// ─── presence:wallet.delta ──────────────────────────────────────────────
export type WalletDeltaSource =
  | 'transfer-in' | 'transfer-out' | 'marketplace-purchase' | 'marketplace-sale'
  | 'agentic-commerce' | 'subscription-charge' | 'withdrawal' | 'deposit' | 'other';

export interface EmitWalletDeltaArgs {
  userId: string;
  delta: number;                  // 正=入账, 负=出账
  currency: 'USDC' | 'AXP' | 'BTC' | string;
  balanceAfter: number;
  source: WalletDeltaSource;
  refId?: string | null;
  note?: string | null;
  petId?: string | null;          // Pet AgentAccount 余额变动时填
  occurredAt?: number;
}

export function emitWalletDelta(args: EmitWalletDeltaArgs): void {
  emitDesktopSyncEvent(args.userId, PRESENCE_TOPICS.WALLET_DELTA, {
    user_id: args.userId,
    delta: args.delta,
    currency: args.currency,
    balance_after: args.balanceAfter,
    source: args.source,
    ref_id: args.refId ?? null,
    note: args.note ?? null,
    pet_id: args.petId ?? null,
    occurred_at: args.occurredAt ?? Date.now(),
  });
}

// ─── presence:world-engine.battle-pending ───────────────────────────────
export interface EmitBattlePendingArgs {
  battleId: string;
  challengerUserId: string;
  defenderUserId: string;
  challengerAssetId: string;
  defenderAssetId: string;
  expiresAt: number;
  createdAt?: number;
}

export function emitWorldEngineBattlePending(args: EmitBattlePendingArgs): void {
  const payload = {
    battle_id: args.battleId,
    challenger_user_id: args.challengerUserId,
    defender_user_id: args.defenderUserId,
    challenger_asset_id: args.challengerAssetId,
    defender_asset_id: args.defenderAssetId,
    expires_at: args.expiresAt,
    created_at: args.createdAt ?? Date.now(),
  };
  // Both sides need to know:
  //   defender → "you've been challenged"
  //   challenger → "your challenge has been issued"
  emitDesktopSyncEvent(args.defenderUserId, PRESENCE_TOPICS.WORLD_ENGINE_BATTLE_PENDING, payload);
  if (args.challengerUserId !== args.defenderUserId) {
    emitDesktopSyncEvent(args.challengerUserId, PRESENCE_TOPICS.WORLD_ENGINE_BATTLE_PENDING, payload);
  }
}

// ─── presence:world-engine.asset.ready ──────────────────────────────────
export interface EmitAssetReadyArgs {
  assetId: string;
  userId: string;
  scanSessionId: string;
  suggestedPetId?: string | null;
  assetKind?: 'character' | 'item' | 'dungeon-room' | 'weapon' | string;
  thumbnailUrl?: string | null;
  readyAt?: number;
}

export function emitWorldEngineAssetReady(args: EmitAssetReadyArgs): void {
  emitDesktopSyncEvent(args.userId, PRESENCE_TOPICS.WORLD_ENGINE_ASSET_READY, {
    asset_id: args.assetId,
    user_id: args.userId,
    scan_session_id: args.scanSessionId,
    suggested_pet_id: args.suggestedPetId ?? null,
    asset_kind: args.assetKind ?? 'character',
    thumbnail_url: args.thumbnailUrl ?? null,
    ready_at: args.readyAt ?? Date.now(),
  });
}

// ─── presence:skill.update ──────────────────────────────────────────────
export interface EmitSkillUpdateArgs {
  skillId: string;
  /**
   * The user id(s) who already have this skill installed and should see the
   * update prompt. Producer is responsible for fetching the install list.
   */
  userId: string;
  installedVersion: string;
  newVersion: string;
  introducesNewPermissions: boolean;
  newPermissions?: string[];
  changelogSummary?: string | null;
  publishedAt?: number;
}

export function emitSkillUpdate(args: EmitSkillUpdateArgs): void {
  emitDesktopSyncEvent(args.userId, PRESENCE_TOPICS.SKILL_UPDATE, {
    skill_id: args.skillId,
    user_id: args.userId,
    installed_version: args.installedVersion,
    new_version: args.newVersion,
    introduces_new_permissions: args.introducesNewPermissions,
    new_permissions: args.newPermissions,
    changelog_summary: args.changelogSummary ?? null,
    published_at: args.publishedAt ?? Date.now(),
  });
}

// ─── Multi-Agent Collaboration topics (multi-agent-collaboration-2026-06) ───
// 4 new topics added by Wave 1-4 of the multi-agent spec. See
// `EVENTS_MULTI_AGENT.md` for payload schemas + W0.2 audit acceptance.

const MULTI_AGENT_TOPICS = {
  TEAM_ACTIVITY_UPDATE: 'presence:multi-agent.team-activity-update' as const,
  SUB_TASK_COMPLETED: 'presence:multi-agent.sub-task-completed' as const,
  SUB_TASK_STALLED: 'presence:multi-agent.sub-task-stalled' as const,
  BUDGET_WARNING: 'presence:multi-agent.budget-warning' as const,
};

// ─── presence:multi-agent.team-activity-update ──────────────────────────
// W1 R5.1, R5.6 — emitted whenever active sub-task count changes for a user.
// Throttle to ≤ 1 emit per 3 s per user (R5.6 requires update within 3 s).

export interface EmitTeamActivityUpdateArgs {
  userId: string;
  activeSubTasks: number;          // current in-flight count
  oneLineSummary?: string | null;  // plain language, NO branch / file / USD
  occurredAt?: number;
}

export function emitTeamActivityUpdate(args: EmitTeamActivityUpdateArgs): void {
  emitDesktopSyncEvent(args.userId, MULTI_AGENT_TOPICS.TEAM_ACTIVITY_UPDATE, {
    user_id: args.userId,
    active_sub_tasks: args.activeSubTasks,
    one_line_summary: args.oneLineSummary ?? null,
    occurred_at: args.occurredAt ?? Date.now(),
  });
}

// ─── presence:multi-agent.sub-task-completed ────────────────────────────
// W4 R9.3, R9.4 — fired when a sub-task reaches a terminal status.
// Companion ball pulses green / red based on `ok`; lock-screen pet mirrors;
// mobile push is dispatched separately from agent-task.worker.
//
// W4.4 (lock-screen-pet integration): the same socket event reaches mobile
// clients subscribed to `user:${userId}` room. The P9 redesign mobile
// presence handler already forwards `presence:multi-agent.*` events into
// the Lock_Screen_Pet badge state — no extra backend code needed. This
// comment documents that contract; if mobile changes its handler key,
// add an explicit lock-screen-pet emit here.

export interface EmitSubTaskCompletedArgs {
  userId: string;
  subTaskId: string;
  parentTaskId: string | null;
  ok: boolean;                     // true = succeeded, false = failed/canceled
  summary: string;                 // <= 200 chars one-line
  totalCostUsd: number;
  durationMs: number;
  occurredAt?: number;
}

export function emitSubTaskCompleted(args: EmitSubTaskCompletedArgs): void {
  emitDesktopSyncEvent(args.userId, MULTI_AGENT_TOPICS.SUB_TASK_COMPLETED, {
    user_id: args.userId,
    sub_task_id: args.subTaskId,
    parent_task_id: args.parentTaskId,
    ok: args.ok,
    summary: args.summary,
    total_cost_usd: args.totalCostUsd,
    duration_ms: args.durationMs,
    occurred_at: args.occurredAt ?? Date.now(),
  });
}

// ─── presence:multi-agent.sub-task-stalled ──────────────────────────────
// W4 R9.5 — fired by agent-presence.scheduler 5-min cron when a running
// task exceeds 60 min wall-clock. Companion ball pulses amber + 3-button UI.

export interface EmitSubTaskStalledArgs {
  userId: string;
  subTaskId: string;
  durationMs: number;
  title: string;
  occurredAt?: number;
}

export function emitSubTaskStalled(args: EmitSubTaskStalledArgs): void {
  emitDesktopSyncEvent(args.userId, MULTI_AGENT_TOPICS.SUB_TASK_STALLED, {
    user_id: args.userId,
    sub_task_id: args.subTaskId,
    duration_ms: args.durationMs,
    title: args.title,
    occurred_at: args.occurredAt ?? Date.now(),
  });
}

// ─── presence:multi-agent.budget-warning ────────────────────────────────
// W5 R10.6 — emitted at 80% (warning) and 100% (refusal) of daily budget.

export interface EmitBudgetWarningArgs {
  userId: string;
  level: 80 | 100;
  usedUsd: number;
  budgetUsd: number;
  occurredAt?: number;
}

export function emitBudgetWarning(args: EmitBudgetWarningArgs): void {
  emitDesktopSyncEvent(args.userId, MULTI_AGENT_TOPICS.BUDGET_WARNING, {
    user_id: args.userId,
    level: args.level,
    used_usd: args.usedUsd,
    budget_usd: args.budgetUsd,
    occurred_at: args.occurredAt ?? Date.now(),
  });
}
