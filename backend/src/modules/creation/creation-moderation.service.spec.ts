import { NotFoundException } from '@nestjs/common';
import { CreationModerationService } from './creation-moderation.service';
import { CreationRepository } from './creation.repository';
import {
  CreationStateMachine,
  InvalidCreationTransitionError,
  DISCOVERABLE_STATUSES,
} from './creation-state-machine';
import { CreationEntity } from './entities/creation.entity';
import { CreationModerationDecisionEntity } from './entities/creation-moderation-decision.entity';
import type { CreationStatus } from '../../../shared/types/creation';

/**
 * 单元测试:CreationModerationService(world-creation-feed task 2.4)。
 *
 * Validates:
 *  - 需求 3.4:任意用户对已发布 Creation 提交举报(report 受理 + 审计);
 *              确认违规 → status=suspended,即时移出发现面(发现层 predicate 排除)。
 *  - 需求 3.5:为每个 Creation 保留审核决策审计记录(谁 / 何时 / 结论 / 原因)。
 *  - 需求 3.3:创作者主动下架(published/listed→unpublished),内容保留、可逆。
 *
 * 采用忠实的内存仓库(真实 find/save 语义)+ 真实状态机,验证真实编排逻辑;
 * 不接 NotificationService / AgentAccount(均 @Optional)。
 */

// ── 忠实内存仓库:Creation ──
class InMemoryCreationRepo {
  private rows = new Map<string, CreationEntity>();
  private seq = 0;

  async save(entity: CreationEntity): Promise<CreationEntity> {
    if (!entity.id) {
      entity.id = `creation-${++this.seq}`;
      entity.version = 1;
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

  seed(entity: CreationEntity): CreationEntity {
    this.rows.set(entity.id, { ...entity });
    return entity;
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
    if (!entity.createdAt) {
      // 单调递增时间戳,保证 ASC 排序稳定。
      entity.createdAt = new Date(Date.now() + this.seq);
    }
    this.rows.push({ ...entity });
    return entity;
  }

  async find(opts: {
    where: { creationId: string };
    order?: { createdAt: 'ASC' | 'DESC' };
  }): Promise<CreationModerationDecisionEntity[]> {
    const filtered = this.rows.filter(
      (r) => r.creationId === opts.where.creationId,
    );
    filtered.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return filtered.map((r) => ({ ...r }));
  }
}

interface Harness {
  service: CreationModerationService;
  repo: InMemoryCreationRepo;
  decisionRepo: InMemoryDecisionRepo;
}

function makeHarness(): Harness {
  const repo = new InMemoryCreationRepo();
  const decisionRepo = new InMemoryDecisionRepo();
  const service = new CreationModerationService(
    repo as unknown as CreationRepository,
    new CreationStateMachine(),
    decisionRepo as any,
    // accountRepo / notificationService 省略(@Optional)。
  );
  return { service, repo, decisionRepo };
}

let seq = 0;
function seedCreation(
  repo: InMemoryCreationRepo,
  status: CreationStatus = 'published',
  overrides: Partial<CreationEntity> = {},
): CreationEntity {
  const id = overrides.id ?? `creation-seed-${++seq}`;
  return repo.seed({
    id,
    ownerAccountId: 'owner-1',
    originalCreatorAccountId: 'owner-1',
    type: 'shop',
    status,
    title: '便利店',
    summary: null,
    substrateTier: 'A',
    ecsVersionId: null,
    boundAgentId: null,
    geo: null,
    geoGridCell: null,
    poi: null,
    preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
    offerings: [],
    manifestVersion: 1,
    shareCode: 'ABCD1234',
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreationEntity);
}

describe('CreationModerationService (task 2.4)', () => {
  // ============================================================
  // 需求 3.4 — 举报受理 + 审计记录
  // ============================================================
  describe('report (需求 3.4 / 3.5)', () => {
    it('records a pending report against a published Creation', async () => {
      const { service, repo, decisionRepo } = makeHarness();
      const c = seedCreation(repo, 'published');

      const res = await service.report(c.id, 'user-42', '内容涉嫌侵权');

      expect(res.received).toBe(true);
      if (!res.received) throw new Error('unreachable');
      expect(res.reportId).toBeDefined();

      // 审计:谁(reporterId)/ 结论(pending)/ 原因。
      const rows = decisionRepo.rows.filter((r) => r.creationId === c.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].stage).toBe('report');
      expect(rows[0].decision).toBe('pending');
      expect(rows[0].reporterId).toBe('user-42');
      expect(rows[0].reason).toContain('内容涉嫌侵权');
    });

    it('受理 listed 状态的 Creation 举报', async () => {
      const { service, repo } = makeHarness();
      const c = seedCreation(repo, 'listed');

      const res = await service.report(c.id, 'user-7', 'spam');
      expect(res.received).toBe(true);
    });

    it('拒绝对未发布(draft)Creation 的举报,且不写审计', async () => {
      const { service, repo, decisionRepo } = makeHarness();
      const c = seedCreation(repo, 'draft');

      const res = await service.report(c.id, 'user-1', 'whatever');

      expect(res.received).toBe(false);
      if (res.received) throw new Error('unreachable');
      expect(res.error.error).toBe('MODERATION_REJECTED');
      expect(decisionRepo.rows).toHaveLength(0);
    });

    it('throws NotFoundException for a missing Creation', async () => {
      const { service } = makeHarness();
      await expect(service.report('nope', 'u', 'r')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ============================================================
  // 需求 3.4 / 3.5 — 下架 → suspended,即时移出发现面 + 审计
  // ============================================================
  describe('takedown → suspended (需求 3.4 / 3.5)', () => {
    it('confirmed report → suspended + audit entry, removed from discovery predicate', async () => {
      const { service, repo, decisionRepo } = makeHarness();
      const c = seedCreation(repo, 'published');

      // 先举报(确认违规前的受理)。
      await service.report(c.id, 'user-42', '违规内容');
      // 确认违规 → 下架。
      const res = await service.takedown(c.id, '确认违规:成人内容', 'reviewer-9');

      expect(res.taken).toBe(true);
      expect(res.status).toBe('suspended');

      // 状态已落库为 suspended。
      const saved = await repo.findById(c.id);
      expect(saved!.status).toBe('suspended');

      // suspended 即时移出发现面:发现层 predicate 排除(Property 4)。
      expect(DISCOVERABLE_STATUSES.has(saved!.status)).toBe(false);
      const machine = new CreationStateMachine();
      expect(machine.isDiscoverable(saved!.status)).toBe(false);

      // 审计:takedown rejected,记录裁决者 + 原因(谁/结论/原因)。
      const takedownRows = decisionRepo.rows.filter(
        (r) => r.creationId === c.id && r.stage === 'takedown',
      );
      expect(takedownRows).toHaveLength(1);
      expect(takedownRows[0].decision).toBe('rejected');
      expect(takedownRows[0].reviewerId).toBe('reviewer-9');
      expect(takedownRows[0].reason).toContain('确认违规');
    });

    it('下架可从任意非终态发起(如 draft 直接封禁)', async () => {
      const { service, repo } = makeHarness();
      const c = seedCreation(repo, 'draft');

      const res = await service.takedown(c.id, '违规');
      expect(res.status).toBe('suspended');
    });

    it('幂等:对已 suspended 的 Creation 重复下架只补记审计、不再流转', async () => {
      const { service, repo, decisionRepo } = makeHarness();
      const c = seedCreation(repo, 'suspended');
      const versionBefore = (await repo.findById(c.id))!.version;

      const res = await service.takedown(c.id, '二次确认');

      expect(res.taken).toBe(true);
      expect(res.status).toBe('suspended');
      // 未再次 save(version 不变)。
      const after = await repo.findById(c.id);
      expect(after!.version).toBe(versionBefore);
      // 仍补记一条审计。
      const takedownRows = decisionRepo.rows.filter(
        (r) => r.stage === 'takedown',
      );
      expect(takedownRows).toHaveLength(1);
    });
  });

  // ============================================================
  // 需求 3.3 / 3.4 — 创作者主动下架(可逆,内容保留)
  // ============================================================
  describe('unpublish by creator (需求 3.3 / 3.4)', () => {
    it('published → unpublished + audit entry', async () => {
      const { service, repo, decisionRepo } = makeHarness();
      const c = seedCreation(repo, 'published');

      const res = await service.unpublish(c.id, '暂时下架维护', 'owner-1');

      expect(res.unpublished).toBe(true);
      expect(res.status).toBe('unpublished');

      const saved = await repo.findById(c.id);
      expect(saved!.status).toBe('unpublished');
      // 内容保留(ecsVersionId/offerings/preview 不变)。
      expect(saved!.preview).not.toBeNull();

      const rows = decisionRepo.rows.filter((r) => r.stage === 'unpublish');
      expect(rows).toHaveLength(1);
      expect(rows[0].decision).toBe('unpublished');
      expect(rows[0].reviewerId).toBe('owner-1');
    });

    it('listed → unpublished', async () => {
      const { service, repo } = makeHarness();
      const c = seedCreation(repo, 'listed');
      const res = await service.unpublish(c.id);
      expect(res.status).toBe('unpublished');
    });

    it('拒绝对 draft 主动下架(非法流转)', async () => {
      const { service, repo } = makeHarness();
      const c = seedCreation(repo, 'draft');
      await expect(service.unpublish(c.id)).rejects.toBeInstanceOf(
        InvalidCreationTransitionError,
      );
    });

    it('拒绝对 suspended(终态)主动下架', async () => {
      const { service, repo } = makeHarness();
      const c = seedCreation(repo, 'suspended');
      await expect(service.unpublish(c.id)).rejects.toBeInstanceOf(
        InvalidCreationTransitionError,
      );
    });
  });

  // ============================================================
  // 需求 3.5 — 审计日志读取(谁/何时/结论/原因,按时间升序)
  // ============================================================
  describe('getDecisions (需求 3.5)', () => {
    it('returns the full audit trail in chronological order', async () => {
      const { service, repo } = makeHarness();
      const c = seedCreation(repo, 'published');

      await service.report(c.id, 'user-42', '举报1');
      await service.takedown(c.id, '确认违规', 'reviewer-9');

      const decisions = await service.getDecisions(c.id);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].stage).toBe('report');
      expect(decisions[1].stage).toBe('takedown');
      // 每条都带时间戳(何时)。
      expect(typeof decisions[0].ts).toBe('number');
      expect(decisions[1].ts).toBeGreaterThanOrEqual(decisions[0].ts);
    });
  });
});
