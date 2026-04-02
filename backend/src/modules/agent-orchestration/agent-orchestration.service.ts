import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { AgentContextService } from '../agent-context/agent-context.service';

// ── Orchestration Types ──────────────────────────────────────────────────────

export interface SubAgentConfig {
  /** Existing agent account ID to delegate to (from agent team) */
  agentAccountId?: string;
  /** Task description */
  task: string;
  /** Model override (defaults to agent's preferred model) */
  model?: string;
  /** Maximum LLM turns for this sub-agent */
  maxTurns?: number;
  /** Budget in USD for this sub-agent */
  budgetUsd?: number;
  /** Tool whitelist (if not provided, uses agent's configured permissions) */
  allowedTools?: string[];
  /** Run in background (async) or wait for result (sync) */
  runInBackground?: boolean;
}

export interface SubAgentHandle {
  id: string;
  agentAccountId?: string;
  agentName: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export interface CoordinateConfig {
  task: string;
  workers: WorkerConfig[];
  timeoutMs?: number;
}

export interface WorkerConfig {
  role: string;
  agentAccountId?: string;
  task: string;
  model?: string;
  maxTurns?: number;
  budgetUsd?: number;
  allowedTools?: string[];
}

export interface OrchestrationResult {
  coordinatorSummary: string;
  workers: SubAgentHandle[];
  totalCostUsd: number;
}

// ── Disallowed tools for sub-agents (prevent recursion) ──────────────────────
const SUB_AGENT_DISALLOWED_TOOLS = [
  'agent_spawn',
  'agent_coordinate',
  'create_subtask',
];

@Injectable()
export class AgentOrchestrationService {
  private readonly logger = new Logger(AgentOrchestrationService.name);

  /** Active sub-agent handles, keyed by handle ID */
  private activeHandles = new Map<string, SubAgentHandle>();

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
    private readonly agentContextService: AgentContextService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 1: SubAgent spawn — delegate to existing agent team members
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a sub-agent task delegated to an existing AgentAccount+OpenClawInstance.
   * This leverages the persistent agent team infrastructure rather than creating
   * anonymous sub-processes.
   */
  async spawn(
    parentUserId: string,
    config: SubAgentConfig,
  ): Promise<SubAgentHandle> {
    const handleId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Resolve the target agent (from team or by ID)
    let agentAccount: AgentAccount | null = null;
    let instance: OpenClawInstance | null = null;

    if (config.agentAccountId) {
      agentAccount = await this.agentAccountRepo.findOne({
        where: { id: config.agentAccountId, ownerId: parentUserId },
      });
      if (agentAccount) {
        instance = await this.instanceRepo.findOne({
          where: { agentAccountId: agentAccount.id, userId: parentUserId },
        });
      }
    }

    const handle: SubAgentHandle = {
      id: handleId,
      agentAccountId: agentAccount?.id,
      agentName: agentAccount?.name || 'anonymous-worker',
      task: config.task,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };

    this.activeHandles.set(handleId, handle);

    // Build the sub-agent's context using the shared context builder
    const builtContext = await this.agentContextService.buildContext({
      userId: parentUserId,
      agentId: agentAccount?.id,
      instanceName: agentAccount?.name || 'Worker Agent',
      modelLabel: config.model || agentAccount?.preferredModel || 'claude-haiku-4-5',
      needsTools: true,
      planModeAddition: `\n## Sub-Agent Task\nYou are executing a delegated sub-task. Focus on this specific task:\n${config.task}\n\nComplete it concisely and report back.\n`,
    });

    handle.status = 'running';

    // Build the system prompt for this sub-agent
    const subAgentSystemPrompt = builtContext.systemPrompt;

    // Filter tools for sub-agent safety
    const effectiveTools = config.allowedTools
      ? config.allowedTools.filter(t => !SUB_AGENT_DISALLOWED_TOOLS.includes(t))
      : undefined;

    this.logger.log(
      `🤖 Spawned sub-agent: ${handle.agentName} (${handleId}), task="${config.task.slice(0, 80)}", ` +
      `model=${config.model || agentAccount?.preferredModel || 'default'}, ` +
      `tools=${effectiveTools?.length ?? 'all'}, budget=$${config.budgetUsd || 0.5}`,
    );

    // Store the handle metadata for the caller to reference
    handle.result = JSON.stringify({
      systemPrompt: subAgentSystemPrompt.slice(0, 200) + '...',
      agentAccountId: agentAccount?.id,
      instanceId: instance?.id,
      model: config.model || agentAccount?.preferredModel,
      maxTurns: config.maxTurns || 10,
      budgetUsd: config.budgetUsd || 0.50,
      allowedTools: effectiveTools,
    });

    return handle;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 2: Coordinator — parallel worker orchestration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Coordinate multiple workers in parallel, each delegated to an existing
   * agent team member. Results are aggregated and returned.
   */
  async coordinate(
    parentUserId: string,
    config: CoordinateConfig,
  ): Promise<OrchestrationResult> {
    this.logger.log(
      `🎯 Coordinating ${config.workers.length} workers for: "${config.task.slice(0, 80)}"`,
    );

    // Resolve agent accounts for each worker role
    const workers: SubAgentHandle[] = [];
    for (const w of config.workers) {
      let agentAccountId = w.agentAccountId;

      // Auto-resolve by role name if no explicit ID
      if (!agentAccountId && w.role) {
        const matched = await this.findTeamMemberByRole(parentUserId, w.role);
        agentAccountId = matched?.id;
      }

      const handle = await this.spawn(parentUserId, {
        agentAccountId,
        task: w.task,
        model: w.model,
        maxTurns: w.maxTurns || 10,
        budgetUsd: w.budgetUsd || 0.50,
        allowedTools: w.allowedTools,
      });

      workers.push(handle);
    }

    // In the current implementation, sub-agents produce context/metadata
    // that the parent chat loop can use. Full async execution will be
    // added when QueryEngine is refactored (Phase 2 of Architecture doc).
    const totalCost = workers.reduce(
      (sum, w) => sum + (w.usage?.estimatedCostUsd || 0),
      0,
    );

    return {
      coordinatorSummary: `Dispatched ${workers.length} worker agents for: ${config.task}`,
      workers,
      totalCostUsd: totalCost,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 3: Team mailbox (simple async message passing)
  // ═══════════════════════════════════════════════════════════════════════════

  private mailboxes = new Map<string, Array<{
    from: string;
    message: string;
    timestamp: string;
  }>>();

  async sendMessage(
    from: string,
    to: string,
    message: string,
  ): Promise<void> {
    const entry = { from, message, timestamp: new Date().toISOString() };

    if (to === '*') {
      // Broadcast to all mailboxes
      for (const [name] of this.mailboxes) {
        if (name !== from) {
          const box = this.mailboxes.get(name) || [];
          box.push(entry);
          this.mailboxes.set(name, box);
        }
      }
    } else {
      const box = this.mailboxes.get(to) || [];
      box.push(entry);
      this.mailboxes.set(to, box);
    }

    this.logger.log(`📨 Message: ${from} → ${to}: "${message.slice(0, 80)}"`);
  }

  async readMailbox(agentName: string): Promise<Array<{ from: string; message: string; timestamp: string }>> {
    const entries = this.mailboxes.get(agentName) || [];
    this.mailboxes.set(agentName, []); // Clear after read
    return entries;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find a team member's AgentAccount by role name (e.g., 'dev', 'qa-ops', 'growth').
   * Searches through the user's agent accounts for one matching the role.
   */
  private async findTeamMemberByRole(
    userId: string,
    role: string,
  ): Promise<AgentAccount | null> {
    const normalizedRole = role.toLowerCase().trim();

    // Search agent accounts with role-matching name
    const accounts = await this.agentAccountRepo.find({
      where: { ownerId: userId },
    });

    // Try exact match first, then fuzzy
    const exact = accounts.find(a =>
      a.name.toLowerCase() === normalizedRole ||
      a.name.toLowerCase().endsWith(`-${normalizedRole}`) ||
      a.name.toLowerCase().includes(normalizedRole),
    );

    return exact || null;
  }

  /** Get status of a sub-agent by handle ID */
  getHandle(handleId: string): SubAgentHandle | null {
    return this.activeHandles.get(handleId) || null;
  }

  /** List all active sub-agent handles for a session */
  listActiveHandles(): SubAgentHandle[] {
    return [...this.activeHandles.values()].filter(h =>
      h.status === 'pending' || h.status === 'running',
    );
  }

  /** Clean up completed handles older than the given age */
  cleanupOldHandles(maxAgeMs: number = 3600_000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, handle] of this.activeHandles) {
      if (
        (handle.status === 'completed' || handle.status === 'failed') &&
        handle.completedAt &&
        now - new Date(handle.completedAt).getTime() > maxAgeMs
      ) {
        this.activeHandles.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
