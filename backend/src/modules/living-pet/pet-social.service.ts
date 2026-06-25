import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { LivingPetService } from './living-pet.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';
import { PetEnergyService } from '../pet-energy/pet-energy.service';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';

/** Mirror of shared/types/pet-presence.ts PET_PRESENCE_TOPICS.SOCIAL_VISIT.
 *  Backend tsconfig rootDir excludes ../shared, so we keep a string mirror;
 *  the SSoT lives in shared/types/pet-presence.ts. */
const PRESENCE_PET_SOCIAL_VISIT = 'presence:pet.social.visit' as const;

/**
 * P2-6 远程社交动作 — visit / touch / feed / co_play
 *
 * 设计原则：
 *   - 无新表：本轮不引入数据库迁移；记录写到 in-memory 短期 ledger，
 *     供 controller 列出最近 50 条访问（用于公开页 + QA 排障）。
 *   - 真实副作用：feed 触发能量增益（+5）；co_play 增益（+3）；
 *     touch / visit 仅广播事件不消耗经济资源。
 *   - 反作弊：每 (visitor, owner, action) 60 秒去重；匿名访客需自我声明
 *     visitorUserId，由 controller 从 JWT 注入。
 *   - 跨端：通过 emitDesktopSyncEvent 广播 presence:pet.social.visit
 *     给 ownerUserId 的所有终端。
 */
export type PetSocialAction = 'visit' | 'touch' | 'feed' | 'co_play';

export interface PetSocialEntry {
  id: string;
  pet_id: string;
  owner_user_id: string;
  visitor_user_id: string;
  visitor_display_name: string | null;
  action: PetSocialAction;
  energy_delta: number;
  message: string | null;
  created_at: number;
}

const RATE_LIMIT_MS = 60_000;
const FEED_ENERGY = 5;
const CO_PLAY_ENERGY = 3;
const LEDGER_MAX = 200;
const PUBLIC_LIST_LIMIT = 50;

@Injectable()
export class PetSocialService {
  private readonly logger = new Logger(PetSocialService.name);
  private readonly ledger: PetSocialEntry[] = [];
  /** key = `${visitor}:${owner}:${action}` → last sent ms */
  private readonly rate = new Map<string, number>();

  constructor(
    private readonly petService: LivingPetService,
    private readonly skinService: PetSkinService,
    private readonly energyService: PetEnergyService,
  ) {}

  async perform(input: {
    petId: string;
    visitorUserId: string;
    visitorDisplayName?: string | null;
    action: PetSocialAction;
    message?: string | null;
  }): Promise<PetSocialEntry> {
    const card = await this.petService.findPublicCard(input.petId);
    if (!card) throw new NotFoundException({ code: 'pet_not_found' });
    const ownerUserId = card.user_id;
    if (ownerUserId === input.visitorUserId) {
      throw new BadRequestException({ code: 'self_action_forbidden', message: 'cannot perform social action on own pet' });
    }
    const key = `${input.visitorUserId}:${ownerUserId}:${input.action}`;
    const last = this.rate.get(key) ?? 0;
    const now = Date.now();
    if (now - last < RATE_LIMIT_MS) {
      throw new BadRequestException({
        code: 'rate_limited',
        message: 'social action rate-limited',
        retry_after_ms: RATE_LIMIT_MS - (now - last),
      });
    }
    this.rate.set(key, now);

    let energyDelta = 0;
    if (input.action === 'feed' || input.action === 'co_play') {
      try {
        const active = await this.skinService.getActive(ownerUserId);
        if (active?.activeSkinId) {
          const amount = input.action === 'feed' ? FEED_ENERGY : CO_PLAY_ENERGY;
          await this.energyService.credit(ownerUserId, active.activeSkinId, amount, {
            reason: `social.${input.action}.from.${input.visitorUserId}`,
          });
          energyDelta = amount;
        }
      } catch (e) {
        this.logger.warn(`social energy credit failed: ${(e as Error).message}`);
      }
    }

    const entry: PetSocialEntry = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      pet_id: input.petId,
      owner_user_id: ownerUserId,
      visitor_user_id: input.visitorUserId,
      visitor_display_name: input.visitorDisplayName ?? null,
      action: input.action,
      energy_delta: energyDelta,
      message: (input.message ?? '').slice(0, 80) || null,
      created_at: now,
    };
    this.ledger.unshift(entry);
    if (this.ledger.length > LEDGER_MAX) this.ledger.length = LEDGER_MAX;

    try {
      emitDesktopSyncEvent(ownerUserId, PRESENCE_PET_SOCIAL_VISIT, {
        pet_id: entry.pet_id,
        owner_user_id: entry.owner_user_id,
        visitor_user_id: entry.visitor_user_id,
        visitor_display_name: entry.visitor_display_name,
        action: entry.action,
        energy_delta: entry.energy_delta,
        message: entry.message,
        created_at: entry.created_at,
      });
    } catch (e) {
      this.logger.warn(`social broadcast failed: ${(e as Error).message}`);
    }
    return entry;
  }

  /** 查询某宠物最近 N 条社交记录（公开） */
  listForPet(petId: string, limit = PUBLIC_LIST_LIMIT): PetSocialEntry[] {
    return this.ledger.filter((e) => e.pet_id === petId).slice(0, Math.max(1, Math.min(limit, PUBLIC_LIST_LIMIT)));
  }

  /** 测试用：清空 ledger */
  _resetForTest() {
    this.ledger.length = 0;
    this.rate.clear();
  }
}
