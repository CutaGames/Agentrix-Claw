/**
 * L8-13 item 11: the phone's "confirm it is you" sheet says which action it is for, in the same words as the web dialog
 * (approvePayment, raiseBudget), instead of one generic title for every action.
 *
 * Jest's `expect` takes one argument (no message), so a failure names the action through `it.each` or through the
 * list of offenders that must come out empty.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { STEP_UP_COPY, STEP_UP_REASONS_V0, stepUpReasonBodyV0 } from '../stepUp';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) =>
  fs
    .readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');

describe('STEP_UP_REASONS_V0', () => {
  it.each(Object.entries(STEP_UP_REASONS_V0))(
    '%s has a Chinese and an English title and sentence; Chinese has no stray English, English no Chinese',
    (_name, copy) => {
      for (const part of [copy.title, copy.why, ...(copy.then ? [copy.then] : [])]) {
        expect(part.zh.length).toBeGreaterThan(0);
        expect(part.en.length).toBeGreaterThan(0);
        expect(part.zh.replace(/Agent/g, '')).not.toMatch(/[A-Za-z]/);
        expect(part.en).not.toMatch(/[\u3400-\u9fff]/);
      }
      expect(copy.title.zh).not.toBe(STEP_UP_COPY.title.zh);
    },
  );

  it('approvePayment and raiseBudget are word for word what the web dialog says', () => {
    const web = fs.readFileSync(path.join(ROOT, 'frontend/lib/auth/step-up-reasons.ts'), 'utf8');
    const missing = (['approvePayment', 'raiseBudget'] as const).flatMap((name) => {
      const copy = STEP_UP_REASONS_V0[name];
      return [copy.title.zh, copy.title.en, copy.why.zh, copy.why.en]
        .filter((text) => !web.includes(`'${text}'`))
        .map((text) => `${name}: ${text}`);
    });
    expect(missing).toEqual([]);
  });

  it('the automation sheet says 批准 / Approve in the title and the first sentence, in the words coord set (L8-14 item 8)', () => {
    expect(STEP_UP_REASONS_V0.confirmAutomation.title).toEqual({ zh: '批准这个自动任务', en: 'Approve this automation' });
    expect(stepUpReasonBodyV0(STEP_UP_REASONS_V0.confirmAutomation)).toEqual({
      zh: '批准以后，它会照设定自己跑。先确认一下是你本人。',
      en: "Once approved, it runs on its own as set. First, let's check it's you.",
    });
  });
  it('the automation sheet no longer says 确认 / Confirm three times: not in its title or body', () => {
    const copy = STEP_UP_REASONS_V0.confirmAutomation;
    const body = stepUpReasonBodyV0(copy);
    expect(`${copy.title.zh}${body.zh}`.match(/确认/g) ?? []).toHaveLength(1);
    expect(copy.title.zh).not.toContain('确认');
    expect(copy.title.en).not.toMatch(/confirm/i);
  });
  it('payment and budget bodies are untouched: the web dialog’s two sentences, Chinese joined with no space', () => {
    expect(stepUpReasonBodyV0(STEP_UP_REASONS_V0.approvePayment)).toEqual({
      zh: '批准以后，这笔钱会付出去。要先确认一下是你本人。',
      en: 'Once approved, this money is paid out. First, please confirm it is you.',
    });
    expect(stepUpReasonBodyV0(STEP_UP_REASONS_V0.raiseBudget)).toEqual({
      zh: '提高以后，Agent 自己能花的钱会变多。要先确认一下是你本人。',
      en: 'With a higher budget your Agent can spend more on its own. First, please confirm it is you.',
    });
    expect(STEP_UP_REASONS_V0.approvePayment.then).toBeUndefined();
    expect(STEP_UP_REASONS_V0.raiseBudget.then).toBeUndefined();
  });
  it('only confirming a payment is about money going out; only the budget one is about spending more', () => {
    expect(STEP_UP_REASONS_V0.approvePayment.why.en).toContain('paid out');
    expect(STEP_UP_REASONS_V0.raiseBudget.why.en).toContain('spend more');
    expect(STEP_UP_REASONS_V0.confirmAutomation.why.en).not.toMatch(/paid|spend/);
  });
});

describe('the sheet and its four callers', () => {
  it('the sheet shows the reason title and sentence when it has one (Chinese joined with no space, as on the web), and the generic title otherwise', () => {
    const sheet = read('src/components/StepUpSheet.tsx');
    expect(sheet).toContain('t(reason ? reason.title : STEP_UP_COPY.title)');
    expect(sheet).toContain('{t(stepUpReasonBodyV0(reason))}');
    expect(sheet).toMatch(/reason\?: StepUpReasonCopyV0/);
  });

  it.each([
    ['src/components/SpendApprovalCard.tsx', 'approvePayment'],
    ['src/components/SpendBudgetCard.tsx', 'raiseBudget'],
    ['src/components/TrustLadderCard.tsx', 'raiseBudget'],
    ['src/components/AutomationProposalCard.tsx', 'confirmAutomation'],
  ])('%s passes %s', (file, action) => {
    const source = read(file);
    const sheets = source.match(/<StepUpSheet\b[\s\S]*?\/>/g) ?? [];
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toContain(`reason={STEP_UP_REASONS_V0.${action}}`);
  });

  it('no caller of the sheet is left without a reason', () => {
    const withoutReason = ['SpendApprovalCard', 'SpendBudgetCard', 'TrustLadderCard', 'AutomationProposalCard'].filter((file) =>
      (read(`src/components/${file}.tsx`).match(/<StepUpSheet\b[\s\S]*?\/>/g) ?? []).some((sheet) => !sheet.includes('reason={')),
    );
    expect(withoutReason).toEqual([]);
  });
});
