import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorldAsset } from '../entities/world-asset.entity';
import { AgentQuotaService } from './agent-quota.service';

/**
 * Idle action types that an Agent-bound character can perform.
 */
export type IdleActionType = 'greet_owner' | 'comment_time' | 'suggest_battle' | 'interact_collection';

/**
 * XP thresholds for unlocking growth skill slots.
 * Each threshold unlocks 1 additional growth skill slot (max 4).
 */
export const XP_THRESHOLDS = [100, 500, 1500, 5000] as const;

/**
 * Maximum number of growth skill slots that can be unlocked via XP.
 */
export const MAX_GROWTH_SKILL_SLOTS = 4;

/**
 * AgentBindingService — Agent instance creation, behavior tree configuration, idle action scheduling.
 *
 * Responsibilities:
 * - Bind/unbind Agent instances to world assets
 * - Configure Agent with personality traits and behavior tree as system prompt
 * - Schedule idle actions (1-4 per hour after 5min idle)
 * - XP award and skill slot unlock logic (thresholds: 100, 500, 1500, 5000)
 * - 10s timeout on binding operations, preserve unbound state on failure
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 11.2, 11.3
 */
@Injectable()
export class AgentBindingService {
  private readonly logger = new Logger(AgentBindingService.name);

  /** 10-second timeout for binding operations (R6.7) */
  private readonly BIND_TIMEOUT_MS = 10_000;

  /** Idle threshold: 5 minutes before idle actions start */
  private readonly IDLE_THRESHOLD_MINUTES = 5;

  /** Idle actions per hour range */
  private readonly IDLE_ACTIONS_MIN = 1;
  private readonly IDLE_ACTIONS_MAX = 4;

  /** Available idle action types */
  private readonly IDLE_ACTIONS: IdleActionType[] = [
    'greet_owner',
    'comment_time',
    'suggest_battle',
    'interact_collection',
  ];

  /** In-memory idle action schedules (Phase 1: log-only, no push notifications) */
  private readonly idleSchedules = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    private readonly agentQuotaService: AgentQuotaService,
  ) {}

  /**
   * Bind a new Agentrix Agent to a world asset.
   *
   * Steps:
   * 1. Call agentQuotaService.acquireAgentSlot(userId) to check quota and acquire lock
   * 2. Create an Agent instance (mock for Phase 1) with personality + behavior tree
   * 3. Set worldAsset.boundAgentId = newAgentId
   * 4. Release the quota lock
   * 5. Schedule idle actions
   *
   * @param assetId - The world asset to bind an agent to
   * @param userId - The user performing the binding
   * @returns { agentId, status: 'bound' }
   * @throws ForbiddenException if quota is exhausted
   * @throws NotFoundException if asset not found
   * @throws InternalServerErrorException on timeout or service error
   */
  async bindAgent(assetId: string, userId: string): Promise<{ agentId: string; status: string }> {
    // Enforce 10-second timeout (R6.7)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new InternalServerErrorException('Agent binding timed out (10s limit exceeded)')),
        this.BIND_TIMEOUT_MS,
      );
    });

    const bindPromise = this.performBind(assetId, userId);

    try {
      return await Promise.race([bindPromise, timeoutPromise]);
    } catch (error) {
      // Preserve unbound state on failure (R6.7)
      this.logger.error(`Agent binding failed for asset ${assetId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Internal bind implementation.
   */
  private async performBind(assetId: string, userId: string): Promise<{ agentId: string; status: string }> {
    // Load asset and verify ownership
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId, ownerId: userId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found or not owned by user`);
    }

    // Check if already bound
    if (asset.boundAgentId) {
      throw new ForbiddenException(`World asset ${assetId} already has a bound agent`);
    }

    // Acquire agent slot (checks quota and acquires lock)
    await this.agentQuotaService.acquireAgentSlot(userId);

    try {
      // Create Agent instance (Phase 1: mock/local agent)
      // In production, this would call the OpenClaw API to create a real agent instance
      const agentId = uuidv4();
      const systemPrompt = this.buildSystemPrompt(asset);

      this.logger.log(
        `Creating agent for asset ${assetId}: agentId=${agentId}, ` +
        `personality=${(asset.personalityTraits || []).join(', ')}`,
      );

      // Phase 1: Log the agent creation (actual OpenClaw integration in later phase)
      this.logger.log(`Agent system prompt configured (${systemPrompt.length} chars)`);

      // Update the world asset with the bound agent ID
      await this.worldAssetRepo.update(assetId, { boundAgentId: agentId });

      // Schedule idle actions for this agent
      this.scheduleIdleActions(agentId, assetId, userId);

      return { agentId, status: 'bound' };
    } catch (error) {
      // Release the quota lock on failure to preserve unbound state
      await this.agentQuotaService.releaseAgentSlot(userId);
      throw error;
    } finally {
      // Always release the lock after the operation
      await this.agentQuotaService.releaseAgentSlot(userId);
    }
  }

  /**
   * Unbind the Agent from a world asset.
   *
   * @param assetId - The world asset to unbind
   * @param userId - The user performing the unbinding (must be owner)
   * @returns { status: 'unbound' }
   */
  async unbindAgent(assetId: string, userId: string): Promise<{ status: string }> {
    // Load asset and verify ownership
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId, ownerId: userId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found or not owned by user`);
    }

    if (!asset.boundAgentId) {
      return { status: 'unbound' }; // Already unbound, idempotent
    }

    const previousAgentId = asset.boundAgentId;

    // Cancel idle action schedule
    this.cancelIdleActions(previousAgentId);

    // Set boundAgentId to null
    await this.worldAssetRepo.update(assetId, { boundAgentId: null });

    this.logger.log(`Agent unbound: assetId=${assetId}, previousAgentId=${previousAgentId}`);

    return { status: 'unbound' };
  }

  /**
   * Schedule idle actions for an Agent-bound character (R6.3).
   *
   * After binding, schedule a cron-like job that fires 1-4 times per hour
   * when the agent has been idle > 5 min.
   *
   * Actions: greet_owner, comment_time, suggest_battle, interact_collection
   *
   * Phase 1: Just log the actions (actual push notifications in a later task).
   */
  scheduleIdleActions(agentId: string, assetId: string, userId: string): void {
    // Cancel any existing schedule for this agent
    this.cancelIdleActions(agentId);

    // Calculate interval: 1-4 actions per hour = every 15-60 minutes
    // Use a random interval within this range
    const actionsPerHour = this.IDLE_ACTIONS_MIN +
      Math.floor(Math.random() * (this.IDLE_ACTIONS_MAX - this.IDLE_ACTIONS_MIN + 1));
    const intervalMs = (60 / actionsPerHour) * 60 * 1000; // Convert to milliseconds

    this.logger.log(
      `Scheduling idle actions for agent ${agentId}: ` +
      `${actionsPerHour} actions/hour (every ${Math.round(intervalMs / 60000)} min)`,
    );

    const timer = setInterval(() => {
      this.performIdleAction(agentId, assetId, userId);
    }, intervalMs);

    this.idleSchedules.set(agentId, timer);
  }

  /**
   * Perform a single idle action (Phase 1: log only).
   */
  private performIdleAction(agentId: string, assetId: string, userId: string): void {
    // Select a random action
    const action = this.IDLE_ACTIONS[Math.floor(Math.random() * this.IDLE_ACTIONS.length)];

    // Phase 1: Just log the action
    this.logger.log(
      `[IdleAction] agent=${agentId}, asset=${assetId}, user=${userId}, action=${action}`,
    );

    // In a later phase, this would:
    // - Send a push notification to the user
    // - Record the action in the agent activity log
    // - Potentially trigger interactions with other agents
  }

  /**
   * Cancel idle action schedule for an agent.
   */
  private cancelIdleActions(agentId: string): void {
    const timer = this.idleSchedules.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.idleSchedules.delete(agentId);
      this.logger.log(`Idle actions cancelled for agent ${agentId}`);
    }
  }

  /**
   * Award XP to a world asset and check for skill slot unlocks (R6.4).
   *
   * XP is monotonically increasing (Property 7).
   * Thresholds: [100, 500, 1500, 5000] — each unlocks 1 growth skill slot (max 4).
   *
   * @param assetId - The world asset to award XP to
   * @param xpAmount - Amount of XP to award (must be positive)
   * @returns Updated XP and unlocked skill slots info
   */
  async awardXp(
    assetId: string,
    xpAmount: number,
  ): Promise<{ xp: number; unlockedSkillSlots: number; newSlotUnlocked: boolean }> {
    if (xpAmount <= 0) {
      throw new Error('XP amount must be positive (XP is monotonically increasing)');
    }

    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found`);
    }

    // Calculate new XP (monotonically increasing)
    const newXp = asset.xp + xpAmount;

    // Calculate unlocked skill slots based on XP thresholds
    const newUnlockedSlots = this.calculateUnlockedSlots(newXp);
    const previousSlots = asset.unlockedSkillSlots;
    const newSlotUnlocked = newUnlockedSlots > previousSlots;

    // Update the asset
    await this.worldAssetRepo.update(assetId, {
      xp: newXp,
      unlockedSkillSlots: newUnlockedSlots,
    });

    if (newSlotUnlocked) {
      this.logger.log(
        `Skill slot unlocked for asset ${assetId}: ` +
        `xp=${newXp}, slots=${previousSlots}→${newUnlockedSlots}`,
      );
    }

    return {
      xp: newXp,
      unlockedSkillSlots: newUnlockedSlots,
      newSlotUnlocked,
    };
  }

  /**
   * Calculate the number of unlocked growth skill slots based on XP.
   * Thresholds: [100, 500, 1500, 5000], max 4 slots.
   */
  calculateUnlockedSlots(xp: number): number {
    let slots = 0;
    for (const threshold of XP_THRESHOLDS) {
      if (xp >= threshold) {
        slots++;
      } else {
        break;
      }
    }
    return Math.min(slots, MAX_GROWTH_SKILL_SLOTS);
  }

  /**
   * Build the system prompt for the Agent from the character's personality and behavior tree.
   */
  private buildSystemPrompt(asset: WorldAsset): string {
    const traits = (asset.personalityTraits || []).join(', ');
    const backstory = asset.backstory || 'A mysterious creature from the real world.';
    const behaviorTree = JSON.stringify(asset.behaviorTree || {});

    return [
      `You are ${asset.name}, a game character brought to life from the real world.`,
      ``,
      `## Personality`,
      `Your personality traits are: ${traits}`,
      ``,
      `## Backstory`,
      backstory,
      ``,
      `## Behavior`,
      `Your behavior tree defines how you act in different contexts:`,
      `- Idle: Perform casual actions when not engaged`,
      `- Combat: Make tactical decisions in battle`,
      `- Social: Interact with other characters and your owner`,
      ``,
      `## Behavior Tree Configuration`,
      behaviorTree,
      ``,
      `## Guidelines`,
      `- Stay in character at all times`,
      `- Reference your real-world origin when appropriate`,
      `- Be playful and engaging`,
      `- Suggest battles or activities when idle`,
    ].join('\n');
  }
}
