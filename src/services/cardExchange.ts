/**
 * Card exchange on the phone (L8 R6, `shared/types/card-exchange.ts`): make a one-time code, show it as a QR code
 * (TwinQrScreen), and confirm once the other person has scanned and you have seen who they are. The other person scans
 * with any camera: the code is in a web link (`/exchange#<code>`), which signs them in on the web and asks them to
 * confirm there. Only in builds with `EXPO_PUBLIC_CARD_EXCHANGE=1` and `EXPO_PUBLIC_RELATIONSHIP_BOOK=1`; the routes
 * answer 404 while the server switches are off. No React Native import: the transport and token are injected
 * (cardExchangeSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  CARD_EXCHANGE_PATH_V1,
  CARD_EXCHANGE_REF_PATTERN_V1,
  cardExchangeLinkV1,
  cardExchangePathV1,
  decodeCardExchangeCreatedV1,
  decodeCardExchangeViewV1,
  isCardExchangeClientEnabledV1,
  type CardExchangeCreateInputV1,
  type CardExchangeViewV1,
} from '../../shared/types/card-exchange';
import { isRelationshipBookClientEnabledV1 } from '../../shared/types/relationship-book';

// Read as literal member expressions so the Expo build inlines them.
export const CARD_EXCHANGE_ENABLED =
  isCardExchangeClientEnabledV1(process.env.EXPO_PUBLIC_CARD_EXCHANGE) && isRelationshipBookClientEnabledV1(process.env.EXPO_PUBLIC_RELATIONSHIP_BOOK);

export type CardExchangeFailure = 'no_session' | 'not_found' | 'not_allowed' | 'closed' | 'too_many' | 'unavailable' | 'unreadable';

export const CARD_EXCHANGE_FAILURE_COPY: Record<CardExchangeFailure, { en: string; zh: string }> = {
  no_session: { en: 'Sign in first.', zh: '请先登录。' },
  not_found: { en: 'Card exchange is not open yet, or this exchange has ended.', zh: '交换名片还没开放，或者这次交换已经结束。' },
  not_allowed: { en: 'Not allowed.', zh: '没有权限。' },
  closed: { en: 'This exchange is closed or has run out of time.', zh: '这次交换已经关闭或超时。' },
  too_many: { en: 'Too many codes at once. Wait a few minutes.', zh: '同时开的码太多了，请等几分钟。' },
  unavailable: { en: 'Not available right now. Try again later.', zh: '现在用不了，请稍后再试。' },
  unreadable: { en: 'The answer could not be read.', zh: '读不出服务器的回答。' },
};

export class CardExchangeError extends Error {
  readonly failure: CardExchangeFailure;
  constructor(failure: CardExchangeFailure) {
    super(failure);
    this.name = 'CardExchangeError';
    this.failure = failure;
  }
}

export interface MobileCardExchangeClient {
  /** Makes a code. `link` is what the QR code carries. */
  create(origin: string, input: CardExchangeCreateInputV1): Promise<{ exchangeRef: string; link: string; expiresAt: string }>;
  get(exchangeRef: string): Promise<CardExchangeViewV1>;
  confirm(exchangeRef: string): Promise<CardExchangeViewV1>;
  cancel(exchangeRef: string): Promise<CardExchangeViewV1>;
}

function failureOf(status: number): CardExchangeFailure {
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 410) return 'closed';
  if (status === 429) return 'too_many';
  return 'unavailable';
}

export function createMobileCardExchangeClient(deps: { transport: HttpTransportV1; baseUrl: string; token: () => string | null | undefined }): MobileCardExchangeClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new CardExchangeError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'POST' ? { body: body ?? {} } : {}),
      });
    } catch {
      throw new CardExchangeError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new CardExchangeError(failureOf(response.status));
    return response.body;
  };
  const readView = (body: unknown, exchangeRef: string): CardExchangeViewV1 => {
    const view = decodeCardExchangeViewV1(body);
    if (!view || view.exchangeRef !== exchangeRef) throw new CardExchangeError('unreadable');
    return view;
  };
  const checked = (exchangeRef: string): string => {
    if (!CARD_EXCHANGE_REF_PATTERN_V1.test(exchangeRef)) throw new CardExchangeError('not_found');
    return exchangeRef;
  };
  return {
    async create(origin, input) {
      const created = decodeCardExchangeCreatedV1(await call('POST', CARD_EXCHANGE_PATH_V1, input));
      if (!created) throw new CardExchangeError('unreadable');
      return { exchangeRef: created.exchangeRef, link: cardExchangeLinkV1(origin, created.code), expiresAt: created.expiresAt };
    },
    async get(exchangeRef) {
      return readView(await call('GET', cardExchangePathV1(checked(exchangeRef))), exchangeRef);
    },
    async confirm(exchangeRef) {
      return readView(await call('POST', cardExchangePathV1(checked(exchangeRef), 'confirm')), exchangeRef);
    },
    async cancel(exchangeRef) {
      return readView(await call('POST', cardExchangePathV1(checked(exchangeRef), 'cancel')), exchangeRef);
    },
  };
}
