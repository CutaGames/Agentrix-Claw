/**
 * SocialCallbackController — Agent Social Bridge
 *
 * Receives inbound webhook events from external social platforms
 * (Twitter/X mentions, Telegram messages, Discord messages),
 * persists them to the database, and dispatches to the Agent runtime
 * for auto-reply drafting based on user's reply strategy config.
 *
 * Endpoints:
 *   POST /social/callback/twitter   — Twitter/X webhook (CRC + events)
 *   POST /social/callback/telegram  — Telegram Bot webhook
 *   POST /social/callback/discord   — Discord Bot webhook
 *   GET  /social/callback/status    — Platform connection status
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  Logger,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { TelegramBotService } from '../openclaw-connection/telegram-bot.service';
import { SocialService } from './social.service';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { SocialAccount, SocialAccountType } from '../../entities/social-account.entity';
import { PresenceRouterService } from '../agent-presence/channel/presence-router.service';
import {
  SocialEvent,
  SocialEventPlatform,
  SocialEventType,
  SocialReplyStatus,
  ReplyStrategy,
} from '../../entities/social.entity';

// ── Environment ───────────────────────────────────────────────────────────────

const TWITTER_CONSUMER_SECRET = process.env.TWITTER_APIKEY_SECRET ?? process.env.TWITTER_CONSUMER_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'agentrixnetwork_bot';
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? process.env.DISCORD_CLIENT_SECRET ?? '';
const API_BASE_URL = process.env.BACKEND_URL ?? process.env.APP_URL ?? 'https://api.agentrix.top/api';
const TELEGRAM_WEBHOOK_URL = `${API_BASE_URL}/social/callback/telegram`;

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('social/callback')
export class SocialCallbackController {
  private readonly logger = new Logger(SocialCallbackController.name);

  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly socialService: SocialService,
    @InjectRepository(SocialAccount)
    private readonly socialAccountRepo: Repository<SocialAccount>,
    @InjectRepository(OpenClawInstance)
    private readonly openClawInstanceRepo: Repository<OpenClawInstance>,
    private readonly presenceRouter: PresenceRouterService,
  ) {}

  // ── Dashboard endpoints ───────────────────────────────────────────────────

  /** GET /social/callback/status — platform connection status */
  @Get('status')
  getStatus() {
    return {
      ok: true,
      platforms: {
        telegram: {
          connected: !!TELEGRAM_BOT_TOKEN,
          botUsername: TELEGRAM_BOT_USERNAME,
          webhookUrl: TELEGRAM_WEBHOOK_URL,
        },
        discord: {
          connected: !!DISCORD_PUBLIC_KEY,
          clientId: process.env.DISCORD_CLIENT_ID ?? '',
          interactionsUrl: `${API_BASE_URL}/social/callback/discord`,
        },
        twitter: {
          connected: !!TWITTER_CONSUMER_SECRET,
          webhookUrl: `${API_BASE_URL}/social/callback/twitter`,
        },
      },
    };
  }

  /** GET /social/callback/events — recent social events (public, no auth) */
  @Get('events')
  async getRecentEvents(
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const events = await this.socialService.getRecentEvents(take);
    return { ok: true, events };
  }

  /** POST /social/callback/telegram/setup — registers bot webhook with Telegram API */
  @Post('telegram/setup')
  async setupTelegramWebhook() {
    if (!TELEGRAM_BOT_TOKEN) {
      return { ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
    }
    const webhookUrl = TELEGRAM_WEBHOOK_URL;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message', 'channel_post'],
            ...(TELEGRAM_WEBHOOK_SECRET ? { secret_token: TELEGRAM_WEBHOOK_SECRET } : {}),
          }),
        },
      );
      const json: any = await res.json();
      this.logger.log(`Telegram setWebhook result: ${JSON.stringify(json)}`);
      return { ok: json.ok, description: json.description, webhookUrl };
    } catch (e: any) {
      this.logger.error('Telegram setWebhook failed', e);
      return { ok: false, error: e.message };
    }
  }

  // ── Twitter / X ─────────────────────────────────────────────────────────────

  @Get('twitter')
  twitterCrc(@Query('crc_token') crcToken: string, @Res() res: Response) {
    if (!crcToken) {
      res.status(400).json({ error: 'Missing crc_token' });
      return;
    }
    const hash = crypto
      .createHmac('sha256', TWITTER_CONSUMER_SECRET)
      .update(crcToken)
      .digest('base64');
    res.json({ response_token: `sha256=${hash}` });
  }

  @Post('twitter')
  @HttpCode(200)
  async handleTwitterWebhook(
    @Body() body: any,
    @Headers('x-twitter-webhooks-signature') signature: string,
    @Req() req: Request,
  ) {
    if (TWITTER_CONSUMER_SECRET && signature) {
      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (rawBody) {
        const expected =
          'sha256=' +
          crypto
            .createHmac('sha256', TWITTER_CONSUMER_SECRET)
            .update(rawBody)
            .digest('base64');
        if (expected !== signature) {
          this.logger.warn('Twitter webhook signature mismatch — rejecting');
          return { ok: false };
        }
      }
    }

    const mentions: any[] = body?.tweet_create_events ?? [];
    for (const tweet of mentions) {
      await this.dispatchEvent({
        platform: SocialEventPlatform.TWITTER,
        eventType: SocialEventType.MENTION,
        senderId: tweet.user?.id_str ?? '',
        senderName: tweet.user?.screen_name ?? '',
        text: tweet.text ?? tweet.full_text ?? '',
        rawPayload: tweet,
      });
    }

    const dms: any[] = body?.direct_message_events ?? [];
    for (const dm of dms) {
      if (dm.type !== 'message_create') continue;
      await this.dispatchEvent({
        platform: SocialEventPlatform.TWITTER,
        eventType: SocialEventType.DM,
        senderId: dm.message_create?.sender_id ?? '',
        senderName: '',
        text: dm.message_create?.message_data?.text ?? '',
        rawPayload: dm,
      });
    }

    return { ok: true };
  }

  // ── Telegram ─────────────────────────────────────────────────────────────────

  @Post('telegram')
  @HttpCode(200)
  async handleTelegramWebhook(
    @Body() body: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ) {
    // Verify webhook authenticity via secret token header
    if (TELEGRAM_WEBHOOK_SECRET && secretToken !== TELEGRAM_WEBHOOK_SECRET) {
      this.logger.warn('Telegram webhook secret token mismatch — rejecting');
      return { ok: false };
    }

    const update = body;
    const message = update?.message ?? update?.channel_post ?? null;

    if (message) {
      const chatId = String(message?.chat?.id ?? '');
      const text: string =
        message?.text ?? message?.caption ?? message?.voice?.file_id ??
        message?.audio?.file_id ?? '[non-text message]';
      const senderId = String(message?.from?.id ?? message?.chat?.id ?? '');
      const senderName =
        message?.from?.username ??
        `${message?.from?.first_name ?? ''} ${message?.from?.last_name ?? ''}`.trim();

      // PresenceRouter dispatch is now handled inside dispatchEvent() for all platforms

      const savedEvent = await this.dispatchEvent({
        platform: SocialEventPlatform.TELEGRAM,
        eventType: text.startsWith('/') ? SocialEventType.COMMAND : SocialEventType.MESSAGE,
        senderId,
        senderName,
        text,
        rawPayload: message,
      });

      const isVoiceLike = !!(message?.voice || message?.audio || (message?.document?.mime_type || '').startsWith('audio/'));

      if (!text.startsWith('/') && !isVoiceLike && savedEvent?.userId) {
        await this.applyTelegramReplyPolicy(savedEvent, Number(message?.chat?.id ?? senderId));
        return { ok: true };
      }
    }

    await this.telegramBotService.handleUpdate(update);
    return { ok: true };
  }

  // ── Discord ──────────────────────────────────────────────────────────────────

  @Post('discord')
  @HttpCode(200)
  async handleDiscordWebhook(
    @Body() body: any,
    @Headers('x-signature-ed25519') sigEd25519: string,
    @Headers('x-signature-timestamp') sigTimestamp: string,
    @Req() req: Request,
  ) {
    if (DISCORD_PUBLIC_KEY && sigEd25519 && sigTimestamp) {
      try {
        const rawBody = (req as any).rawBody as Buffer | undefined;
        if (rawBody) {
          const { createVerify } = await import('crypto');
          const verify = createVerify('ed25519');
          verify.update(Buffer.concat([Buffer.from(sigTimestamp), rawBody]));
          const isValid = verify.verify(
            Buffer.from(DISCORD_PUBLIC_KEY, 'hex'),
            Buffer.from(sigEd25519, 'hex'),
          );
          if (!isValid) {
            this.logger.warn('Discord signature invalid');
            return { error: 'Invalid signature' };
          }
        }
      } catch (e) {
        this.logger.error('Discord signature verification failed', e);
      }
    }

    if (body?.type === 1) return { type: 1 };

    if (body?.type === 2) {
      const commandName: string = body?.data?.name ?? '';
      const userId: string = body?.member?.user?.id ?? body?.user?.id ?? '';
      const userName: string = body?.member?.user?.username ?? '';

      await this.dispatchEvent({
        platform: SocialEventPlatform.DISCORD,
        eventType: SocialEventType.COMMAND,
        senderId: userId,
        senderName: userName,
        text: `/${commandName} ${JSON.stringify(body?.data?.options ?? [])}`,
        rawPayload: body,
      });

      return { type: 5 };
    }

    return { ok: true };
  }

  // ── Internal: Event Dispatch (now DB-persisted + Agent routing) ────────────

  private async dispatchEvent(params: {
    platform: SocialEventPlatform;
    eventType: SocialEventType;
    senderId: string;
    senderName?: string;
    text: string;
    rawPayload?: Record<string, any>;
  }): Promise<SocialEvent | null> {
    this.logger.log(
      `[${params.platform}] ${params.eventType} from ${params.senderName}: "${params.text.slice(0, 80)}"`,
    );

    try {
      const userId = await this.resolveUserId(params.platform, params.senderId);

      // 1. Persist to database
      const savedEvent = await this.socialService.createSocialEvent({
        ...params,
        userId,
      });

      if (!userId) {
        this.logger.warn(
          `No Agentrix user mapping found for ${params.platform} sender ${params.senderId}`,
        );
      }

      // 2. Route through PresenceRouter for agent dispatch (all platforms)
      try {
        await this.presenceRouter.routeInbound(
          params.platform,
          params.senderId,
          params.rawPayload,
        );
      } catch (err: any) {
        this.logger.warn(`PresenceRouter ${params.platform} dispatch failed: ${err.message}`);
      }

      this.logger.verbose(`Event persisted: id=${savedEvent.id} platform=${params.platform}`);
      return savedEvent;
    } catch (err) {
      this.logger.error('Failed to dispatch social event', err);
      return null;
    }
  }

  private async applyTelegramReplyPolicy(event: SocialEvent, chatId: number) {
    const config = await this.socialService.getReplyConfig(event.userId!, SocialEventPlatform.TELEGRAM);

    if (!config.enabled || config.strategy === ReplyStrategy.DISABLED) {
      await this.socialService.updateEventReply(event.id, {
        replyStatus: SocialReplyStatus.REJECTED,
        finalReply: 'Telegram auto-reply is disabled for this account.',
      });
      return;
    }

    if (config.strategy === ReplyStrategy.NOTIFY_ONLY) {
      await this.socialService.updateEventReply(event.id, {
        replyStatus: SocialReplyStatus.REJECTED,
        finalReply: 'Notify-only policy: no reply was sent.',
      });
      return;
    }

    const draft = await this.socialService.generateDraftReply({
      userId: event.userId!,
      platform: event.platform,
      senderName: event.senderName,
      text: event.text,
      replyPrompt: config.replyPrompt,
      replyLanguage: config.replyLanguage,
    });

    if (config.strategy === ReplyStrategy.APPROVAL) {
      await this.socialService.updateEventReply(event.id, {
        replyStatus: SocialReplyStatus.PENDING,
        agentDraftReply: draft,
      });
      return;
    }

    try {
      await this.telegramBotService.send(chatId, draft);
      await this.socialService.updateEventReply(event.id, {
        replyStatus: SocialReplyStatus.AUTO_SENT,
        agentDraftReply: draft,
        finalReply: draft,
        repliedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('Telegram auto-send failed', error);
      await this.socialService.updateEventReply(event.id, {
        replyStatus: SocialReplyStatus.FAILED,
        agentDraftReply: draft,
        finalReply: draft,
      });
    }
  }

  private async resolveUserId(
    platform: SocialEventPlatform,
    senderId: string,
  ): Promise<string | undefined> {
    const accountType = this.toSocialAccountType(platform);
    if (accountType) {
      const account = await this.socialAccountRepo.findOne({
        where: { type: accountType, socialId: senderId },
        select: ['id', 'userId'],
      });
      if (account?.userId) {
        return account.userId;
      }
    }

    if (platform === SocialEventPlatform.TELEGRAM) {
      const instance = await this.openClawInstanceRepo.findOne({
        where: { telegramChatId: senderId },
        select: ['id', 'userId'],
      });
      return instance?.userId;
    }

    return undefined;
  }

  private toSocialAccountType(
    platform: SocialEventPlatform,
  ): SocialAccountType | undefined {
    switch (platform) {
      case SocialEventPlatform.TWITTER:
        return SocialAccountType.X;
      case SocialEventPlatform.TELEGRAM:
        return SocialAccountType.TELEGRAM;
      case SocialEventPlatform.DISCORD:
        return SocialAccountType.DISCORD;
      default:
        return undefined;
    }
  }
}
