/**
 * L9 P2-7: the "take your business data with you" client, shared by web, phone and desktop
 * (`shared/types/account-export-business.ts`). Each surface injects its own `HttpTransportV1` and token, the way
 * `account-export.ts` does. No React, no platform import. The surface only turns the result into a file or a few lines.
 *
 * - `closed`: the server answered 404 (a switch is off there, or the owner is not on the L9 list); the surface shows nothing.
 * - `step_up_required`: 403 STEP_UP_REQUIRED, the owner has to sign in again first (signed in within 10 minutes).
 * - `rate_limited` / `busy`: one export at a time, 30 s apart, six an hour.
 * The owner is never sent: the server reads it from the login.
 */
import {
  BUSINESS_EXPORT_ROUTES_V1,
  businessExportFileNameV1,
  isBusinessExportCheckV1,
  isBusinessExportDocumentV1,
  type BusinessExportCheckV1,
  type BusinessExportV1,
} from '../types/account-export-business';
import { isRecentSignInRequiredErrorV1 } from '../types/auth-step-up';
import type { HttpTransportV1 } from './transport';

export type BusinessExportFailureV1 = 'closed' | 'no_session' | 'step_up_required' | 'rate_limited' | 'busy' | 'unreadable' | 'unavailable';

export type BusinessExportResultV1 =
  | { ok: true; value: BusinessExportV1; fileName: string; text: string }
  | { ok: false; failure: BusinessExportFailureV1; retryAfterSeconds?: number };

export type BusinessExportCheckResultV1 = { ok: true; value: BusinessExportCheckV1 } | { ok: false; failure: BusinessExportFailureV1 };

export interface BusinessExportClientV1 {
  exportAll(): Promise<BusinessExportResultV1>;
  /** Counts only: what is still held. Used to check a deletion. */
  check(): Promise<BusinessExportCheckResultV1>;
}

export function createBusinessExportClientV1(deps: {
  transport: HttpTransportV1;
  /** Includes the `/api` prefix when the server has one. */
  baseUrl: string;
  token: () => string | null | undefined;
  headers?: Record<string, string>;
}): BusinessExportClientV1 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const post = async (path: string) => {
    const token = deps.token();
    if (!token) return null;
    return deps.transport.request({
      method: 'POST',
      path: `${base}${path}`,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(deps.headers ?? {}) },
    });
  };
  const failureOf = (response: { status: number; body: unknown }): { failure: BusinessExportFailureV1; retryAfterSeconds?: number } => {
    if (response.status === 404) return { failure: 'closed' };
    if (response.status === 401) return { failure: 'no_session' };
    if (isRecentSignInRequiredErrorV1(response.status, response.body)) return { failure: 'step_up_required' };
    if (response.status === 409) return { failure: 'busy' };
    if (response.status === 429) {
      const wait = (response.body as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
      return { failure: 'rate_limited', ...(typeof wait === 'number' && Number.isFinite(wait) ? { retryAfterSeconds: wait } : {}) };
    }
    return { failure: 'unavailable' };
  };
  return {
    async exportAll() {
      let response;
      try {
        response = await post(BUSINESS_EXPORT_ROUTES_V1.export);
      } catch {
        return { ok: false, failure: 'unavailable' };
      }
      if (!response) return { ok: false, failure: 'no_session' };
      if (response.status !== 200 && response.status !== 201) return { ok: false, ...failureOf(response) };
      if (!isBusinessExportDocumentV1(response.body)) return { ok: false, failure: 'unreadable' };
      return { ok: true, value: response.body, fileName: businessExportFileNameV1(response.body), text: JSON.stringify(response.body, null, 2) };
    },
    async check() {
      let response;
      try {
        response = await post(BUSINESS_EXPORT_ROUTES_V1.check);
      } catch {
        return { ok: false, failure: 'unavailable' };
      }
      if (!response) return { ok: false, failure: 'no_session' };
      if (response.status !== 200 && response.status !== 201) return { ok: false, failure: failureOf(response).failure };
      if (!isBusinessExportCheckV1(response.body)) return { ok: false, failure: 'unreadable' };
      return { ok: true, value: response.body };
    },
  };
}

/** What the owner reads. */
export const BUSINESS_EXPORT_COPY_V1 = {
  title: { zh: '带走你的生意数据', en: 'Take your business data with you' },
  scope: {
    zh: '客户、问答、转介账和回执，一份普通的 JSON 文件，不用 Agentrix 也能读。里面只有你自己这一侧：别的主人的资料、客户的联系方式哈希都不在里面。文件本身没有加密，请自己保管好。需要你最近 10 分钟内登录过。',
    en: 'Your customers, questions and answers, introduction ledger and receipts, as one plain JSON file you can read without Agentrix. It holds your side only: nothing from other owners, and no hashes of a customer’s contact. The file is not encrypted, so keep it safe. You must have signed in within the last 10 minutes.',
  },
  action: { zh: '带走', en: 'Take it' },
  working: { zh: '正在整理……', en: 'Putting it together…' },
  done: { zh: '已带走。文件里没有加密，请妥善保管。', en: 'Done. The file is not encrypted: keep it safe.' },
  stepUp: { zh: '要先确认是你本人，请重新登录后再试。', en: 'Please confirm it is you: sign in again, then try again.' },
  busy: { zh: '已经有一次在进行。', en: 'One is already running.' },
  rateLimited: { zh: '太频繁了，请稍后再试。', en: 'Too often. Please try again later.' },
  failed: { zh: '没成功，请稍后再试。', en: 'It did not work. Please try again.' },
  unreadable: { zh: '服务器返回的内容读不懂，没有保存。', en: 'The server answered with something unreadable. Nothing was saved.' },
  checkTitle: { zh: '删除之后，核对一下', en: 'After deleting, check it' },
  checkHelp: {
    zh: '删除用你原来的办法（在“访客与线索”里删线索，等等）。删完点这里，只数还剩几条，不显示内容。',
    en: 'Delete the way you already do (delete leads under Visitors and leads, and so on). Then press this: it only counts what is left and shows no content.',
  },
  checkAction: { zh: '核对还剩什么', en: 'Check what is left' },
  checking: { zh: '正在数……', en: 'Counting…' },
  checkClean: { zh: '都是 0：已经删干净，已删除的线索里也没有留着联系方式。', en: 'All zero: it is gone, and no deleted lead still holds a contact.' },
  checkLeft: { zh: '还剩下这些：', en: 'Still held:' },
  checkHolding: { zh: '有已删除的线索里还留着联系方式，请联系我们。', en: 'Some deleted leads still hold a contact. Please contact us.' },
  checkUnread: { zh: '有几项没读出来，这次的数字不能当作已删除。', en: 'Some parts could not be read, so these numbers do not prove anything is deleted.' },
} as const;

/** The copy for a failure, or null when the surface should show nothing (`closed`). */
export function businessExportFailureCopyV1(failure: BusinessExportFailureV1): { zh: string; en: string } | null {
  switch (failure) {
    case 'closed':
      return null;
    case 'step_up_required':
    case 'no_session':
      return BUSINESS_EXPORT_COPY_V1.stepUp;
    case 'busy':
      return BUSINESS_EXPORT_COPY_V1.busy;
    case 'rate_limited':
      return BUSINESS_EXPORT_COPY_V1.rateLimited;
    case 'unreadable':
      return BUSINESS_EXPORT_COPY_V1.unreadable;
    default:
      return BUSINESS_EXPORT_COPY_V1.failed;
  }
}
