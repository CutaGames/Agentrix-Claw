import { NotFoundException } from '@nestjs/common';
import { CreationService } from './creation.service';
import { CreationRepository } from './creation.repository';
import {
  CreationStateMachine,
  InvalidCreationTransitionError,
} from './creation-state-machine';
import { CreationEntity } from './entities/creation.entity';
import { toGridCell } from '../../../shared/types/aeon-world';
import type { CreationPreview, Offering } from '../../../shared/types/creation';

/**
 * 单元测试:CreationService(world-creation-feed task 1.5)。
 *
 * Validates:
 *  - 需求 1.1:统一 Creation 对象的创建(唯一 id / 创作者 / 类型 / 状态 / 可空地理 /
 *              可空网格 / 预览 / 内容引用)。
 *  - 需求 1.6 / 1.7:仅内容 / 仅地理 / 两者皆有三种创建形态。
 *  - 需求 1.4 / 3.1 / 3.4:状态流转经状态机守卫(合法放行,非法拒绝)。
 *  - task 1.1:geoGridCell 与 geo.gridCell 在写入时保持同步。
 *
 * 用**忠实的内存仓库**(真实 create/save/find 语义,非桩造返回值)驱动服务,
 * 配真实 CreationStateMachine,验证 CRUD + 流转的真实编排逻辑。
 */

/** 仅实现服务实际用到的方法,行为对齐 CreationRepository / TypeORM 语义。 */
class InMemoryCreationRepo {
  private rows = new Map<string, CreationEntity>();
  private seq = 0;

  create(partial: Partial<CreationEntity>): CreationEntity {
    // TypeORM 的 repo.create 返回未持久化实例(不写库)。
    return { ...partial } as CreationEntity;
  }

  async save(entity: CreationEntity): Promise<CreationEntity> {
    if (!entity.id) {
      entity.id = `creation-${++this.seq}`;
      entity.version = 1;
      entity.createdAt = new Date();
      entity.updatedAt = new Date();
    } else {
      entity.version = (entity.version ?? 0) + 1;
      entity.updatedAt = new Date();
    }
    // 存快照,避免外部引用直接改库内对象。
    this.rows.set(entity.id, { ...entity });
    return entity;
  }

  async findById(id: string): Promise<CreationEntity | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByIds(ids: string[]): Promise<CreationEntity[]> {
    return ids.map((id) => this.rows.get(id)).filter((r): r is CreationEntity => !!r).map((r) => ({ ...r }));
  }

  async findByShareCode(shareCode: string): Promise<CreationEntity | null> {
    for (const row of this.rows.values()) {
      if (row.shareCode === shareCode) return { ...row };
    }
    return null;
  }

  async findByOwner(ownerAccountId: string): Promise<CreationEntity[]> {
    return [...this.rows.values()]
      .filter((r) => r.ownerAccountId === ownerAccountId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((r) => ({ ...r }));
  }

  async deleteById(id: string): Promise<void> {
    this.rows.delete(id);
  }

  /** 测试断言用:当前行数。 */
  count(): number {
    return this.rows.size;
  }
}

function makeService(): {
  service: CreationService;
  repo: InMemoryCreationRepo;
  sm: CreationStateMachine;
} {
  const repo = new InMemoryCreationRepo();
  const sm = new CreationStateMachine();
  const service = new CreationService(
    repo as unknown as CreationRepository,
    sm,
  );
  return { service, repo, sm };
}

const PREVIEW: CreationPreview = { kind: 'cover', url: 'https://cdn.example/cover.png' };
const OFFERING: Offering = {
  id: 'off-1',
  kind: 'product',
  name: '咖啡',
  price: { axp: 10 },
  verbs: ['order', 'query'],
};

describe('CreationService (task 1.5)', () => {
  // ============================================================
  // Create — three shapes (需求 1.1 / 1.6 / 1.7)
  // ============================================================
  describe('create', () => {
    it('creates a content-only Creation (no geo) as draft with sane defaults (需求 1.7)', async () => {
      const { service } = makeService();

      const c = await service.create({
        ownerAccountId: 'owner-1',
        type: 'game',
        title: '太空跑酷',
      });

      expect(c.id).toBeDefined();
      expect(c.status).toBe('draft');
      expect(c.ownerAccountId).toBe('owner-1');
      // originalCreator 默认 = owner。
      expect(c.originalCreatorAccountId).toBe('owner-1');
      expect(c.substrateTier).toBe('A');
      expect(c.ecsVersionId).toBeNull();
      expect(c.boundAgentId).toBeNull();
      expect(c.geo).toBeNull();
      expect(c.geoGridCell).toBeNull();
      expect(c.poi).toBeNull();
      expect(c.preview).toBeNull();
      expect(c.offerings).toEqual([]);
      expect(c.manifestVersion).toBe(0);
      expect(c.shareCode).toBeNull();
      expect(c.metrics).toEqual({ views: 0, likes: 0, sales: 0, comments: 0 });
    });

    it('creates a geo-only Creation and syncs geoGridCell with geo.gridCell (需求 1.6 / task 1.1)', async () => {
      const { service } = makeService();
      const lat = 31.2304;
      const lng = 121.4737;

      const c = await service.create({
        ownerAccountId: 'owner-2',
        type: 'place',
        title: '外滩咖啡馆',
        geo: { lat, lng },
      });

      const expectedCell = toGridCell(lat, lng);
      expect(c.geo).toEqual({ lat, lng, gridCell: expectedCell });
      expect(c.geoGridCell).toBe(expectedCell);
      expect(c.geo!.gridCell).toBe(c.geoGridCell);
      // 仅地理:内容维度可空。
      expect(c.ecsVersionId).toBeNull();
    });

    it('creates a Creation with both geo and content + offerings/poi (需求 1.6 + 1.10)', async () => {
      const { service } = makeService();

      const c = await service.create({
        ownerAccountId: 'owner-3',
        originalCreatorAccountId: 'creator-9',
        type: 'shop',
        title: '便利店',
        summary: '24h',
        substrateTier: 'B',
        ecsVersionId: 'ecs-v1',
        geo: { lat: 22.5, lng: 114.0 },
        poi: { name: '7-11', category: 'shop', verified: true },
        preview: PREVIEW,
        offerings: [OFFERING],
      });

      expect(c.originalCreatorAccountId).toBe('creator-9');
      expect(c.substrateTier).toBe('B');
      expect(c.ecsVersionId).toBe('ecs-v1');
      expect(c.geoGridCell).toBe(toGridCell(22.5, 114.0));
      expect(c.poi).toEqual({ name: '7-11', category: 'shop', verified: true });
      expect(c.preview).toEqual(PREVIEW);
      expect(c.offerings).toEqual([OFFERING]);
    });

    it('persists the created Creation so it can be read back', async () => {
      const { service, repo } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      expect(repo.count()).toBe(1);
      const fetched = await service.getById(c.id);
      expect(fetched.id).toBe(c.id);
    });
  });

  // ============================================================
  // Read
  // ============================================================
  describe('read', () => {
    it('getById throws NotFoundException for a missing id', async () => {
      const { service } = makeService();
      await expect(service.getById('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('findById returns null for a missing id (no throw)', async () => {
      const { service } = makeService();
      expect(await service.findById('nope')).toBeNull();
    });

    it('getByShareCode resolves a published Creation by its share code', async () => {
      const { service, repo } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      // 模拟发布后写入 shareCode(后续任务 2.3 行为;此处直接落库)。
      const row = await repo.findById(c.id);
      row!.shareCode = 'ABC123';
      await repo.save(row!);

      const found = await service.getByShareCode('ABC123');
      expect(found?.id).toBe(c.id);
      expect(await service.getByShareCode('MISSING')).toBeNull();
    });

    it('listByOwner returns only that owner’s Creations', async () => {
      const { service } = makeService();
      await service.create({ ownerAccountId: 'owner-A', type: 'game', title: 'a1' });
      await service.create({ ownerAccountId: 'owner-A', type: 'shop', title: 'a2' });
      await service.create({ ownerAccountId: 'owner-B', type: 'place', title: 'b1' });

      const mine = await service.listByOwner('owner-A');
      expect(mine).toHaveLength(2);
      expect(mine.every((c) => c.ownerAccountId === 'owner-A')).toBe(true);
    });
  });

  // ============================================================
  // Update — field updates keep geoGridCell in sync; status unaffected
  // ============================================================
  describe('update', () => {
    it('updates only explicitly provided fields', async () => {
      const { service } = makeService();
      const c = await service.create({
        ownerAccountId: 'o',
        type: 'game',
        title: 'old',
        summary: 'keep-me',
      });

      const updated = await service.update(c.id, { title: 'new' });
      expect(updated.title).toBe('new');
      // 未提供的字段保持不变。
      expect(updated.summary).toBe('keep-me');
      expect(updated.type).toBe('game');
    });

    it('re-derives geoGridCell when geo is updated (task 1.1)', async () => {
      const { service } = makeService();
      const c = await service.create({
        ownerAccountId: 'o',
        type: 'place',
        title: 't',
        geo: { lat: 10, lng: 20 },
      });
      expect(c.geoGridCell).toBe(toGridCell(10, 20));

      const moved = await service.update(c.id, { geo: { lat: 30, lng: 40 } });
      expect(moved.geo).toEqual({ lat: 30, lng: 40, gridCell: toGridCell(30, 40) });
      expect(moved.geoGridCell).toBe(toGridCell(30, 40));
    });

    it('clears geo and geoGridCell when geo is explicitly set to null', async () => {
      const { service } = makeService();
      const c = await service.create({
        ownerAccountId: 'o',
        type: 'place',
        title: 't',
        geo: { lat: 10, lng: 20 },
      });

      const cleared = await service.update(c.id, { geo: null });
      expect(cleared.geo).toBeNull();
      expect(cleared.geoGridCell).toBeNull();
    });

    it('leaves geo untouched when geo key is absent from the patch', async () => {
      const { service } = makeService();
      const c = await service.create({
        ownerAccountId: 'o',
        type: 'place',
        title: 't',
        geo: { lat: 10, lng: 20 },
      });

      const updated = await service.update(c.id, { title: 'renamed' });
      expect(updated.geo).toEqual({ lat: 10, lng: 20, gridCell: toGridCell(10, 20) });
      expect(updated.geoGridCell).toBe(toGridCell(10, 20));
    });

    it('does not change status (status flows only via transitionStatus)', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      const updated = await service.update(c.id, { title: 'x' });
      expect(updated.status).toBe('draft');
    });

    it('throws NotFoundException when updating a missing Creation', async () => {
      const { service } = makeService();
      await expect(service.update('nope', { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ============================================================
  // State transitions (需求 1.4 / 3.1 / 3.4)
  // ============================================================
  describe('transitionStatus', () => {
    it('allows draft → under_review → published (审核前置, 需求 3.1)', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });

      const review = await service.transitionStatus(c.id, 'under_review');
      expect(review.status).toBe('under_review');

      const published = await service.transitionStatus(c.id, 'published');
      expect(published.status).toBe('published');
    });

    it('persists the new status', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      await service.transitionStatus(c.id, 'under_review');
      const reloaded = await service.getById(c.id);
      expect(reloaded.status).toBe('under_review');
    });

    it('allows suspending from any non-terminal state (违规即移出, 需求 3.4)', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      const suspended = await service.transitionStatus(c.id, 'suspended');
      expect(suspended.status).toBe('suspended');
    });

    it('rejects draft → published (bypasses review) without persisting', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });

      await expect(service.transitionStatus(c.id, 'published')).rejects.toBeInstanceOf(
        InvalidCreationTransitionError,
      );
      // 状态未被改动。
      const reloaded = await service.getById(c.id);
      expect(reloaded.status).toBe('draft');
    });

    it('rejects transitions out of the terminal suspended state', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      await service.transitionStatus(c.id, 'suspended');

      await expect(service.transitionStatus(c.id, 'published')).rejects.toBeInstanceOf(
        InvalidCreationTransitionError,
      );
    });

    it('rejects same-state self-loops', async () => {
      const { service } = makeService();
      const c = await service.create({ ownerAccountId: 'o', type: 'game', title: 't' });
      await expect(service.transitionStatus(c.id, 'draft')).rejects.toBeInstanceOf(
        InvalidCreationTransitionError,
      );
    });

    it('throws NotFoundException when transitioning a missing Creation', async () => {
      const { service } = makeService();
      await expect(service.transitionStatus('nope', 'under_review')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
