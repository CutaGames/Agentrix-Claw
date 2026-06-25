/**
 * Permission Engine Service
 *
 * Multi-layer permission evaluation with glob matching and conditions.
 * Replaces the flat boolean `resolveRuntimePermissionProfile()` with a
 * proper rule engine that supports 4 source layers, glob patterns, and
 * spending/rate conditions.
 *
 * Reference: Claude Code's PermissionEngine (ARCHITECTURE_OPTIMIZATION doc Phase 5).
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentAccount, AgentAccountStatus } from '../../entities/agent-account.entity';
import {
  PermissionBehavior,
  PermissionConditions,
  PermissionContext,
  PermissionDecision,
  PermissionRule,
  PermissionSource,
} from './interfaces';

// ============================================================
// Safe readonly tools — always allowed without checks
// ============================================================

const SAFE_READONLY_TOOLS = new Set([
  'save_memory',
  'search_web',
  'skill_search',
  'skill_recommend',
  'resource_search',
  'search_products',
  'search_agentrix_products',
  'get_balance',
  'asset_overview',
  'task_search',
  'agent_discover',
]);

// ============================================================
// Boolean permission → tool pattern mapping
// (bridge from existing AgentAccount.permissions JSONB)
// ============================================================

const BOOLEAN_PERMISSION_MAP: Record<string, string[]> = {
  skillSearchEnabled:       ['skill_search', 'skill_recommend'],
  skillInstallEnabled:      ['skill_install'],
  skillExecuteEnabled:      ['skill_execute'],
  skillPublishEnabled:      ['skill_publish'],
  commerceBrowseEnabled:    ['search_products', 'search_agentrix_products', 'resource_search'],
  commercePurchaseEnabled:  ['marketplace_purchase', 'create_order'],
  walletReadEnabled:        ['get_balance', 'asset_overview'],
  quickpayEnabled:          ['quickpay_execute'],
  x402PayEnabled:           ['x402_pay'],
  autonomousPaymentEnabled: ['create_order', 'x402_pay', 'quickpay_execute', 'marketplace_purchase'],
  a2aDiscoverEnabled:       ['agent_discover'],
  a2aInvokeEnabled:         ['agent_invoke'],
  taskSearchEnabled:        ['task_search'],
  taskPostEnabled:          ['task_post'],
  taskAcceptEnabled:        ['task_accept'],
  taskSubmitEnabled:        ['task_submit'],
  resourceSearchEnabled:    ['resource_search'],
  resourcePublishEnabled:   ['resource_publish'],
  webSearchEnabled:         ['search_web'],
};

@Injectable()
export class PermissionEngineService {
  private readonly logger = new Logger(PermissionEngineService.name);

  /** User session overrides: Map<userId:toolPattern, behavior> */
  private readonly sessionOverrides = new Map<string, PermissionRule>();

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Core: Evaluate permission for a tool call
  // ═══════════════════════════════════════════════════════════════

  async evaluate(
    toolName: string,
    input: Record<string, any>,
    ctx: PermissionContext,
  ): Promise<PermissionDecision> {
    // 1. Safe whitelist → always allow
    if (SAFE_READONLY_TOOLS.has(toolName)) {
      return { behavior: 'allow', reason: { type: 'whitelist' } };
    }

    // 2. Load all rules from all layers
    const rules = await this.loadRules(ctx);

    // 3. Evaluate rules in priority order
    for (const rule of rules) {
      if (!this.matchesPattern(toolName, rule.pattern)) continue;

      // Check conditions
      if (rule.conditions && !this.checkConditions(rule.conditions, ctx)) {
        continue;
      }

      return {
        behavior: rule.behavior,
        reason: { type: 'rule', detail: rule.reason },
        matchedRule: rule,
      };
    }

    // 4. Default: allow for low risk, ask for medium+
    if (ctx.toolRiskLevel >= 2) {
      return {
        behavior: 'ask',
        reason: { type: 'mode_default', detail: `Risk level ${ctx.toolRiskLevel} requires approval` },
      };
    }

    return { behavior: 'allow', reason: { type: 'mode_default' } };
  }

  // ═══════════════════════════════════════════════════════════════
  // Rule Loading (4 layers, priority: platform > agent_owner > user > workspace)
  // ═══════════════════════════════════════════════════════════════

  private async loadRules(ctx: PermissionContext): Promise<PermissionRule[]> {
    const rules: PermissionRule[] = [];

    // Layer 1: Platform rules (suspended/revoked account)
    const platformRules = await this.loadPlatformRules(ctx);
    rules.push(...platformRules);

    // Layer 2: Agent owner rules (from AgentAccount.permissions boolean fields)
    if (ctx.agentAccountId) {
      const ownerRules = await this.loadAgentOwnerRules(ctx);
      rules.push(...ownerRules);
    }

    // Layer 3: User session overrides (remembered approvals)
    const userRules = this.loadUserSessionRules(ctx);
    rules.push(...userRules);

    return rules;
  }

  /**
   * Platform layer: account status checks + spending limits
   */
  private async loadPlatformRules(ctx: PermissionContext): Promise<PermissionRule[]> {
    if (!ctx.agentAccountId) return [];

    const account = await this.agentAccountRepo.findOne({
      where: { id: ctx.agentAccountId },
      select: ['id', 'status', 'spendingLimits', 'usedTodayAmount', 'usedMonthAmount'],
    });

    if (!account) return [];

    const rules: PermissionRule[] = [];

    // Suspended/revoked → deny all
    if (account.status === AgentAccountStatus.SUSPENDED || account.status === AgentAccountStatus.REVOKED) {
      rules.push({
        pattern: '*',
        behavior: 'deny',
        source: PermissionSource.PLATFORM,
        reason: `Agent account is ${account.status}`,
      });
      return rules;
    }

    // Spending limit checks for payment tools
    if (account.spendingLimits && ctx.amount) {
      const { singleTxLimit, dailyLimit, monthlyLimit } = account.spendingLimits;

      if (singleTxLimit && ctx.amount > singleTxLimit) {
        rules.push({
          pattern: 'create_order',
          behavior: 'deny',
          source: PermissionSource.PLATFORM,
          reason: `Amount $${ctx.amount} exceeds single transaction limit $${singleTxLimit}`,
        });
        rules.push({
          pattern: 'marketplace_purchase',
          behavior: 'deny',
          source: PermissionSource.PLATFORM,
          reason: `Amount $${ctx.amount} exceeds single transaction limit $${singleTxLimit}`,
        });
      }

      const usedToday = Number(account.usedTodayAmount) || 0;
      if (dailyLimit && (usedToday + ctx.amount) > dailyLimit) {
        rules.push({
          pattern: 'create_order',
          behavior: 'ask',
          source: PermissionSource.PLATFORM,
          reason: `Daily spending would reach $${usedToday + ctx.amount} (limit: $${dailyLimit})`,
        });
      }

      const usedMonth = Number(account.usedMonthAmount) || 0;
      if (monthlyLimit && (usedMonth + ctx.amount) > monthlyLimit) {
        rules.push({
          pattern: '*_purchase',
          behavior: 'deny',
          source: PermissionSource.PLATFORM,
          reason: `Monthly spending would reach $${usedMonth + ctx.amount} (limit: $${monthlyLimit})`,
        });
      }
    }

    return rules;
  }

  /**
   * Agent owner layer: convert boolean permission fields to rules
   */
  private async loadAgentOwnerRules(ctx: PermissionContext): Promise<PermissionRule[]> {
    const account = await this.agentAccountRepo.findOne({
      where: { id: ctx.agentAccountId, ownerId: ctx.userId },
      select: ['id', 'permissions'],
    });

    if (!account?.permissions) return [];

    const rules: PermissionRule[] = [];
    const p = account.permissions;

    for (const [key, toolNames] of Object.entries(BOOLEAN_PERMISSION_MAP)) {
      if (p[key] === false) {
        for (const toolName of toolNames) {
          rules.push({
            pattern: toolName,
            behavior: 'deny',
            source: PermissionSource.AGENT_OWNER,
            reason: `Permission "${key}" is disabled`,
          });
        }
      }
    }

    return rules;
  }

  /**
   * User session layer: remembered approvals
   */
  private loadUserSessionRules(ctx: PermissionContext): PermissionRule[] {
    const rules: PermissionRule[] = [];
    const prefix = `${ctx.userId}:`;

    for (const [key, rule] of this.sessionOverrides) {
      if (key.startsWith(prefix)) {
        rules.push(rule);
      }
    }

    return rules;
  }

  // ═══════════════════════════════════════════════════════════════
  // Glob Pattern Matching
  // ═══════════════════════════════════════════════════════════════

  private matchesPattern(toolName: string, pattern: string): boolean {
    // Exact match
    if (pattern === toolName) return true;

    // Wildcard "*" matches everything
    if (pattern === '*') return true;

    // Simple glob: convert to regex
    // "skill_*" → /^skill_.*$/
    // "*_purchase" → /^.*_purchase$/
    // "checkout*" → /^checkout.*$/
    const regexStr = '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars except *
      .replace(/\*/g, '.*') + '$';

    try {
      return new RegExp(regexStr).test(toolName);
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Condition Checks
  // ═══════════════════════════════════════════════════════════════

  private checkConditions(conditions: PermissionConditions, ctx: PermissionContext): boolean {
    // Risk level condition
    if (conditions.minRiskLevel !== undefined && ctx.toolRiskLevel < conditions.minRiskLevel) {
      return false;
    }

    // Amount condition
    if (conditions.maxAmount !== undefined && ctx.amount !== undefined) {
      if (ctx.amount > conditions.maxAmount) return false;
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // Session Override Management (for "remember this" approvals)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record a user's approval decision as a session override.
   */
  rememberDecision(
    userId: string,
    toolPattern: string,
    behavior: PermissionBehavior,
    remember: 'session' | 'persistent' | 'once',
  ): void {
    if (remember === 'once') return; // Don't store one-time decisions

    const key = `${userId}:${toolPattern}`;
    this.sessionOverrides.set(key, {
      pattern: toolPattern,
      behavior,
      source: PermissionSource.USER,
      reason: `User chose to ${behavior} (remembered for ${remember})`,
    });
  }

  /**
   * Clear all session overrides for a user.
   */
  clearSessionOverrides(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.sessionOverrides.keys()) {
      if (key.startsWith(prefix)) {
        this.sessionOverrides.delete(key);
      }
    }
  }
}
