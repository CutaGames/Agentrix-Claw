import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { TWIN_FIND_SCHEMA_VERSION_V0 } from '../../../shared/types/twin-find';
import {
  TWIN_FIND_CARD_BLANK_V0,
  TWIN_FIND_CARD_CHOICE_ITEMS_V0,
  TWIN_FIND_CARD_ITEMS_V0,
  TWIN_FIND_CARD_LIMITS_V0,
  TWIN_FIND_CARD_MOBILE_FLAG_V0,
  type TwinFindCardV0,
} from '../../../shared/types/twin-find-card';
import { TWIN_FIND_CARD_ENABLED, TwinFindError, createMobileTwinFindClient } from '../twinFind';
import {
  TWIN_FIND_CARD_ACCEPT_WORDS,
  TWIN_FIND_CARD_CITY_PLACEHOLDER_WORDS,
  TWIN_FIND_CARD_CLEARED_WORDS,
  TWIN_FIND_CARD_CLEAR_WORDS,
  TWIN_FIND_CARD_NOTICE_WORDS,
  TWIN_FIND_CARD_SAME_CITY_WORDS,
  TWIN_FIND_CARD_SAVED_WORDS,
  TWIN_FIND_CARD_SAVE_WORDS,
  TWIN_FIND_CARD_SELF_WORDS,
  TWIN_FIND_CARD_TITLE_WORDS,
  twinFindCardFailureWords,
  twinFindCardFormBlank,
  twinFindCardFormOf,
  twinFindCardFromForm,
  twinFindCardItemWords,
  twinFindCardOptionWords,
  twinFindCardOptions,
  twinFindCardProblemWords,
  twinFindCardWithAccept,
  twinFindCardWithSelf,
} from '../twinFindCardView';
import { twinFindBridgeStateWords, type TwinFindWords } from '../twinFindView';

const BASE = 'https://api.example/api';
const CJK = /[\u3400-\u9fff]/;
const V = TWIN_FIND_SCHEMA_VERSION_V0;
const cardOf = (over: Partial<TwinFindCardV0> = {}): TwinFindCardV0 => ({ ...TWIN_FIND_CARD_BLANK_V0, ...over });
const NO_SMOKERS = cardOf({ smoking: { self: 'no', accept: ['no'] } });

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
  const client = createMobileTwinFindClient({ transport, baseUrl: `${BASE}/`, webOrigin: 'https://web.example/', token: () => 'tok' });
  return { calls, client };
}

const sent = (calls: HttpRequestV1[]) => calls.map((call) => [call.method, call.path.slice(BASE.length), call.body]);

async function failureOf(promise: Promise<unknown>): Promise<TwinFindError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TwinFindError) return error;
    throw error;
  }
  throw new Error('expected a TwinFindError');
}

function bilingual(words: TwinFindWords): void {
  expect(words.en.trim()).not.toBe('');
  expect(words.en).not.toMatch(CJK);
  expect(words.zh).toMatch(CJK);
}

describe('the condition card on the phone: the switch and the requests', () => {
  it('is off unless the build says so, and reads its own build switch as a literal so Expo inlines it', () => {
    expect(TWIN_FIND_CARD_ENABLED).toBe(false);
    expect(TWIN_FIND_CARD_MOBILE_FLAG_V0).toBe('EXPO_PUBLIC_TWIN_FIND_CARD');
    const source = readFileSync(join(__dirname, '..', 'twinFind.ts'), 'utf8');
    expect(source).toContain('TWIN_FIND_DATING_ENABLED && isTwinFindMobileEnabled(process.env.EXPO_PUBLIC_TWIN_FIND_CARD)');
  });

  it("reads and saves only the caller's own card, and clears it with null", async () => {
    const { calls, client } = scripted(
      { status: 200, body: { schemaVersion: V, card: null } },
      { status: 200, body: { data: { schemaVersion: V, card: NO_SMOKERS } } },
      { status: 200, body: { schemaVersion: V, card: null } },
    );
    expect(await client.card()).toBeNull();
    expect(await client.setCard(NO_SMOKERS)).toEqual(NO_SMOKERS);
    expect(await client.setCard(null)).toBeNull();
    expect(sent(calls)).toEqual([
      ['GET', '/twin-find/card', undefined],
      ['PUT', '/twin-find/card', { card: NO_SMOKERS }],
      ['PUT', '/twin-find/card', { card: null }],
    ]);
    expect(calls.map((call) => call.headers?.Authorization)).toEqual(['Bearer tok', 'Bearer tok', 'Bearer tok']);
  });

  it('names what went wrong: not open yet, a refused part, and an answer that does not fit what was sent', async () => {
    const { client } = scripted(
      { status: 404, body: { message: 'Not Found' } },
      { status: 400, body: { code: 'invalid_request', reasonCode: 'missing_field', field: 'card.city.self' } },
      { status: 200, body: { schemaVersion: V, card: null } },
      { status: 200, body: { schemaVersion: V, card: { ...NO_SMOKERS, smoking: { self: 'often', accept: null } } } },
    );
    const closed = await failureOf(client.setCard(NO_SMOKERS));
    expect(closed.failure).toBe('not_found');
    expect(twinFindCardFailureWords(closed)).toEqual({ en: 'This is not open yet.', zh: '这一项还没开放。' });
    const refused = await failureOf(client.setCard(NO_SMOKERS));
    expect([refused.failure, refused.reasonCode, refused.field]).toEqual(['invalid', 'missing_field', 'card.city.self']);
    expect(twinFindCardFailureWords(refused)).toEqual(twinFindCardProblemWords('missing_field', 'card.city.self'));
    // Saved a card and the answer says there is none: not trusted.
    expect((await failureOf(client.setCard(NO_SMOKERS))).failure).toBe('unreadable');
    // A card the shared decoder refuses is never shown.
    expect((await failureOf(client.card())).failure).toBe('unreadable');
  });
});

describe('the condition card on the phone: the form', () => {
  it('starts empty, and an empty form clears the card instead of saving an empty one', () => {
    const form = twinFindCardFormOf(null);
    expect(form).toEqual({
      city: '',
      sameCity: false,
      choices: {
        age: { self: null, accept: [] },
        kids: { self: null, accept: [] },
        smoking: { self: null, accept: [] },
        diet: { self: null, accept: [] },
        schedule: { self: null, accept: [] },
      },
    });
    expect(twinFindCardFormBlank(form)).toBe(true);
    expect(twinFindCardFromForm(form)).toEqual({ ok: true, value: null });
    expect(twinFindCardFromForm({ ...form, city: '   ' })).toEqual({ ok: true, value: null });
  });

  it('turns the form into the card the server keeps, and the card back into the same form', () => {
    let form = { ...twinFindCardFormOf(null), city: ' 上海 ', sameCity: true };
    form = twinFindCardWithSelf(form, 'smoking', 'no');
    form = twinFindCardWithAccept(form, 'kids', 'unsure');
    form = twinFindCardWithAccept(form, 'kids', 'want');
    const expected = cardOf({ city: { self: '上海', accept: 'same' }, smoking: { self: 'no', accept: null }, kids: { self: null, accept: ['want', 'unsure'] } });
    expect(twinFindCardFromForm(form)).toEqual({ ok: true, value: expected });
    expect(twinFindCardFormOf(expected)).toEqual({ ...form, city: '上海' });
  });

  it('tapping a chosen option again takes it back; what someone accepts keeps the order of the options', () => {
    let form = twinFindCardFormOf(null);
    form = twinFindCardWithSelf(form, 'age', '30_34');
    expect(form.choices.age.self).toBe('30_34');
    form = twinFindCardWithSelf(form, 'age', '35_39');
    expect(form.choices.age.self).toBe('35_39');
    form = twinFindCardWithSelf(form, 'age', '35_39');
    expect(form.choices.age.self).toBeNull();
    form = twinFindCardWithAccept(form, 'diet', 'halal');
    form = twinFindCardWithAccept(form, 'diet', 'none');
    expect(form.choices.diet.accept).toEqual(['none', 'halal']);
    form = twinFindCardWithAccept(form, 'diet', 'halal');
    expect(form.choices.diet.accept).toEqual(['none']);
    expect(twinFindCardFormBlank(form)).toBe(false);
    expect(twinFindCardFromForm(form)).toEqual({ ok: true, value: cardOf({ diet: { self: null, accept: ['none'] } }) });
  });

  it('refuses on the phone what the server would refuse, and says what to fix about the city', () => {
    const form = { ...twinFindCardFormOf(null), sameCity: true };
    expect(twinFindCardFromForm(form)).toEqual({ ok: false, reasonCode: 'missing_field', field: 'card.city.self' });
    const long = { ...form, city: '城'.repeat(TWIN_FIND_CARD_LIMITS_V0.cityMax + 1) };
    expect(twinFindCardFromForm(long)).toEqual({ ok: false, reasonCode: 'too_long', field: 'card.city.self' });
    expect(twinFindCardFromForm({ ...form, city: '13800138000' })).toEqual({ ok: false, reasonCode: 'text_violation', field: 'card.city.self' });

    const sentences = [
      twinFindCardProblemWords('missing_field', 'card.city.self'),
      twinFindCardProblemWords('too_long', 'card.city.self'),
      twinFindCardProblemWords('text_violation', 'card.city.self'),
      twinFindCardProblemWords('invalid_value', 'card.city.self'),
      twinFindCardProblemWords('invalid_value', 'card.kids.accept'),
    ];
    for (const words of sentences) bilingual(words);
    expect(new Set(sentences.map((words) => words.zh)).size).toBe(sentences.length);
    expect(sentences[1].zh).toContain(String(TWIN_FIND_CARD_LIMITS_V0.cityMax));
  });
});

describe('the condition card on the phone: the words', () => {
  it('says everything in both languages, and the notice tells the person nobody sees the card', () => {
    const fixed = [
      TWIN_FIND_CARD_TITLE_WORDS,
      TWIN_FIND_CARD_NOTICE_WORDS,
      TWIN_FIND_CARD_SELF_WORDS,
      TWIN_FIND_CARD_ACCEPT_WORDS,
      TWIN_FIND_CARD_CITY_PLACEHOLDER_WORDS,
      TWIN_FIND_CARD_SAME_CITY_WORDS,
      TWIN_FIND_CARD_SAVE_WORDS,
      TWIN_FIND_CARD_CLEAR_WORDS,
      TWIN_FIND_CARD_SAVED_WORDS,
      TWIN_FIND_CARD_CLEARED_WORDS,
    ];
    for (const words of fixed) bilingual(words);
    for (const item of TWIN_FIND_CARD_ITEMS_V0) bilingual(twinFindCardItemWords(item));
    for (const item of TWIN_FIND_CARD_CHOICE_ITEMS_V0) {
      const options = twinFindCardOptions(item);
      for (const option of options) bilingual(twinFindCardOptionWords(item, option));
      expect(new Set(options.map((option) => twinFindCardOptionWords(item, option).zh)).size).toBe(options.length);
    }
    expect(TWIN_FIND_CARD_NOTICE_WORDS.zh).toContain('谁都看不到');
    expect(TWIN_FIND_CARD_NOTICE_WORDS.zh).toContain('不知道是哪一项');
  });

  it('tells the friend the cards did not match and that they can pick again, never which part', () => {
    const words = twinFindBridgeStateWords('mismatched', 'open');
    bilingual(words);
    expect(words.zh).toContain('可以换一位');
    expect(words).not.toEqual(twinFindBridgeStateWords('asked', 'open'));
    for (const item of TWIN_FIND_CARD_ITEMS_V0) expect(words.zh).not.toContain(twinFindCardItemWords(item).zh);
  });
});
