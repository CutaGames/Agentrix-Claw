import { NotFoundException } from '@nestjs/common';
import { CreationPublishService } from './creation-publish.service';
import { CreationRepository } from './creation.repository';
import {
  CreationStateMachine,
  InvalidCreationTransitionError,
} from './creation-state-machine';
import { OfferingDeriverService } from './offering-deriver.service';
import { CapabilityManifestDeriverService } from './capability-manifest-deriver.service';
import { CreationEntity } from './entities/creation.entity';
import { CreationCapabilityManifestEntity } from './entities/creation-capability-manifest.entity';
import { EcsWorldVersion } from '../world-creation/entities/ecs-world-version.entity';
import { ModerationService } from '../world-engine/services/moderation.service';
import type { EcsWorld } from '../../../shared/types/world-creation';

/**
 * 单元测试:CreationPublishService(world-creation-feed task 2.3)。
 *
 * Validates:
 *  - 需求 3.1:发布前过审;通过后流转 published/listed 并生成可分享短码。
 *  - 需求 3.2:发布要求预览物;缺失时自动生成占位预览。
 *  - 需求 3.3:审核未过 → 返回结构化 MODERATION_REJECTED,状态保持不变、内容不丢失。
 *  - 需求 3.6:发布成功返回 shareCode。
 *  - 需求 1.11 / Property 5:发布派生能力清单并持久化,manifestVersion 单调递增。
 *
 * 采用忠实的内存仓库(真实 find/save 语义)+ 真实状态机 / 真实 offering & manifest 派生器,
 * 仅对 world-engine ModerationService 用可控替身(按内容判定 pass/reject),
 * 验证发布管线的真实编排逻辑。
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
      entity.updatedAt = new Date();
    } else {
      entity.version = (entity.version ?? 0) + 1;
      entity.updatedAt = new Date();
    }
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

  /** 测试辅助:直接植入一行。 */
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

  create(partial: Partial<CreationCapabilityManifestEntity>): CreationCapabilityManifestEntity {
    return { ...partial } as CreationCapabilityManifestEntity;
  }

  async save(entity: CreationCapabilityManifestEntity): Promise<CreationCapabilityManifestEntity> {
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
}

/** 可控审核替身:默认全过;可配置某次拒绝。 */
class FakeModerationService {
  copyrightPass = true;
  prohibitedTerms: string[] = [];
  cnPass = true;

  async checkCopyrightedCharacter(): Promise<{ passed: boolean; reason?: string }> {
    return this.copyrightPass
      ? { passed: true }
      : { passed: false, reason: 'this character is not eligible for scanning' };
  }

  async checkProhibitedWords(): Promise<{ passed: boolean; offendingTerms: string[] }> {
    return {
      passed: this.prohibitedTerms.length === 0,
      offendingTerms: this.prohibitedTerms,
    };
  }

  async applyCnRegionModeration(): Promise<{ passed: boolean; reason?: string }> {
    return this.cnPass ? { passed: true } : { passed: false, reason: 'cn rejected' };
  }
}

interface Harness {
  service: CreationPublishService;
  repo: InMemoryCreationRepo;
  versionRepo: InMemoryVersionRepo;
  manifestRepo: InMemoryManifestRepo;
  moderation: FakeModerationService;
}

function makeHarness(): Harness {
  const repo = new InMemoryCreationRepo();
  const versionRepo = new InMemoryVersionRepo();
  const manifestRepo = new InMemoryManifestRepo();
  const moderation = new FakeModerationService();
  const service = new CreationPublishService(
    repo as unknown as CreationRepository,
    new CreationStateMachine(),
    new OfferingDeriverService(),
    new CapabilityManifestDeriverService(),
    moderation as unknown as ModerationService,
    versionRepo as any,
    manifestRepo as any,
  );
  return { service, repo, versionRepo, manifestRepo, moderation };
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
    title: '便利店',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreationEntity);
}

/** 带一个带价实体的 ECS_World(派生出一个 product offering)。 */
function shopWorld(): EcsWorld {
  return {
    ecsVersion: '1.0',
    plotId: 'plot_1',
    substrateTier: 'A',
    entities: [
      {
        id: 'coffee',
        components: { price: { axp: 50 }, ui: { button: '美式咖啡' } },
      },
    ],
  };
}

describe('CreationPublishService (task 2.3)', () => {
  // ============================================================
  // 审核通过 → published/listed + shareCode + manifest(需求 3.1/3.6/1.11)
  // ============================================================
  describe('moderation pass → publish', () => {
    it('publishes a content-only Creation (no offerings) to published with shareCode + manifest v1', async () => {
      const { service, repo, manifestRepo } = makeHarness();
      const c = seedDraft(repo, {
        type: 'game',
        title: '太空跑酷',
        preview: { kind: 'cover', url: 'https://cdn.example/cover.png' },
      });

      const res = await service.publish(c.id);

      expect(res.published).toBe(true);
      expect(res.shareCode).toBeDefined();
      expect(res.shareCode).toMatch(/^[0-9A-Z]{6,12}$/);
      expect(res.manifestVersion).toBe(1);

      const saved = await repo.findById(c.id);
      // 无 offering → published(非 listed)。
      expect(saved!.status).toBe('published');
      expect(saved!.shareCode).toBe(res.shareCode);
      expect(saved!.manifestVersion).toBe(1);

      // 能力清单已持久化且 active。
      const active = manifestRepo.activeFor(c.id);
      expect(active).toHaveLength(1);
      expect(active[0].version).toBe(1);
    });

    it('publishes a shop Creation with ECS-derived offerings to listed (需求 1.4)', async () => {
      const { service, repo, versionRepo, manifestRepo } = makeHarness();
      versionRepo.seed('ecs-v1', shopWorld());
      const c = seedDraft(repo, {
        ecsVersionId: 'ecs-v1',
        preview: { kind: 'cover', url: 'https://cdn.example/shop.png' },
      });

      const res = await service.publish(c.id);

      expect(res.published).toBe(true);
      const saved = await repo.findById(c.id);
      // 有 offering → listed(已上架交易)。
      expect(saved!.status).toBe('listed');
      expect(saved!.offerings).toHaveLength(1);
      expect(saved!.offerings[0].id).toBe('coffee');

      // manifest 含针对该 offering 的工具(order/query)。
      const active = manifestRepo.activeFor(c.id);
      expect(active[0].tools.length).toBeGreaterThanOrEqual(2);
      const toolNames = active[0].tools.map((t) => t.name);
      expect(toolNames).toContain('order_coffee');
      expect(toolNames).toContain('query_coffee');
    });

    it('auto-generates a placeholder preview when none provided (需求 3.2)', async () => {
      const { service, repo } = makeHarness();
      const c = seedDraft(repo, { preview: null });

      const res = await service.publish(c.id);

      expect(res.published).toBe(true);
      const saved = await repo.findById(c.id);
      expect(saved!.preview).not.toBeNull();
      expect(saved!.preview!.kind).toBe('cover');
      expect(saved!.preview!.url).toContain(c.id);
    });

    it('honours an explicit preview from the request (需求 3.2)', async () => {
      const { service, repo } = makeHarness();
      const c = seedDraft(repo, { preview: null });

      const explicit = { kind: 'video' as const, url: 'https://cdn.example/v.mp4' };
      await service.publish(c.id, { preview: explicit });

      const saved = await repo.findById(c.id);
      expect(saved!.preview).toEqual(explicit);
    });

    it('is idempotent: re-publishing returns the existing shareCode without re-deriving', async () => {
      const { service, repo, manifestRepo } = makeHarness();
      const c = seedDraft(repo, {
        preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
      });

      const first = await service.publish(c.id);
      const second = await service.publish(c.id);

      expect(second.published).toBe(true);
      expect(second.shareCode).toBe(first.shareCode);
      expect(second.manifestVersion).toBe(first.manifestVersion);
      // 未重复写入新清单(仍只有 1 个 active)。
      expect(manifestRepo.activeFor(c.id)).toHaveLength(1);
    });
  });

  // ============================================================
  // 审核拒绝 → 状态不变、内容保留(需求 3.3)
  // ============================================================
  describe('moderation reject → status unchanged', () => {
    it('returns MODERATION_REJECTED and keeps status draft on copyright failure (需求 3.3)', async () => {
      const { service, repo, moderation, manifestRepo } = makeHarness();
      moderation.copyrightPass = false;
      const c = seedDraft(repo, {
        preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
      });

      const res = await service.publish(c.id);

      expect(res.published).toBe(false);
      expect(res.error?.error).toBe('MODERATION_REJECTED');
      expect(res.error?.detail).toContain('pre_publish');
      expect(res.shareCode).toBeUndefined();

      // 状态保持 draft,未生成短码 / 清单。
      const saved = await repo.findById(c.id);
      expect(saved!.status).toBe('draft');
      expect(saved!.shareCode).toBeNull();
      expect(saved!.manifestVersion).toBe(0);
      expect(manifestRepo.activeFor(c.id)).toHaveLength(0);
    });

    it('returns MODERATION_REJECTED with offending terms on prohibited-words failure', async () => {
      const { service, repo, moderation } = makeHarness();
      moderation.prohibitedTerms = ['badword'];
      const c = seedDraft(repo, {
        preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
      });

      const res = await service.publish(c.id);

      expect(res.published).toBe(false);
      expect(res.error?.detail).toContain('badword');
      const saved = await repo.findById(c.id);
      expect(saved!.status).toBe('draft');
    });

    it('applies cn-region overlay and rejects when it fails', async () => {
      const { service, repo, moderation } = makeHarness();
      moderation.cnPass = false;
      const c = seedDraft(repo, {
        preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
      });

      const res = await service.publish(c.id, {}, { isChineseRegion: true });

      expect(res.published).toBe(false);
      expect(res.error?.detail).toContain('cn_region');
      const saved = await repo.findById(c.id);
      expect(saved!.status).toBe('draft');
    });
  });

  // ============================================================
  // manifestVersion 单调递增(Property 5)
  // ============================================================
  describe('manifest version monotonicity (Property 5)', () => {
    it('bumps manifestVersion on re-publish after unpublish', async () => {
      const { service, repo, manifestRepo } = makeHarness();
      const c = seedDraft(repo, {
        preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
      });

      const first = await service.publish(c.id);
      expect(first.manifestVersion).toBe(1);

      // 模拟下架后再次发布:状态回到 unpublished、清除 shareCode 让其重走发布。
      const row = await repo.findById(c.id);
      row!.status = 'unpublished';
      row!.shareCode = null;
      await repo.save(row!);

      const second = await service.publish(c.id);
      expect(second.published).toBe(true);
      expect(second.manifestVersion).toBe(2);

      // 仅最新版本 active(旧版本被置 inactive)。
      const active = manifestRepo.activeFor(c.id);
      expect(active).toHaveLength(1);
      expect(active[0].version).toBe(2);
      // 历史共保留 2 个版本。
      expect(manifestRepo.rows.filter((r) => r.creationId === c.id)).toHaveLength(2);
    });
  });

  // ============================================================
  // 守卫 / 边界
  // ============================================================
  describe('guards', () => {
    it('throws NotFoundException for a missing Creation', async () => {
      const { service } = makeHarness();
      await expect(service.publish('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects publishing a suspended (terminal) Creation', async () => {
      const { service, repo } = makeHarness();
      const c = seedDraft(repo, { status: 'suspended' });
      await expect(service.publish(c.id)).rejects.toBeInstanceOf(
        InvalidCreationTransitionError,
      );
    });
  });
});
