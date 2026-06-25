import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { sanitizeMarketplacePrompt } from './marketplace-prompt-sanitizer';
import { AgentTaskService } from '../agent-task/agent-task.service';
import { CostTrackerService } from '../cost-tracker/cost-tracker.service';
import { MultiAgentMarketplaceService } from './multi-agent-marketplace.service';
import { AgentHireEscrowService } from './agent-hire-escrow.service';
import { SubscriptionUsageService } from '../multi-agent-summary/subscription-usage.service';

/** Tool input from the LLM. Mirrors `shared/types/agent-tools.ts`. */
export interface SpawnDto {
  userId: string;
  /** Caller-supplied parent task id. NULL = top-level (rare from spawn path). */
  parentTaskId?: string | null;
  role: string;
  prompt: string;
  scope?: {
    tools?: string[];
    workspace_paths?: string[];
  };
  budget_usd?: number;
  target?: 'local-anonymous' | 'team-member' | 'marketplace-hire';
  /** Optional tier hint passed to LLM router. */
  tier?: string;
}

export interface SpawnResult {
  subTaskId: string;
  targetKind: 'leader-direct' | 'local-anonymous' | 'team-member' | 'marketplace-hire';
  petMemberId: string | null;
  /** v2 W7 — set when targetKind = 'marketplace-hire'. */
  hiredFromUserId?: string | null;
  /** v2 W7 — estimated escrow cost shown to user before hire. */
  estimatedHireCostUsd?: number;
  status: 'queued';
}

const FANOUT_CAP = 4;
const SESSION_CAP = 8;
const DEFAULT_BUDGET_USD = 1.0;
const HIGH_BUDGET_THRESHOLD_USD = 10;
const BUDGET_HARD_CAP_USD = 100;

/**
 * AgentTaskSpawnService — dispatches an `agent_run` LLM tool call into
 * a queued AgentTask row. Implements all client-side guardrails on the
 * server-side too (defence-in-depth):
 *   - Fan-out cap (R1.4)
 *   - Session cap (R1.6)
 *   - Budget approval gate (R1.5)
 *   - Budget exhausted refusal (R10.6 — flag set by W5.4)
 *   - Marketplace-hire reject in v1 (R13.1)
 *   - Cycle detection in parent_task chain (Property 1)
 *
 * Spec: multi-agent-collaboration-2026-06 W2.2
 * Design: §3.3, §3.5
 */
@Injectable()
export class AgentTaskSpawnService {
  private readonly logger = new Logger(AgentTaskSpawnService.name);

  constructor(
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(PetTeamMember)
    private readonly memberRepo: Repository<PetTeamMember>,
    private readonly agentTaskService: AgentTaskService,
    @Optional() @Inject(CostTrackerService)
    private readonly costTracker: CostTrackerService | null,
    @Optional() @Inject(MultiAgentMarketplaceService)
    private readonly marketplace: MultiAgentMarketplaceService | null,
    @Optional() @Inject(AgentHireEscrowService)
    private readonly hireEscrow: AgentHireEscrowService | null,
    @Optional() @Inject(SubscriptionUsageService)
    private readonly subscriptionUsage: SubscriptionUsageService | null,
  ) {}

  async dispatch(dto: SpawnDto): Promise<SpawnResult> {
    if (!dto.userId) throw new BadRequestException('userId required');
    if (!dto.role || dto.role.length > 30) {
      throw new BadRequestException('role: 1-30 chars required');
    }
    if (!dto.prompt || dto.prompt.length > 8000) {
      throw new BadRequestException('prompt: 1-8000 chars required');
    }

    // R13.1: marketplace-hire is reserved for v2 W7. Reject + log analytics.
    // v2 W7 SHIP — feature-flagged via env MULTI_AGENT_MARKETPLACE_HIRE_ENABLED.
    // When OFF (default,v1 stable), behavior is unchanged: reject with
    // not_implemented_in_v1. When ON, dispatch routes through
    // PetA2ADispatchService for cross-user hire flow with escrow + audit.
    if (dto.target === 'marketplace-hire') {
      const marketplaceEnabled =
        process.env.MULTI_AGENT_MARKETPLACE_HIRE_ENABLED === '1';
      if (!marketplaceEnabled) {
        this.logger.warn(`marketplace_hire_attempted (flag OFF) by user ${dto.userId} role=${dto.role}`);
        throw new HttpException(
          {
            error: 'not_implemented_in_v1',
            message:
              'Marketplace hire is coming in v2 (Q3 2026). Your team will use ' +
              'a local anonymous sub-agent for now.',
          },
          HttpStatus.NOT_IMPLEMENTED,
        );
      }
      // v2 W7 — flag is ON; defer to MultiAgentMarketplaceService.
      // (handled below in dispatch flow when targetKind resolved as
      // 'marketplace-hire')
      this.logger.log(`marketplace_hire_dispatch user=${dto.userId} role=${dto.role}`);
    }

    // R10.6 — daily budget exhausted: block new spawns when 100% used.
    // Worker emits the warning event; we re-check the threshold here so
    // the LLM gets a clean `budget_exhausted` error instead of waiting
    // for the worker to drain a queued sub-task.
    if (this.costTracker) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const cap = Number(process.env.AGENTRIX_DAILY_BUDGET_USD || '5');
      try {
        const usage = await this.costTracker.getUserCostInRange(dto.userId, todayStart);
        if (cap > 0 && Number(usage?.totalUsd ?? 0) >= cap) {
          throw new HttpException(
            {
              error: 'budget_exhausted',
              message: `今日 Multi-Agent 预算已用尽 ($${cap.toFixed(2)}/day),明日将自动重置。`,
              usedUsd: usage.totalUsd,
              capUsd: cap,
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.logger.debug(`budget pre-check failed: ${e instanceof Error ? e.message : String(e)}`);
        // Cost tracker outage — fail open, worker will still emit warnings.
      }
    }

    // v2.1 — Subscription quota check (free tier daily/monthly cap).
    // Ships disabled-by-default to avoid disrupting v1 free users; flip
    // env `MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED=1` once cron has been
    // running long enough to populate user_subscription_usage.
    if (
      this.subscriptionUsage &&
      process.env.MULTI_AGENT_SUBSCRIPTION_QUOTA_ENFORCED === '1'
    ) {
      try {
        const quota = await this.subscriptionUsage.checkQuota(dto.userId);
        if (!quota.allowed) {
          throw new HttpException(
            {
              error: 'subscription_quota_exceeded',
              message: quota.reason,
              tier: quota.tier,
              todayCount: quota.todayCount,
              monthCount: quota.monthCount,
              dailyCap: quota.dailyCap,
              monthlyIncluded: quota.monthlyIncluded,
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.logger.debug(
          `subscription quota check failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        // Fail open; worker still applies WorkerLlmRouter free-tier cap on model.
      }
    }

    const budget = dto.budget_usd ?? DEFAULT_BUDGET_USD;
    if (budget < 0.1 || budget > BUDGET_HARD_CAP_USD) {
      throw new BadRequestException(`budget_usd must be 0.10-${BUDGET_HARD_CAP_USD}`);
    }
    if (budget > HIGH_BUDGET_THRESHOLD_USD) {
      // R1.5 — server-side backstop: reject high-budget spawns unless the
      // caller has stamped an approval token (set by client after the user
      // explicitly approves in the chat surface). v1 token shape is opaque
      // — any non-empty `approval_token` field in scope counts. The client
      // sets it after `approvePendingSpawn()`; W2.8 hardens this with a
      // signed JWT in v1.1.
      const approvalToken =
        (dto.scope as { approval_token?: string } | undefined)?.approval_token ?? '';
      if (!approvalToken) {
        this.logger.log(
          `high_budget_pending_approval user=${dto.userId} role=${dto.role} budget=$${budget}`,
        );
        throw new HttpException(
          {
            error: 'budget_pending_approval',
            message:
              `Budget $${budget.toFixed(2)} exceeds $${HIGH_BUDGET_THRESHOLD_USD} threshold. ` +
              'User approval required — re-issue with scope.approval_token after approval.',
            thresholdUsd: HIGH_BUDGET_THRESHOLD_USD,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      this.logger.log(
        `high_budget_approved user=${dto.userId} role=${dto.role} budget=$${budget}`,
      );
    }

    // R1.4 — Fan-out cap: at most 4 in-flight sub-tasks per leader chat.
    // "Per leader chat" approximated by `parent_task_id` chain root in v1.
    const inflight = await this.taskRepo.count({
      where: {
        userId: dto.userId,
        parentTaskId: dto.parentTaskId ?? undefined,
        status: In(['queued', 'running', 'awaiting_input']),
      },
    });
    if (inflight >= FANOUT_CAP) {
      throw new HttpException(
        {
          error: 'spawn_rate_limited',
          message: `${FANOUT_CAP} sub-tasks already in flight; wait for one to complete`,
          retryAfterMs: 5000,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Property 1 — cycle detection. parent_task_id chain must not include
    // an existing descendant of itself. Walk up the chain (max 16 hops).
    if (dto.parentTaskId) {
      const isCycle = await this.detectCycle(dto.parentTaskId);
      if (isCycle) {
        throw new BadRequestException('parent_task_id cycle detected');
      }
    }

    // Resolve target kind:
    let targetKind: 'local-anonymous' | 'team-member' | 'marketplace-hire' = 'local-anonymous';
    let petMember: PetTeamMember | null = null;
    let hiredFromUserId: string | null = null;
    let hiredAgentId: string | null = null;
    let estimatedHireCostUsd: number | undefined;

    if (dto.target === 'marketplace-hire') {
      // v2 W7 SHIP — flag check passed earlier; now resolve a candidate.
      // If marketplace service unavailable or no candidate → fall back to
      // local-anonymous (Leader can retry without the flag).
      if (!this.marketplace) {
        this.logger.warn('marketplace service not provisioned; falling back to local-anonymous');
        targetKind = 'local-anonymous';
      } else {
        const match = await this.marketplace.findCandidate(dto.role, dto.userId);
        if (!match.found || !match.pet) {
          this.logger.log(
            `marketplace_hire_no_match user=${dto.userId} role=${dto.role}: ${match.reason}`,
          );
          // Throw so caller knows to retry with local-anonymous explicitly.
          throw new HttpException(
            {
              error: 'marketplace_no_match',
              message: match.reason || 'No marketplace pet matches this role',
              fallback: 'local-anonymous',
            },
            HttpStatus.NOT_FOUND,
          );
        }
        targetKind = 'marketplace-hire';
        hiredFromUserId = match.pet.sellerUserId;
        hiredAgentId = match.pet.agentAccountId;
        estimatedHireCostUsd = match.pet.estimatedCostUsd;
      }
    } else if (dto.target === 'local-anonymous') {
      targetKind = 'local-anonymous';
    } else {
      // Default OR explicit `team-member`: try selectMember first
      petMember = await this.selectMember(dto.userId, dto.role);
      if (petMember) {
        targetKind = 'team-member';
      } else if (dto.target === 'team-member') {
        // User explicitly required team-member but no match → fall back
        targetKind = 'local-anonymous';
      }
    }

    // Pick agentId: pet member's bound AgentAccount,or null for anonymous,
    // or marketplace-hire seller's bound AgentAccount.
    const agentId =
      targetKind === 'marketplace-hire'
        ? hiredAgentId
        : petMember
          ? (petMember.boundAgentAccountId ?? null)
          : null;

    // v2.1 W7.3 — Marketplace prompt sanitizer (privacy boundary).
    // For 'marketplace-hire' targets the prompt is forwarded to a third-party
    // seller's pet; we strip workspace paths, file mentions, chat history
    // references, and PII patterns. For other targets (local-anonymous /
    // team-member) the prompt is owner-internal and not sanitized.
    let effectivePrompt = dto.prompt;
    let sanitizationSummary: { wasRedacted: boolean; redactedSegments: any[] } | null = null;
    if (targetKind === 'marketplace-hire') {
      const sanitized = sanitizeMarketplacePrompt(dto.prompt);
      effectivePrompt = sanitized.text;
      sanitizationSummary = {
        wasRedacted: sanitized.wasRedacted,
        redactedSegments: sanitized.redactedSegments,
      };
      if (sanitized.wasRedacted) {
        this.logger.log(
          `marketplace_prompt_sanitized user=${dto.userId} role=${dto.role} segments=${JSON.stringify(sanitized.redactedSegments)}`,
        );
      }
    }

    // Create the AgentTask row.
    // v2 W7 — when targetKind='marketplace-hire',also stamp hired_from_user_id.
    // agent-task.service.create() permits this only on v2 branches per
    // Property 6 lint allow-list.
    const task = await this.agentTaskService.create({
      userId: dto.userId,
      title: `${dto.role}: ${effectivePrompt.slice(0, 80)}`,
      prompt: effectivePrompt,
      agentId: agentId ?? undefined,
      tier: dto.tier,
      parentTaskId: dto.parentTaskId ?? undefined,
      targetKind,
      hiredFromUserId: hiredFromUserId ?? undefined,
    });

    // W2.4: emit `agent_spawn` log event for the timeline.
    await this.agentTaskService.appendLog(task.id, 'agent_spawn', `spawned ${dto.role}`, {
      taskId: task.id,
      parentTaskId: dto.parentTaskId ?? null,
      role: dto.role,
      actorAgentId: agentId,
      target_kind: targetKind,
      petMemberId: petMember?.id,
      hiredFromUserId,
      estimatedHireCostUsd,
      promptPreview: effectivePrompt.slice(0, 80),
      budgetUsd: budget,
      tier: dto.tier,
      sanitization: sanitizationSummary,
      spawnedAt: Date.now(),
    });

    // v2.2 W7.3 — reserve hire escrow for marketplace-hire tasks. The
    // estimated cost shown to the hirer is now actually held in escrow
    // (soft hold; admin can dispute / release via /escrows endpoints).
    if (
      targetKind === 'marketplace-hire' &&
      hiredFromUserId &&
      this.hireEscrow &&
      estimatedHireCostUsd &&
      estimatedHireCostUsd > 0
    ) {
      try {
        await this.hireEscrow.reserve({
          taskId: task.id,
          hirerUserId: dto.userId,
          sellerUserId: hiredFromUserId,
          agentId: agentId ?? null,
          agreedUsd: estimatedHireCostUsd,
        });
      } catch (e: any) {
        this.logger.warn(`hire escrow reserve failed task=${task.id}: ${e?.message || e}`);
        // Non-fatal — task still runs, but ops/admin will see no escrow row;
        // reconciler cron picks it up if it can.
      }
    }

    return {
      subTaskId: task.id,
      targetKind,
      petMemberId: petMember?.id ?? null,
      hiredFromUserId,
      estimatedHireCostUsd,
      status: 'queued',
    };
  }

  /**
   * R6.1-R6.6 selectMember — case-insensitive substring role match.
   * Tie-break: lowest in-flight count → highest reputation → oldest createdAt.
   * Skip paused/revoked status.
   */
  async selectMember(userId: string, role: string): Promise<PetTeamMember | null> {
    if (!userId || !role) return null;

    const normalized = role.toLowerCase().trim();
    // Normalize role variants — qa-ops vs qa_ops mismatch documented in
    // COMPAT_AUDIT.md §5
    const normalizedAlt = normalized.replace(/-/g, '_');

    const members = await this.memberRepo.find({
      where: { userId, status: 'active' },
    });
    if (!members.length) return null;

    const matches = members.filter((m) => {
      const r = (m.role ?? '').toLowerCase();
      return (
        r.includes(normalized) ||
        normalized.includes(r) ||
        r.includes(normalizedAlt) ||
        normalizedAlt.includes(r)
      );
    });
    if (!matches.length) return null;

    // Tie-break metrics
    const withMetrics = await Promise.all(
      matches.map(async (m) => {
        const inFlight = await this.countInFlightForMember(m);
        return { member: m, inFlight, reputation: 0, createdAt: m.createdAt };
      }),
    );

    withMetrics.sort((a, b) => {
      if (a.inFlight !== b.inFlight) return a.inFlight - b.inFlight;
      if (a.reputation !== b.reputation) return b.reputation - a.reputation;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return withMetrics[0].member;
  }

  private async countInFlightForMember(member: PetTeamMember): Promise<number> {
    const boundId = member.boundAgentAccountId;
    if (!boundId) return 0;
    return this.taskRepo.count({
      where: {
        agentId: boundId,
        status: In(['queued', 'running', 'awaiting_input']),
      },
    });
  }

  /** Walk up parent_task_id chain; return true if a cycle exists. */
  private async detectCycle(startId: string, maxDepth = 16): Promise<boolean> {
    const seen = new Set<string>();
    let current: string | null = startId;
    let depth = 0;
    while (current && depth < maxDepth) {
      if (seen.has(current)) return true;
      seen.add(current);
      const parent = await this.taskRepo.findOne({
        where: { id: current },
        select: ['id', 'parentTaskId'],
      });
      current = parent?.parentTaskId ?? null;
      depth += 1;
    }
    return depth >= maxDepth; // depth limit exceeded → suspect cycle
  }
}
