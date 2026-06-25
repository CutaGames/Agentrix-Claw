import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelRegistry } from './channel-registry';
import { InboundMessage, OutboundMessage } from './channel-adapter.interface';
import { UserAgent, DelegationLevel } from '../../../entities/user-agent.entity';
import { ConversationEvent } from '../../../entities/conversation-event.entity';
import { AgentPresenceService } from '../agent-presence.service';
import { emitDesktopSyncEvent } from '../../desktop-sync/desktop-sync.events';

/**
 * AgentPresenceRouter — the central brain that:
 *  1. Receives normalized inbound messages from any channel
 *  2. Resolves which Agent is bound to this channel
 *  3. Writes the inbound event to conversation_events
 *  4. Checks the Agent's delegation level to decide action
 *  5. Generates AI reply if autonomous/representative
 *  6. Sends outbound reply through the adapter
 *  7. Writes the outbound event to conversation_events
 *  8. Broadcasts real-time updates to all connected devices
 */
@Injectable()
export class PresenceRouterService {
  private readonly logger = new Logger(PresenceRouterService.name);

  // AI reply generator — injected optionally to avoid circular deps
  private aiReplyFn?: (agentId: string, userId: string, userText: string, agent: UserAgent) => Promise<string | null>;

  constructor(
    private readonly channelRegistry: ChannelRegistry,
    private readonly presenceService: AgentPresenceService,
    @InjectRepository(UserAgent)
    private readonly agentRepo: Repository<UserAgent>,
    @InjectRepository(ConversationEvent)
    private readonly eventRepo: Repository<ConversationEvent>,
  ) {}

  /**
   * Register an AI reply function (called by module init to avoid circular dep).
   */
  setAIReplyFunction(fn: (agentId: string, userId: string, userText: string, agent: UserAgent) => Promise<string | null>) {
    this.aiReplyFn = fn;
  }

  /**
   * Main entry point: route an inbound channel message through the full pipeline.
   *
   * @param platform  Channel platform name (e.g. 'telegram')
   * @param channelId Platform-side chat/channel ID
   * @param rawPayload Raw webhook payload
   * @returns The created inbound ConversationEvent, or null if skipped
   */
  async routeInbound(
    platform: string,
    channelId: string,
    rawPayload: any,
  ): Promise<ConversationEvent | null> {
    const adapter = this.channelRegistry.get(platform);
    if (!adapter) {
      this.logger.warn(`No adapter registered for platform: ${platform}`);
      return null;
    }

    // Step 1: Normalize
    const inbound = adapter.normalizeInbound(rawPayload);
    if (!inbound) {
      return null; // Message type not handled (e.g. bot commands)
    }

    // Step 2: Resolve agent by channel binding
    const agent = await this.resolveAgentByChannelId(platform, channelId);
    if (!agent) {
      this.logger.debug(`No agent bound to ${platform}:${channelId}`);
      return null;
    }

    // Step 3: Write inbound event to conversation_events
    const inboundEvent = await this.writeEvent({
      userId: agent.userId,
      agentId: agent.id,
      channel: platform,
      direction: 'inbound',
      role: 'external_user',
      contentType: inbound.contentType,
      content: inbound.content,
      channelMessageId: inbound.channelMessageId,
      externalSenderId: inbound.senderId,
      externalSenderName: inbound.senderName,
      rawPayload: inbound.rawPayload,
    });

    // Broadcast to connected devices
    this.broadcastToDevices(agent.userId, 'presence:inbound', {
      agentId: agent.id,
      agentName: agent.name,
      channel: platform,
      event: inboundEvent,
    });

    // Step 4: Check delegation level and decide action
    const action = this.decideDelegationAction(agent, inbound);

    if (action === 'ignore') {
      // Observer mode — just record, don't reply
      return inboundEvent;
    }

    if (action === 'draft_for_approval') {
      // Assistant mode — generate draft but don't send
      const draft = await this.generateReply(agent, inbound.content);
      if (draft) {
        await this.eventRepo.update(inboundEvent.id, {
          approvalStatus: 'pending',
          approvalDraft: draft,
        });
        this.broadcastToDevices(agent.userId, 'presence:approval_needed', {
          agentId: agent.id,
          agentName: agent.name,
          channel: platform,
          eventId: inboundEvent.id,
          draft,
          inboundContent: inbound.content,
          senderName: inbound.senderName,
        });
      }
      return inboundEvent;
    }

    // auto_reply or autonomous — generate and send
    const reply = await this.generateReply(agent, inbound.content);
    if (reply) {
      // Send outbound
      const delivery = await adapter.sendOutbound(channelId, {
        content: reply,
        replyToMessageId: inbound.channelMessageId,
      });

      // Write outbound event
      const outboundEvent = await this.writeEvent({
        userId: agent.userId,
        agentId: agent.id,
        channel: platform,
        direction: 'outbound',
        role: 'agent',
        contentType: 'text',
        content: reply,
        channelMessageId: delivery.channelMessageId,
        deliveryStatus: delivery.success ? 'delivered' : 'failed',
        approvalStatus: 'auto',
        metadata: { deliveryResult: delivery },
      });

      this.broadcastToDevices(agent.userId, 'presence:outbound', {
        agentId: agent.id,
        agentName: agent.name,
        channel: platform,
        event: outboundEvent,
      });

      return inboundEvent;
    }

    return inboundEvent;
  }

  /**
   * Send an approved reply for a pending approval event.
   */
  async sendApprovedReply(
    userId: string,
    eventId: string,
    approvedText: string,
  ): Promise<ConversationEvent | null> {
    const event = await this.eventRepo.findOne({ where: { id: eventId, userId } });
    if (!event) return null;

    const adapter = this.channelRegistry.get(event.channel);
    if (!adapter) return null;

    // Resolve channelId from agent binding
    const agent = await this.agentRepo.findOne({ where: { id: event.agentId, userId } });
    if (!agent) return null;

    const binding = (agent.channelBindings ?? []).find(b => b.platform === event.channel);
    if (!binding) return null;

    // Send
    const delivery = await adapter.sendOutbound(binding.channelId, {
      content: approvedText,
    });

    // Update original event
    await this.eventRepo.update(eventId, {
      approvalStatus: 'approved',
      approvedAt: new Date(),
    });

    // Write outbound event
    const outboundEvent = await this.writeEvent({
      userId,
      agentId: event.agentId,
      channel: event.channel,
      direction: 'outbound',
      role: 'agent',
      contentType: 'text',
      content: approvedText,
      channelMessageId: delivery.channelMessageId,
      deliveryStatus: delivery.success ? 'delivered' : 'failed',
      approvalStatus: 'approved',
    });

    this.broadcastToDevices(userId, 'presence:outbound', {
      agentId: event.agentId,
      channel: event.channel,
      event: outboundEvent,
    });

    return outboundEvent;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async resolveAgentByChannelId(
    platform: string,
    channelId: string,
  ): Promise<UserAgent | null> {
    // Search all user_agents for one with a matching channel binding
    return this.agentRepo
      .createQueryBuilder('ua')
      .where('ua.channel_bindings @> :binding::jsonb', {
        binding: JSON.stringify([{ platform, channelId }]),
      })
      .getOne();
  }

  private decideDelegationAction(
    agent: UserAgent,
    _inbound: InboundMessage,
  ): 'ignore' | 'draft_for_approval' | 'auto_reply' {
    switch (agent.delegationLevel) {
      case DelegationLevel.OBSERVER:
        return 'ignore';
      case DelegationLevel.ASSISTANT:
        return 'draft_for_approval';
      case DelegationLevel.REPRESENTATIVE:
      case DelegationLevel.AUTONOMOUS:
        return 'auto_reply';
      default:
        return 'draft_for_approval';
    }
  }

  private async generateReply(agent: UserAgent, userText: string): Promise<string | null> {
    if (this.aiReplyFn) {
      try {
        return await this.aiReplyFn(agent.id, agent.userId, userText, agent);
      } catch (err: any) {
        this.logger.error(`AI reply generation failed for agent ${agent.id}: ${err.message}`);
      }
    }
    return null;
  }

  private async writeEvent(data: Partial<ConversationEvent>): Promise<ConversationEvent> {
    const event = this.eventRepo.create(data);
    return this.eventRepo.save(event);
  }

  private broadcastToDevices(userId: string, event: string, payload: any): void {
    try {
      emitDesktopSyncEvent(userId, event, payload);
    } catch {
      // WebSocket not available — silently skip
    }
  }
}
