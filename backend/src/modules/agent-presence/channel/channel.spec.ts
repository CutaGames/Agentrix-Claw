import { TelegramAdapter } from './telegram.adapter';
import { DiscordAdapter } from './discord.adapter';
import { TwitterAdapter } from './twitter.adapter';
import { ChannelRegistry } from './channel-registry';

describe('ChannelAdapter Layer', () => {
  // ── TelegramAdapter ─────────────────────────────────────────────────────

  describe('TelegramAdapter', () => {
    let adapter: TelegramAdapter;

    beforeEach(() => {
      adapter = new TelegramAdapter();
    });

    it('should have platform = telegram', () => {
      expect(adapter.platform).toBe('telegram');
    });

    it('should normalize a text message', () => {
      const payload = {
        message: {
          message_id: 42,
          chat: { id: 123456, type: 'private' },
          from: { id: 789, first_name: 'Alice', username: 'alice' },
          text: 'Hello agent!',
          date: 1700000000,
        },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.content).toBe('Hello agent!');
      expect(result!.senderId).toBe('789');
      expect(result!.senderName).toBe('alice');
      expect(result!.contentType).toBe('text');
      expect(result!.channelMessageId).toBe('42');
    });

    it('should normalize a voice message', () => {
      const payload = {
        message: {
          message_id: 43,
          chat: { id: 123456, type: 'private' },
          from: { id: 789, first_name: 'Alice' },
          voice: { file_id: 'voice_file_abc', duration: 5 },
          date: 1700000000,
        },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('voice');
      expect(result!.content).toBe('voice_file_abc');
    });

    it('should return null for /start command', () => {
      const payload = {
        message: {
          message_id: 1,
          chat: { id: 123456 },
          from: { id: 789 },
          text: '/start',
        },
      };
      expect(adapter.normalizeInbound(payload)).toBeNull();
    });

    it('should return null for /start <token> bind command', () => {
      const payload = {
        message: {
          message_id: 1,
          chat: { id: 123456 },
          from: { id: 789 },
          text: '/start some_relay_token',
        },
      };
      expect(adapter.normalizeInbound(payload)).toBeNull();
    });

    it('should return null for /help command', () => {
      const payload = {
        message: {
          message_id: 1,
          chat: { id: 123456 },
          from: { id: 789 },
          text: '/help',
        },
      };
      expect(adapter.normalizeInbound(payload)).toBeNull();
    });

    it('should return null for empty payload', () => {
      expect(adapter.normalizeInbound({})).toBeNull();
      expect(adapter.normalizeInbound(null)).toBeNull();
    });
  });

  // ── DiscordAdapter ──────────────────────────────────────────────────────

  describe('DiscordAdapter', () => {
    let adapter: DiscordAdapter;

    beforeEach(() => {
      adapter = new DiscordAdapter();
    });

    it('should have platform = discord', () => {
      expect(adapter.platform).toBe('discord');
    });

    it('should normalize a slash command interaction (type 2)', () => {
      const payload = {
        type: 2,
        id: 'interaction_123',
        data: { name: 'ask', options: [{ name: 'query', value: 'test' }] },
        member: { user: { id: 'user_456', username: 'bob' } },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.senderId).toBe('user_456');
      expect(result!.senderName).toBe('bob');
      expect(result!.content).toContain('/ask');
    });

    it('should normalize a regular message', () => {
      const payload = {
        id: 'msg_789',
        content: 'Hey there!',
        author: { id: 'user_456', username: 'bob' },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.content).toBe('Hey there!');
      expect(result!.senderId).toBe('user_456');
    });

    it('should return null for ping (type 1)', () => {
      expect(adapter.normalizeInbound({ type: 1 })).toBeNull();
    });
  });

  // ── TwitterAdapter ──────────────────────────────────────────────────────

  describe('TwitterAdapter', () => {
    let adapter: TwitterAdapter;

    beforeEach(() => {
      adapter = new TwitterAdapter();
    });

    it('should have platform = twitter', () => {
      expect(adapter.platform).toBe('twitter');
    });

    it('should normalize a tweet mention', () => {
      const payload = {
        id_str: 'tweet_123',
        user: { id_str: 'user_abc', screen_name: 'alice_tw' },
        text: '@agentrix how does this work?',
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.senderId).toBe('user_abc');
      expect(result!.senderName).toBe('alice_tw');
      expect(result!.content).toContain('how does this work?');
    });

    it('should normalize a DM', () => {
      const payload = {
        type: 'message_create',
        id: 'dm_456',
        message_create: {
          sender_id: 'sender_789',
          message_data: { text: 'Private question' },
        },
      };

      const result = adapter.normalizeInbound(payload);
      expect(result).not.toBeNull();
      expect(result!.senderId).toBe('sender_789');
      expect(result!.content).toBe('Private question');
    });

    it('should return null for empty payload', () => {
      expect(adapter.normalizeInbound({})).toBeNull();
    });
  });

  // ── ChannelRegistry ─────────────────────────────────────────────────────

  describe('ChannelRegistry', () => {
    let registry: ChannelRegistry;

    beforeEach(() => {
      registry = new ChannelRegistry();
    });

    it('should register and retrieve adapters', () => {
      const telegram = new TelegramAdapter();
      const discord = new DiscordAdapter();

      registry.register(telegram);
      registry.register(discord);

      expect(registry.has('telegram')).toBe(true);
      expect(registry.has('discord')).toBe(true);
      expect(registry.has('slack')).toBe(false);

      expect(registry.get('telegram')).toBe(telegram);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should return undefined for unregistered platform', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });
});
