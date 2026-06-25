import { CreationAuthoringService, toCreationDto } from './creation-authoring.service';
import { ForbiddenException } from '@nestjs/common';
import { CreationService } from './creation.service';
import { CreationRepository } from './creation.repository';
import { CreationStateMachine } from './creation-state-machine';
import { CreationLegacyMapService } from './creation-legacy-map.service';
import { CreationEntity } from './entities/creation.entity';
import { CreationLegacyMapEntity } from './entities/creation-legacy-map.entity';
import { WorldPlot } from '../world-creation/entities/world-plot.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { toGridCell } from '../../../shared/types/aeon-world';
import type { AgentBuilderService } from '../world-creation/services/agent-builder.service';
import type { CreationContinuumService } from '../world-creation/services/creation-continuum.service';
import type { CreationTaskService } from '../world-creation/services/creation-task.service';
import type {
  ContinuumEditResponse,
  SubmitCreationTaskResponse,
} from '../../../shared/types/world-creation-api';

/**
 * 单元测试:CreationAuthoringService(world-creation-feed task 4.1)。
 *
 * Validates:
 *  - 需求 1.6 / 1.7:create 三形态(仅内容 / 仅地理 / 两者)。
 *  - 需求 2.1:create 携带 inline prompt → 触发 generate 并写回 ecsVersionId;
 *              POST /:id/generate 设置版本。
 *  - 需求 2.2 / 2.3:continue(连续谱)产生新版本并把指针写回 Creation。
 *
 * v6 创作引擎(AgentBuilderService / CreationContinuumService)被 **mock**,以隔离
 * 编排逻辑;Creation 实体写入用忠实的内存仓库驱动真实 CreationService /
 * CreationLegacyMapService,验证真实编排(后备 Plot 派生 + 版本回写)。
 */

// ── 忠实内存仓库:CreationEntity ──
class InMemoryCreationRepo {
  rows = new Map<string, CreationEntity>();
  seq = 0;
  create(p: Partial<CreationEntity>): CreationEntity {
    return { ...p } as CreationEntity;
  }
  async save(e: CreationEntity): Promise<CreationEntity> {
    if (!e.id) {
      e.id = `creation-${++this.seq}`;
      e.version = 1;
      e.createdAt = new Date();
      e.updatedAt = new Date();
    } else {
      e.version = (e.version ?? 0) + 1;
      e.updatedAt = new Date();
    }
    this.rows.set(e.id, { ...e });
    return e;
  }
  async findById(id: string): Promise<CreationEntity | null> {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async findByIds(): Promise<CreationEntity[]> {
    return [];
  }
  async findByShareCode(): Promise<CreationEntity | null> {
    return null;
  }
  async findByOwner(): Promise<CreationEntity[]> {
    return [];
  }
  async deleteById(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

// ── 忠实内存仓库:CreationLegacyMapEntity(实现 service 用到的方法)──
class InMemoryLegacyRepo {
  rows: CreationLegacyMapEntity[] = [];
  seq = 0;
  create(p: Partial<CreationLegacyMapEntity>): CreationLegacyMapEntity {
    return { ...p } as CreationLegacyMapEntity;
  }
  async save(e: CreationLegacyMapEntity): Promise<CreationLegacyMapEntity> {
    if (!e.id) {
      e.id = `map-${++this.seq}`;
      this.rows.push({ ...e });
    } else {
      const i = this.rows.findIndex((r) => r.id === e.id);
      if (i >= 0) this.rows[i] = { ...e };
      else this.rows.push({ ...e });
    }
    return e;
  }
  async findOne(opts: { where: Partial<CreationLegacyMapEntity> }): Promise<CreationLegacyMapEntity | null> {
    const w = opts.where;
    const found = this.rows.find((r) =>
      Object.entries(w).every(([k, v]) => (r as any)[k] === v),
    );
    return found ? { ...found } : null;
  }
  async find(): Promise<CreationLegacyMapEntity[]> {
    return this.rows.map((r) => ({ ...r }));
  }
}

// ── 忠实内存仓库:WorldPlot(含 createQueryBuilder MAX(mapY) 链)──
class InMemoryPlotRepo {
  rows = new Map<string, WorldPlot>();
  seq = 0;
  create(p: Partial<WorldPlot>): WorldPlot {
    return { ...p } as WorldPlot;
  }
  async save(e: WorldPlot): Promise<WorldPlot> {
    if (!e.id) {
      e.id = `plot-${++this.seq}`;
      e.version = 1;
      e.createdAt = new Date();
      e.updatedAt = new Date();
    }
    this.rows.set(e.id, { ...e });
    return e;
  }
  createQueryBuilder(_alias: string) {
    const rows = [...this.rows.values()];
    const qb: any = {
      _x: undefined as number | undefined,
      select() {
        return qb;
      },
      where(_clause: string, params: { x: number }) {
        qb._x = params.x;
        return qb;
      },
      async getRawOne() {
        const inBand = rows.filter((r) => r.mapX === qb._x);
        const maxY = inBand.reduce((m, r) => Math.max(m, r.mapY), 0);
        return { maxY: inBand.length ? maxY : null };
      },
    };
    return qb;
  }
}

// ── 忠实内存仓库:AgentAccount(owner 解析)──
class InMemoryAccountRepo {
  rows: AgentAccount[] = [];
  async findOne(opts: { where: { ownerId: string } }): Promise<AgentAccount | null> {
    const found = this.rows.find((r) => r.ownerId === opts.where.ownerId);
    return found ? ({ ...found } as AgentAccount) : null;
  }
}

interface Harness {
  service: CreationAuthoringService;
  creationRepo: InMemoryCreationRepo;
  plotRepo: InMemoryPlotRepo;
  legacyRepo: InMemoryLegacyRepo;
  accountRepo: InMemoryAccountRepo;
  generateDraft: jest.Mock;
  continueEditing: jest.Mock;
  submitTask: jest.Mock;
}

function makeHarness(): Harness {
  const creationRepo = new InMemoryCreationRepo();
  const legacyRepo = new InMemoryLegacyRepo();
  const plotRepo = new InMemoryPlotRepo();
  const accountRepo = new InMemoryAccountRepo();

  const creationService = new CreationService(
    creationRepo as unknown as CreationRepository,
    new CreationStateMachine(),
  );
  const legacyMap = new CreationLegacyMapService(legacyRepo as any);

  const generateDraft = jest.fn();
  const continueEditing = jest.fn();
  // CreationTaskService.submit — 默认入队成功并回到 desktop(占位派发器受理 → running)。
  const submitTask = jest.fn(
    async (_userId: string, req: any): Promise<SubmitCreationTaskResponse> => ({
      task: {
        taskId: 'task-1',
        userId: _userId,
        plotId: req.plotId,
        target: req.target,
        status: 'running',
        substrateTier: req.substrateTier,
        resultRef: null,
        failReason: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      effectiveTarget: req.target,
    }),
  );
  const agentBuilder = { generateDraft } as unknown as AgentBuilderService;
  const continuum = { continueEditing } as unknown as CreationContinuumService;
  const creationTaskService = { submit: submitTask } as unknown as CreationTaskService;

  const service = new CreationAuthoringService(
    creationService,
    legacyMap,
    agentBuilder,
    continuum,
    creationTaskService,
    plotRepo as any,
    accountRepo as any,
  );

  return {
    service,
    creationRepo,
    plotRepo,
    legacyRepo,
    accountRepo,
    generateDraft,
    continueEditing,
    submitTask,
  };
}

describe('CreationAuthoringService (task 4.1)', () => {
  // ============================================================
  // create — 三形态(需求 1.6 / 1.7)
  // ============================================================
  describe('createCreation', () => {
    it('creates a content-only Creation (no geo, no prompt) as draft (需求 1.7)', async () => {
      const h = makeHarness();
      const res = await h.service.createCreation('user-1', { type: 'game', title: '太空跑酷' });

      expect(res.creation.id).toBeDefined();
      expect(res.creation.status).toBe('draft');
      expect(res.creation.geo).toBeNull();
      expect(res.creation.ecsVersionId).toBeNull();
      expect(res.ecsVersionId).toBeUndefined();
      // 无 prompt → 不触碰 v6 生成引擎,也不派生后备 Plot。
      expect(h.generateDraft).not.toHaveBeenCalled();
      expect(h.plotRepo.rows.size).toBe(0);
    });

    it('creates a geo-only Creation and syncs gridCell (需求 1.6)', async () => {
      const h = makeHarness();
      const res = await h.service.createCreation('user-1', {
        type: 'place',
        title: '外滩咖啡馆',
        geo: { lat: 31.2304, lng: 121.4737 },
      });

      expect(res.creation.geo).toEqual({
        lat: 31.2304,
        lng: 121.4737,
        gridCell: toGridCell(31.2304, 121.4737),
      });
      expect(res.creation.ecsVersionId).toBeNull();
      expect(h.generateDraft).not.toHaveBeenCalled();
    });

    it('resolves owner account from the user’s primary AgentAccount', async () => {
      const h = makeHarness();
      h.accountRepo.rows.push({ id: 'acct-9', ownerId: 'user-1', creditScore: 700 } as AgentAccount);

      const res = await h.service.createCreation('user-1', { type: 'shop', title: '便利店' });
      expect(res.creation.ownerAccountId).toBe('acct-9');
      expect(res.creation.originalCreatorAccountId).toBe('acct-9');
    });

    it('falls back to userId as owner account when the user has no AgentAccount', async () => {
      const h = makeHarness();
      const res = await h.service.createCreation('user-77', { type: 'game', title: 't' });
      expect(res.creation.ownerAccountId).toBe('user-77');
    });

    // ── create + inline prompt → 触发 generate(需求 2.1)──
    it('triggers promptDrive generation when an inline prompt is provided, setting ecsVersionId (需求 2.1)', async () => {
      const h = makeHarness();
      h.generateDraft.mockResolvedValue({
        versionId: 'ecs-v1',
        ecsWorld: { ecsVersion: '1', plotId: 'plot-1', substrateTier: 'A', entities: [] },
      });

      const res = await h.service.createCreation('user-1', {
        type: 'place',
        title: '咖啡馆',
        prompt: '一个温馨的咖啡馆',
      });

      // 委托 v6 生成引擎一次,作用在惰性派生的后备 Plot 上。
      expect(h.generateDraft).toHaveBeenCalledTimes(1);
      const [userArg, plotArg, reqArg] = h.generateDraft.mock.calls[0];
      expect(userArg).toBe('user-1');
      expect(typeof plotArg).toBe('string');
      expect(reqArg.prompt).toBe('一个温馨的咖啡馆');

      // 版本回写到 Creation。
      expect(res.ecsVersionId).toBe('ecs-v1');
      expect(res.creation.ecsVersionId).toBe('ecs-v1');
      // 派生了恰好一个后备 Plot,并建立 legacy 映射。
      expect(h.plotRepo.rows.size).toBe(1);
      expect(h.legacyRepo.rows).toHaveLength(1);
      expect(h.legacyRepo.rows[0].sourceType).toBe('world_plot');
    });

    it('does not set ecsVersionId when inline generation is rejected (e.g. TIER_VIOLATION)', async () => {
      const h = makeHarness();
      h.generateDraft.mockResolvedValue({
        versionId: '',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
        error: { error: 'TIER_VIOLATION', detail: 'out of tier' },
      });

      const res = await h.service.createCreation('user-1', {
        type: 'game',
        title: 't',
        prompt: 'do something out of tier',
      });

      expect(res.error).toEqual({ error: 'TIER_VIOLATION', detail: 'out of tier' });
      expect(res.ecsVersionId).toBeUndefined();
      expect(res.creation.ecsVersionId).toBeNull();
    });
  });

  // ============================================================
  // generate — POST /:id/generate(需求 2.1)
  // ============================================================
  describe('generate', () => {
    it('delegates to v6 generateDraft and writes the new version back to the Creation', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', { type: 'game', title: 't' });
      h.generateDraft.mockResolvedValue({
        versionId: 'ecs-v2',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
        quotaWarning: { usedUsd: 1, capUsd: 10, message: 'ok' },
      });

      const res = await h.service.generate('user-1', created.creation.id, { prompt: '生成内容' });

      expect(res.ecsVersionId).toBe('ecs-v2');
      expect(res.quotaWarning).toEqual({ usedUsd: 1, capUsd: 10, message: 'ok' });
      const reloaded = await h.creationRepo.findById(created.creation.id);
      expect(reloaded!.ecsVersionId).toBe('ecs-v2');
    });

    it('reuses the same backing plot across repeated generate calls (one legacy mapping)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', { type: 'game', title: 't' });
      h.generateDraft.mockResolvedValue({
        versionId: 'ecs-a',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
      });

      await h.service.generate('user-1', created.creation.id, { prompt: 'first' });
      const firstPlotId = h.generateDraft.mock.calls[0][1];
      await h.service.generate('user-1', created.creation.id, { prompt: 'second' });
      const secondPlotId = h.generateDraft.mock.calls[1][1];

      expect(secondPlotId).toBe(firstPlotId);
      expect(h.plotRepo.rows.size).toBe(1);
      expect(h.legacyRepo.rows).toHaveLength(1);
    });
  });

  // ============================================================
  // continue — POST /:id/continue(需求 2.2 / 2.3)
  // ============================================================
  describe('continue', () => {
    it('delegates to v6 continueEditing and syncs the new version pointer on applied (需求 2.3)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', { type: 'game', title: 't' });
      const applied: ContinuumEditResponse = {
        outcome: 'applied',
        mode: 'coEdit',
        versionId: 'ecs-v3',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
      };
      h.continueEditing.mockResolvedValue(applied);

      const res = await h.service.continue('user-1', created.creation.id, {
        mode: 'coEdit',
        instruction: '加一张桌子',
      });

      expect(res).toEqual(applied);
      const reloaded = await h.creationRepo.findById(created.creation.id);
      expect(reloaded!.ecsVersionId).toBe('ecs-v3');
    });

    it('does not change the version pointer when the edit is dispatched off-surface (Mobile Tier_C, 需求 2.6)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', { type: 'game', title: 't' });
      const dispatched: ContinuumEditResponse = {
        outcome: 'dispatched',
        mode: 'promptDrive',
        dispatch: { mustDispatch: true, target: 'desktop', substrateTier: 'C', reason: 'tier_c on mobile' },
      };
      h.continueEditing.mockResolvedValue(dispatched);

      const res = await h.service.continue('user-1', created.creation.id, {
        mode: 'promptDrive',
        prompt: 'build tier C',
        surface: 'mobile',
      });

      expect(res.outcome).toBe('dispatched');
      const reloaded = await h.creationRepo.findById(created.creation.id);
      expect(reloaded!.ecsVersionId).toBeNull();
    });
  });

  // ============================================================
  // task 4.2 — Tier 校验 / Tier_C 强制派发 / 配额成本上限(需求 2.6/2.7/2.8)
  // ============================================================
  describe('Tier_C 强制派发 + Tier 校验 + 配额(task 4.2)', () => {
    // ── 需求 2.6:Mobile Tier_C generate → 派发离线(入队 + 回报状态),不本地生成 ──
    it('dispatches a mobile-originated Tier_C generate to the Creation_Task_Queue (需求 2.6)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'game',
        title: '塔防',
        substrateTier: 'C',
      });

      const res = await h.service.generate('user-1', created.creation.id, {
        prompt: '生成一个图灵完备的塔防逻辑',
        surface: 'mobile',
      });

      // 强制派发:不在本地执行(从不调用 v6 生成引擎)。
      expect(h.generateDraft).not.toHaveBeenCalled();
      // 返回派发决策 + 入队的任务状态(需求 2.6:反馈任务状态)。
      expect(res.dispatch?.mustDispatch).toBe(true);
      expect(res.dispatch?.target).toBe('desktop');
      expect(res.task?.taskId).toBe('task-1');
      expect(res.task?.status).toBe('running');
      expect(res.ecsVersionId).toBeUndefined();
      // 经 Creation_Task_Queue 入队一次,surface=mobile / Tier_C / target=desktop。
      expect(h.submitTask).toHaveBeenCalledTimes(1);
      const [taskUser, taskReq] = h.submitTask.mock.calls[0];
      expect(taskUser).toBe('user-1');
      expect(taskReq.surface).toBe('mobile');
      expect(taskReq.substrateTier).toBe('C');
      expect(taskReq.target).toBe('desktop');
      expect(taskReq.input).toMatchObject({ kind: 'generate', creationId: created.creation.id });
      // 后备 Plot 作为版本链锚点被派生(任务作用其上)。
      expect(h.plotRepo.rows.size).toBe(1);
    });

    // ── 需求 2.6:Desktop 发起的 Tier_C generate 仍本地执行(不派发)──
    it('runs a desktop-originated Tier_C generate locally (no dispatch, 需求 2.6)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'game',
        title: '塔防',
        substrateTier: 'C',
      });
      h.generateDraft.mockResolvedValue({
        versionId: 'ecs-c1',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'C', entities: [] },
      });

      const res = await h.service.generate('user-1', created.creation.id, {
        prompt: '生成塔防',
        surface: 'desktop',
      });

      expect(h.submitTask).not.toHaveBeenCalled();
      expect(h.generateDraft).toHaveBeenCalledTimes(1);
      expect(res.ecsVersionId).toBe('ecs-c1');
      expect(res.dispatch).toBeUndefined();
    });

    // ── 需求 2.6:Mobile Tier_A 不派发(仅 Tier_C 强制路由)──
    it('runs a mobile-originated Tier_A generate locally (only Tier_C is forced off mobile)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'place',
        title: '展厅',
        substrateTier: 'A',
      });
      h.generateDraft.mockResolvedValue({
        versionId: 'ecs-a1',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
      });

      const res = await h.service.generate('user-1', created.creation.id, {
        prompt: '一个画廊',
        surface: 'mobile',
      });

      expect(h.submitTask).not.toHaveBeenCalled();
      expect(h.generateDraft).toHaveBeenCalledTimes(1);
      expect(res.ecsVersionId).toBe('ecs-a1');
    });

    // ── 需求 2.8:越界 → TIER_VIOLATION(原样透出,不落库,不写指针)──
    it('surfaces TIER_VIOLATION from the v6 engine without setting a version (需求 2.8)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'game',
        title: 't',
        substrateTier: 'A',
      });
      h.generateDraft.mockResolvedValue({
        versionId: '',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
        error: { error: 'TIER_VIOLATION', detail: 'logicModule exceeds Tier_A' },
      });

      const res = await h.service.generate('user-1', created.creation.id, {
        prompt: '加一段图灵完备逻辑',
        surface: 'desktop',
      });

      expect(res.error).toEqual({ error: 'TIER_VIOLATION', detail: 'logicModule exceeds Tier_A' });
      expect(res.ecsVersionId).toBe('');
      const reloaded = await h.creationRepo.findById(created.creation.id);
      expect(reloaded!.ecsVersionId).toBeNull();
    });

    // ── 需求 2.7:软阈值 → 随成功响应透出 quotaWarning ──
    it('surfaces the monthly cost soft-threshold quotaWarning on success (需求 2.7)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'game',
        title: 't',
        substrateTier: 'A',
      });
      h.generateDraft.mockResolvedValue({
        versionId: 'ecs-1',
        ecsWorld: { ecsVersion: '1', plotId: 'p', substrateTier: 'A', entities: [] },
        quotaWarning: { usedUsd: 4.2, capUsd: 5, message: '已用 84% 月度生成额度' },
      });

      const res = await h.service.generate('user-1', created.creation.id, {
        prompt: '生成',
        surface: 'desktop',
      });

      expect(res.quotaWarning).toEqual({ usedUsd: 4.2, capUsd: 5, message: '已用 84% 月度生成额度' });
      expect(res.ecsVersionId).toBe('ecs-1');
    });

    // ── 需求 2.7:达硬上限 → QUOTA_EXCEEDED 阻断(v6 引擎抛出,原样传播)──
    it('propagates the QUOTA_EXCEEDED hard-cap block from the v6 engine (需求 2.7)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'game',
        title: 't',
        substrateTier: 'A',
      });
      h.generateDraft.mockRejectedValue(
        new ForbiddenException({ statusCode: 429, message: 'cap reached', code: 'QUOTA_EXCEEDED' }),
      );

      await expect(
        h.service.generate('user-1', created.creation.id, { prompt: '生成', surface: 'desktop' }),
      ).rejects.toMatchObject({ response: { code: 'QUOTA_EXCEEDED' } });
      const reloaded = await h.creationRepo.findById(created.creation.id);
      expect(reloaded!.ecsVersionId).toBeNull();
    });

    // ── 需求 2.6:Mobile Tier_C continue → 经队列入队并透出任务状态 ──
    it('enqueues a Creation_Task and surfaces task status when continue dispatches (Mobile Tier_C, 需求 2.6)', async () => {
      const h = makeHarness();
      const created = await h.service.createCreation('user-1', {
        type: 'game',
        title: 't',
        substrateTier: 'C',
      });
      const dispatched: ContinuumEditResponse = {
        outcome: 'dispatched',
        mode: 'promptDrive',
        dispatch: { mustDispatch: true, target: 'desktop', substrateTier: 'C', reason: 'tier_c on mobile' },
      };
      h.continueEditing.mockResolvedValue(dispatched);

      const res = await h.service.continue('user-1', created.creation.id, {
        mode: 'promptDrive',
        prompt: 'build tier C',
        surface: 'mobile',
      });

      expect(res.outcome).toBe('dispatched');
      // 实际入队为 Creation_Task,并把任务状态透出。
      expect(h.submitTask).toHaveBeenCalledTimes(1);
      const [, taskReq] = h.submitTask.mock.calls[0];
      expect(taskReq.surface).toBe('mobile');
      expect(taskReq.input).toMatchObject({ kind: 'continue', mode: 'promptDrive' });
      expect(res.task?.taskId).toBe('task-1');
      expect(res.task?.status).toBe('running');
      // 派发不动版本指针。
      const reloaded = await h.creationRepo.findById(created.creation.id);
      expect(reloaded!.ecsVersionId).toBeNull();
    });

    // ── create + inline prompt(Mobile Tier_C)→ 单一动作创建并派发,透出任务 ──
    it('dispatches inline-prompt create for Mobile Tier_C and surfaces dispatch + task (需求 2.6)', async () => {
      const h = makeHarness();
      const res = await h.service.createCreation('user-1', {
        type: 'game',
        title: '塔防',
        substrateTier: 'C',
        surface: 'mobile',
        prompt: '生成塔防逻辑',
      });

      expect(h.generateDraft).not.toHaveBeenCalled();
      expect(h.submitTask).toHaveBeenCalledTimes(1);
      expect(res.dispatch?.mustDispatch).toBe(true);
      expect(res.task?.taskId).toBe('task-1');
      expect(res.ecsVersionId).toBeUndefined();
    });
  });

  // ============================================================
  // toCreationDto — 投影
  // ============================================================
  describe('toCreationDto', () => {
    it('projects an entity to the shared Creation DTO with epoch-ms timestamps and placeholder preview', () => {
      const now = new Date();
      const dto = toCreationDto({
        id: 'c1',
        ownerAccountId: 'o',
        originalCreatorAccountId: 'o',
        type: 'game',
        status: 'draft',
        title: 't',
        summary: null,
        substrateTier: 'A',
        ecsVersionId: null,
        boundAgentId: null,
        geo: null,
        geoGridCell: null,
        poi: null,
        preview: null,
        offerings: [],
        manifestVersion: 0,
        shareCode: null,
        metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
        version: 1,
        createdAt: now,
        updatedAt: now,
      } as CreationEntity);

      expect(dto.preview).toEqual({ kind: 'cover', url: '' });
      expect(dto.createdAt).toBe(now.getTime());
      expect(dto.summary).toBeUndefined();
    });
  });
});
