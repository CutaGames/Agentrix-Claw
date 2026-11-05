/**
 * Digital Twin — Body Provider Gateway contract (design §6.7; Task 8; Seed Trial §0.1.2 row 1.10).
 *
 * A Body Provider turns an already-decided twin output into voice or avatar
 * media. It never decides what the twin says. The adapter contract is frozen
 * here; every adapter publishes a manifest (capabilities, consent dimensions it
 * needs, AI marking, deletion support, a credential *reference* — never the
 * credential). Every synthesis re-checks consent + stop at call time (8.4);
 * a provider that cannot serve degrades to text and never swaps in another
 * voice (8.5). The Seed Trial ships a fixture provider only; real providers
 * are self-serve API-key accounts the Product Owner creates (HUMAN).
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinRefV1,
} from './digital-twin';
import {
  digitalTwinConsentCoversV1,
  digitalTwinInterimRecordStatusV1,
  type DigitalTwinLikenessConsentRecordV1,
  type DigitalTwinLikenessDimensionV1,
  type DigitalTwinLikenessPurposeV1,
} from './digital-twin-consent';
import type { DigestRef } from './trust-loop-primitives';

const { isRecord, isNonEmptyString, isMember, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_BODY_MODALITIES_V1 = ['voice', 'avatar'] as const;
export type DigitalTwinBodyModalityV1 = (typeof DIGITAL_TWIN_BODY_MODALITIES_V1)[number];

/** Which likeness dimension each modality clones. Avatar needs face (and voice when it speaks). */
export const DIGITAL_TWIN_BODY_MODALITY_DIMENSIONS_V1: Readonly<Record<DigitalTwinBodyModalityV1, DigitalTwinLikenessDimensionV1[]>> = {
  voice: ['voice'],
  avatar: ['face', 'voice'],
};

export const DIGITAL_TWIN_BODY_ASSET_STATES_V1 = ['pending_review', 'approved', 'disabled', 'deleted'] as const;
export type DigitalTwinBodyAssetStateV1 = (typeof DIGITAL_TWIN_BODY_ASSET_STATES_V1)[number];

export const DIGITAL_TWIN_AI_MEDIA_LABEL_V1 = { 'zh-CN': 'AI 生成 · 数字分身', en: 'AI generated · digital twin' } as const;

export interface BodyProviderManifestV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  providerId: string;
  displayName: string;
  /** `fixture` produces no real media; `self_serve_api` is a Creator/PO-created API-key account. */
  kind: 'fixture' | 'self_serve_api';
  modalities: DigitalTwinBodyModalityV1[];
  capabilities: {
    voice?: { createAsset: boolean; streamReply: boolean; interrupt: boolean };
    avatar?: { renderJob: boolean; poll: boolean; webhook: boolean };
  };
  /** Purposes the provider needs on every relevant dimension before an asset may exist. */
  consentPurposesRequired: DigitalTwinLikenessPurposeV1[];
  /** Reference into the approved secret location (e.g. `secret:BODY_VOICE_API_KEY`); never a value. */
  credentialRef: string | null;
  aiMarking: 'explicit';
  deletionSupported: boolean;
  region: string;
  manifestVersion: number;
}

export interface DigitalTwinBodyAssetV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_body_asset';
  assetRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  providerId: string;
  modality: DigitalTwinBodyModalityV1;
  /** Consent record + revoke epoch the asset was created under; a later revoke epoch invalidates it. */
  consentRef: DigitalTwinRefV1;
  consentRevokeEpoch: number;
  /** Provider-side asset handle (opaque); never raw media. */
  providerAssetRef: string;
  /** Digest of the Creator's own sample the asset was made from (client-computed). */
  sampleDigest: DigestRef;
  state: DigitalTwinBodyAssetStateV1;
  createdAt: string;
  reviewedAt?: string;
  disabledAt?: string;
  deletedAt?: string;
}

export interface DigitalTwinBodyStateV1 {
  assets: DigitalTwinBodyAssetV1[];
  updatedAt: string;
}

export const DIGITAL_TWIN_BODY_REFUSAL_REASONS_V1 = [
  'capability_off',
  'kill_switch',
  'stopped',
  'consent_missing',
  'consent_expired',
  'consent_revoked',
  'consent_purpose_missing',
  'provider_not_allowlisted',
  'asset_missing',
  'asset_not_approved',
  'asset_consent_epoch_stale',
  'provider_unavailable',
] as const;
export type DigitalTwinBodyRefusalReasonV1 = (typeof DIGITAL_TWIN_BODY_REFUSAL_REASONS_V1)[number];

export type DigitalTwinBodyGateResultV1 = { allowed: true } | { allowed: false; reasonCode: DigitalTwinBodyRefusalReasonV1 };

/**
 * Consent gate for one modality at `now`. Fails closed on every missing piece:
 * no record, expired, revoked, a required dimension×purpose not granted, or the
 * provider not on the Creator's allowlist.
 */
export function checkDigitalTwinBodyConsentV1(input: {
  consent: DigitalTwinLikenessConsentRecordV1 | null | undefined;
  modality: DigitalTwinBodyModalityV1;
  purposes: DigitalTwinLikenessPurposeV1[];
  providerId: string;
  now: string;
}): DigitalTwinBodyGateResultV1 {
  const status = digitalTwinInterimRecordStatusV1(input.consent, input.now);
  if (status === 'absent') return { allowed: false, reasonCode: 'consent_missing' };
  if (status === 'expired') return { allowed: false, reasonCode: 'consent_expired' };
  if (status === 'revoked') return { allowed: false, reasonCode: 'consent_revoked' };
  const consent = input.consent!;
  for (const dimension of DIGITAL_TWIN_BODY_MODALITY_DIMENSIONS_V1[input.modality]) {
    for (const purpose of input.purposes) {
      if (!digitalTwinConsentCoversV1(consent, dimension, purpose, input.now)) return { allowed: false, reasonCode: 'consent_purpose_missing' };
    }
  }
  if (!consent.providerAllowlist.includes(input.providerId)) return { allowed: false, reasonCode: 'provider_not_allowlisted' };
  return { allowed: true };
}

export interface DigitalTwinBodyCreateAssetCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  modality: DigitalTwinBodyModalityV1;
  providerId: string;
  /** Digest of the Creator's own recorded sample (the client computed it; media never enters DT). */
  sampleDigest: DigestRef;
  /**
   * L5 (backlog backend 10): a voice the Creator already made in their own account at a bring-your-own-key provider
   * (ElevenLabs). The sample never passes through Agentrix; the asset only points at that voice. Required by those
   * providers, ignored by the fixture.
   */
  providerVoiceId?: string;
}

/** The Creator's own ElevenLabs account: the key is their BYO credential under the same provider id (`ai-provider`). */
export const ELEVENLABS_BODY_PROVIDER_ID_V1 = 'elevenlabs' as const;
/** Server switch that registers the ElevenLabs body provider (default off; on only when exactly `'1'`). */
export const DIGITAL_TWIN_BODY_ELEVENLABS_FLAG_V1 = 'DIGITAL_TWIN_BODY_ELEVENLABS_ENABLED' as const;
export const DIGITAL_TWIN_BODY_PROVIDER_VOICE_ID_PATTERN_V1 = /^[A-Za-z0-9]{8,64}$/;
/** Media handle of a rendered ElevenLabs reply: the history item in the Creator's own account (no audio is stored here). */
export const DIGITAL_TWIN_BODY_ELEVENLABS_MEDIA_REF_PATTERN_V1 = /^elevenlabs:history:[A-Za-z0-9]{8,64}$/;
/** Owner-only playback of a rendered reply, read through from the provider with the Creator's own key. */
export const DIGITAL_TWIN_BODY_MEDIA_ROUTE_V1 = 'GET /api/v1/agents/:agentId/twin/body/media/:mediaRef' as const;

export interface DigitalTwinBodySynthesizeCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  modality: DigitalTwinBodyModalityV1;
  /** The decided twin output this media renders; the body never invents text. */
  decisionRef: DigitalTwinRefV1;
  text: string;
}

export interface DigitalTwinBodySynthesisResultV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  status: 'rendered' | 'degraded_text' | 'refused';
  modality: DigitalTwinBodyModalityV1;
  decisionRef: DigitalTwinRefV1;
  /** Present when `rendered`: opaque provider media handle, never inline media. */
  mediaRef?: string;
  providerId?: string;
  assetRef?: DigitalTwinRefV1;
  reasonCode?: DigitalTwinBodyRefusalReasonV1;
  aiMarking: { explicit: true; label: typeof DIGITAL_TWIN_AI_MEDIA_LABEL_V1 };
  textDigest: DigestRef;
  createdAt: string;
}

export function decodeDigitalTwinBodyCreateAssetCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinBodyCreateAssetCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isMember(DIGITAL_TWIN_BODY_MODALITIES_V1, input.modality)) return fail('invalid_enum', ['modality']);
  if (!isNonEmptyString(input.providerId) || input.providerId.length > 64) return fail('invalid_shape', ['providerId']);
  if (
    !isRecord(input.sampleDigest) ||
    input.sampleDigest.algorithm !== 'sha-256' ||
    !isNonEmptyString(input.sampleDigest.canonicalization) ||
    !/^[0-9a-f]{64}$/.test(String(input.sampleDigest.value))
  ) {
    return fail('invalid_shape', ['sampleDigest']);
  }
  if (input.providerVoiceId !== undefined && (typeof input.providerVoiceId !== 'string' || !DIGITAL_TWIN_BODY_PROVIDER_VOICE_ID_PATTERN_V1.test(input.providerVoiceId))) {
    return fail('invalid_shape', ['providerVoiceId']);
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      modality: input.modality,
      providerId: input.providerId.trim(),
      sampleDigest: { algorithm: 'sha-256', canonicalization: input.sampleDigest.canonicalization, value: String(input.sampleDigest.value) },
      ...(typeof input.providerVoiceId === 'string' ? { providerVoiceId: input.providerVoiceId } : {}),
    },
  };
}

export function decodeDigitalTwinBodySynthesizeCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinBodySynthesizeCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isMember(DIGITAL_TWIN_BODY_MODALITIES_V1, input.modality)) return fail('invalid_enum', ['modality']);
  if (!isRecord(input.decisionRef) || input.decisionRef.kind !== 'answer_decision' || !isNonEmptyString(input.decisionRef.id)) return fail('invalid_ref', ['decisionRef']);
  if (!isNonEmptyString(input.text) || input.text.length > 4000) return fail('invalid_shape', ['text']);
  return {
    ok: true,
    value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, modality: input.modality, decisionRef: { kind: 'answer_decision', id: input.decisionRef.id }, text: input.text },
  };
}
