/**
 * twinRepublish — M0 + D16: put the twin back on its public page from the phone after it was taken down (撤回公开), with
 * the topics it had. The first publish (choosing topics) stays on the web. Publishing is loosening: the server wants the
 * preview digest of exactly this command and a recent sign-in, so the screen first shows what goes public, and the
 * device-key step-up (face / fingerprint) supplies the recent sign-in when the server asks for it.
 *   POST /v1/agents/:id/twin/public/preview  { schemaVersion, action: 'publish', topics }  → visibility preview + digest
 *   POST /v1/agents/:id/twin/public          { schemaVersion, action: 'publish', topics, previewDigest }
 */
import { DIGITAL_TWIN_SCHEMA_VERSION } from '../../shared/types/digital-twin';
import type { HttpResponseV1 } from '../../shared/client/transport';
import { readDigitalTwinEnvelope, isSafeTwinAgentId, twinPublicPath, type MobileTwinStatus } from './twinStatus';
import { withDeviceKeyStepUp, type DeviceKeyStepUpDeps, type DeviceKeyStepUpResult } from './deviceKeyStepUp';

/** The topics to put back, or null when the phone cannot republish (never published, blocked, already public, public off). */
export function twinRepublishTopics(status: MobileTwinStatus | null): string[] | null {
  if (!status || !status.publicAvailable) return null;
  if (status.visibility !== 'private' || status.published) return null;
  if (status.publishBlockedBy.length > 0 || status.topics.length === 0) return null;
  return [...status.topics];
}

export interface TwinRepublishPreview {
  topics: string[];
  previewDigest: string;
  requiresStepUp: boolean;
}

export type TwinRepublishOutcome =
  | { kind: 'done'; steppedUp: boolean }
  | { kind: 'step_up_failed'; result: Exclude<DeviceKeyStepUpResult, { kind: 'done' }> }
  | { kind: 'changed' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'failed'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Deps = Pick<DeviceKeyStepUpDeps, 'transport' | 'baseUrl' | 'token'>;

function post(deps: Deps, path: string, token: string, body: Record<string, unknown>): Promise<HttpResponseV1> {
  return deps.transport.request({
    method: 'POST',
    path: `${deps.baseUrl}${path}`,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
    body,
  });
}

export async function previewTwinRepublish(agentAccountId: string, topics: string[], deps: Deps): Promise<TwinRepublishPreview | { kind: 'failed'; reason: string }> {
  if (!isSafeTwinAgentId(agentAccountId)) return { kind: 'failed', reason: 'agent_account_required' };
  let response: HttpResponseV1;
  try {
    response = await post(deps, `${twinPublicPath(agentAccountId)}/preview`, deps.token, { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: 'publish', topics });
  } catch {
    return { kind: 'failed', reason: 'network' };
  }
  if (response.status < 200 || response.status >= 300) return { kind: 'failed', reason: `http_${response.status}` };
  const visibility = isRecord(response.body) && response.body.success === true && isRecord(response.body.data) ? response.body.data.visibility : null;
  if (!isRecord(visibility) || typeof visibility.previewDigest !== 'string' || !visibility.previewDigest || typeof visibility.requiresStepUp !== 'boolean') {
    return { kind: 'failed', reason: 'preview_malformed' };
  }
  return { topics: [...topics], previewDigest: visibility.previewDigest, requiresStepUp: visibility.requiresStepUp };
}

/** Publishes exactly the previewed command; steps up with the device key when the server asks for a recent sign-in. */
export async function republishTwin(
  agentAccountId: string,
  preview: TwinRepublishPreview,
  deps: DeviceKeyStepUpDeps & { onToken: (accessToken: string) => Promise<void> | void },
): Promise<TwinRepublishOutcome> {
  if (!isSafeTwinAgentId(agentAccountId)) return { kind: 'failed', reason: 'agent_account_required' };
  const body = { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: 'publish', topics: preview.topics, previewDigest: preview.previewDigest };
  let outcome;
  try {
    outcome = await withDeviceKeyStepUp((token) => post(deps, twinPublicPath(agentAccountId), token, body), deps);
  } catch {
    return { kind: 'failed', reason: 'network' };
  }
  if (outcome.kind === 'step_up_failed') return outcome;
  const { response, steppedUp } = outcome;
  // 409: what was previewed no longer matches (topics changed elsewhere); 428: no digest. Both mean preview again.
  if (response.status === 409 || response.status === 428) return { kind: 'changed' };
  const read = readDigitalTwinEnvelope(response.status, response.body);
  if (read.ok === false) return read.state.kind === 'unavailable' ? { kind: 'rejected', reason: read.state.reason } : { kind: 'failed', reason: read.state.kind };
  return { kind: 'done', steppedUp };
}
