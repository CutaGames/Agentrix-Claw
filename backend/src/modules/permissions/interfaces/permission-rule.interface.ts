/**
 * Permission Rule Interfaces
 *
 * Multi-layer permission system with glob matching and conditions.
 * Inspired by Claude Code's PermissionEngine pattern.
 */

// ============================================================
// Rule Source Layers (evaluated in priority order)
// ============================================================

export enum PermissionSource {
  /** Platform-level rules (highest priority, e.g. suspended account) */
  PLATFORM = 'platform',
  /** Agent owner rules (set by agent creator in permission UI) */
  AGENT_OWNER = 'agent_owner',
  /** End-user session overrides (e.g. "always allow this tool") */
  USER = 'user',
  /** Workspace-scoped rules (desktop agent workspace) */
  WORKSPACE = 'workspace',
}

export type PermissionBehavior = 'allow' | 'deny' | 'ask';

// ============================================================
// Permission Rule
// ============================================================

export interface PermissionRule {
  /** Glob pattern for tool name matching. e.g. "skill_*", "checkout*", "desktop_run_command" */
  pattern: string;
  /** What to do when matched */
  behavior: PermissionBehavior;
  /** Where this rule comes from */
  source: PermissionSource;
  /** Optional conditions that must also be satisfied */
  conditions?: PermissionConditions;
  /** Human-readable reason */
  reason?: string;
}

// ============================================================
// Conditions (optional per-rule)
// ============================================================

export interface PermissionConditions {
  /** Max payment amount (for commerce/payment tools) */
  maxAmount?: number;
  /** Time window for rate limiting, e.g. "24h", "1h" */
  timeWindow?: string;
  /** Max calls within the time window */
  maxCalls?: number;
  /** Only apply when risk level >= this value */
  minRiskLevel?: 0 | 1 | 2 | 3;
}

// ============================================================
// Permission Context (passed to evaluation)
// ============================================================

export interface PermissionContext {
  userId: string;
  agentId?: string;
  agentAccountId?: string;
  instanceId?: string;
  sessionId?: string;
  toolRiskLevel: 0 | 1 | 2 | 3;
  /** For payment tools, the amount */
  amount?: number;
}

// ============================================================
// Permission Decision (returned from evaluation)
// ============================================================

export interface PermissionDecision {
  behavior: PermissionBehavior;
  reason: PermissionDecisionReason;
  /** The rule that matched, if any */
  matchedRule?: PermissionRule;
}

export interface PermissionDecisionReason {
  type: 'whitelist' | 'rule' | 'mode_default' | 'suspended' | 'spending_limit';
  detail?: string;
}
