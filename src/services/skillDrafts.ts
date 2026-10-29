/**
 * Skill drafts on the phone (L8 C2, `shared/types/skill-draft.ts`): the confirm card for skills that grew from
 * automations that kept succeeding. Only in builds with `EXPO_PUBLIC_SKILL_DISTILL=1`; the routes answer 404 while the
 * server switch is off. A draft is only text and does nothing until the owner confirms it here or on the Web.
 * No React Native import: the transport and token are injected (skillDraftsSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  SKILL_DRAFTS_SCAN_PATH_V1,
  decodeSkillDraftListV1,
  decodeSkillDraftResponseV1,
  decodeSkillDraftScanV1,
  skillDraftDecisionPathV1,
  skillDraftListPathV1,
  type SkillDraftDecisionV1,
  type SkillDraftScanV1,
  type SkillDraftViewV1,
} from '../../shared/types/skill-draft';

export function skillDraftsEnabled(value: unknown): boolean {
  return value === '1';
}

export type SkillDraftsFailure = 'no_session' | 'not_found' | 'not_allowed' | 'unavailable' | 'unreadable';

export const SKILL_DRAFTS_FAILURE_COPY: Record<SkillDraftsFailure, { en: string; zh: string }> = {
  no_session: { en: 'Sign in first.', zh: '请先登录。' },
  not_found: { en: 'Skill drafts are not open yet.', zh: '技能草稿还没开放。' },
  not_allowed: { en: 'Not allowed.', zh: '没有权限。' },
  unavailable: { en: 'Not available right now. Try again later.', zh: '现在用不了，请稍后再试。' },
  unreadable: { en: 'The answer could not be read.', zh: '读不出服务器的回答。' },
};

export class SkillDraftsError extends Error {
  readonly failure: SkillDraftsFailure;
  constructor(failure: SkillDraftsFailure) {
    super(failure);
    this.name = 'SkillDraftsError';
    this.failure = failure;
  }
}

export interface MobileSkillDraftsClient {
  list(): Promise<SkillDraftViewV1[]>;
  scan(): Promise<SkillDraftScanV1>;
  decide(draftRef: string, decision: SkillDraftDecisionV1): Promise<SkillDraftViewV1>;
}

const DRAFT_REF = /^skd_[0-9a-f]{32}$/;

function failureOf(status: number): SkillDraftsFailure {
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  return 'unavailable';
}

export function createMobileSkillDraftsClient(deps: { transport: HttpTransportV1; baseUrl: string; token: () => string | null | undefined }): MobileSkillDraftsClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new SkillDraftsError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'POST' ? { body: body ?? {} } : {}),
      });
    } catch {
      throw new SkillDraftsError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new SkillDraftsError(failureOf(response.status));
    return response.body;
  };
  return {
    async list() {
      const items = decodeSkillDraftListV1(await call('GET', skillDraftListPathV1()));
      if (!items) throw new SkillDraftsError('unreadable');
      return items;
    },
    async scan() {
      const result = decodeSkillDraftScanV1(await call('POST', SKILL_DRAFTS_SCAN_PATH_V1));
      if (!result) throw new SkillDraftsError('unreadable');
      return result;
    },
    async decide(draftRef, decision) {
      if (!DRAFT_REF.test(draftRef)) throw new SkillDraftsError('not_found');
      const view = decodeSkillDraftResponseV1(await call('POST', skillDraftDecisionPathV1(draftRef), { decision }));
      if (!view || view.draftRef !== draftRef) throw new SkillDraftsError('unreadable');
      return view;
    },
  };
}
