/**
 * The Agent's own mailbox on the phone (contract `shared/types/agent-mailbox.ts` v0). Off unless the build sets
 * `EXPO_PUBLIC_AGENT_MAILBOX=1`; the routes answer 404 while the server switch `AGENT_MAILBOX_V0_ENABLED` is off.
 *
 * - Status / open / what came in / drafts / send / discard over `AGENT_MAILBOX_ROUTES_V0`, bodies not wrapped, every
 *   item through the shared decoders; one unreadable item makes a list unreadable.
 * - A draft goes out only from the owner's Send (the screen asks first); ids are checked before they go into a path.
 * - Mail text comes from outside: the screen shows it as plain text.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  decodeAgentMailDraftViewV0,
  decodeAgentMailListV0,
  decodeAgentMailSummaryViewV0,
  decodeAgentMailboxViewV0,
  type AgentMailboxViewV0,
  type AgentMailDraftViewV0,
  type AgentMailSentViewV0,
  type AgentMailSummaryViewV0,
} from '../../shared/types/agent-mailbox';

export function agentMailboxEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const AGENT_MAILBOX_ENABLED = agentMailboxEnabled(process.env.EXPO_PUBLIC_AGENT_MAILBOX);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_REF = /^amd_[0-9a-f]{32}$/;

export type AgentMailboxFailureV0 = 'not_allowed' | 'not_found' | 'unreadable' | 'unavailable' | 'no_session';

export class AgentMailboxError extends Error {
  readonly failure: AgentMailboxFailureV0;
  constructor(failure: AgentMailboxFailureV0) {
    super(failure);
    this.name = 'AgentMailboxError';
    this.failure = failure;
  }
}

export const AGENT_MAILBOX_FAILURE_COPY: Readonly<Record<AgentMailboxFailureV0, { zh: string; en: string }>> = {
  not_allowed: { zh: '请重新登录后再试。', en: 'Sign in again and retry.' },
  not_found: { zh: '找不到（草稿可能已过期）。', en: 'Not found (the draft may have expired).' },
  unreadable: { zh: '读不懂服务器的回答，请更新 App。', en: 'Could not read the answer. Update the app.' },
  unavailable: { zh: '邮箱暂时用不了，请稍后再试。', en: 'The mailbox is unavailable right now.' },
  no_session: { zh: '请先登录。', en: 'Please sign in first.' },
};

export interface MobileAgentMailboxClientV0 {
  status(agentAccountId: string): Promise<AgentMailboxViewV0>;
  open(agentAccountId: string): Promise<AgentMailboxViewV0>;
  messages(agentAccountId: string): Promise<AgentMailSummaryViewV0[]>;
  drafts(agentAccountId: string): Promise<AgentMailDraftViewV0[]>;
  send(draftRef: string): Promise<AgentMailSentViewV0>;
  discard(draftRef: string): Promise<void>;
}

export function createMobileAgentMailboxClient(deps: { transport: HttpTransportV1; baseUrl: string; token: () => string | null | undefined }): MobileAgentMailboxClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new AgentMailboxError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new AgentMailboxError('unavailable');
    }
    if (response.status === 401 || response.status === 403) throw new AgentMailboxError('not_allowed');
    if (response.status === 404) throw new AgentMailboxError('not_found');
    if (response.status < 200 || response.status >= 300) throw new AgentMailboxError('unavailable');
    return response.body;
  };
  const decoded = <T>(value: T | null): T => {
    if (value === null) throw new AgentMailboxError('unreadable');
    return value;
  };
  const agent = (id: string) => {
    if (!UUID.test(id)) throw new AgentMailboxError('not_found');
    return id;
  };
  const draft = (ref: string) => {
    if (!DRAFT_REF.test(ref)) throw new AgentMailboxError('not_found');
    return ref;
  };
  return {
    async status(agentAccountId) {
      return decoded(decodeAgentMailboxViewV0(await call('GET', `/agent-mailbox?agentAccountId=${agent(agentAccountId)}`)));
    },
    async open(agentAccountId) {
      return decoded(decodeAgentMailboxViewV0(await call('POST', '/agent-mailbox', { agentAccountId: agent(agentAccountId) })));
    },
    async messages(agentAccountId) {
      return decoded(decodeAgentMailListV0(await call('GET', `/agent-mailbox/messages?agentAccountId=${agent(agentAccountId)}`), decodeAgentMailSummaryViewV0));
    },
    async drafts(agentAccountId) {
      return decoded(decodeAgentMailListV0(await call('GET', `/agent-mailbox/drafts?agentAccountId=${agent(agentAccountId)}`), decodeAgentMailDraftViewV0));
    },
    async send(draftRef) {
      const body = (await call('POST', `/agent-mailbox/drafts/${draft(draftRef)}/send`, {})) as { sent?: unknown; messageRef?: unknown } | null;
      if (body?.sent !== true || (body.messageRef !== null && typeof body.messageRef !== 'string')) throw new AgentMailboxError('unreadable');
      return { sent: true, messageRef: body.messageRef as string | null };
    },
    async discard(draftRef) {
      const body = (await call('DELETE', `/agent-mailbox/drafts/${draft(draftRef)}`)) as { discarded?: unknown } | null;
      if (body?.discarded !== true) throw new AgentMailboxError('unreadable');
    },
  };
}
