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
 * WhatsAppAdapter — Channel adapter for WhatsApp Business API.
 */
@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsAppAdapter.name);
  private readonly token = process.env.WHATSAPP_TOKEN || '';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

  normalizeInbound(rawPayload: any): InboundMessage | null {
    // WhatsApp Cloud API webhook payload
    const entry = rawPayload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return null;

    const msg = messages[0];
    const contact = value?.contacts?.[0];

    let contentType: InboundMessage['contentType'] = 'text';
    let content = '';

    switch (msg.type) {
      case 'text':
        content = msg.text?.body ?? '';
        break;
      case 'audio':
        contentType = 'voice';
        content = msg.audio?.id ?? '';
        break;
      case 'image':
        contentType = 'image';
        content = msg.image?.id ?? '';
        break;
      case 'document':
        contentType = 'file';
        content = msg.document?.id ?? '';
        break;
      default:
        content = `[${msg.type}]`;
    }

    if (!content) return null;

    return {
      channelMessageId: msg.id,
      senderId: msg.from ?? '',
      senderName: contact?.profile?.name ?? '',
      contentType,
      content,
      rawPayload: msg,
    };
  }

  async sendOutbound(
    channelId: string,
    message: OutboundMessage,
    _config?: Record<string, any>,
  ): Promise<DeliveryResult> {
    if (!this.token || !this.phoneNumberId) {
      return { success: false, error: 'WHATSAPP_TOKEN/PHONE_NUMBER_ID not configured' };
    }

    try {
      const body = {
        messaging_product: 'whatsapp',
        to: channelId,
        type: 'text',
        text: { body: message.content },
      };

      const resp = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`WhatsApp send failed: ${resp.status} ${errText}`);
        return { success: false, error: `WhatsApp API ${resp.status}` };
      }

      const data: any = await resp.json();
      return {
        success: true,
        channelMessageId: data?.messages?.[0]?.id,
      };
    } catch (err: any) {
      this.logger.error(`WhatsApp send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.token || !this.phoneNumberId) {
      return { connected: false, details: { error: 'WHATSAPP credentials not set' } };
    }

    try {
      const resp = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );
      if (!resp.ok) {
        return { connected: false, details: { error: `API returned ${resp.status}` } };
      }
      const data: any = await resp.json();
      return {
        connected: true,
        details: {
          phoneNumber: data?.display_phone_number,
          qualityRating: data?.quality_rating,
        },
      };
    } catch (err: any) {
      return { connected: false, details: { error: err.message } };
    }
  }
}
