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
 * FeishuAdapter — Channel adapter for Feishu (飞书) / Lark.
 *
 * Handles inbound event callbacks and outbound message sending
 * via Feishu Open Platform API.
 */
@Injectable()
export class FeishuAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.FEISHU;
  private readonly logger = new Logger(FeishuAdapter.name);
  private readonly appId = process.env.FEISHU_APP_ID || '';
  private readonly appSecret = process.env.FEISHU_APP_SECRET || '';

  normalizeInbound(rawPayload: any): InboundMessage | null {
    // Feishu event callback v2 schema
    const event = rawPayload?.event;
    if (!event) return null;

    // im.message.receive_v1 event
    const message = event?.message;
    if (!message) return null;

    const sender = event?.sender;
    const senderId = sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? '';
    const senderName = sender?.sender_id?.name ?? '';

    // Parse message content based on msg_type
    const msgType = message?.msg_type;
    let contentType: InboundMessage['contentType'] = 'text';
    let content = '';

    if (msgType === 'text') {
      try {
        const parsed = JSON.parse(message.content || '{}');
        content = parsed.text ?? '';
      } catch {
        content = message.content ?? '';
      }
    } else if (msgType === 'audio') {
      contentType = 'voice';
      content = message.content ?? '';
    } else if (msgType === 'image') {
      contentType = 'image';
      content = message.content ?? '';
    } else if (msgType === 'file') {
      contentType = 'file';
      content = message.content ?? '';
    } else {
      content = message.content ?? `[${msgType}]`;
    }

    if (!content) return null;

    return {
      channelMessageId: message.message_id,
      senderId,
      senderName,
      contentType,
      content,
      rawPayload: event,
    };
  }

  async sendOutbound(
    channelId: string,
    message: OutboundMessage,
    _config?: Record<string, any>,
  ): Promise<DeliveryResult> {
    const token = await this.getTenantAccessToken();
    if (!token) {
      return { success: false, error: 'Failed to get Feishu tenant access token' };
    }

    try {
      const body = {
        receive_id: channelId,
        msg_type: 'text',
        content: JSON.stringify({ text: message.content }),
      };

      const resp = await fetch(
        'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error(`Feishu send failed: ${resp.status} ${errText}`);
        return { success: false, error: `Feishu API ${resp.status}` };
      }

      const data: any = await resp.json();
      return {
        success: data?.code === 0,
        channelMessageId: data?.data?.message_id,
        error: data?.code !== 0 ? data?.msg : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Feishu send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.appId || !this.appSecret) {
      return { connected: false, details: { error: 'FEISHU_APP_ID/SECRET not set' } };
    }

    const token = await this.getTenantAccessToken();
    return {
      connected: !!token,
      details: { hasToken: !!token },
    };
  }

  private async getTenantAccessToken(): Promise<string | null> {
    if (!this.appId || !this.appSecret) return null;

    try {
      const resp = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app_id: this.appId,
            app_secret: this.appSecret,
          }),
        },
      );
      const data: any = await resp.json();
      return data?.tenant_access_token ?? null;
    } catch {
      return null;
    }
  }
}
