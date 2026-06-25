import { Repository } from 'typeorm';
import { CreationLegacyMapService } from './creation-legacy-map.service';
import {
  CreationLegacyMapEntity,
  CreationLegacySourceType,
} from './entities/creation-legacy-map.entity';

/**
 * 单元测试:CreationLegacyMapService(world-creation-feed task 1.4)。
 *
 * 用一个**忠实的内存仓库**(真实实现 findOne/find/create/save 语义,而非桩造返回值)
 * 驱动服务,验证迁移接缝的真实逻辑:
 *   - 正/反向解析(需求 12.1 双写、12.2 对账);
 *   - upsert 幂等(同一 legacy 对象重复回填不产生重复行 —— 需求 12.2 幂等回填基石);
 *   - 批量解析映射表构建(回填批处理)。
 */

/** 仅实现服务实际使用到的方法,行为对齐 TypeORM 语义(精确 where 匹配)。 */
class InMemoryLegacyMapRepo {
  private rows: CreationLegacyMapEntity[] = [];
  private seq = 0;

  create(partial: Partial<CreationLegacyMapEntity>): CreationLegacyMapEntity {
    return { ...partial } as CreationLegacyMapEntity;
  }

  async save(entity: CreationLegacyMapEntity): Promise<CreationLegacyMapEntity> {
    if (!entity.id) {
      entity.id = `row-${++this.seq}`;
      entity.createdAt = new Date();
      entity.updatedAt = new Date();
      this.rows.push(entity);
    } else {
      const idx = this.rows.findIndex((r) => r.id === entity.id);
      entity.updatedAt = new Date();
      if (idx >= 0) this.rows[idx] = entity;
      else this.rows.push(entity);
    }
    return entity;
  }

  async findOne(opts: { where: Partial<CreationLegacyMapEntity> }): Promise<CreationLegacyMapEntity | null> {
    const where = opts.where;
    return (
      this.rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  }

  async find(opts: { where: { sourceType?: CreationLegacySourceType; creationId?: string; legacyId?: unknown } }): Promise<CreationLegacyMapEntity[]> {
    const where = opts.where;
    // service 用 TypeORM In(legacyIds) → FindOperator,公开 `value` getter 暴露数组。
    const legacyIdIn: string[] | null =
      where.legacyId && typeof where.legacyId === 'object'
        ? ((where.legacyId as { value: string[] }).value)
        : null;
    return this.rows.filter((r) => {
      if (where.sourceType !== undefined && r.sourceType !== where.sourceType) return false;
      if (where.creationId !== undefined && r.creationId !== where.creationId) return false;
      if (legacyIdIn !== null && !legacyIdIn.includes(r.legacyId)) return false;
      return true;
    });
  }

  /** 测试断言用:当前行数。 */
  count(): number {
    return this.rows.length;
  }
}

function makeService(): { service: CreationLegacyMapService; repo: InMemoryLegacyMapRepo } {
  const repo = new InMemoryLegacyMapRepo();
  const service = new CreationLegacyMapService(repo as unknown as Repository<CreationLegacyMapEntity>);
  return { service, repo };
}

describe('CreationLegacyMapService', () => {
  it('records a mapping and resolves it in both directions', async () => {
    const { service } = makeService();

    await service.recordMapping({
      sourceType: 'aeon_plot',
      legacyId: 'aeon-1',
      creationId: 'creation-1',
    });

    expect(await service.resolveCreationId('aeon_plot', 'aeon-1')).toBe('creation-1');
    expect(await service.resolveLegacyId('creation-1', 'aeon_plot')).toBe('aeon-1');
  });

  it('returns null when no mapping exists', async () => {
    const { service } = makeService();
    expect(await service.resolveCreationId('world_plot', 'missing')).toBeNull();
    expect(await service.resolveLegacyId('creation-x', 'world_plot')).toBeNull();
  });

  it('is idempotent: re-recording the same legacy object updates in place (no duplicate rows)', async () => {
    const { service, repo } = makeService();

    await service.recordMapping({ sourceType: 'world_plot', legacyId: 'wp-1', creationId: 'creation-1' });
    // 回填脚本重跑:同一 legacy 对象再次记录,指向(可能更新后的)creationId。
    await service.recordMapping({ sourceType: 'world_plot', legacyId: 'wp-1', creationId: 'creation-2', backfilled: true });

    expect(repo.count()).toBe(1);
    expect(await service.resolveCreationId('world_plot', 'wp-1')).toBe('creation-2');
  });

  it('lets one Creation carry both geo (aeon_plot) and content (world_plot) legacy sources', async () => {
    const { service } = makeService();

    await service.recordMapping({ sourceType: 'aeon_plot', legacyId: 'aeon-9', creationId: 'creation-9' });
    await service.recordMapping({ sourceType: 'world_plot', legacyId: 'wp-9', creationId: 'creation-9' });

    const refs = await service.resolveLegacyRefs('creation-9');
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.sourceType).sort()).toEqual(['aeon_plot', 'world_plot']);
  });

  it('builds a batch legacyId→creationId map for one source type', async () => {
    const { service } = makeService();
    await service.recordMapping({ sourceType: 'world_plot', legacyId: 'wp-a', creationId: 'c-a' });
    await service.recordMapping({ sourceType: 'world_plot', legacyId: 'wp-b', creationId: 'c-b' });
    await service.recordMapping({ sourceType: 'aeon_plot', legacyId: 'wp-a', creationId: 'c-other' });

    const map = await service.resolveCreationIds('world_plot', ['wp-a', 'wp-b', 'wp-missing']);
    expect(map.get('wp-a')).toBe('c-a');
    expect(map.get('wp-b')).toBe('c-b');
    expect(map.has('wp-missing')).toBe(false);
    expect(map.size).toBe(2);
  });

  it('marks backfilled mappings with a timestamp while dual-write mappings stay null', async () => {
    const { service } = makeService();
    await service.recordMapping({ sourceType: 'aeon_plot', legacyId: 'dw-1', creationId: 'c-1' }); // 双写
    await service.recordMapping({ sourceType: 'aeon_plot', legacyId: 'bf-1', creationId: 'c-2', backfilled: true });

    const dualWrite = (await service.resolveLegacyRefs('c-1'))[0];
    const backfilled = (await service.resolveLegacyRefs('c-2'))[0];
    expect(dualWrite.backfilledAt).toBeNull();
    expect(backfilled.backfilledAt).toBeInstanceOf(Date);
  });
});
