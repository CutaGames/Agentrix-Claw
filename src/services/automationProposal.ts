/**
 * E1 / E2 slice 4 on the phone: the Agent's automation proposal becomes a card under the assistant bubble
 * (contract `shared/types/agent-automation.ts` v0; the web card is `frontend/components/agents/AutomationProposalCard.tsx`).
 * Same switch as the automations list (`EXPO_PUBLIC_AGENT_AUTOMATIONS=1`, agentAutomations.ts); the routes answer 404
 * while the server flag `AGENT_AUTOMATION_V0_ENABLED` is off.
 *
 * - Each `automation_proposal` stream event goes through `decodeAutomationProposalEventV0`; one card per proposalRef.
 * - Confirm / decline: `POST /automations/proposals/:ref/confirm|decline` with the user's own token; a malformed ref
 *   sends nothing. A recent-sign-in request opens StepUpSheet and retries once; asked again → stop.
 * - The card shows only what the server answered (created with its next run, or declined), never what was sent.
 * - Title, instruction and trigger summary come from the Agent: plain text (plainDisplayText.ts).
 * - Words are the web card's, compared word for word in the test.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  AUTOMATION_ERROR_CODES_V0,
  AUTOMATION_LIMITS_V0,
  AUTOMATION_PROPOSAL_REF_PATTERN_V0,
  decodeAutomationProposalEventV0,
  decodeAutomationViewV0,
  describeAutomationScheduleV0,
  type AutomationProposalV0,
} from '../../shared/types/agent-automation';
import { AGENT_AUTOMATIONS_ENABLED, AUTOMATION_CHANNEL_COPY } from './agentAutomations';
import { plainDisplayLine, plainDisplayText } from './plainDisplayText';
import { needsStepUp } from './stepUp';

type Copy = { zh: string; en: string };
type Lang = 'zh' | 'en';

/** The proposals one chat turn carries after this event; null when the event adds nothing (off, broken, seen). */
export function collectAutomationProposal(
  list: readonly AutomationProposalV0[],
  event: unknown,
  enabled: boolean = AGENT_AUTOMATIONS_ENABLED,
): AutomationProposalV0[] | null {
  if (!enabled) return null;
  const decoded = decodeAutomationProposalEventV0(event);
  if (!decoded || list.some((item) => item.proposalRef === decoded.proposal.proposalRef)) return null;
  return [...list, decoded.proposal];
}

// ── Client ─────────────────────────────────────────────────────────────────────────────

export type AutomationProposalActionV0 = 'confirm' | 'decline';

export type AutomationProposalFailureV0 =
  | 'step_up_required'
  | 'step_up_cancelled'
  | 'step_up_again'
  | 'sign_in_required'
  | 'not_found'
  | 'expired'
  | 'trigger_not_open'
  | 'limit'
  | 'binding'
  | 'no_session'
  | 'unreadable'
  | 'unavailable';

export type AutomationProposalOutcomeV0 =
  | { kind: 'confirmed'; nextRunAt: string | null }
  | { kind: 'declined' }
  | { kind: 'failed'; failure: AutomationProposalFailureV0 };

export interface MobileAutomationProposalClientV0 {
  answer(proposalRef: string, action: AutomationProposalActionV0): Promise<AutomationProposalOutcomeV0>;
}

function failureOf(response: HttpResponseV1): AutomationProposalFailureV0 {
  if (needsStepUp(response.status, response.body)) return 'step_up_required';
  const { code } = parseApiErrorBodyV1(response.body);
  if (response.status === 403) return 'sign_in_required';
  if (response.status === 404) return 'not_found';
  if (code === AUTOMATION_ERROR_CODES_V0.proposalExpired) return 'expired';
  if (code === AUTOMATION_ERROR_CODES_V0.triggerNotConfigured) return 'trigger_not_open';
  if (code === AUTOMATION_ERROR_CODES_V0.limitReached) return 'limit';
  if (code === AUTOMATION_ERROR_CODES_V0.bindingInvalid) return 'binding';
  return 'unavailable';
}

export function createMobileAutomationProposalClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileAutomationProposalClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  return {
    async answer(proposalRef, action) {
      // Checked before sending: the ref goes into the path.
      if (!AUTOMATION_PROPOSAL_REF_PATTERN_V0.test(proposalRef)) return { kind: 'failed', failure: 'not_found' };
      const token = deps.token();
      if (!token) return { kind: 'failed', failure: 'no_session' };
      let response: HttpResponseV1;
      try {
        response = await deps.transport.request({
          method: 'POST',
          path: `${base}/automations/proposals/${proposalRef}/${action}`,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          body: {},
        });
      } catch {
        return { kind: 'failed', failure: 'unavailable' };
      }
      if (response.status !== 200) return { kind: 'failed', failure: failureOf(response) };
      if (action === 'decline') {
        const body = response.body as { proposalRef?: unknown; status?: unknown } | null;
        return body && body.proposalRef === proposalRef && body.status === 'declined'
          ? { kind: 'declined' }
          : { kind: 'failed', failure: 'unreadable' };
      }
      const view = decodeAutomationViewV0(response.body);
      return view ? { kind: 'confirmed', nextRunAt: view.nextRunAt } : { kind: 'failed', failure: 'unreadable' };
    },
  };
}

/** One answer; a recent-sign-in request asks the owner (StepUpSheet) and retries once, never twice. */
export async function runAutomationProposalAnswer(input: {
  client: MobileAutomationProposalClientV0;
  proposalRef: string;
  action: AutomationProposalActionV0;
  confirmStepUp: () => Promise<boolean>;
}): Promise<AutomationProposalOutcomeV0> {
  const first = await input.client.answer(input.proposalRef, input.action);
  if (first.kind !== 'failed' || first.failure !== 'step_up_required') return first;
  let confirmed = false;
  try {
    confirmed = await input.confirmStepUp();
  } catch {
    confirmed = false;
  }
  if (!confirmed) return { kind: 'failed', failure: 'step_up_cancelled' };
  const second = await input.client.answer(input.proposalRef, input.action);
  return second.kind === 'failed' && second.failure === 'step_up_required' ? { kind: 'failed', failure: 'step_up_again' } : second;
}

// ── Words (the web card's) ─────────────────────────────────────────────────────────────

export const AUTOMATION_PROPOSAL_COPY = {
  heading: { zh: 'Agent 提议一个自动化，你确认了才会建', en: 'The Agent proposes an automation; nothing is created until you confirm' },
  when: { zh: '什么时候跑', en: 'When' },
  what: { zh: '每次做什么', en: 'What it does' },
  where: { zh: '结果送到', en: 'Results go to' },
  spend: { zh: '每次最多花', en: 'Most per run' },
  noSpend: { zh: '不能花钱', en: 'Cannot spend' },
  tools: { zh: '能用的工具', en: 'Tools it may use' },
  noTools: { zh: '只回答，不调工具', en: 'Answers only, no tools' },
  expires: { zh: '没处理的话，这个提议在这之后作废：', en: 'Unanswered, this proposal expires at ' },
  stepUp: { zh: '这个自动化能花钱，确认时要最近登录过。', en: 'This automation can spend, so confirming needs a recent sign-in.' },
  confirm: { zh: '确认建立', en: 'Confirm' },
  decline: { zh: '不要', en: 'Decline' },
  busy: { zh: '处理中…', en: 'Working…' },
  confirmed: { zh: '已建立。', en: 'Created.' },
  nextRun: { zh: '下次运行：', en: 'Next run: ' },
  declined: { zh: '已拒绝，不会建立。', en: 'Declined; nothing was created.' },
  errStepUp: { zh: '要先重新登录，再回来确认。', en: 'Sign in again, then come back to confirm.' },
  errExpired: { zh: '这个提议已经过期，或者已经处理过。', en: 'This proposal has expired or was already answered.' },
  errTrigger: { zh: '这种触发方式还没开放。', en: 'This kind of trigger is not open yet.' },
  errLimit: { zh: '这个 Agent 生效的自动化已经到上限。', en: 'This Agent already has the most live automations allowed.' },
  errBinding: { zh: '送达用的渠道绑定不是你的，或者已经解除。', en: 'The channel binding for delivery is not yours or was removed.' },
  errNotFound: { zh: '找不到这个提议。', en: 'This proposal cannot be found.' },
  errOther: { zh: '没办成，稍后再试。', en: 'That did not work; try again later.' },
} satisfies Record<string, Copy>;

export function automationProposalFailureCopy(failure: AutomationProposalFailureV0): Copy {
  switch (failure) {
    case 'step_up_required':
    case 'step_up_cancelled':
    case 'step_up_again':
    case 'sign_in_required':
    case 'no_session':
      return AUTOMATION_PROPOSAL_COPY.errStepUp;
    case 'not_found':
      return AUTOMATION_PROPOSAL_COPY.errNotFound;
    case 'expired':
      return AUTOMATION_PROPOSAL_COPY.errExpired;
    case 'trigger_not_open':
      return AUTOMATION_PROPOSAL_COPY.errTrigger;
    case 'limit':
      return AUTOMATION_PROPOSAL_COPY.errLimit;
    case 'binding':
      return AUTOMATION_PROPOSAL_COPY.errBinding;
    default:
      return AUTOMATION_PROPOSAL_COPY.errOther;
  }
}

export function automationProposalTitle(proposal: AutomationProposalV0, lang: Lang): string {
  return plainDisplayLine(proposal.title, AUTOMATION_LIMITS_V0.titleMaxChars, lang === 'zh' ? '自动化' : 'Automation');
}

export function automationProposalInstruction(proposal: AutomationProposalV0): string {
  return plainDisplayText(proposal.instruction, AUTOMATION_LIMITS_V0.instructionMaxChars);
}

export function automationProposalWhen(proposal: AutomationProposalV0, lang: Lang): string {
  return proposal.trigger.kind === 'schedule' ? describeAutomationScheduleV0(proposal.trigger, lang) : plainDisplayLine(proposal.trigger.summary, 120, '');
}

/** The spend cap in USD as the server sent it (`spendCapCentsPerRun`); null when the automation cannot spend. */
export function automationProposalSpend(proposal: AutomationProposalV0): string | null {
  return proposal.spendCapCentsPerRun > 0 ? `$${(proposal.spendCapCentsPerRun / 100).toFixed(2)}` : null;
}

export function automationProposalDelivery(proposal: AutomationProposalV0, lang: Lang): string {
  return proposal.delivery.map((d) => AUTOMATION_CHANNEL_COPY[d.channel][lang]).join(lang === 'zh' ? '、' : ', ');
}
