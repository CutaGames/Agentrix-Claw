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
export class TelegramAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.TELEGRAM;
  private readonly logger = new Logger(TelegramAdapter.name);
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  private readonly apiBase: string;

  constructor() {
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  normalizeInbound(rawPayload: any): InboundMessage | null {
    const message = rawPayload?.message ?? rawPayload?.channel_post;
    if (!message) return null;

    const text = message.text ?? message.caption;
    const voice = message.voice ?? message.audio;
    const from = message.from ?? message.chat;

    // Skip bare /start (handled by bind flow)
    if (text === '/start') return null;

    // /start <token> is a bind command — handled separately
    if (text?.startsWith('/start ')) return null;

    // Bot commands handled separately
    if (text === '/status' || text === '/help') return null;

    let contentType: InboundMessage['contentType'] = 'text';
    let content = text || '';

    if (voice?.file_id && !text) {
      contentType = 'voice';
      content = voice.file_id; // Will be transcribed downstream
    }

    if (!content) return null;

    return {
      channelMessageId: String(message.message_id),
      senderId: String(from?.id ?? message.chat?.id ?? ''),
      senderName:
        from?.username ??
        `${from?.first_name ?? ''} ${from?.last_name ?? ''}`.trim() ??
        undefined,
      contentType,
      content,
      rawPayload: message,
    };
  }

  async sendOutbound(
    channelId: string,
    message: OutboundMessage,
    _config?: Record<string, any>,
  ): Promise<DeliveryResult> {
    if (!this.botToken) {
      return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
    }

    try {
      const body: Record<string, any> = {
        chat_id: Number(channelId),
        text: message.content,
      };

      if (message.replyToMessageId) {
        body.reply_to_message_id = Number(message.replyToMessageId);
      }

      if (message.extra) {
        Object.assign(body, message.extra);
      }

      const resp = await fetch(`${this.apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`Telegram sendMessage failed: ${resp.status} ${errText}`);
        return { success: false, error: `Telegram API ${resp.status}` };
      }

      const data: any = await resp.json();
      return {
        success: true,
        channelMessageId: String(data?.result?.message_id ?? ''),
      };
    } catch (err: any) {
      this.logger.error(`Telegram send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.botToken) {
      return { connected: false, details: { error: 'TELEGRAM_BOT_TOKEN not set' } };
    }

    try {
      const resp = await fetch(`${this.apiBase}/getMe`);
      if (!resp.ok) {
        return { connected: false, details: { error: `API returned ${resp.status}` } };
      }
      const data: any = await resp.json();
      return {
        connected: data?.ok === true,
        details: {
          botUsername: data?.result?.username,
          botId: data?.result?.id,
        },
      };
    } catch (err: any) {
      return { connected: false, details: { error: err.message } };
    }
  }
}
