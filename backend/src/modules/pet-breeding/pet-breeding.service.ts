import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetBreedingEgg } from '../../entities/pet-breeding-egg.entity';
import { RemixBreedingService } from '../marketplace-pet/remix-breeding.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';

const HATCH_DURATION_MS = 5 * 24 * 60 * 60 * 1000; // 5 天

/**
 * Pet Phase 6 P0-5 — 繁育资源闭环 v1。
 *
 * 双方邀请时各记一笔 BREEDING_COST_CREDITS 成本（现阶段为 audit-only，
 * 以免在没有代币账本的情况下强路出错）。未来接代币账本后，只
 * 需在 charge() 里补上真实扣费；metadata.cost_charged 为凭证。
 */
const BREEDING_COST_CREDITS = 200;

type BreedingTimelineEntry = {
  status: string;
  at: number;
  by: string;
  cost_credits?: number;
  charged?: boolean;
  reason?: string;
};

@Injectable()
export class PetBreedingService {
  private readonly logger = new Logger(PetBreedingService.name);

  constructor(
    @InjectRepository(PetBreedingEgg)
    private readonly eggRepo: Repository<PetBreedingEgg>,
    private readonly remixService: RemixBreedingService,
    private readonly skinService: PetSkinService,
  ) {}

  /** 发起繁育邀请（双方必须各自拥有传入的 petSkinId）。 */
  async invite(input: {
    initiatorUserId: string;
    partnerUserId: string;
    initiatorPetSkinId: string;
    partnerPetSkinId: string;
  }): Promise<PetBreedingEgg> {
    if (input.initiatorUserId === input.partnerUserId) {
      throw new BadRequestException('cannot breed with yourself');
    }
    const a = await this.skinService.findById(input.initiatorPetSkinId);
    const b = await this.skinService.findById(input.partnerPetSkinId);
    if (!a || !b) throw new NotFoundException('skin not found');
    if (a.ownerUserId !== input.initiatorUserId) {
      throw new ForbiddenException('initiator does not own initiatorPetSkinId');
    }
    if (b.ownerUserId !== input.partnerUserId) {
      throw new ForbiddenException('partner does not own partnerPetSkinId');
    }
    const egg = await this.eggRepo.save(
      this.eggRepo.create({
        initiatorUserId: input.initiatorUserId,
        partnerUserId: input.partnerUserId,
        initiatorPetSkinId: input.initiatorPetSkinId,
        partnerPetSkinId: input.partnerPetSkinId,
        status: 'invited',
        metadata: {
          cost_credits_per_side: BREEDING_COST_CREDITS,
          // P0-5: audit-only ledger; flips to true when a real credit ledger lands.
          cost_charged: false,
          timeline: [
            this.timelineEntry('invited', input.initiatorUserId, {
              cost_credits: BREEDING_COST_CREDITS,
              charged: false,
              reason: 'invite',
            }),
          ] satisfies BreedingTimelineEntry[],
        },
      }),
    );
    try {
      emitDesktopSyncEvent(input.partnerUserId, 'presence:pet.breeding.invited', {
        egg_id: egg.id,
        initiator_user_id: input.initiatorUserId,
      });
    } catch {}
    return egg;
  }

  /** 伙伴接受 → 启动 5 天孵化。 */
  async accept(eggId: string, partnerUserId: string): Promise<PetBreedingEgg> {
    const egg = await this.eggRepo.findOne({ where: { id: eggId } });
    if (!egg) throw new NotFoundException('egg not found');
    if (egg.partnerUserId !== partnerUserId) throw new ForbiddenException('not your invite');
    if (egg.status !== 'invited') throw new BadRequestException(`status=${egg.status}`);
    egg.status = 'hatching';
    egg.hatchAt = String(Date.now() + HATCH_DURATION_MS);
    this.appendTimeline(egg, 'hatching', partnerUserId, {
      cost_credits: BREEDING_COST_CREDITS,
      charged: false,
      reason: 'partner_accept',
    });
    const saved = await this.eggRepo.save(egg);
    [egg.initiatorUserId, egg.partnerUserId].forEach((uid) => {
      try {
        emitDesktopSyncEvent(uid, 'presence:pet.breeding.hatching', {
          egg_id: saved.id,
          hatch_at: saved.hatchAt,
        });
      } catch {}
    });
    return saved;
  }

  async decline(eggId: string, partnerUserId: string) {
    const egg = await this.eggRepo.findOne({ where: { id: eggId } });
    if (!egg) throw new NotFoundException('egg not found');
    if (egg.partnerUserId !== partnerUserId) throw new ForbiddenException('not your invite');
    egg.status = 'declined';
    this.appendTimeline(egg, 'declined', partnerUserId, { reason: 'partner_decline' });
    return this.eggRepo.save(egg);
  }

  async cancel(eggId: string, initiatorUserId: string) {
    const egg = await this.eggRepo.findOne({ where: { id: eggId } });
    if (!egg) throw new NotFoundException('egg not found');
    if (egg.initiatorUserId !== initiatorUserId) throw new ForbiddenException('not your egg');
    if (!['invited', 'hatching'].includes(egg.status)) {
      throw new BadRequestException(`cannot cancel from status=${egg.status}`);
    }
    egg.status = 'cancelled';
    this.appendTimeline(egg, 'cancelled', initiatorUserId, { reason: 'initiator_cancel' });
    return this.eggRepo.save(egg);
  }

  /** 孵化完成 → 调用 remix-breeding 生成两只血统宠物（双方各 1）。 */
  async hatch(eggId: string, requesterUserId: string): Promise<PetBreedingEgg> {
    const egg = await this.eggRepo.findOne({ where: { id: eggId } });
    if (!egg) throw new NotFoundException('egg not found');
    if (![egg.initiatorUserId, egg.partnerUserId].includes(requesterUserId)) {
      throw new ForbiddenException('not your egg');
    }
    if (egg.status !== 'hatching') throw new BadRequestException(`status=${egg.status}`);
    if (!egg.hatchAt || Date.now() < parseInt(egg.hatchAt, 10)) {
      throw new BadRequestException('not ready to hatch yet');
    }

    // 双方各得一只（同源 lineage，独立 owner）
    const childInitiator = await this.remixService.breed({
      parentASkinId: egg.initiatorPetSkinId,
      parentBSkinId: egg.partnerPetSkinId,
      requesterUserId: egg.initiatorUserId,
      displayName: 'Bred Pet',
    });
    const childPartner = await this.remixService.breed({
      parentASkinId: egg.initiatorPetSkinId,
      parentBSkinId: egg.partnerPetSkinId,
      requesterUserId: egg.partnerUserId,
      displayName: 'Bred Pet',
    });

    egg.status = 'hatched';
    egg.childSkinIdInitiator = childInitiator.id;
    egg.childSkinIdPartner = childPartner.id;
    this.appendTimeline(egg, 'hatched', requesterUserId, {
      reason: 'hatch_complete',
    });
    const saved = await this.eggRepo.save(egg);

    [egg.initiatorUserId, egg.partnerUserId].forEach((uid) => {
      try {
        emitDesktopSyncEvent(uid, 'presence:pet.breeding.hatched', {
          egg_id: saved.id,
          child_skin_id:
            uid === egg.initiatorUserId ? saved.childSkinIdInitiator : saved.childSkinIdPartner,
        });
      } catch {}
    });
    return saved;
  }

  async listForUser(userId: string) {
    const initiated = await this.eggRepo.find({
      where: { initiatorUserId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const received = await this.eggRepo.find({
      where: { partnerUserId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return { initiated, received };
  }

  /** Pet Phase 6 P0-5 — audit-only timeline appender (mutates egg.metadata). */
  private appendTimeline(
    egg: PetBreedingEgg,
    status: string,
    by: string,
    extra: Partial<Omit<BreedingTimelineEntry, 'status' | 'at' | 'by'>> = {},
  ): void {
    const md = (egg.metadata || {}) as Record<string, unknown>;
    const prev = Array.isArray(md.timeline) ? (md.timeline as BreedingTimelineEntry[]) : [];
    egg.metadata = {
      ...md,
      timeline: [...prev, this.timelineEntry(status, by, extra)],
    };
  }

  private timelineEntry(
    status: string,
    by: string,
    extra: Partial<Omit<BreedingTimelineEntry, 'status' | 'at' | 'by'>> = {},
  ): BreedingTimelineEntry {
    return { status, by, at: Date.now(), ...extra };
  }
}
