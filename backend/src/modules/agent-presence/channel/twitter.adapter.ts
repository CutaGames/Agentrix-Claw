import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  DeliveryResult,
  HealthStatus,
} from './channel-adapter.interface';
import { ConversationChannel } from '../../../entities/conversation-event.entity';

@Injectable()
export class TwitterAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.TWITTER;
  private readonly logger = new Logger(TwitterAdapter.name);
  private readonly bearerToken = process.env.TWITTER_BEARER_TOKEN || '';

  normalizeInbound(rawPayload: any): InboundMessage | null {
    // Tweet mention
    if (rawPayload?.user && (rawPayload?.text || rawPayload?.full_text)) {
      return {
        channelMessageId: rawPayload.id_str,
        senderId: rawPayload.user.id_str ?? '',
        senderName: rawPayload.user.screen_name ?? '',
        contentType: 'text',
        content: rawPayload.text ?? rawPayload.full_text ?? '',
        rawPayload,
      };
    }

    // DM
    if (rawPayload?.type === 'message_create') {
      return {
        channelMessageId: rawPayload.id,
        senderId: rawPayload.message_create?.sender_id ?? '',
        senderName: '',
        contentType: 'text',
        content: rawPayload.message_create?.message_data?.text ?? '',
        rawPayload,
      };
    }

    return null;
  }

  async sendOutbound(
    channelId: string,
    message: OutboundMessage,
    _config?: Record<string, any>,
  ): Promise<DeliveryResult> {
    if (!this.bearerToken) {
      return { success: false, error: 'TWITTER_BEARER_TOKEN not configured' };
    }

    try {
      // Post a reply tweet (or DM depending on channelId format)
      const resp = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify({
          text: message.content,
          ...(message.replyToMessageId
            ? { reply: { in_reply_to_tweet_id: message.replyToMessageId } }
            : {}),
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`Twitter post failed: ${resp.status} ${errText}`);
        return { success: false, error: `Twitter API ${resp.status}` };
      }

      const data: any = await resp.json();
      return { success: true, channelMessageId: data?.data?.id };
    } catch (err: any) {
      this.logger.error(`Twitter send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.bearerToken) {
      return { connected: false, details: { error: 'TWITTER_BEARER_TOKEN not set' } };
    }

    try {
      const resp = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
      });
      if (!resp.ok) {
        return { connected: false, details: { error: `API returned ${resp.status}` } };
      }
      const data: any = await resp.json();
      return {
        connected: true,
        details: { username: data?.data?.username, id: data?.data?.id },
      };
    } catch (err: any) {
      return { connected: false, details: { error: err.message } };
    }
  }
}
