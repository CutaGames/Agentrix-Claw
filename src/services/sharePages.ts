/**
 * L6-2 share pages on the phone (`shared/types/share-pages.ts`): the owner makes a quote, plan, notes or twin answer
 * into a link, shares it, and revokes it. Off unless EXPO_PUBLIC_SHARE_PAGES=1; while the server switch is off the routes
 * answer 404 and the card renders nothing. The public page itself stays on the web (`/s/<token>`).
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  SHARE_PAGE_TOKEN_PATTERN_V1,
  decodeSharePageCreateV1,
  decodeSharePagePublicViewV1,
  decodeSharePageStatsV1,
  type SharePageCreateV1,
  type SharePageKindV1,
  type SharePageOwnerViewV1,
  type SharePageStatsV1,
} from '../../shared/types/share-pages';

type Copy = { zh: string; en: string };

export function sharePagesEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const SHARE_PAGES_ENABLED = sharePagesEnabled(process.env.EXPO_PUBLIC_SHARE_PAGES);

export type SharePagesFailureV0 = 'closed' | 'invalid' | 'not_found' | 'no_session' | 'unreadable' | 'unavailable';

export class SharePagesError extends Error {
  readonly failure: SharePagesFailureV0;
  constructor(failure: SharePagesFailureV0) {
    super(failure);
    this.name = 'SharePagesError';
    this.failure = failure;
  }
}

function decodeOwnerView(value: unknown): SharePageOwnerViewV1 | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const pub = decodeSharePagePublicViewV1(r);
  const { shareId, token, status, replyCount, createdAt, expiresAt } = r;
  if (!pub || typeof shareId !== 'string' || typeof token !== 'string' || !SHARE_PAGE_TOKEN_PATTERN_V1.test(token)) return null;
  if ((status !== 'active' && status !== 'revoked') || typeof replyCount !== 'number' || !Number.isInteger(replyCount) || typeof createdAt !== 'string') return null;
  if (expiresAt !== null && typeof expiresAt !== 'string') return null;
  // L6-2 v1 counts: present only while the server's attribution switch is on; an unreadable count only hides the line.
  const stats = r.stats === undefined || r.stats === null ? null : decodeSharePageStatsV1(r.stats);
  return { ...pub, shareId, token, status, expiresAt: expiresAt as string | null, createdAt, replyCount, stats };
}

/** The owner's line under a share page (L6-2 v1, same words as the web). */
export function sharePageStatsCopy(stats: SharePageStatsV1): Copy {
  return {
    zh: `近 ${stats.windowDays} 天：打开 ${stats.opens} 次 · 点了预约 ${stats.bookingClicks} 次 · 经这页注册 ${stats.signups} 人`,
    en: `Last ${stats.windowDays} days: opened ${stats.opens} · booking clicks ${stats.bookingClicks} · sign-ups ${stats.signups}`,
  };
}

function failureOf(response: HttpResponseV1, isRevoke: boolean): SharePagesFailureV0 {
  if (response.status === 404) return isRevoke ? 'not_found' : 'closed';
  if (response.status === 400) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileSharePagesClientV0 {
  mine(): Promise<SharePageOwnerViewV1[]>;
  create(input: SharePageCreateV1): Promise<SharePageOwnerViewV1>;
  revoke(shareId: string): Promise<SharePageOwnerViewV1>;
}

export function createMobileSharePagesClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileSharePagesClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const send = async <T>(method: 'GET' | 'POST', path: string, decode: (b: unknown) => T | null, body?: unknown, isRevoke = false): Promise<T> => {
    const token = deps.token();
    if (!token) throw new SharePagesError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new SharePagesError('unavailable');
    }
    if (response.status !== 200 && response.status !== 201) throw new SharePagesError(failureOf(response, isRevoke));
    const value = decode(response.body);
    if (value === null) throw new SharePagesError('unreadable');
    return value;
  };
  return {
    mine: () =>
      send('GET', '/share-pages', (body) => {
        if (!Array.isArray(body)) return null;
        const pages = body.map(decodeOwnerView);
        return pages.every((page): page is SharePageOwnerViewV1 => page !== null) ? pages : null;
      }),
    create: async (input) => {
      const checked = decodeSharePageCreateV1(input);
      if (!checked) throw new SharePagesError('invalid');
      return send('POST', '/share-pages', decodeOwnerView, checked);
    },
    revoke: async (shareId) => {
      if (typeof shareId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(shareId)) throw new SharePagesError('not_found');
      return send('POST', `/share-pages/${encodeURIComponent(shareId)}/revoke`, decodeOwnerView, undefined, true);
    },
  };
}

/** The public page on the web; the phone only shares the link. */
export function sharePagePublicLink(token: string): string {
  return `https://agentrix.top/s/${encodeURIComponent(token)}`;
}

export const SHARE_PAGE_KIND_COPY: Readonly<Record<SharePageKindV1, Copy>> = {
  quote: { zh: '报价单', en: 'Quote' },
  plan: { zh: '方案', en: 'Plan' },
  notes: { zh: '会议纪要', en: 'Meeting notes' },
  twin_answer: { zh: '分身回答', en: 'Twin answer' },
};

export const SHARE_PAGES_FAILURE_COPY: Readonly<Record<SharePagesFailureV0, Copy>> = {
  closed: { zh: '共享页还没开放。', en: 'Share pages are not open yet.' },
  invalid: { zh: '没生成成功：标题、正文要填，预约链接只能是本站地址。', en: 'Not created: title and body are required; the booking link must be on this site.' },
  not_found: { zh: '这个链接已经不存在了。', en: 'This link no longer exists.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到共享页。', en: 'Share pages are unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
