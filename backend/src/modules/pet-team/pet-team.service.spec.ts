import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetTeamService, ALL_TEAM_ROLES } from './pet-team.service';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { BadRequestException } from '@nestjs/common';

/**
 * Phase 6 M2 — pet-team unit tests.
 * In-memory Map-backed repo so we can exercise the unique (parent, role) rule.
 */

function makeRepo() {
  const store = new Map<string, PetTeamMember>();
  let seq = 0;
  return {
    store,
    create(p: Partial<PetTeamMember>) {
      return { ...p } as PetTeamMember;
    },
    async save(row: PetTeamMember) {
      if (!row.id) row.id = `mem-${++seq}`;
      if (!row.createdAt) row.createdAt = new Date();
      row.updatedAt = new Date();
      store.set(row.id, { ...row });
      return store.get(row.id)!;
    },
    async findOne({ where }: { where: any }) {
      for (const row of store.values()) {
        let match = true;
        for (const k of Object.keys(where)) {
          if ((row as any)[k] !== where[k]) { match = false; break; }
        }
        if (match) return row;
      }
      return undefined;
    },
    async find({ where, order }: { where: any; order?: any }) {
      const out: PetTeamMember[] = [];
      for (const row of store.values()) {
        let match = true;
        for (const k of Object.keys(where)) {
          if ((row as any)[k] !== where[k]) { match = false; break; }
        }
        if (match) out.push(row);
      }
      if (order?.createdAt === 'ASC') {
        out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return out;
    },
  };
}

describe('PetTeamService — Phase 6 M2', () => {
  let service: PetTeamService;
  let repo: ReturnType<typeof makeRepo>;
  const PARENT = 'pet-parent-1';
  const USER = 'user-1';

  beforeEach(async () => {
    repo = makeRepo();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetTeamService,
        { provide: getRepositoryToken(PetTeamMember), useValue: repo },
      ],
    }).compile();
    service = mod.get(PetTeamService);
  });

  it('grants a role and lists it', async () => {
    const m = await service.grant(PARENT, USER, {
      role: 'dev', soulTemplateId: 'tinker', dailyBudgetUsd: 1.5,
    });
    expect(m.role).toBe('dev');
    expect(m.status).toBe('active');
    expect(Number(m.dailyBudgetUsd)).toBe(1.5);
    const items = await service.list(PARENT);
    expect(items).toHaveLength(1);
  });

  it('rejects duplicate role on same parent', async () => {
    await service.grant(PARENT, USER, { role: 'dev', soulTemplateId: 'tinker' });
    await expect(
      service.grant(PARENT, USER, { role: 'dev', soulTemplateId: 'pixel_c' }),
    ).rejects.toThrow(/already granted/);
  });

  it('rejects unknown role', async () => {
    await expect(
      service.grant(PARENT, USER, { role: 'unknown' as any, soulTemplateId: 'claw' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('caps team at 11 distinct roles via unique (parent, role)', async () => {
    for (const r of ALL_TEAM_ROLES) {
      await service.grant(PARENT, USER, { role: r, soulTemplateId: 'claw' });
    }
    const items = await service.list(PARENT);
    expect(items).toHaveLength(11);
    expect(new Set(items.map((i) => i.role)).size).toBe(11);
  });

  it('pause / resume / revoke transition status', async () => {
    const m = await service.grant(PARENT, USER, { role: 'qa_ops', soulTemplateId: 'sentry' });
    const paused = await service.pause(m.id, PARENT);
    expect(paused.status).toBe('paused');
    const resumed = await service.resume(m.id, PARENT);
    expect(resumed.status).toBe('active');
    const revoked = await service.revoke(m.id, PARENT);
    expect(revoked.status).toBe('revoked');
  });

  it('updateScope mutates scope, budget, displayName', async () => {
    const m = await service.grant(PARENT, USER, { role: 'treasury', soulTemplateId: 'whale' });
    const updated = await service.updateScope(m.id, PARENT, {
      scope: { tools: ['on_chain_api'], maxApprovalLevel: 'L3' },
      dailyBudgetUsd: 9.99,
      displayName: 'Vault Keeper',
    });
    expect(updated.scope).toEqual({ tools: ['on_chain_api'], maxApprovalLevel: 'L3' });
    expect(Number(updated.dailyBudgetUsd)).toBe(9.99);
    expect(updated.displayName).toBe('Vault Keeper');
  });

  it('refuses cross-parent member access', async () => {
    const m = await service.grant(PARENT, USER, { role: 'media', soulTemplateId: 'fox' });
    await expect(service.pause(m.id, 'other-pet')).rejects.toThrow(/does not belong/);
  });
});
