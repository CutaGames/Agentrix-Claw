/**
 * twinEveryone — 人人都有分身 v1 on the phone (E116, owner 10-17).
 *
 *   GET  /v1/me/twin    the one-tap home (unavailable | needs_agent_choice | no_twin | ready)
 *   POST /v1/me/twin    one tap: make the private twin (and the Agent when there is none)
 *
 * Driven by the server switch (`DIGITAL_TWIN_EVERYONE_V1_ENABLED`): a 404 (older backend),
 * a 503 or `unavailable` all read as `absent`, and the screen keeps its old start card. Adding
 * to the twin, never-answer topics and publishing open the Web home (`/console/twin`); publishing
 * loosens access, so it stays on the Web (D16).
 */
import type { HttpTransportV1 } from '../../shared/client';
import { DIGITAL_TWIN_SCHEMA_VERSION } from '../../shared/types/digital-twin';
import { decodeDigitalTwinEveryoneHomeV1, type DigitalTwinEveryoneHomeV1 } from '../../shared/types/digital-twin-everyone';
import { APP_URL } from '../config/env';
import { resolveTwinTransport, twinAuthHeaders, type TwinStatusTransportInput } from './twinStatus';
import { joinWebUrl } from './webHandoff';

export const TWIN_EVERYONE_HOME_PATH = '/v1/me/twin';
export const TWIN_EVERYONE_WEB_PATH = '/console/twin';

const SAFE_AGENT_ID = /^[0-9a-zA-Z_-]{8,80}$/;

export type TwinEveryoneHomeRead =
  | { kind: 'ready'; home: Exclude<DigitalTwinEveryoneHomeV1, { status: 'unavailable' }> }
  /** No everyone flow on this server (switch off, older backend): keep the old screen. */
  | { kind: 'absent' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; reason: string };

export type TwinEveryoneCreateResult =
  | { kind: 'ready'; home: DigitalTwinEveryoneHomeV1 }
  /** The owner has several Agents and none has a twin: they choose on the Web home. */
  | { kind: 'choice_required' }
  | { kind: 'absent' }
  | { kind: 'error'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getTwinEveryoneWebUrl(baseUrl: string = APP_URL): string {
  return joinWebUrl(baseUrl, TWIN_EVERYONE_WEB_PATH);
}

export function readTwinEveryoneHome(status: number, body: unknown): TwinEveryoneHomeRead {
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 404 || status === 503) return { kind: 'absent' };
  if (status !== 200 || !isRecord(body) || body.success !== true) return { kind: 'error', reason: `http_${status}` };
  const decoded = decodeDigitalTwinEveryoneHomeV1(body.data);
  if (decoded.ok === false) return { kind: 'error', reason: `contract_${decoded.reasonCode}` };
  if (decoded.value.status === 'unavailable') return { kind: 'absent' };
  return { kind: 'ready', home: decoded.value as Exclude<DigitalTwinEveryoneHomeV1, { status: 'unavailable' }> };
}

export async function fetchTwinEveryoneHome(input: TwinStatusTransportInput = {}): Promise<TwinEveryoneHomeRead> {
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'unauthorized' };
  try {
    const response = await transport.request({ method: 'GET', path: `${baseUrl}${TWIN_EVERYONE_HOME_PATH}`, headers: twinAuthHeaders(token) });
    return readTwinEveryoneHome(response.status, response.body);
  } catch {
    return { kind: 'error', reason: 'network' };
  }
}

export function twinEveryoneIdempotencyKey(now: number = Date.now(), random: () => number = Math.random): string {
  return `twin-everyone-mobile:${now.toString(36)}-${Math.floor(random() * 1e12).toString(36)}`;
}

export async function createTwinEveryone(
  agentAccountId: string | null,
  idempotencyKey: string = twinEveryoneIdempotencyKey(),
  input: TwinStatusTransportInput & { transport?: HttpTransportV1 } = {},
): Promise<TwinEveryoneCreateResult> {
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'error', reason: 'authentication_required' };
  const body = { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, ...(agentAccountId && SAFE_AGENT_ID.test(agentAccountId) ? { agentAccountId } : {}) };
  try {
    const response = await transport.request({
      method: 'POST',
      path: `${baseUrl}${TWIN_EVERYONE_HOME_PATH}`,
      headers: { ...twinAuthHeaders(token), 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.slice(0, 120) },
      body,
    });
    if (response.status === 404 || response.status === 503) return { kind: 'absent' };
    if (response.status !== 200 || !isRecord(response.body) || response.body.success !== true) return { kind: 'error', reason: `http_${response.status}` };
    const result = response.body.data;
    if (!isRecord(result)) return { kind: 'error', reason: 'contract_result' };
    if (result.status === 'rejected') {
      return result.blockedBy === 'twin_everyone:agent_choice_required'
        ? { kind: 'choice_required' }
        : { kind: 'error', reason: typeof result.reasonCode === 'string' ? result.reasonCode : 'rejected' };
    }
    const decoded = decodeDigitalTwinEveryoneHomeV1(result.value);
    if (decoded.ok === false) return { kind: 'error', reason: `contract_${decoded.reasonCode}` };
    return { kind: 'ready', home: decoded.value };
  } catch {
    return { kind: 'error', reason: 'network' };
  }
}
