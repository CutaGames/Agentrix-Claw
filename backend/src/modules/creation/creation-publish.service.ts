import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';

import { CreationRepository } from './creation.repository';
import {
  CreationStateMachine,
  InvalidCreationTransitionError,
} from './creation-state-machine';
import { OfferingDeriverService } from './offering-deriver.service';
import {
  CapabilityManifestDeriverService,
  type CustomToolDeclaration,
} from './capability-manifest-deriver.service';
import { CreationEntity } from './entities/creation.entity';
import { CreationCapabilityManifestEntity } from './entities/creation-capability-manifest.entity';
import { EcsWorldVersion } from '../world-creation/entities/ecs-world-version.entity';
import { ModerationService } from '../world-engine/services/moderation.service';

import type {
  EcsWorld,
  WorldCreationError,
} from '../../../shared/types/world-creation';
import type {
  CreationPreview,
  CreationStatus,
  Offering,
} from '../../../shared/types/creation';
import type {
  CreationCapabilityManifestDto,
  PublishCreationRequest,
  PublishCreationResponse,
} from '../../../shared/types/creation-api';

/**
 * 发布前审核阶段标识(对齐 world-creation `PlotModerationService` 的审计阶段语义)。
 */
type CreationModerationStage = 'pre_publish' | 'cn_region';

/** 发布时的可选编排参数(非默认路径)。 */
export interface PublishCreationOptions {
  /** 中国区:在 v5 5 阶段之上叠加 cn-region 增量审核。 */
  isChineseRegion?: boolean;
  /**
   * Tier_C opt-in 自定义工具声明(需求 13.6);仅 substrateTier==='C' 时纳入派生清单,
   * 其他层级一律忽略(deny-by-default)。透传给 {@link CapabilityManifestDeriverService}。
   */
  customTools?: CustomToolDeclaration[];
}

/** 审核内部结果(供 publish 决策)。 */
type ModerationResult =
  | { passed: true }
  | { passed: false; error: WorldCreationError };

/**
 * CreationPublishService — 统一 Creation 的「审核 → 发布 → shareCode → 派生 manifest」
 * 发布管线(world-creation-feed task 2.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 3.1:发布前必经内容审核;仅通过后方可进入发现面并生成可分享短码 + 深链。
 *   - 需求 3.2:发布要求至少一个预览物;缺失则自动生成占位预览(本服务采用占位而非拒绝)。
 *   - 需求 3.3:审核未过 → 返回结构化拒绝原因,Creation 状态保持不变(内容不丢失)。
 *   - 需求 3.6:发布成功 → 返回可分享短码。
 *   - 需求 1.11 / Property 5:发布时从 ECS_World + offerings 自动派生能力清单,
 *     manifestVersion 单调递增并持久化到 creation_capability_manifests。
 *
 * 设计依据(design §Components and Interfaces — REST 表 `POST /v1/creations/:id/publish`):
 *   > 审核→发布→生成 shareCode + 派生 manifest(v6 publish + moderation)。
 *
 * **复用既有审核管线,不重建**:注入 world-engine 的 {@link ModerationService}
 * (v5 5 阶段内容判定 + cn-region 增量),与 world-creation `PlotModerationService`
 * 复用同一审核引擎、同一内容判定语义,仅把判定对象从 WorldPlot 换成统一 Creation
 * (读 `ecsVersionId` 指向的 ECS_World 快照聚合可审核文本)。
 *
 * **复用 shareCode 生成风格**:与 world-creation `ArenaService.generatePlotShareCode`
 * / v5 dungeon `share_code` 完全一致 —— SHA-256(id) 取前 8 位大写 hex、DB 唯一、冲突偏移重试,
 * 可直接套用既有分享卡/深链/web 回退模型。
 *
 * 状态流转一律经 {@link CreationStateMachine} 守卫(审核前置 / 违规即移出,需求 3.1/3.4)。
 *
 * 全局 SnakeNamingStrategy:列名自动派生,禁止手写 name。
 */
@Injectable()
export class CreationPublishService {
  private readonly logger = new Logger(CreationPublishService.name);

  /** 寻找无冲突 shareCode 的最大尝试次数(对齐 v5 dungeon-builder)。 */
  private readonly SHARE_CODE_MAX_ATTEMPTS = 10;

  /** 喂给审核引擎的聚合 ECS 文本上限(对齐 PlotModerationService)。 */
  private readonly MAX_MODERATION_TEXT = 8000;

  constructor(
    private readonly repo: CreationRepository,
    private readonly stateMachine: CreationStateMachine,
    private readonly offeringDeriver: OfferingDeriverService,
    private readonly manifestDeriver: CapabilityManifestDeriverService,
    /** 复用 v5 5 阶段审核引擎(NOT rebuilt),与 PlotModerationService 同源。 */
    private readonly moderationService: ModerationService,
    @InjectRepository(EcsWorldVersion)
    private readonly versionRepo: Repository<EcsWorldVersion>,
    @InjectRepository(CreationCapabilityManifestEntity)
    private readonly manifestRepo: Repository<CreationCapabilityManifestEntity>,
  ) {}

  // ============================================================
  // 需求 3.1 / 3.2 / 3.3 / 3.6 / 1.11 — Publish pipeline
  // ============================================================

  /**
   * 发布一个 Creation:审核前置 → 要求预览物 → 流转 published/listed →
   * 生成 shareCode → 派生并持久化能力清单(manifestVersion 单调递增)。
   *
   * 流程(失败短路,保证拒绝时不产生任何副作用 —— 需求 3.3):
   *  1. **审核门控(需求 3.1)**:聚合 Creation 可审核文本(标题/摘要/ECS),经
   *     {@link ModerationService} 判定;任一阶段拒绝 → 返回结构化 `MODERATION_REJECTED`,
   *     **不流转、不写库**,Creation 状态保持不变、内容不丢失(需求 3.3)。
   *  2. **要求预览物(需求 3.2)**:显式 `req.preview` > 既有 `creation.preview` > 自动占位。
   *  3. **派生 offerings(task 2.1)**:从 ECS_World + 既有显式 offering 派生;
   *     据此决定目标态 —— 有 offering → `listed`(已上架交易),否则 `published`。
   *  4. **状态流转**:经状态机 `current → under_review → 目标态` 双段守卫(审核前置)。
   *  5. **shareCode(需求 3.6)**:复用 ArenaService 同款 SHA-256 派生 + 唯一性重试。
   *  6. **派生 manifest(需求 1.11 / Property 5)**:`(offering, verb)` → MCP 工具,
   *     版本 = 旧版本 + 1,持久化到 creation_capability_manifests(旧版本置 inactive)。
   *
   * 幂等:对已 `published/listed` 且已有 shareCode 的 Creation 重复调用,直接回显既有
   * 短码与清单版本,不重复审核/生成。
   *
   * @param creationId 目标 Creation id
   * @param req        发布请求(可显式提供/覆盖预览物)
   * @param opts       可选编排参数(cn-region / Tier_C customTools)
   */
  async publish(
    creationId: string,
    req: PublishCreationRequest = {},
    opts: PublishCreationOptions = {},
  ): Promise<PublishCreationResponse> {
    const creation = await this.repo.findById(creationId);
    if (!creation) {
      throw new NotFoundException(`Creation not found: ${creationId}`);
    }

    // 幂等:已发布且已有短码 → 回显,不重复审核/生成。
    if (
      (creation.status === 'published' || creation.status === 'listed') &&
      creation.shareCode
    ) {
      return {
        published: true,
        shareCode: creation.shareCode,
        manifestVersion: creation.manifestVersion,
      };
    }

    // 发布前置守卫:当前状态必须能进入 under_review(审核前置,需求 3.1)。
    // 非法(如 suspended 终态)→ 抛结构化 INVALID_CREATION_TRANSITION。
    if (!this.stateMachine.canTransition(creation.status, 'under_review')) {
      throw new InvalidCreationTransitionError(creation.status, 'under_review');
    }

    // 加载内容维度的 ECS_World 快照(纯地理创作 → null)。
    const ecsWorld = await this.loadEcsWorld(creation);

    // (1) 审核门控(需求 3.1):未过 → 状态不变、内容保留(需求 3.3)。
    const moderation = await this.runModeration(creation, ecsWorld, opts);
    if (!moderation.passed) {
      this.logger.warn(
        `Publish blocked by moderation: creation=${creation.id} detail="${moderation.error.detail}"`,
      );
      return { published: false, error: moderation.error };
    }

    // (2) 要求预览物(需求 3.2):显式 > 既有 > 自动占位。
    const preview =
      req.preview ?? creation.preview ?? this.generatePlaceholderPreview(creation);

    // (3) 派生 offerings(task 2.1),据此决定目标态。
    const offerings = this.offeringDeriver.derive(ecsWorld, creation.offerings ?? []);
    const target: CreationStatus = offerings.length > 0 ? 'listed' : 'published';

    // (4) 状态流转守卫:current → under_review → target(审核前置)。
    this.stateMachine.assertTransition(creation.status, 'under_review');
    this.stateMachine.assertTransition('under_review', target);

    // (5) shareCode(需求 3.6):复用 SHA-256 派生 + 唯一性重试;幂等保留既有码。
    const shareCode = creation.shareCode ?? (await this.generateShareCode(creation.id));

    // (6) 派生 manifest(需求 1.11 / Property 5):版本单调递增。
    const manifestDto = this.manifestDeriver.derive({
      creationId: creation.id,
      ecsVersionId: creation.ecsVersionId,
      substrateTier: creation.substrateTier,
      offerings,
      previousManifestVersion: creation.manifestVersion,
      customTools: opts.customTools,
    });

    // 写回 Creation(单次保存:状态/预览/offerings/shareCode/manifestVersion)。
    creation.status = target;
    creation.preview = preview;
    creation.offerings = offerings;
    creation.shareCode = shareCode;
    creation.manifestVersion = manifestDto.version;
    await this.repo.save(creation);

    // 持久化能力清单(旧版本置 inactive,Property 5)。
    await this.persistManifest(creation.id, manifestDto);

    this.logger.log(
      `Creation published: id=${creation.id} status=${target} shareCode=${shareCode} ` +
        `manifestVersion=${manifestDto.version} offerings=${offerings.length}`,
    );

    return {
      published: true,
      shareCode,
      manifestVersion: manifestDto.version,
    };
  }

  // ============================================================
  // Internal — moderation gate(复用 ModerationService)
  // ============================================================

  /**
   * 运行发布前审核:版权角色分类 + 违禁词 + (可选)cn-region 增量。
   * 与 world-creation `PlotModerationService.runPrePublish` 复用同一审核引擎与判定语义。
   */
  private async runModeration(
    creation: CreationEntity,
    ecsWorld: EcsWorld | null,
    opts: PublishCreationOptions,
  ): Promise<ModerationResult> {
    const { text, tags } = this.collectModerationContent(creation, ecsWorld);

    // Stage 1 (v5):版权角色分类。
    const copyright = await this.moderationService.checkCopyrightedCharacter(
      [],
      creation.title ?? undefined,
      tags,
    );
    if (!copyright.passed) {
      return this.reject('pre_publish', copyright.reason ?? 'copyright violation');
    }

    // Stage 2 (v5):违禁词过滤。
    const words = await this.moderationService.checkProhibitedWords(text);
    if (!words.passed) {
      return this.reject(
        'pre_publish',
        `prohibited words: ${words.offendingTerms.join(', ')}`,
      );
    }

    // Stage 3 (v5 增量):cn-region 叠加(仅中国区)。
    if (opts.isChineseRegion) {
      const cn = await this.moderationService.applyCnRegionModeration(
        [],
        text,
        creation.id,
        true,
      );
      if (!cn.passed) {
        return this.reject('cn_region', cn.reason ?? 'cn-region moderation rejected');
      }
    }

    return { passed: true };
  }

  /** 构造结构化 MODERATION_REJECTED 错误(含阶段 + 原因,需求 3.3)。 */
  private reject(
    stage: CreationModerationStage,
    reason: string,
  ): { passed: false; error: WorldCreationError } {
    return {
      passed: false,
      error: {
        error: 'MODERATION_REJECTED',
        detail: `[${stage}] ${reason}`,
      },
    };
  }

  /**
   * 聚合 Creation 的可审核文本与标签:title + summary + ECS_World 标题 / 实体 id /
   * UI 文本(panel/text/button)。文本上限 {@link MAX_MODERATION_TEXT} 防止超长输入。
   */
  private collectModerationContent(
    creation: CreationEntity,
    ecsWorld: EcsWorld | null,
  ): { text: string; tags: string[] } {
    const parts: string[] = [];
    if (creation.title) {
      parts.push(creation.title);
    }
    if (creation.summary) {
      parts.push(creation.summary);
    }
    if (ecsWorld) {
      parts.push(...this.extractEcsText(ecsWorld));
    }

    const text = parts.join(' ').slice(0, this.MAX_MODERATION_TEXT);
    const tags = parts.slice(0, 32);
    return { text, tags };
  }

  /** 从 ECS_World 提取可审核的文本字段(标题 / 实体 id / UI 文本)。 */
  private extractEcsText(world: EcsWorld): string[] {
    const out: string[] = [];
    if (world.meta?.title) {
      out.push(world.meta.title);
    }
    for (const entity of world.entities ?? []) {
      if (entity?.id) {
        out.push(entity.id);
      }
      const ui = entity?.components?.ui;
      if (ui) {
        if (ui.panel) out.push(ui.panel);
        if (ui.text) out.push(ui.text);
        if (ui.button) out.push(ui.button);
      }
    }
    return out;
  }

  // ============================================================
  // Internal — content / preview / manifest helpers
  // ============================================================

  /** 加载 Creation 当前 ECS_World 快照;无版本引用(纯地理创作)→ null。 */
  private async loadEcsWorld(creation: CreationEntity): Promise<EcsWorld | null> {
    if (!creation.ecsVersionId) {
      return null;
    }
    const version = await this.versionRepo.findOne({
      where: { id: creation.ecsVersionId },
    });
    return version?.snapshotJson ?? null;
  }

  /**
   * 自动生成占位预览物(需求 3.2):无显式/既有预览时使用,保证发布的 Creation 始终
   * 具备至少一个可在创作流轻量渲染的预览。占位指向稳定的 web 预览兜底地址。
   */
  private generatePlaceholderPreview(creation: CreationEntity): CreationPreview {
    return {
      kind: 'cover',
      url: `https://app.agentrix.io/world/creation/${creation.id}/preview.png`,
    };
  }

  /**
   * 持久化能力清单:把同 Creation 既有 active 清单置为 inactive,再插入新版本 active 清单。
   * `(creationId, version)` 唯一(Property 5,清单实体唯一索引)。
   */
  private async persistManifest(
    creationId: string,
    dto: CreationCapabilityManifestDto,
  ): Promise<void> {
    await this.manifestRepo.update(
      { creationId, isActive: true },
      { isActive: false },
    );
    const entity = this.manifestRepo.create({
      creationId,
      version: dto.version,
      ecsVersionId: dto.ecsVersionId,
      tools: dto.tools,
      customTools: dto.customTools ?? null,
      isActive: true,
    });
    await this.manifestRepo.save(entity);
  }

  // ============================================================
  // Internal — shareCode(复用 ArenaService / v5 dungeon 风格)
  // ============================================================

  /**
   * 生成与 v5 dungeon `share_code` / world-creation `ArenaService.generatePlotShareCode`
   * 完全一致格式的 Creation 分享码(需求 3.6)。
   *
   * 算法:SHA-256(creationId) → hex;取前 8 位大写(hex 即字母数字 0-9A-F,天然合法)。
   * DB 唯一性冲突时以 hash 偏移取下一段 8 位重试(最多 {@link SHARE_CODE_MAX_ATTEMPTS} 次),
   * 最终回退追加 `Date.now()` 保证唯一。长度恒在 6–12 位字母数字区间。
   */
  async generateShareCode(creationId: string): Promise<string> {
    const hash = createHash('sha256').update(creationId).digest('hex');
    let code = hash.substring(0, 8).toUpperCase();

    let attempts = 0;
    while (attempts < this.SHARE_CODE_MAX_ATTEMPTS) {
      const existing = await this.repo.findByShareCode(code);
      if (!existing) {
        return code;
      }
      // 冲突:以 hash 偏移取下一段 8 位重试。
      attempts += 1;
      const offset = attempts;
      code = hash.substring(offset, offset + 8).toUpperCase();
      if (code.length < 6) {
        break;
      }
    }

    // 回退:追加时间戳尾段保证唯一(仍为字母数字,长度 ≤ 12)。
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    return (hash.substring(0, 8).toUpperCase() + suffix).slice(0, 12);
  }
}
