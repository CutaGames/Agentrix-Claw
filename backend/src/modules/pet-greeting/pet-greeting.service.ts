import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { PetGreetingCard } from '../../entities/pet-greeting-card.entity';
import { AxpService } from '../axp/axp.service';
import { AXP_AMOUNTS } from '../axp/axp.constants';
import { GREETING_TEMPLATES, findTemplate } from './pet-greeting.constants';

export interface SendCardInput {
  senderId: string;
  sender_pet_id: string;
  receiver_id?: string;
  receiver_hint?: string;
  template: string;
  message?: string;
}

/**
 * Greeting Card service — per docs §6.2.
 *
 * Send flow:
 *   1. Validate template
 *   2. If premium → spend AXP (transaction with AxpService)
 *   3. Persist card row with a public token
 *   4. Return share URL (universal link form)
 *
 * Open/redeem flow:
 *   - Authenticated receiver taps universal link → redeem()
 *   - Award AXP to receiver (once, idempotent)
 */
@Injectable()
export class PetGreetingService {
  private readonly logger = new Logger(PetGreetingService.name);

  constructor(
    @InjectRepository(PetGreetingCard)
    private readonly cards: Repository<PetGreetingCard>,
    private readonly axp: AxpService,
  ) {}

  catalog() {
    return { templates: GREETING_TEMPLATES };
  }

  async send(input: SendCardInput) {
    const tpl = findTemplate(input.template);
    if (!tpl) throw new BadRequestException(`unknown template: ${input.template}`);
    if (input.message && input.message.length > 500) {
      throw new BadRequestException('message too long (max 500)');
    }
    if (tpl.premium && tpl.axp_cost > 0) {
      await this.axp.spend({
        userId: input.senderId,
        source: 'greeting_template_premium',
        amount: tpl.axp_cost,
        note: `Send premium greeting card: ${tpl.key}`,
      });
    }
    const token = this.generateToken();
    const row = this.cards.create({
      senderId: input.senderId,
      senderPetId: input.sender_pet_id,
      receiverId: input.receiver_id ?? null,
      receiverHint: input.receiver_hint ?? null,
      token,
      template: input.template,
      message: input.message ?? null,
      axpCost: tpl.axp_cost,
      axpReward: AXP_AMOUNTS.greeting_received,
      status: 'sent',
      metadata: {},
    });
    await this.cards.save(row);

    // Small AXP reward to sender for each send (daily cap enforced by AXP service).
    try {
      await this.axp.earn({
        userId: input.senderId,
        source: 'greeting_sent',
        amount: AXP_AMOUNTS.greeting_sent,
        refId: row.id,
        note: `Sent greeting card (${tpl.key})`,
      });
    } catch (e) {
      // Hit daily cap — not fatal. Log and continue.
      this.logger.debug(`greeting_sent earn skipped: ${(e as Error).message}`);
    }

    return this.view(row);
  }

  async inbox(receiverId: string, limit = 20) {
    const rows = await this.cards.find({
      where: { receiverId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
    return { items: rows.map((r) => this.view(r)) };
  }

  async outbox(senderId: string, limit = 20) {
    const rows = await this.cards.find({
      where: { senderId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
    return { items: rows.map((r) => this.view(r)) };
  }

  async peek(token: string) {
    const row = await this.cards.findOne({ where: { token } });
    if (!row) throw new NotFoundException('card not found');
    return this.view(row);
  }

  /**
   * Opened: receiver (any user) viewed the card. Different from redeem —
   * open is passive, redeem awards AXP and requires the receiver to be
   * signed in.
   */
  async markOpened(token: string, receiverId?: string) {
    const row = await this.cards.findOne({ where: { token } });
    if (!row) throw new NotFoundException('card not found');
    if (row.openedAt) return this.view(row);
    await this.cards.update(
      { id: row.id },
      {
        openedAt: new Date(),
        status: row.status === 'sent' ? 'opened' : row.status,
        receiverId: row.receiverId ?? receiverId ?? null,
      },
    );
    return this.view({ ...row, openedAt: new Date(), status: 'opened' } as any);
  }

  async redeem(token: string, receiverId: string) {
    const row = await this.cards.findOne({ where: { token } });
    if (!row) throw new NotFoundException('card not found');
    if (row.senderId === receiverId) {
      throw new BadRequestException('cannot redeem your own card');
    }
    if (row.redeemedAt) {
      return { already: true, axp_awarded: 0 };
    }
    // Lock the row to receiver on first redeem
    await this.cards.update(
      { id: row.id },
      {
        receiverId: row.receiverId ?? receiverId,
        redeemedAt: new Date(),
        status: 'redeemed',
      },
    );
    try {
      await this.axp.earn({
        userId: receiverId,
        source: 'greeting_received',
        amount: row.axpReward,
        refId: row.id,
        note: `Opened greeting card from ${row.senderId}`,
      });
    } catch (e) {
      // Daily cap hit — still mark redeemed so UI won't re-prompt.
      this.logger.debug(`greeting_received earn skipped: ${(e as Error).message}`);
      return { already: false, axp_awarded: 0 };
    }
    return { already: false, axp_awarded: row.axpReward };
  }

  // ── Helpers ────────────────────────────────────────────────

  private view(row: PetGreetingCard) {
    return {
      id: row.id,
      sender_id: row.senderId,
      sender_pet_id: row.senderPetId,
      receiver_id: row.receiverId,
      receiver_hint: row.receiverHint,
      token: row.token,
      template: row.template,
      message: row.message,
      axp_cost: row.axpCost,
      axp_reward: row.axpReward,
      status: row.status,
      opened_at: row.openedAt?.getTime() ?? null,
      redeemed_at: row.redeemedAt?.getTime() ?? null,
      reply_card_id: row.replyCardId,
      created_at: row.createdAt.getTime(),
      share_url: `https://agentrix.top/plaza/greeting/${row.token}`,
    };
  }

  private generateToken(): string {
    return randomBytes(14).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 22);
  }
}
