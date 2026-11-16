import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { TWIN_HUDDLE_KINDS_V0, TWIN_HUDDLE_REFUSAL_CODES_V0, TWIN_HUDDLE_SCHEMA_VERSION_V0, type TwinHuddleRequestV0 } from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_FAILURE_COPY, TWIN_HUDDLE_REFUSAL_COPY, TwinHuddleError, createMobileTwinHuddleClient, isTwinHuddleMobileEnabled } from '../twinHuddle';

const BASE = 'https://api.example/api';
const ID = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const CODE = 'AbCdEfGhIjKlMnOpQrSt_-';
const SLOT = { startAt: '2026-11-20T11:00:00.000Z', endAt: '2026-11-20T13:00:00.000Z' };
const KIND = TWIN_HUDDLE_KINDS_V0[0];
const HEAD = {
  schemaVersion: TWIN_HUDDLE_SCHEMA_VERSION_V0,
  id: ID,
  status: 'collecting',
  stageEndsAt: '2026-11-19T11:00:00.000Z',
  createdAt: '2026-11-18T11:00:00.000Z',
  details: { kind: KIND, candidates: [SLOT], budget: 'mid' },
};
const INITIATOR = { ...HEAD, role: 'initiator', people: [{ ref: 'u:1', label: '老张', route: 'twin' }], proposals: [], chosen: null, confirmed: [] };
const INVITED = { ...HEAD, role: 'invited', initiatorName: '小周', myAnswer: null, answeredBy: null, canAnswer: true, chosen: null, canConfirm: false, myConfirmation: null, confirmedCount: 0 };
const REQUEST = { kind: KIND, candidates: [SLOT], budget: 'mid', friendRefs: ['u:42'], guestLabels: ['阿 May'] } as TwinHuddleRequestV0;
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
  const client = createMobileTwinHuddleClient({ transport, baseUrl: `${BASE}/`, webOrigin: 'https://web.example/', token: () => 'tok' });
  return { calls, client };
}

describe('twin huddle on the phone', () => {
  it('is on only when the build sets EXPO_PUBLIC_TWIN_HUDDLE=1', () => {
    expect(isTwinHuddleMobileEnabled('1')).toBe(true);
    expect(isTwinHuddleMobileEnabled('0')).toBe(false);
    expect(isTwinHuddleMobileEnabled('true')).toBe(false);
    expect(isTwinHuddleMobileEnabled(undefined)).toBe(false);
  });

  it('sends signed-in mobile requests and reads the settings', async () => {
    const saved = { optIn: false, dailyCap: 2, dietTags: ['halal'], budgetMax: 'low' };
    const { calls, client } = scripted({ status: 200, body: { optIn: true, dailyCap: null, dietTags: [], budgetMax: null } }, { status: 200, body: { data: saved } });
    await expect(client.profile()).resolves.toEqual({ optIn: true, dailyCap: null, dietTags: [], budgetMax: null });
    await expect(client.updateProfile({ dailyCap: 2 })).resolves.toEqual(saved);
    expect(calls[0]).toEqual({ method: 'GET', path: `${BASE}/twin-huddle/profile`, headers: { Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' } });
    expect(calls[1]).toMatchObject({ method: 'PUT', path: `${BASE}/twin-huddle/profile`, body: { dailyCap: 2 } });
  });

  it('sends nothing without a session', async () => {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        return { status: 200, headers: {}, body: { friends: [] } };
      },
    };
    const client = createMobileTwinHuddleClient({ transport, baseUrl: BASE, webOrigin: 'https://web.example', token: () => null });
    await expect(client.friends()).rejects.toMatchObject({ failure: 'no_session' });
    expect(calls).toHaveLength(0);
  });

  it('starts a plan and turns link codes into web links', async () => {
    const { calls, client } = scripted(
      { status: 201, body: { started: true, huddleId: ID, routes: [{ ref: 'u:42', route: 'twin' }], links: [{ ref: 'guest:1', code: CODE }] } },
      { status: 201, body: { started: false, code: 'initiator_not_opted_in' } },
    );
    await expect(client.start(REQUEST)).resolves.toEqual({
      started: true,
      huddleId: ID,
      routes: [{ ref: 'u:42', route: 'twin' }],
      links: [{ ref: 'guest:1', url: `https://web.example/huddle#${CODE}` }],
    });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `${BASE}/twin-huddle`, body: REQUEST });
    await expect(client.start(REQUEST)).resolves.toEqual({ started: false, code: 'initiator_not_opted_in' });
  });

  it('lists plans, older pages with before', async () => {
    const item = { id: ID, role: 'initiator', kind: KIND, status: 'choosing', stageEndsAt: null, createdAt: HEAD.createdAt, needsMe: true };
    const { calls, client } = scripted({ status: 200, body: { items: [item] } }, { status: 200, body: { items: [] } });
    await expect(client.list()).resolves.toEqual([item]);
    await expect(client.list(HEAD.createdAt)).resolves.toEqual([]);
    expect(calls.map((call) => call.path)).toEqual([`${BASE}/twin-huddle`, `${BASE}/twin-huddle?before=2026-11-18T11%3A00%3A00.000Z`]);
  });

  it('reads a plan and posts each action to its own path', async () => {
    const { calls, client } = scripted(
      { status: 200, body: INITIATOR },
      { status: 200, body: { ...INVITED, canAnswer: false, myAnswer: [{ candidate: 0, value: 'yes' }], answeredBy: 'owner' } },
      { status: 200, body: { ...INITIATOR, status: 'confirming', chosen: { candidate: 0, slot: SLOT } } },
      { status: 200, body: { ...INVITED, status: 'confirming', myConfirmation: 'confirmed' } },
      { status: 200, body: { ...INITIATOR, status: 'cancelled', stageEndsAt: null } },
      { status: 200, body: { ref: 'guest:1', code: CODE } },
    );
    await expect(client.get(ID)).resolves.toEqual(INITIATOR);
    await expect(client.answer(ID, [{ candidate: 0, value: 'yes' }])).resolves.toMatchObject({ role: 'invited', answeredBy: 'owner' });
    await expect(client.choose(ID, 0)).resolves.toMatchObject({ role: 'initiator', chosen: { candidate: 0, slot: SLOT } });
    await expect(client.confirm(ID, 'confirmed')).resolves.toMatchObject({ role: 'invited', myConfirmation: 'confirmed' });
    await expect(client.cancel(ID)).resolves.toMatchObject({ status: 'cancelled' });
    await expect(client.relink(ID, 'guest:1')).resolves.toEqual({ ref: 'guest:1', url: `https://web.example/huddle#${CODE}` });
    expect(calls.map((call) => [call.method, call.path.slice(BASE.length), call.body])).toEqual([
      ['GET', `/twin-huddle/${ID}`, undefined],
      ['POST', `/twin-huddle/${ID}/answer`, { slots: [{ candidate: 0, value: 'yes' }] }],
      ['POST', `/twin-huddle/${ID}/choose`, { candidate: 0 }],
      ['POST', `/twin-huddle/${ID}/confirm`, { confirmation: 'confirmed' }],
      ['POST', `/twin-huddle/${ID}/cancel`, {}],
      ['POST', `/twin-huddle/${ID}/relink`, { ref: 'guest:1' }],
    ]);
  });

  it('does not send malformed ids and rejects answers about another plan or the wrong side', async () => {
    const { calls, client } = scripted(
      { status: 200, body: { ...INITIATOR, id: '1b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d' } },
      { status: 200, body: INITIATOR },
      { status: 200, body: { ref: 'guest:2', code: CODE } },
    );
    await expect(client.get('../profile')).rejects.toMatchObject({ failure: 'not_found' });
    await expect(client.relink('nope', 'guest:1')).rejects.toMatchObject({ failure: 'not_found' });
    expect(calls).toHaveLength(0);
    await expect(client.get(ID)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.answer(ID, [{ candidate: 0, value: 'no' }])).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client.relink(ID, 'guest:1')).rejects.toMatchObject({ failure: 'unreadable' });
  });

  it('maps statuses to failures and keeps the rule a bad form broke', async () => {
    const cases: [number, string][] = [
      [401, 'not_allowed'],
      [403, 'not_allowed'],
      [404, 'not_found'],
      [409, 'changed'],
      [429, 'too_many'],
      [500, 'unavailable'],
    ];
    for (const [status, failure] of cases) {
      const { client } = scripted({ status, body: { code: 'x' } });
      await expect(client.list()).rejects.toMatchObject({ failure, reasonCode: null, field: null });
    }
    const invalid = scripted({ status: 400, body: { code: 'invalid_request', reasonCode: 'text_violation', field: 'note' } });
    const error = await invalid.client.start(REQUEST).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TwinHuddleError);
    expect(error).toMatchObject({ failure: 'invalid', reasonCode: 'text_violation', field: 'note' });
    const offline = scripted(new Error('offline'), { status: 200, body: { items: 'nope' } });
    await expect(offline.client.list()).rejects.toMatchObject({ failure: 'unavailable' });
    await expect(offline.client.list()).rejects.toMatchObject({ failure: 'unreadable' });
  });

  it('has Chinese and English words for every failure and refusal', () => {
    const copies = [...Object.values(TWIN_HUDDLE_FAILURE_COPY), ...TWIN_HUDDLE_REFUSAL_CODES_V0.map((code) => TWIN_HUDDLE_REFUSAL_COPY[code])];
    expect(copies).toHaveLength(8 + TWIN_HUDDLE_REFUSAL_CODES_V0.length);
    for (const copy of copies) {
      expect(copy.en.length).toBeGreaterThan(0);
      expect(copy.zh).toMatch(CJK);
    }
  });
});
