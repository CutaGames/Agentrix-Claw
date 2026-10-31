/**
 * L8 2nd batch A8: the "export all my data" client, shared by web, phone and desktop (`shared/types/account-export.ts`).
 * Each surface injects its own `HttpTransportV1` and token, the way the other shared clients do. No React, no platform
 * import. The surface only turns the result into a file; nothing here reads or keeps the content.
 *
 * - `closed`: the server answered 404, `ACCOUNT_EXPORT_V2_ENABLED` is off there; the surface shows nothing.
 * - `step_up_required`: 403 STEP_UP_REQUIRED, the owner has to sign in again first (signed in within 10 minutes).
 * - `rate_limited` / `busy`: one export at a time, 30 s apart, six an hour.
 * The owner is never sent: the server reads it from the login.
 */
import {
  ACCOUNT_EXPORT_FORMAT_V2,
  ACCOUNT_EXPORT_SCHEMA_VERSION_V2,
  ACCOUNT_EXPORT_SECTIONS_V2,
  type AccountExportV2,
} from '../types/account-export';
import { isRecentSignInRequiredErrorV1 } from '../types/auth-step-up';
import type { HttpTransportV1 } from './transport';

export const ACCOUNT_EXPORT_PATH_V2 = '/account-export/v2';

export type AccountExportFailureV2 = 'closed' | 'no_session' | 'step_up_required' | 'rate_limited' | 'busy' | 'unreadable' | 'unavailable';

export type AccountExportResultV2 =
  | { ok: true; value: AccountExportV2; fileName: string; text: string }
  | { ok: false; failure: AccountExportFailureV2; retryAfterSeconds?: number };

export interface AccountExportClientV2 {
  exportAll(): Promise<AccountExportResultV2>;
}

/** The header of a document is checked before it is written to a file: a wrong shape is `unreadable`, not saved. */
export function isAccountExportDocumentV2(value: unknown): value is AccountExportV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.format !== ACCOUNT_EXPORT_FORMAT_V2 || record.schemaVersion !== ACCOUNT_EXPORT_SCHEMA_VERSION_V2) return false;
  if (typeof record.exportId !== 'string' || typeof record.generatedAt !== 'string' || typeof record.sectionsDigest !== 'string') return false;
  const sections = record.sections;
  if (typeof sections !== 'object' || sections === null) return false;
  return ACCOUNT_EXPORT_SECTIONS_V2.every((key) => {
    const section = (sections as Record<string, unknown>)[key] as { items?: unknown; status?: unknown } | undefined;
    return typeof section === 'object' && section !== null && Array.isArray(section.items) && typeof section.status === 'string';
  });
}

export function accountExportFileNameV2(document: Pick<AccountExportV2, 'generatedAt'>): string {
  return `agentrix-account-export-${document.generatedAt.slice(0, 10)}.json`;
}

export function createAccountExportClientV2(deps: {
  transport: HttpTransportV1;
  /** Includes the `/api` prefix when the server has one. */
  baseUrl: string;
  token: () => string | null | undefined;
  /** Extra headers, e.g. the mobile surface marker. */
  headers?: Record<string, string>;
}): AccountExportClientV2 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  return {
    async exportAll(): Promise<AccountExportResultV2> {
      const token = deps.token();
      if (!token) return { ok: false, failure: 'no_session' };
      let response;
      try {
        response = await deps.transport.request({
          method: 'POST',
          path: `${base}${ACCOUNT_EXPORT_PATH_V2}`,
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(deps.headers ?? {}) },
        });
      } catch {
        return { ok: false, failure: 'unavailable' };
      }
      if (response.status !== 200 && response.status !== 201) {
        if (response.status === 404) return { ok: false, failure: 'closed' };
        if (response.status === 401) return { ok: false, failure: 'no_session' };
        if (isRecentSignInRequiredErrorV1(response.status, response.body)) return { ok: false, failure: 'step_up_required' };
        if (response.status === 409) return { ok: false, failure: 'busy' };
        if (response.status === 429) {
          const wait = (response.body as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
          return { ok: false, failure: 'rate_limited', ...(typeof wait === 'number' && Number.isFinite(wait) ? { retryAfterSeconds: wait } : {}) };
        }
        return { ok: false, failure: 'unavailable' };
      }
      if (!isAccountExportDocumentV2(response.body)) return { ok: false, failure: 'unreadable' };
      return { ok: true, value: response.body, fileName: accountExportFileNameV2(response.body), text: JSON.stringify(response.body, null, 2) };
    },
  };
}

/** What the owner reads. */
export const ACCOUNT_EXPORT_COPY_V2 = {
  title: { zh: '导出我的全部数据', en: 'Export all my data' },
  scope: {
    zh: '一份普通的 JSON 文件：对话、自动记忆、分身、附件、使用回执和关系簿。加密的内容由服务器解开后放进文件，所以文件本身没有加密，请自己保管好。需要你最近 10 分钟内登录过。',
    en: 'One plain JSON file: conversations, auto memories, agents, attachments, use receipts and your relationship book. Encrypted content is decrypted by the server before it goes in, so the file itself is not encrypted: keep it safe. You must have signed in within the last 10 minutes.',
  },
  action: { zh: '导出', en: 'Export' },
  working: { zh: '正在整理你的数据…', en: 'Putting your data together…' },
  done: { zh: '已导出。文件里没有加密，请妥善保管。', en: 'Exported. The file is not encrypted: keep it safe.' },
  stepUp: { zh: '要先确认是你本人，请重新登录后再试。', en: 'Please confirm it is you: sign in again, then try again.' },
  busy: { zh: '已经有一次导出在进行。', en: 'An export is already running.' },
  rateLimited: { zh: '导出太频繁了，请稍后再试。', en: 'Exporting too often. Please try again later.' },
  failed: { zh: '没导出成功，请稍后再试。', en: 'Could not export. Please try again.' },
  unreadable: { zh: '服务器返回的内容读不懂，没有保存。', en: 'The server answered with something unreadable. Nothing was saved.' },
} as const;

/** The copy for a failure, or null when the surface should show nothing (`closed`). */
export function accountExportFailureCopyV2(failure: AccountExportFailureV2): { zh: string; en: string } | null {
  switch (failure) {
    case 'closed':
      return null;
    case 'step_up_required':
    case 'no_session':
      return ACCOUNT_EXPORT_COPY_V2.stepUp;
    case 'busy':
      return ACCOUNT_EXPORT_COPY_V2.busy;
    case 'rate_limited':
      return ACCOUNT_EXPORT_COPY_V2.rateLimited;
    case 'unreadable':
      return ACCOUNT_EXPORT_COPY_V2.unreadable;
    default:
      return ACCOUNT_EXPORT_COPY_V2.failed;
  }
}
