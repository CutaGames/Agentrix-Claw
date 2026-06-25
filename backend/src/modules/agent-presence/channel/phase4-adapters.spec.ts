import { FeishuAdapter } from './feishu.adapter';
import { WecomAdapter } from './wecom.adapter';
import { SlackAdapter } from './slack.adapter';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { ConversationChannel } from '../../../entities/conversation-event.entity';

describe('Phase 4 Channel Adapters', () => {
  // ── FeishuAdapter ───────────────────────────────────────────────────────

  describe('FeishuAdapter', () => {
    let adapter: FeishuAdapter;

    beforeEach(() => {
      adapter = new FeishuAdapter();
    });

    it('should have platform = feishu', () => {
      expect(adapter.platform).toBe(ConversationChannel.FEISHU);
    });

    it('should normalize a text message', () => {
      const payload = {
        event: {
          message: {
            message_id: 'om_abc123',
            msg_type: 'text',
            content: JSON.stringify({ text: '你好世界' }),
          },
          sender: {
            sender_id: { open_id: 'ou_user1', name: '张三' },
          },
        },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.channelMessageId).toBe('om_abc123');
      expect(result!.content).toBe('你好世界');
      expect(result!.contentType).toBe('text');
      expect(result!.senderId).toBe('ou_user1');
    });

    it('should normalize a voice message', () => {
      const payload = {
        event: {
          message: {
            message_id: 'om_voice1',
            msg_type: 'audio',
            content: 'audio_key_abc',
          },
          sender: { sender_id: { open_id: 'ou_user2' } },
        },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('voice');
    });

    it('should return null for empty payload', () => {
      expect(adapter.normalizeInbound({})).toBeNull();
      expect(adapter.normalizeInbound({ event: {} })).toBeNull();
    });

    it('should report unhealthy when env not set', async () => {
      const health = await adapter.healthCheck();
      expect(health.connected).toBe(false);
    });
  });

  // ── WecomAdapter ────────────────────────────────────────────────────────

  describe('WecomAdapter', () => {
    let adapter: WecomAdapter;

    beforeEach(() => {
      adapter = new WecomAdapter();
    });

    it('should have platform = wecom', () => {
      expect(adapter.platform).toBe(ConversationChannel.WECOM);
    });

    it('should normalize a text message', () => {
      const payload = {
        MsgType: 'text',
        Content: '企业微信测试消息',
        FromUserName: 'employee001',
        MsgId: '12345',
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.content).toBe('企业微信测试消息');
      expect(result!.senderId).toBe('employee001');
      expect(result!.channelMessageId).toBe('12345');
    });

    it('should normalize a voice message with recognition', () => {
      const payload = {
        MsgType: 'voice',
        Recognition: '语音识别结果',
        FromUserName: 'emp002',
        MsgId: '67890',
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('voice');
      expect(result!.content).toBe('语音识别结果');
    });

    it('should return null for empty payload', () => {
      expect(adapter.normalizeInbound({})).toBeNull();
    });

    it('should report unhealthy when env not set', async () => {
      const health = await adapter.healthCheck();
      expect(health.connected).toBe(false);
    });
  });

  // ── SlackAdapter ────────────────────────────────────────────────────────

  describe('SlackAdapter', () => {
    let adapter: SlackAdapter;

    beforeEach(() => {
      adapter = new SlackAdapter();
    });

    it('should have platform = slack', () => {
      expect(adapter.platform).toBe(ConversationChannel.SLACK);
    });

    it('should normalize a user message event', () => {
      const payload = {
        event: {
          type: 'message',
          user: 'U12345',
          text: 'Hello from Slack!',
          ts: '1234567890.123456',
        },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.content).toBe('Hello from Slack!');
      expect(result!.senderId).toBe('U12345');
      expect(result!.channelMessageId).toBe('1234567890.123456');
    });

    it('should skip bot messages', () => {
      const payload = {
        event: {
          type: 'message',
          bot_id: 'B999',
          text: 'Bot reply',
          ts: '111',
        },
      };

      expect(adapter.normalizeInbound(payload)).toBeNull();
    });

    it('should return null for non-message events', () => {
      const payload = { event: { type: 'reaction_added', user: 'U1' } };
      expect(adapter.normalizeInbound(payload)).toBeNull();
    });

    it('should return null for empty payload', () => {
      expect(adapter.normalizeInbound({})).toBeNull();
    });

    it('should fail sendOutbound when no token', async () => {
      const result = await adapter.sendOutbound('C123', { content: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('SLACK_BOT_TOKEN');
    });
  });

  // ── WhatsAppAdapter ─────────────────────────────────────────────────────

  describe('WhatsAppAdapter', () => {
    let adapter: WhatsAppAdapter;

    beforeEach(() => {
      adapter = new WhatsAppAdapter();
    });

    it('should have platform = whatsapp', () => {
      expect(adapter.platform).toBe(ConversationChannel.WHATSAPP);
    });

    it('should normalize a text message from webhook', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid_abc',
                      from: '8613800138000',
                      type: 'text',
                      text: { body: 'WhatsApp 消息' },
                    },
                  ],
                  contacts: [
                    { profile: { name: '李四' } },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.channelMessageId).toBe('wamid_abc');
      expect(result!.content).toBe('WhatsApp 消息');
      expect(result!.senderId).toBe('8613800138000');
      expect(result!.senderName).toBe('李四');
    });

    it('should normalize an audio message', () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid_voice',
                      from: '1234567',
                      type: 'audio',
                      audio: { id: 'media_123' },
                    },
                  ],
                  contacts: [{ profile: { name: 'User' } }],
                },
              },
            ],
          },
        ],
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('voice');
    });

    it('should return null for empty payload', () => {
      expect(adapter.normalizeInbound({})).toBeNull();
      expect(adapter.normalizeInbound({ entry: [] })).toBeNull();
    });

    it('should fail sendOutbound when no credentials', async () => {
      const result = await adapter.sendOutbound('+1234', { content: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('WHATSAPP');
    });
  });
});
