import { AxpService } from './axp.service';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { UserAxpBalance } from '../../entities/user-axp-balance.entity';

/**
 * Pet Earning Flywheel · 任务 1.1 / 1.2 幂等单测。
 * 用内存 fake manager 模拟事务，验证：
 *  - spend 兑付类 source 同 refId 不双扣（Property 2）
 *  - spend 非幂等 source 仍按调用次数记账
 *  - earn referral_signup 同 refId 不双发（Property 3）
 */
function makeFakeDb() {
  const ledgerRows: any[] = [];
  const balanceByUser: Record<string, any> = {};
  let idc = 0;

  const matchLedger = (r: any, w: any) =>
    r.userId === w.userId &&
    (w.direction === undefined || r.direction === w.direction) &&
    (w.source === undefined || r.source === w.source) &&
    (w.refId === undefined || r.refId === w.refId);

  const manager = {
    findOne: async (Entity: any, opts: any) => {
      const w = opts.where;
      if (Entity === UserAxpLedger) {
        return ledgerRows.find((r) => matchLedger(r, w)) || null;
      }
      if (Entity === UserAxpBalance) {
        return balanceByUser[w.userId] || null;
      }
      return null;
    },
    create: (_Entity: any, obj: any) => ({ ...obj }),
    save: async (row: any) => {
      if (row.direction) {
        if (!row.id) row.id = `L${++idc}`;
        ledgerRows.push(row);
        return row;
      }
      balanceByUser[row.userId] = row;
      return row;
    },
    update: async (_Entity: any, where: any, patch: any) => {
      const b = balanceByUser[where.userId];
      if (b) Object.assign(b, patch);
    },
  };

  const dataSource = { transaction: (cb: any) => cb(manager) } as any;
  const repoStub = { findOne: async () => null, count: async () => 0 } as any;
  return { ledgerRows, balanceByUser, dataSource, repoStub };
}

function seedBalance(balanceByUser: Record<string, any>, userId: string, balance: number) {
  balanceByUser[userId] = {
    userId,
    balance: String(balance),
    lifetimeEarned: String(balance),
    lifetimeSpent: '0',
    lifetimeExpired: '0',
  };
}

describe('AxpService idempotency', () => {
  it('spend 兑付类 source 同 refId 不双扣', async () => {
    const { ledgerRows, balanceByUser, dataSource, repoStub } = makeFakeDb();
    seedBalance(balanceByUser, 'u1', 1000);
    const svc = new AxpService(repoStub, repoStub, dataSource);

    const r1 = await svc.spend({ userId: 'u1', source: 'sub_discount', amount: 100, refId: 'order-1' });
    expect(r1.balance).toBe(900);

    const r2 = await svc.spend({ userId: 'u1', source: 'sub_discount', amount: 100, refId: 'order-1' });
    expect(r2.balance).toBe(900); // no-op
    expect(r2.ledger_id).toBe(r1.ledger_id);

    const spendRows = ledgerRows.filter((r) => r.direction === 'spend');
    expect(spendRows).toHaveLength(1);
    expect(balanceByUser['u1'].balance).toBe('900');
  });

  it('spend 非幂等 source 按调用次数记账', async () => {
    const { ledgerRows, balanceByUser, dataSource, repoStub } = makeFakeDb();
    seedBalance(balanceByUser, 'u1', 1000);
    const svc = new AxpService(repoStub, repoStub, dataSource);

    await svc.spend({ userId: 'u1', source: 'lottery_pull', amount: 100, refId: 'same' });
    await svc.spend({ userId: 'u1', source: 'lottery_pull', amount: 100, refId: 'same' });

    const spendRows = ledgerRows.filter((r) => r.direction === 'spend');
    expect(spendRows).toHaveLength(2);
    expect(balanceByUser['u1'].balance).toBe('800');
  });

  it('earn referral_signup 同 refId 不双发', async () => {
    const { ledgerRows, balanceByUser, dataSource, repoStub } = makeFakeDb();
    const svc = new AxpService(repoStub, repoStub, dataSource);

    const r1 = await svc.earn({ userId: 'u1', source: 'referral_signup', amount: 200, refId: 'rel-1' });
    expect(r1.balance).toBe(200);
    const r2 = await svc.earn({ userId: 'u1', source: 'referral_signup', amount: 200, refId: 'rel-1' });
    expect(r2.balance).toBe(200); // no-op

    const earnRows = ledgerRows.filter((r) => r.direction === 'earn' && r.source === 'referral_signup');
    expect(earnRows).toHaveLength(1);
    expect(balanceByUser['u1'].balance).toBe('200');
  });

  it('insufficient balance 抛错', async () => {
    const { balanceByUser, dataSource, repoStub } = makeFakeDb();
    seedBalance(balanceByUser, 'u1', 50);
    const svc = new AxpService(repoStub, repoStub, dataSource);
    await expect(
      svc.spend({ userId: 'u1', source: 'sub_discount', amount: 100, refId: 'order-x' }),
    ).rejects.toThrow();
  });
});
