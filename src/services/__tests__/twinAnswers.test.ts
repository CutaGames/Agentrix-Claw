/**
 * M0 native twin editing: the five answers visitors meet and the services on the card, over the owner interview routes.
 * Only `offer_drafts` is ever accepted from the phone, and only from the plan the owner just previewed.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildDigitalTwinCandidatePlanV1,
  computeDigitalTwinInterviewResponseDigestV1,
  type DigitalTwinInterviewResponseV1,
} from '../../../shared/types/digital-twin-interview';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  TWIN_ANSWER_QUESTION_IDS,
  acceptTwinCardServices,
  checkTwinAnswerText,
  fetchTwinAnswers,
  newTwinAnswerKey,
  previewTwinCardServices,
  readTwinAnswers,
  saveTwinAnswer,
  twinAnswerQuestions,
} from '../twinAnswers';

const AGENT = '2e697719-e3db-4c55-9361-2068482c473d';
const NOW = '2026-10-07T08:00:00.000Z';
const profileRef = { kind: 'digital_twin_profile', id: 'p1' } as const;
const sessionRef = { kind: 'interview_session', id: 's1' } as const;

function response(questionId: DigitalTwinInterviewResponseV1['questionId'], text: string, version = 1): DigitalTwinInterviewResponseV1 {
  return {
    schemaVersion: 1,
    questionId,
    version,
    modality: 'text',
    skipped: false,
    text,
    textDigest: computeDigitalTwinInterviewResponseDigestV1({ questionId, version, text, facet: 'public', skipped: false }),
    language: 'zh-CN',
    facet: 'public',
    createdAt: NOW,
  };
}

function session(responses: DigitalTwinInterviewResponseV1[]) {
  return {
    schemaVersion: 1,
    sessionRef,
    profileRef,
    templateVersion: 'twin-interview/v0',
    state: 'in_progress',
    progress: { answered: responses.length, skipped: 0, total: 20, coreAnswered: 1, coreTotal: 5, minimumMet: false },
    responses,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fakeTransport(answer: (req: HttpRequestV1) => { status: number; body?: unknown }) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    request: async (req) => {
      calls.push(req);
      const { status, body } = answer(req);
      return { status, headers: {}, body };
    },
  };
  return { transport, calls };
}

const input = (transport: HttpTransportV1) => ({ baseUrl: 'https://api.example/api', token: 'tok', transport });

describe('the five questions', () => {
  it('are intro, services, booking, common questions and contact, in the template wording', () => {
    const zh = twinAnswerQuestions('zh');
    expect(zh.map((q) => q.id)).toEqual(['q01', 'q02', 'q03', 'q05', 'q14']);
    expect(zh[1].prompt).toContain('服务');
    expect(twinAnswerQuestions('en')[3].prompt).toMatch(/ten questions/);
  });

  it('marks which answers feed the card and which only reach memory through the import', () => {
    const byId = Object.fromEntries(twinAnswerQuestions('zh').map((q) => [q.id, q]));
    expect([byId.q01.feedsCard, byId.q02.feedsCard, byId.q03.feedsCard]).toEqual([true, true, true]);
    expect([byId.q05.feedsCard, byId.q14.feedsCard]).toEqual([false, false]);
    expect(byId.q05.needsImport).toBe(true);
    expect(byId.q05.splitLines).toBe(true);
  });
});

describe('reading the interview', () => {
  it('keeps the latest answer of the five and the services on the card', () => {
    const plan = buildDigitalTwinCandidatePlanV1({ profileRef, sessionRef, planId: 'x', responses: [response('q02', '一对一辅导 S$120 / 小时')], now: NOW });
    const body = {
      success: true,
      data: {
        schemaVersion: 1,
        session: session([response('q02', '一对一辅导 S$120 / 小时', 3), response('q12', '语气轻松')]),
        interim: { offerDrafts: { ...plan.interim.offerDrafts, version: 2, sourcePlanDigest: plan.planDigest } },
      },
    };
    const read = readTwinAnswers(200, body);
    expect(read).toEqual({ kind: 'ready', data: { answers: { q02: { text: '一对一辅导 S$120 / 小时', version: 3 } }, cardServices: plan.interim.offerDrafts.items } });
  });

  it('no session yet is an empty form, not an error', () => {
    expect(readTwinAnswers(200, { success: true, data: { schemaVersion: 1, session: null, interim: null } })).toEqual({ kind: 'ready', data: { answers: {}, cardServices: [] } });
  });

  it('negative: a malformed session, another schema or a failed status is never read as answers', () => {
    expect(readTwinAnswers(200, { success: true, data: { schemaVersion: 1, session: { schemaVersion: 1 } } }).kind).toBe('error');
    expect(readTwinAnswers(200, { success: true, data: { schemaVersion: 2, session: null } }).kind).toBe('error');
    expect(readTwinAnswers(401, {}).kind).toBe('unauthorized');
    expect(readTwinAnswers(503, {}).kind).toBe('unavailable');
    expect(readTwinAnswers(500, {}).kind).toBe('error');
  });

  it('reads the owner interview route with the bearer and refuses an unsafe agent id before any request', async () => {
    const { transport, calls } = fakeTransport(() => ({ status: 200, body: { success: true, data: { schemaVersion: 1, session: null, interim: null } } }));
    await fetchTwinAnswers(AGENT, input(transport));
    expect(calls[0]).toMatchObject({ method: 'GET', path: `https://api.example/api/v1/agents/${AGENT}/twin/interview` });
    expect(calls[0].headers?.Authorization).toBe('Bearer tok');
    expect((await fetchTwinAnswers('../x', input(transport))).kind).toBe('unavailable');
    expect(calls).toHaveLength(1);
  });
});

describe('saving an answer', () => {
  it('appends a text answer version with the idempotency key', async () => {
    const { transport, calls } = fakeTransport(() => ({
      status: 200,
      body: { success: true, data: { status: 'applied', value: { schemaVersion: 1, responses: [{ questionId: 'q02', version: 4 }] } } },
    }));
    const out = await saveTwinAnswer(AGENT, 'q02', '  一对一辅导\r\n小组课  ', 'zh', { ...input(transport), idempotencyKey: 'k1' });
    expect(out).toEqual({ kind: 'done', value: { version: 4 } });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `https://api.example/api/v1/agents/${AGENT}/twin/interview/responses` });
    expect(calls[0].headers?.['Idempotency-Key']).toBe('k1');
    expect(calls[0].body).toEqual({ schemaVersion: 1, questionId: 'q02', modality: 'text', text: '一对一辅导\n小组课', language: 'zh-CN' });
  });

  it('a spoken answer is saved as voice_transcript; anything else is text', async () => {
    const { transport, calls } = fakeTransport(() => ({
      status: 200,
      body: { success: true, data: { status: 'applied', value: { schemaVersion: 1, responses: [{ questionId: 'q05', version: 1 }] } } },
    }));
    await saveTwinAnswer(AGENT, 'q05', '多久见效？一般三周', 'zh', { ...input(transport), idempotencyKey: 'v1', modality: 'voice_transcript' });
    await saveTwinAnswer(AGENT, 'q05', '多久见效？一般三周', 'zh', { ...input(transport), idempotencyKey: 'v2', modality: 'audio' as never });
    expect(calls.map((c) => (c.body as { modality: string }).modality)).toEqual(['voice_transcript', 'text']);
  });

  it('negative: empty, too long or secret-looking text never leaves the phone', async () => {
    const { transport, calls } = fakeTransport(() => ({ status: 200 }));
    expect(await saveTwinAnswer(AGENT, 'q05', '   ', 'zh', { ...input(transport), idempotencyKey: 'k' })).toEqual({ kind: 'invalid', reason: 'empty' });
    expect(await saveTwinAnswer(AGENT, 'q05', 'x'.repeat(4001), 'zh', { ...input(transport), idempotencyKey: 'k' })).toEqual({ kind: 'invalid', reason: 'too_long' });
    expect(checkTwinAnswerText('预约系统 api_key=abcdef123456')).toBe('looks_secret');
    expect(await saveTwinAnswer(AGENT, 'q03', 'password: hunter22', 'zh', { ...input(transport), idempotencyKey: 'k' })).toEqual({ kind: 'invalid', reason: 'looks_secret' });
    expect(calls).toHaveLength(0);
  });

  it('negative: only the five questions can be written from the phone', async () => {
    const { transport, calls } = fakeTransport(() => ({ status: 200 }));
    expect((await saveTwinAnswer(AGENT, 'q09' as never, '别答价格', 'zh', { ...input(transport), idempotencyKey: 'k' })).kind).toBe('blocked');
    expect(calls).toHaveLength(0);
    expect(TWIN_ANSWER_QUESTION_IDS).not.toContain('q09');
  });

  it('a 409 keeps its reason (idempotency conflict), a 503 is the capability being off', async () => {
    let status = 409;
    const { transport } = fakeTransport(() => ({ status, body: { reasonCode: 'idempotency_conflict' } }));
    expect(await saveTwinAnswer(AGENT, 'q02', 'a', 'zh', { ...input(transport), idempotencyKey: 'k' })).toEqual({ kind: 'rejected', reasonCode: 'idempotency_conflict' });
    status = 503;
    expect((await saveTwinAnswer(AGENT, 'q02', 'a', 'zh', { ...input(transport), idempotencyKey: 'k' })).kind).toBe('rejected');
  });
});

describe('updating the services on the card', () => {
  const plan = buildDigitalTwinCandidatePlanV1({
    profileRef,
    sessionRef,
    planId: 'plan-1',
    responses: [response('q01', '我帮自由职业者理清报价'), response('q02', '一对一辅导 S$120\n报价模板 S$30')],
    now: NOW,
  });

  it('previews from the server plan and accepts only offer_drafts from exactly that plan', async () => {
    const { transport, calls } = fakeTransport((req) =>
      req.path.endsWith('/plan')
        ? { status: 200, body: { success: true, data: { status: 'applied', value: plan } } }
        : { status: 200, body: { success: true, data: { status: 'applied', value: { schemaVersion: 1, offerDrafts: { ...plan.interim.offerDrafts, version: 1, sourcePlanDigest: plan.planDigest } } } } },
    );
    const preview = await previewTwinCardServices(AGENT, input(transport));
    expect(preview.kind).toBe('done');
    if (preview.kind !== 'done') return;
    expect(preview.value.services).toEqual(plan.interim.offerDrafts.items);
    expect(preview.value.services.length).toBeGreaterThan(0);
    const accepted = await acceptTwinCardServices(AGENT, preview.value, { ...input(transport), idempotencyKey: 'k2' });
    expect(accepted).toEqual({ kind: 'done', value: { services: plan.interim.offerDrafts.items } });
    expect(calls[1].body).toEqual({ schemaVersion: 1, planRef: plan.planRef, planDigest: plan.planDigest, accept: ['offer_drafts'] });
    expect(calls[1].headers?.['Idempotency-Key']).toBe('k2');
  });

  it('negative: an answer changed since the preview comes back as plan_stale, a broken plan is not shown', async () => {
    const stale = fakeTransport(() => ({ status: 409, body: { reasonCode: 'plan_stale' } }));
    expect(await acceptTwinCardServices(AGENT, plan, { ...input(stale.transport), idempotencyKey: 'k' })).toEqual({ kind: 'rejected', reasonCode: 'plan_stale' });
    const broken = fakeTransport(() => ({ status: 200, body: { success: true, data: { status: 'applied', value: { schemaVersion: 1, planRef: 'x' } } } }));
    expect(await previewTwinCardServices(AGENT, input(broken.transport))).toEqual({ kind: 'failed', reason: 'response_malformed', retryable: false });
  });
});

describe('wiring (source guards; RN screens do not render under ts-jest)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');

  it('the screen is registered and entered only in M0 builds, from a twin that exists', () => {
    expect(read('navigation/four-zone/FourZoneTabNavigator.tsx')).toMatch(/MOBILE_M0_ENABLED \? <TwinStack\.Screen name="TwinAnswers" component=\{TwinAnswersScreen\}/);
    const home = read('screens/four-zone/TwinHomeScreen.tsx');
    expect(home).toMatch(/MOBILE_M0_ENABLED && hasTwin \? \(\s*<TouchableOpacity[\s\S]{0,80}navigation\.navigate\('TwinAnswers'\)/);
  });

  it('a spoken answer only fills the text box: a tap does nothing, Save sends it marked as voice', () => {
    const button = read('components/VoiceAnswerButton.tsx');
    expect(button).toMatch(/createPttController\(/);
    expect(button).toMatch(/deliver: \(text\) => onTextRef\.current\(text\)/);
    expect(button).toMatch(/openChat: \(\) => undefined/);
    expect(button).not.toMatch(/setPendingPrefill|navigate\(/);
    const screen = read('screens/four-zone/TwinAnswersScreen.tsx');
    expect(screen).toMatch(/<VoiceAnswerButton[\s\S]{0,400}setSpoken\(true\)/);
    expect(screen).toMatch(/save\.mutate\(\{ id: question\.id, text: draft, voice: spoken \}\)/);
  });

  it('the screen never opens the web and accepts services only after a preview', () => {
    const screen = read('screens/four-zone/TwinAnswersScreen.tsx');
    expect(screen).not.toMatch(/Linking|webHandoff|getTwinWebUrl/);
    expect(screen).toMatch(/onPress=\{\(\) => accept\.mutate\(preview\)\}/);
    expect(screen.indexOf('accept.mutate(preview)')).toBeGreaterThan(screen.indexOf('{preview ? ('));
  });
});

describe('idempotency keys', () => {
  it('differ per action and stay within the server limit', () => {
    let n = 0;
    const random = () => ((n += 1) * 0.137) % 1;
    const a = newTwinAnswerKey('answer', 1, random);
    const b = newTwinAnswerKey('answer', 1, random);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(160);
    expect(newTwinAnswerKey('services')).toMatch(/^mobile-twin-services-/);
  });
});
