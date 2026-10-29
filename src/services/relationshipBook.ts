/**
 * Relationship book on the phone (L8 R4, `shared/types/relationship-book.ts`): a read-and-sort list of the people the
 * owner has dealt with. Only in builds with `EXPO_PUBLIC_RELATIONSHIP_BOOK=1`; the routes answer 404 while the server
 * switch `RELATIONSHIP_BOOK_V1_ENABLED` is off. The list carries no contact details; opening one person fetches them.
 * No React Native import: the transport and token are injected (relationshipBookSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  RELATIONSHIPS_PATH_V1,
  decodeRelationshipContactViewV1,
  decodeRelationshipListV1,
  isRelationshipBookClientEnabledV1,
  relationshipContactPathV1,
  type RelationshipContactSummaryV1,
  type RelationshipContactViewV1,
  type RelationshipTierV1,
} from '../../shared/types/relationship-book';

// Read as a literal member expression so the Expo build inlines it.
export const RELATIONSHIP_BOOK_ENABLED = isRelationshipBookClientEnabledV1(process.env.EXPO_PUBLIC_RELATIONSHIP_BOOK);

export type RelationshipBookFailure = 'no_session' | 'not_found' | 'not_allowed' | 'unavailable' | 'unreadable';

export const RELATIONSHIP_BOOK_FAILURE_COPY: Record<RelationshipBookFailure, { en: string; zh: string }> = {
  no_session: { en: 'Sign in first.', zh: '请先登录。' },
  not_found: { en: 'The relationship book is not open yet.', zh: '关系簿还没开放。' },
  not_allowed: { en: 'Not allowed.', zh: '没有权限。' },
  unavailable: { en: 'Not available right now. Try again later.', zh: '现在用不了，请稍后再试。' },
  unreadable: { en: 'The answer could not be read.', zh: '读不出服务器的回答。' },
};

export class RelationshipBookError extends Error {
  readonly failure: RelationshipBookFailure;
  constructor(failure: RelationshipBookFailure) {
    super(failure);
    this.name = 'RelationshipBookError';
    this.failure = failure;
  }
}

export interface MobileRelationshipBookClient {
  list(tier?: RelationshipTierV1): Promise<RelationshipContactSummaryV1[]>;
  get(contactRef: string): Promise<RelationshipContactViewV1>;
  setTier(contactRef: string, tier: RelationshipTierV1 | null): Promise<RelationshipContactViewV1>;
}

const CONTACT_REF = /^rel_[0-9a-f]{32}$/;

function failureOf(status: number): RelationshipBookFailure {
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  return 'unavailable';
}

export function createMobileRelationshipBookClient(deps: { transport: HttpTransportV1; baseUrl: string; token: () => string | null | undefined }): MobileRelationshipBookClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new RelationshipBookError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'PATCH' ? { body: body ?? {} } : {}),
      });
    } catch {
      throw new RelationshipBookError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new RelationshipBookError(failureOf(response.status));
    return response.body;
  };
  return {
    async list(tier) {
      const items = decodeRelationshipListV1(await call('GET', `${RELATIONSHIPS_PATH_V1}${tier ? `?tier=${tier}` : ''}`));
      if (!items) throw new RelationshipBookError('unreadable');
      return items;
    },
    async get(contactRef) {
      if (!CONTACT_REF.test(contactRef)) throw new RelationshipBookError('not_found');
      const view = decodeRelationshipContactViewV1(await call('GET', relationshipContactPathV1(contactRef)));
      if (!view || view.contactRef !== contactRef) throw new RelationshipBookError('unreadable');
      return view;
    },
    async setTier(contactRef, tier) {
      if (!CONTACT_REF.test(contactRef)) throw new RelationshipBookError('not_found');
      const view = decodeRelationshipContactViewV1(await call('PATCH', relationshipContactPathV1(contactRef), { tier }));
      if (!view || view.contactRef !== contactRef) throw new RelationshipBookError('unreadable');
      return view;
    },
  };
}
