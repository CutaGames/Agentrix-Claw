import * as fc from 'fast-check';
import {
  type LedgerEntry,
  balanceOf,
  isConserved,
  applyTransfer,
} from '../economy/ledger-model';

/**
 * P.1 — 账本守恒 + 非负余额(Property 1, 2;R11.2/R11.5/R6.6/R19.4)。
 *
 * 随机化转账/发薪/结算序列后:
 *   - org 账户余额恒等于其分录代数和(口径自洽);
 *   - 经 applyTransfer 的 debit 约束,出账方余额永不为负。
 */
describe('Aeon Property 1+2: ledger conservation + non-negative (P.1)', () => {
  const accountArb = fc.constantFrom('org', 'alice', 'bob', 'carol', '__escrow__');

  const entryArb: fc.Arbitrary<LedgerEntry> = fc
    .record({
      payerUserId: accountArb,
      payeeUserId: accountArb,
      amount: fc.integer({ min: 1, max: 10000 }),
      currency: fc.constant('AXP'),
    })
    .filter((e) => e.payerUserId !== e.payeeUserId);

  it('balanceOf equals algebraic sum of entries (口径自洽)', () => {
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 200 }), (entries) => {
        // 全体主体余额之和必须为 0(双记守恒)
        const accounts = new Set<string>();
        entries.forEach((e) => {
          accounts.add(e.payerUserId);
          accounts.add(e.payeeUserId);
        });
        let total = 0;
        for (const a of accounts) total += balanceOf(entries, a, 'AXP');
        expect(total).toBe(0);
        expect(isConserved(entries, 'AXP')).toBe(true);
      }),
    );
  });

  it('applyTransfer never lets the debit account go negative (禁负余额)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }), // 初始注资
        fc.array(fc.integer({ min: 1, max: 5000 }), { maxLength: 50 }), // 一串出账
        (funding, debits) => {
          // org 先被注资(外部 payer → org)
          let ledger: LedgerEntry[] = funding > 0
            ? [{ payerUserId: 'world', payeeUserId: 'org', amount: funding, currency: 'AXP' }]
            : [];
          for (const amt of debits) {
            try {
              ledger = applyTransfer(
                ledger,
                { payerUserId: 'org', payeeUserId: 'alice', amount: amt, currency: 'AXP' },
                { debitAccount: 'org' },
              );
            } catch {
              // 余额不足被拒绝 —— 合法行为,跳过
            }
            // 不变式:每次操作后 org 余额 ≥ 0
            expect(balanceOf(ledger, 'org', 'AXP')).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });
});
