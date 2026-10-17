/**
 * L6-1 requests from other people's Agents, on the phone (`shared/types/agent-collaboration.ts`). Off unless
 * EXPO_PUBLIC_AGENT_COLLABORATION=1; while the server switch is off the routes answer 404 and the card renders nothing.
 * Counterpart text is shown as plain text and v0 never acts on a request (no booking, payment or download); the owner
 * only gives the counterpart a tier.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  AGENT_COLLABORATION_KINDS_V0,
  decodeAgentCollaborationVerificationV1,
  isAgentCollaborationTierV0,
  normalizeAgentCollaborationIdentityV0,
  type AgentCollaborationIdentityV0,
  type AgentCollaborationKindV0,
  type AgentCollaborationRelationshipViewV0,
  type AgentCollaborationRequestViewV0,
  type AgentCollaborationTierV0,
} from '../../shared/types/agent-collaboration';

type Copy = { zh: string; en: string };

export function agentCollaborationEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const AGENT_COLLABORATION_ENABLED = agentCollaborationEnabled(process.env.EXPO_PUBLIC_AGENT_COLLABORATION);

export type AgentCollaborationFailureV0 = 'closed' | 'invalid' | 'no_session' | 'unreadable' | 'unavailable';

export class AgentCollaborationError extends Error {
  readonly failure: AgentCollaborationFailureV0;
  constructor(failure: AgentCollaborationFailureV0) {
    super(failure);
    this.name = 'AgentCollaborationError';
    this.failure = failure;
  }
}

const AUDIENCES = ['stranger', 'client', 'collaborator', 'family'];
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isTextOrNull = (v: unknown, max: number): v is string | null => v === null || (typeof v === 'string' && v.length <= max);

function decodeRequest(value: unknown): AgentCollaborationRequestViewV0 | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const identity = normalizeAgentCollaborationIdentityV0(r.identity);
  const { receiptId, kind, audience, status, receivedAt, counterpartName, message, proposedStartAt, amountMinor, currency, fileUrl } = r;
  const verification = decodeAgentCollaborationVerificationV1(r);
  if (typeof receiptId !== 'string' || !identity || !(AGENT_COLLABORATION_KINDS_V0 as readonly unknown[]).includes(kind)) return null;
  if (!AUDIENCES.includes(audience as string) || status !== 'pending_owner' || !verification || !isIso(receivedAt)) return null;
  if (typeof counterpartName !== 'string' || counterpartName.length > 80 || typeof message !== 'string' || message.length > 2000) return null;
  if (!(proposedStartAt === null || isIso(proposedStartAt)) || !(amountMinor === null || Number.isInteger(amountMinor))) return null;
  if (!isTextOrNull(currency, 3) || !isTextOrNull(fileUrl, 500)) return null;
  return {
    receiptId,
    kind: kind as AgentCollaborationKindV0,
    audience: audience as AgentCollaborationRequestViewV0['audience'],
    status: 'pending_owner',
    ...verification,
    receivedAt,
    counterpartName,
    identity,
    message,
    proposedStartAt: proposedStartAt as string | null,
    amountMinor: amountMinor as number | null,
    currency,
    fileUrl,
  };
}

function decodeRelationship(value: unknown): AgentCollaborationRelationshipViewV0 | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const identity = normalizeAgentCollaborationIdentityV0(r.identity);
  return identity && isAgentCollaborationTierV0(r.tier) && isIso(r.updatedAt) ? { identity, tier: r.tier, updatedAt: r.updatedAt } : null;
}

function listOf<T>(body: unknown, decode: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(body)) return null;
  const out: T[] = [];
  for (const item of body) {
    const decoded = decode(item);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function failureOf(response: HttpResponseV1): AgentCollaborationFailureV0 {
  if (response.status === 404) return 'closed';
  if (response.status === 400) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileAgentCollaborationClientV0 {
  requests(): Promise<AgentCollaborationRequestViewV0[]>;
  relationships(): Promise<AgentCollaborationRelationshipViewV0[]>;
  /** null puts the counterpart back to stranger. */
  setTier(identity: AgentCollaborationIdentityV0, tier: AgentCollaborationTierV0 | null): Promise<void>;
}

export function createMobileAgentCollaborationClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileAgentCollaborationClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const send = async (method: 'GET' | 'PUT', path: string, body?: unknown): Promise<HttpResponseV1> => {
    const token = deps.token();
    if (!token) throw new AgentCollaborationError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new AgentCollaborationError('unavailable');
    }
    if (response.status !== 200) throw new AgentCollaborationError(failureOf(response));
    return response;
  };
  const list = async <T>(path: string, decode: (v: unknown) => T | null): Promise<T[]> => {
    const items = listOf((await send('GET', path)).body, decode);
    if (!items) throw new AgentCollaborationError('unreadable');
    return items;
  };
  return {
    requests: () => list('/agent-collaboration/requests', decodeRequest),
    relationships: () => list('/agent-collaboration/relationships', decodeRelationship),
    setTier: async (identity, tier) => {
      const checked = normalizeAgentCollaborationIdentityV0(identity);
      if (!checked || !(tier === null || isAgentCollaborationTierV0(tier))) throw new AgentCollaborationError('invalid');
      await send('PUT', '/agent-collaboration/relationships', { identity: checked, tier });
    },
  };
}

/** The counterpart's tier, stranger when the owner has not given one. */
export function counterpartTier(
  relationships: readonly AgentCollaborationRelationshipViewV0[],
  identity: AgentCollaborationIdentityV0,
): AgentCollaborationTierV0 | 'stranger' {
  return relationships.find((r) => r.identity.kind === identity.kind && r.identity.value === identity.value)?.tier ?? 'stranger';
}

export const AGENT_COLLABORATION_KIND_COPY: Readonly<Record<AgentCollaborationKindV0, Copy>> = {
  ask: { zh: '提问', en: 'Question' },
  book: { zh: '约时间', en: 'Booking' },
  deposit_intent: { zh: '定金意向', en: 'Deposit intent' },
  file_offer: { zh: '发文件', en: 'File offer' },
};

/** L6-1 v1: whether the counterpart proved its passport or domain. */
export function agentCollaborationVerificationCopy(request: Pick<AgentCollaborationRequestViewV0, 'verification' | 'verifiedBy'>): Copy {
  if (request.verification !== 'verified') return { zh: '未核实', en: 'Unverified' };
  return request.verifiedBy === 'dns' ? { zh: '已核实 · 域名', en: 'Verified · domain' } : { zh: '已核实 · 护照签名', en: 'Verified · passport signature' };
}

export const AGENT_COLLABORATION_TIER_COPY: Readonly<Record<AgentCollaborationTierV0 | 'stranger', Copy>> = {
  stranger: { zh: '陌生人', en: 'Stranger' },
  client: { zh: '客户', en: 'Client' },
  collaborator: { zh: '合作者', en: 'Collaborator' },
  family: { zh: '家人', en: 'Family' },
};

export const AGENT_COLLABORATION_FAILURE_COPY: Readonly<Record<AgentCollaborationFailureV0, Copy>> = {
  closed: { zh: '这个功能还没开放。', en: 'This is not open yet.' },
  invalid: { zh: '没更新成功，请稍后再试。', en: 'Could not update. Please try again.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到请求。', en: 'Requests are unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
