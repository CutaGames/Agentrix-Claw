import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcsWorldVersion } from '../entities/ecs-world-version.entity';
import { EcsWorldDiff } from '../entities/ecs-world-diff.entity';
import { applyPatch, diff, deepClone } from '../ecs/ecs-diff';
import { validateTier } from '../ecs/tier-validator';
import { validateEcsWorld } from '../ecs/ecs-schema';
import {
  ECS_EDITOR_PROVIDER,
  type EcsEditorProvider,
} from '../generation/ecs-editor.provider';
import {
  ECS_VERSION,
  type EcsWorld,
  type EcsDiff,
  type EcsAuthorType,
  type JsonPatchOp,
  type WorldCreationError,
} from '../../../../shared/types/world-creation';
import type {
  NlEditRequest,
  DirectEditRequest,
  EcsEditResponse,
  RevertEcsWorldRequest,
  RevertEcsWorldResponse,
  EcsWorldHistoryResponse,
} from '../../../../shared/types/world-creation-api';

/** Author attribution for a diff (design §2.3, R9.7). Defaults to the acting user. */
export interface EcsDiffAuthor {
  type: EcsAuthorType;
  id: string;
}

const DEFAULT_AUTHOR: EcsDiffAuthor = { type: 'user', id: 'user' };

/**
 * EcsWorldService — ECS_World 规范表示、diff / version / revert (design §2, R3/R4).
 *
 * 管理 `ecs_world_versions` (快照锚点) 与 `ecs_world_diffs` (增量链)：
 *  - 每次编辑产出一个结构化 JSON Patch (RFC 6902) diff (保留未受影响实体)，
 *    并落库一个新版本快照 + 一条 diff 记录 (标注 author = user / agent)。
 *  - revert 重放到目标 versionId，记录一条前向 diff (current → target)，所有权链保持线性。
 *  - 序列化往返保证 `deserialize(serialize(W)) ≡ W` (Property 1)。
 *
 * diff/apply 纯函数见 `../ecs/ecs-diff`，自包含 RFC 6902，无三方依赖，
 * 不依赖 ecs-schema (2.1) / tier-validator (2.3) 等并行任务的导出。
 */
@Injectable()
export class EcsWorldService {
  constructor(
    @InjectRepository(EcsWorldVersion)
    private readonly versionRepo: Repository<EcsWorldVersion>,
    @InjectRepository(EcsWorldDiff)
    private readonly diffRepo: Repository<EcsWorldDiff>,
    /**
     * Pluggable NL → ECS_World edit backend (default placeholder; later a real
     * model reusing v5 LLM access). Injected (not hard-coded) so {@link applyNlEdit}
     * is deterministically testable (task 14.4).
     */
    @Inject(ECS_EDITOR_PROVIDER)
    private readonly ecsEditor: EcsEditorProvider,
  ) {}

  /**
   * R4.2/4.3/4.4/4.7 — 校验 ECS_World 是否满足其声明 Substrate_Tier 的约束。
   * 委托 {@link validateTier} 纯函数 (tier-validator.ts, task 2.3);
   * 返回结构化 TIER_VIOLATION 错误或 null (合法)。
   */
  validateTier(world: EcsWorld): WorldCreationError | null {
    return validateTier(world);
  }

  // ============================================================
  // Version snapshot helpers (快照锚点)
  // ============================================================

  /** Load the full ECS_World snapshot for a version id (throws if missing). */
  async loadWorldAtVersion(versionId: string): Promise<EcsWorld> {
    const version = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!version) {
      throw new NotFoundException(`ECS_World version not found: ${versionId}`);
    }
    return deepClone(version.snapshotJson);
  }

  /** Get the latest (current) version snapshot for a Plot, or null if none. */
  async getCurrentVersion(plotId: string): Promise<EcsWorldVersion | null> {
    const [latest] = await this.versionRepo.find({
      where: { plotId },
      order: { ts: 'DESC' },
      take: 1,
    });
    return latest ?? null;
  }

  /**
   * Commit a new ECS_World snapshot anchor + its incremental diff record.
   * Returns the persisted version and the structured {@link EcsDiff} artifact.
   */
  async commitDiff(
    plotId: string,
    parentVersionId: string | null,
    resultingWorld: EcsWorld,
    ops: JsonPatchOp[],
    author: EcsDiffAuthor,
  ): Promise<{ version: EcsWorldVersion; diff: EcsDiff }> {
    const ts = Date.now();
    const tsStr = String(ts);

    // 1. Persist the snapshot anchor (its id becomes the new version id).
    const version = await this.versionRepo.save(
      this.versionRepo.create({
        plotId,
        snapshotJson: deepClone(resultingWorld),
        ts: tsStr,
      }),
    );

    // 2. Persist the incremental diff record (readable / attributable chain).
    await this.diffRepo.save(
      this.diffRepo.create({
        plotId,
        parentVersionId,
        authorType: author.type,
        authorId: author.id,
        opsJson: deepClone(ops),
        ts: tsStr,
      }),
    );

    const artifact: EcsDiff = {
      versionId: version.id,
      parent: parentVersionId,
      plotId,
      authorType: author.type,
      authorId: author.id,
      ops,
      ts,
    };

    return { version, diff: artifact };
  }

  // ============================================================
  // R3.3 Direct-manipulation edit → diffable change (task 2.5)
  // ============================================================

  /**
   * R3.3 直接操作编辑 → 写入相同 ECS_World 结构。
   * 在 baseVersionId 之上应用编辑器产出的 JSON Patch ops，保留未受影响实体，
   * 经 schema + tier 校验后落库新版本快照 + diff 记录 (标注 author)。
   *
   * 与 {@link applyNlEdit} 及 Agent_Builder 生成共用 {@link finalizeEdit}：服务端
   * 权威覆盖 plotId / substrateTier（编辑永不升级 Plot 声明 tier），重算结构化 diff
   * （保证 ops 可重放出落库快照、未受影响实体被保留），越界/非法即拒、不落库 (R4.7)。
   */
  async applyDirectEdit(
    plotId: string,
    req: DirectEditRequest,
    author: EcsDiffAuthor = DEFAULT_AUTHOR,
  ): Promise<EcsEditResponse> {
    const baseWorld = await this.loadWorldAtVersion(req.baseVersionId);

    let resultingWorld: EcsWorld;
    try {
      resultingWorld = applyPatch(baseWorld, req.ops);
    } catch (err) {
      return this.rejectedEdit(plotId, req.baseVersionId, baseWorld, author, {
        error: 'SCHEMA_INVALID',
        detail: this.toDetail(err, 'failed to apply direct-manipulation ops'),
      });
    }

    return this.finalizeEdit(plotId, req.baseVersionId, baseWorld, resultingWorld, author);
  }

  // ============================================================
  // R3.2 NL edit — diffable change preserving unaffected entities (task 14.2)
  // ============================================================

  /**
   * R3.2 自然语言编辑 → diffable 修改，保留未受影响实体。
   *
   * 流程（server-authoritative；NL 编辑写入与 Agent_Builder 生成 / 直接操作编辑
   * 完全相同的 ECS_World 结构、同一 diff/version 通道）：
   *  1. **加载基线**：从 `req.baseVersionId` 读取当前 ECS_World 快照。
   *  2. **NL → 修改**：委托可插拔 {@link EcsEditorProvider} 产出修改后的世界，传入
   *     基线世界 + Plot 声明 tier（仅 hint，绝不放宽声明 tier）。默认占位实现仅做
   *     声明式修改、不触碰既有实体。
   *  3. **finalize**：经 {@link finalizeEdit} 权威覆盖 plotId / substrateTier、跑
   *     schema + tier 校验（越界拒，不落库，R4.7），重算结构化 diff（只触及变更路径
   *     → 保留未受影响实体），以 author 标注落库 (R3.2)。
   */
  async applyNlEdit(
    plotId: string,
    req: NlEditRequest,
    author: EcsDiffAuthor = DEFAULT_AUTHOR,
  ): Promise<EcsEditResponse> {
    const baseWorld = await this.loadWorldAtVersion(req.baseVersionId);

    let edited: EcsWorld;
    try {
      edited = await this.ecsEditor.applyNlEdit({
        plotId,
        instruction: req.instruction,
        baseWorld,
        // Plot 声明 tier 是权威天花板；NL 编辑只能在其内修改 (强约束)。
        substrateTier: baseWorld.substrateTier,
      });
    } catch (err) {
      return this.rejectedEdit(plotId, req.baseVersionId, baseWorld, author, {
        error: 'SCHEMA_INVALID',
        detail: this.toDetail(err, 'natural-language edit backend failed'),
      });
    }

    return this.finalizeEdit(plotId, req.baseVersionId, baseWorld, edited, author);
  }

  // ============================================================
  // Shared edit finalization (NL + direct manipulation, R3.2/R3.3/R4.7)
  // ============================================================

  /**
   * Server-authoritative finalize shared by NL and direct-manipulation edits.
   *
   *  - **Authoritative identity**: overwrite `plotId` / `substrateTier` to the
   *    base world's declared values so no edit can escalate the Plot's tier or
   *    retarget the world.
   *  - **Validate**: structural schema ({@link validateEcsWorld}) then
   *    Substrate_Tier constraints ({@link validateTier}). Any violation → reject
   *    with the structured error, leaving the world unchanged (no commit, R4.7).
   *  - **Recompute diff**: `diff(baseWorld, resultingWorld)` emits ops only for
   *    changed paths, so unaffected entities are preserved and the stored ops
   *    deterministically reproduce the committed snapshot.
   *  - **Commit**: persist a new version snapshot + attributed diff record via
   *    {@link commitDiff} (same channel as generation / Agent autonomy).
   */
  private async finalizeEdit(
    plotId: string,
    baseVersionId: string,
    baseWorld: EcsWorld,
    candidate: EcsWorld,
    author: EcsDiffAuthor,
  ): Promise<EcsEditResponse> {
    // Authoritative overwrite: edits never change the Plot id or escalate tier.
    const resultingWorld: EcsWorld = {
      ...candidate,
      ecsVersion: candidate.ecsVersion || ECS_VERSION,
      plotId,
      substrateTier: baseWorld.substrateTier,
    };

    // Structural schema validation (R4.7) — same structure as generation output.
    const structural = validateEcsWorld(resultingWorld);
    if (!structural.valid) {
      return this.rejectedEdit(plotId, baseVersionId, baseWorld, author, structural.errors[0]);
    }

    // Tier-constraint validation: out-of-tier edit is rejected, not committed (R4.7).
    const violation = this.validateTier(resultingWorld);
    if (violation) {
      return this.rejectedEdit(plotId, baseVersionId, baseWorld, author, violation);
    }

    // Structural diff: only changed paths → unaffected entities preserved (R3.2).
    const ops = diff(baseWorld, resultingWorld);

    const { diff: artifact } = await this.commitDiff(
      plotId,
      baseVersionId,
      resultingWorld,
      ops,
      author,
    );

    return { diff: artifact, ecsWorld: resultingWorld };
  }

  /**
   * Build a rejected {@link EcsEditResponse}: a no-op diff (empty ops, no version
   * id) + the unchanged base world + the structured error. Mirrors how
   * generation surfaces a rejection (versionId='') without persisting anything.
   */
  private rejectedEdit(
    plotId: string,
    baseVersionId: string,
    baseWorld: EcsWorld,
    author: EcsDiffAuthor,
    error: WorldCreationError,
  ): EcsEditResponse {
    const noopDiff: EcsDiff = {
      versionId: '',
      parent: baseVersionId,
      plotId,
      authorType: author.type,
      authorId: author.id,
      ops: [],
      ts: Date.now(),
    };
    return { diff: noopDiff, ecsWorld: baseWorld, error };
  }

  private toDetail(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }

  // ============================================================
  // R3.5 Revert → replay to a target version (task 2.5)
  // ============================================================

  /**
   * R3.5 从 diff 历史 revert 到目标 ECS_World 状态。
   * 重放到目标 versionId 的快照，记录一条前向 diff (current → target)；
   * 保留未受目标版本影响的实体 (目标快照即权威状态)，所有权链保持线性。
   */
  async revert(
    plotId: string,
    req: RevertEcsWorldRequest,
    author: EcsDiffAuthor = DEFAULT_AUTHOR,
  ): Promise<RevertEcsWorldResponse> {
    const targetWorld = await this.loadWorldAtVersion(req.targetVersionId);

    const current = await this.getCurrentVersion(plotId);
    if (!current) {
      throw new NotFoundException(`No ECS_World versions exist for plot: ${plotId}`);
    }

    // Forward patch transforming the current state into the target state.
    const ops = diff(current.snapshotJson, targetWorld);

    const { version } = await this.commitDiff(
      plotId,
      current.id,
      targetWorld,
      ops,
      author,
    );

    return { versionId: version.id, ecsWorld: targetWorld };
  }

  // ============================================================
  // diff 链历史
  // ============================================================

  /**
   * diff 链历史 (oldest → newest)。
   * 每条 diff 的"产出版本" (versionId) 由链的线性性推导：
   * diff[i].versionId === diff[i+1].parentVersionId，末条 === 当前版本。
   */
  async getHistory(plotId: string): Promise<EcsWorldHistoryResponse> {
    const rows = await this.diffRepo.find({
      where: { plotId },
      order: { ts: 'ASC', createdAt: 'ASC' },
    });

    const current = await this.getCurrentVersion(plotId);
    const currentVersionId = current?.id ?? null;

    const diffs: EcsDiff[] = rows.map((row, i) => {
      const next = rows[i + 1];
      const producedVersionId = next ? next.parentVersionId : currentVersionId;
      return {
        versionId: producedVersionId ?? '',
        parent: row.parentVersionId,
        plotId: row.plotId,
        authorType: row.authorType,
        authorId: row.authorId,
        ops: row.opsJson,
        ts: Number(row.ts),
      };
    });

    return { diffs };
  }
}
