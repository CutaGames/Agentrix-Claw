/**
 * ChannelAdapter — Unified abstraction for all Presence surfaces.
 *
 * Each social/device channel implements this interface so that the
 * AgentPresenceRouter can handle inbound messages and send outbound
 * replies in a channel-agnostic way.
 */

export interface InboundMessage {
  channelMessageId?: string;
  senderId: string;
  senderName?: string;
  contentType: 'text' | 'voice' | 'image' | 'file' | 'card' | 'action';
  content: string;
  rawPayload?: Record<string, any>;
}

export interface OutboundMessage {
  content: string;
  contentType?: 'text' | 'voice' | 'image' | 'card';
  replyToMessageId?: string;
  extra?: Record<string, any>;
}

export interface DeliveryResult {
  success: boolean;
  channelMessageId?: string;
  error?: string;
}

export interface HealthStatus {
  connected: boolean;
  details?: Record<string, any>;
}

export interface ChannelAdapter {
  /** Platform identifier — must match ConversationChannel enum */
  readonly platform: string;

  /**
   * Normalize a raw inbound webhook payload into a standard InboundMessage.
   * Returns null if the payload should be ignored (e.g. bot commands handled separately).
   */
  normalizeInbound(rawPayload: any): InboundMessage | null;

  /**
   * Send an outbound message from an Agent to the channel.
   * @param channelId  The platform-side chat/channel ID
   * @param message    The outbound message to send
   * @param config     Channel-specific config from the agent's channelBindings
   */
  sendOutbound(
    channelId: string,
    message: OutboundMessage,
    config?: Record<string, any>,
  ): Promise<DeliveryResult>;

  /**
   * Check whether the channel connection is healthy.
   */
  healthCheck(config?: Record<string, any>): Promise<HealthStatus>;
}
