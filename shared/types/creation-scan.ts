/**
 * 世界创作与浏览(World Creation & Feed)— 扫描作为创作输入 + 质量门槛契约
 * (跨端单一来源)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 2.12:扫描结果作为创作素材纳入,但 **受质量门槛约束**——输出须风格化、连贯、
 *     可作为资产/角色使用;未达门槛时**不作为成品呈现**。
 *   - 需求 11.4:保留"扫描/描述→AI 角色或资产"能力时,输出形象 SHALL 经风格化生成或
 *     统一占位,且 SHALL 满足质量门槛,不达标则**不向用户呈现成品形象**。
 *   - design §Creation Authoring — 扫描作为创作输入(质量门槛):复用 world-engine
 *     scan→asset,预留一个 `qualityGate(assetGenResult) → pass|fail` 钩子;初期以
 *     "是否有风格化 mesh/立绘 + 基本完整度"为**占位判据**,后续可替换为更严格指标。
 *
 * 复用既有共享类型,不重复定义:
 *  - 预览物 `CreationPreview` 复用 `./creation`(成品形象只引用风格化产物)。
 *
 * 所有属性命名使用 camelCase,遵循全局 TypeORM SnakeNamingStrategy(列名自动 snake_case)。
 */

import type { CreationPreview } from './creation';

// ============================================================
// §1 扫描→资产生成结果(质量门槛的输入)
// design: §Creation Authoring — 复用 world-engine scan→asset 产物
// ============================================================

/**
 * 资产生成生命周期状态(对齐 world-engine `WorldAsset.generationStatus`)。
 *  - card_ready:   AI 属性已生成,角色卡可展示,3D mesh 后台生成中
 *  - mesh_pending: 3D job 已提交,轮询中
 *  - complete:     3D mesh 就绪(meshUrl/styledMeshUrl 已填)
 *  - mesh_failed:  3D 生成失败/超时
 */
export type ScanAssetGenerationStatus =
  | 'card_ready'
  | 'mesh_pending'
  | 'complete'
  | 'mesh_failed';

/**
 * 扫描→资产生成结果(归一化视图)—— 质量门槛 `qualityGate(assetGenResult)` 的输入。
 *
 * 这是 world-engine scan→asset 管线产物(`WorldAsset` / `AssetCreationService` 结果)的
 * 归一化投影,**显式区分风格化产物与原始扫描照片**,以便门槛判据据此判断"是否有风格化
 * 形象 + 是否会直出原图"(需求 11.4:绝不直出未风格化的原始扫描照片)。
 *
 * 归一化要点(从 `WorldAsset` 映射,见 {@link normalizeWorldAssetForGate} 后端实现):
 *  - `styledMeshUrl` / `styledPortraitUrl`:**风格化**产物(可作为成品形象的来源)。
 *  - `rawPhotoUrl`:原始扫描照片(=`WorldAsset.portraitUrl`,Phase 1 直接用拍摄照片兜底);
 *    **绝不**作为成品形象直出(需求 11.3/11.4)。
 *  - `rawMeshUrl`:未风格化的原始 mesh(若存在),亦不作为成品形象。
 */
export interface ScanAssetGenResult {
  /** 来源资产 id(若已落库;游客试用可空)。 */
  assetId?: string | null;
  /** 资产名称(完整度判据之一)。 */
  name?: string | null;
  /** 用途类别(character / build_material / decor 等)。 */
  category?: string | null;
  /** 应用的风格化预设(cartoon/pixel-art/fantasy/sci-fi/realistic;无则为空)。 */
  styleType?: string | null;
  /** 资产生成生命周期状态。 */
  generationStatus?: ScanAssetGenerationStatus | null;

  // ── 风格化产物(可作为成品形象来源)──
  /** 风格化 3D mesh 的 URL(已过风格化管线)。 */
  styledMeshUrl?: string | null;
  /** 风格化 2D 立绘的 URL(已过风格化管线)。 */
  styledPortraitUrl?: string | null;

  // ── 原始产物(绝不直出为成品形象)──
  /** 原始扫描照片 URL(需求 11.4:不得直出)。 */
  rawPhotoUrl?: string | null;
  /** 未风格化的原始 mesh URL(若存在)。 */
  rawMeshUrl?: string | null;

  /** 语义/属性是否完整(基本完整度判据之一)。 */
  semanticComplete?: boolean;
}

// ============================================================
// §2 质量门槛结果与可替换判据钩子
// design: §Creation Authoring — qualityGate(assetGenResult) → pass|fail
// ============================================================

/**
 * 质量门槛判定结果 —— `qualityGate(assetGenResult): { pass, reasons? }`(需求 2.12)。
 * `pass=false` 时 `reasons` 给出结构化不达标原因,供创作器友好态展示(task 4.6)。
 */
export interface QualityGateResult {
  /** 是否达标:true=可作为成品形象呈现;false=不达标,不出成品。 */
  pass: boolean;
  /** 不达标原因(机器可读 + 人类可读;pass=true 时可空或为 []) 。 */
  reasons?: string[];
}

/**
 * 质量门槛判据钩子(**可替换**)。
 *
 * 设计预留:初期由占位实现给出"是否有风格化 mesh/立绘 + 基本完整度"的客观判据
 * (design §Creation Authoring);后续可注入更严格的判据实现替换(如美学评分、连贯性
 * 检测、与原物体相似度等),**无需改动接入层**(需求 2.12 / 开放问题 1)。
 */
export interface ScanQualityCriterion {
  /** 对一个扫描→资产生成结果给出 pass|fail 判定。 */
  evaluate(result: ScanAssetGenResult): QualityGateResult;
}

// ============================================================
// §3 扫描创作素材(达标产物)与接入结果
// 需求 2.12:达标 → 作为创作素材纳入;不达标 → 不作为成品呈现
// ============================================================

/**
 * 扫描创作素材(达标产物)—— 仅引用**风格化**形象,**绝不**包含原始扫描照片
 * (需求 11.4)。供创作器作为角色/资产/建材纳入统一创作。
 */
export interface CreationScanMaterial {
  /** 来源资产 id(若有)。 */
  sourceAssetId?: string | null;
  /** 素材名称。 */
  name: string;
  /** 用途类别(character / build_material / decor 等)。 */
  category: string;
  /** 风格化 3D mesh URL(可空,但与 styledPortraitUrl 至少其一存在)。 */
  styledMeshUrl?: string | null;
  /** 风格化 2D 立绘 URL(可空)。 */
  styledPortraitUrl?: string | null;
  /** 应用的风格化预设。 */
  styleType?: string | null;
}

/**
 * 扫描创作输入接入状态。
 *  - accepted:      达标,已作为创作素材纳入(含成品预览)。
 *  - needs_restyle: 未达门槛,不出成品形象;需重新风格化/补全后再试(需求 2.12/11.4)。
 */
export type ScanIntakeStatus = 'accepted' | 'needs_restyle';

/**
 * 扫描创作输入接入结果 —— `intake(assetGenResult)` 的结构化输出。
 *
 * 达标(`accepted=true`):返回 `material`(风格化素材)+ `preview`(成品预览,仅风格化形象)。
 * 不达标(`accepted=false`):返回 `status='needs_restyle'` + `reasons`,**不返回 material/preview**
 * (即不向用户呈现成品形象,需求 2.12/11.4)。
 */
export interface ScanIntakeResult {
  /** 是否接受为成品创作素材。 */
  accepted: boolean;
  /** 接入状态。 */
  status: ScanIntakeStatus;
  /** 不达标原因(needs_restyle 时填)。 */
  reasons?: string[];
  /** 达标时纳入的创作素材(仅风格化形象)。 */
  material?: CreationScanMaterial;
  /** 达标时的成品预览物(仅引用风格化形象,绝不直出原图)。 */
  preview?: CreationPreview;
}
