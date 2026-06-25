import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UgcGameService } from './ugc-game.service';
import { WorldGameRuleSet } from '../entities/world-game-ruleset.entity';

/**
 * Phase D — UGC 规则集单测。
 *
 * 验证: 创建 + 生成唯一 shareCode;规则 sanitize/clamp(防注入防破坏平衡);
 *       按码加载;play 计数;私有拒绝;删除鉴权;每用户上限。
 */
describe('UgcGameService (Phase D UGC rule sets)', () => {
  let service: UgcGameService;
  let store: Map<string, WorldGameRuleSet>;

  beforeEach(async () => {
    store = new Map();
    let seq = 0;

    const repo = {
      count: jest.fn(async ({ where }: any) =>
        [...store.values()].filter((r) => r.creatorUserId === where.creatorUserId).length,
      ),
      findOne: jest.fn(async ({ where }: any) => {
        if (where.shareCode) return [...store.values()].find((r) => r.shareCode === where.shareCode) ?? null;
        if (where.id) return store.get(where.id) ?? null;
        return null;
      }),
      find: jest.fn(async ({ where }: any) =>
        [...store.values()].filter((r) => r.creatorUserId === where.creatorUserId),
      ),
      create: jest.fn((data: any) => ({ id: `rs-${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...data })),
      save: jest.fn(async (r: WorldGameRuleSet) => { store.set(r.id, r); return r; }),
      increment: jest.fn(async ({ id }: any, _field: string, by: number) => {
        const r = store.get(id);
        if (r) r.playCount += by;
      }),
      delete: jest.fn(async (id: string) => { store.delete(id); }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UgcGameService,
        { provide: getRepositoryToken(WorldGameRuleSet), useValue: repo },
      ],
    }).compile();
    service = module.get(UgcGameService);
  });

  it('createRuleSet: 生成规则集 + 唯一 8 位 shareCode', async () => {
    const rs = await service.createRuleSet('user-1', { name: '极速对决', description: '高伤快节奏' });
    expect(rs.name).toBe('极速对决');
    expect(rs.shareCode).toHaveLength(8);
    expect(rs.creatorUserId).toBe('user-1');
  });

  it('createRuleSet: 空名/超长名拒绝', async () => {
    await expect(service.createRuleSet('user-1', { name: '' })).rejects.toThrow(BadRequestException);
    await expect(service.createRuleSet('user-1', { name: 'x'.repeat(41) })).rejects.toThrow(BadRequestException);
  });

  it('sanitizeRules: clamp 到安全范围 + 过滤未知键', async () => {
    const rs = await service.createRuleSet('user-1', {
      name: 'test',
      rules: {
        maxRounds: 999,           // → clamp 40
        energyMax: 0,             // → clamp 1
        damageMultiplier: 10,     // → clamp 2.0
        critEnabled: true,
        winCondition: 'hp_majority',
        evilInjection: 'DROP TABLE',
      } as any,
    });
    expect(rs.rules.maxRounds).toBe(40);
    expect(rs.rules.energyMax).toBe(1);
    expect(rs.rules.damageMultiplier).toBe(2.0);
    expect(rs.rules.critEnabled).toBe(true);
    expect(rs.rules.winCondition).toBe('hp_majority');
    expect((rs.rules as any).evilInjection).toBeUndefined();
  });

  it('getByShareCode: 公开可加载, 私有拒绝', async () => {
    const pub = await service.createRuleSet('user-1', { name: 'pub', isPublic: true });
    const priv = await service.createRuleSet('user-1', { name: 'priv', isPublic: false });

    const loaded = await service.getByShareCode(pub.shareCode);
    expect(loaded.id).toBe(pub.id);
    await expect(service.getByShareCode(priv.shareCode)).rejects.toThrow(ForbiddenException);
  });

  it('getByShareCode: 不存在 → NotFound', async () => {
    await expect(service.getByShareCode('NOPE0000')).rejects.toThrow(NotFoundException);
  });

  it('play: 计 playCount + 返回 clamp 后规则', async () => {
    const rs = await service.createRuleSet('user-1', { name: 'p', rules: { maxRounds: 12 } });
    const r = await service.play(rs.shareCode);
    expect(r.effectiveRules.maxRounds).toBe(12);
    expect(store.get(rs.id)!.playCount).toBe(1);
  });

  it('deleteRuleSet: 仅创建者可删', async () => {
    const rs = await service.createRuleSet('user-1', { name: 'x' });
    await expect(service.deleteRuleSet('other', rs.id)).rejects.toThrow(ForbiddenException);
    const r = await service.deleteRuleSet('user-1', rs.id);
    expect(r.success).toBe(true);
    expect(store.get(rs.id)).toBeUndefined();
  });

  it('listMine: 只返回本人规则集', async () => {
    await service.createRuleSet('user-1', { name: 'a' });
    await service.createRuleSet('user-1', { name: 'b' });
    await service.createRuleSet('user-2', { name: 'c' });
    const mine = await service.listMine('user-1');
    expect(mine.length).toBe(2);
  });
});
