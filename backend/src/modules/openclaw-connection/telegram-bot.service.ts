import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { VoiceService } from '../voice/voice.service';
import { ClaudeIntegrationService } from '../ai-integration/claude/claude-integration.service';

interface TelegramFileRef {
  file_id: string;
  mime_type?: string;
  file_name?: string;
  duration?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; first_name?: string; username?: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    caption?: string;
    voice?: TelegramFileRef;
    audio?: TelegramFileRef;
    document?: TelegramFileRef;
    date: number;
  };
}

/**
 * Handles inbound Telegram Bot webhooks.
 *
 * Flow:
 *  1. User clicks "Connect Telegram" in the APP
 *  2. Backend generates a deep-link: https://t.me/<BOT_NAME>?start=<relayToken>
 *  3. APP shows this as a QR code
 *  4. User scans → Telegram opens → Bot receives /start <relayToken>
 *  5. This service resolves the token → binds telegramChatId → replies with welcome
 *  6. All subsequent messages from that chat are proxied to the instance's AI engine
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  private readonly botName = process.env.TELEGRAM_BOT_NAME || 'ClawLinkBot';
  private readonly apiBase: string;

  constructor(
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
    private readonly voiceService: VoiceService,
    private readonly claudeIntegrationService: ClaudeIntegrationService,
  ) {
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  /** Called by controller for every Telegram webhook POST */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (text) {
      if (text.startsWith('/start ')) {
        await this.handleBindCommand(chatId, text.slice(7).trim(), msg.chat.first_name);
        return;
      }
      if (text === '/start') {
        await this.send(chatId,
          `👋 Welcome to ClawLink!\n\nTo connect your AI agent, open the ClawLink app → Agent tab → Connect Social.`
        );
        return;
      }
      if (text === '/status') {
        await this.handleStatusCommand(chatId);
        return;
      }
      if (text === '/help') {
        await this.send(chatId, HELP_TEXT);
        return;
      }

      // Forward message to AI engine
      await this.forwardToAgent(chatId, text);
      return;
    }

    const audioRef = this.getAudioRef(msg);
    if (audioRef) {
      await this.handleVoiceMessage(chatId, msg, audioRef);
      return;
    }

    await this.send(chatId, '⚠️ Unsupported message type. Please send text or a voice note.');
  }

  private async handleBindCommand(chatId: number, token: string, firstName?: string): Promise<void> {
    if (!token) {
      await this.send(chatId, '❌ Invalid link. Please generate a new QR code from the ClawLink app.');
      return;
    }

    const instance = await this.instanceRepo.findOneBy({ relayToken: token });
    if (!instance) {
      await this.send(chatId, '❌ This link has expired or is invalid. Please generate a new one from the app.');
      return;
    }

    if (instance.telegramChatId) {
      await this.send(chatId, '✅ Telegram is already connected to this agent.');
      return;
    }

    // Bind chat
    await this.instanceRepo.update(instance.id, {
      telegramChatId: String(chatId),
    });

    const name = firstName ? firstName : 'there';
    await this.send(chatId,
      `🎉 Connected! Hi ${name}, your AI agent *${instance.name}* is now linked to this chat.\n\n` +
      `Send a text or voice note to talk to your agent.\n\n` +
      `Type /help for commands.`,
      { parse_mode: 'Markdown' }
    );

    this.logger.log(`Telegram chat ${chatId} bound to instance ${instance.id}`);
  }

  private async handleStatusCommand(chatId: number): Promise<void> {
    const instance = await this.instanceRepo.findOneBy({ telegramChatId: String(chatId) });
    if (!instance) {
      await this.send(chatId, '❌ No agent linked. Scan a QR code from the ClawLink app to connect.');
      return;
    }
    const status = instance.relayConnected ? '🟢 Online' : '🔴 Offline';
    const mode = instance.instanceType === 'local' ? '💻 Local' : '☁️ Cloud';
    await this.send(chatId,
      `*${instance.name}*\nStatus: ${status}\nMode: ${mode}\nType: ${instance.instanceType}`,
      { parse_mode: 'Markdown' }
    );
  }

  private getAudioRef(msg: TelegramUpdate['message']): TelegramFileRef | null {
    if (!msg) return null;
    if (msg.voice?.file_id) return msg.voice;
    if (msg.audio?.file_id) return msg.audio;
    if (msg.document?.file_id && msg.document?.mime_type?.startsWith('audio/')) return msg.document;
    return null;
  }

  private async handleVoiceMessage(
    chatId: number,
    msg: NonNullable<TelegramUpdate['message']>,
    audioRef: TelegramFileRef,
  ): Promise<void> {
    await this.sendChatAction(chatId, 'typing');

    try {
      const file = await this.downloadTelegramAudio(audioRef.file_id);
      const originalName = audioRef.file_name || this.inferTelegramFileName(file.filePath, audioRef.mime_type);
      const transcript = await this.voiceService.transcribe(
        file.buffer,
        audioRef.mime_type || this.guessMimeType(originalName),
        originalName,
      );
      const spokenText = transcript?.transcript?.trim();

      if (!spokenText) {
        await this.send(chatId, '⚠️ I could not transcribe that voice message. Please try again or send text.');
        return;
      }

      await this.forwardToAgent(chatId, spokenText);
    } catch (err: any) {
      this.logger.error(`Telegram voice handling failed: ${err.message}`);
      await this.send(
        chatId,
        `⚠️ Voice message processing failed. ${err?.message?.includes('not configured') ? 'Voice transcription is not configured on the server yet.' : 'Please try again or send text.'}`,
      );
    }
  }

  private async forwardToAgent(chatId: number, userText: string): Promise<void> {
    const instance = await this.instanceRepo.findOneBy({ telegramChatId: String(chatId) });
    if (!instance) {
      await this.send(chatId,
        `👋 No agent linked yet. Open the ClawLink app and scan the QR code to connect.`
      );
      return;
    }

    // Show typing indicator
    await this.sendChatAction(chatId, 'typing');

    try {
      let reply: string;

      if (instance.instanceType === 'local') {
        // Relay to local agent via in-memory relay registry
        reply = await RelayRegistry.sendAndAwait(instance.id, userText, chatId);
      } else if (!instance.instanceUrl || (instance.capabilities as any)?.platformHosted) {
        // Platform-hosted cloud instance (no external URL) — route through built-in AI
        reply = await this.buildFallbackReply(instance, userText);
      } else {
        // Self-hosted cloud or external URL instance
        reply = await this.callCloudAgent(instance, userText);
      }

      if (this.isProviderAuthFailure(reply)) {
        this.logger.warn(`Agent ${instance.id} returned provider auth failure, using fallback assistant reply for Telegram.`);
        reply = await this.buildFallbackReply(instance, userText);
      }

      await this.send(chatId, reply);
    } catch (err: any) {
      this.logger.error(`Agent forward error: ${err.message}`);
      await this.send(chatId, `⚠️ Your agent didn't respond. It may be offline. Try again or check the app.`);
    }
  }

  private async callCloudAgent(instance: OpenClawInstance, message: string): Promise<string> {
    if (!instance.instanceUrl) return '⚠️ Agent URL not configured.';
    const resp = await fetch(`${instance.instanceUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(instance.instanceToken ? { Authorization: `Bearer ${instance.instanceToken}` } : {}),
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) throw new Error(`Instance returned ${resp.status}`);
    const data: any = await resp.json();
    return data?.reply?.content || data?.content || data?.message || '(no response)';
  }

  private isProviderAuthFailure(reply: string): boolean {
    const text = reply || '';
    return /No API key found for provider/i.test(text) || /auth-profiles\.json/i.test(text);
  }

  private async buildFallbackReply(instance: OpenClawInstance, userText: string): Promise<string> {
    try {
      const systemPrompt = [
        `You are ${instance.name}, an Agentrix assistant responding inside Telegram.`,
        instance.personality ? `Personality hint: ${instance.personality}.` : '',
        'Keep replies concise and helpful.',
        'Do not mention auth files, provider configuration, or infrastructure errors.',
        'If a request truly needs unavailable tools, explain the limitation simply and suggest the next step.',
      ].filter(Boolean).join(' ');

      const result = await this.claudeIntegrationService.chatWithFunctions(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
        {
          enableModelRouting: true,
          context: { userId: instance.userId, sessionId: `telegram-${instance.id}` },
        },
      );

      const text = result?.text?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      this.logger.error(`Telegram fallback reply failed: ${err.message}`);
    }

    return '⚠️ Your agent still needs model authorization in the app before it can use that configured provider. Please reconnect the agent or add the required credentials, then try again.';
  }

  /** Generate a Telegram deep-link for the given relay token */
  getDeepLink(relayToken: string): string {
    return `https://t.me/${this.botName}?start=${relayToken}`;
  }

  async send(chatId: number, text: string, extra?: Record<string, any>): Promise<void> {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — skipping send');
      return;
    }
    await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
  }

  private async getTelegramFilePath(fileId: string): Promise<string> {
    const resp = await fetch(`${this.apiBase}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!resp.ok) {
      throw new Error(`Telegram getFile failed with ${resp.status}`);
    }

    const data: any = await resp.json();
    const filePath = data?.result?.file_path;
    if (!filePath) {
      throw new Error('Telegram file path missing');
    }
    return filePath;
  }

  private async downloadTelegramAudio(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
    if (!this.botToken) {
      throw new Error('Telegram bot token is not configured');
    }

    const filePath = await this.getTelegramFilePath(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const resp = await fetch(fileUrl);

    if (!resp.ok) {
      throw new Error(`Telegram file download failed with ${resp.status}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), filePath };
  }

  private inferTelegramFileName(filePath: string, mimeType?: string): string {
    const fileName = filePath.split('/').pop();
    if (fileName) return fileName;
    const ext = mimeType?.split('/')[1] || 'ogg';
    return `telegram-audio.${ext}`;
  }

  private guessMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'ogg' || ext === 'oga') return 'audio/ogg';
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'm4a') return 'audio/m4a';
    return 'audio/ogg';
  }

  private async sendChatAction(chatId: number, action: string): Promise<void> {
    if (!this.botToken) return;
    await fetch(`${this.apiBase}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    }).catch(() => null);
  }
}

const HELP_TEXT = `
*ClawLink AI Agent Commands*

Send any text or voice note — the AI will respond.

/status  — Show agent connection status
/help    — Show this help

To manage your agent, open the ClawLink app.
`.trim();

/**
 * In-memory relay registry — maps instanceId → pending resolve callbacks.
 * The LocalRelayGateway pushes agent replies here.
 * In production, replace with Redis pub/sub for multi-node deployment.
 */
export class RelayRegistry {
  private static pending = new Map<
    string,
    { resolve: (reply: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  /** Telegram side: send a message and wait for the local agent to reply */
  static sendAndAwait(instanceId: string, message: string, chatId: number, timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const key = `${instanceId}:${Date.now()}`;
      const timer = setTimeout(() => {
        RelayRegistry.pending.delete(key);
        reject(new Error('Local agent timed out'));
      }, timeoutMs);

      RelayRegistry.pending.set(key, { resolve, reject, timer });

      // Emit to local agent socket — LocalRelayGateway.emit() is called by the gateway
      RelayRegistry.emitToAgent(instanceId, { key, message, chatId });
    });
  }

  /** Local agent replies back — called by LocalRelayGateway */
  static resolveReply(key: string, reply: string): void {
    const pending = RelayRegistry.pending.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      RelayRegistry.pending.delete(key);
      pending.resolve(reply);
    }
  }

  // Overwritten by LocalRelayGateway on startup
  static emitToAgent: (instanceId: string, payload: object) => void = () => {};
}
