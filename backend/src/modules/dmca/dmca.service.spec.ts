import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DmcaService } from './dmca.service';
import { DmcaReport, DmcaTargetKind } from '../../entities/dmca-report.entity';

class FakeRepo {
  rows: DmcaReport[] = [];
  create(p: Partial<DmcaReport>): DmcaReport {
    return {
      id: 'r-' + Math.random().toString(36).slice(2, 10),
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      reviewerUserId: null,
      reviewNotes: null,
      flaggedFalse: false,
      ...(p as any),
    } as DmcaReport;
  }
  async save(r: DmcaReport): Promise<DmcaReport> {
    const i = this.rows.findIndex((x) => x.id === r.id);
    if (i >= 0) this.rows[i] = r;
    else this.rows.push(r);
    return r;
  }
  async findOne(opts: any): Promise<DmcaReport | null> {
    if (opts.where?.id) return this.rows.find((x) => x.id === opts.where.id) ?? null;
    return null;
  }
  async find(opts: any): Promise<DmcaReport[]> {
    const wheres: any[] = Array.isArray(opts.where) ? opts.where : [opts.where];
    return this.rows
      .filter((r) => wheres.some((w) => Object.entries(w).every(([k, v]) => (r as any)[k] === v)))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, opts.take ?? 50);
  }
  createQueryBuilder() {
    const captured: any = { params: {}, predicates: [] as Array<(r: DmcaReport) => boolean> };
    const qb: any = {
      where: (sql: string, params: any) => { captured.params = { ...captured.params, ...params }; qb._whereSet = true; return qb; },
      andWhere: (sql: string, params: any) => {
        captured.params = { ...captured.params, ...params };
        if (sql.includes('claimant_user_id')) captured.predicates.push((r) => r.claimantUserId === captured.params.uid);
        if (sql.includes('target_id')) captured.predicates.push((r) => r.targetId === captured.params.tid);
        if (sql.includes('target_kind')) captured.predicates.push((r) => r.targetKind === captured.params.tk);
        if (sql.includes('created_at >')) captured.predicates.push((r) => r.createdAt > captured.params.cutoff);
        return qb;
      },
      getOne: async () => {
        // Apply uid predicate from initial where
        const matching = this.rows.find((r) =>
          r.claimantUserId === captured.params.uid &&
          captured.predicates.every((p: any) => p(r))
        );
        return matching ?? null;
      },
    };
    return qb;
  }
}

const baseInput = (over: Partial<any> = {}) => ({
  claimantUserId: 'user-1',
  claimantEmail: 'a@b.com',
  targetKind: 'pet_skin' as DmcaTargetKind,
  targetId: '00000000-0000-0000-0000-000000000001',
  rightType: 'copyright',
  description: 'I am the original creator of this artwork. The uploader copied my illustration without permission. Original posted on my Instagram on 2024-01-15.',
  swornStatement: true,
  ...over,
});

describe('DmcaService (BE-T2.9)', () => {
  let repo: FakeRepo;
  let svc: DmcaService;

  beforeEach(() => {
    repo = new FakeRepo();
    svc = new DmcaService(repo as any);
  });

  describe('createReport validation', () => {
    it('rejects when swornStatement=false', async () => {
      await expect(svc.createReport(baseInput({ swornStatement: false }))).rejects.toThrow(BadRequestException);
    });

    it('rejects on invalid email', async () => {
      await expect(svc.createReport(baseInput({ claimantEmail: 'not-an-email' }))).rejects.toThrow(/email/);
    });

    it('rejects when description < 30 chars', async () => {
      await expect(svc.createReport(baseInput({ description: 'too short' }))).rejects.toThrow(/30 characters/);
    });

    it('rejects when targetId missing', async () => {
      await expect(svc.createReport(baseInput({ targetId: '' }))).rejects.toThrow(BadRequestException);
    });

    it('happy path: creates pending report with default rightType=copyright', async () => {
      const out = await svc.createReport(baseInput({ rightType: undefined }));
      expect(out.status).toBe('pending');
      expect(out.rightType).toBe('copyright');
      expect(out.swornStatement).toBe(true);
    });

    it('persists evidenceUrls when provided', async () => {
      const out = await svc.createReport(baseInput({ evidenceUrls: ['https://x.com/orig'] }));
      expect(out.evidenceUrls).toEqual(['https://x.com/orig']);
    });

    it('stores null evidenceUrls when array empty', async () => {
      const out = await svc.createReport(baseInput({ evidenceUrls: [] }));
      expect(out.evidenceUrls).toBeNull();
    });

    it('rejects duplicate from same claimant on same target within 7 days', async () => {
      await svc.createReport(baseInput());
      await expect(svc.createReport(baseInput())).rejects.toThrow(/duplicate/);
    });

    it('allows different claimant on same target', async () => {
      await svc.createReport(baseInput({ claimantUserId: 'user-1' }));
      const out2 = await svc.createReport(baseInput({ claimantUserId: 'user-2' }));
      expect(out2.id).toBeDefined();
    });
  });

  describe('resolve', () => {
    it('upheld → status=upheld, resolvedAt set, reviewer recorded', async () => {
      const r = await svc.createReport(baseInput());
      const out = await svc.resolve(r.id, 'admin-1', 'upheld', 'verified original work');
      expect(out.status).toBe('upheld');
      expect(out.reviewerUserId).toBe('admin-1');
      expect(out.reviewNotes).toBe('verified original work');
      expect(out.resolvedAt).toBeInstanceOf(Date);
    });

    it('rejected → status=rejected', async () => {
      const r = await svc.createReport(baseInput());
      const out = await svc.resolve(r.id, 'admin-1', 'rejected');
      expect(out.status).toBe('rejected');
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(svc.resolve('nope', 'admin-1', 'upheld')).rejects.toThrow(NotFoundException);
    });

    it('cannot resolve already-resolved report', async () => {
      const r = await svc.createReport(baseInput());
      await svc.resolve(r.id, 'admin-1', 'upheld');
      await expect(svc.resolve(r.id, 'admin-2', 'rejected')).rejects.toThrow(/cannot resolve/);
    });
  });

  describe('withdraw', () => {
    it('original claimant can withdraw pending report', async () => {
      const r = await svc.createReport(baseInput());
      const out = await svc.withdraw(r.id, 'user-1');
      expect(out.status).toBe('withdrawn');
    });

    it('non-claimant cannot withdraw', async () => {
      const r = await svc.createReport(baseInput());
      await expect(svc.withdraw(r.id, 'user-2')).rejects.toThrow(/only the original claimant/);
    });
  });

  describe('listPending', () => {
    it('returns only pending + reviewing reports, oldest first', async () => {
      const a = await svc.createReport(baseInput({ claimantUserId: 'u-a' }));
      const b = await svc.createReport(baseInput({ claimantUserId: 'u-b', targetId: '00000000-0000-0000-0000-000000000002' }));
      await svc.resolve(b.id, 'admin', 'rejected');
      const pending = await svc.listPending();
      expect(pending.map((p) => p.id)).toEqual([a.id]);
    });
  });

  describe('toDto', () => {
    it('includes ISO timestamps and snake_case keys', async () => {
      const r = await svc.createReport(baseInput());
      const dto = svc.toDto(r);
      expect(dto).toMatchObject({
        report_id: r.id,
        target_kind: 'pet_skin',
        right_type: 'copyright',
        status: 'pending',
      });
      expect(typeof dto.created_at).toBe('string');
      expect(dto.resolved_at).toBeNull();
    });
  });
});
