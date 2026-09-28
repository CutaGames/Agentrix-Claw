/**
 * twinStatus — 分身 → 公开状态与急停 on the phone (M4-b; product doc 5.3 /
 * 5.4, D16 / 8.3).
 *
 * Reads (owner-scoped, `JwtAuthGuard`; backend `digital-twin.controller.ts`,
 * shared contracts `digital-twin-stop.ts` / `digital-twin-public.ts`):
 *   GET  /v1/agents/:agentId/twin/stop    Twin Stop status + the frozen target plan
 *   GET  /v1/agents/:agentId/twin/public  publish record + readiness
 *
 * Tightening only (D16 / 8.3 "收紧类：隐藏、缩短、暂停、撤销、急停"):
 *   POST /v1/agents/:agentId/twin/stop    { action: 'stop', scope: 'all' }
 *   POST /v1/agents/:agentId/twin/public  { action: 'unpublish' }
 * Both take effect at once; the screen shows the backend read-back, never an
 * optimistic state. Publishing and resuming open access again, so they stay
 * on Web (exact preview + confirmation there). This module has no call that
 * can send `publish` or `resume`, and the client never picks stop targets:
 * the server freezes that set.
 */
import type { HttpTransportV1 } from '../../shared/client';
import {
  DIGITAL_TWIN_REJECTION_REASONS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinRejectionReasonV1,
} from '../../shared/types/digital-twin';
import {
  DIGITAL_TWIN_STOP_TARGETS_V1,
  DIGITAL_TWIN_STOP_TARGET_STATUSES_V1,
  decodeDigitalTwinStopRecordV1,
  digitalTwinStopStatusV1,
  type DigitalTwinStopRecordV1,
  type DigitalTwinStopTargetIdV1,
  type DigitalTwinStopTargetStatusV1,
} from '../../shared/types/digital-twin-stop';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import type { MobileReadState } from './mobileReadState';

export const TWIN_STATUS_CAPABILITY = 'digital_twin' as const;

/** Same shape the backend accepts for `:agentId` (and the Web client checks). */
const SAFE_AGENT_ID = /^[0-9a-zA-Z_-]{8,80}$/;

export function isSafeTwinAgentId(agentAccountId: unknown): agentAccountId is string {
  return typeof agentAccountId === 'string' && SAFE_AGENT_ID.test(agentAccountId);
}

export function twinStopPath(agentAccountId: string): string {
  return `/v1/agents/${encodeURIComponent(agentAccountId)}/twin/stop`;
}

export function twinPublicPath(agentAccountId: string): string {
  return `/v1/agents/${encodeURIComponent(agentAccountId)}/twin/public`;
}

/** 私密 · 公开 · 已暂停 (5.3); `stopping` = stop sent, some target not confirmed yet. */
export type TwinVisibility = 'private' | 'public' | 'paused' | 'stopping';

export interface MobileTwinStopTarget {
  target: DigitalTwinStopTargetIdV1;
  status: DigitalTwinStopTargetStatusV1;
  reasonCode: string | null;
}

export interface MobileTwinStatus {
  visibility: TwinVisibility;
  stopEpoch: number;
  /** The stop record's targets while stopped; otherwise what a stop would cover right now. */
  targets: MobileTwinStopTarget[];
  /** Targets still `pending` or `unknown` after a stop. Never counted as done. */
  outstanding: DigitalTwinStopTargetIdV1[];
  stoppedAt: string | null;
  published: boolean;
  publishedAt: string | null;
  topics: string[];
  /**
   * `false` when the public capability is switched off on the server (503):
   * nothing can be served publicly, so the twin reads as private, and the
   * screen says the public page is not open yet.
   */
  publicAvailable: boolean;
  /** Readiness checks that currently block publishing (informational; publishing is on Web). */
  publishBlockedBy: string[];
  profileState: string | null;
}

export type TwinStatusReadState = MobileReadState<MobileTwinStatus>;

export interface TwinStatusTransportInput {
  /** Absolute API base (`getApiConfig().baseUrl`), injectable for tests. */
  baseUrl?: string;
  token?: string;
  transport?: HttpTransportV1;
  now?: () => string;
}

/** Read-state arms that carry no data, so they fit any `MobileReadState<T>`. */
export type TwinReadFailure = Extract<
  MobileReadState<never>,
  { kind: 'unknown' | 'unavailable' | 'unauthorized' | 'forbidden' | 'redacted' | 'revoked' | 'unsupported_schema' | 'error' }
>;

export type TwinEnvelopeRead =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; state: TwinReadFailure; http: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectionReason(value: unknown): DigitalTwinRejectionReasonV1 | 'unknown' {
  return typeof value === 'string' && (DIGITAL_TWIN_REJECTION_REASONS_V1 as readonly string[]).includes(value)
    ? (value as DigitalTwinRejectionReasonV1)
    : 'unknown';
}

/** HTTP status + `{ success, data: DigitalTwinCommandResultV1 }` → the view value or a read state. */
export function readDigitalTwinEnvelope(status: number, body: unknown): TwinEnvelopeRead {
  const fail = (state: TwinReadFailure): TwinEnvelopeRead => ({ ok: false, state, http: status });
  if (status === 401) return fail({ kind: 'unauthorized', reason: 'authentication_required' });
  if (status === 403) return fail({ kind: 'forbidden', reason: 'agent_not_owned' });
  // Owner-scoped routes answer 404 for "not yours" as well as "no such Agent" (non-enumerating).
  if (status === 404) return fail({ kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'not_found' });
  if (status === 503) {
    const detail = isRecord(body) ? body : {};
    const reason =
      typeof detail.blockedBy === 'string' && detail.blockedBy
        ? detail.blockedBy
        : rejectionReason(detail.reasonCode) !== 'unknown'
          ? String(detail.reasonCode)
          : 'capability_unavailable';
    const capability = typeof detail.capability === 'string' && detail.capability ? detail.capability : TWIN_STATUS_CAPABILITY;
    return fail({ kind: 'unavailable', capability, reason });
  }
  if (status < 200 || status >= 300) {
    return fail({ kind: 'error', retryable: status >= 500 || status === 429, reason: `http_${status}` });
  }
  const data = isRecord(body) && body.success === true ? body.data : undefined;
  if (!isRecord(data)) return fail({ kind: 'error', retryable: false, reason: 'response_malformed' });
  if (data.status === 'rejected') {
    return fail({ kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: rejectionReason(data.reasonCode) });
  }
  if (data.status !== 'applied' && data.status !== 'replayed') {
    return fail({ kind: 'error', retryable: false, reason: 'response_malformed' });
  }
  const value = data.value;
  if (!isRecord(value)) return fail({ kind: 'error', retryable: false, reason: 'response_malformed' });
  if (value.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail({ kind: 'unsupported_schema', schemaVersion: String(value.schemaVersion), reason: 'digital_twin_schema_version' });
  }
  return { ok: true, value };
}

function normalizeTarget(input: unknown): MobileTwinStopTarget | null {
  if (!isRecord(input)) return null;
  if (!(DIGITAL_TWIN_STOP_TARGETS_V1 as readonly unknown[]).includes(input.target)) return null;
  // An unrecognised status is treated as `unknown`: never as converged.
  const status = (DIGITAL_TWIN_STOP_TARGET_STATUSES_V1 as readonly unknown[]).includes(input.status)
    ? (input.status as DigitalTwinStopTargetStatusV1)
    : 'unknown';
  return {
    target: input.target as DigitalTwinStopTargetIdV1,
    status,
    reasonCode: typeof input.reasonCode === 'string' && input.reasonCode ? input.reasonCode : null,
  };
}

interface StopPart {
  stopped: boolean;
  stopPending: boolean;
  stopEpoch: number;
  targets: MobileTwinStopTarget[];
  stoppedAt: string | null;
}

/**
 * Stop view → the facts the phone shows. The status is recomputed from the
 * record with the shared rule (`pending` / `unknown` targets keep it in
 * "stopping"), not copied from the `status` field.
 */
export function normalizeTwinStopView(value: Record<string, unknown>): StopPart | null {
  if (!Array.isArray(value.plan)) return null;
  let record: DigitalTwinStopRecordV1 | null = null;
  if (value.record !== null && value.record !== undefined) {
    const decoded = decodeDigitalTwinStopRecordV1(value.record);
    // strict:false does not narrow on `ok`; the failure arm is the one with `reasonCode`.
    if ('reasonCode' in decoded) return null;
    record = decoded.value;
  }
  const status = digitalTwinStopStatusV1(record);
  const source: unknown[] = record && record.state === 'stopped' ? record.targets : value.plan;
  const targets = source.map(normalizeTarget).filter((target): target is MobileTwinStopTarget => !!target);
  return {
    stopped: status.stopped,
    stopPending: status.stopPending,
    stopEpoch: status.stopEpoch,
    targets,
    stoppedAt: record && record.state === 'stopped' ? record.requestedAt : null,
  };
}

interface PublishPart {
  published: boolean;
  publishedAt: string | null;
  topics: string[];
  publishBlockedBy: string[];
  profileState: string | null;
}

export function normalizeTwinPublishView(value: Record<string, unknown>): PublishPart | null {
  const readiness = value.readiness;
  if (!isRecord(readiness) || !Array.isArray(readiness.checks)) return null;
  let published = false;
  let publishedAt: string | null = null;
  let topics: string[] = [];
  if (value.record !== null && value.record !== undefined) {
    const record = value.record;
    if (!isRecord(record) || record.record !== 'interim_seed_public_facet' || record.notAGrant !== true || !Array.isArray(record.topics)) {
      return null;
    }
    if (record.state !== 'published' && record.state !== 'unpublished') return null;
    published = record.state === 'published';
    publishedAt = published && typeof record.publishedAt === 'string' ? record.publishedAt : null;
    topics = record.topics.filter((topic): topic is string => typeof topic === 'string');
  }
  const publishBlockedBy = readiness.checks
    .filter((check): check is Record<string, unknown> => isRecord(check) && check.status === 'blocked' && typeof check.check === 'string')
    .map((check) => check.check as string);
  return {
    published,
    publishedAt,
    topics,
    publishBlockedBy,
    profileState: typeof value.profileState === 'string' ? value.profileState : null,
  };
}

/** 5.3: stop wins over publish; a stop that has not fully converged stays "stopping". */
export function deriveTwinVisibility(stop: { stopped: boolean; stopPending: boolean }, published: boolean): TwinVisibility {
  if (stop.stopPending) return 'stopping';
  if (stop.stopped) return 'paused';
  return published ? 'public' : 'private';
}

export function twinAuthHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Agentrix-Surface': 'mobile',
  };
}

export function resolveTwinTransport(input: TwinStatusTransportInput): { baseUrl: string; token: string | undefined; transport: HttpTransportV1 } {
  const config = getApiConfig();
  return {
    baseUrl: (input.baseUrl ?? config.baseUrl ?? '').replace(/\/+$/, ''),
    token: input.token ?? config.token,
    transport: input.transport ?? mobileV6HttpTransport,
  };
}

export async function getTwinJson(
  transport: HttpTransportV1,
  url: string,
  token: string,
): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await transport.request({ method: 'GET', path: url, headers: twinAuthHeaders(token) });
    return { status: response.status, body: response.body };
  } catch {
    return null;
  }
}

/** Reads stop + publish views and folds them into one status; HTTP failures stay read states. */
export async function fetchTwinStatus(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinStatusReadState> {
  if (!isSafeTwinAgentId(agentAccountId)) {
    return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'agent_account_required' };
  }
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'unauthorized', reason: 'authentication_required' };
  const now = input.now ?? (() => new Date().toISOString());
  const [stopResponse, publishResponse] = await Promise.all([
    getTwinJson(transport, `${baseUrl}${twinStopPath(agentAccountId)}`, token),
    getTwinJson(transport, `${baseUrl}${twinPublicPath(agentAccountId)}`, token),
  ]);
  if (!stopResponse) return { kind: 'error', retryable: true, reason: 'network' };
  const stopRead = readDigitalTwinEnvelope(stopResponse.status, stopResponse.body);
  if ('state' in stopRead) return stopRead.state;
  const stop = normalizeTwinStopView(stopRead.value);
  if (!stop) return { kind: 'error', retryable: false, reason: 'stop_view_malformed' };
  if (!publishResponse) return { kind: 'error', retryable: true, reason: 'network' };

  let publish: PublishPart;
  let publicAvailable = true;
  const publishRead = readDigitalTwinEnvelope(publishResponse.status, publishResponse.body);
  if ('state' in publishRead) {
    // Only "the public capability is off" (503) reads as private; any other failure is not guessed.
    if (publishRead.http !== 503) return publishRead.state;
    publicAvailable = false;
    publish = { published: false, publishedAt: null, topics: [], publishBlockedBy: [], profileState: null };
  } else {
    const decoded = normalizeTwinPublishView(publishRead.value);
    if (!decoded) return { kind: 'error', retryable: false, reason: 'publish_view_malformed' };
    publish = decoded;
  }

  return {
    kind: 'ready',
    capturedAt: now(),
    data: {
      visibility: deriveTwinVisibility(stop, publish.published),
      stopEpoch: stop.stopEpoch,
      targets: stop.targets,
      outstanding: stop.stopped || stop.stopPending
        ? stop.targets.filter((target) => target.status === 'pending' || target.status === 'unknown').map((target) => target.target)
        : [],
      stoppedAt: stop.stoppedAt,
      published: publish.published,
      publishedAt: publish.publishedAt,
      topics: publish.topics,
      publicAvailable,
      publishBlockedBy: publish.publishBlockedBy,
      profileState: publish.profileState,
    },
  };
}

// ---------------------------------------------------------------------------
// Tightening commands
// ---------------------------------------------------------------------------

export type TwinTighteningAction = 'stop' | 'unpublish';
export const TWIN_TIGHTENING_ACTIONS: readonly TwinTighteningAction[] = ['stop', 'unpublish'];

export type TwinCommandOutcome =
  | { kind: 'done'; action: TwinTighteningAction; replayed: boolean }
  | { kind: 'rejected'; action: TwinTighteningAction; reasonCode: DigitalTwinRejectionReasonV1 | 'unknown'; retryable: boolean }
  | { kind: 'blocked'; reason: 'action_not_allowed_on_phone' | 'agent_account_required' | 'authentication_required' }
  | { kind: 'failed'; action: TwinTighteningAction; reason: string; retryable: boolean };

/**
 * The only request bodies this phone can build. Anything else (`publish`,
 * `resume`, a narrower stop scope, a topic list) returns `null`, so no request
 * is sent.
 */
export function buildTwinTighteningRequest(
  agentAccountId: string,
  action: unknown,
): { path: string; body: Record<string, unknown> } | null {
  if (action === 'stop') {
    return { path: twinStopPath(agentAccountId), body: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: 'stop', scope: 'all' } };
  }
  if (action === 'unpublish') {
    return { path: twinPublicPath(agentAccountId), body: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: 'unpublish' } };
  }
  return null;
}

/** Stop the twin or take it off the public page. Callers re-read the status afterwards. */
export async function tightenTwin(
  agentAccountId: string,
  action: TwinTighteningAction,
  input: TwinStatusTransportInput = {},
): Promise<TwinCommandOutcome> {
  if (!(TWIN_TIGHTENING_ACTIONS as readonly unknown[]).includes(action)) {
    return { kind: 'blocked', reason: 'action_not_allowed_on_phone' };
  }
  if (!isSafeTwinAgentId(agentAccountId)) return { kind: 'blocked', reason: 'agent_account_required' };
  const request = buildTwinTighteningRequest(agentAccountId, action);
  if (!request) return { kind: 'blocked', reason: 'action_not_allowed_on_phone' };
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'blocked', reason: 'authentication_required' };
  let status: number;
  let body: unknown;
  try {
    const response = await transport.request({
      method: 'POST',
      path: `${baseUrl}${request.path}`,
      headers: { ...twinAuthHeaders(token), 'Content-Type': 'application/json' },
      body: request.body,
    });
    status = response.status;
    body = response.body;
  } catch {
    return { kind: 'failed', action, reason: 'network', retryable: true };
  }
  if (status === 409 || status === 503) {
    const detail = isRecord(body) ? body : {};
    return { kind: 'rejected', action, reasonCode: rejectionReason(detail.reasonCode), retryable: detail.retryable === true };
  }
  if (status < 200 || status >= 300) {
    return { kind: 'failed', action, reason: `http_${status}`, retryable: status >= 500 || status === 429 };
  }
  const data = isRecord(body) && body.success === true ? body.data : undefined;
  if (!isRecord(data)) return { kind: 'failed', action, reason: 'response_malformed', retryable: false };
  if (data.status === 'rejected') {
    return { kind: 'rejected', action, reasonCode: rejectionReason(data.reasonCode), retryable: data.retryable === true };
  }
  if (data.status === 'applied' || data.status === 'replayed') {
    return { kind: 'done', action, replayed: data.status === 'replayed' };
  }
  return { kind: 'failed', action, reason: 'response_malformed', retryable: false };
}
