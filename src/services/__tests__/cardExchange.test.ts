/**
 * L9 P1-9 on the phone (C1 review L-3): the phone reads card exchanges with the same shared decoder as the web and the
 * server (`shared/types/card-exchange.ts`). A "join the circle" view keeps `circle: true`, an ordinary view reads exactly
 * as before (no `circle` key), any other `circle` value is unreadable, and the body the phone sends to make a code is
 * what it sends today (the phone has no circle choice).
 */
import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { CardExchangeError, createMobileCardExchangeClient } from '../cardExchange';
const BASE = 'https://api.example.test/api';
const REF = `cx_${'a'.repeat(32)}`;
const CODE = 'b'.repeat(32);
const EXPIRES = '2026-10-31T12:05:00.000Z';
const VIEW = {
  exchangeRef: REF,
  role: 'initiator',
  state: 'claimed',
  counterpartName: 'Mei',
  counterpartPresent: true,
  metNote: 'Tuition meetup',
  eventTag: null,
  youConfirmed: false,
  theyConfirmed: false,
  recorded: false,
  expiresAt: EXPIRES,
};
function transport(body: unknown, status = 200): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      return { status, headers: {}, body };
    },
  };
}
const clientOver = (t: HttpTransportV1) => createMobileCardExchangeClient({ transport: t, baseUrl: BASE, token: () => 'tok' });
describe('mobile card exchange client with the L9 circle field', () => {
  it('an ordinary exchange reads exactly as before: no circle key', async () => {
    const view = await clientOver(transport({ data: VIEW })).get(REF);
    expect(view).toEqual(VIEW);
    expect('circle' in view).toBe(false);
  });
  it('a "join the circle" view keeps circle: true', async () => {
    const view = await clientOver(transport({ ...VIEW, circle: true })).confirm(REF);
    expect(view).toEqual({ ...VIEW, circle: true });
  });
  it.each([false, 'yes', 1, null])('circle %p is unreadable, not taken as an ordinary exchange', async (circle) => {
    const failure = await clientOver(transport({ ...VIEW, circle }))
      .get(REF)
      .then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(CardExchangeError);
    expect((failure as CardExchangeError).failure).toBe('unreadable');
  });
  it('making a code sends the same body as today (no circle field) and links the code in the fragment', async () => {
    const t = transport({ exchangeRef: REF, code: CODE, expiresAt: EXPIRES });
    const created = await clientOver(t).create('https://www.example.test/', { displayName: 'Mei', metNote: 'Tuition meetup' });
    expect(created).toEqual({ exchangeRef: REF, link: `https://www.example.test/exchange#${CODE}`, expiresAt: EXPIRES });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe('POST');
    expect(t.calls[0].path).toBe(`${BASE}/card-exchange`);
    expect(t.calls[0].body).toEqual({ displayName: 'Mei', metNote: 'Tuition meetup' });
  });
});
