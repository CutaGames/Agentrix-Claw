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
}
