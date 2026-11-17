import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { TWIN_ASK_REFUSAL_CODES_V0, TWIN_ASK_SCHEMA_VERSION_V0, type TwinAskRequestV0, type TwinAskSharingPreviewV0 } from '../../../shared/types/twin-ask';
import {
  TWIN_ASK_FAILURE_COPY,
  TWIN_ASK_REFUSAL_COPY,
  TWIN_ASK_STEP_UP_COPY,
  TwinAskError,
  createMobileTwinAskClient,
  isTwinAskMobileEnabled,
  saveTwinAskSharing,
} from '../twinAsk';

const BASE = 'https://api.example/api';
const ID = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const FACT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CODE = 'AbCdEfGhIjKlMnOpQrSt_-';
const T0 = '2026-11-16T08:00:00.000Z';
const T1 = '2026-11-17T08:00:00.000Z';
const HEAD = { schemaVersion: TWIN_ASK_SCHEMA_VERSION_V0, id: ID, status: 'open', topic: 'food', question: '附近哪家面馆好吃？', createdAt: T0, endsAt: T1 };
const ASKER = {
  ...HEAD,
  role: 'asker',
  closedReason: null,
  closedAt: null,
  receiptSigned: false,
  people: [{ ref: 'rel:1', label: '老张', via: 'app', state: 'answered', answeredBy: 'twin', parts: ['巷口那家牛肉面'], answeredAt: T0 }],
};
const INVITED = {
  ...HEAD,
  role: 'invited',
  askerName: '小周',
  myState: 'needs_me',
  answeredBy: null,
  myParts: [],
  canAnswer: true,
  canDecline: true,
  canWithdraw: false,
  canSaveAsFact: true,
};
const FACT = { id: FACT_ID, topic: 'food', text: '巷口那家牛肉面', source: 'settings', createdAt: T0, updatedAt: T0 };
const TIERS = [
  { tier: 'client', topics: [], available: true },
  { tier: 'collaborator', topics: [], available: true },
  { tier: 'family', topics: ['food'], available: true },
  { tier: 'community', topics: [], available: false },
];
const PREVIEW: TwinAskSharingPreviewV0 = { tier: 'family', topics: ['food', 'travel'], expectedVersion: 3, previewDigest: 'sha256:0123456789abcdef', requiresStepUp: true };
const REQUEST = { topic: 'food', question: HEAD.question, friendRefs: ['rel:1'], guestLabels: ['阿 May'] } as TwinAskRequestV0;
const STEP_UP = { status: 403, body: { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' } };
const CJK = /[\u3400-\u9fff]/;

type Scripted = { status: number; body?: unknown } | Error;

function scripted(...responses: Scripted[]) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    async request(req) {
      calls.push(req);
      const next = responses.shift();
      if (next === undefined) throw new Error('no scripted response left');
      if (next instanceof Error) throw next;
      return { status: next.status, headers: {}, body: next.body };
    },
  };
  const client = createMobileTwinAskClient({ transport, baseUrl: `${BASE}/`, webOrigin: 'https://web.example/', token: () => 'tok' });
  return { calls, client };
}

const sent = (calls: HttpRequestV1[]) => calls.map((call) => [call.method, call.path.slice(BASE.length), call.body]);

describe('asking around on the phone', () => {
  it('is on only when the build sets EXPO_PUBLIC_TWIN_ASK=1', () => {
    expect(isTwinAskMobileEnabled('1')).toBe(true);
    expect(isTwinAskMobileEnabled('0')).toBe(false);
    expect(isTwinAskMobileEnabled('true')).toBe(false);
    expect(isTwinAskMobileEnabled(undefined)).toBe(false);
  });

  it('sends signed-in mobile requests and reads the settings', async () => {
    const { calls, client } = scripted({ status: 200, body: { optIn: true, dailyCap: null } }, { status: 200, body: { data: { optIn: false, dailyCap: 3 } } });
    await expect(client.profile()).resolves.toEqual({ optIn: true, dailyCap: null });
    await expect(client.updateProfile({ dailyCap: 3 })).resolves.toEqual({ optIn: false, dailyCap: 3 });
    expect(calls[0]).toEqual({ method: 'GET', path: `${BASE}/twin-ask/profile`, headers: { Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' } });
    expect(calls[1]).toMatchObject({ method: 'PUT', path: `${BASE}/twin-ask/profile`, body: { dailyCap: 3 } });
  });

  it('sends nothing without a session', async () => {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        return { status: 200, headers: {}, body: { friends: [] } };
      },
    };
    const client = createMobileTwinAskClient({ transport, baseUrl: BASE, webOrigin: 'https://web.example', token: () => null });
    await expect(client.friends()).rejects.toMatchObject({ failure: 'no_session' });
    expect(calls).toHaveLength(0);
  });

  it('starts a question and turns link codes into web links', async () => {
    const { calls, client } = scripted(
      { status: 201, body: { started: true, askId: ID, routes: [{ ref: 'rel:1', route: 'app' }, { ref: 'guest:1', route: 'link' }], links: [{ ref: 'guest:1', code: CODE }] } },
      { status: 201, body: { started: false, code: 'asker_daily_limit' } },
    );
    await expect(client.start(REQUEST)).resolves.toEqual({
      started: true,
      askId: ID,
      routes: [{ ref: 'rel:1', route: 'app' }, { ref: 'guest:1', route: 'link' }],
      links: [{ ref: 'guest:1', url: `https://web.example/ask#${CODE}` }],
    });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${BASE}/twin-ask`, body: REQUEST });
    await expect(client.start(REQUEST)).resolves.toEqual({ started: false, code: 'asker_daily_limit' });
  });

  it('lists questions, older pages with before', async () => {
    const item = { id: ID, role: 'asker', status: 'open', topic: 'food', question: HEAD.question, createdAt: T0, endsAt: T1, answered: 1, people: 2, needsMe: false };
    const { calls, client } = scripted({ status: 200, body: { items: [item] } }, { status: 200, body: { data: { items: [] } } });
    await expect(client.list()).resolves.toEqual([item]);
    await expect(client.list(T0)).resolves.toEqual([]);
    expect(calls.map((call) => call.path)).toEqual([`${BASE}/twin-ask`, `${BASE}/twin-ask?before=2026-11-16T08%3A00%3A00.000Z`]);
  });

  it('reads a question and posts each action to its own path', async () => {
    const answered = { ...INVITED, myState: 'answered', answeredBy: 'owner', myParts: ['去巷口那家'], canAnswer: false, canDecline: false, canWithdraw: true };
    const { calls, client } = scripted(
      { status: 200, body: ASKER },
      { status: 200, body: answered },
      { status: 200, body: answered },
      { status: 200, body: { ...INVITED, myState: 'declined', canAnswer: false, canDecline: false } },
      { status: 200, body: { ...INVITED, myState: 'withdrawn' } },
      { status: 200, body: { ...ASKER, status: 'closed', closedReason: 'asker_closed', closedAt: T0 } },
      { status: 200, body: { ref: 'guest:1', code: CODE } },
    );
    await expect(client.get(ID)).resolves.toEqual(ASKER);
    await expect(client.answer(ID, { text: '去巷口那家' })).resolves.toMatchObject({ role: 'invited', answeredBy: 'owner' });
    await expect(client.answer(ID, { text: '去巷口那家', saveAsFact: true })).resolves.toMatchObject({ myState: 'answered' });
    await expect(client.decline(ID)).resolves.toMatchObject({ myState: 'declined' });
    await expect(client.withdraw(ID)).resolves.toMatchObject({ myState: 'withdrawn' });
    await expect(client.close(ID)).resolves.toMatchObject({ role: 'asker', status: 'closed', closedReason: 'asker_closed' });
    await expect(client.relink(ID, 'guest:1')).resolves.toEqual({ ref: 'guest:1', url: `https://web.example/ask#${CODE}` });
    expect(sent(calls)).toEqual([
      ['GET', `/twin-ask/${ID}`, undefined],
      ['POST', `/twin-ask/${ID}/answer`, { text: '去巷口那家' }],
      ['POST', `/twin-ask/${ID}/answer`, { text: '去巷口那家', saveAsFact: true }],
      ['POST', `/twin-ask/${ID}/decline`, {}],
      ['POST', `/twin-ask/${ID}/withdraw`, {}],
      ['POST', `/twin-ask/${ID}/close`, {}],
      ['POST', `/twin-ask/${ID}/relink`, { ref: 'guest:1' }],
    ]);
  });

  it('keeps the entries a twin may quote and the topics each tier may hear', async () => {
    const { calls, client } = scripted(
      { status: 200, body: { facts: [FACT] } },
      { status: 201, body: { fact: FACT } },
      { status: 200, body: { data: { fact: { ...FACT, text: '巷口那家牛肉面，不辣', updatedAt: T1 } } } },
      { status: 200, body: { deleted: true } },
      { status: 200, body: { tiers: TIERS } },
      { status: 200, body: PREVIEW },
      { status: 200, body: { tiers: TIERS } },
    );
    await expect(client.facts()).resolves.toEqual([FACT]);
    await expect(client.addFact({ topic: 'food', text: FACT.text })).resolves.toEqual(FACT);
    await expect(client.replaceFact(FACT_ID, { topic: 'food', text: '巷口那家牛肉面，不辣' })).resolves.toMatchObject({ id: FACT_ID, updatedAt: T1 });
    await expect(client.removeFact(FACT_ID)).resolves.toBeUndefined();
    await expect(client.sharing()).resolves.toEqual({ tiers: TIERS });
    await expect(client.previewSharing({ tier: 'family', topics: ['food', 'travel'] })).resolves.toEqual(PREVIEW);
    await expect(client.commitSharing(PREVIEW)).resolves.toEqual({ tiers: TIERS });
    expect(sent(calls)).toEqual([
      ['GET', '/twin-ask/facts', undefined],
      ['POST', '/twin-ask/facts', { topic: 'food', text: FACT.text }],
      ['PUT', `/twin-ask/facts/${FACT_ID}`, { topic: 'food', text: '巷口那家牛肉面，不辣' }],
      ['DELETE', `/twin-ask/facts/${FACT_ID}`, undefined],
      ['GET', '/twin-ask/sharing', undefined],
      ['POST', '/twin-ask/sharing/preview', { tier: 'family', topics: ['food', 'travel'] }],
      ['PUT', '/twin-ask/sharing', { tier: 'family', topics: ['food', 'travel'], expectedVersion: 3, previewDigest: PREVIEW.previewDigest }],
    ]);
  });

  it('does not send malformed ids and rejects answers about another question or the wrong side', async () => {
    const { calls, client } = scripted(
      { status: 200, body: { ...ASKER, id: '1b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d' } },
      { status: 200, body: ASKER },
      { status: 200, body: INVITED },
      { status: 200, body: { ref: 'guest:2', code: CODE } },
      { status: 200, body: { fact: { ...FACT, id: ID } } },
      { status: 200, body: {} },
      { status: 200, body: { ...PREVIEW, tier: 'client' } },
    );
    await expect(client.get('../profile')).rejects.toMatchObject({ failure: 'not_found' });
    await expect(client.relink('nope', 'guest:1')).rejects.toMatchObject({ failure: 'not_found' });
    await expect(client.replaceFact('../sharing', { topic: 'food', text: 'x' })).rejects.toMatchObject({ failure: 'not_found' });
    await expect(client.removeFact('nope')).rejects.toMatchObject({ failure: 'not_found' });
    expect(calls).toHaveLength(0);
    await expect(client.get(ID)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.answer(ID, { text: 'x' })).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.close(ID)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.relink(ID, 'guest:1')).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.replaceFact(FACT_ID, { topic: 'food', text: 'x' })).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.removeFact(FACT_ID)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.previewSharing({ tier: 'family', topics: [] })).rejects.toMatchObject({ failure: 'unreadable' });
  });

  it('sends the phone confirmation and where an entry came from only when they are set', async () => {
    const proof = { deviceId: `dev_${'c'.repeat(32)}`, nonce: T0, signature: 'A'.repeat(86) };
    const confirmed = {
      ...INVITED,
      myState: 'answered',
      answeredBy: 'owner',
      myParts: ['去巷口那家'],
      canDecline: false,
      canWithdraw: true,
      canDeviceConfirm: true,
      deviceNonce: T1,
      deviceConfirmed: true,
    };
    const { calls, client } = scripted({ status: 200, body: confirmed }, { status: 201, body: { fact: { ...FACT, source: 'memory' } } });
    // Anything else riding on the proof object stays on the phone.
    const reply = { text: '去巷口那家', saveAsFact: true, deviceProof: { ...proof, privateNote: 'x' } };
    await expect(client.answer(ID, reply)).resolves.toMatchObject({ deviceConfirmed: true, canDeviceConfirm: true, deviceNonce: T1 });
    await expect(client.addFact({ topic: 'food', text: FACT.text, source: 'memory' })).resolves.toMatchObject({ source: 'memory' });
    expect(sent(calls)).toEqual([
      ['POST', `/twin-ask/${ID}/answer`, { text: '去巷口那家', saveAsFact: true, deviceProof: proof }],
      ['POST', '/twin-ask/facts', { topic: 'food', text: FACT.text, source: 'memory' }],
    ]);
  });

  it('maps statuses to failures and keeps the rule a bad form broke', async () => {
    const cases: [Scripted, string][] = [
      [{ status: 401, body: { code: 'x' } }, 'not_allowed'],
      [{ status: 403, body: { code: 'sign_in_required' } }, 'not_allowed'],
      [STEP_UP, 'step_up_required'],
      [{ status: 404, body: { code: 'x' } }, 'not_found'],
      [{ status: 409, body: { code: 'sharing_changed' } }, 'changed'],
      [{ status: 409, body: { code: 'changed' } }, 'changed'],
      [{ status: 409, body: { code: 'device_proof_rejected' } }, 'device_proof_rejected'],
      [{ status: 409, body: { code: 'facts_full' } }, 'facts_full'],
      [{ status: 409, body: 'device_proof_rejected' }, 'changed'],
      [{ status: 410, body: { code: 'device_proof_rejected' } }, 'changed'],
      [{ status: 429, body: { code: 'rate_limited' } }, 'too_many'],
      [{ status: 500, body: { code: 'x' } }, 'unavailable'],
    ];
    for (const [response, failure] of cases) {
      const { client } = scripted(response);
      await expect(client.list()).rejects.toMatchObject({ failure, reasonCode: null, field: null });
    }
    const invalid = scripted({ status: 400, body: { code: 'invalid_request', reasonCode: 'text_violation', field: 'request.question' } });
    const error = await invalid.client.start(REQUEST).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TwinAskError);
    expect(error).toMatchObject({ failure: 'invalid', reasonCode: 'text_violation', field: 'request.question' });
    const offline = scripted(new Error('offline'), { status: 200, body: { items: 'nope' } });
    await expect(offline.client.list()).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(offline.client.list()).rejects.toMatchObject({ failure: 'unreadable' });
  });

  it('opens topics to a tier only after the owner confirms it is them', async () => {
    const confirmations: string[] = [];
    const confirm = (answer: boolean | Error) => async () => {
      confirmations.push('asked');
      if (answer instanceof Error) throw answer;
      return answer;
    };
    const saved = { status: 200, body: { tiers: TIERS } };

    const direct = scripted(saved);
    await expect(saveTwinAskSharing(direct.client, PREVIEW, confirm(true))).resolves.toEqual({ kind: 'saved', sharing: { tiers: TIERS } });
    expect(confirmations).toHaveLength(0);

    const stepUp = scripted(STEP_UP, saved);
    await expect(saveTwinAskSharing(stepUp.client, PREVIEW, confirm(true))).resolves.toEqual({ kind: 'saved', sharing: { tiers: TIERS } });
    expect(sent(stepUp.calls).map(([method, path, body]) => [method, path, body])).toEqual([
      ['PUT', '/twin-ask/sharing', { tier: 'family', topics: ['food', 'travel'], expectedVersion: 3, previewDigest: PREVIEW.previewDigest }],
      ['PUT', '/twin-ask/sharing', { tier: 'family', topics: ['food', 'travel'], expectedVersion: 3, previewDigest: PREVIEW.previewDigest }],
    ]);
    expect(confirmations).toHaveLength(1);

    const cancelled = scripted(STEP_UP);
    await expect(saveTwinAskSharing(cancelled.client, PREVIEW, confirm(false))).resolves.toEqual({ kind: 'failed', failure: 'step_up_cancelled' });
    expect(cancelled.calls).toHaveLength(1);
    const broken = scripted(STEP_UP);
    await expect(saveTwinAskSharing(broken.client, PREVIEW, confirm(new Error('sheet closed')))).resolves.toEqual({ kind: 'failed', failure: 'step_up_cancelled' });

    const again = scripted(STEP_UP, STEP_UP);
    await expect(saveTwinAskSharing(again.client, PREVIEW, confirm(true))).resolves.toEqual({ kind: 'failed', failure: 'step_up_again' });
    const moved = scripted({ status: 409, body: { code: 'sharing_changed' } });
    await expect(saveTwinAskSharing(moved.client, PREVIEW, confirm(true))).resolves.toEqual({ kind: 'failed', failure: 'changed' });
    const movedLater = scripted(STEP_UP, { status: 409, body: { code: 'sharing_changed' } });
    await expect(saveTwinAskSharing(movedLater.client, PREVIEW, confirm(true))).resolves.toEqual({ kind: 'failed', failure: 'changed' });
  });

  it('has Chinese and English words for every failure and refusal', () => {
    const copies = [
      ...Object.values(TWIN_ASK_FAILURE_COPY),
      ...TWIN_ASK_REFUSAL_CODES_V0.map((code) => TWIN_ASK_REFUSAL_COPY[code]),
      ...Object.values(TWIN_ASK_STEP_UP_COPY),
    ];
    expect(copies).toHaveLength(11 + TWIN_ASK_REFUSAL_CODES_V0.length + 2);
    for (const copy of copies) {
      expect(copy.en.length).toBeGreaterThan(0);
      expect(copy.zh).toMatch(CJK);
    }
  });
});
