import fc from 'fast-check';
import { Logger } from '@nestjs/common';

import { CreationPublishService } from './creation-publish.service';
import { CreationModerationService } from './creation-moderation.service';
import { CreationRepository } from './creation.repository';
import {
  CreationStateMachine,
  DISCOVERABLE_STATUSES,
} from './creation-state-machine';
import { OfferingDeriverService } from './offering-deriver.service';
import { CapabilityManifestDeriverService } from './capability-manifest-deriver.service';
import { CreationEntity } from './entities/creation.entity';
import { CreationCapabilityManifestEntity } from './entities/creation-capability-manifest.entity';
import { CreationModerationDecisionEntity } from './entities/creation-moderation-decision.entity';
import { EcsWorldVersion } from '../world-creation/entities/ecs-world-version.entity';
import { ModerationService } from '../world-engine/services/moderation.service';
import type { EcsWorld } from '../../../shared/types/world-creation';
import type { CreationStatus } from '../../../shared/types/creation';

/**
 * 属性测试(集成):world-creation-feed task 2.5。
 *
 * 用 fast-check 跨大量随机输入验证 design §Correctness Properties 的两条不变量:
 *
 *  - **Property 4(审核前置)** — Validates: Requirements 3.1, 3.4
 *      状态非 published/listed 的 Creation SHALL NOT 出现在任何发现面;被 suspended
 *      的立即移出。即:对任意状态流转序列(经真实 publish / unpublish / takedown 服务),
 *      任何被发现谓词(`CreationStateMachine.isDiscoverable` / `DISCOVERABLE_STATUSES`)
 *      判定为"可发现"的 Creation,其状态恒 ∈ {published, listed};一旦被下架(suspended)
 *      则恒不可发现且为终态。
 *
 *  - **Property 5(能力清单与内容一致)** — Validates: Requirements 1.5, 1.11
 *      Creation 的 CapabilityManifest SHALL 始终对应其当前 ecsVersionId + offerings;
 *      内容/offering 变更后(重)发布时,旧清单失效、重派生,manifestVersion 单调递增。
 *      即:对任意内容版本序列,每次(重)发布后唯一 active 清单的 ecsVersionId 等于
 *      Creation 当前 ecsVersionId、其工具集与当前 offerings 一一对应,且 manifestVersion
 *      在历次重派生间严格递增。
 *
 * 集成方式:接入**真实**服务(CreationPublishService / CreationModerationService /
 * CreationStateMachine / OfferingDeriverService / CapabilityManifestDeriverService)
 * 与忠实内存仓库(真实 find/save 语义);仅对 world-engine ModerationService 用恒过替身
 * (本任务验证发现/清单不变量,审核判定逻辑由 task 2.3 单测覆盖)。
 */

// ── 忠实内存仓库:Creation ──
class InMemoryCreationRepo {
  private rows = new Map<string, CreationEntity>();
  private seq = 0;

  create(partial: Partial<CreationEntity>): CreationEntity {
    return { ...partial } as CreationEntity;
  }

  async save(entity: CreationEntity): Promise<CreationEntity> {
    if (!entity.id) {
      entity.id = `creation-${++this.seq}`;
      entity.version = 1;
      entity.createdAt = new Date();
    } else {
      entity.version = (entity.version ?? 0) + 1;
    }
    entity.updatedAt = new Date();
    this.rows.set(entity.id, { ...entity });
    return entity;
  }

  async findById(id: string): Promise<CreationEntity | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByShareCode(shareCode: string): Promise<CreationEntity | null> {
    for (const row of this.rows.values()) {
      if (row.shareCode === shareCode) return { ...row };
    }
    return null;
  }

  seed(entity: CreationEntity): CreationEntity {
    this.rows.set(entity.id, { ...entity });
    return entity;
  }
}

// ── 内存 ECS 版本仓库(只读 snapshotJson)──
class InMemoryVersionRepo {
  private rows = new Map<string, EcsWorldVersion>();

  seed(id: string, snapshotJson: EcsWorld): void {
    this.rows.set(id, { id, snapshotJson } as EcsWorldVersion);
  }

  async findOne(opts: { where: { id: string } }): Promise<EcsWorldVersion | null> {
    return this.rows.get(opts.where.id) ?? null;
  }
}

// ── 内存 manifest 仓库(支持 update 置 inactive + save) ──
class InMemoryManifestRepo {
  rows: CreationCapabilityManifestEntity[] = [];
  private seq = 0;

  create(
    partial: Partial<CreationCapabilityManifestEntity>,
  ): CreationCapabilityManifestEntity {
    return { ...partial } as CreationCapabilityManifestEntity;
  }

  async save(
    entity: CreationCapabilityManifestEntity,
  ): Promise<CreationCapabilityManifestEntity> {
    if (!entity.id) entity.id = `manifest-${++this.seq}`;
    this.rows.push({ ...entity });
    return entity;
  }

  async update(
    where: { creationId: string; isActive: boolean },
    patch: { isActive: boolean },
  ): Promise<void> {
    for (const row of this.rows) {
      if (row.creationId === where.creationId && row.isActive === where.isActive) {
        row.isActive = patch.isActive;
      }
    }
  }

  activeFor(creationId: string): CreationCapabilityManifestEntity[] {
    return this.rows.filter((r) => r.creationId === creationId && r.isActive);
  }

  allFor(creationId: string): CreationCapabilityManifestEntity[] {
    return this.rows.filter((r) => r.creationId === creationId);
  }
}

// ── 内存审计仓库:creation_moderation_decisions ──
class InMemoryDecisionRepo {
  rows: CreationModerationDecisionEntity[] = [];
  private seq = 0;

  create(
    partial: Partial<CreationModerationDecisionEntity>,
  ): CreationModerationDecisionEntity {
    return { ...partial } as CreationModerationDecisionEntity;
  }

  async save(
    entity: CreationModerationDecisionEntity,
  ): Promise<CreationModerationDecisionEntity> {
    if (!entity.id) entity.id = `decision-${++this.seq}`;
    if (!entity.createdAt) entity.createdAt = new Date(Date.now() + this.seq);
    this.rows.push({ ...entity });
    return entity;
  }

  async find(opts: {
    where: { creationId: string };
  }): Promise<CreationModerationDecisionEntity[]> {
    return this.rows.filter((r) => r.creationId === opts.where.creationId);
  }
}

/** 恒过审核替身(本任务不验证审核判定逻辑)。 */
class AlwaysPassModerationService {
  async checkCopyrightedCharacter(): Promise<{ passed: boolean }> {
    return { passed: true };
  }
  async checkProhibitedWords(): Promise<{ passed: boolean; offendingTerms: string[] }> {
    return { passed: true, offendingTerms: [] };
  }
  async applyCnRegionModeration(): Promise<{ passed: boolean }> {
    return { passed: true };
  }
}

interface Harness {
  publish: CreationPublishService;
  moderation: CreationModerationService;
  machine: CreationStateMachine;
  repo: InMemoryCreationRepo;
  versionRepo: InMemoryVersionRepo;
  manifestRepo: InMemoryManifestRepo;
}

function makeHarness(): Harness {
  // 静默发布服务的 info 日志(PBT 高频发布会刷屏);保留 warn/error。
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  const repo = new InMemoryCreationRepo();
  const versionRepo = new InMemoryVersionRepo();
  const manifestRepo = new InMemoryManifestRepo();
  const decisionRepo = new InMemoryDecisionRepo();
  const machine = new CreationStateMachine();

  const publish = new CreationPublishService(
    repo as unknown as CreationRepository,
    machine,
    new OfferingDeriverService(),
    new CapabilityManifestDeriverService(),
    new AlwaysPassModerationService() as unknown as ModerationService,
    versionRepo as any,
    manifestRepo as any,
  );

  const moderation = new CreationModerationService(
    repo as unknown as CreationRepository,
    machine,
    decisionRepo as any,
    // accountRepo / notificationService 省略(@Optional)。
  );

  return { publish, moderation, machine, repo, versionRepo, manifestRepo };
}

let seq = 0;
function seedDraft(
  repo: InMemoryCreationRepo,
  overrides: Partial<CreationEntity> = {},
): CreationEntity {
  const id = overrides.id ?? `creation-seed-${++seq}`;
  return repo.seed({
    id,
    ownerAccountId: 'owner-1',
    originalCreatorAccountId: 'owner-1',
    type: 'shop',
    status: 'draft',
    title: '随机创作',
    summary: null,
    substrateTier: 'A',
    ecsVersionId: null,
    boundAgentId: null,
    geo: null,
    geoGridCell: null,
    poi: null,
    preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
    offerings: [],
    manifestVersion: 0,
    shareCode: null,
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreationEntity);
}

/** 由「带价实体 id + 价格」列表构造一个 ECS_World(每个实体派生一个 product offering)。 */
function makeEcsWorld(entities: { id: string; axp: number }[]): EcsWorld {
  return {
    ecsVersion: '1.0',
    plotId: 'plot_x',
    substrateTier: 'A',
    entities: entities.map((e) => ({
      id: e.id,
      components: { price: { axp: e.axp }, ui: { button: e.id } },
    })),
  } as EcsWorld;
}

// ============================================================
// Property 4:审核前置(Requirements 3.1, 3.4)
// ============================================================
describe('Property 4 — 审核前置 (PBT, 需求 3.1/3.4)', () => {
  type Op = 'publish' | 'unpublish' | 'takedown' | 'report';

  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * 对任意 publish/unpublish/takedown/report 操作序列,经真实服务流转后,
   * 发现谓词判定为"可发现"当且仅当状态 ∈ {published, listed};且一经 takedown
   * 进入 suspended 即恒为终态且恒不可发现(违规即移出)。
   */
  it('被发现谓词判定为可发现 ⟺ 状态 ∈ {published, listed};suspended 即移出且为终态', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 是否有 offering(决定发布后是 published 还是 listed)。
        fc.boolean(),
        // 随机操作序列。
        fc.array(
          fc.constantFrom<Op>('publish', 'unpublish', 'takedown', 'report'),
          { minLength: 1, maxLength: 12 },
        ),
        async (hasOffering, ops) => {
          const h = makeHarness();
          const ecsVersionId = hasOffering ? `ecs-${++seq}` : null;
          if (ecsVersionId) {
            h.versionRepo.seed(ecsVersionId, makeEcsWorld([{ id: 'coffee', axp: 50 }]));
          }
          const c = seedDraft(h.repo, { ecsVersionId });

          let everSuspended = false;

          for (const op of ops) {
            try {
              if (op === 'publish') {
                await h.publish.publish(c.id);
              } else if (op === 'unpublish') {
                await h.moderation.unpublish(c.id);
              } else if (op === 'takedown') {
                await h.moderation.takedown(c.id, 'pbt 违规');
              } else {
                await h.moderation.report(c.id, 'reporter', 'pbt 举报');
              }
            } catch {
              // 非法流转(如对 suspended 终态发布/下架)抛结构化错误 —— 视为无副作用 no-op,
              // 不影响发现不变量;继续验证当前持久化状态。
            }

            const status = (await h.repo.findById(c.id))!.status as CreationStatus;

            // 核心不变量:可发现 ⟺ 状态 ∈ {published, listed}。
            const discoverable = h.machine.isDiscoverable(status);
            const inDiscoverableSet = DISCOVERABLE_STATUSES.has(status);
            expect(discoverable).toBe(inDiscoverableSet);
            expect(discoverable).toBe(status === 'published' || status === 'listed');

            // 任何非 published/listed 状态(draft/under_review/unpublished/suspended)不可发现。
            if (status !== 'published' && status !== 'listed') {
              expect(discoverable).toBe(false);
            }

            if (status === 'suspended') {
              everSuspended = true;
            }
            // 违规即移出 + 终态:一旦 suspended,恒 suspended 且恒不可发现。
            if (everSuspended) {
              expect(status).toBe('suspended');
              expect(discoverable).toBe(false);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * 对任意初始已发布状态,takedown 后立即不可发现(即时移出发现面)。
   */
  it('takedown 后被发现谓词立即判定为不可发现', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CreationStatus>('published', 'listed'),
        async (initial) => {
          const h = makeHarness();
          const c = seedDraft(h.repo, { status: initial, shareCode: 'SEED1234' });

          // 下架前可发现。
          expect(h.machine.isDiscoverable(initial)).toBe(true);

          await h.moderation.takedown(c.id, 'pbt 即时移出');
          const after = (await h.repo.findById(c.id))!.status;

          expect(after).toBe('suspended');
          expect(h.machine.isDiscoverable(after)).toBe(false);
          expect(DISCOVERABLE_STATUSES.has(after)).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// Property 5:能力清单与内容一致(Requirements 1.5, 1.11)
// ============================================================
describe('Property 5 — 能力清单与内容一致 (PBT, 需求 1.5/1.11)', () => {
  /**
   * **Validates: Requirements 1.5, 1.11**
   *
   * 对任意内容版本序列(每版含一组带价实体 → offerings),每次(重)发布后:
   *  1. 唯一 active 清单的 ecsVersionId 等于 Creation 当前 ecsVersionId;
   *  2. 清单工具集与当前 offerings 一一对应(每个 offering 的每个 verb 投影出
   *     `${verb}_${offeringId}` 工具,且工具关联的 offeringId ⊆ 当前 offerings);
   *  3. manifestVersion 在历次重派生间严格递增。
   *
   * 内容版本采用**累积超集**(版本 v 含实体 item_0..item_{v-1}),以保证 offerings 恒与
   * 当前 ecsVersion 对应(隔离 task 2.1 的显式 offering 合并语义,聚焦清单一致性不变量)。
   */
  it('active 清单恒对应当前 ecsVersionId + offerings,manifestVersion 严格递增', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 版本数(每次新增一个带价实体 → 触发一次重派生)。
        fc.integer({ min: 1, max: 6 }),
        // 每个实体的价格(>0)。
        fc.array(fc.integer({ min: 1, max: 9999 }), { minLength: 6, maxLength: 6 }),
        async (numVersions, prices) => {
          const h = makeHarness();
          const c = seedDraft(h.repo);

          let previousVersion = 0;

          for (let v = 1; v <= numVersions; v++) {
            // 版本 v:累积实体 item_0..item_{v-1}。
            const entities = Array.from({ length: v }, (_, i) => ({
              id: `item_${i}`,
              axp: prices[i],
            }));
            const ecsVersionId = `ecs-v${v}-${seq}-${c.id}`;
            h.versionRepo.seed(ecsVersionId, makeEcsWorld(entities));

            // 把 Creation 指向新内容版本;非首版需先回到 unpublished 以重走发布(重派生)。
            const row = (await h.repo.findById(c.id))!;
            if (v > 1) {
              row.status = 'unpublished';
            }
            row.ecsVersionId = ecsVersionId;
            await h.repo.save(row);

            const res = await h.publish.publish(c.id);
            expect(res.published).toBe(true);

            const saved = (await h.repo.findById(c.id))!;

            // (3) manifestVersion 严格递增。
            expect(saved.manifestVersion).toBeGreaterThan(previousVersion);
            expect(saved.manifestVersion).toBe(res.manifestVersion);
            previousVersion = saved.manifestVersion;

            // 恰有一个 active 清单。
            const active = h.manifestRepo.activeFor(c.id);
            expect(active).toHaveLength(1);
            const manifest = active[0];

            // (1) active 清单版本 == Creation.manifestVersion;ecsVersionId 对应当前内容版本。
            expect(manifest.version).toBe(saved.manifestVersion);
            expect(manifest.ecsVersionId).toBe(saved.ecsVersionId);
            expect(manifest.ecsVersionId).toBe(ecsVersionId);

            // (2) 工具集与当前 offerings 一一对应。
            const offeringIds = saved.offerings.map((o) => o.id).sort();
            expect(offeringIds).toEqual(entities.map((e) => e.id).sort());

            const toolOfferingIds = new Set(
              manifest.tools.map((t) => t.offeringId).filter(Boolean),
            );
            // 每个 offering 都被工具覆盖,且工具不引用不存在的 offering。
            for (const id of offeringIds) {
              expect(toolOfferingIds.has(id)).toBe(true);
            }
            for (const tid of toolOfferingIds) {
              expect(offeringIds).toContain(tid as string);
            }

            // 每个 offering 的每个 verb 都投影出 `${verb}_${offeringId}` 工具。
            const toolNames = new Set(manifest.tools.map((t) => t.name));
            for (const offering of saved.offerings) {
              for (const verb of offering.verbs) {
                expect(toolNames.has(`${verb}_${offering.id}`)).toBe(true);
              }
            }
          }

          // 历史清单版本严格递增且唯一(Property 5:旧清单失效)。
          const all = h.manifestRepo
            .allFor(c.id)
            .map((m) => m.version)
            .sort((a, b) => a - b);
          for (let i = 1; i < all.length; i++) {
            expect(all[i]).toBeGreaterThan(all[i - 1]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 1.11**
   *
   * 纯地理创作(无 ecsVersionId、无 offerings)发布后:active 清单 ecsVersionId 为 null、
   * 工具集为空,manifestVersion 仍单调推进到 1。
   */
  it('纯地理创作:清单 ecsVersionId 为 null 且工具为空,版本推进到 1', async () => {
    const h = makeHarness();
    const c = seedDraft(h.repo, { ecsVersionId: null });

    const res = await h.publish.publish(c.id);
    expect(res.published).toBe(true);
    expect(res.manifestVersion).toBe(1);

    const active = h.manifestRepo.activeFor(c.id);
    expect(active).toHaveLength(1);
    expect(active[0].ecsVersionId).toBeNull();
    expect(active[0].tools).toHaveLength(0);
  });
});
