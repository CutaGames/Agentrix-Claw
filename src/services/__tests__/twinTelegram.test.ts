import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import { twinAskGuestLinkV0 } from '../../../shared/types/twin-ask';
import { twinHuddleGuestLinkV0 } from '../../../shared/types/twin-huddle';
import { TWIN_TELEGRAM_SCHEMA_VERSION_V0 } from '../../../shared/types/twin-telegram';
import { createMobileTwinTelegramClient, isTwinTelegramMobileEnabled, twinTelegramLinkOf, twinTelegramShareWords } from '../twinTelegram';

const BASE = 'https://api.example/api';
const CODE = 'AbCdEfGhIjKlMnOpQrSt_-';
const CJK = /[\u3400-\u9fff]/;

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
