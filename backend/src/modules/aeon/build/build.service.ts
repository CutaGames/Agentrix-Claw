import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonBuildItem } from '../entities/aeon-build-item.entity';
import { AeonPlot } from '../entities/aeon-plot.entity';
import { AeonRoom } from '../entities/aeon-room.entity';
import { WorldAsset } from '../../world-engine/entities/world-asset.entity';
import {
  AEON_BUILD,
  type AeonBuildItemDto,
  type AeonBuildPlacement,
  type AeonBuildCatalogItem,
  type AeonBuildLinkKind,
} from '../../../../../shared/types/aeon-world';

/**
 * BuildService — 共建建造系统(Task 4.1 / R10)。
 *
 * 放置/移动/旋转/移除建造物 + 地块边界与重叠校验 + 布局持久化(重进还原)。
 * 权限:owner 可改;授权 grantee 在范围内可改;无权限拒绝(R10.3)。并发冲突按
 * last-write-wins(单格唯一占用,放置时检测重叠拒绝)。
 *
 * 可放置物来源:用户 World_Assets(sourceAssetId)+ 模块化科技未来城建筑目录(catalogId)。
 * 功能建筑通过 linksTo 链接 Org/Room(R10.6)。
 */
@Injectable()
export class BuildService {
  private readonly logger = new Logger(BuildService.name);

  /**
   * 模块化"科技未来城"建筑目录(R10 可放置物来源之一)。美术量产前用 emoji 占位;
   * 概念图通过后替换 icon 为贴图 key(见 Phase 5.1)。
   */
  private static readonly CATALOG: AeonBuildCatalogItem[] = [
    { catalogId: 'hq-tower', label: '公司总部楼', footprint: { w: 4, h: 4 }, functional: true, icon: '🏢' },
    { catalogId: 'task-board', label: '任务公告台', footprint: { w: 2, h: 1 }, functional: true, icon: '📋' },
    { catalogId: 'market-stall', label: '市场货架', footprint: { w: 2, h: 2 }, functional: true, icon: '🛒' },
    { catalogId: 'stage-dome', label: '舞台穹顶', footprint: { w: 4, h: 3 }, functional: true, icon: '🎤' },
    { catalogId: 'meeting-pod', label: '会议舱', footprint: { w: 3, h: 3 }, functional: true, icon: '💼' },
    { catalogId: 'plaza-tree', label: '霓虹树', footprint: { w: 1, h: 1 }, functional: false, icon: '🌴' },
    { catalogId: 'lamp-post', label: '光柱路灯', footprint: { w: 1, h: 1 }, functional: false, icon: '💡' },
    { catalogId: 'fountain', label: '能量喷泉', footprint: { w: 2, h: 2 }, functional: false, icon: '⛲' },
    { catalogId: 'gate-arch', label: '入口拱门', footprint: { w: 3, h: 1 }, functional: false, icon: '🌉' },
    { catalogId: 'hologram', label: '全息广告牌', footprint: { w: 2, h: 1 }, functional: false, icon: '📺' },
  ];

  constructor(
    @InjectRepository(AeonBuildItem)
    private readonly buildRepo: Repository<AeonBuildItem>,
    @InjectRepository(AeonPlot)
    private readonly plotRepo: Repository<AeonPlot>,
    @InjectRepository(AeonRoom)
    private readonly roomRepo: Repository<AeonRoom>,
    @InjectRepository(WorldAsset)
    private readonly assetRepo: Repository<WorldAsset>,
  ) {}

  /** 建筑目录(供客户端拖拽面板)。 */
  catalog(): AeonBuildCatalogItem[] {
    return BuildService.CATALOG;
  }

  /**
   * 列出用户自己可用作建材的 World_Assets(#2 共建素材)。
   * 默认返回 usage_kind in (build_material, decor) 的资产;includeAll=true 时返回该用户全部资产
   * (让用户能把任意拍照资产"转为建材")。返回放置面板需要的最小信息。
   */
  async listMyBuildableAssets(
    userId: string,
    includeAll = false,
  ): Promise<Array<{ id: string; name: string; thumbnailUrl: string | null; usageKind: string; category: string }>> {
    const qb = this.assetRepo
      .createQueryBuilder('a')
      .where('a.owner_id = :userId', { userId })
      .orderBy('a.updated_at', 'DESC')
      .limit(100);
    if (!includeAll) {
      qb.andWhere('a.usage_kind IN (:...kinds)', { kinds: ['build_material', 'decor'] });
    }
    const rows = await qb.getMany();
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      thumbnailUrl: a.portraitUrl ?? a.styledMeshUrl ?? a.meshUrl ?? null,
      usageKind: a.usageKind ?? 'character',
      category: a.category,
    }));
  }

  /** 把某个自有资产标记/取消标记为建材(#2)。仅 owner。 */
  async setAssetUsageKind(
    userId: string,
    assetId: string,
    usageKind: 'character' | 'build_material' | 'decor',
  ): Promise<{ id: string; usageKind: string }> {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    if (asset.ownerId !== userId) throw new ForbiddenException('只能修改自己的资产');
    asset.usageKind = usageKind;
    await this.assetRepo.save(asset);
    return { id: asset.id, usageKind };
  }

  /**
   * #2 直接用一张照片创建一个"建材"资产(自己准备素材建造,无需 3D)。
   * 不跑 AI Interpreter / 3D mesh —— 把照片当 2.5D 摆件,落一个 usage_kind=build_material 的
   * 轻量 WorldAsset(generationStatus=card_ready,portraitUrl=照片)。用户即可在建造里摆放。
   */
  async createBuildMaterialFromPhoto(
    userId: string,
    input: { name?: string; imageUrl: string; usageKind?: 'build_material' | 'decor' },
  ): Promise<{ id: string; name: string; thumbnailUrl: string | null; usageKind: string }> {
    if (!input?.imageUrl) throw new BadRequestException('imageUrl 必填');
    const name = (input.name?.trim() || '我的素材').slice(0, 30);
    const asset = this.assetRepo.create({
      ownerId: userId,
      originalCreatorId: userId,
      name,
      category: 'weapon', // category enum 限 character/dungeon/weapon;建材借用 weapon 占位,用途以 usageKind 为准
      scanMode: 'quick',
      meshUrl: null,
      styledMeshUrl: null,
      portraitUrl: input.imageUrl,
      styleType: 'realistic',
      semanticDescription: { kind: 'build_material', label: name } as any,
      stats: {} as any,
      skills: [] as any,
      personalityTraits: [] as any,
      backstory: null,
      behaviorTree: {} as any,
      source: 'scanned',
      generationStatus: 'card_ready',
      usageKind: input.usageKind || 'build_material',
    } as any);
    const saved = await this.assetRepo.save(asset);
    this.logger.log(`Build material asset created: ${saved.id} "${name}" by ${userId}`);
    return { id: saved.id, name, thumbnailUrl: input.imageUrl, usageKind: saved.usageKind };
  }

  private catalogItem(catalogId: string): AeonBuildCatalogItem | undefined {
    return BuildService.CATALOG.find((c) => c.catalogId === catalogId);
  }

  /** 取某放置项的占地尺寸(资产默认 1x1,目录项查表)。 */
  private footprintOf(catalogId: string | null): { w: number; h: number } {
    if (!catalogId) return { w: 1, h: 1 };
    return this.catalogItem(catalogId)?.footprint ?? { w: 1, h: 1 };
  }

  /**
   * 权限校验:owner 可改;授权 grantee(plot.config.buildGrantees 含 userId)在范围内可改;
   * 否则拒绝(R10.3)。返回 plot 供后续校验。
   */
  private async assertCanBuild(plotId: string, userId: string): Promise<AeonPlot> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    if (plot.ownerUserId === userId) return plot;
    const grantees = this.granteesOf(plot);
    if (grantees.includes(userId)) return plot;
    // 沙盒/公共体验地块(如 E2E 测试领地 / 官方公共展示地)对所有登录用户开放共建,
    // 解决"进了别人/测试地块想建造却没权限"的死路。地块 config.sandbox=true 即放行。
    const cfg = (plot.config as Record<string, unknown>) ?? {};
    if (cfg.sandbox === true || cfg.openBuild === true) return plot;
    throw new ForbiddenException('你没有在此地块建造的权限');
  }

  private granteesOf(plot: AeonPlot): string[] {
    const cfg = plot.config;
    const list = cfg && Array.isArray((cfg as any).buildGrantees) ? (cfg as any).buildGrantees : [];
    return list.filter((x: unknown): x is string => typeof x === 'string');
  }

  /** 边界校验(R10.2):放置项必须完全落在地块建造网格内。 */
  private assertInBounds(x: number, y: number, w: number, h: number): void {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x + w > AEON_BUILD.PLOT_GRID_W ||
      y + h > AEON_BUILD.PLOT_GRID_H
    ) {
      throw new BadRequestException('放置超出地块边界');
    }
  }

  /** 重叠校验(R10.2):新/移动项的占地矩形不得与同地块其它项相交(忽略自身)。 */
  private async assertNoOverlap(
    plotId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    ignoreId?: string,
  ): Promise<void> {
    const items = await this.buildRepo.find({ where: { plotId } });
    for (const it of items) {
      if (ignoreId && it.id === ignoreId) continue;
      const f = this.footprintOf(it.catalogId);
      const overlap = x < it.x + f.w && x + w > it.x && y < it.y + f.h && y + h > it.y;
      if (overlap) {
        throw new ConflictException('该位置与已有建筑重叠');
      }
    }
  }

  private normalizeRotation(r?: number): number {
    const v = ((Math.round((r ?? 0) / 90) * 90) % 360 + 360) % 360;
    return v;
  }

  /** 列出地块布局(重进还原,R10.5)。 */
  async listByPlot(plotId: string): Promise<AeonBuildItemDto[]> {
    const items = await this.buildRepo.find({ where: { plotId }, order: { createdAt: 'ASC' } });
    return items.map((i) => this.toDto(i));
  }

  /** 放置一个建造物(R10.1)。 */
  async place(plotId: string, userId: string, p: AeonBuildPlacement): Promise<AeonBuildItemDto> {
    await this.assertCanBuild(plotId, userId);
    if (!p.catalogId && !p.sourceAssetId) {
      throw new BadRequestException('需指定 catalogId 或 sourceAssetId');
    }
    const count = await this.buildRepo.count({ where: { plotId } });
    if (count >= AEON_BUILD.MAX_ITEMS_PER_PLOT) {
      throw new BadRequestException('地块建造物已达上限');
    }
    const f = this.footprintOf(p.catalogId ?? null);
    this.assertInBounds(p.x, p.y, f.w, f.h);
    await this.assertNoOverlap(plotId, p.x, p.y, f.w, f.h);

    const linksToKind = this.normalizeLinkKind(p.linksToKind, p.catalogId ?? null);
    const item = this.buildRepo.create({
      plotId,
      sourceAssetId: p.sourceAssetId ?? null,
      catalogId: p.catalogId ?? null,
      x: p.x,
      y: p.y,
      rotation: this.normalizeRotation(p.rotation),
      linksToId: p.linksToId ?? null,
      linksToKind,
      label: p.label ?? this.catalogItem(p.catalogId ?? '')?.label ?? '建筑',
    });
    let saved = await this.buildRepo.save(item);

    // #2 P2:功能建筑(room/venue 类)落地即自动开一个可进入的房间,并回填 linksToId。
    // 这样"点进这栋楼 = 进入店内/会场场景"闭环成立(餐厅、市场、会议室等)。
    // 'org' 类(公司总部)由公司流程单独建房,不在此自动建;'stage' 由活动调度层处理。
    if (!saved.linksToId && linksToKind === 'room') {
      try {
        const room = await this.roomRepo.save(
          this.roomRepo.create({
            plotId,
            orgId: null,
            epoch: 'earth',
            kind: 'venue',
            capacity: 20,
            displayName: saved.label,
            config: { primitives: ['venue'], buildItemId: saved.id, sourceAssetId: saved.sourceAssetId },
          }),
        );
        saved.linksToId = room.id;
        saved = await this.buildRepo.save(saved);
      } catch (e: any) {
        this.logger.warn(`auto-create linked room failed for build item ${saved.id}: ${e?.message}`);
      }
    }

    this.logger.log(`Build placed: ${saved.id} on plot ${plotId} @(${saved.x},${saved.y})`);
    return this.toDto(saved);
  }

  /** 移动/旋转一个建造物(R10.1)。 */
  async move(
    plotId: string,
    userId: string,
    itemId: string,
    patch: { x?: number; y?: number; rotation?: number },
  ): Promise<AeonBuildItemDto> {
    await this.assertCanBuild(plotId, userId);
    const item = await this.buildRepo.findOne({ where: { id: itemId, plotId } });
    if (!item) throw new NotFoundException('建造物不存在');
    const x = patch.x ?? item.x;
    const y = patch.y ?? item.y;
    const f = this.footprintOf(item.catalogId);
    this.assertInBounds(x, y, f.w, f.h);
    await this.assertNoOverlap(plotId, x, y, f.w, f.h, itemId);
    item.x = x;
    item.y = y;
    if (patch.rotation != null) item.rotation = this.normalizeRotation(patch.rotation);
    const saved = await this.buildRepo.save(item);
    return this.toDto(saved);
  }

  /** 移除一个建造物(R10.1)。 */
  async remove(plotId: string, userId: string, itemId: string): Promise<void> {
    await this.assertCanBuild(plotId, userId);
    const item = await this.buildRepo.findOne({ where: { id: itemId, plotId } });
    if (!item) throw new NotFoundException('建造物不存在');
    await this.buildRepo.remove(item);
  }

  /** 授权/取消授权他人在地块建造(R10.3)。仅 owner。 */
  async setGrantees(plotId: string, ownerUserId: string, grantees: string[]): Promise<string[]> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    if (plot.ownerUserId !== ownerUserId) throw new ForbiddenException('只有 owner 可授权');
    const cfg = (plot.config as Record<string, unknown>) ?? {};
    (cfg as any).buildGrantees = Array.from(new Set(grantees.filter((g) => typeof g === 'string')));
    plot.config = cfg;
    await this.plotRepo.save(plot);
    return (cfg as any).buildGrantees;
  }

  private normalizeLinkKind(kind: AeonBuildLinkKind | undefined, catalogId: string | null): string {
    if (kind && kind !== 'none') return kind;
    // 功能建筑默认按目录暗示链接类型,实际 linksToId 由调用方在创建 org/room 后回填。
    const item = catalogId ? this.catalogItem(catalogId) : undefined;
    if (item?.functional) {
      if (catalogId === 'hq-tower') return 'org';
      if (catalogId === 'stage-dome') return 'stage';
      return 'room';
    }
    return 'none';
  }

  private toDto(i: AeonBuildItem): AeonBuildItemDto {
    return {
      id: i.id,
      plotId: i.plotId,
      sourceAssetId: i.sourceAssetId,
      catalogId: i.catalogId,
      x: i.x,
      y: i.y,
      rotation: i.rotation,
      linksToId: i.linksToId,
      linksToKind: (i.linksToKind as AeonBuildLinkKind) ?? 'none',
      label: i.label,
    };
  }
}
