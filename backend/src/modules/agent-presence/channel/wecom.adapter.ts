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
 * WecomAdapter — Channel adapter for WeCom (企业微信).
 *
 * Handles inbound event callbacks and outbound message sending
 * via WeCom Server API.
 */
@Injectable()
export class WecomAdapter implements ChannelAdapter {
  readonly platform = ConversationChannel.WECOM;
  private readonly logger = new Logger(WecomAdapter.name);
  private readonly corpId = process.env.WECOM_CORP_ID || '';
  private readonly corpSecret = process.env.WECOM_CORP_SECRET || '';
  private readonly agentIdConfig = process.env.WECOM_AGENT_ID || '';

  normalizeInbound(rawPayload: any): InboundMessage | null {
    // WeCom callback XML parsed to JSON
    const msgType = rawPayload?.MsgType ?? rawPayload?.msgtype;
    if (!msgType) return null;

    const fromUser = rawPayload?.FromUserName ?? rawPayload?.from_user ?? '';
    const msgId = rawPayload?.MsgId ?? rawPayload?.msgid ?? '';

    let contentType: InboundMessage['contentType'] = 'text';
    let content = '';

    switch (msgType) {
      case 'text':
        content = rawPayload?.Content ?? rawPayload?.content ?? '';
        break;
      case 'voice':
        contentType = 'voice';
        content = rawPayload?.Recognition ?? rawPayload?.MediaId ?? '';
        break;
      case 'image':
        contentType = 'image';
        content = rawPayload?.PicUrl ?? rawPayload?.MediaId ?? '';
        break;
      case 'file':
        contentType = 'file';
        content = rawPayload?.MediaId ?? '';
        break;
      default:
        content = `[${msgType}]`;
    }

    if (!content) return null;

    return {
      channelMessageId: String(msgId),
      senderId: fromUser,
      senderName: fromUser,
      contentType,
      content,
      rawPayload,
    };
  }

  async sendOutbound(
    channelId: string,
    message: OutboundMessage,
    _config?: Record<string, any>,
  ): Promise<DeliveryResult> {
    const token = await this.getAccessToken();
    if (!token) {
      return { success: false, error: 'Failed to get WeCom access token' };
    }

    try {
      const body = {
        touser: channelId,
        msgtype: 'text',
        agentid: Number(this.agentIdConfig),
        text: { content: message.content },
      };

      const resp = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      const data: any = await resp.json();
      if (data?.errcode !== 0) {
        this.logger.error(`WeCom send failed: ${data?.errcode} ${data?.errmsg}`);
        return { success: false, error: `WeCom API ${data?.errcode}: ${data?.errmsg}` };
      }

      return { success: true, channelMessageId: data?.msgid };
    } catch (err: any) {
      this.logger.error(`WeCom send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async healthCheck(_config?: Record<string, any>): Promise<HealthStatus> {
    if (!this.corpId || !this.corpSecret) {
      return { connected: false, details: { error: 'WECOM_CORP_ID/SECRET not set' } };
    }

    const token = await this.getAccessToken();
    return {
      connected: !!token,
      details: { hasToken: !!token },
    };
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.corpId || !this.corpSecret) return null;

    try {
      const resp = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.corpSecret}`,
      );
      const data: any = await resp.json();
      return data?.access_token ?? null;
    } catch {
      return null;
    }
  }
}
