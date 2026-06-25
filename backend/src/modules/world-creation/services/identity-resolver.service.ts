import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ReadonlyAssetHandle } from '../../../../shared/types/world-creation-api';
import type { WorldCreationError } from '../../../../shared/types/world-creation';
import { WorldAsset } from '../../world-engine/entities/world-asset.entity';
import { LivingPet } from '../../../entities/living-pet.entity';

/**
 * Result of an `asset.import` authorization check (R9.3, design §9.1).
 *
 * 授权通过时附带剥离了所有权凭证的只读 handle；未拥有时返回结构化
 * `ASSET_NOT_OWNED` 错误，沙箱无法据此伪造所有权。
 */
export interface AssetImportAuthorization {
  /** Whether the entering user owns the requested asset. */
  authorized: boolean;
  /** Read-only handle (no ownership proof) — present only when authorized. */
  handle?: ReadonlyAssetHandle;
  /** Structured error (ASSET_NOT_OWNED) — present only when denied. */
  error?: WorldCreationError;
}

/**
 * 内部资产源解析器接口 (extensibility hook)。
 *
 * 每个 source 负责：① 列出某用户拥有的资产并映射为只读 handle；
 * ② 按 assetId 解析单个资产并判定该用户是否拥有。新增 soul / 其它资产体系时，
 * 只需新增一个实现并注册到 sources 数组，无需改动 resolveReadonlyHandles /
 * authorizeAssetImport 的对外契约。
 */
interface AssetSource {
  readonly kind: ReadonlyAssetHandle['kind'];
  /** 列出 userId 拥有的全部资产 → 只读 handle (无凭证)。 */
  listOwned(userId: string): Promise<ReadonlyAssetHandle[]>;
  /**
   * 按 assetId 查找资产并判定 userId 是否拥有。
   * 返回 null 表示该 source 不认识此 assetId（交由下一个 source 处理）。
   */
  resolveOwnership(
    userId: string,
    assetId: string,
  ): Promise<{ owned: boolean; handle: ReadonlyAssetHandle } | null>;
}

/**
 * IdentityResolverService — 跨体验身份与资产解析 (design §9, R9).
 *
 * 进入 Plot 时服务端解析进入者拥有的 soul / pet / World_Asset，仅向沙箱注入
 * **只读 handle** (id + 展示数据，剥离 ownerId / originalCreatorId / version 等
 * 所有权凭证)；`asset.import` 未拥有资产即拒 (结构化 `ASSET_NOT_OWNED`)。
 * 跨 Plot 移动时身份与资产随行 (解析仅依赖 userId，与 plotId 无关)，无需重建。
 *
 * 安全不变量 (design §9.1)：
 *  - ReadonlyAssetHandle 仅含 `{ assetId, kind, name, thumbnailUrl? }`，
 *    **结构上**不可能携带所有权凭证或转移能力 (safe by construction)。
 *  - 所有权判定完全在服务端 (沙箱不可达)；沙箱拿到的 handle 不可逆推出 owner。
 *
 * 复用 v5 资产仓库：注入 world-engine 的 WorldAsset 仓库 (主资产体系) 与
 * LivingPet 仓库 (主宠/灵魂)。新增其它资产体系时通过 AssetSource 接口扩展。
 */
@Injectable()
export class IdentityResolverService {
  private readonly logger = new Logger(IdentityResolverService.name);

  /** 已注册的资产源 (WorldAsset 主体 + LivingPet 主宠/灵魂)，可扩展。 */
  private readonly sources: AssetSource[];

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
  ) {
    this.sources = [
      this.createWorldAssetSource(),
      this.createLivingPetSource(),
    ];
  }

  /**
   * R9.1 / R9.2 — 解析进入者拥有的 soul / pet / World_Asset，映射为只读 handle。
   *
   * 仅返回 `{ assetId, kind, name, thumbnailUrl? }`，**不含任何所有权凭证**
   * (ownerId / originalCreatorId / version 等永不出现在 handle 中)。解析只依赖
   * userId，与具体 Plot 无关 → 跨 Plot 移动时身份与资产随行，无需重建 (R9.2)。
   *
   * @param userId 进入者用户 id。
   * @param _plotId 进入的 Plot id（保留参数，资产随行不依赖它，仅用于审计上下文）。
   */
  async resolveReadonlyHandles(
    userId: string,
    _plotId?: string,
  ): Promise<ReadonlyAssetHandle[]> {
    if (!userId) {
      return [];
    }

    const handles: ReadonlyAssetHandle[] = [];
    for (const source of this.sources) {
      try {
        const owned = await source.listOwned(userId);
        handles.push(...owned);
      } catch (err) {
        // 单一资产源故障不应阻断整个进入流程；记录并继续 (其余资产仍可随行)。
        this.logger.warn(
          `Asset source '${source.kind}' failed to resolve handles for user ${userId}: ${this.toDetail(err)}`,
        );
      }
    }

    this.logger.debug(
      `Resolved ${handles.length} read-only asset handle(s) for user ${userId}`,
    );
    return handles;
  }

  /**
   * R9.3 — 授权 `asset.import`：校验进入者是否拥有目标资产。
   *
   * 拥有 → `{ authorized: true, handle }` (剥离凭证的只读 handle)。
   * 未拥有 / 资产不存在 → `{ authorized: false, error: ASSET_NOT_OWNED }`，
   * 服务端拒绝注入，沙箱无法伪造所有权 (design §9.1)。
   */
  async authorizeAssetImport(
    userId: string,
    assetId: string,
  ): Promise<AssetImportAuthorization> {
    const denied: AssetImportAuthorization = {
      authorized: false,
      error: {
        error: 'ASSET_NOT_OWNED',
        detail: `Asset ${assetId} is not owned by the requesting user; import denied.`,
      },
    };

    if (!userId || !assetId) {
      return denied;
    }

    for (const source of this.sources) {
      let resolved: { owned: boolean; handle: ReadonlyAssetHandle } | null;
      try {
        resolved = await source.resolveOwnership(userId, assetId);
      } catch (err) {
        this.logger.warn(
          `Asset source '${source.kind}' failed ownership check for asset ${assetId}: ${this.toDetail(err)}`,
        );
        continue;
      }
      if (!resolved) {
        // 此 source 不认识该 assetId，交给下一个 source。
        continue;
      }
      if (resolved.owned) {
        return { authorized: true, handle: resolved.handle };
      }
      // 资产存在但不属于该用户 → 明确拒绝 (R9.3)。
      this.logger.log(
        `asset.import denied: user ${userId} does not own ${source.kind} asset ${assetId}`,
      );
      return denied;
    }

    // 所有 source 都不认识该 assetId → 视为未拥有。
    return denied;
  }

  /**
   * 便捷布尔门控 (R9.3)：进入者是否拥有某资产。
   * authorizeAssetImport 的精简版，便于 rules / 直接判定调用。
   */
  async assertOwnership(userId: string, assetId: string): Promise<boolean> {
    const result = await this.authorizeAssetImport(userId, assetId);
    return result.authorized;
  }

  // ============================================================
  // Asset sources (复用 v5 仓库；可扩展)
  // ============================================================

  /**
   * WorldAsset 资产源 (v5 主资产体系)。所有权 = `ownerId === userId`。
   * handle 仅暴露展示数据 (name + 2D/3D 形象)，剥离 ownerId/originalCreatorId/version。
   */
  private createWorldAssetSource(): AssetSource {
    const toHandle = (asset: WorldAsset): ReadonlyAssetHandle => ({
      assetId: asset.id,
      kind: 'worldAsset',
      name: asset.name,
      // 展示优先级：风格化 mesh → 原始 mesh → 2D 立绘兜底 (无则 undefined)。
      thumbnailUrl:
        asset.styledMeshUrl ?? asset.meshUrl ?? asset.portraitUrl ?? undefined,
    });

    return {
      kind: 'worldAsset',
      listOwned: async (userId) => {
        const assets = await this.worldAssetRepo.find({
          where: { ownerId: userId },
        });
        return assets.map(toHandle);
      },
      resolveOwnership: async (userId, assetId) => {
        const asset = await this.worldAssetRepo.findOne({
          where: { id: assetId },
        });
        if (!asset) return null;
        return { owned: asset.ownerId === userId, handle: toHandle(asset) };
      },
    };
  }

  /**
   * LivingPet 资产源 (主宠/灵魂，1 user ↔ 1 LivingPet)。所有权 = `userId === userId`。
   * 灵魂不参与经济、不可转让；handle 仅暴露 name (展示用)。
   */
  private createLivingPetSource(): AssetSource {
    const toHandle = (pet: LivingPet): ReadonlyAssetHandle => ({
      assetId: pet.id,
      kind: 'pet',
      name: pet.name,
    });

    return {
      kind: 'pet',
      listOwned: async (userId) => {
        const pet = await this.livingPetRepo.findOne({ where: { userId } });
        return pet ? [toHandle(pet)] : [];
      },
      resolveOwnership: async (userId, assetId) => {
        const pet = await this.livingPetRepo.findOne({ where: { id: assetId } });
        if (!pet) return null;
        return { owned: pet.userId === userId, handle: toHandle(pet) };
      },
    };
  }

  private toDetail(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'unknown error';
  }
}
