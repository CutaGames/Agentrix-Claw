/**
 * Twin voice on the phone (twinVoice.ts; contracts shared/types/digital-twin-body.ts and digital-twin-answer.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { DIGITAL_TWIN_SCHEMA_VERSION, computeTwinAnswerDecisionDigestV1, type TwinAnswerDecisionV1 } from '../../../shared/types/digital-twin';
import { computeTwinAnswerOutputDigestV1, type TwinAnswerOutputV1 } from '../../../shared/types/digital-twin-answer';
import { computeDigest } from '../../../shared/types/trust-loop-primitives';
import {
  TwinVoiceError,
  createMobileTwinVoiceClient,
  normalizeVoiceId,
  twinAnswerVoiceCopy,
  twinAnswerVoiceable,
  twinAskFailureCopy,
  twinAskIdempotencyKey,
  twinPlaybackReason,
  twinVoiceEnabled,
  twinVoiceFailureCopy,
  voiceReferenceDigest,
  type TwinVoiceDownload,
} from '../twinVoice';

const AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSET = 'asset_0123456789';
const BASE = 'https://api.example.test/api/';
const API = 'https://api.example.test/api';
const NOW = '2026-10-03T12:00:00.000Z';
const MEDIA = 'elevenlabs:history:AbCdEf123456';
const FILE = 'file:///cache/twin-voice/reply.mp3';

function decision(overrides: Partial<TwinAnswerDecisionV1> = {}): TwinAnswerDecisionV1 {
  const body: Omit<TwinAnswerDecisionV1, 'decisionDigest'> = {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    decisionRef: { kind: 'answer_decision', id: 'd-1' },
    profileRef: { kind: 'digital_twin_profile', id: 'p-1' },
    facet: 'private',
    threadRef: { kind: 'thread', id: 't-1' },
    answerClass: 'confirmed',
    sourceRefs: [{ kind: 'canonical_item', id: 'm1' }],
    requiresHumanHandoff: false,
    policyVersion: 'twin-answer-policy/v0;interim_seed_policy@0',
    requestDigest: computeDigest({ q: 1 }),
    createdAt: NOW,
    ...overrides,
  };
  return { ...body, decisionDigest: computeTwinAnswerDecisionDigestV1(body) };
}

function output(overrides: Partial<TwinAnswerOutputV1> = {}): TwinAnswerOutputV1 {
  const d = overrides.decision ?? decision();
  const text = overrides.text ?? '课程设计咨询通常四周交付 [S1]。';
  return {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    decision: d,
    turnRef: { kind: 'turn', id: 'turn-1' },
    text,
    marker: d.answerClass,
    sources: [{ canonicalId: 'm1', kind: 'memory', excerpt: '课程设计咨询按项目收费', sourceItemRef: 's1' }],
    unsupportedSentences: [],
    handoff: [],
    model: { provider: 'fixture', modelUsed: 'f', byo: false },
    outputDigest: computeTwinAnswerOutputDigestV1({ decisionDigest: d.decisionDigest, text }),
    ...overrides,
  };
}

const applied = (value: unknown) => ({ success: true, data: { status: 'applied', value } });
const asset = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
  record: 'interim_seed_body_asset',
  assetRef: { kind: 'body_asset', id: ASSET },
  profileRef: { kind: 'digital_twin_profile', id: 'p-1' },
  providerId: 'elevenlabs',
  modality: 'voice',
  consentRef: { kind: 'likeness_consent', id: 'c-1' },
  consentRevokeEpoch: 0,
  providerAssetRef: 'elevenlabs:voice:Voice12345',
  sampleDigest: computeDigest({ s: 1 }),
  state: 'pending_review',
  createdAt: NOW,
  ...overrides,
});
const bodyView = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
  providers: [{ providerId: 'elevenlabs', modalities: ['voice'] }],
  assets: [asset()],
  killSwitch: false,
  ...overrides,
});
const synthesis = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
  status: 'rendered',
  modality: 'voice',
  decisionRef: { kind: 'answer_decision', id: 'd-1' },
  aiMarking: { explicit: true, label: 'AI 生成 · 数字分身' },
  mediaRef: MEDIA,
  ...overrides,
});
const reply = (body: unknown, status = 200): HttpResponseV1 => ({ status, headers: {}, body });
const audio = (overrides: Partial<TwinVoiceDownload> = {}): TwinVoiceDownload => ({ status: 200, uri: FILE, contentType: 'audio/mpeg', errorBody: null, ...overrides });

function client(
  responses: Array<HttpResponseV1 | Error>,
  options: { token?: string | null; download?: (url: string, headers: Record<string, string>) => Promise<TwinVoiceDownload>; discard?: (uri: string) => Promise<void> } = {},
) {
  const requests: HttpRequestV1[] = [];
  const downloads: Array<{ url: string; headers: Record<string, string> }> = [];
  const transport: HttpTransportV1 = {
    async request(request) {
      requests.push(request);
      const next = responses.shift();
      if (!next) throw new Error('no response queued');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const download = options.download ?? (async () => Promise.reject(new Error('no download expected')));
  const voice = createMobileTwinVoiceClient({
    transport,
    baseUrl: BASE,
    token: () => (options.token === undefined ? 'token-1' : options.token),
    download: async (url, headers) => {
      downloads.push({ url, headers });
      return download(url, headers);
    },
    discard: options.discard,
  });
  return { voice, requests, downloads };
}

describe('twin voice on the phone · switch, voice ID, digest', () => {
  it('is on only when the build sets "1"', () => {
    expect(twinVoiceEnabled('1')).toBe(true);
    for (const value of ['0', 'true', '', undefined, 1]) expect(twinVoiceEnabled(value)).toBe(false);
  });

  it('a voice ID is 8 to 64 letters and digits; the digest covers the reference exactly as on the Web', () => {
    expect(normalizeVoiceId('  Voice12345 ')).toBe('Voice12345');
    for (const bad of ['short', 'has space 12', 'x'.repeat(65), 'voice-12345', '']) expect(normalizeVoiceId(bad)).toBeNull();
    expect(voiceReferenceDigest('Voice12345')).toEqual(computeDigest({ kind: 'byo_voice_reference', providerId: 'elevenlabs', voiceId: 'Voice12345' }));
    expect(voiceReferenceDigest('Voice12345')).not.toEqual(voiceReferenceDigest('Voice12346'));
  });

  it('every question gets its own idempotency key', () => {
    expect(twinAskIdempotencyKey(1, () => 0.5)).not.toBe(twinAskIdempotencyKey(2, () => 0.5));
    expect(twinAskIdempotencyKey(1, () => 0.25)).not.toBe(twinAskIdempotencyKey(1, () => 0.5));
  });
});

describe('twin voice on the phone · the voice', () => {
  it('reads the body with the owner token and keeps only ElevenLabs voices that are not deleted', async () => {
    const { voice, requests } = client([
      reply(applied(bodyView({
        assets: [
          asset(),
          asset({ assetRef: { kind: 'body_asset', id: 'asset_deleted01' }, state: 'deleted' }),
          asset({ assetRef: { kind: 'body_asset', id: 'asset_fixture01' }, providerId: 'fixture', providerAssetRef: 'fixture:voice:1' }),
          asset({ assetRef: { kind: 'body_asset', id: 'asset_avatar001' }, modality: 'avatar' }),
        ],
      }))),
    ]);
    await expect(voice.read(AGENT)).resolves.toEqual({ elevenLabsOpen: true, killSwitch: false, assets: [{ assetId: ASSET, voiceId: 'Voice12345', state: 'pending_review' }] });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', path: `${API}/v1/agents/${AGENT}/twin/body`, headers: { Authorization: 'Bearer token-1', 'X-Agentrix-Surface': 'mobile' } });
  });

  it('says when ElevenLabs is not open on the platform and when the kill switch holds', async () => {
    await expect(client([reply(applied(bodyView({ providers: [{ providerId: 'fixture', modalities: ['voice'] }], assets: [] })))]).voice.read(AGENT)).resolves.toMatchObject({ elevenLabsOpen: false });
    await expect(client([reply(applied(bodyView({ killSwitch: true })))]).voice.read(AGENT)).resolves.toMatchObject({ killSwitch: true });
  });

  it('one asset it cannot read makes the whole view unreadable; 404, 503 and rejections keep their meaning', async () => {
    await expect(client([reply(applied(bodyView({ assets: [{ record: 'other' }] })))]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client([reply(applied({ ...bodyView(), schemaVersion: 99 }))]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client([reply(applied(bodyView({ killSwitch: 'no' })))]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client([reply({}, 404)]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'not_found' });
    await expect(client([reply({}, 401)]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'not_allowed' });
    await expect(client([reply({ blockedBy: 'flag:DIGITAL_TWIN_BODY_ENABLED' }, 503)]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'unavailable', blockedBy: 'flag:DIGITAL_TWIN_BODY_ENABLED' });
    await expect(client([reply({ success: true, data: { status: 'rejected', reasonCode: 'capability_off', blockedBy: 'body:capability_off' } })]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'rejected', blockedBy: 'body:capability_off' });
    await expect(client([new Error('offline')]).voice.read(AGENT)).rejects.toMatchObject({ failure: 'unavailable' });
  });

  it('adds a voice by its ID; the digest covers the reference and no sample is sent', async () => {
    const { voice, requests } = client([reply(applied(asset()))]);
    await voice.addVoice(AGENT, ' Voice12345 ');
    expect(requests[0]).toMatchObject({ method: 'POST', path: `${API}/v1/agents/${AGENT}/twin/body/assets` });
    expect(requests[0].body).toEqual({ schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, modality: 'voice', providerId: 'elevenlabs', sampleDigest: voiceReferenceDigest('Voice12345'), providerVoiceId: 'Voice12345' });
  });

  it('a bad voice ID, a bad agent id or no session sends nothing', async () => {
    const bad = client([]);
    await expect(bad.voice.addVoice(AGENT, 'no')).rejects.toMatchObject({ failure: 'invalid_input' });
    await expect(bad.voice.addVoice('../../admin', 'Voice12345')).rejects.toMatchObject({ failure: 'invalid_input' });
    await expect(bad.voice.read('a/b')).rejects.toMatchObject({ failure: 'invalid_input' });
    const anonymous = client([], { token: null });
    await expect(anonymous.voice.addVoice(AGENT, 'Voice12345')).rejects.toMatchObject({ failure: 'no_session' });
    expect(bad.requests).toHaveLength(0);
    expect(anonymous.requests).toHaveLength(0);
  });

  it("the server's reason comes back in plain words; the consent and the key point to the Web", async () => {
    const error = await client([reply({ message: { reasonCode: 'invalid_request', blockedBy: 'body:elevenlabs:no_credential' } }, 409)]).voice.addVoice(AGENT, 'Voice12345').catch((caught) => caught);
    expect(error).toBeInstanceOf(TwinVoiceError);
    expect(error).toMatchObject({ failure: 'rejected', blockedBy: 'body:elevenlabs:no_credential' });
    expect(twinVoiceFailureCopy(error).zh).toContain('网页「模型与密钥」');
    expect(twinVoiceFailureCopy(new TwinVoiceError('rejected', { blockedBy: 'body:elevenlabs:voice_not_found' })).zh).toContain('找不到这个声音');
    expect(twinVoiceFailureCopy(new TwinVoiceError('rejected', { blockedBy: 'body:provider_not_allowlisted' })).zh).toContain('网页的分身同意');
    expect(twinVoiceFailureCopy(new TwinVoiceError('rejected', { blockedBy: 'body:consent_missing' })).en).toContain('on the Web');
    expect(twinVoiceFailureCopy(new TwinVoiceError('unavailable', { blockedBy: 'flag:DIGITAL_TWIN_BODY_KILL_SWITCH' })).zh).toBe('平台暂时停用了分身声音。');
    expect(twinVoiceFailureCopy(new TwinVoiceError('no_session')).zh).toContain('重新登录');
    expect(twinVoiceFailureCopy(new Error('ElevenLabs said: quota exceeded for sk_live_x')).zh).toBe('没能完成这一步，过一会儿再试。');
  });

  it('confirms, disables and deletes one asset; a bad asset id or action sends nothing; a reply for another asset is unreadable', async () => {
    const { voice, requests } = client([reply(applied(asset({ state: 'approved' }))), reply(applied(asset({ state: 'disabled' }))), reply(applied(asset({ state: 'deleted' })))]);
    await voice.decide(AGENT, ASSET, 'approve');
    await voice.decide(AGENT, ASSET, 'disable');
    await voice.decide(AGENT, ASSET, 'delete');
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      `POST ${API}/v1/agents/${AGENT}/twin/body/assets/${ASSET}/approve`,
      `POST ${API}/v1/agents/${AGENT}/twin/body/assets/${ASSET}/disable`,
      `POST ${API}/v1/agents/${AGENT}/twin/body/assets/${ASSET}/delete`,
    ]);
    const guarded = client([]);
    await expect(guarded.voice.decide(AGENT, 'a/../b', 'approve')).rejects.toMatchObject({ failure: 'invalid_input' });
    await expect(guarded.voice.decide(AGENT, ASSET, 'publish' as never)).rejects.toMatchObject({ failure: 'invalid_input' });
    expect(guarded.requests).toHaveLength(0);
    await expect(client([reply(applied(asset({ assetRef: { kind: 'body_asset', id: 'asset_someone1' } })))]).voice.decide(AGENT, ASSET, 'approve')).rejects.toMatchObject({ failure: 'unreadable' });
  });
});

describe('twin voice on the phone · ask once and hear it', () => {
  it('asks the twin privately with one Idempotency-Key and reads the answer with the shared decoder', async () => {
    const answer = output();
    const { voice, requests } = client([reply(applied(answer))]);
    await expect(voice.ask(AGENT, '  课程设计多久交付？\u0007 ', 'key-1', 'zh-CN')).resolves.toEqual(answer);
    expect(requests[0]).toMatchObject({ method: 'POST', path: `${API}/v1/agents/${AGENT}/twin/private/ask`, headers: { 'Idempotency-Key': 'key-1', Authorization: 'Bearer token-1' } });
    expect(requests[0].body).toEqual({ schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, question: '课程设计多久交付？', language: 'zh-CN' });
  });

  it('an empty or too long question, or a missing key, sends nothing; a malformed answer is unreadable', async () => {
    const guarded = client([]);
    await expect(guarded.voice.ask(AGENT, '   ', 'key-1')).rejects.toMatchObject({ failure: 'invalid_input' });
    await expect(guarded.voice.ask(AGENT, 'q'.repeat(2001), 'key-1')).rejects.toMatchObject({ failure: 'invalid_input' });
    await expect(guarded.voice.ask(AGENT, 'q', ' ')).rejects.toMatchObject({ failure: 'invalid_input' });
    expect(guarded.requests).toHaveLength(0);
    await expect(client([reply(applied({ ...output(), marker: 'inferred' }))]).voice.ask(AGENT, 'q', 'key-2')).rejects.toMatchObject({ failure: 'unreadable' });
    expect(twinAskFailureCopy(new TwinVoiceError('invalid_input')).zh).toContain('2000');
  });

  it('renders a decided answer with its decisionRef and text; only an ElevenLabs handle can be played', async () => {
    const answer = output();
    const { voice, requests } = client([reply(applied(synthesis())), reply(applied(synthesis({ mediaRef: 'fixture:media:1' })))]);
    await expect(voice.render(AGENT, answer)).resolves.toEqual({ kind: 'media', mediaRef: MEDIA });
    expect(requests[0]).toMatchObject({ method: 'POST', path: `${API}/v1/agents/${AGENT}/twin/body/synthesize` });
    expect(requests[0].body).toEqual({ schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, modality: 'voice', decisionRef: { kind: 'answer_decision', id: 'd-1' }, text: answer.text });
    await expect(voice.render(AGENT, answer)).resolves.toEqual({ kind: 'no_playback' });
  });

  it('a degraded or refused rendering says why; a rendering for another decision or without the AI marking is unreadable', async () => {
    const answer = output();
    await expect(client([reply(applied(synthesis({ status: 'degraded_text', mediaRef: undefined, reasonCode: 'provider_unavailable' })))]).voice.render(AGENT, answer)).resolves.toEqual({ kind: 'no_voice', reasonCode: 'provider_unavailable' });
    await expect(client([reply(applied(synthesis({ status: 'refused', mediaRef: undefined, reasonCode: 'asset_not_approved' })))]).voice.render(AGENT, answer)).resolves.toEqual({ kind: 'no_voice', reasonCode: 'asset_not_approved' });
    await expect(client([reply(applied(synthesis({ decisionRef: { kind: 'answer_decision', id: 'd-2' } })))]).voice.render(AGENT, answer)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client([reply(applied(synthesis({ aiMarking: { explicit: false } })))]).voice.render(AGENT, answer)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client([reply(applied(synthesis({ reasonCode: 'made_up' })))]).voice.render(AGENT, answer)).rejects.toMatchObject({ failure: 'unreadable' });
    await expect(client([reply(applied(synthesis({ mediaRef: '' })))]).voice.render(AGENT, answer)).rejects.toMatchObject({ failure: 'unreadable' });
    expect(twinAnswerVoiceCopy('asset_missing').zh).toContain('还没有在用的声音');
    expect(twinAnswerVoiceCopy('consent_revoked').zh).toContain('在网页上重新同意');
    expect(twinAnswerVoiceCopy('provider_unavailable').zh).toContain('回答照常以文字显示');
    expect(twinAnswerVoiceCopy(null).zh).toBe('这次没能播放，过一会儿再试。');
  });

  it('offers a voice only for answers with text, up to 4000 characters, and never sends one it would not offer', async () => {
    expect(twinAnswerVoiceable(output())).toBe(true);
    expect(twinAnswerVoiceable(output({ text: '   ' }))).toBe(false);
    expect(twinAnswerVoiceable(output({ text: 'a'.repeat(4001) }))).toBe(false);
    const guarded = client([]);
    await expect(guarded.voice.render(AGENT, output({ text: 'a'.repeat(4001) }))).rejects.toMatchObject({ failure: 'invalid_input' });
    expect(guarded.requests).toHaveLength(0);
  });

  it('plays back only audio, from the owner route with the owner token; a malformed handle never goes out', async () => {
    const { voice, downloads } = client([], { download: async () => audio() });
    await expect(voice.fetchAudio(AGENT, MEDIA)).resolves.toBe(FILE);
    expect(downloads).toEqual([{ url: `${API}/v1/agents/${AGENT}/twin/body/media/${encodeURIComponent(MEDIA)}`, headers: { Accept: 'audio/*', Authorization: 'Bearer token-1', 'X-Agentrix-Surface': 'mobile' } }]);
    await expect(voice.fetchAudio(AGENT, 'fixture:media:1')).rejects.toMatchObject({ failure: 'invalid_input' });
    await expect(voice.fetchAudio(AGENT, `${MEDIA}/../x`)).rejects.toMatchObject({ failure: 'invalid_input' });
    expect(downloads).toHaveLength(1);
    const anonymous = client([], { token: null, download: async () => audio() });
    await expect(anonymous.voice.fetchAudio(AGENT, MEDIA)).rejects.toMatchObject({ failure: 'no_session' });
    expect(anonymous.downloads).toHaveLength(0);
  });

  it('a download that is not audio is deleted; a refused or unreachable playback says why', async () => {
    const discarded: string[] = [];
    const html = client([], { download: async () => audio({ contentType: 'text/html; charset=utf-8' }), discard: async (uri) => void discarded.push(uri) });
    await expect(html.voice.fetchAudio(AGENT, MEDIA)).rejects.toMatchObject({ failure: 'unreadable' });
    expect(discarded).toEqual([FILE]);
    const refused = await client([], { download: async () => audio({ status: 409, uri: null, contentType: 'application/json', errorBody: JSON.stringify({ message: { reasonCode: 'asset_not_approved' } }) }) }).voice.fetchAudio(AGENT, MEDIA).catch((caught) => caught);
    expect(twinPlaybackReason(refused)).toBe('asset_not_approved');
    const down = await client([], { download: async () => audio({ status: 503, uri: null, contentType: '' }) }).voice.fetchAudio(AGENT, MEDIA).catch((caught) => caught);
    expect(twinPlaybackReason(down)).toBe('provider_unavailable');
    const gone = await client([], { download: async () => audio({ status: 404, uri: null, contentType: '' }) }).voice.fetchAudio(AGENT, MEDIA).catch((caught) => caught);
    expect(gone).toMatchObject({ failure: 'not_found' });
    expect(twinPlaybackReason(gone)).toBeNull();
    await expect(client([], { download: async () => Promise.reject(new Error('io')) }).voice.fetchAudio(AGENT, MEDIA)).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

describe('twin voice on the phone · screen wiring', () => {
  const read = (relative: string) => fs.readFileSync(path.join(__dirname, '..', '..', relative), 'utf8');

  it('the entry and the screen exist only behind the build switch', () => {
    expect(read('screens/four-zone/TwinHomeScreen.tsx')).toMatch(/\{TWIN_VOICE_ENABLED \? \(\s*<TouchableOpacity[\s\S]*?navigate\('TwinVoice'\)/);
    expect(read('navigation/four-zone/FourZoneTabNavigator.tsx')).toMatch(/\{TWIN_VOICE_ENABLED \? \(\s*<TwinStack\.Screen name="TwinVoice"/);
  });

  it('the player sits next to the AI label, and the audio is unloaded and its file deleted when the answer goes away', () => {
    const screen = read('screens/four-zone/TwinVoiceScreen.tsx');
    expect(screen).toContain('DIGITAL_TWIN_AI_MEDIA_LABEL_V1');
    expect(screen).toMatch(/useEffect\(\s*\(\) => \(\) => \{[\s\S]*?unloadAsync\(\)[\s\S]*?deleteTwinVoiceFile\(fileRef\.current\)/);
    expect(screen).not.toMatch(/dangerouslySetInnerHTML|WebView/);
  });
});
