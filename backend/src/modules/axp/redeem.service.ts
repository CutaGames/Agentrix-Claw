/**
 * AxpRedeemService — mobile-driven AXP reward catalog + redemption.
 *
 * Sprint M-P0-5. Mirrors the fallback catalog in
 * `src/screens/me/AxpRewardShopScreen.tsx` so the UI gets the same
 * shape whether the network call succeeds or falls back.
 *
 * Each redeem call:
 *   1. Validates the item exists + has stock (when stock != null)
 *   2. Spends `axp_cost` AXP via AxpService.spend (server enforces
 *      sufficient balance; throws if not enough)
 *   3. Triggers the side-effect (issue subscription discount voucher,
 *      add quota, queue lottery pull, etc.) — currently we record
 *      an audit row with metadata; downstream systems consume it.
 *   4. Returns a human-readable description for the UI to alert.
 *
 * No new DB tables — we only write to `user_axp_ledger` with
 * source='redeem_skin' or similar AXP_SPEND_SOURCES values, plus
 * metadata.item_id so admins can audit redemptions.
 *
 * In the future we may persist a separate `axp_redemptions` table
 * to track fulfillment status (e.g. NFT preorder waiting for drop);
 * for now the ledger row is sufficient.
 */
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AxpService } from './axp.service';

export interface RedeemItem {
  id: string;
  category: 'subscription' | 'skin' | 'ticket' | 'lottery' | 'quota' | 'boost';
  title_en: string;
  title_zh: string;
  description_en: string;
  description_zh: string;
  axp_cost: number;
  stock: number | null;
  emoji?: string;
  highlight?: boolean;
}

export interface RedeemCatalog {
  items: RedeemItem[];
  updated_at: string;
}

export interface RedeemResult {
  success: boolean;
  item_id: string;
  reward_description: string;
  remaining_balance: number;
  ledger_id: string;
}

/**
 * Catalog source — for now hardcoded to match the mobile fallback. Once
 * we have a CMS / admin UI we'll move this to DB. Stock counters are
 * currently `null` (unlimited) for everything except limited drops; an
 * upcoming feature will pull stock from a redis counter so concurrent
 * redemptions are race-free.
 */
const CATALOG: RedeemItem[] = [
  {
    id: 'sub_discount_5',
    category: 'subscription',
    title_en: '5% Subscription Discount',
    title_zh: '订阅 5% 折扣券',
    description_en: 'Apply to next billing cycle. Stacks up to 20%.',
    description_zh: '下个账单周期生效，最多叠加 20%。',
    axp_cost: 500,
    stock: null,
    emoji: '🎫',
  },
  {
    id: 'sub_discount_10',
    category: 'subscription',
    title_en: '10% Subscription Discount',
    title_zh: '订阅 10% 折扣券',
    description_en: 'Apply to next billing cycle. Stacks up to 20%.',
    description_zh: '下个账单周期生效，最多叠加 20%。',
    axp_cost: 1000,
    stock: null,
    emoji: '🎫',
  },
  {
    id: 'pet_quota_5',
    category: 'quota',
    title_en: '+5 Pet Creations',
    title_zh: '宠物创作 +5 次',
    description_en: 'Add 5 extra PetCreator generations this month.',
    description_zh: '本月额外 5 次 PetCreator 生成配额。',
    axp_cost: 300,
    stock: null,
    emoji: '✨',
  },
  {
    id: 'marketplace_pin_24h',
    category: 'boost',
    title_en: 'Marketplace Pin 24h',
    title_zh: '集市卡片置顶 24h',
    description_en: 'Pin your listing to the top of Plaza for 24 hours.',
    description_zh: '你的挂牌在集市顶部展示 24 小时。',
    axp_cost: 200,
    stock: null,
    emoji: '📌',
  },
  {
    id: 'lottery_pull',
    category: 'lottery',
    title_en: 'Lucky Draw (1 pull)',
    title_zh: '幸运抽奖（1 次）',
    description_en: 'Win limited skins, AXP bonus, or rare items.',
    description_zh: '有机会赢限定皮肤、AXP 奖励或稀有道具。',
    axp_cost: 100,
    stock: null,
    emoji: '🎰',
    highlight: true,
  },
  {
    id: 'limited_skin_cyber_cat',
    category: 'skin',
    title_en: 'Limited: Cyber Cat Skin',
    title_zh: '限定：赛博猫皮肤',
    description_en: 'Exclusive skin. Only 50 available this month.',
    description_zh: '独家限定皮肤，本月仅 50 份。',
    axp_cost: 2000,
    stock: 50,
    emoji: '🐱',
    highlight: true,
  },
  {
    id: 'a2a_priority',
    category: 'boost',
    title_en: 'A2A Priority Match (7 days)',
    title_zh: 'A2A 优先匹配（7 天）',
    description_en: 'Your pet gets priority in task matching for 7 days.',
    description_zh: '主宠在任务匹配中获得 7 天优先权。',
    axp_cost: 500,
    stock: null,
    emoji: '⚡',
  },
  {
    id: 'nft_preorder',
    category: 'ticket',
    title_en: 'NFT Preorder Ticket',
    title_zh: 'NFT 预售资格',
    description_en: 'Reserve a spot for the next NFT drop.',
    description_zh: '预留下一次 NFT 发售的名额。',
    axp_cost: 2000,
    stock: 20,
    emoji: '🎟️',
  },
];

@Injectable()
export class AxpRedeemService {
  private readonly catalog: RedeemItem[];

  constructor(private readonly axp: AxpService) {
    // Clone the seed so per-instance stock decrements don't leak across
    // app reloads / test instances. Production: replace with redis or DB
    // counters before stock-limited drops go live to a wide audience.
    this.catalog = CATALOG.map((it) => ({ ...it }));
  }

  /** GET /v1/axp/redeem/catalog */
  async getCatalog(): Promise<RedeemCatalog> {
    return {
      items: this.catalog.map((it) => ({ ...it })),
      updated_at: new Date().toISOString(),
    };
  }

  /** POST /v1/axp/redeem  body: { item_id, ref_id? } */
  async redeem(userId: string, itemId: string, idempotencyKey?: string): Promise<RedeemResult> {
    if (!itemId || typeof itemId !== 'string') {
      throw new BadRequestException('item_id is required');
    }
    const item = this.catalog.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`Unknown redeem item: ${itemId}`);
    }
    if (item.stock !== null && item.stock <= 0) {
      throw new BadRequestException(`${item.title_en} is sold out`);
    }

    // Decide which AXP_SPEND_SOURCES bucket to attribute this to.
    // The ledger source enum is constrained, so we map redeem categories
    // to an existing accepted source.
    const sourceMap: Record<RedeemItem['category'], string> = {
      subscription: 'sub_discount',
      skin: 'redeem_skin',
      ticket: 'lottery_pull',
      lottery: 'lottery_pull',
      quota: 'create_pet_slot',
      boost: 'card_pin',
    };
    const source = sourceMap[item.category];

    // refId 语义：兑换默认每次独立可重复（唯一 refId），不被 IDEMPOTENT_SPEND_SOURCES
    // 误判为重复扣减；若调用方显式提供 idempotencyKey（业务订单号），则按该键精确一次
    // （重复提交不双扣 — Pet Earning Flywheel 需求 5.2）。
    const refId = idempotencyKey && idempotencyKey.trim()
      ? idempotencyKey.trim()
      : `${item.id}:${randomUUID()}`;

    const spendResult = await this.axp.spend({
      userId,
      source,
      amount: item.axp_cost,
      refId,
      note: `Redeem: ${item.title_en}`,
      metadata: {
        item_id: item.id,
        category: item.category,
        title_en: item.title_en,
        title_zh: item.title_zh,
      },
    });

    // Stock decrement is in-memory for now — a real impl would write
    // to a redis counter or DB column with row-locking.
    if (item.stock !== null) {
      item.stock -= 1;
    }

    return {
      success: true,
      item_id: item.id,
      reward_description: `${item.title_en} — ${item.description_en}`,
      remaining_balance: spendResult.balance,
      ledger_id: spendResult.ledger_id,
    };
  }
}
