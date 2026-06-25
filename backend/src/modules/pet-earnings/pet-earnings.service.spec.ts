import { PetEarningsService } from './pet-earnings.service';
import { EARNING_CATEGORIES } from './earning-source-map';

/** 链式 QueryBuilder fake：所有链式方法返回自身，终端方法返回 canned。 */
function fakeQB(raw: any[]) {
  const qb: any = {};
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'orderBy']) {
    qb[m] = () => qb;
  }
  qb.getRawMany = async () => raw;
  qb.getRawOne = async () => raw[0] ?? null;
  return qb;
}

describe('PetEarningsService (需求 1 聚合)', () => {
  const axp = {
    getBalance: jest.fn(),
  } as any;
  const ledger = { createQueryBuilder: jest.fn() } as any;
  const payments = { createQueryBuilder: jest.fn() } as any;
  const agentAccounts = { find: jest.fn() } as any;

  let svc: PetEarningsService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new PetEarningsService(axp, ledger, payments, agentAccounts);
  });

  it('getSummary 满足聚合守恒（Property 1）', async () => {
    axp.getBalance.mockResolvedValue({
      balance: 700,
      lifetime_earned: 1000,
      lifetime_spent: 200,
      lifetime_expired: 100,
      usd_value_cents: 70,
      updated_at: 123,
    });
    agentAccounts.find.mockResolvedValue([]); // 无 agent → USDT 0

    const s = await svc.getSummary('u1');
    expect(s.axp.balance).toBe(700);
    expect(s.axp.lifetimeEarned - s.axp.lifetimeSpent - s.axp.lifetimeExpired).toBe(s.axp.balance);
    expect(s.usdt.lifetimeEarned).toBe(0);
    expect(s.usdt.chain).toBe('bnb-testnet');
  });

  it('getBreakdown 按 source 归并到分类，AXP 占比合计 100（Property 1）', async () => {
    agentAccounts.find.mockResolvedValue([]); // USDT 0，确保只有 AXP 分组
    ledger.createQueryBuilder.mockReturnValue(
      fakeQB([
        { source: 'task_complete', total: '100', cnt: '2' },
        { source: 'skin_sold', total: '50', cnt: '1' },
        { source: 'lsm_payout', total: '50', cnt: '1' },
      ]),
    );

    const items = await svc.getBreakdown('u1', 'all');
    const byCat = Object.fromEntries(items.map((i) => [i.category, i]));
    expect(byCat[EARNING_CATEGORIES.TASK].amount).toBe(100);
    expect(byCat[EARNING_CATEGORIES.SKIN].amount).toBe(50);
    expect(byCat[EARNING_CATEGORIES.PREDICTION].amount).toBe(50);
    const axpItems = items.filter((i) => i.unit === 'AXP');
    const pctSum = axpItems.reduce((s, i) => s + i.pctOfUnit, 0);
    expect(Math.round(pctSum)).toBe(100);
  });

  it('单位隔离：USDT 作为独立 unit，不混入 AXP（Property 4）', async () => {
    agentAccounts.find.mockResolvedValue([{ id: 'agt-1' }]);
    ledger.createQueryBuilder.mockReturnValue(
      fakeQB([{ source: 'task_complete', total: '100', cnt: '1' }]),
    );
    payments.createQueryBuilder.mockReturnValue(fakeQB([{ total: '42' }]));

    const items = await svc.getBreakdown('u1', 'all');
    const axpItems = items.filter((i) => i.unit === 'AXP');
    const usdtItems = items.filter((i) => i.unit === 'USDT');
    expect(usdtItems).toHaveLength(1);
    expect(usdtItems[0].amount).toBe(42);
    // AXP 分组金额不含 USDT
    const axpTotal = axpItems.reduce((s, i) => s + i.amount, 0);
    expect(axpTotal).toBe(100);
  });

  it('无任何收益返回空/零结构，不报错', async () => {
    axp.getBalance.mockResolvedValue({
      balance: 0, lifetime_earned: 0, lifetime_spent: 0, lifetime_expired: 0,
      usd_value_cents: 0, updated_at: 0,
    });
    agentAccounts.find.mockResolvedValue([]);
    ledger.createQueryBuilder.mockReturnValue(fakeQB([]));

    const s = await svc.getSummary('u1');
    expect(s.axp.balance).toBe(0);
    const items = await svc.getBreakdown('u1', '7d');
    expect(items).toEqual([]);
  });
});
