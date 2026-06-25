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
export class DiscordAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.DISCORD;
  private readonly logger = new Logger(DiscordAdapter.name);
  private readonly botToken = process.env.DISCORD_BOT_TOKEN || '';

  normalizeInbound(rawPayload: any): InboundMessage | null {
    // Discord interaction type 2 = APPLICATION_COMMAND
    if (rawPayload?.type === 2) {
      const commandName = rawPayload?.data?.name ?? '';
      const userId = rawPayload?.member?.user?.id ?? rawPayload?.user?.id ?? '';
      const userName = rawPayload?.member?.user?.username ?? '';

      return {
        channelMessageId: rawPayload?.id,
        senderId: userId,
        senderName: userName,
        contentType: 'text',
        content: `/${commandName} ${JSON.stringify(rawPayload?.data?.options ?? [])}`,
        rawPayload,
      };
    }

    // Regular message (MESSAGE_CREATE event via gateway)
    if (rawPayload?.content && rawPayload?.author) {
      return {
        channelMessageId: rawPayload.id,
        senderId: rawPayload.author.id,
        senderName: rawPayload.author.username,
        contentType: 'text',
        content: rawPayload.content,
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
    if (!this.botToken) {
      return { success: false, error: 'DISCORD_BOT_TOKEN not configured' };
    }

    try {
      const resp = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${this.botToken}`,
          },
          body: JSON.stringify({ content: message.content }),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`Discord send failed: ${resp.status} ${errText}`);
        return { success: false, error: `Discord API ${resp.status}` };
      }

      const data: any = await resp.json();
      return { success: true, channelMessageId: data?.id };
    } catch (err: any) {
      this.logger.error(`Discord send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.botToken) {
      return { connected: false, details: { error: 'DISCORD_BOT_TOKEN not set' } };
    }

    try {
      const resp = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${this.botToken}` },
      });
      if (!resp.ok) {
        return { connected: false, details: { error: `API returned ${resp.status}` } };
      }
      const data: any = await resp.json();
      return {
        connected: true,
        details: { botUsername: data?.username, botId: data?.id },
      };
    } catch (err: any) {
      return { connected: false, details: { error: err.message } };
    }
  }
}
