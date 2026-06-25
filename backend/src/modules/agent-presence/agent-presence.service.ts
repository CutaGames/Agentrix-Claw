import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { UserAgent, UserAgentStatus, DelegationLevel } from '../../entities/user-agent.entity';
import { ConversationEvent } from '../../entities/conversation-event.entity';
import { AgentSharePolicy } from '../../entities/agent-share-policy.entity';
import { AgentMemory, MemoryScope } from '../../entities/agent-memory.entity';
import {
  CreateAgentDto,
  UpdateAgentDto,
  BindChannelDto,
  CreateConversationEventDto,
  CreateSharePolicyDto,
  TimelineQueryDto,
} from './dto/agent-presence.dto';

@Injectable()
export class AgentPresenceService {
  private readonly logger = new Logger(AgentPresenceService.name);

  constructor(
    @InjectRepository(UserAgent)
    private readonly agentRepo: Repository<UserAgent>,
    @InjectRepository(ConversationEvent)
    private readonly eventRepo: Repository<ConversationEvent>,
    @InjectRepository(AgentSharePolicy)
    private readonly sharePolicyRepo: Repository<AgentSharePolicy>,
    @InjectRepository(AgentMemory)
    private readonly memoryRepo: Repository<AgentMemory>,
  ) {}

  // ── Agent CRUD ──────────────────────────────────────────────────────────────

  async createAgent(userId: string, dto: CreateAgentDto): Promise<UserAgent> {
    const agent = this.agentRepo.create({
      userId,
      name: dto.name,
      description: dto.description,
      personality: dto.personality,
      systemPrompt: dto.systemPrompt,
      avatarUrl: dto.avatarUrl,
      defaultModel: dto.defaultModel,
      capabilities: dto.capabilities ?? [],
      channelBindings: [],
      delegationLevel: dto.delegationLevel ?? DelegationLevel.ASSISTANT,
      templateId: dto.templateId,
      settings: dto.settings,
      metadata: dto.metadata,
      status: UserAgentStatus.ACTIVE,
    });

    const saved = await this.agentRepo.save(agent);
    this.logger.log(`Agent created: ${saved.id} for user ${userId}`);
    return saved;
  }

  async listAgents(userId: string): Promise<UserAgent[]> {
    return this.agentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAgent(userId: string, agentId: string): Promise<UserAgent> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, userId },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  async updateAgent(userId: string, agentId: string, dto: UpdateAgentDto): Promise<UserAgent> {
    const agent = await this.getAgent(userId, agentId);

    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.description !== undefined) agent.description = dto.description;
    if (dto.personality !== undefined) agent.personality = dto.personality;
    if (dto.systemPrompt !== undefined) agent.systemPrompt = dto.systemPrompt;
    if (dto.avatarUrl !== undefined) agent.avatarUrl = dto.avatarUrl;
    if (dto.defaultModel !== undefined) agent.defaultModel = dto.defaultModel;
    if (dto.capabilities !== undefined) agent.capabilities = dto.capabilities;
    if (dto.delegationLevel !== undefined) agent.delegationLevel = dto.delegationLevel;
    if (dto.memoryConfig !== undefined) agent.memoryConfig = dto.memoryConfig;
    if (dto.status !== undefined) agent.status = dto.status;
    if (dto.settings !== undefined) {
      agent.settings = this.mergeRecord(agent.settings, dto.settings);
    }
    if (dto.metadata !== undefined) {
      agent.metadata = this.mergeRecord(agent.metadata, dto.metadata);
    }

    return this.agentRepo.save(agent);
  }

  async archiveAgent(userId: string, agentId: string): Promise<UserAgent> {
    const agent = await this.getAgent(userId, agentId);
    agent.status = UserAgentStatus.ARCHIVED;
    return this.agentRepo.save(agent);
  }

  // ── Channel Binding ─────────────────────────────────────────────────────────

  async bindChannel(userId: string, agentId: string, dto: BindChannelDto): Promise<UserAgent> {
    const agent = await this.getAgent(userId, agentId);
    const bindings = agent.channelBindings ?? [];

    // Check for duplicate binding
    const existing = bindings.find(
      (b) => b.platform === dto.platform && b.channelId === dto.channelId,
    );
    if (existing) {
      throw new BadRequestException(`Channel ${dto.platform}:${dto.channelId} already bound`);
    }

    // Ensure this channel isn't bound to another agent
    const conflict = await this.agentRepo
      .createQueryBuilder('ua')
      .where('ua.user_id = :userId', { userId })
      .andWhere('ua.id != :agentId', { agentId })
      .andWhere('ua.channel_bindings @> :binding::jsonb', {
        binding: JSON.stringify([{ platform: dto.platform, channelId: dto.channelId }]),
      })
      .getOne();

    if (conflict) {
      throw new BadRequestException(
        `Channel ${dto.platform}:${dto.channelId} is already bound to agent "${conflict.name}"`,
      );
    }

    bindings.push({
      platform: dto.platform,
      channelId: dto.channelId,
      channelName: dto.channelName,
      boundAt: new Date().toISOString(),
      config: dto.config,
    });

    agent.channelBindings = bindings;
    const saved = await this.agentRepo.save(agent);
    this.logger.log(`Channel ${dto.platform} bound to agent ${agentId}`);
    return saved;
  }

  async unbindChannel(userId: string, agentId: string, platform: string): Promise<UserAgent> {
    const agent = await this.getAgent(userId, agentId);
    agent.channelBindings = (agent.channelBindings ?? []).filter(
      (b) => b.platform !== platform,
    );
    return this.agentRepo.save(agent);
  }

  /**
   * Resolve agentId from an inbound channel message.
   * Finds which agent is bound to the given platform + channelId.
   */
  async resolveAgentByChannel(
    userId: string,
    platform: string,
    channelId: string,
  ): Promise<UserAgent | null> {
    return this.agentRepo
      .createQueryBuilder('ua')
      .where('ua.user_id = :userId', { userId })
      .andWhere('ua.channel_bindings @> :binding::jsonb', {
        binding: JSON.stringify([{ platform, channelId }]),
      })
      .getOne();
  }

  // ── Unified Timeline (ConversationEvent) ──────────────────────────────────

  async createEvent(userId: string, dto: CreateConversationEventDto): Promise<ConversationEvent> {
    // Verify agent belongs to user
    await this.getAgent(userId, dto.agentId);

    const event = this.eventRepo.create({
      userId,
      agentId: dto.agentId,
      sessionId: dto.sessionId,
      channel: dto.channel,
      channelMessageId: dto.channelMessageId,
      direction: dto.direction,
      role: dto.role,
      contentType: dto.contentType ?? 'text',
      content: dto.content,
      externalSenderId: dto.externalSenderId,
      externalSenderName: dto.externalSenderName,
      metadata: dto.metadata,
      rawPayload: dto.rawPayload,
      deliveryStatus: 'delivered',
    });

    return this.eventRepo.save(event);
  }

  async getTimeline(
    userId: string,
    agentId: string,
    query: TimelineQueryDto,
  ): Promise<ConversationEvent[]> {
    const limit = query.limit ?? 50;
    const qb = this.eventRepo
      .createQueryBuilder('ce')
      .where('ce.user_id = :userId', { userId })
      .andWhere('ce.agent_id = :agentId', { agentId })
      .orderBy('ce.created_at', 'DESC')
      .take(limit);

    if (query.channel) {
      qb.andWhere('ce."channel" = :channel', { channel: query.channel });
    }

    if (query.before) {
      qb.andWhere('ce.created_at < :before', { before: query.before });
    }

    return qb.getMany();
  }

  async getTimelineStats(userId: string, agentId: string): Promise<{
    totalEvents: number;
    channelBreakdown: Record<string, number>;
    lastEventAt: string | null;
  }> {
    const total = await this.eventRepo.count({
      where: { userId, agentId },
    });

    const breakdown = await this.eventRepo
      .createQueryBuilder('ce')
      .select('ce.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .where('ce.user_id = :userId', { userId })
      .andWhere('ce.agent_id = :agentId', { agentId })
      .groupBy('ce.channel')
      .getRawMany();

    const channelBreakdown: Record<string, number> = {};
    for (const row of breakdown) {
      channelBreakdown[row.channel] = parseInt(row.count, 10);
    }

    const lastEvent = await this.eventRepo.findOne({
      where: { userId, agentId },
      order: { createdAt: 'DESC' },
    });

    return {
      totalEvents: total,
      channelBreakdown,
      lastEventAt: lastEvent?.createdAt?.toISOString() ?? null,
    };
  }

  // ── Agent Memory (Agent-centric) ──────────────────────────────────────────

  async getAgentMemories(
    userId: string,
    agentId: string,
    opts?: { scope?: MemoryScope; limit?: number },
  ): Promise<AgentMemory[]> {
    await this.getAgent(userId, agentId);

    const qb = this.memoryRepo
      .createQueryBuilder('am')
      .where('am.agent_id = :agentId', { agentId })
      .orderBy('am.created_at', 'DESC')
      .take(opts?.limit ?? 100);

    if (opts?.scope) {
      qb.andWhere('am.scope = :scope', { scope: opts.scope });
    }

    return qb.getMany();
  }

  async promoteMemoryToAgent(
    userId: string,
    agentId: string,
    memoryId: string,
  ): Promise<AgentMemory> {
    await this.getAgent(userId, agentId);

    const memory = await this.memoryRepo.findOne({ where: { id: memoryId } });
    if (!memory) {
      throw new NotFoundException('Memory not found');
    }

    memory.agentId = agentId;
    memory.scope = MemoryScope.AGENT;
    return this.memoryRepo.save(memory);
  }

  // ── Share Policies ────────────────────────────────────────────────────────

  async createSharePolicy(userId: string, dto: CreateSharePolicyDto): Promise<AgentSharePolicy> {
    // Verify both agents belong to user
    await this.getAgent(userId, dto.sourceAgentId);
    await this.getAgent(userId, dto.targetAgentId);

    const existing = await this.sharePolicyRepo.findOne({
      where: {
        userId,
        sourceAgentId: dto.sourceAgentId,
        targetAgentId: dto.targetAgentId,
        shareType: dto.shareType,
      },
    });

    if (existing) {
      existing.shareMode = dto.shareMode;
      return this.sharePolicyRepo.save(existing);
    }

    const policy = this.sharePolicyRepo.create({
      userId,
      sourceAgentId: dto.sourceAgentId,
      targetAgentId: dto.targetAgentId,
      shareType: dto.shareType,
      shareMode: dto.shareMode,
    });

    return this.sharePolicyRepo.save(policy);
  }

  async getSharePolicies(userId: string, agentId?: string): Promise<AgentSharePolicy[]> {
    const where: any = { userId };
    if (agentId) {
      where.sourceAgentId = agentId;
    }
    return this.sharePolicyRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async deleteSharePolicy(userId: string, policyId: string): Promise<void> {
    const policy = await this.sharePolicyRepo.findOne({
      where: { id: policyId, userId },
    });
    if (!policy) {
      throw new NotFoundException('Share policy not found');
    }
    await this.sharePolicyRepo.remove(policy);
  }

  // ── Approval ──────────────────────────────────────────────────────────────

  async rejectApproval(userId: string, eventId: string): Promise<{ success: boolean }> {
    const event = await this.eventRepo.findOne({ where: { id: eventId, userId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    await this.eventRepo.update(eventId, { approvalStatus: 'rejected' });
    return { success: true };
  }

  private mergeRecord(
    existing?: Record<string, any>,
    incoming?: Record<string, any>,
  ): Record<string, any> | undefined {
    if (incoming === undefined) {
      return existing;
    }
    if (existing === undefined) {
      return incoming;
    }

    const merged: Record<string, any> = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (
        value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && merged[key] !== null
        && typeof merged[key] === 'object'
        && !Array.isArray(merged[key])
      ) {
        merged[key] = this.mergeRecord(merged[key], value);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }
}
