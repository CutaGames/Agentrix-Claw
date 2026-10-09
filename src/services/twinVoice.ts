/**
 * 分身的声音 on the phone (L5 backend 10, mobile): the twin speaks in a voice the owner made in their own ElevenLabs
 * account, and the owner can hear one of the twin's answers in it. Off unless the build sets
 * `EXPO_PUBLIC_TWIN_VOICE_ELEVENLABS_ENABLED=1`; the server answers 404 / 503 while its own switches are off.
 *
 * - Voice: `GET /v1/agents/:agentId/twin/body` (providers, assets, kill switch); `POST …/twin/body/assets` with the
 *   ElevenLabs voice ID (the asset digest covers the reference: no sample passes through Agentrix);
 *   `POST …/twin/body/assets/:assetRef/approve|disable|delete`. The consent tick and the ElevenLabs key stay on the Web.
 * - Ask once and hear it: `POST …/twin/private/ask` (the owner asks their own twin; one Idempotency-Key per question),
 *   `POST …/twin/body/synthesize` with that answer's decisionRef and text, then `GET …/twin/body/media/:mediaRef`,
 *   downloaded into this phone's cache for playback and deleted afterwards (nothing is stored on our side).
 * Bad ids, voice IDs and media handles are refused before any request. No React Native import: the transport, token
 * and downloader are injected (twinVoiceSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { DIGITAL_TWIN_SCHEMA_VERSION } from '../../shared/types/digital-twin';
import { DIGITAL_TWIN_QUESTION_MAX_CHARS, decodeTwinAnswerOutputV1, type TwinAnswerOutputV1 } from '../../shared/types/digital-twin-answer';
import {
  DIGITAL_TWIN_BODY_ASSET_STATES_V1,
  DIGITAL_TWIN_BODY_ELEVENLABS_MEDIA_REF_PATTERN_V1,
  DIGITAL_TWIN_BODY_PROVIDER_VOICE_ID_PATTERN_V1,
  DIGITAL_TWIN_BODY_REFUSAL_REASONS_V1,
  ELEVENLABS_BODY_PROVIDER_ID_V1,
  type DigitalTwinBodyAssetStateV1,
} from '../../shared/types/digital-twin-body';
import { computeDigest, type DigestRef } from '../../shared/types/trust-loop-primitives';

type Copy = { zh: string; en: string };

export function twinVoiceEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_VOICE_ENABLED = twinVoiceEnabled(process.env.EXPO_PUBLIC_TWIN_VOICE_ELEVENLABS_ENABLED);

/** Same shape the backend accepts for `:agentId` and `:assetRef` (and the Web client checks). */
const SAFE_ID = /^[0-9a-zA-Z_-]{8,80}$/;
/** Longest answer the phone offers to voice (a rendering spends the owner's ElevenLabs credits). */
export const TWIN_ANSWER_VOICE_TEXT_MAX = 4000;
const VOICE_ASSET_PREFIX = 'elevenlabs:voice:';

export type TwinVoiceAction = 'approve' | 'disable' | 'delete';
const TWIN_VOICE_ACTIONS: readonly TwinVoiceAction[] = ['approve', 'disable', 'delete'];

export function normalizeVoiceId(raw: string): string | null {
  const value = raw.trim();
  return DIGITAL_TWIN_BODY_PROVIDER_VOICE_ID_PATTERN_V1.test(value) ? value : null;
}

/** For a voice the owner brought, the asset's digest covers the reference to it (same rule as the Web). */
export function voiceReferenceDigest(voiceId: string): DigestRef {
  return computeDigest({ kind: 'byo_voice_reference', providerId: ELEVENLABS_BODY_PROVIDER_ID_V1, voiceId });
}

/** One key per question the owner sends. */
export function twinAskIdempotencyKey(now: number = Date.now(), random: () => number = Math.random): string {
  return `twin-ask-${now.toString(36)}-${Math.floor(random() * 0xffffffff).toString(36)}`;
}

export function twinBodyPath(agentId: string): string {
  return `/v1/agents/${encodeURIComponent(agentId)}/twin/body`;
}

export function twinPrivateAskPath(agentId: string): string {
  return `/v1/agents/${encodeURIComponent(agentId)}/twin/private/ask`;
}

export function twinBodyMediaPath(agentId: string, mediaRef: string): string {
  return `${twinBodyPath(agentId)}/media/${encodeURIComponent(mediaRef)}`;
}

export type TwinVoiceFailureV0 = 'invalid_input' | 'not_allowed' | 'not_found' | 'rejected' | 'unavailable' | 'unreadable' | 'no_session' | 'error';

export class TwinVoiceError extends Error {
  readonly failure: TwinVoiceFailureV0;
  /** The server's own reason (`blockedBy`, e.g. `body:elevenlabs:no_credential`); never provider text. */
  readonly blockedBy: string | null;
  readonly reasonCode: string | null;
  constructor(failure: TwinVoiceFailureV0, detail: { blockedBy?: string | null; reasonCode?: string | null } = {}) {
    super(failure);
    this.name = 'TwinVoiceError';
    this.failure = failure;
    this.blockedBy = detail.blockedBy ?? null;
    this.reasonCode = detail.reasonCode ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function detailOf(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return {};
  return isRecord(body.message) ? { ...body, ...body.message } : body;
}

/** A non-2xx answer as a `TwinVoiceError` (owner routes answer 404 for "not yours" too); `null` for 2xx. */
function httpFailure(status: number, body: unknown): TwinVoiceError | null {
  if (status === 401 || status === 403) return new TwinVoiceError('not_allowed');
  if (status === 404) return new TwinVoiceError('not_found');
  const detail = detailOf(body);
  if (status === 409) return new TwinVoiceError('rejected', { blockedBy: text(detail.blockedBy), reasonCode: text(detail.reasonCode) });
  if (status === 503) return new TwinVoiceError('unavailable', { blockedBy: text(detail.blockedBy), reasonCode: text(detail.reasonCode) });
  if (status < 200 || status >= 300) return new TwinVoiceError('error');
  return null;
}

/** HTTP status + `{ success, data: DigitalTwinCommandResultV1 }` → the applied value, or a `TwinVoiceError`. */
export function twinVoiceCommandValue(status: number, body: unknown): Record<string, unknown> {
  const failure = httpFailure(status, body);
  if (failure) throw failure;
  const data = isRecord(body) && body.success === true ? body.data : undefined;
  if (!isRecord(data)) throw new TwinVoiceError('unreadable');
  if (data.status === 'rejected') throw new TwinVoiceError('rejected', { blockedBy: text(data.blockedBy), reasonCode: text(data.reasonCode) });
  if (data.status !== 'applied' && data.status !== 'replayed') throw new TwinVoiceError('unreadable');
  if (!isRecord(data.value) || data.value.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) throw new TwinVoiceError('unreadable');
  return data.value;
}

export interface MobileTwinVoiceAsset {
  assetId: string;
  voiceId: string;
  state: DigitalTwinBodyAssetStateV1;
}

export interface MobileTwinVoiceView {
  /** The platform offers the owner's own ElevenLabs (the provider is in the manifest list). */
  elevenLabsOpen: boolean;
  killSwitch: boolean;
  /** The owner's ElevenLabs voices that are not deleted. */
  assets: MobileTwinVoiceAsset[];
}

function isBodyAsset(input: unknown): input is Record<string, unknown> & { assetRef: { id: string }; providerId: string; state: DigitalTwinBodyAssetStateV1 } {
  return (
    isRecord(input)
    && input.record === 'interim_seed_body_asset'
    && isRecord(input.assetRef)
    && typeof input.assetRef.id === 'string'
    && typeof input.providerId === 'string'
    && (input.modality === 'voice' || input.modality === 'avatar')
    && (DIGITAL_TWIN_BODY_ASSET_STATES_V1 as readonly unknown[]).includes(input.state)
  );
}

/** The body view as the phone shows it. One asset that does not read makes the whole view unreadable (as on the Web). */
export function normalizeTwinVoiceView(value: Record<string, unknown>): MobileTwinVoiceView {
  if (!Array.isArray(value.providers) || !Array.isArray(value.assets) || typeof value.killSwitch !== 'boolean') {
    throw new TwinVoiceError('unreadable');
  }
  const assets: MobileTwinVoiceAsset[] = [];
  for (const item of value.assets) {
    if (!isBodyAsset(item)) throw new TwinVoiceError('unreadable');
    if (item.providerId !== ELEVENLABS_BODY_PROVIDER_ID_V1 || item.modality !== 'voice' || item.state === 'deleted') continue;
    const handle = typeof item.providerAssetRef === 'string' ? item.providerAssetRef : '';
    assets.push({ assetId: item.assetRef.id, voiceId: handle.startsWith(VOICE_ASSET_PREFIX) ? handle.slice(VOICE_ASSET_PREFIX.length) : handle, state: item.state });
  }
  return {
    elevenLabsOpen: value.providers.some((provider) => isRecord(provider) && provider.providerId === ELEVENLABS_BODY_PROVIDER_ID_V1),
    killSwitch: value.killSwitch,
    assets,
  };
}

export type TwinVoiceRendering = { kind: 'media'; mediaRef: string } | { kind: 'no_voice'; reasonCode: string | null } | { kind: 'no_playback' };

/** The synthesis result → a playable ElevenLabs handle, or why there is none. Malformed results are unreadable. */
export function readTwinVoiceRendering(value: Record<string, unknown>, decisionId: string): TwinVoiceRendering {
  const reasonCode = value.reasonCode;
  if (
    !['rendered', 'degraded_text', 'refused'].includes(String(value.status))
    || value.modality !== 'voice'
    || !isRecord(value.decisionRef)
    || value.decisionRef.kind !== 'answer_decision'
    || value.decisionRef.id !== decisionId
    || !isRecord(value.aiMarking)
    || value.aiMarking.explicit !== true
    || (reasonCode !== undefined && !(DIGITAL_TWIN_BODY_REFUSAL_REASONS_V1 as readonly unknown[]).includes(reasonCode))
  ) {
    throw new TwinVoiceError('unreadable');
  }
  if (value.status !== 'rendered') return { kind: 'no_voice', reasonCode: typeof reasonCode === 'string' ? reasonCode : null };
  if (typeof value.mediaRef !== 'string' || !value.mediaRef || value.mediaRef.length > 200) throw new TwinVoiceError('unreadable');
  return DIGITAL_TWIN_BODY_ELEVENLABS_MEDIA_REF_PATTERN_V1.test(value.mediaRef) ? { kind: 'media', mediaRef: value.mediaRef } : { kind: 'no_playback' };
}

/** A decided answer the phone offers to voice: it has text, not too long, and a decision to point at. */
export function twinAnswerVoiceable(answer: TwinAnswerOutputV1): boolean {
  return !!answer.text.trim() && answer.text.length <= TWIN_ANSWER_VOICE_TEXT_MAX && !!answer.decision?.decisionRef?.id;
}

export interface TwinVoiceDownload {
  status: number;
  /** Local file with the response body (2xx only); `null` otherwise. */
  uri: string | null;
  contentType: string;
  /** Small response body for non-2xx answers (the refusal JSON); `null` for 2xx. */
  errorBody: string | null;
}

/** Saves `GET url` (with these headers) into the phone's cache; removes the file itself for non-2xx answers. */
export type TwinVoiceDownloader = (url: string, headers: Record<string, string>) => Promise<TwinVoiceDownload>;

export interface MobileTwinVoiceClientV0 {
  read(agentId: string): Promise<MobileTwinVoiceView>;
  addVoice(agentId: string, rawVoiceId: string): Promise<void>;
  decide(agentId: string, assetId: string, action: TwinVoiceAction): Promise<void>;
  ask(agentId: string, question: string, idempotencyKey: string, language?: 'zh-CN' | 'en'): Promise<TwinAnswerOutputV1>;
  render(agentId: string, answer: TwinAnswerOutputV1): Promise<TwinVoiceRendering>;
  /** Local file uri of the rendered reply; the caller plays it and deletes it. */
  fetchAudio(agentId: string, mediaRef: string): Promise<string>;
}

export function createMobileTwinVoiceClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
  download: TwinVoiceDownloader;
  /** Removes a downloaded file that turned out not to be audio. */
  discard?: (uri: string) => Promise<void>;
}): MobileTwinVoiceClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const auth = (): Record<string, string> => {
    const token = deps.token();
    if (!token) throw new TwinVoiceError('no_session');
    return { Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' };
  };
  const call = async (method: 'GET' | 'POST', path: string, init: { body?: unknown; idempotencyKey?: string } = {}): Promise<Record<string, unknown>> => {
    const headers: Record<string, string> = { Accept: 'application/json', ...auth(), ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}) };
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({ method, path: `${base}${path}`, headers, ...(method === 'POST' ? { body: init.body ?? {} } : {}) });
    } catch {
      throw new TwinVoiceError('unavailable');
    }
    return twinVoiceCommandValue(response.status, response.body);
  };
  return {
    async read(agentId) {
      if (!SAFE_ID.test(agentId)) throw new TwinVoiceError('invalid_input');
      return normalizeTwinVoiceView(await call('GET', twinBodyPath(agentId)));
    },
    async addVoice(agentId, rawVoiceId) {
      const voiceId = normalizeVoiceId(rawVoiceId);
      if (!SAFE_ID.test(agentId) || !voiceId) throw new TwinVoiceError('invalid_input');
      const value = await call('POST', `${twinBodyPath(agentId)}/assets`, {
        body: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, modality: 'voice', providerId: ELEVENLABS_BODY_PROVIDER_ID_V1, sampleDigest: voiceReferenceDigest(voiceId), providerVoiceId: voiceId },
      });
      if (!isBodyAsset(value)) throw new TwinVoiceError('unreadable');
    },
    async decide(agentId, assetId, action) {
      if (!SAFE_ID.test(agentId) || !SAFE_ID.test(assetId) || !TWIN_VOICE_ACTIONS.includes(action)) throw new TwinVoiceError('invalid_input');
      const value = await call('POST', `${twinBodyPath(agentId)}/assets/${encodeURIComponent(assetId)}/${action}`);
      if (!isBodyAsset(value) || value.assetRef.id !== assetId) throw new TwinVoiceError('unreadable');
    },
    async ask(agentId, question, idempotencyKey, language) {
      const clean = question.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      const key = idempotencyKey.trim();
      if (!SAFE_ID.test(agentId) || !clean || clean.length > DIGITAL_TWIN_QUESTION_MAX_CHARS || !key) throw new TwinVoiceError('invalid_input');
      const value = await call('POST', twinPrivateAskPath(agentId), {
        body: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, question: clean, ...(language ? { language } : {}) },
        idempotencyKey: key,
      });
      const decoded = decodeTwinAnswerOutputV1(value);
      // strict:false does not narrow on `ok`; the failure arm is the one with `reasonCode`.
      if ('reasonCode' in decoded) throw new TwinVoiceError('unreadable');
      return decoded.value;
    },
    async render(agentId, answer) {
      if (!SAFE_ID.test(agentId) || !twinAnswerVoiceable(answer)) throw new TwinVoiceError('invalid_input');
      const decisionRef = answer.decision.decisionRef;
      const value = await call('POST', `${twinBodyPath(agentId)}/synthesize`, {
        body: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, modality: 'voice', decisionRef, text: answer.text },
      });
      return readTwinVoiceRendering(value, decisionRef.id);
    },
    async fetchAudio(agentId, mediaRef) {
      if (!SAFE_ID.test(agentId) || !DIGITAL_TWIN_BODY_ELEVENLABS_MEDIA_REF_PATTERN_V1.test(mediaRef)) throw new TwinVoiceError('invalid_input');
      let result: TwinVoiceDownload;
      try {
        result = await deps.download(`${base}${twinBodyMediaPath(agentId, mediaRef)}`, { Accept: 'audio/*', ...auth() });
      } catch (error) {
        if (error instanceof TwinVoiceError) throw error;
        throw new TwinVoiceError('unavailable');
      }
      if (result.status >= 200 && result.status < 300) {
        const type = result.contentType.split(';')[0].trim().toLowerCase();
        if (result.uri && type.startsWith('audio/')) return result.uri;
        if (result.uri && deps.discard) await deps.discard(result.uri).catch(() => undefined);
        throw new TwinVoiceError('unreadable');
      }
      let body: unknown;
      try {
        body = result.errorBody ? JSON.parse(result.errorBody) : undefined;
      } catch {
        body = undefined;
      }
      throw httpFailure(result.status, body) ?? new TwinVoiceError('error');
    },
  };
}

// ── What the screen shows ───────────────────────────────────────────────────────────────

export const TWIN_VOICE_STATE_COPY: Readonly<Record<DigitalTwinBodyAssetStateV1, Copy>> = {
  pending_review: { zh: '等你确认', en: 'Waiting for you' },
  approved: { zh: '在用', en: 'In use' },
  disabled: { zh: '已停用', en: 'Disabled' },
  deleted: { zh: '已删除', en: 'Deleted' },
};

/** Adding or changing a voice failed: the server's reason (`blockedBy`) in plain words. Consent and keys are on the Web. */
export function twinVoiceFailureCopy(error: unknown): Copy {
  if (!(error instanceof TwinVoiceError)) return { zh: '没能完成这一步，过一会儿再试。', en: 'That did not go through. Try again shortly.' };
  if (error.failure === 'no_session' || error.failure === 'not_allowed') return { zh: '登录已失效，重新登录后再试。', en: 'Your sign-in has expired. Sign in again and retry.' };
  if (error.failure === 'invalid_input') return { zh: '声音 ID 是 8 到 64 位字母和数字。', en: 'A voice ID is 8 to 64 letters and digits.' };
  const reason = error.blockedBy ?? '';
  if (reason.endsWith(':no_credential')) return { zh: '先在网页「模型与密钥」里放你自己的 ElevenLabs key，再回来加声音。', en: 'Add your own ElevenLabs key under Models & keys on the Web first, then come back.' };
  if (reason.endsWith(':credential_rejected')) return { zh: 'ElevenLabs 拒绝了你的 key，去网页「模型与密钥」里换一把再试。', en: 'ElevenLabs rejected your key. Replace it under Models & keys on the Web and try again.' };
  if (reason.endsWith(':not_found') || reason.endsWith(':voice_not_found')) return { zh: '在你的 ElevenLabs 账户里找不到这个声音，核对一下声音 ID。', en: 'This voice is not in your ElevenLabs account. Check the voice ID.' };
  if (reason.endsWith(':voice_id_missing')) return { zh: '声音 ID 格式不对。', en: 'The voice ID is not valid.' };
  if (reason.endsWith(':rate_limited')) return { zh: 'ElevenLabs 现在限流，过一会儿再试。', en: 'ElevenLabs is rate limiting right now. Try again shortly.' };
  if (reason === 'body:provider_not_allowlisted') return { zh: '先在网页的分身同意里勾选「用我自己 ElevenLabs 账户里的声音」。', en: 'First tick “use the voice in my own ElevenLabs account” in the twin consent on the Web.' };
  if (reason.startsWith('body:consent_')) return { zh: '先在网页上同意用你的声音生成回答（声音 · 生成）。', en: 'First consent on the Web to replies in your voice (voice · generation).' };
  if (reason === 'flag:DIGITAL_TWIN_BODY_KILL_SWITCH') return { zh: '平台暂时停用了分身声音。', en: 'The platform has paused twin voices for now.' };
  if (reason === 'body:provider_unknown') return { zh: '平台还没开 ElevenLabs 声音。', en: 'ElevenLabs voices are not open on the platform yet.' };
  if (reason.startsWith('body:provider_unavailable:')) return { zh: '现在连不上 ElevenLabs，过一会儿再试。', en: 'ElevenLabs cannot be reached right now. Try again shortly.' };
  return { zh: '没能完成这一步，过一会儿再试。', en: 'That did not go through. Try again shortly.' };
}

/** Why an answer could not be voiced or played back (synthesis `reasonCode`, or the playback route's refusal). */
export function twinAnswerVoiceCopy(reasonCode: string | null | undefined): Copy {
  switch (reasonCode) {
    case 'asset_missing':
      return { zh: '还没有在用的声音。先在上面加上你的 ElevenLabs 声音并确认使用。', en: 'No voice is in use yet. Add your ElevenLabs voice above and confirm it first.' };
    case 'asset_not_approved':
      return { zh: '声音还没确认使用。在上面点「确认使用」。', en: 'The voice is not confirmed yet. Choose “Use this voice” above.' };
    case 'kill_switch':
      return { zh: '平台暂时停用了分身声音。', en: 'The platform has paused twin voices for now.' };
    case 'stopped':
      return { zh: '分身现在是停止状态，恢复后才能用声音回答。', en: 'The twin is stopped; resume it to use the voice.' };
    case 'capability_off':
      return { zh: '分身声音还没开放。', en: 'Twin voices are not open yet.' };
    case 'provider_not_allowlisted':
      return { zh: '先在网页的分身同意里勾选「用我自己 ElevenLabs 账户里的声音」。', en: 'First tick “use the voice in my own ElevenLabs account” in the twin consent on the Web.' };
    case 'consent_missing':
    case 'consent_expired':
    case 'consent_revoked':
    case 'consent_purpose_missing':
    case 'asset_consent_epoch_stale':
      return { zh: '用你的声音生成回答的同意不在了（没给、过期或撤回过）。在网页上重新同意后，再确认一次声音。', en: 'Your consent to replies in your voice is not in place (never given, expired or revoked). Consent again on the Web, then confirm the voice again.' };
    case 'provider_unavailable':
      return { zh: '这次没能生成语音：ElevenLabs 连不上，或者你的账户设置了不保留生成记录。回答照常以文字显示。', en: 'No voice this time: ElevenLabs could not be reached, or your account keeps no generation history. The answer stays as text.' };
    default:
      return { zh: '这次没能播放，过一会儿再试。', en: 'It could not be played this time. Try again shortly.' };
  }
}

/** Why a playback failed, for `twinAnswerVoiceCopy`: the route's refusal reason, or the provider being unreachable. */
export function twinPlaybackReason(error: unknown): string | null {
  if (!(error instanceof TwinVoiceError)) return null;
  if (error.failure === 'unavailable') return 'provider_unavailable';
  return error.failure === 'rejected' ? error.reasonCode : null;
}

export function twinAskFailureCopy(error: unknown): Copy {
  const failure = error instanceof TwinVoiceError ? error.failure : 'error';
  if (failure === 'invalid_input') return { zh: `问题不能为空，最多 ${DIGITAL_TWIN_QUESTION_MAX_CHARS} 字。`, en: `Ask something, at most ${DIGITAL_TWIN_QUESTION_MAX_CHARS} characters.` };
  if (failure === 'no_session' || failure === 'not_allowed') return { zh: '登录已失效，重新登录后再试。', en: 'Your sign-in has expired. Sign in again and retry.' };
  if (failure === 'not_found') return { zh: '这只 Agent 还没有分身，或者不是你的。', en: 'This Agent has no twin yet, or it is not yours.' };
  if (failure === 'unavailable') return { zh: '分身现在答不了，过一会儿再试。', en: 'The twin cannot answer right now. Try again shortly.' };
  return { zh: '这次没问成，过一会儿再试。', en: 'That question did not go through. Try again shortly.' };
}
