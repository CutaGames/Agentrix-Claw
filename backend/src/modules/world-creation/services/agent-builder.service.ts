import {
  Injectable,
  Inject,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { QuotaService } from '../../world-engine/services/quota.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { EcsWorldService, type EcsDiffAuthor } from './ecs-world.service';
import { applyPatch, diff as diffWorlds } from '../ecs/ecs-diff';
import { validateEcsWorld } from '../ecs/ecs-schema';
import {
  ECS_GENERATOR_PROVIDER,
  type EcsGeneratorProvider,
} from '../generation/ecs-generator.provider';
import { buildQuotaWarning } from '../generation/quota-warning.mapper';
import {
  generateBattleArena,
  type BattleArenaGeneratorOptions,
} from '../arena/battle-arena-generator';
import {
  generateGallery,
  type GalleryGeneratorOptions,
} from '../demos/gallery-generator';

import { ECS_VERSION } from '../../../../shared/types/world-creation';

import type {
  GenerateEcsWorldRequest,
  GenerateEcsWorldResponse,
} from '../../../../shared/types/world-creation-api';
import type {
  EcsWorld,
  EcsDiff,
  JsonPatchOp,
  WorldCreationError,
} from '../../../../shared/types/world-creation';

/**
 * Result of binding an Agent_Builder to a Plot (R9.4, design §9.2).
 */
export interface BindAgentToPlotResult {
  plotId: string;
  /** The Agent_Builder now authorized to maintain the Plot's ECS_World. */
  boundAgentId: string;
}

/**
 * A structured autonomous maintenance instruction for an Agent_Builder (R9.5).
 *
 * 自治维护以 **结构化 ECS 编辑 ops** 表达 (JSON Patch RFC 6902)，这正是离线产物
 * "diffable / reversible" 的根基 (design §2.3, R9.5/R9.7)。NL→ops 的生成 (task 14.x)
 * 通过同一 diff 通道接入：生成产出的 ops 交由本方法以 author=agent 落库。
 */
export interface AutonomousTaskInstruction {
  /** Structured ECS edit ops the agent intends to apply (the maintenance change). */
  ops: JsonPatchOp[];
  /** Base version to apply onto; defaults to the Plot's current ECS_World version. */
  baseVersionId?: string;
  /** Optional human-readable description retained for audit context. */
  description?: string;
}

/**
 * Outcome of an autonomous Creation_Task run by a bound Agent_Builder (R9.5/R9.7).
 *
 * 离线产物始终经 tier-validator 约束 (越界即拒，不落库)，提交时标注 author=agent
 * 并写入 diff 历史 → 可读 / 可 diff / 可回滚 (与用户编辑同一通道)。
 */
export interface AutonomousTaskResult {
  /** Whether the autonomous change was committed to the Plot's diff history. */
  committed: boolean;
  /** The diff produced (authorType='agent', authorId=agentId) — present when committed (R9.7). */
  diff?: EcsDiff;
  /** Resulting ECS_World after the change — present when committed. */
  ecsWorld?: EcsWorld;
  /** Structured error when rejected (e.g., TIER_VIOLATION) — no diff is written. */
  error?: WorldCreationError;
}

/**
 * AgentBuilderService — prompt 驱动生成 + Agent_Builder 绑定与离线自治维护
 * (design §2.4 / §9.2 / §11, R3 / R9).
 *
 * 两类职责：
 *  1. **生成 (R3)**：从自然语言 prompt 在 Plot 声明的 Substrate_Tier 内生成 ECS_World
 *     草稿；越界生成被拒。(见 generateDraft，task 14.1。)
 *  2. **绑定 + 离线自治维护 (R9.4–R9.7，本任务 11.2)**：
 *     - {@link bindAgentToPlot} — 校验调用者为 Plot owner，写 WorldPlot.boundAgentId，
 *       授权该 Agent_Builder 对此 Plot 的 ECS_World 执行自治 Creation_Task (R9.4)。
 *     - {@link runAutonomousTask} — 在 Plot 声明 tier 内产出 ECS diff，经 tier-validator
 *       约束后以 author={type:'agent',id:agentId} 经 EcsWorldService 落库，写入 diff
 *       历史 (R9.5/R9.7)；越界即拒、不落库。
 *
 * **离线 ≠ 免审 (R9.6，不可旁路)**：Agent 自治产物复用与用户完全相同的服务链，不存在
 * 任何特权旁路：
 *  - Tier_Validator：离线产出同样经 {@link EcsWorldService.validateTier} 结构性门控。
 *  - Economy_Bridge：本方法只产出 ECS diff，**不**经手任何记账；Agent 若需经济动作仍须
 *    经 EconomyBridgeService 的 server-authoritative + Trust 门控路径 (沙箱/Agent 不可达
 *    金额计算)。
 *  - Trust_Level：绑定要求调用者为 owner；敏感经济动作沿用既有 Trust 门控。
 *  - Resource_Watchdog：Agent 执行的体验逻辑运行时仍受每实例 CPU/内存/帧预算约束。
 *  - Moderation_Pipeline：Agent 产物发布同样经发布前 5 阶段审核 (+ C 级静态扫描)。
 *
 * 复用 world-engine 的配额 / 成本基础设施 (QuotaService)；复用 EcsWorldService 的
 * diff/version 通道 (不重建)。
 */
@Injectable()
export class AgentBuilderService {
  private readonly logger = new Logger(AgentBuilderService.name);

  constructor(
    /** 复用 world-engine 配额 / 成本基础设施 (不重建)。 */
    private readonly quotaService: QuotaService,
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
    /** 复用 ECS_World diff/version/revert 通道 (author 归因、可回滚)。 */
    private readonly ecsWorldService: EcsWorldService,
    /**
     * 可插拔的 prompt → ECS_World 草稿生成后端 (默认占位实现，后续可接入复用 v5 LLM
     * 接入的真实模型)。注入而非硬编码，使 generateDraft 可被单测确定性驱动 (task 14.4)。
     */
    @Inject(ECS_GENERATOR_PROVIDER)
    private readonly ecsGenerator: EcsGeneratorProvider,
  ) {}

  /**
   * R3.1 / R3.6 — 从自然语言 prompt 在 Plot 声明的 Substrate_Tier 内生成 ECS_World
   * 草稿；越界生成被拒并提示违反的 Substrate_Tier 约束。
   *
   * 流程 (server-authoritative，tier 天花板由 Plot 声明决定，不由生成后端决定)：
   *  1. **配额门控**：生成前用既有 world-engine 配额基础设施
   *     ({@link QuotaService.checkMonthlyCostCeiling}) 校验 FREE 月度成本上限；
   *     硬阻断 (100%) → ForbiddenException (R12.3，design Error Handling)。
   *  2. **生成**：委托可插拔 {@link EcsGeneratorProvider}，传入 Plot 的**权威**声明
   *     tier (req.substrateTier 仅作 hint，绝不放宽 Plot 声明 tier — 强约束)。
   *  3. **强约束 tier**：生成产物的 `plotId` / `substrateTier` 由服务端权威覆盖为
   *     Plot 的声明值，使其内容必须在声明 tier 内被校验。
   *  4. **校验**：跑 {@link validateEcsWorld} (结构 schema) + {@link EcsWorldService.validateTier}
   *     (A/B/C 约束)。越界 → 返回结构化 TIER_VIOLATION (含违规项 detail)，**不落库** (R3.6)。
   *     结构非法 → 返回 SCHEMA_INVALID，同样不落库。
   *  5. **落库**：合法则经 {@link EcsWorldService.commitDiff} 落库为草稿版本，author 视
   *     触发者归因 (绑定 Agent_Builder → agent；否则 → user)，并将 Plot 当前 ECS_World
   *     指针前移到新版本。
   *
   * @param userId 触发生成的已认证用户 id (用于配额计量与 author 归因)。
   * @param plotId 目标 Plot id。
   * @param req prompt + 可选 tier hint。
   */
  async generateDraft(
    userId: string,
    plotId: string,
    req: GenerateEcsWorldRequest,
  ): Promise<GenerateEcsWorldResponse> {
    // 0. Plot 必须存在；其声明 tier 是生成的权威天花板 (R3.1)。
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }
    const targetTier = plot.substrateTier;

    // req.substrateTier 仅为 hint，永不放宽 Plot 声明 tier (强约束 in declared tier)。
    if (req.substrateTier && req.substrateTier !== targetTier) {
      return {
        versionId: '',
        ecsWorld: this.emptyWorld(plotId, targetTier),
        error: {
          error: 'TIER_VIOLATION',
          detail:
            `requested Substrate_Tier "${req.substrateTier}" does not match the Plot's ` +
            `declared tier "${targetTier}"; generation must stay within the declared tier`,
        },
      };
    }

    // 1. 配额门控 (R12.2/12.3)：FREE 月度成本触顶 (100%) 则硬阻断生成；
    //    ≥80% 软提醒不阻断，随成功响应透出给调用方 (task 15.2)。
    const ceiling = await this.quotaService.checkMonthlyCostCeiling(userId);
    if (!ceiling.allowed) {
      throw new ForbiddenException({
        statusCode: 429,
        message:
          `Monthly generation cost cap reached ($${ceiling.currentCost.toFixed(2)} / ` +
          `$${ceiling.ceiling}). Generation is blocked until the next billing cycle or an upgrade.`,
        code: 'QUOTA_EXCEEDED',
      });
    }
    const quotaWarning = buildQuotaWarning(ceiling) ?? undefined;

    // 2. 委托生成后端 (默认占位实现；后续可接入真实模型)。
    const draft = await this.ecsGenerator.generateDraft({
      plotId,
      prompt: req.prompt,
      substrateTier: targetTier,
      title: undefined,
    });

    // 3. 服务端权威覆盖 plotId / substrateTier，使内容必须在声明 tier 内被校验。
    const world = {
      ...draft,
      ecsVersion: draft.ecsVersion || ECS_VERSION,
      plotId,
      substrateTier: targetTier,
    };

    // 4a. 结构 schema 校验 (R4.7)。
    const structural = validateEcsWorld(world);
    if (!structural.valid) {
      this.logger.warn(
        `Generated draft for plot ${plotId} failed schema validation: ${structural.errors[0]?.detail}`,
      );
      return {
        versionId: '',
        ecsWorld: world,
        error: structural.errors[0],
        quotaWarning,
      };
    }

    // 4b. Tier 约束校验：越界即拒，不落库，并提示违反的 Substrate_Tier 约束 (R3.6)。
    const violation = this.ecsWorldService.validateTier(world);
    if (violation) {
      this.logger.warn(
        `Generated draft for plot ${plotId} rejected (out of declared Tier_${targetTier}): ${violation.detail}`,
      );
      return {
        versionId: '',
        ecsWorld: world,
        error: violation,
        quotaWarning,
      };
    }

    // 5. 合法 → 落库草稿版本 (diff 通道，author 视触发者归因)。
    const baseVersionId =
      plot.ecsVersionId ??
      (await this.ecsWorldService.getCurrentVersion(plotId))?.id ??
      null;
    const baseWorld = baseVersionId
      ? await this.ecsWorldService.loadWorldAtVersion(baseVersionId)
      : this.emptyWorld(plotId, targetTier);
    const ops = diffWorlds(baseWorld, world);

    const author = this.resolveAuthor(plot, userId);
    const { version } = await this.ecsWorldService.commitDiff(
      plotId,
      baseVersionId,
      world,
      ops,
      author,
    );

    // 让草稿生效：将 Plot 当前 ECS_World 指针前移到新版本。
    await this.plotRepo.update({ id: plotId }, { ecsVersionId: version.id });

    this.logger.log(
      `Generated Tier_${targetTier} ECS_World draft ${version.id} for plot ${plotId} ` +
        `(author=${author.type}:${author.id}, ${ops.length} op(s))`,
    );

    return { versionId: version.id, ecsWorld: world, quotaWarning };
  }

  /**
   * Author 归因 (R9.7，"author=agent 或 user 视触发者")：Plot 绑定了 Agent_Builder
   * → 归因 agent；否则归因触发的 user。
   */
  private resolveAuthor(plot: WorldPlot, userId: string): EcsDiffAuthor {
    return plot.boundAgentId
      ? { type: 'agent', id: plot.boundAgentId }
      : { type: 'user', id: userId };
  }

  /** A minimal, structurally-valid empty world used as a diff baseline / placeholder. */
  private emptyWorld(plotId: string, substrateTier: WorldPlot['substrateTier']) {
    return {
      ecsVersion: ECS_VERSION,
      plotId,
      substrateTier,
      entities: [],
    };
  }

  /**
   * R16.1 — 通过 Agent_Builder 产出 Battle Arena 的 Tier_B ECS_World。
   * 委托纯生成器 {@link generateBattleArena}，并用 tier-validator 做 Tier_B 合规自检
   * （越界即抛错，保证产出 by construction 合规）。出战者不在生成期硬绑，进入时经
   * Cross_Experience_Identity 只读 handle 解析（R16.2）。
   */
  generateBattleArenaWorld(opts: BattleArenaGeneratorOptions): EcsWorld {
    const world = generateBattleArena(opts);
    const violation = this.ecsWorldService.validateTier(world);
    if (violation) {
      throw new Error(`Generated Battle Arena is not Tier_B-compliant: ${violation.detail}`);
    }
    return world;
  }

  /**
   * R14.1/R14.2 — 通过 Agent_Builder 从 Mobile prompt 产出 A 级个人展厅 / 宫殿的
   * Tier_A ECS_World。委托纯生成器 {@link generateGallery}（仅声明式场景图：展品
   * mesh、灯光、展台、UI 标牌；无 DSL 规则、无 logicModules、无 logicModuleRef），
   * 并用 tier-validator 做 Tier_A 合规自检——含任何 rules / logicModules 即抛错，
   * 保证产出 by construction 合规、无可执行逻辑（R14.2）。
   *
   * 生成产物经 EcsWorldService 落库后即可被 NL / 直接操作编辑（复用同一 ECS_World
   * diff/version 通道，R14.3）；发布后以 L0 隔离级别向访客实例化
   * （{@link SandboxService.renderTierA} / `instantiate('L0')`，R14.4）。
   */
  generateGalleryWorld(opts: GalleryGeneratorOptions): EcsWorld {
    const world = generateGallery(opts);
    const violation = this.ecsWorldService.validateTier(world);
    if (violation) {
      throw new Error(`Generated gallery is not Tier_A-compliant: ${violation.detail}`);
    }
    return world;
  }

  // ============================================================
  // R9.4 — Bind Agent_Builder to a Plot (owner-gated)
  // ============================================================

  /**
   * R9.4 — 将一个 Agent_Builder 绑定到 Plot，授权其对该 Plot 的 ECS_World 执行
   * 自治 Creation_Task。
   *
   * **owner 门控 (server-authoritative)**：仅 Plot 当前 owner (其 AgentAccount.ownerId
   * 等于 ownerUserId) 可绑定；非 owner / 未拥有的地块 → ForbiddenException。绑定写入
   * WorldPlot.boundAgentId (design §9.2)，后续 {@link runAutonomousTask} 据此鉴权。
   *
   * @param plotId 目标 Plot id。
   * @param agentId 要绑定的 Agent_Builder id。
   * @param ownerUserId 经认证的调用者用户 id（必须是 Plot owner）。
   */
  async bindAgentToPlot(
    plotId: string,
    agentId: string,
    ownerUserId: string,
  ): Promise<BindAgentToPlotResult> {
    if (!agentId) {
      throw new ForbiddenException('A valid Agent_Builder id is required to bind');
    }

    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    await this.assertPlotOwner(plot, ownerUserId);

    plot.boundAgentId = agentId;
    await this.plotRepo.save(plot);

    this.logger.log(
      `Bound Agent_Builder ${agentId} to plot ${plotId} (owner user ${ownerUserId})`,
    );

    return { plotId, boundAgentId: agentId };
  }

  // ============================================================
  // R9.5 / R9.7 — Offline autonomous maintenance Creation_Task
  // ============================================================

  /**
   * R9.5 / R9.7 — 由绑定的 Agent_Builder 执行自治 Creation_Task（用户可离线）。
   *
   * 流程（全程不旁路任何既有约束，R9.6）：
   *  1. **授权**：agentId 必须等于 Plot.boundAgentId，否则拒绝 (R9.4)。
   *  2. **基线**：在 Plot 当前 ECS_World 版本（或 instruction.baseVersionId）之上应用
   *     结构化 ops，保留未受影响实体 (diffable)。
   *  3. **Tier 门控**：对产出世界跑 {@link EcsWorldService.validateTier}；越界
   *     (TIER_VIOLATION) → 拒绝且**不落库**（受 tier-validator 约束）。
   *  4. **落库**：经 {@link EcsWorldService.commitDiff} 以 author={type:'agent',id:agentId}
   *     写入快照 + diff 历史 → 可读 / 可 diff / 可回滚 (R9.7)，并将 Plot 当前版本指针
   *     前移到新版本，使离线维护"生效"。
   *
   * 本方法只产出 ECS diff，绝不经手记账/打款；Agent 的经济动作仍须经
   * EconomyBridgeService 的 server-authoritative + Trust 门控路径 (R9.6)。
   *
   * @param plotId 被维护的 Plot id。
   * @param agentId 执行维护的 Agent_Builder id（须已绑定到该 Plot）。
   * @param instruction 结构化维护指令（ECS 编辑 ops）。
   */
  async runAutonomousTask(
    plotId: string,
    agentId: string,
    instruction: AutonomousTaskInstruction,
  ): Promise<AutonomousTaskResult> {
    // 1. 授权 (R9.4)：Agent 必须已绑定到该 Plot 才能自治维护。
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }
    if (!plot.boundAgentId || plot.boundAgentId !== agentId) {
      throw new ForbiddenException(
        `Agent ${agentId} is not bound to plot ${plotId}; autonomous maintenance denied`,
      );
    }

    // 2. 解析基线版本（维护作用在既有 ECS_World 之上）。
    const baseVersionId =
      instruction.baseVersionId ??
      (await this.ecsWorldService.getCurrentVersion(plotId))?.id ??
      null;
    if (!baseVersionId) {
      return {
        committed: false,
        error: {
          error: 'SCHEMA_INVALID',
          detail: `Plot ${plotId} has no ECS_World version to maintain`,
        },
      };
    }

    const baseWorld = await this.ecsWorldService.loadWorldAtVersion(baseVersionId);
    const ops = instruction.ops ?? [];

    // 3. 应用 ops → 产出世界（保留未受影响实体）。
    let resultingWorld: EcsWorld;
    try {
      resultingWorld = applyPatch(baseWorld, ops);
    } catch (err) {
      return {
        committed: false,
        error: {
          error: 'SCHEMA_INVALID',
          detail: this.toDetail(err, 'failed to apply autonomous edit ops'),
        },
      };
    }

    // 4. Tier 门控（受 tier-validator 约束）：离线产出越界即拒，不落库 (R9.6)。
    const violation = this.ecsWorldService.validateTier(resultingWorld);
    if (violation) {
      this.logger.warn(
        `Autonomous task by agent ${agentId} on plot ${plotId} rejected: ${violation.detail}`,
      );
      return { committed: false, error: violation };
    }

    // 5. 以 author=agent 落库 → diff 历史归因 + 可回滚 (R9.5/R9.7)。
    const author: EcsDiffAuthor = { type: 'agent', id: agentId };
    const { version, diff } = await this.ecsWorldService.commitDiff(
      plotId,
      baseVersionId,
      resultingWorld,
      ops,
      author,
    );

    // 让离线维护生效：将 Plot 当前 ECS_World 指针前移到新版本。
    await this.plotRepo.update({ id: plotId }, { ecsVersionId: version.id });

    this.logger.log(
      `Agent_Builder ${agentId} committed autonomous diff ${diff.versionId} on plot ${plotId} ` +
        `(${ops.length} op(s)${instruction.description ? `: ${instruction.description}` : ''})`,
    );

    return { committed: true, diff, ecsWorld: resultingWorld };
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * server-authoritative owner 校验：Plot.ownerAccountId → AgentAccount.ownerId
   * 必须等于 ownerUserId，否则 ForbiddenException。
   */
  private async assertPlotOwner(plot: WorldPlot, ownerUserId: string): Promise<void> {
    if (!ownerUserId) {
      throw new ForbiddenException('An authenticated owner user id is required');
    }
    if (!plot.ownerAccountId) {
      throw new ForbiddenException(
        `Plot ${plot.id} is unowned; only the owner may bind an Agent_Builder`,
      );
    }
    const account = await this.agentAccountRepo.findOne({
      where: { id: plot.ownerAccountId },
    });
    if (!account || account.ownerId !== ownerUserId) {
      throw new ForbiddenException(
        `User ${ownerUserId} is not the owner of plot ${plot.id}; binding denied`,
      );
    }
  }

  private toDetail(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }
}
