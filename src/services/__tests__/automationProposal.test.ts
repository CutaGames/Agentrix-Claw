/**
 * E1 / E2 slice 4 on the phone: the Agent's `automation_proposal` event becomes a card under the assistant bubble
 * (automationProposal.ts, contract shared/types/agent-automation.ts v0; web card frontend/components/agents/
 * AutomationProposalCard.tsx).
 * - the stream parser hands the event over; only decodable proposals, once each, and nothing while the flag is off;
 * - confirm / decline go to the contract routes with the owner's token; a malformed ref or no session sends nothing;
 * - a recent-sign-in request asks once and retries once; refusals map to the web card's words, word for word.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { AgentrixStreamParser } from '../../../shared/stream-parser';
import type { AutomationProposalV0, AutomationViewV0 } from '../../../shared/types/agent-automation';
import { AUTOMATION_CHANNEL_COPY } from '../agentAutomations';
import {
  AUTOMATION_PROPOSAL_COPY,
  automationProposalDelivery,
  automationProposalFailureCopy,
  automationProposalInstruction,
  automationProposalSpend,
  automationProposalTitle,
  automationProposalWhen,
  collectAutomationProposal,
  createMobileAutomationProposalClient,
  runAutomationProposalAnswer,
  type MobileAutomationProposalClientV0,
} from '../automationProposal';

const AGENT = '6f1c2b1e-3a4d-4c5e-8f60-718293a4b5c6';
const REF = `apr_${'c'.repeat(32)}`;
const BASE = 'https://api.example.test/api/';
const proposal: AutomationProposalV0 = {
  proposalRef: REF,
  agentAccountId: AGENT,
  title: '每日新闻摘要',
  instruction: '每天早上总结三条行业新闻\n<b>不要</b>超过 200 字',
  trigger: { kind: 'schedule', every: 'day', at: '08:00', timezone: 'Asia/Shanghai' },
  delivery: [{ channel: 'chat' }, { channel: 'telegram', bindingRef: `acb_${'d'.repeat(32)}` }],
  spendCapCentsPerRun: 0,
  tools: [],
  expiresAt: '2026-10-04T04:00:00.000Z',
};
const view: AutomationViewV0 = {
  automationRef: `aut_${'e'.repeat(32)}`,
  agentAccountId: AGENT,
  title: proposal.title,
  instruction: proposal.instruction,
  trigger: proposal.trigger,
  delivery: proposal.delivery,
  spendCapCentsPerRun: 0,
  tools: [],
  status: 'active',
  pausedReason: null,
  createdAt: '2026-10-03T04:00:00.000Z',
  nextRunAt: '2026-10-04T00:00:00.000Z',
  lastRun: null,
};
const event = { type: 'automation_proposal', proposal };

function transport(...responses: HttpResponseV1[]) {
  const request = jest.fn(async (_req: HttpRequestV1): Promise<HttpResponseV1> => {
    const next = responses.shift();
    if (!next) throw new Error('no response queued');
    return next;
  });
  return { request } satisfies HttpTransportV1;
}
const ok = (body: unknown): HttpResponseV1 => ({ status: 200, headers: {}, body });
const refused = (status: number, body: unknown): HttpResponseV1 => ({ status, headers: {}, body });
const stepUp = refused(403, { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required', message: 'sign in again' });

describe('automation proposals in the phone chat', () => {
  it('the shared stream parser hands the event to onAutomationProposal', () => {
    const seen: unknown[] = [];
    const parser = new AgentrixStreamParser({ onAutomationProposal: (e) => seen.push(e) });
    parser.feed(`data: ${JSON.stringify(event)}\n\n`);
    expect(seen).toEqual([event]);
  });

  it('keeps decodable proposals once each, and nothing while the flag is off (same switch as the list)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'automationProposal.ts'), 'utf8');
    expect(source).toMatch(/import \{ AGENT_AUTOMATIONS_ENABLED, AUTOMATION_CHANNEL_COPY \} from '\.\/agentAutomations';/);
    expect(source).toMatch(/enabled: boolean = AGENT_AUTOMATIONS_ENABLED/);
    expect(collectAutomationProposal([], event, false)).toBeNull();
    const once = collectAutomationProposal([], event, true);
    expect(once).toEqual([proposal]);
    expect(collectAutomationProposal(once!, event, true)).toBeNull();
    expect(collectAutomationProposal([], { type: 'automation_proposal', proposal: { ...proposal, proposalRef: 'apr_nope' } }, true)).toBeNull();
    expect(collectAutomationProposal([], { type: 'approval_required', proposal }, true)).toBeNull();
  });

  it('confirm and decline go to the contract routes with the owner token; the card shows what the server said', async () => {
    const t = transport(ok(view), ok({ proposalRef: REF, status: 'declined' }));
    const client = createMobileAutomationProposalClient({ transport: t, baseUrl: BASE, token: () => 'tok' });
    await expect(client.answer(REF, 'confirm')).resolves.toEqual({ kind: 'confirmed', nextRunAt: '2026-10-04T00:00:00.000Z' });
    await expect(client.answer(REF, 'decline')).resolves.toEqual({ kind: 'declined' });
    expect(t.request.mock.calls.map(([req]) => [req.method, req.path, req.headers?.Authorization])).toEqual([
      ['POST', `https://api.example.test/api/automations/proposals/${REF}/confirm`, 'Bearer tok'],
      ['POST', `https://api.example.test/api/automations/proposals/${REF}/decline`, 'Bearer tok'],
    ]);
  });

  it('an answer it cannot read is not taken as done', async () => {
    const t = transport(ok({ ...view, automationRef: 'aut_bad' }), ok({ proposalRef: `apr_${'f'.repeat(32)}`, status: 'declined' }));
    const client = createMobileAutomationProposalClient({ transport: t, baseUrl: BASE, token: () => 'tok' });
    await expect(client.answer(REF, 'confirm')).resolves.toEqual({ kind: 'failed', failure: 'unreadable' });
    await expect(client.answer(REF, 'decline')).resolves.toEqual({ kind: 'failed', failure: 'unreadable' });
  });

  it('a malformed ref or no session sends nothing', async () => {
    const t = transport();
    const client = createMobileAutomationProposalClient({ transport: t, baseUrl: BASE, token: () => 'tok' });
    await expect(client.answer('apr_../../admin', 'confirm')).resolves.toEqual({ kind: 'failed', failure: 'not_found' });
    const anonymous = createMobileAutomationProposalClient({ transport: t, baseUrl: BASE, token: () => null });
    await expect(anonymous.answer(REF, 'confirm')).resolves.toEqual({ kind: 'failed', failure: 'no_session' });
    expect(t.request).not.toHaveBeenCalled();
  });

  it.each([
    [refused(404, { code: 'AUTOMATION_NOT_FOUND' }), 'not_found'],
    [refused(409, { code: 'AUTOMATION_PROPOSAL_EXPIRED' }), 'expired'],
    [refused(409, { code: 'AUTOMATION_TRIGGER_NOT_CONFIGURED' }), 'trigger_not_open'],
    [refused(409, { code: 'AUTOMATION_LIMIT_REACHED' }), 'limit'],
    [refused(409, { code: 'AUTOMATION_BINDING_INVALID' }), 'binding'],
    [refused(403, { code: 'AUTOMATION_SIGN_IN_REQUIRED' }), 'sign_in_required'],
    [stepUp, 'step_up_required'],
    [refused(500, {}), 'unavailable'],
  ])('refusal %#: %p', async (response, failure) => {
    const client = createMobileAutomationProposalClient({ transport: transport(response), baseUrl: BASE, token: () => 'tok' });
    await expect(client.answer(REF, 'confirm')).resolves.toEqual({ kind: 'failed', failure });
  });

  it('a recent-sign-in request asks once and retries once; cancelled or asked again stops', async () => {
    const after = (...responses: HttpResponseV1[]): MobileAutomationProposalClientV0 =>
      createMobileAutomationProposalClient({ transport: transport(...responses), baseUrl: BASE, token: () => 'tok' });
    const ask = jest.fn(async () => true);
    await expect(runAutomationProposalAnswer({ client: after(stepUp, ok(view)), proposalRef: REF, action: 'confirm', confirmStepUp: ask }))
      .resolves.toEqual({ kind: 'confirmed', nextRunAt: view.nextRunAt });
    expect(ask).toHaveBeenCalledTimes(1);

    await expect(runAutomationProposalAnswer({ client: after(stepUp), proposalRef: REF, action: 'confirm', confirmStepUp: async () => false }))
      .resolves.toEqual({ kind: 'failed', failure: 'step_up_cancelled' });
    await expect(runAutomationProposalAnswer({ client: after(stepUp, stepUp), proposalRef: REF, action: 'confirm', confirmStepUp: async () => true }))
      .resolves.toEqual({ kind: 'failed', failure: 'step_up_again' });

    const never = jest.fn(async () => true);
    await expect(runAutomationProposalAnswer({ client: after(refused(409, { code: 'AUTOMATION_PROPOSAL_EXPIRED' })), proposalRef: REF, action: 'confirm', confirmStepUp: never }))
      .resolves.toEqual({ kind: 'failed', failure: 'expired' });
    expect(never).not.toHaveBeenCalled();
  });

  it('what the card prints: the Agent\'s text as plain text, schedule in words, delivery, spend cap as sent', () => {
    expect(automationProposalTitle(proposal, 'zh')).toBe('每日新闻摘要');
    expect(automationProposalTitle({ ...proposal, title: '\u202e\u0000' }, 'zh')).toBe('自动化');
    expect(automationProposalInstruction({ ...proposal, instruction: 'a\u0000b\r\n\n\n\nc' })).toBe('ab\n\nc');
    expect(automationProposalInstruction(proposal)).toBe('每天早上总结三条行业新闻\n<b>不要</b>超过 200 字');
    expect(automationProposalWhen(proposal, 'zh')).toContain('Asia/Shanghai');
    expect(automationProposalWhen({ ...proposal, trigger: { kind: 'payment_received', summary: '收到付款时' } } as AutomationProposalV0, 'zh')).toBe('收到付款时');
    expect(automationProposalDelivery(proposal, 'zh')).toBe('对话、Telegram');
    expect(automationProposalDelivery(proposal, 'en')).toBe('Chat, Telegram');
    expect(automationProposalSpend(proposal)).toBeNull();
    expect(automationProposalSpend({ ...proposal, spendCapCentsPerRun: 250 })).toBe('$2.50');
  });
});

describe('automation proposal card copy = web card', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const card = fs.readFileSync(path.join(ROOT, 'frontend/components/agents/AutomationProposalCard.tsx'), 'utf8');
  const entries = (start: string) => {
    const from = card.indexOf(start);
    if (from < 0) throw new Error(`not found: ${start}`);
    const block = card.slice(from, card.indexOf('\n}', from));
    return Object.fromEntries(
      [...block.matchAll(/^\s*([a-z][A-Za-z0-9_]*): \{ zh: '([^']*)', en: '([^']*)' \},?$/gm)].map((m) => [m[1], { zh: m[2], en: m[3] }]),
    );
  };

  it('labels, results and refusals, word for word', () => {
    const web = entries('const COPY = {');
    expect(Object.keys(web)).toHaveLength(23);
    expect(web).toEqual(AUTOMATION_PROPOSAL_COPY);
  });

  it('delivery channels, word for word', () => {
    expect(entries('const CHANNEL')).toEqual(AUTOMATION_CHANNEL_COPY);
  });

  it('every failure has the web card\'s words for the same case', () => {
    expect(automationProposalFailureCopy('not_found')).toBe(AUTOMATION_PROPOSAL_COPY.errNotFound);
    expect(automationProposalFailureCopy('expired')).toBe(AUTOMATION_PROPOSAL_COPY.errExpired);
    expect(automationProposalFailureCopy('trigger_not_open')).toBe(AUTOMATION_PROPOSAL_COPY.errTrigger);
    expect(automationProposalFailureCopy('limit')).toBe(AUTOMATION_PROPOSAL_COPY.errLimit);
    expect(automationProposalFailureCopy('binding')).toBe(AUTOMATION_PROPOSAL_COPY.errBinding);
    for (const f of ['step_up_required', 'step_up_cancelled', 'step_up_again', 'sign_in_required', 'no_session'] as const) {
      expect(automationProposalFailureCopy(f)).toBe(AUTOMATION_PROPOSAL_COPY.errStepUp);
    }
    for (const f of ['unreadable', 'unavailable'] as const) expect(automationProposalFailureCopy(f)).toBe(AUTOMATION_PROPOSAL_COPY.errOther);
  });
});
