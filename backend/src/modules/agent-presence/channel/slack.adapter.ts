import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  DeliveryResult,
  HealthStatus,
} from './channel-adapter.interface';
import { ConversationChannel } from '../../../entities/conversation-event.entity';

/**
 * SlackAdapter — Channel adapter for Slack.
 */
@Injectable()
export class SlackAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.SLACK;
  private readonly logger = new Logger(SlackAdapter.name);
  private readonly botToken = process.env.SLACK_BOT_TOKEN || '';

  normalizeInbound(rawPayload: any): InboundMessage | null {
    // Slack Events API: event_callback with event.type = message
    const event = rawPayload?.event;
    if (!event || event.type !== 'message') return null;

    // Skip bot messages to avoid loops
    if (event.bot_id || event.subtype === 'bot_message') return null;

    return {
      channelMessageId: event.ts,
      senderId: event.user ?? '',
      senderName: event.user ?? '',
      contentType: 'text',
      content: event.text ?? '',
      rawPayload: event,
    };
  }

  async sendOutbound(
    channelId: string,
    message: OutboundMessage,
    _config?: Record<string, any>,
  ): Promise<DeliveryResult> {
    if (!this.botToken) {
      return { success: false, error: 'SLACK_BOT_TOKEN not configured' };
    }

    try {
      const body: Record<string, any> = {
        channel: channelId,
        text: message.content,
      };

      if (message.replyToMessageId) {
        body.thread_ts = message.replyToMessageId;
      }

      const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify(body),
      });

      const data: any = await resp.json();
      if (!data?.ok) {
        this.logger.error(`Slack send failed: ${data?.error}`);
        return { success: false, error: `Slack API: ${data?.error}` };
      }

      return { success: true, channelMessageId: data?.ts };
    } catch (err: any) {
      this.logger.error(`Slack send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.botToken) {
      return { connected: false, details: { error: 'SLACK_BOT_TOKEN not set' } };
    }

    try {
      const resp = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${this.botToken}` },
      });
      const data: any = await resp.json();
      return {
        connected: data?.ok === true,
        details: {
          botUserId: data?.user_id,
          team: data?.team,
        },
      };
    } catch (err: any) {
      return { connected: false, details: { error: err.message } };
    }
  }
}
