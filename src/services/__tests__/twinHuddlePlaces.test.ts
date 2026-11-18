import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  TWIN_HUDDLE_PLACES_LIMITS_V0,
  TWIN_HUDDLE_PLACES_SCHEMA_VERSION_V0,
  TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0,
  type TwinHuddlePlaceV0,
  type TwinHuddlePlacesViewV0,
} from '../../../shared/types/twin-huddle-places';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from '../twinHuddle';
import {
  TWIN_HUDDLE_PLACE_CONFLICT_COPY,
  TwinHuddlePlaceError,
  createMobileTwinHuddlePlacesClient,
  twinHuddlePlaceByWords,
  twinHuddlePlaceConflictOf,
  twinHuddlePlaceFailureWords,
  twinHuddlePlaceLabelProblem,
  twinHuddlePlaceOkWords,
  twinHuddlePlacePicksToggled,
  twinHuddlePlacesHintWords,
} from '../twinHuddlePlaces';

const BASE = 'https://api.example/api';
const HUDDLE = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const OTHER_HUDDLE = '1c7a4d2f-3e5b-4a6c-9d0e-2f3a4b5c6d7e';
const HOTPOT = 'cccccccc-0000-4000-8000-000000000001';
const GRILL = 'cccccccc-0000-4000-8000-000000000002';
const CJK = /[\u3400-\u9fff]/;

const place = (overrides: Partial<TwinHuddlePlaceV0> = {}): TwinHuddlePlaceV0 => ({
  id: HOTPOT,
  label: '老地方火锅',
  by: 'me',
  byRef: null,
  okCount: 0,
  ok: false,
  chosen: false,
  canRemove: true,
  ...overrides,
});
const VIEW: TwinHuddlePlacesViewV0 = {
  schemaVersion: TWIN_HUDDLE_PLACES_SCHEMA_VERSION_V0,
  huddleId: HUDDLE,
  role: 'initiator',
  open: true,
  places: [place(), place({ id: GRILL, label: '湖边烧烤', by: 'friend', byRef: 'u:42', okCount: 2, canRemove: false })],
  canAdd: true,
  canPick: false,
  canChoose: true,
};

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
  const client = createMobileTwinHuddlePlacesClient({ transport, baseUrl: `${BASE}/`, token: () => 'tok' });
  return { calls, client };
}

const failure = async (run: Promise<unknown>): Promise<TwinHuddleError> => {
  try {
    await run;
  } catch (error) {
    if (error instanceof TwinHuddleError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
};

describe('places on a plan, on the phone: the client', () => {
  it('reads the places as a signed-in mobile request, bare or wrapped', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW }, { status: 200, body: { data: VIEW } });
    await expect(client.get(HUDDLE)).resolves.toEqual(VIEW);
    await expect(client.get(HUDDLE)).resolves.toEqual(VIEW);
    expect(calls[0]).toEqual({
      method: 'GET',
      path: `${BASE}/twin-huddle/${HUDDLE}/places`,
      headers: { Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' },
    });
  });

  it('sends each change to its own route and returns the view that comes back', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW }, { status: 200, body: VIEW }, { status: 200, body: VIEW }, { status: 200, body: VIEW }, { status: 200, body: VIEW });
    await expect(client.add(HUDDLE, '街角面馆')).resolves.toEqual(VIEW);
    await client.remove(HUDDLE, HOTPOT);
    await client.setPicks(HUDDLE, [HOTPOT, GRILL]);
    await client.choose(HUDDLE, GRILL);
    await client.choose(HUDDLE, null);
    expect(calls.map((call) => [call.method, call.path.slice(BASE.length), call.body])).toEqual([
      ['POST', `/twin-huddle/${HUDDLE}/places`, { label: '街角面馆' }],
      ['DELETE', `/twin-huddle/${HUDDLE}/places/${HOTPOT}`, undefined],
      ['PUT', `/twin-huddle/${HUDDLE}/places/picks`, { placeIds: [HOTPOT, GRILL] }],
      ['PUT', `/twin-huddle/${HUDDLE}/places/chosen`, { placeId: GRILL }],
      ['PUT', `/twin-huddle/${HUDDLE}/places/chosen`, { placeId: null }],
    ]);
    expect(calls[1]).not.toHaveProperty('body');
  });

  it('does not send an id that is not an id', async () => {
    const { calls, client } = scripted();
    expect((await failure(client.get('../profile'))).failure).toBe('not_found');
    expect((await failure(client.add('series', '街角面馆'))).failure).toBe('not_found');
    expect((await failure(client.remove(HUDDLE, 'picks'))).failure).toBe('not_found');
    expect(calls).toEqual([]);
  });

  it('needs a session', async () => {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        return { status: 200, headers: {}, body: VIEW };
      },
    };
    const client = createMobileTwinHuddlePlacesClient({ transport, baseUrl: BASE, token: () => null });
    expect((await failure(client.get(HUDDLE))).failure).toBe('no_session');
    expect(calls).toEqual([]);
  });

  it('tells which rule a 409 applied, and falls back to "things changed" when the server does not say', async () => {
    const { client } = scripted(
      ...TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0.map((code) => ({ status: 409, body: { code } })),
      { status: 409, body: { code: 'something_new' } },
      { status: 409 },
    );
    for (const code of TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0) {
      const error = await failure(client.add(HUDDLE, '街角面馆'));
      expect(error).toBeInstanceOf(TwinHuddlePlaceError);
      expect(error.failure).toBe('changed');
      expect(twinHuddlePlaceConflictOf(error)).toBe(code);
      expect(twinHuddlePlaceFailureWords(error)).toBe(TWIN_HUDDLE_PLACE_CONFLICT_COPY[code]);
    }
    for (let i = 0; i < 2; i += 1) {
      const error = await failure(client.add(HUDDLE, '街角面馆'));
      expect(twinHuddlePlaceConflictOf(error)).toBeNull();
      expect(twinHuddlePlaceFailureWords(error)).toBe(TWIN_HUDDLE_FAILURE_COPY.changed);
    }
  });

  it('maps the other failures like the plan client does, and never reads a code off them', async () => {
    const { client } = scripted(
      { status: 400, body: { code: 'invalid_request', reasonCode: 'text_violation', field: 'body.label' } },
      { status: 400, body: { code: 'invalid_request', reasonCode: 'too_long', field: 'body.label' } },
      { status: 400, body: { code: 'invalid_request', reasonCode: 'invalid_value', field: 'body.placeIds[0]' } },
      { status: 403, body: { code: 'place_limit' } },
      { status: 404 },
      { status: 429, body: { code: 'rate_limited' } },
      { status: 500 },
      new Error('offline'),
    );
    const rules = await failure(client.add(HUDDLE, 'x'));
    expect(rules).toMatchObject({ failure: 'invalid', reasonCode: 'text_violation', field: 'body.label' });
    expect(twinHuddlePlaceFailureWords(rules).zh).toContain('联系方式');
    const long = await failure(client.add(HUDDLE, 'x'));
    expect(twinHuddlePlaceFailureWords(long).zh).toContain(String(TWIN_HUDDLE_PLACES_LIMITS_V0.labelMax));
    const picks = await failure(client.setPicks(HUDDLE, [HOTPOT]));
    expect(twinHuddlePlaceFailureWords(picks)).toBe(TWIN_HUDDLE_FAILURE_COPY.invalid);
    const forbidden = await failure(client.choose(HUDDLE, HOTPOT));
    expect(forbidden.failure).toBe('not_allowed');
    expect(twinHuddlePlaceConflictOf(forbidden)).toBeNull();
    expect((await failure(client.get(HUDDLE))).failure).toBe('not_found');
    expect((await failure(client.get(HUDDLE))).failure).toBe('too_many');
    expect((await failure(client.get(HUDDLE))).failure).toBe('unavailable');
    expect((await failure(client.get(HUDDLE))).failure).toBe('unavailable');
    expect(twinHuddlePlaceFailureWords(new Error('boom'))).toBe(TWIN_HUDDLE_FAILURE_COPY.unavailable);
  });

  it('gives up on an answer it cannot read, or one about another plan', async () => {
    const { client } = scripted(
      { status: 200, body: { ...VIEW, huddleId: OTHER_HUDDLE } },
      { status: 200, body: { ...VIEW, places: [place({ chosen: true }), place({ id: GRILL, chosen: true })] } },
      { status: 200, body: { ok: true } },
      { status: 204 },
    );
    for (let i = 0; i < 4; i += 1) expect((await failure(client.get(HUDDLE))).failure).toBe('unreadable');
  });
});

describe('places on a plan, on the phone: the words', () => {
  it('has both languages for every conflict', () => {
    for (const code of TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0) {
      expect(TWIN_HUDDLE_PLACE_CONFLICT_COPY[code].en.length).toBeGreaterThan(0);
      expect(TWIN_HUDDLE_PLACE_CONFLICT_COPY[code].zh).toMatch(CJK);
      expect(TWIN_HUDDLE_PLACE_CONFLICT_COPY[code].en).not.toMatch(CJK);
    }
  });

  it('checks a name before it is sent, by the same rules as the server', () => {
    expect(twinHuddlePlaceLabelProblem('老地方火锅')).toBeNull();
    expect(twinHuddlePlaceLabelProblem('  老地方火锅  ')).toBeNull();
    expect(twinHuddlePlaceLabelProblem('')?.zh).toContain(String(TWIN_HUDDLE_PLACES_LIMITS_V0.labelMin));
    expect(twinHuddlePlaceLabelProblem('店')?.zh).toContain(String(TWIN_HUDDLE_PLACES_LIMITS_V0.labelMin));
    expect(twinHuddlePlaceLabelProblem('店'.repeat(31))?.zh).toContain(String(TWIN_HUDDLE_PLACES_LIMITS_V0.labelMax));
    for (const label of ['人均100元的店', '找我 13812345678', '幸福路12号楼', 'www.example.com']) {
      expect(twinHuddlePlaceLabelProblem(label)?.zh).toContain('门牌地址');
    }
  });

  it('says who added a place: the organizer sees which friend, an invited person does not', () => {
    const people = [{ ref: 'u:42', label: '老张', route: 'twin' as const }];
    expect(twinHuddlePlaceByWords({ by: 'me', byRef: null }).zh).toBe('我填的');
    expect(twinHuddlePlaceByWords({ by: 'initiator', byRef: null }).zh).toBe('发起人填的');
    expect(twinHuddlePlaceByWords({ by: 'friend', byRef: 'u:42' }, people)).toEqual({ en: 'Added by 老张', zh: '老张填的' });
    expect(twinHuddlePlaceByWords({ by: 'friend', byRef: 'u:7' }, people).zh).toBe('一位朋友填的');
    expect(twinHuddlePlaceByWords({ by: 'friend', byRef: null }).zh).toBe('一位朋友填的');
  });

  it('counts who can make it', () => {
    expect(twinHuddlePlaceOkWords(0)).toEqual({ en: 'Nobody has marked it yet', zh: '还没有人标' });
    expect(twinHuddlePlaceOkWords(1)).toEqual({ en: '1 person can make it', zh: '1 位可以' });
    expect(twinHuddlePlaceOkWords(3)).toEqual({ en: '3 people can make it', zh: '3 位可以' });
  });

  it('tells each side what to do while places are open, and how it ended once they are fixed', () => {
    expect(twinHuddlePlacesHintWords(VIEW).zh).toContain('先定地点，再选时间');
    expect(twinHuddlePlacesHintWords({ ...VIEW, role: 'invited' }).zh).toContain('由发起人来定');
    expect(twinHuddlePlacesHintWords({ ...VIEW, open: false }).zh).toBe('这次没有定地点。');
    const settled = { ...VIEW, open: false, places: [place({ chosen: true })] };
    expect(twinHuddlePlacesHintWords(settled)).toEqual({ en: 'The place is settled: 老地方火锅.', zh: '地点定了：老地方火锅。' });
    // While places are still open the organizer can still change their mind: the hint stays the instruction.
    expect(twinHuddlePlacesHintWords({ ...settled, open: true }).zh).toContain('先定地点');
  });

  it('toggles one mark and keeps the others', () => {
    const places = [
      { id: HOTPOT, ok: true },
      { id: GRILL, ok: false },
    ];
    expect(twinHuddlePlacePicksToggled(places, GRILL)).toEqual([HOTPOT, GRILL]);
    expect(twinHuddlePlacePicksToggled(places, HOTPOT)).toEqual([]);
    expect(twinHuddlePlacePicksToggled(places, 'unknown')).toEqual([HOTPOT]);
  });
});
