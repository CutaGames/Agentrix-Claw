import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WorldAsset } from '../entities/world-asset.entity';
import { LivingPet } from '../../../entities/living-pet.entity';

/**
 * SoulLinkageService — 统一灵魂体系 (Phase C, 化身主宠)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §1 支柱1。
 *
 * 解决"主宠 / 扫描角色是两套割裂数据"的产品割裂点:把一个扫描出来的 WorldAsset
 * **化身(incarnate)** 为用户主宠 LivingPet 的一种"世界形态"。
 *
 *   - WorldAsset.linkedSoulId = livingPet.id (灵魂指针)
 *   - LivingPet.personalityOverrides.worldIncarnationAssetId = assetId (主宠记住当前世界形态)
 *   - **灵魂连续**: intimacy / emotion / memory 全保留在 LivingPet 上, 不被触碰 → 天然连续。
 *
 * 契约不破:
 *   - LivingPet 仍 1 user = 1, 不可删/不可卖 (本服务只读 + 改 personalityOverrides/不动 intimacy)。
 *   - WorldAsset 仍可独立交易; 一旦被交易转移(ownerId 变), 链接应被解除(见 unlinkOnTransfer)。
 *
 * 配额: 一个主宠最多关联 MAX_INCARNATIONS 个世界形态(Phase C 用常量, 后续接订阅档位)。
 */
@Injectable()
export class SoulLinkageService {
  private readonly logger = new Logger(SoulLinkageService.name);

  /** 一个主宠最多关联多少个世界形态(Phase C 常量; TODO 接 plan: Free1/Pro3/Pro+∞) */
  static readonly MAX_INCARNATIONS = 3;

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
  ) {}

  /**
   * 把一个扫描角色化身为主宠的世界形态。
   * @returns { assetId, soulId, intimacyLevel, emotion } — 含主宠连续状态以证明"同一灵魂"
   */
  async incarnate(userId: string, assetId: string): Promise<{
    assetId: string;
    soulId: string;
    petName: string;
    intimacyLevel: number;
    emotion: string;
    incarnationCount: number;
  }> {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId, ownerId: userId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found or not owned by user`);
    }
    if (asset.category !== 'character') {
      throw new BadRequestException('Only character assets can incarnate as the main pet');
    }

    // 主宠(1 user = 1);若不存在则创建一个最小默认主宠,保证灵魂载体存在
    const pet = await this.getOrCreatePet(userId);

    // 已化身到同一主宠 → 幂等
    if (asset.linkedSoulId === pet.id) {
      return this.linkSummary(asset, pet);
    }

    // 配额:统计该主宠当前已关联的世界形态数
    const linkedCount = await this.worldAssetRepo.count({
      where: { ownerId: userId, linkedSoulId: pet.id },
    });
    if (linkedCount >= SoulLinkageService.MAX_INCARNATIONS) {
      throw new ForbiddenException(
        `主宠最多关联 ${SoulLinkageService.MAX_INCARNATIONS} 个世界形态,请先解绑一个`,
      );
    }

    // 写链接(只动 WorldAsset.linkedSoulId + 主宠的 personalityOverrides;不碰 intimacy/emotion)
    asset.linkedSoulId = pet.id;
    await this.worldAssetRepo.save(asset);

    const overrides = { ...(pet.personalityOverrides ?? {}) } as Record<string, unknown>;
    overrides.worldIncarnationAssetId = assetId;
    overrides.worldIncarnationName = asset.name;
    pet.personalityOverrides = overrides;
    await this.livingPetRepo.save(pet);

    this.logger.log(`Asset ${assetId} incarnated as main pet ${pet.id} for user ${userId}`);
    return this.linkSummary(asset, pet, linkedCount + 1);
  }

  /** 解除化身。不影响主宠 intimacy/emotion,也不删 WorldAsset。 */
  async unincarnate(userId: string, assetId: string): Promise<{ status: 'unlinked' }> {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId, ownerId: userId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found or not owned by user`);
    }
    if (!asset.linkedSoulId) {
      return { status: 'unlinked' };
    }

    const pet = await this.livingPetRepo.findOne({ where: { id: asset.linkedSoulId } });
    asset.linkedSoulId = null;
    await this.worldAssetRepo.save(asset);

    // 若主宠当前活动形态正是这个 asset, 清掉指针
    if (pet) {
      const overrides = { ...(pet.personalityOverrides ?? {}) } as Record<string, unknown>;
      if (overrides.worldIncarnationAssetId === assetId) {
        delete overrides.worldIncarnationAssetId;
        delete overrides.worldIncarnationName;
        pet.personalityOverrides = overrides;
        await this.livingPetRepo.save(pet);
      }
    }
    this.logger.log(`Asset ${assetId} unincarnated for user ${userId}`);
    return { status: 'unlinked' };
  }

  /** 查询某资产的灵魂链接状态 + 主宠连续状态(证明"同一灵魂")。 */
  async getSoulStatus(userId: string, assetId: string): Promise<{
    linked: boolean;
    soulId: string | null;
    petName?: string;
    intimacyLevel?: number;
    emotion?: string;
    isActiveIncarnation?: boolean;
  }> {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId, ownerId: userId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found or not owned by user`);
    }
    if (!asset.linkedSoulId) {
      return { linked: false, soulId: null };
    }
    const pet = await this.livingPetRepo.findOne({ where: { id: asset.linkedSoulId } });
    if (!pet) {
      return { linked: false, soulId: null };
    }
    const overrides = (pet.personalityOverrides ?? {}) as Record<string, unknown>;
    return {
      linked: true,
      soulId: pet.id,
      petName: pet.name,
      intimacyLevel: pet.intimacyLevel,
      emotion: pet.emotion,
      isActiveIncarnation: overrides.worldIncarnationAssetId === assetId,
    };
  }

  /**
   * 资产被交易转移时调用:解除灵魂链接(灵魂不可转让,跟随原主)。
   * 由 marketplace 在 ownership 转移成功后调用(best-effort)。
   */
  async unlinkOnTransfer(assetId: string): Promise<void> {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
    if (asset && asset.linkedSoulId) {
      const pet = await this.livingPetRepo.findOne({ where: { id: asset.linkedSoulId } });
      asset.linkedSoulId = null;
      await this.worldAssetRepo.save(asset);
      if (pet) {
        const overrides = { ...(pet.personalityOverrides ?? {}) } as Record<string, unknown>;
        if (overrides.worldIncarnationAssetId === assetId) {
          delete overrides.worldIncarnationAssetId;
          delete overrides.worldIncarnationName;
          pet.personalityOverrides = overrides;
          await this.livingPetRepo.save(pet);
        }
      }
    }
  }

  // ============================================================
  // Private
  // ============================================================

  private async getOrCreatePet(userId: string): Promise<LivingPet> {
    let pet = await this.livingPetRepo.findOne({ where: { userId } });
    if (!pet) {
      const now = Date.now();
      pet = this.livingPetRepo.create({
        userId,
        name: 'Aira',
        species: 'aira',
        emotion: 'calm',
        emotionIntensity: 0,
        emotionSince: String(now),
        emotionDecayAt: String(0),
        intimacyLevel: 0,
        intimacyXp: 0,
        recentMemorySnippets: [],
        unlockedSoulTemplateIds: ['claw'],
        engineSwitching: false,
        soulTemplateId: 'claw',
        personalityOverrides: {},
      });
      pet = await this.livingPetRepo.save(pet);
      this.logger.log(`LivingPet auto-created for soul linkage (user ${userId}, pet ${pet.id})`);
    }
    return pet;
  }

  private linkSummary(asset: WorldAsset, pet: LivingPet, count?: number) {
    return {
      assetId: asset.id,
      soulId: pet.id,
      petName: pet.name,
      intimacyLevel: pet.intimacyLevel,
      emotion: pet.emotion,
      incarnationCount: count ?? 1,
    };
  }
}
