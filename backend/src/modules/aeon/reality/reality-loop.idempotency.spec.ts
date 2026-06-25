/**
 * AXP 幂等属性验证(spec soul-companion-onboarding,task P.4 — Correctness Property 8)。
 *
 * **Validates: Requirements 4.4, 5.3**
 *
 * Property 8(AXP 幂等):`first_task` 与 `settle_aeon` 的 AXP 发放使用固定
 * `idempotencyKey`/`refId`,重复触发不重复发放;可视化失败不回滚已发放金额。
 *
 * 两条发放路径与各自的去重机制:
 *   - first_task(R4.4):移动端 POST /v1/aeon/reality/reward(refId=固定串
 *     `soul-birth-first-task-{userId}`)→ RealityLoopService.rewardFromReality
 *     → creditWallet → AxpService.earn。去重应发生在 earn(同 refId 只入账一次)。
 *   - settle_aeon(R5.3):PlotService.checkIn → 以 aeon_plot_checkins 的
 *     唯一键 (plotId,userId,day) 做「发放前存在性检查」,命中即返回 rewardAxp=0、
 *     不再调用 creditWallet → 同一天重复签到只发放一次 15 AXP。
 *
 * 测试用**真实**的 AxpService / RealityLoopService / PlotService 实例
 * (直接 new,绕过 NestJS DI),仅注入内存假仓储 + 一个把 transaction(cb) 直接
 * 跑回调的 dataSource,从而忠实执行真实的发放/去重代码路径,不依赖 Postgres。
 *
 * 「可视化失败不回滚」:钱包跳动可视化由 earn 内的 `axp:earned` 广播
 * (emitDesktopSyncEvent → desktopSyncEventBus)驱动。该广播在 earn 中被
 * try/catch 包裹,因此即便可视化监听器抛错,余额提交也已完成、不回滚。
 *
 * fast-check numRuns 显式压到 20(速度优先,不用默认 100)。
 */
import 'reflect-metadata';
import * as fc from 'fast-check';
import { UserAxpLedger } from '../../../entities/user-axp-ledger.entity';
import { UserAxpBalance } from '../../../entities/user-axp-balance.entity';
import { AxpService } from '../../axp/axp.service';
import { RealityLoopService } from './reality-loop.service';
import { PlotService } from '../plot/plot.service';
import {
  desktopSyncEventBus,
  DESKTOP_SYNC_EVENT,
} from '../../desktop-sync/desktop-sync.events';
import { AEON_GEO } from '../../../../../shared/types/aeon-world';

// ── 内存版 AxpService:真实 earn/upsertBalance 代码跑在内存账本上 ──────────

type AnyRow = Record<string, any>;

interface InMemoryAxp {
  axp: AxpService;
  /** 当前可用余额(钱包净额)。 */
  balanceOf: (userId: string) => number;
  /** 该用户产生的账本行数(发放次数)。 */
  ledgerCountFor: (userId: string) => number;
}

function makeInMemoryAxp(): InMemoryAxp {
  const ledger: AnyRow[] = [];
  const balances = new Map<string, AnyRow>();
  let seq = 0;

  // EntityManager 假实现:精确支持 earn()/upsertBalance() 用到的方法。
  // 通过 __entity 标记区分 ledger / balance 两类实体。
  const manager = {
    create: (entity: any, data: AnyRow) => ({ ...data, __entity: entity }),
    save: async (row: AnyRow) => {
      if (row.__entity === UserAxpLedger) {
        if (!row.id) row.id = `ledger-${++seq}`;
        ledger.push(row);
        return row;
      }
      if (row.__entity === UserAxpBalance) {
        balances.set(row.userId, row);
        return row;
      }
      throw new Error(`unexpected entity in manager.save: ${row?.__entity?.name}`);
    },
    findOne: async (entity: any, opts: any) => {
      const where = opts?.where ?? {};
      if (entity === UserAxpBalance) return balances.get(where.userId) ?? null;
      if (entity === UserAxpLedger) {
        // Faithfully model earn()'s exactly-once dedup lookup: match on every
        // provided field of the where clause (userId / source / refId), the
        // same columns covered by the partial unique index in Postgres.
        return (
          ledger.find(
            (r) =>
              (where.userId === undefined || r.userId === where.userId) &&
              (where.source === undefined || r.source === where.source) &&
              (where.refId === undefined || r.refId === where.refId),
          ) ?? null
        );
      }
      return null;
    },
    update: async (entity: any, where: any, patch: AnyRow) => {
      if (entity === UserAxpBalance) {
        const row = balances.get(where.userId);
        if (row) Object.assign(row, patch);
        return { affected: row ? 1 : 0 };
      }
      return { affected: 0 };
    },
  };

  const dataSource: any = {
    transaction: async (cb: (m: any) => Promise<any>) => cb(manager),
  };

  // earn 仅在「有日限」的 source 上用到 ledger repo;aeon_reality_reward 无日限,
  // 故这些方法是防御性桩(理论上不会被调用)。
  const ledgerRepo: any = {
    count: async () => 0,
    find: async () => [],
    createQueryBuilder: () => {
      const qb: any = {
        where: () => qb,
        andWhere: () => qb,
        getCount: async () => 0,
      };
      return qb;
    },
  };

  const balancesRepo: any = {
    findOne: async ({ where }: any) => balances.get(where.userId) ?? null,
  };

  const axp = new AxpService(ledgerRepo, balancesRepo, dataSource);

  return {
    axp,
    balanceOf: (userId: string) => {
      const row = balances.get(userId);
      return row ? Number(row.balance) : 0;
    },
    ledgerCountFor: (userId: string) => ledger.filter((r) => r.userId === userId).length,
  };
}

function makeReality(axp: AxpService, opts: { newsThrows?: boolean } = {}) {
  const inbox: any = { push: jest.fn() };
  const news: any = {
    publish: jest.fn(() => {
      if (opts.newsThrows) throw new Error('world-news 可视化馈送故障');
    }),
  };
  const reality = new RealityLoopService(inbox, axp, news);
  return { reality, inbox, news };
}

function makePlotService(reality: RealityLoopService) {
  const checkins: AnyRow[] = [];
  let seq = 0;
  const plotRepo: any = {
    findOne: async ({ where }: any) => ({
      id: where.id,
      lat: 0,
      lng: 0,
      displayName: '测试领地',
    }),
  };
  const checkinRepo: any = {
    findOne: async ({ where }: any) =>
      checkins.find(
        (c) => c.plotId === where.plotId && c.userId === where.userId && c.day === where.day,
      ) ?? null,
    create: (data: AnyRow) => ({ ...data }),
    save: async (row: AnyRow) => {
      if (!row.id) row.id = `checkin-${++seq}`;
      checkins.push(row);
      return row;
    },
    // computeStreakDays:select distinct day → 空历史(仅今天)→ streak=1、加成=0。
    createQueryBuilder: () => {
      const qb: any = {
        select: () => qb,
        where: () => qb,
        orderBy: () => qb,
        limit: () => qb,
        getRawMany: async () => [],
      };
      return qb;
    },
  };
  const plot = new PlotService(
    plotRepo,
    {} as any,
    checkinRepo,
    {} as any,
    reality,
    {} as any,
  );
  return { plot, checkins };
}

describe('AXP 幂等 — Correctness Property 8 (R4.4 first_task / R5.3 settle_aeon)', () => {
  // ── first_task(R4.4):rewardFromReality 固定 idempotencyKey 重复触发不重复发放 ──
  describe('first_task:固定 idempotencyKey 重复触发 rewardFromReality (R4.4)', () => {
    it('同一 idempotencyKey 触发 N 次,钱包净额只应记入一次', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 6 }), // 重复触发次数
          fc.integer({ min: 1, max: 50 }), // 一次性奖励金额
          async (repeats, amount) => {
            const { axp, balanceOf } = makeInMemoryAxp();
            const { reality } = makeReality(axp);
            const userId = 'user-first-task';
            const idemKey = `soul-birth-first-task-${userId}`;

            for (let i = 0; i < repeats; i++) {
              await reality.rewardFromReality(userId, amount, 'first_task_done', idemKey);
            }

            // 固定幂等键 → 无论触发多少次,净额都应恰好等于单次奖励金额。
            expect(balanceOf(userId)).toBe(amount);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── settle_aeon(R5.3):同 (plot,user,day) 重复签到只发放一次 ──
  describe('settle_aeon:同地块同日重复签到只发放一次 15 AXP (R5.3)', () => {
    it('重复 checkIn N 次,仅首次发放 15 AXP,其余视为今天已签到', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (repeats) => {
          const { axp, balanceOf } = makeInMemoryAxp();
          const { reality } = makeReality(axp);
          const { plot } = makePlotService(reality);
          const userId = 'user-settle';
          const plotId = '00000000-0000-0000-0000-000000000abc';

          const results: any[] = [];
          for (let i = 0; i < repeats; i++) {
            results.push(await plot.checkIn(userId, plotId, 0, 0));
          }

          // 首次签到:发放 CHECKIN_REWARD_AXP(15),非「今天已签到」。
          expect(results[0].alreadyCheckedInToday).toBe(false);
          expect(results[0].rewardAxp).toBe(AEON_GEO.CHECKIN_REWARD_AXP);
          // 其余:命中 (plot,user,day) 唯一去重 → 发放 0、标记今天已签到。
          for (let i = 1; i < repeats; i++) {
            expect(results[i].alreadyCheckedInToday).toBe(true);
            expect(results[i].rewardAxp).toBe(0);
          }
          // 钱包净额恰好等于一次签到奖励。
          expect(balanceOf(userId)).toBe(AEON_GEO.CHECKIN_REWARD_AXP);
        }),
        { numRuns: 20 },
      );
    });

    it('仅圈地未签到不发放;签到后再调一次也不叠加(单测样例)', async () => {
      const { axp, balanceOf } = makeInMemoryAxp();
      const { reality } = makeReality(axp);
      const { plot } = makePlotService(reality);
      const userId = 'user-settle-once';
      const plotId = '00000000-0000-0000-0000-000000000fed';

      // 未签到 → 余额为 0(R5.3b:仅圈地不触发奖励)。
      expect(balanceOf(userId)).toBe(0);

      const first = await plot.checkIn(userId, plotId, 0, 0);
      const second = await plot.checkIn(userId, plotId, 0, 0);

      expect(first.rewardAxp).toBe(AEON_GEO.CHECKIN_REWARD_AXP);
      expect(second.rewardAxp).toBe(0);
      expect(second.alreadyCheckedInToday).toBe(true);
      expect(balanceOf(userId)).toBe(AEON_GEO.CHECKIN_REWARD_AXP);
    });
  });

  // ── 可视化失败不回滚已发放金额(R5.3a / Property 8 后半句)──
  describe('可视化失败不回滚已发放金额 (R5.3a)', () => {
    it('first_task:钱包跳动广播(axp:earned)监听器抛错时已发放金额仍提交', async () => {
      const { axp, balanceOf } = makeInMemoryAxp();
      const { reality } = makeReality(axp);
      const userId = 'user-viz-reward';

      // 模拟「钱包跳动可视化」失败:axp:earned 广播监听器抛错。
      const throwingListener = (env: any) => {
        if (env?.event === 'axp:earned') throw new Error('钱包跳动动画崩溃');
      };
      desktopSyncEventBus.on(DESKTOP_SYNC_EVENT, throwingListener);
      try {
        await reality.rewardFromReality(
          userId,
          12,
          'first_task_done',
          `soul-birth-first-task-${userId}`,
        );
      } finally {
        desktopSyncEventBus.off(DESKTOP_SYNC_EVENT, throwingListener);
      }

      // 可视化失败被吞掉,已发放金额不回滚。
      expect(balanceOf(userId)).toBe(12);
    });

    it('first_task:下游世界新闻(可视化馈送)抛错时金额已提交、不回滚', async () => {
      const { axp, balanceOf } = makeInMemoryAxp();
      const { reality } = makeReality(axp, { newsThrows: true });
      const userId = 'user-viz-news';

      // rewardFromReality 在 creditWallet(已提交余额)之后才发世界新闻;
      // 新闻发布抛错会使本次调用抛出,但余额已提交、不回滚。
      await expect(
        reality.rewardFromReality(
          userId,
          12,
          'first_task_done',
          `soul-birth-first-task-${userId}`,
        ),
      ).rejects.toThrow();
      expect(balanceOf(userId)).toBe(12);
    });

    it('settle_aeon:钱包跳动广播抛错不影响签到成功与发放金额', async () => {
      const { axp, balanceOf } = makeInMemoryAxp();
      const { reality } = makeReality(axp);
      const { plot, checkins } = makePlotService(reality);
      const userId = 'user-viz-checkin';
      const plotId = '00000000-0000-0000-0000-000000000def';

      const throwingListener = (env: any) => {
        if (env?.event === 'axp:earned') throw new Error('钱包跳动动画崩溃');
      };
      desktopSyncEventBus.on(DESKTOP_SYNC_EVENT, throwingListener);
      let res: any;
      try {
        res = await plot.checkIn(userId, plotId, 0, 0);
      } finally {
        desktopSyncEventBus.off(DESKTOP_SYNC_EVENT, throwingListener);
      }

      // 可视化失败,但签到仍成功、AXP 仍发放、签到落库。
      expect(res.ok).toBe(true);
      expect(res.rewardAxp).toBe(AEON_GEO.CHECKIN_REWARD_AXP);
      expect(balanceOf(userId)).toBe(AEON_GEO.CHECKIN_REWARD_AXP);
      expect(checkins).toHaveLength(1);
    });
  });
});
