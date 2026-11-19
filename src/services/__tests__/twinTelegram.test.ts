import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { twinAskGuestLinkV0 } from '../../../shared/types/twin-ask';
import { twinHuddleGuestLinkV0 } from '../../../shared/types/twin-huddle';
import { TWIN_TELEGRAM_SCHEMA_VERSION_V0 } from '../../../shared/types/twin-telegram';
import {
  TWIN_TELEGRAM_GROUP_OPEN_FAILED_WORDS,
  createMobileTwinTelegramClient,
  isTwinTelegramGroupMobileEnabled,
  isTwinTelegramMobileEnabled,
  twinTelegramGroupFailureOf,
  twinTelegramGroupFailureWords,
  twinTelegramGroupPanel,
  twinTelegramLinkOf,
  twinTelegramShareWords,
} from '../twinTelegram';

const BASE = 'https://api.example/api';
const CODE = 'AbCdEfGhIjKlMnOpQrSt_-';
const CJK = /[\u3400-\u9fff]/;
const HUDDLE = '0b9f6f0e-6d0c-4c55-9f43-0d2a4f2f8a11';
const GROUP_PATH = `${BASE}/twin-telegram/huddles/${HUDDLE}/group`;
const GROUP_TOKEN = 'Zy_Xw-VuTsRqPoNmLkJiHg';

function scripted(...responses: ({ status: number; body?: unknown } | Error)[]) {
  const requests: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    async request(request) {
      requests.push(request);
      const next = responses.shift();
      if (!next) throw new Error('no scripted response');
      if (next instanceof Error) throw next;
      return { status: next.status, headers: {}, body: next.body };
    },
  };
  return { transport, requests };
}

const client = (transport: HttpTransportV1, token: string | null = 'tok') => createMobileTwinTelegramClient({ transport, baseUrl: `${BASE}/`, token: () => token });

describe('twin telegram: the bot name', () => {
  it('asks the server once, signed in, and returns the name', async () => {
    const s = scripted({ status: 200, body: { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, botName: 'agentrix_bot' } });
    await expect(client(s.transport).botName()).resolves.toBe('agentrix_bot');
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].method).toBe('GET');
    expect(s.requests[0].path).toBe(`${BASE}/twin-telegram/link-base`);
    expect(s.requests[0].headers?.Authorization).toBe('Bearer tok');
  });

  it('is null, never an error, when Telegram links are not offered', async () => {
    for (const response of [{ status: 404 }, { status: 403 }, { status: 500 }, { status: 200, body: { botName: 'agentrix_bot' } }, { status: 200, body: { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, botName: 'bad name' } }, new Error('offline')]) {
      await expect(client(scripted(response).transport).botName()).resolves.toBeNull();
    }
    const signedOut = scripted();
    await expect(client(signedOut.transport, null).botName()).resolves.toBeNull();
    expect(signedOut.requests).toHaveLength(0);
  });
});

describe('twin telegram: links and words', () => {
  it('only an exact 1 turns the build switch on', () => {
    expect(isTwinTelegramMobileEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', ' 1']) expect(isTwinTelegramMobileEnabled(value)).toBe(false);
  });

  it('turns a personal web link into a Telegram link of the same kind', () => {
    expect(twinTelegramLinkOf('agentrix_bot', 'ask', twinAskGuestLinkV0('https://app.example', CODE))).toBe(`https://t.me/agentrix_bot?start=a_${CODE}`);
    expect(twinTelegramLinkOf('agentrix_bot', 'huddle', twinHuddleGuestLinkV0('https://app.example', CODE))).toBe(`https://t.me/agentrix_bot?start=h_${CODE}`);
  });

  it('gives no link without a bot name, without a link, or for a link that carries no code', () => {
    const url = twinAskGuestLinkV0('https://app.example', CODE);
    expect(twinTelegramLinkOf(null, 'ask', url)).toBeNull();
    expect(twinTelegramLinkOf(undefined, 'ask', url)).toBeNull();
    expect(twinTelegramLinkOf('bad name', 'ask', url)).toBeNull();
    expect(twinTelegramLinkOf('agentrix_bot', 'ask', null)).toBeNull();
    expect(twinTelegramLinkOf('agentrix_bot', 'ask', 'https://app.example/ask')).toBeNull();
  });

  it('the forwarded words carry the link and say Telegram, in both languages', () => {
    const link = `https://t.me/agentrix_bot?start=a_${CODE}`;
    for (const kind of ['ask', 'huddle'] as const) {
      const words = twinTelegramShareWords(kind, link);
      expect(words.en).toContain(link);
      expect(words.zh).toContain(link);
      expect(words.en).toContain('Telegram');
      expect(words.zh).toContain('Telegram');
      expect(CJK.test(words.zh)).toBe(true);
      expect(CJK.test(words.en)).toBe(false);
    }
    expect(twinTelegramShareWords('ask', link).zh).not.toBe(twinTelegramShareWords('huddle', link).zh);
  });
});

describe('twin telegram group: the build switch', () => {
  it('needs both switches, each an exact 1', () => {
    expect(isTwinTelegramGroupMobileEnabled('1', '1')).toBe(true);
    for (const [telegram, group] of [
      ['1', undefined],
      [undefined, '1'],
      ['1', '0'],
      ['0', '1'],
      ['1', 'true'],
      ['1', ' 1'],
      [undefined, undefined],
    ] as const) {
      expect(isTwinTelegramGroupMobileEnabled(telegram, group)).toBe(false);
    }
  });
});

describe('twin telegram group: where a plan stands', () => {
  it('asks for this plan, signed in, and returns the state', async () => {
    for (const state of ['none', 'waiting', 'posted'] as const) {
      const s = scripted({ status: 200, body: { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, state } });
      await expect(client(s.transport).groupState(HUDDLE)).resolves.toBe(state);
      expect(s.requests).toHaveLength(1);
      expect(s.requests[0].method).toBe('GET');
      expect(s.requests[0].path).toBe(GROUP_PATH);
      expect(s.requests[0].headers?.Authorization).toBe('Bearer tok');
      expect(s.requests[0].body).toBeUndefined();
    }
  });

  it('is null, never an error, when groups are not offered or the answer cannot be read', async () => {
    for (const response of [
      { status: 404 },
      { status: 403 },
      { status: 500 },
      { status: 200, body: { state: 'posted' } },
      { status: 200, body: { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, state: 'gone' } },
      { status: 200, body: null },
      new Error('offline'),
    ]) {
      await expect(client(scripted(response).transport).groupState(HUDDLE)).resolves.toBeNull();
    }
    const signedOut = scripted();
    await expect(client(signedOut.transport, null).groupState(HUDDLE)).resolves.toBeNull();
    expect(signedOut.requests).toHaveLength(0);
  });

  it('escapes the plan id in the address', async () => {
    const s = scripted({ status: 404 });
    await client(s.transport).groupState('a/b?c');
    expect(s.requests[0].path).toBe(`${BASE}/twin-telegram/huddles/a%2Fb%3Fc/group`);
  });
});

describe('twin telegram group: posting', () => {
  const issued = { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, state: 'waiting', botName: 'agentrix_bot', token: GROUP_TOKEN };

  it('turns the code into the link that adds the bot to a group', async () => {
    const s = scripted({ status: 200, body: issued });
    await expect(client(s.transport).groupIssue(HUDDLE)).resolves.toEqual({ ok: true, url: `https://t.me/agentrix_bot?startgroup=g_${GROUP_TOKEN}` });
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].method).toBe('POST');
    expect(s.requests[0].path).toBe(GROUP_PATH);
    expect(s.requests[0].headers?.Authorization).toBe('Bearer tok');
  });

  it('says why when the server refuses', async () => {
    await expect(client(scripted({ status: 409 }).transport).groupIssue(HUDDLE)).resolves.toEqual({ ok: false, failure: 'changed' });
    await expect(client(scripted({ status: 429 }).transport).groupIssue(HUDDLE)).resolves.toEqual({ ok: false, failure: 'too_many' });
    for (const status of [401, 403, 404, 500]) {
      await expect(client(scripted({ status }).transport).groupIssue(HUDDLE)).resolves.toEqual({ ok: false, failure: 'unavailable' });
    }
  });

  it('gives no link for an answer it cannot read, a lost connection, or a signed-out phone', async () => {
    for (const response of [
      { status: 200, body: { ...issued, token: 'short' } },
      { status: 200, body: { ...issued, botName: 'bad name' } },
      { status: 200, body: { ...issued, state: 'posted' } },
      { status: 200, body: { ...issued, schemaVersion: 'other' } },
      { status: 200 },
      new Error('offline'),
    ]) {
      await expect(client(scripted(response).transport).groupIssue(HUDDLE)).resolves.toEqual({ ok: false, failure: 'unavailable' });
    }
    const signedOut = scripted();
    await expect(client(signedOut.transport, null).groupIssue(HUDDLE)).resolves.toEqual({ ok: false, failure: 'unavailable' });
    expect(signedOut.requests).toHaveLength(0);
  });
});

describe('twin telegram group: taking it down', () => {
  it('deletes at the same address and is done once the server says nothing is posted', async () => {
    const s = scripted({ status: 200, body: { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, state: 'none' } });
    await expect(client(s.transport).groupRevoke(HUDDLE)).resolves.toEqual({ ok: true });
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0].method).toBe('DELETE');
    expect(s.requests[0].path).toBe(GROUP_PATH);
    expect(s.requests[0].headers?.Authorization).toBe('Bearer tok');
  });

  it('is not done when the server refuses, says something else, or cannot be reached', async () => {
    await expect(client(scripted({ status: 429 }).transport).groupRevoke(HUDDLE)).resolves.toEqual({ ok: false, failure: 'too_many' });
    await expect(client(scripted({ status: 409 }).transport).groupRevoke(HUDDLE)).resolves.toEqual({ ok: false, failure: 'changed' });
    for (const response of [
      { status: 404 },
      { status: 500 },
      { status: 200, body: { schemaVersion: TWIN_TELEGRAM_SCHEMA_VERSION_V0, state: 'posted' } },
      { status: 200 },
      new Error('offline'),
    ]) {
      await expect(client(scripted(response).transport).groupRevoke(HUDDLE)).resolves.toEqual({ ok: false, failure: 'unavailable' });
    }
    const signedOut = scripted();
    await expect(client(signedOut.transport, null).groupRevoke(HUDDLE)).resolves.toEqual({ ok: false, failure: 'unavailable' });
    expect(signedOut.requests).toHaveLength(0);
  });
});

describe('twin telegram group: what the card shows', () => {
  const openPlan = { open: true, linkSeats: 2 };

  it('shows nothing until the server has answered, or when it does not offer groups', () => {
    expect(twinTelegramGroupPanel(undefined, openPlan)).toBeNull();
    expect(twinTelegramGroupPanel(null, openPlan)).toBeNull();
  });

  it('offers posting only for an open plan with someone answering by link', () => {
    const panel = twinTelegramGroupPanel('none', openPlan);
    expect(panel?.post).not.toBeNull();
    expect(panel?.confirmPost).toBeNull();
    expect(panel?.canRevoke).toBe(false);
    expect(twinTelegramGroupPanel('none', { open: false, linkSeats: 2 })).toBeNull();
    expect(twinTelegramGroupPanel('none', { open: true, linkSeats: 0 })).toBeNull();
  });

  it('says up front that the group only hears counts and that answers are unverified', () => {
    const words = twinTelegramGroupPanel('none', openPlan)?.words;
    expect(words?.en).toContain('unverified');
    expect(words?.en).toContain('how many answered');
    expect(CJK.test(words?.zh ?? '')).toBe(true);
    expect(CJK.test(words?.en ?? '')).toBe(false);
  });

  it('while waiting for a group: can open Telegram again without a warning, and can take it down', () => {
    const panel = twinTelegramGroupPanel('waiting', openPlan);
    expect(panel?.post).not.toBeNull();
    expect(panel?.confirmPost).toBeNull();
    expect(panel?.canRevoke).toBe(true);
  });

  it('once posted: moving to another group warns that the current roster stops working', () => {
    const panel = twinTelegramGroupPanel('posted', openPlan);
    expect(panel?.post).not.toBeNull();
    expect(panel?.confirmPost).not.toBeNull();
    expect(panel?.canRevoke).toBe(true);
    expect(panel?.words.zh).not.toBe(twinTelegramGroupPanel('waiting', openPlan)?.words.zh);
  });

  it('a roster still standing on a plan that cannot be posted any more can only be taken down', () => {
    for (const state of ['waiting', 'posted'] as const) {
      for (const plan of [{ open: false, linkSeats: 2 }, { open: true, linkSeats: 0 }]) {
        const panel = twinTelegramGroupPanel(state, plan);
        expect(panel?.post).toBeNull();
        expect(panel?.confirmPost).toBeNull();
        expect(panel?.canRevoke).toBe(true);
      }
    }
  });

  it('every panel and every failure has words in both languages', () => {
    const all = (['none', 'waiting', 'posted'] as const).flatMap((state) => {
      const panel = twinTelegramGroupPanel(state, openPlan);
      return panel ? [panel.words, panel.post, panel.confirmPost] : [];
    });
    for (const failure of ['changed', 'too_many', 'unavailable'] as const) all.push(twinTelegramGroupFailureWords(failure));
    all.push(TWIN_TELEGRAM_GROUP_OPEN_FAILED_WORDS);
    const words = all.filter((item): item is { en: string; zh: string } => item !== null);
    expect(words.length).toBeGreaterThanOrEqual(8);
    for (const item of words) {
      expect(CJK.test(item.zh)).toBe(true);
      expect(CJK.test(item.en)).toBe(false);
      expect(item.en.length).toBeGreaterThan(0);
    }
    expect(new Set((['changed', 'too_many', 'unavailable'] as const).map((failure) => twinTelegramGroupFailureWords(failure).zh)).size).toBe(3);
  });

  it('maps refusals: 409 and 410 changed, 429 too many, the rest unavailable', () => {
    expect(twinTelegramGroupFailureOf(409)).toBe('changed');
    expect(twinTelegramGroupFailureOf(410)).toBe('changed');
    expect(twinTelegramGroupFailureOf(429)).toBe('too_many');
    for (const status of [400, 401, 403, 404, 500, 503]) expect(twinTelegramGroupFailureOf(status)).toBe('unavailable');
  });
});
