import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WorldPlot } from '../entities/world-plot.entity';
import { EcsWorldService } from './ecs-world.service';
import { AgentBuilderService } from './agent-builder.service';
import { resolveCreationRouting } from './creation-routing';

import type {
  ContinuumEditRequest,
  ContinuumEditResponse,
  RevertEcsWorldRequest,
  RevertEcsWorldResponse,
  EcsEditResponse,
} from '../../../../shared/types/world-creation-api';

/**
 * CreationContinuumService — 创作连续谱编排 (design §2.4, R3.4 / R3.5 / R3.7).
 *
 * 三模式无损切换的本质保证 (design §2.4)：prompt-drive / co-edit / hand-build 三种
 * 编辑入口 (`generateDraft` / `applyNlEdit` / `applyDirectEdit`) 写入 **同一个
 * ECS_World + 同一条 diff/version 链**——它们只是"谁来产生 ops"的区别。本服务是这条
 * 不变量的统一入口 (轻 orchestrator)，不重建任何编辑逻辑：
 *
 *  - **{@link continueEditing}** — 按 `mode` 在 **Plot 最新已提交版本** 之上继续编辑：
 *    每个模式都读取最新版本作为基线、经既有入口追加一个 diff，因此模式间切换
 *    无数据丢失 (R3.4)。每次提交后将 Plot 当前 ECS_World 指针前移到新版本，使
 *    "最新版本"在任意模式下保持一致 (避免 pointer 滞后导致后续模式覆盖丢失)。
 *  - **Mobile Tier_C 路由 (R3.7)** — 经纯函数 {@link resolveCreationRouting} 判定：
 *    Mobile 发起的 Tier_C 创作不在本地执行，而是返回 `dispatched` 决策派发到
 *    Desktop / Agent (完整 Creation_Task_Queue 在 task 20.x 落地，此处为接入点)。
 *  - **{@link revert}** — 复用 {@link EcsWorldService.revert} 从 diff 历史恢复到先前
 *    ECS_World 状态 (R3.5)，并同步前移当前版本指针。
 */
@Injectable()
export class CreationContinuumService {
  private readonly logger = new Logger(CreationContinuumService.name);

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    /** 复用 ECS_World diff/version/revert 通道 (NL/直接编辑 + revert)。 */
    private readonly ecsWorldService: EcsWorldService,
    /** 复用 prompt 驱动生成 (promptDrive 模式)。 */
    private readonly agentBuilderService: AgentBuilderService,
  ) {}

  // ============================================================
  // R3.4 / R3.7 — Unified continuum edit entry (mode switching)
  // ============================================================

  /**
   * R3.4 / R3.7 — 在同一 ECS_World 上按 `mode` 继续编辑 (三模式无损切换)，或对 Mobile
   * 发起的 Tier_C 创作返回派发决策。
   *
   * 流程 (server-authoritative)：
   *  1. **加载 Plot**：其声明 Substrate_Tier 是创作天花板与路由依据。
   *  2. **路由判定 (R3.7)**：Mobile + Tier_C → 不本地执行，返回 `dispatched` + 目标
   *     (desktop/agent)；其余继续本地编辑。
   *  3. **按模式路由到既有入口** (同一 diff/version 通道，故切换无数据丢失 R3.4)：
   *     - `promptDrive` → {@link AgentBuilderService.generateDraft} (在最新版本之上生成)。
   *     - `coEdit` (有 `instruction`) → {@link EcsWorldService.applyNlEdit}。
   *     - `coEdit` (有 `ops`) / `handBuild` → {@link EcsWorldService.applyDirectEdit}。
   *  4. **指针前移**：提交成功后将 Plot.ecsVersionId 前移到新版本，保证"最新版本"在
   *     任意后续模式中一致 (无损切换的关键)。
   *
   * @param userId  触发创作的已认证用户 id (配额计量 / author 归因)。
   * @param plotId  目标 Plot id。
   * @param req     模式 + 模式特定载荷 + 可选 surface / baseVersionId。
   */
  async continueEditing(
    userId: string,
    plotId: string,
    req: ContinuumEditRequest,
  ): Promise<ContinuumEditResponse> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    // R3.7 — Mobile Tier_C 创作不在本地执行；返回派发决策 (接入点，完整队列见 20.x)。
    const surface = req.surface ?? 'desktop';
    const routing = resolveCreationRouting(surface, plot.substrateTier, req.dispatchTarget);
    if (routing.mustDispatch) {
      this.logger.log(
        `Plot ${plotId} ${req.mode} creation on ${surface} dispatched to ` +
          `${routing.target} (Tier_${plot.substrateTier}) — not run locally (R3.7)`,
      );
      return { outcome: 'dispatched', mode: req.mode, dispatch: routing };
    }

    switch (req.mode) {
      case 'promptDrive':
        return this.applyPromptDrive(userId, plot, req);
      case 'coEdit':
      case 'handBuild':
        return this.applyDiffEdit(plot, req);
      default:
        return {
          outcome: 'applied',
          mode: req.mode,
          error: {
            error: 'SCHEMA_INVALID',
            detail: `Unknown creation mode: ${String((req as ContinuumEditRequest).mode)}`,
          },
        };
    }
  }

  /**
   * promptDrive — 在 Plot 最新已提交版本之上生成。先把指针同步到最新 (避免
   * generateDraft 读到滞后的 baseline 而丢失前一模式的编辑)，再委托
   * {@link AgentBuilderService.generateDraft} (其内部已在 baseline 之上追加 diff 并前移指针)。
   */
  private async applyPromptDrive(
    userId: string,
    plot: WorldPlot,
    req: ContinuumEditRequest,
  ): Promise<ContinuumEditResponse> {
    if (!req.prompt) {
      return {
        outcome: 'applied',
        mode: 'promptDrive',
        error: {
          error: 'SCHEMA_INVALID',
          detail: 'promptDrive mode requires a non-empty prompt',
        },
      };
    }

    await this.syncPointerToLatest(plot);

    const res = await this.agentBuilderService.generateDraft(userId, plot.id, {
      prompt: req.prompt,
    });

    return {
      outcome: 'applied',
      mode: 'promptDrive',
      versionId: res.versionId || undefined,
      ecsWorld: res.ecsWorld,
      error: res.error,
    };
  }

  /**
   * coEdit / handBuild — 在 Plot 最新已提交版本之上追加一个 diff。
   *  - coEdit + `instruction` → NL 编辑 ({@link EcsWorldService.applyNlEdit})。
   *  - coEdit + `ops` / handBuild → 直接操作编辑 ({@link EcsWorldService.applyDirectEdit})。
   * 两者均写入与 promptDrive 相同的 ECS_World 结构 / diff 通道 → 无损切换 (R3.4)。
   */
  private async applyDiffEdit(
    plot: WorldPlot,
    req: ContinuumEditRequest,
  ): Promise<ContinuumEditResponse> {
    const baseVersionId =
      req.baseVersionId ??
      (await this.ecsWorldService.getCurrentVersion(plot.id))?.id ??
      null;

    if (!baseVersionId) {
      return {
        outcome: 'applied',
        mode: req.mode,
        error: {
          error: 'SCHEMA_INVALID',
          detail:
            `Plot ${plot.id} has no ECS_World version yet; generate a draft ` +
            `(promptDrive) before co-edit / hand-build`,
        },
      };
    }

    // coEdit 优先按 NL 处理 (有 instruction)；handBuild 与带 ops 的 coEdit 走直接操作。
    const useNlEdit =
      req.mode === 'coEdit' &&
      typeof req.instruction === 'string' &&
      req.instruction.length > 0;

    let res: EcsEditResponse;
    if (useNlEdit) {
      res = await this.ecsWorldService.applyNlEdit(plot.id, {
        instruction: req.instruction as string,
        baseVersionId,
      });
    } else {
      res = await this.ecsWorldService.applyDirectEdit(plot.id, {
        ops: req.ops ?? [],
        baseVersionId,
      });
    }

    // 提交成功 (versionId 非空且无 error) → 前移当前版本指针，保证后续模式读到最新。
    if (!res.error && res.diff.versionId) {
      await this.advancePointer(plot.id, res.diff.versionId);
    }

    return {
      outcome: 'applied',
      mode: req.mode,
      versionId: res.diff.versionId || undefined,
      ecsWorld: res.ecsWorld,
      diff: res.diff,
      error: res.error,
    };
  }

  // ============================================================
  // R3.5 — Revert to a prior ECS_World state from diff history
  // ============================================================

  /**
   * R3.5 — 从 diff 历史恢复到先前 ECS_World 状态。复用 {@link EcsWorldService.revert}
   * (重放目标版本为一个新版本，保留所有权链线性)，并将 Plot 当前版本指针前移到该新
   * 版本，使 revert 后任意模式的后续编辑都在被恢复的状态之上继续。
   */
  async revert(
    plotId: string,
    req: RevertEcsWorldRequest,
  ): Promise<RevertEcsWorldResponse> {
    const result = await this.ecsWorldService.revert(plotId, req);
    await this.advancePointer(plotId, result.versionId);
    return result;
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * 将 Plot 当前 ECS_World 指针同步到最新已提交版本 (若已滞后)。promptDrive 之前调用，
   * 因为 generateDraft 以 Plot.ecsVersionId 为 baseline——若指针滞后于上一模式的编辑，
   * 不同步会导致生成覆盖丢失之前的工作 (破坏 R3.4 的无损切换)。
   */
  private async syncPointerToLatest(plot: WorldPlot): Promise<void> {
    const latest = await this.ecsWorldService.getCurrentVersion(plot.id);
    if (latest && plot.ecsVersionId !== latest.id) {
      await this.advancePointer(plot.id, latest.id);
      plot.ecsVersionId = latest.id;
    }
  }

  /** 将 Plot 当前 ECS_World 指针前移到指定版本。 */
  private async advancePointer(plotId: string, versionId: string): Promise<void> {
    await this.plotRepo.update({ id: plotId }, { ecsVersionId: versionId });
  }
}
