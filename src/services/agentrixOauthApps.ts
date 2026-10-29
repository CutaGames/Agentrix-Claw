/**
 * L8 3A E1 on the phone: the apps the owner signed in to with Agentrix (`shared/types/agentrix-oauth.ts`), what each may
 * read, and disconnect. Off unless EXPO_PUBLIC_AGENTRIX_OAUTH=1; while the server switch is off the routes answer 404 and the
 * card renders nothing. Disconnecting only narrows access: it takes effect at once and needs no preview digest. Allowing an
 * app (the consent page) is web only. No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { decodeAgentrixOauthConnectedAppV1, type AgentrixOauthConnectedAppV1 } from '../../shared/types/agentrix-oauth';

type Copy = { zh: string; en: string };

export function agentrixOauthEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const AGENTRIX_OAUTH_ENABLED = agentrixOauthEnabled(process.env.EXPO_PUBLIC_AGENTRIX_OAUTH);

export type AgentrixOauthAppsFailureV1 = 'closed' | 'invalid' | 'no_session' | 'unreadable' | 'unavailable';

export class AgentrixOauthAppsError extends Error {
  readonly failure: AgentrixOauthAppsFailureV1;
  constructor(failure: AgentrixOauthAppsFailureV1) {
    super(failure);
    this.name = 'AgentrixOauthAppsError';
    this.failure = failure;
  }
}

function failureOf(response: HttpResponseV1): AgentrixOauthAppsFailureV1 {
  if (response.status === 404) return 'closed';
  if (response.status === 400 || response.status === 409) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileAgentrixOauthAppsClientV1 {
  list(): Promise<AgentrixOauthConnectedAppV1[]>;
  revoke(passId: string): Promise<void>;
}

export function createMobileAgentrixOauthAppsClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileAgentrixOauthAppsClientV1 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const send = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<HttpResponseV1> => {
    const token = deps.token();
    if (!token) throw new AgentrixOauthAppsError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new AgentrixOauthAppsError('unavailable');
    }
    if (response.status !== 200 && response.status !== 201) throw new AgentrixOauthAppsError(failureOf(response));
    return response;
  };
  return {
    list: async () => {
      const items = ((await send('GET', '/oauth/connected-apps')).body as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) throw new AgentrixOauthAppsError('unreadable');
      const out: AgentrixOauthConnectedAppV1[] = [];
      for (const item of items) {
        const decoded = decodeAgentrixOauthConnectedAppV1(item);
        if (decoded.ok === false) throw new AgentrixOauthAppsError('unreadable');
        out.push(decoded.value);
      }
      return out;
    },
    revoke: async (passId) => {
      if (typeof passId !== 'string' || !/^pass_[0-9a-f]{32}$/.test(passId)) throw new AgentrixOauthAppsError('invalid');
      const answer = (await send('POST', `/oauth/connected-apps/${passId}/revoke`, {})).body as { revoked?: unknown } | null;
      if (answer?.revoked !== true) throw new AgentrixOauthAppsError('unreadable');
    },
  };
}

export const AGENTRIX_OAUTH_APPS_FAILURE_COPY: Readonly<Record<AgentrixOauthAppsFailureV1, Copy>> = {
  closed: { zh: '这个功能还没开放。', en: 'This is not open yet.' },
  invalid: { zh: '没断开成功，请稍后再试。', en: 'Could not disconnect. Please try again.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到。', en: 'Unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
