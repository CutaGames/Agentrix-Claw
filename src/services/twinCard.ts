/**
 * twinCard — 分身 → 分身名片 on the phone (M4-c; product doc 5.3 / 5.4 / 5.7
 * M4 "先上名片、分享、公开状态与急停").
 *
 * Reads:
 *   GET /v1/agents/:agentId/twin                 owner projection (does a twin exist?)
 *   GET /v1/public/twin/agents/:agentId          what a visitor sees (anonymous: no bearer token)
 * Both are validated with the shared decoders (`shared/types/digital-twin*.ts`),
 * the same ones Web uses, so the phone never renders a shape Web would refuse.
 *
 * Sharing: only the canonical public page `/share/agent/<accountId>` and
 * only while the public projection says `available`. That link already
 * exists and is already public, so sharing it changes nothing about what is
 * visible (D16). The phone never builds a card snapshot into a link (the
 * passport's `?c=` form) and never publishes; both stay on Web.
 */
import { decodeDigitalTwinProjectionV1 } from '../../shared/types/digital-twin';
import {
  DIGITAL_TWIN_AI_DISCLOSURE_V1,
  decodeDigitalTwinPublicProjectionV1,
  type DigitalTwinPublicStateV1,
} from '../../shared/types/digital-twin-public';
import { APP_URL } from '../config/env';
import type { MobileReadState } from './mobileReadState';
import {
  TWIN_STATUS_CAPABILITY,
  getTwinJson,
  isSafeTwinAgentId,
  resolveTwinTransport,
  type TwinStatusTransportInput,
} from './twinStatus';

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TWIN_CARD_LIST_MAX = 8;

export function twinProjectionPath(agentAccountId: string): string {
  return `/v1/agents/${encodeURIComponent(agentAccountId)}/twin`;
}

export function publicTwinPath(agentAccountId: string): string {
  return `/v1/public/twin/agents/${encodeURIComponent(agentAccountId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function httpFailure(status: number, body: unknown): Exclude<MobileReadState<never>, { kind: 'ready' | 'partial' | 'legacy' | 'offline_stale' }> | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return { kind: 'unauthorized', reason: 'authentication_required' };
  if (status === 403) return { kind: 'forbidden', reason: 'agent_not_owned' };
  if (status === 404) return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'not_found' };
  if (status === 503) {
    const detail = isRecord(body) ? body : {};
    const reason = typeof detail.blockedBy === 'string' && detail.blockedBy ? detail.blockedBy : 'capability_unavailable';
    return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason };
  }
  return { kind: 'error', retryable: status >= 500 || status === 429, reason: `http_${status}` };
}

// ---------------------------------------------------------------------------
// Owner projection: does this Agent have a twin?
// ---------------------------------------------------------------------------

export interface MobileTwinOverview {
  hasProfile: boolean;
  /** `DigitalTwinProfileStateV1` when a profile exists. */
  profileState: string | null;
}

export type TwinOverviewReadState = MobileReadState<MobileTwinOverview>;

export async function fetchTwinOverview(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinOverviewReadState> {
  if (!isSafeTwinAgentId(agentAccountId)) {
    return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'agent_account_required' };
  }
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'unauthorized', reason: 'authentication_required' };
  const now = input.now ?? (() => new Date().toISOString());
  const response = await getTwinJson(transport, `${baseUrl}${twinProjectionPath(agentAccountId)}`, token);
  if (!response) return { kind: 'error', retryable: true, reason: 'network' };
  const failure = httpFailure(response.status, response.body);
  if (failure) return failure;
  const data = isRecord(response.body) && response.body.success === true ? response.body.data : undefined;
  const decoded = decodeDigitalTwinProjectionV1(data);
  // strict:false does not narrow on `ok`; the failure arm is the one with `reasonCode`.
  if ('reasonCode' in decoded) {
    return decoded.reasonCode === 'unknown_schema_version' || decoded.reasonCode === 'unknown_contract_version'
      ? { kind: 'unsupported_schema', schemaVersion: String(isRecord(data) ? data.schemaVersion : ''), reason: decoded.reasonCode }
      : { kind: 'error', retryable: false, reason: `projection_${decoded.reasonCode}` };
  }
  if (decoded.value.agentRef.id !== agentAccountId) return { kind: 'error', retryable: false, reason: 'projection_agent_mismatch' };
  const profile = decoded.value.profile;
  return {
    kind: 'ready',
    capturedAt: now(),
    data: { hasProfile: !!profile, profileState: profile && typeof profile.state === 'string' ? profile.state : null },
  };
}

// ---------------------------------------------------------------------------
// Public card: what a visitor sees
// ---------------------------------------------------------------------------

export interface MobileTwinPublicCard {
  state: DigitalTwinPublicStateV1;
  reasonCode: string | null;
  /** Only present while `available` (the contract forbids it otherwise). */
  creatorName: string | null;
  topics: string[];
  offers: string[];
  askHuman: string[];
  aiDisclosure: { zh: string; en: string };
}

export type TwinPublicCardReadState = MobileReadState<MobileTwinPublicCard>;

function strings(list: unknown[]): string[] {
  return list.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, TWIN_CARD_LIST_MAX);
}

/** Anonymous read: never sends the owner's token, exactly like a visitor. */
export async function fetchTwinPublicCard(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinPublicCardReadState> {
  if (!isSafeTwinAgentId(agentAccountId)) {
    return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'agent_account_required' };
  }
  const { baseUrl, transport } = resolveTwinTransport(input);
  const now = input.now ?? (() => new Date().toISOString());
  let status: number;
  let body: unknown;
  try {
    // Deliberately no Authorization header: the owner reads the page as a visitor would.
    const headers = { Accept: 'application/json', 'X-Agentrix-Surface': 'mobile' };
    const response = await transport.request({ method: 'GET', path: `${baseUrl}${publicTwinPath(agentAccountId)}`, headers });
    status = response.status;
    body = response.body;
  } catch {
    return { kind: 'error', retryable: true, reason: 'network' };
  }
  const failure = httpFailure(status, body);
  if (failure) return failure;
  const data = isRecord(body) && body.success === true ? body.data : undefined;
  const decoded = decodeDigitalTwinPublicProjectionV1(data);
  if ('reasonCode' in decoded) return { kind: 'error', retryable: false, reason: `public_projection_${decoded.reasonCode}` };
  const value = decoded.value;
  if (value.agentRef.id !== agentAccountId) return { kind: 'error', retryable: false, reason: 'public_projection_agent_mismatch' };
  return {
    kind: 'ready',
    capturedAt: now(),
    data: {
      state: value.state,
      reasonCode: typeof value.reasonCode === 'string' ? value.reasonCode : null,
      creatorName: value.state === 'available' && value.creator ? value.creator.displayName.trim() : null,
      topics: strings(value.topics),
      offers: strings(value.offers),
      askHuman: strings(value.askHuman),
      aiDisclosure: { zh: DIGITAL_TWIN_AI_DISCLOSURE_V1['zh-CN'], en: DIGITAL_TWIN_AI_DISCLOSURE_V1.en },
    },
  };
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

/** The twin's public page. Only an account UUID routes to the twin section on Web. */
export function twinCardSharePath(agentAccountId: string | null | undefined): string | null {
  const id = typeof agentAccountId === 'string' ? agentAccountId.trim() : '';
  return ACCOUNT_UUID.test(id) ? `/share/agent/${id.toLowerCase()}` : null;
}

export function twinCardShareUrl(agentAccountId: string | null | undefined, baseUrl: string = APP_URL): string | null {
  const path = twinCardSharePath(agentAccountId);
  return path ? `${baseUrl.replace(/\/+$/, '')}${path}` : null;
}

/** Share is offered only for a card a visitor can open right now. */
export function canShareTwinCard(card: MobileTwinPublicCard | null | undefined, agentAccountId: string | null | undefined): boolean {
  return !!card && card.state === 'available' && twinCardSharePath(agentAccountId) !== null;
}

/** Share-sheet text: who it is, that it is an AI twin, and the link. No private content. */
export function twinCardShareMessage(card: MobileTwinPublicCard, lang: 'zh' | 'en', url: string): string {
  const name = card.creatorName || (lang === 'zh' ? '我' : 'me');
  const topics = card.topics.slice(0, 3).join(lang === 'zh' ? '、' : ', ');
  if (lang === 'zh') {
    return [`${name}的 AI 分身`, topics ? `可以问：${topics}` : null, '回答都标注为 AI 分身，不替本人承诺价格、合同或退款。', url]
      .filter(Boolean)
      .join('\n');
  }
  return [`${name}'s AI twin`, topics ? `Ask about: ${topics}` : null, 'Every answer is labelled as an AI twin and never commits to prices, contracts or refunds.', url]
    .filter(Boolean)
    .join('\n');
}
