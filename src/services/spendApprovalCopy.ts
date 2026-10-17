/**
 * The payment approval card's words, the same as the web card (`frontend/components/spend-approval/SpendApprovalCard.tsx`,
 * `STATUS_TITLE` and `COPY`), so the three surfaces say the same thing about the same payment.
 * `spendApprovalCopy.test.ts` compares them word for word; when the web card changes, this file follows.
 * Phone-only lines (minutes left, step-up cancelled, original currency) live in `SPEND_APPROVAL_PHONE_COPY`.
 */
import type { SpendApprovalStatusV0 } from '../../shared/types/spend-budget';
import type { SpendApprovalFailureV0 } from './spendApproval';

export type Copy = { zh: string; en: string };

export const SPEND_APPROVAL_STATUS_TITLE: Readonly<Record<SpendApprovalStatusV0, Copy>> = {
  pending: { zh: '这笔付款需要你批准', en: 'This payment needs your approval' },
  approved: { zh: '已批准，正在付款', en: 'Approved, paying now' },
  executed: { zh: '已付款', en: 'Paid' },
  failed: { zh: '批准了，但付款没有成功', en: 'Approved, but the payment did not go through' },
  rejected: { zh: '已拒绝，没有付款', en: 'Rejected; nothing was paid' },
  expired: { zh: '已过期，没有付款', en: 'Expired; nothing was paid' },
};

export const SPEND_APPROVAL_COPY = {
  payee: { zh: '收款方', en: 'Paid to' },
  amount: { zh: '金额', en: 'Amount' },
  kind: { zh: '用途', en: 'For' },
  approve: { zh: '批准付款', en: 'Approve payment' },
  reject: { zh: '拒绝', en: 'Reject' },
  approving: { zh: '正在批准…', en: 'Approving…' },
  rejecting: { zh: '正在拒绝…', en: 'Rejecting…' },
  loading: { zh: '正在读取这笔付款…', en: 'Reading this payment…' },
  unreadable: { zh: '暂时读不到这笔付款的详情，这里不能批准。没有批准就不会付款。', en: 'The details of this payment cannot be read right now, so it cannot be approved here. Nothing is paid without approval.' },
  notFound: { zh: '找不到这笔付款，或者它不是你的 Agent 发起的。没有付款。', en: 'This payment cannot be found, or it was not started by your Agent. Nothing was paid.' },
  retry: { zh: '再读一次', en: 'Read again' },
  stepUpNote: { zh: '金额较大，批准时要再确认一次是你本人。', en: 'This is a larger amount, so you will confirm it is you when approving.' },
  stepUpAction: { zh: '批准这笔付款', en: 'Approve this payment' },
  stepUpStill: { zh: '还是需要确认是你本人。请重新登录后再批准。', en: 'Your identity still needs confirming. Sign in again, then approve.' },
  signIn: { zh: '只能用你自己的账号批准。请重新登录后再试。', en: 'Only your own account can approve this. Sign in again and retry.' },
  argsChanged: { zh: '付款内容和批准时不一样了，这次批准没有执行。请让 Agent 重新发起。', en: 'The payment changed since it was approved, so the approval was not used. Ask the Agent to start it again.' },
  budgetExceeded: { zh: '预算不够了，这笔没有付。可以在预算设置里调整后，让 Agent 重新发起。', en: 'The budget is used up, so this was not paid. Adjust the budget, then ask the Agent to start it again.' },
  generic: { zh: '这一步没有成功，没有付款。请稍后再试。', en: 'That did not go through and nothing was paid. Try again later.' },
} satisfies Record<string, Copy>;

/** Lines only the phone card has. */
export const SPEND_APPROVAL_PHONE_COPY = {
  minutesLeft: (minutes: number): Copy => ({ zh: `还剩 ${minutes} 分钟`, en: `${minutes} min left` }),
  original: (amount: string): Copy => ({ zh: `原币 ${amount}`, en: `Original amount ${amount}` }),
  stepUpCancelled: { zh: '没有确认，这笔付款还在等你。', en: 'Not confirmed. This payment is still waiting for you.' },
  confirmApprove: { zh: '批准这笔付款？', en: 'Approve this payment?' },
  confirmReject: { zh: '拒绝这笔付款？', en: 'Reject this payment?' },
  cancel: { zh: '取消', en: 'Cancel' },
};

export type SpendApprovalProblemV0 = SpendApprovalFailureV0 | 'step_up_cancelled' | 'step_up_again';

/** What the card says after a decision or a read did not go through, in the web card's words where it has them. */
export function spendApprovalProblemCopy(problem: SpendApprovalProblemV0): Copy {
  switch (problem) {
    case 'step_up_again':
      return SPEND_APPROVAL_COPY.stepUpStill;
    case 'sign_in_required':
    case 'no_session':
      return SPEND_APPROVAL_COPY.signIn;
    case 'args_changed':
      return SPEND_APPROVAL_COPY.argsChanged;
    case 'budget_exceeded':
      return SPEND_APPROVAL_COPY.budgetExceeded;
    case 'not_found':
      return SPEND_APPROVAL_COPY.notFound;
    case 'unreadable':
      return SPEND_APPROVAL_COPY.unreadable;
    case 'expired':
      return SPEND_APPROVAL_STATUS_TITLE.expired;
    case 'step_up_cancelled':
      return SPEND_APPROVAL_PHONE_COPY.stepUpCancelled;
    default:
      return SPEND_APPROVAL_COPY.generic;
  }
}
