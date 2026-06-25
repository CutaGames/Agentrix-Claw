/**
 * Aeon 账本守恒纯模型(Property 1 / 2,R11.2/R11.5 可测)。
 *
 * AeonEconomyService 的余额口径(org 权威余额 = 分录代数和:作为 payee 加、作为 payer 减)
 * 与"出账不得使余额为负"约束,抽成纯函数便于属性测试,无需 DB。service 的 SQL 聚合
 * 与本模型同口径。
 */
export interface LedgerEntry {
  payerUserId: string;
  payeeUserId: string;
  amount: number; // 恒正
  currency: string;
}

/** 某主体(account)在某币种下的余额 = Σ(作为 payee) − Σ(作为 payer)。 */
export function balanceOf(entries: LedgerEntry[], account: string, currency = 'AXP'): number {
  let bal = 0;
  for (const e of entries) {
    if (e.currency !== currency) continue;
    if (e.payeeUserId === account) bal += e.amount;
    if (e.payerUserId === account) bal -= e.amount;
  }
  return bal;
}

/** 全账本对某币种是否守恒:所有主体余额之和恒为 0(每笔双记)。 */
export function isConserved(entries: LedgerEntry[], currency = 'AXP'): boolean {
  let sum = 0;
  for (const e of entries) {
    if (e.currency !== currency) continue;
    // payee +amount, payer -amount → 净 0
    sum += e.amount - e.amount;
  }
  return sum === 0;
}

/**
 * 应用一笔转账到账本,强制"出账方(debit account)余额非负"。
 * 返回新账本;若会导致 debit 账户为负则抛错(模拟 service 的禁负余额约束)。
 */
export function applyTransfer(
  entries: LedgerEntry[],
  t: LedgerEntry,
  opts: { debitAccount?: string } = {},
): LedgerEntry[] {
  if (!(t.amount > 0)) throw new Error('amount 必须为正');
  if (opts.debitAccount) {
    const before = balanceOf(entries, opts.debitAccount, t.currency);
    if (before < t.amount) throw new Error('余额不足(禁负余额)');
  }
  return [...entries, t];
}
