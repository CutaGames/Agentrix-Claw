import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type {
  CreationScanMaterial,
  QualityGateResult,
  ScanAssetGenResult,
  ScanIntakeResult,
  ScanQualityCriterion,
} from '../../../shared/types/creation-scan';
import type { CreationPreview } from '../../../shared/types/creation';

/**
 * DI 令牌 —— 可替换的扫描质量判据钩子(world-creation-feed task 4.3)。
 *
 * 默认绑定 {@link PlaceholderScanQualityCriterion}(占位判据);后续可在模块中改绑更严格
 * 的实现(美学评分/连贯性/相似度等),接入层 {@link ScanQualityGateService} **无需改动**
 * (需求 2.12 / 开放问题 1)。测试亦可注入自定义判据以验证可替换性。
 */
export const SCAN_QUALITY_CRITERION = Symbol('SCAN_QUALITY_CRITERION');

/**
 * 占位质量判据(可替换)—— design §Creation Authoring 指定的初期客观判据:
 * **"是否有风格化 mesh/立绘 + 基本完整度"**,且**绝不直出原始扫描照片**(需求 11.4)。
 *
 * 判定要点(全部满足方 pass):
 *  1. **有风格化形象**:`styledMeshUrl` 或 `styledPortraitUrl` 至少其一存在(非空)。
 *     —— 仅有 `rawPhotoUrl`/`rawMeshUrl`(未风格化)视为不达标(需求 11.3/11.4)。
 *  2. **基本完整度**:`generationStatus` 不为 `mesh_failed`;有非空 `name`;`semanticComplete` 为真。
 *
 * 该实现为纯函数式判据(无副作用、无 DB),便于单测与后续整体替换。
 */
@Injectable()
export class PlaceholderScanQualityCriterion implements ScanQualityCriterion {
  evaluate(result: ScanAssetGenResult): QualityGateResult {
    const reasons: string[] = [];

    const hasStyledMesh = isNonEmpty(result?.styledMeshUrl);
    const hasStyledPortrait = isNonEmpty(result?.styledPortraitUrl);

    // 判据 1 — 必须有风格化形象(mesh 或立绘);否则不达标。
    if (!hasStyledMesh && !hasStyledPortrait) {
      // 进一步区分:仅有原始扫描照片/原始 mesh → 明确提示"未经风格化,不得直出原图"。
      if (isNonEmpty(result?.rawPhotoUrl) || isNonEmpty(result?.rawMeshUrl)) {
        reasons.push('仅有未风格化的原始扫描产物(原图/原始 mesh),不得直出为成品形象(需求 11.4)');
      } else {
        reasons.push('缺少风格化形象(风格化 mesh 或风格化立绘),无法作为成品资产呈现');
      }
    }

    // 判据 2 — 基本完整度。
    if (result?.generationStatus === 'mesh_failed') {
      reasons.push('资产生成失败/超时(mesh_failed),完整度不足');
    }
    if (!isNonEmpty(result?.name)) {
      reasons.push('资产缺少名称,完整度不足');
    }
    if (result?.semanticComplete === false) {
      reasons.push('AI 语义/属性不完整,完整度不足');
    }

    return reasons.length === 0 ? { pass: true } : { pass: false, reasons };
  }
}

/**
 * ScanQualityGateService — 扫描创作输入接入 + 质量门槛接入层(world-creation-feed task 4.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 2.12:把扫描结果作为创作素材纳入,但**受质量门槛约束**(风格化、连贯、可用);
 *     未达门槛时**不作为成品呈现**。
 *   - 需求 11.4:输出形象须经风格化生成或统一占位,满足质量门槛;不达标不向用户呈现成品形象,
 *     且**绝不直出原始扫描照片**。
 *
 * 设计(design §Creation Authoring):复用 world-engine scan→asset 管线产物,接入层只做两件事——
 *   1. 经**可替换**的质量门槛钩子 {@link qualityGate}(注入 {@link SCAN_QUALITY_CRITERION})判定;
 *   2. 达标 → 产出**仅含风格化形象**的创作素材 + 成品预览({@link intake});
 *      不达标 → 返回结构化拒绝(`status='needs_restyle'` + reasons),**不产出成品形象**。
 *
 * 本服务接收"资产生成结果"(归一化 {@link ScanAssetGenResult}),不直接驱动扫描管线 ——
 * 保持解耦、纯逻辑、可单测。需要时调用方先用 {@link normalizeWorldAssetForGate} 把
 * world-engine `WorldAsset` 投影为归一化结果再传入。
 */
@Injectable()
export class ScanQualityGateService {
  private readonly logger = new Logger(ScanQualityGateService.name);
  private readonly criterion: ScanQualityCriterion;

  constructor(
    /** 可替换的质量判据钩子(默认占位实现;缺省注入时回退占位,保证可独立实例化测试)。 */
    @Optional()
    @Inject(SCAN_QUALITY_CRITERION)
    criterion?: ScanQualityCriterion,
  ) {
    this.criterion = criterion ?? new PlaceholderScanQualityCriterion();
  }

  /**
   * 质量门槛钩子 —— `qualityGate(assetGenResult): { pass, reasons? }`(需求 2.12)。
   * 委托当前注入的可替换判据;判据可在模块层整体替换而本方法签名不变。
   */
  qualityGate(result: ScanAssetGenResult): QualityGateResult {
    return this.criterion.evaluate(result);
  }

  /**
   * 接入扫描→资产生成结果作为创作输入(需求 2.12 / 11.4)。
   *
   * 达标:返回 `accepted=true` + 风格化创作素材 + 成品预览(仅风格化形象)。
   * 不达标:返回 `accepted=false`、`status='needs_restyle'` 与结构化 `reasons`,
   *        **不返回 material/preview**(即不向用户呈现成品形象)。
   */
  intake(result: ScanAssetGenResult): ScanIntakeResult {
    const gate = this.qualityGate(result);

    if (!gate.pass) {
      this.logger.log(
        `Scan asset rejected by quality gate (asset=${result?.assetId ?? 'n/a'}): ` +
          `${(gate.reasons ?? []).join('; ')} — not surfaced as finished (需求 2.12/11.4)`,
      );
      return {
        accepted: false,
        status: 'needs_restyle',
        reasons: gate.reasons ?? [],
      };
    }

    const material = this.toMaterial(result);
    const preview = this.toStylizedPreview(result);

    this.logger.log(
      `Scan asset accepted as creation material (asset=${result?.assetId ?? 'n/a'}, ` +
        `name="${material.name}") with stylized preview`,
    );

    return { accepted: true, status: 'accepted', material, preview };
  }

  // ============================================================
  // Internal — 达标产物投影(仅风格化形象,绝不含原图)
  // ============================================================

  /** 把达标的扫描结果投影为创作素材(剔除 rawPhotoUrl/rawMeshUrl)。 */
  private toMaterial(result: ScanAssetGenResult): CreationScanMaterial {
    return {
      sourceAssetId: result.assetId ?? null,
      name: (result.name ?? '').trim() || '未命名素材',
      category: result.category ?? 'character',
      styledMeshUrl: result.styledMeshUrl ?? null,
      styledPortraitUrl: result.styledPortraitUrl ?? null,
      styleType: result.styleType ?? null,
    };
  }

  /**
   * 构造成品预览物 —— 仅引用风格化形象(优先风格化立绘作封面,其次风格化 mesh 首帧)。
   * 绝不使用 `rawPhotoUrl`(需求 11.4:不直出原始扫描照片)。
   * 仅在 {@link intake} 判定达标(已保证至少一种风格化形象存在)后调用。
   */
  private toStylizedPreview(result: ScanAssetGenResult): CreationPreview {
    if (isNonEmpty(result.styledPortraitUrl)) {
      return { kind: 'cover', url: result.styledPortraitUrl as string };
    }
    // 达标但无风格化立绘 → 用风格化 mesh 的首帧作为预览。
    return { kind: 'first_frame', url: result.styledMeshUrl as string };
  }
}

/**
 * 把 world-engine `WorldAsset`(或 `AssetCreationService` 落库资产)投影为质量门槛输入。
 *
 * **关键映射(需求 11.4)**:当前 scan→asset 管线 Phase 1 把 `portraitUrl` 直接填为**原始
 * 扫描照片**(`imageUrls[0]`),`styledMeshUrl` 在 mesh 就绪前为 null。因此本投影**保守地**
 * 把 `WorldAsset.portraitUrl` 归类为 `rawPhotoUrl`(未风格化),`meshUrl` 归类为 `rawMeshUrl`,
 * 仅把 `styledMeshUrl` 视为风格化产物。这样"仅有原图/原始 mesh"的 card_ready 资产会被门槛
 * **正确拦截**(不直出原图);待风格化管线产出真正的风格化立绘/网格后,在此处补充映射即可。
 *
 * 入参用宽松结构(只取门槛关心的字段),避免对 world-engine 实体形成硬编译依赖。
 */
export function normalizeWorldAssetForGate(asset: {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  styleType?: string | null;
  generationStatus?: string | null;
  meshUrl?: string | null;
  styledMeshUrl?: string | null;
  portraitUrl?: string | null;
  semanticDescription?: unknown;
}): ScanAssetGenResult {
  return {
    assetId: asset.id ?? null,
    name: asset.name ?? null,
    category: asset.category ?? null,
    styleType: asset.styleType ?? null,
    generationStatus: (asset.generationStatus as ScanAssetGenResult['generationStatus']) ?? null,
    // Phase 1:styledMeshUrl 为唯一可信的风格化产物;portrait/mesh 视为未风格化原始产物。
    styledMeshUrl: asset.styledMeshUrl ?? null,
    styledPortraitUrl: null,
    rawPhotoUrl: asset.portraitUrl ?? null,
    rawMeshUrl: asset.meshUrl ?? null,
    semanticComplete: hasSemantic(asset.semanticDescription),
  };
}

/** 语义描述是否非空(基本完整度判据)。 */
function hasSemantic(semantic: unknown): boolean {
  return (
    typeof semantic === 'object' &&
    semantic !== null &&
    Object.keys(semantic as Record<string, unknown>).length > 0
  );
}

/** 非空字符串判定(trim 后长度 > 0)。 */
function isNonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
