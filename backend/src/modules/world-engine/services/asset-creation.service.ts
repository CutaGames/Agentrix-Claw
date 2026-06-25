import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WorldAsset } from '../entities/world-asset.entity';
import { ScanSession } from '../entities/scan-session.entity';
import { AIInterpreterService } from './ai-interpreter.service';
import { CharacterGeneratorService } from './character-generator.service';
import { AbilityMappingService } from './ability-mapping.service';
import type { SemanticDescription } from '../../../../shared/types/world-engine';

/**
 * AssetCreationService — 方案 B 的核心缺失环节。
 *
 * 此前 scan→generate→3D 链路从不创建 WorldAsset(资产库永远空)。本服务把
 * "扫描结果"变成"资产库里的角色":
 *
 *   createCardReadyAsset(sessionId): 仅凭原始照片跑 AI Interpreter + Character
 *     Generator(秒级, 不依赖 3D mesh), 立即落库一个 generationStatus='card_ready'
 *     的 WorldAsset, 返回 assetId。移动端拿到 assetId 即可秒显示角色卡。
 *
 *   attachMesh(assetId, meshUrl, ...): 后台混元 3D 完成后调用, 把 mesh 填进资产
 *     并置 generationStatus='complete'。
 *
 *   markMeshFailed(assetId, reason): 3D 失败/超时时调用, 资产保留(卡片+属性仍在),
 *     generationStatus='mesh_failed', 用户可重试 3D。
 */
@Injectable()
export class AssetCreationService {
  private readonly logger = new Logger(AssetCreationService.name);

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(ScanSession)
    private readonly scanSessionRepo: Repository<ScanSession>,
    private readonly aiInterpreter: AIInterpreterService,
    private readonly characterGenerator: CharacterGeneratorService,
    private readonly abilityMapping: AbilityMappingService,
  ) {}

  /**
   * 仅生成角色卡数据(AI 属性), 不落库。
   * 游客本地试用用此方法: 看到角色卡但不创建资产; 登录后才走 createCardReadyAsset 真正保存。
   *
   * @param imageUrls 公网图片 URL
   * @param userId    可选: 已登录用户时传入, 用于计算能力加成预览 (Phase A 飞轮)。
   *                  游客不传 → multiplier=1.0 (无加成预览, 登录保存后才吃加成)。
   */
  async generateCharacterCardOnly(
    imageUrls: string[],
    userId?: string,
  ): Promise<{ profile: any; semantic: SemanticDescription; abilitySnapshot: any | null; portraitUrl: string | null }> {
    const interp = await this.aiInterpreter.analyze('', imageUrls, 'default');
    const semantic = interp.semanticDescription;
    const profile = await this.characterGenerator.generateCharacter(semantic);

    let abilitySnapshot: any = null;
    if (userId) {
      try {
        abilitySnapshot = await this.abilityMapping.computeSnapshot(userId, profile.stats);
        // 预览也展示加成后的属性 (profile 是返回给客户端的普通对象, 附加字段无副作用)
        (profile as any).effectiveStats = abilitySnapshot.effectiveStats;
      } catch (e) {
        this.logger.warn(`Ability snapshot (card-only) failed for user ${userId}: ${(e as Error).message}`);
      }
    }

    return {
      profile,
      semantic,
      abilitySnapshot,
      portraitUrl: imageUrls && imageUrls.length > 0 ? imageUrls[0] : null,
    };
  }

  /**
   * 从扫描会话创建一个 card_ready 资产(不等 3D)。
   * @param sessionId 扫描会话 id
   * @param imageUrls 该会话的公网图片 URL(用于 AI 视觉分析)
   * @param opts.source 'scanned'(已登录) | 'guest_trial'(游客本地试用, 不应调用此方法落库)
   */
  async createCardReadyAsset(
    sessionId: string,
    imageUrls: string[],
    opts: {
      ownerId: string;
      scanMode: 'quick' | 'detail' | 'room';
      source?: string;
      /** Phase A 飞轮: 指定能力加成来源 agent; 不传则自动选 owner 最强 agent */
      sourceAgentAccountId?: string | null;
    } = {
      ownerId: '',
      scanMode: 'quick',
    },
  ): Promise<{ assetId: string; profile: any; semantic: SemanticDescription; abilitySnapshot: any | null; portraitUrl: string | null }> {
    const ownerId = opts.ownerId;
    // detail/room 都归到实体允许的 'detail'(scanMode enum 只有 quick/detail)
    const scanMode = opts.scanMode === 'quick' ? 'quick' : 'detail';

    // 1) AI 语义理解 — 主路径仅用照片(meshUrl 传空字符串, interpreter 不依赖 mesh 几何)
    const interp = await this.aiInterpreter.analyze('', imageUrls, 'default');
    const semantic = interp.semanticDescription;

    // 2) 角色生成(名字/属性/技能/性格/背景) — 秒级, 不需要 3D
    const profile = await this.characterGenerator.generateCharacter(semantic);

    // 2.5) 能力飞轮 (Phase A): 读真实 agent 战绩算加成快照。
    //   - canonical stats 列保持不变 (R3.1 不变式 / property 测试)。
    //   - 加成写入 abilitySnapshot, 战斗/展示读 effectiveStats (确定性快照, design §5)。
    //   失败安全降级为无加成, 不阻塞资产创建。
    let abilitySnapshot: any = null;
    let sourceAgentAccountId: string | null = null;
    try {
      abilitySnapshot = await this.abilityMapping.computeSnapshot(
        ownerId,
        profile.stats,
        opts.sourceAgentAccountId ?? null,
      );
      sourceAgentAccountId = abilitySnapshot.sourceAgentAccountId ?? null;
    } catch (e) {
      this.logger.warn(`Ability snapshot failed for owner ${ownerId}: ${(e as Error).message}`);
    }

    // 3) 落库 card_ready 资产
    const asset = this.worldAssetRepo.create({
      ownerId,
      originalCreatorId: ownerId,
      name: profile.name,
      category: 'character',
      scanMode,
      meshUrl: null,
      styledMeshUrl: null,
      // 2D 立绘兜底: 用第一张扫描照片做角色形象, 保证 100% 有图(不等 3D)
      portraitUrl: imageUrls && imageUrls.length > 0 ? imageUrls[0] : null,
      styleType: 'cartoon',
      semanticDescription: semantic as any,
      stats: profile.stats as any,
      skills: profile.skills as any,
      personalityTraits: profile.personalityTraits,
      backstory: profile.backstory,
      behaviorTree: profile.behaviorTree as any,
      source: opts.source || 'scanned',
      generationStatus: 'card_ready',
      abilitySnapshot,
      sourceAgentAccountId,
    } as any);

    const saved = await this.worldAssetRepo.save(asset);

    // 关联回扫描会话(便于后续把 3D 结果落到正确的资产)
    try {
      await this.scanSessionRepo.update(sessionId, { resultAssetId: saved.id });
    } catch (e) {
      this.logger.warn(`Failed to link session ${sessionId} → asset ${saved.id}: ${(e as Error).message}`);
    }

    this.logger.log(
      `Card-ready asset ${saved.id} created from session ${sessionId} ` +
      `(name="${profile.name}", owner=${ownerId}, ` +
      `abilityMultiplier=${abilitySnapshot?.multiplier ?? 'n/a'})`,
    );

    return { assetId: saved.id, profile, semantic, abilitySnapshot, portraitUrl: (asset as any).portraitUrl ?? null };
  }

  /**
   * 后台 3D 完成后, 把 mesh 填进资产并标记 complete。
   * 通过 sessionId 找到 resultAssetId 对应的资产(若 card 阶段已创建);
   * 若没有(老链路/未创建 card), 此处兜底创建一个 complete 资产。
   */
  async attachMeshBySession(
    sessionId: string,
    meshUrl: string,
    thumbnailUrl: string | undefined,
    fallback: { ownerId: string; scanMode: 'quick' | 'detail' | 'room'; imageUrls: string[] },
  ): Promise<{ assetId: string }> {
    const session = await this.scanSessionRepo.findOne({ where: { id: sessionId } });
    const existingAssetId = session?.resultAssetId || null;

    if (existingAssetId) {
      await this.worldAssetRepo.update(existingAssetId, {
        meshUrl,
        styledMeshUrl: meshUrl, // Phase 1: styled = raw(风格化管线 Phase 2)
        generationStatus: 'complete',
      });
      this.logger.log(`Asset ${existingAssetId} mesh attached (session ${sessionId}) → complete`);
      return { assetId: existingAssetId };
    }

    // 兜底: card 未创建(例如 generate 时 AI 属性失败), 现在用 mesh + 照片补一个完整资产
    this.logger.warn(
      `Session ${sessionId} has no card-ready asset; creating a complete asset now (fallback).`,
    );
    const created = await this.createCardReadyAsset(sessionId, fallback.imageUrls, {
      ownerId: fallback.ownerId,
      scanMode: fallback.scanMode,
      source: 'scanned',
    });
    await this.worldAssetRepo.update(created.assetId, {
      meshUrl,
      styledMeshUrl: meshUrl,
      generationStatus: 'complete',
    });
    return { assetId: created.assetId };
  }

  /**
   * 3D 失败/超时: 资产保留, 标记 mesh_failed(卡片+属性仍可用, 可重试 3D)。
   */
  async markMeshFailedBySession(sessionId: string, reason: string): Promise<void> {
    const session = await this.scanSessionRepo.findOne({ where: { id: sessionId } });
    const assetId = session?.resultAssetId;
    if (!assetId) {
      this.logger.warn(`Session ${sessionId} mesh failed but no asset to mark (${reason}).`);
      return;
    }
    await this.worldAssetRepo.update(assetId, { generationStatus: 'mesh_failed' });
    this.logger.log(`Asset ${assetId} marked mesh_failed (session ${sessionId}): ${reason}`);
  }
}
