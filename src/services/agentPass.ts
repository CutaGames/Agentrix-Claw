/**
 * L8 1b A5 Passes on the phone (`shared/types/agent-pass.ts`): the list, what each one allows, and revoke.
 * Off unless EXPO_PUBLIC_AGENT_PASS=1; while the server switch is off the routes answer 404 and the card renders nothing.
 * Revoking only narrows access: it takes effect at once and needs no preview digest. Issuing and widening stay out of
 * the app until the step-up sheet covers them.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { decodeAgentPassChangedV1, decodeAgentPassListV1, type AgentPassV1 } from '../../shared/types/agent-pass';

type Copy = { zh: string; en: string };

export function agentPassEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const AGENT_PASS_ENABLED = agentPassEnabled(process.env.EXPO_PUBLIC_AGENT_PASS);

export type AgentPassFailureV1 = 'closed' | 'invalid' | 'no_session' | 'unreadable' | 'unavailable';

export class AgentPassError extends Error {
  readonly failure: AgentPassFailureV1;
  constructor(failure: AgentPassFailureV1) {
    super(failure);
    this.name = 'AgentPassError';
    this.failure = failure;
  }
}

function failureOf(response: HttpResponseV1): AgentPassFailureV1 {
  if (response.status === 404) return 'closed';
  if (response.status === 400 || response.status === 409) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileAgentPassClientV1 {
  list(): Promise<AgentPassV1[]>;
  revoke(passId: string): Promise<AgentPassV1>;
}

export function createMobileAgentPassClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
  /** Idempotency key for a revoke; injectable for tests. */
  newRequestId?: () => string;
}): MobileAgentPassClientV1 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const newRequestId = deps.newRequestId ?? (() => `pass-revoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const send = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<HttpResponseV1> => {
    const token = deps.token();
    if (!token) throw new AgentPassError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new AgentPassError('unavailable');
    }
    if (response.status !== 200 && response.status !== 201) throw new AgentPassError(failureOf(response));
    return response;
  };
  return {
    list: async () => {
      const items = decodeAgentPassListV1((await send('GET', '/agent-passes')).body);
      if (!items) throw new AgentPassError('unreadable');
      return items;
    },
    revoke: async (passId) => {
      if (typeof passId !== 'string' || !/^pass_[0-9a-f]{32}$/.test(passId)) throw new AgentPassError('invalid');
      const pass = decodeAgentPassChangedV1((await send('POST', `/agent-passes/${passId}/revoke`, { schemaVersion: 1, requestId: newRequestId(), passId })).body);
      if (!pass) throw new AgentPassError('unreadable');
      return pass;
    },
  };
}

export const AGENT_PASS_FAILURE_COPY: Readonly<Record<AgentPassFailureV1, Copy>> = {
  closed: { zh: '这个功能还没开放。', en: 'This is not open yet.' },
  invalid: { zh: '没撤销成功，请稍后再试。', en: 'Could not revoke. Please try again.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到通行证。', en: 'Passes are unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
