/**
 * twinCreation — the phone's read-only view of the nine-step twin creation (product doc 1.9;
 * T5, REQ-mobile-047). The step model is the shared one Web drives the flow with
 * (`shared/types/digital-twin-creation.ts`), so both surfaces show the same state.
 *
 * The phone does none of the steps: every step opens Web (`/agents/:id/twin/create?step=`).
 * Page-local material (sources added on a Web page and not yet written) does not exist on the
 * phone, so it passes none; "带入" and "权利" follow the server's facts, exactly as Web does
 * after a reload.
 *
 * Reads (owner only; the same routes Web uses):
 *   GET /v1/agents/:id/twin                  projection (required)
 *   GET /v1/agents/:id/twin/interview        `interim.policy` → services step
 *   GET /v1/agents/:id/twin/private/thread   first twin answer → ask step
 *   GET /v1/agents/:id/twin/public           readiness + record → check / publish steps
 * Only the projection is required. A failed secondary read degrades honestly: no policy, no
 * answer, and `publishReady: null` (the check and publish steps say "not open"), and the
 * result is marked `partial` so the screen can say some of it could not be read.
 */
import { decodeDigitalTwinProjectionV1, type DigitalTwinProjectionV1 } from '../../shared/types/digital-twin';
import { decodeTwinPrivateThreadV1, type TwinPrivateThreadV1 } from '../../shared/types/digital-twin-answer';
import type { DigitalTwinInterimStateV1 } from '../../shared/types/digital-twin-interview';
import type { DigitalTwinPublicFacetRecordV1, DigitalTwinPublishReadinessV1 } from '../../shared/types/digital-twin-public';
import {
  isTwinCreationStepId,
  resolveTwinCreation,
  twinCreationInputFrom,
  type TwinCreationProjection,
  type TwinCreationStepId,
} from '../../shared/types/digital-twin-creation';
import { APP_URL } from '../config/env';
import type { MobileReadState } from './mobileReadState';
import {
  TWIN_STATUS_CAPABILITY,
  getTwinJson,
  isSafeTwinAgentId,
  readDigitalTwinEnvelope,
  resolveTwinTransport,
  type TwinStatusTransportInput,
} from './twinStatus';
import { joinWebUrl } from './webHandoff';

export interface MobileTwinCreation extends TwinCreationProjection {
  /** Some secondary read failed; the affected steps show their conservative state. */
  partial: boolean;
}

export type TwinCreationReadState = MobileReadState<MobileTwinCreation>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function twinPath(agentAccountId: string, suffix = ''): string {
  return `/v1/agents/${encodeURIComponent(agentAccountId)}/twin${suffix}`;
}

/** Where "到网页上继续" goes for one step (Web reads `?step=`; a locked step says what it waits for). */
export function twinCreationWebUrl(agentAccountId: string, step: TwinCreationStepId | null, baseUrl: string = APP_URL): string | null {
  if (!isSafeTwinAgentId(agentAccountId)) return null;
  const path = `/agents/${encodeURIComponent(agentAccountId)}/twin/create`;
  return joinWebUrl(baseUrl, step && isTwinCreationStepId(step) ? `${path}?step=${step}` : path);
}

function readInterim(status: number, body: unknown): { interim: DigitalTwinInterimStateV1 | null; ok: boolean } {
  if (status !== 200) return { interim: null, ok: false };
  const data = isRecord(body) && body.success === true && isRecord(body.data) ? body.data : null;
  if (!data) return { interim: null, ok: false };
  // Only `policy` matters to the model (policyAccepted); a missing interim is "not accepted yet".
  const interim = isRecord(data.interim) ? (data.interim as unknown as DigitalTwinInterimStateV1) : null;
  return { interim, ok: true };
}

function readThread(status: number, body: unknown): { thread: TwinPrivateThreadV1 | null; ok: boolean } {
  if (status !== 200 || !isRecord(body) || body.success !== true) return { thread: null, ok: false };
  if (body.data === null) return { thread: null, ok: true };
  const decoded = decodeTwinPrivateThreadV1(body.data);
  return 'reasonCode' in decoded ? { thread: null, ok: false } : { thread: decoded.value, ok: true };
}

function readPublish(
  status: number,
  body: unknown,
): { publish: { readiness: DigitalTwinPublishReadinessV1; record: DigitalTwinPublicFacetRecordV1 | null } | null; ok: boolean } {
  const envelope = readDigitalTwinEnvelope(status, body);
  // A switched-off public capability is a fact, not a failure: readiness stays unknown (null).
  if (envelope.ok === false) return { publish: null, ok: envelope.state.kind === 'unavailable' };
  const readiness = envelope.value.readiness;
  if (!isRecord(readiness) || typeof readiness.ready !== 'boolean' || !Array.isArray(readiness.checks)) return { publish: null, ok: false };
  const record = isRecord(envelope.value.record) ? (envelope.value.record as unknown as DigitalTwinPublicFacetRecordV1) : null;
  return { publish: { readiness: readiness as unknown as DigitalTwinPublishReadinessV1, record }, ok: true };
}

export async function fetchTwinCreation(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinCreationReadState> {
  if (!isSafeTwinAgentId(agentAccountId)) {
    return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'agent_account_required' };
  }
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'unauthorized', reason: 'authentication_required' };
  const now = input.now ?? (() => new Date().toISOString());
  const get = (suffix: string) => getTwinJson(transport, `${baseUrl}${twinPath(agentAccountId, suffix)}`, token);
  const [projectionRes, interviewRes, threadRes, publishRes] = await Promise.all([get(''), get('/interview'), get('/private/thread'), get('/public')]);
  if (!projectionRes) return { kind: 'error', retryable: true, reason: 'network' };
  if (projectionRes.status === 401) return { kind: 'unauthorized', reason: 'authentication_required' };
  if (projectionRes.status === 403) return { kind: 'forbidden', reason: 'agent_not_owned' };
  if (projectionRes.status === 404) return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'not_found' };
  if (projectionRes.status === 503) return { kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'capability_unavailable' };
  if (projectionRes.status !== 200) return { kind: 'error', retryable: projectionRes.status >= 500 || projectionRes.status === 429, reason: `http_${projectionRes.status}` };
  const data = isRecord(projectionRes.body) && projectionRes.body.success === true ? projectionRes.body.data : undefined;
  const decoded = decodeDigitalTwinProjectionV1(data);
  if ('reasonCode' in decoded) {
    return decoded.reasonCode === 'unknown_schema_version' || decoded.reasonCode === 'unknown_contract_version'
      ? { kind: 'unsupported_schema', schemaVersion: String(isRecord(data) ? data.schemaVersion : ''), reason: decoded.reasonCode }
      : { kind: 'error', retryable: false, reason: `projection_${decoded.reasonCode}` };
  }
  const projection: DigitalTwinProjectionV1 = decoded.value;
  if (projection.agentRef.id !== agentAccountId) return { kind: 'error', retryable: false, reason: 'projection_agent_mismatch' };

  const interim = interviewRes ? readInterim(interviewRes.status, interviewRes.body) : { interim: null, ok: false };
  const thread = threadRes ? readThread(threadRes.status, threadRes.body) : { thread: null, ok: false };
  const publish = publishRes ? readPublish(publishRes.status, publishRes.body) : { publish: null, ok: false };
  const view = resolveTwinCreation(
    twinCreationInputFrom({ projection, interim: interim.interim, thread: thread.thread, publish: publish.publish, localSources: [] }),
  );
  return { kind: 'ready', capturedAt: now(), data: { ...view, partial: !(interim.ok && thread.ok && publish.ok) } };
}
