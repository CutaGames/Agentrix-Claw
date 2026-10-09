/**
 * The phone's payment approval card says the same words as the web card (frontend/components/spend-approval/
 * SpendApprovalCard.tsx and frontend/lib/spend-approval/card-model.ts, integration 53d34210).
 */
import * as fs from 'fs';
import * as path from 'path';
import { SPEND_APPROVAL_COPY, SPEND_APPROVAL_STATUS_TITLE, spendApprovalProblemCopy } from '../spendApprovalCopy';
import { spendPathLabel } from '../spendApproval';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** `key: { zh: '…', en: '…' }` entries of one object literal in a source file. */
function entries(source: string, start: string): Array<[string, { zh: string; en: string }]> {
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`not found: ${start}`);
  const block = source.slice(from, source.indexOf('\n}', from));
  return [...block.matchAll(/^\s*([a-z][A-Za-z0-9_]*): \{ zh: '([^']*)', en: '([^']*)' \},?$/gm)].map((m) => [m[1], { zh: m[2], en: m[3] }]);
}

describe('payment approval card copy = web card', () => {
  const card = read('frontend/components/spend-approval/SpendApprovalCard.tsx');
  const model = read('frontend/lib/spend-approval/card-model.ts');

  it('status titles, word for word', () => {
    const web = entries(card, 'const STATUS_TITLE');
    expect(web).toHaveLength(6);
    expect(Object.fromEntries(web)).toEqual(SPEND_APPROVAL_STATUS_TITLE);
  });

  it('labels and messages, word for word', () => {
    const web = entries(card, 'const COPY = {');
    expect(web.length).toBeGreaterThanOrEqual(18);
    expect(Object.fromEntries(web)).toEqual(SPEND_APPROVAL_COPY);
  });

  it('payment kinds, word for word, with the same fallback', () => {
    const web = entries(model, 'const PATH_COPY');
    expect(web).toHaveLength(10);
    for (const [kind, copy] of web) expect(spendPathLabel(kind)).toEqual(copy);
    expect(model).toContain("return PATH_COPY[path] ?? { zh: '付款', en: 'Payment' };");
    expect(spendPathLabel('not_a_kind')).toEqual({ zh: '付款', en: 'Payment' });
  });

  it('the USD amount reads the same as the web card', () => {
    expect(model).toContain("return language === 'zh' ? `${value} 美元` : `$${value}`;");
  });

  it('every problem has words; the ones the web card has use its words', () => {
    expect(spendApprovalProblemCopy('args_changed')).toBe(SPEND_APPROVAL_COPY.argsChanged);
    expect(spendApprovalProblemCopy('budget_exceeded')).toBe(SPEND_APPROVAL_COPY.budgetExceeded);
    expect(spendApprovalProblemCopy('sign_in_required')).toBe(SPEND_APPROVAL_COPY.signIn);
    expect(spendApprovalProblemCopy('step_up_again')).toBe(SPEND_APPROVAL_COPY.stepUpStill);
    expect(spendApprovalProblemCopy('not_found')).toBe(SPEND_APPROVAL_COPY.notFound);
    expect(spendApprovalProblemCopy('unreadable')).toBe(SPEND_APPROVAL_COPY.unreadable);
    expect(spendApprovalProblemCopy('expired')).toBe(SPEND_APPROVAL_STATUS_TITLE.expired);
    for (const p of ['unavailable', 'rate_limited', 'step_up_required'] as const) expect(spendApprovalProblemCopy(p)).toBe(SPEND_APPROVAL_COPY.generic);
    expect(spendApprovalProblemCopy('step_up_cancelled').zh).toMatch(/还在等你/);
  });
});
