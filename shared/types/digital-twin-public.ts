/**
 * Digital Twin — Official Public Twin (design §6.6/§6.8; tasks Task 10; Seed Trial §0.1).
 *
 * Text-only in Seed Trial. The public Facet is a projection over the same Agent
 * (`/share/agent/:id`), never a second identity or handle. Publishing is the
 * Creator's explicit command and is possible only when:
 *   - the master + `public` flags are on,
 *   - `interim_seed_represents` is active (operator_verified, unexpired),
 *   - `interim_seed_likeness_consent` covers `style:display`,
 *   - the interim scope policy exists (`notAGrant`), the twin is not stopped and
 *     the minimum Self Model is linked.
 * Any unknown/expired/revoked prerequisite fails closed; the Visitor sees
 * `paused`, never a fake answer.
 *
 * Visitor questions are never written into the Creator's Self Model; they land
 * in the Review Queue as public-facet items (the question-to-content loop).
 * The public projection carries zero raw identity data and no PII beyond what
 * the Creator confirmed (handoff defaults, offer drafts).
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinAnswerClassV1,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinNoAnswerReasonV1,
  type DigitalTwinPrerequisiteStatusV1,
  type DigitalTwinRefV1,
} from './digital-twin';
import type { DigestRef } from './trust-loop-primitives';

const { isRecord, isNonEmptyString, isIsoTimestamp, isMember, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_AI_DISCLOSURE_V1 = {
  'zh-CN': '这是 AI 分身，不是本人。回答分三类：本人确认过的内容、AI 推断（单独标注）、不代答转本人。分身不会替本人承诺价格、合同或退款。',
  en: 'This is an AI twin, not the person. Answers are labelled: confirmed by the person, AI inference (labelled), or handed to the person. The twin never commits to prices, contracts or refunds.',
} as const;

export const DIGITAL_TWIN_PUBLIC_FACET_STATES_V1 = ['published', 'unpublished'] as const;
export type DigitalTwinPublicFacetStateV1 = (typeof DIGITAL_TWIN_PUBLIC_FACET_STATES_V1)[number];

export const DIGITAL_TWIN_PUBLIC_TOPIC_MAX = 20;
export const DIGITAL_TWIN_PUBLIC_TOPIC_MAX_CHARS = 40;
export const DIGITAL_TWIN_PUBLIC_QUESTION_MAX_CHARS = 500;
export const DIGITAL_TWIN_VISITOR_SESSION_RE = /^[0-9A-Za-z_-]{8,64}$/;

/** Seed Trial record: the Creator's publish decision. Stored in the interim record JSON. */
export interface DigitalTwinPublicFacetRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_public_facet';
  notAGrant: true;
  facetRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  state: DigitalTwinPublicFacetStateV1;
  /** Optional topic allowlist shown to Visitors; empty = the Creator's whole public Facet. */
  topics: string[];
  version: number;
  publishedAt?: string;
  unpublishedAt?: string;
  /** Bumped on every publish/unpublish; part of every public cache key. */
  revokeEpoch: number;
}

export interface DigitalTwinPublishCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: 'publish' | 'unpublish';
  topics?: string[];
}

/** Why publishing is (not) possible right now; every line is a fact the Creator can act on. */
export interface DigitalTwinPublishReadinessV1 {
  ready: boolean;
  checks: Array<{ check: 'public_flag' | 'represents' | 'likeness_style_display' | 'policy' | 'self_model' | 'not_stopped'; status: 'ok' | 'blocked'; detail: string }>;
}

export const DIGITAL_TWIN_PUBLIC_STATES_V1 = ['available', 'paused', 'unavailable'] as const;
export type DigitalTwinPublicStateV1 = (typeof DIGITAL_TWIN_PUBLIC_STATES_V1)[number];

/** Where the Visitor-facing "Creator display name" (Product Spec §10.2) came from. */
export const DIGITAL_TWIN_CREATOR_DISPLAY_NAME_SOURCES_V1 = ['owner_nickname', 'agent_name'] as const;
export type DigitalTwinCreatorDisplayNameSourceKindV1 = (typeof DIGITAL_TWIN_CREATOR_DISPLAY_NAME_SOURCES_V1)[number];
export const DIGITAL_TWIN_CREATOR_DISPLAY_NAME_MAX_CHARS = 80;

/**
 * §10.2 "Creator display name": who this twin represents, as the Visitor should read it.
 * Only present while the twin is `available` — publishing is the Creator's explicit,
 * confirmed command and the confirmation copy says the name will be shown. The owner's
 * account nickname, or the Agent's name when no nickname is set. Never a principal id,
 * never anything from a private/work Facet.
 */
export interface DigitalTwinPublicCreatorV1 {
  displayName: string;
  source: DigitalTwinCreatorDisplayNameSourceKindV1;
}

/** What an anonymous Visitor may see. No principal ids, no raw records, no private/work items. */
export interface DigitalTwinPublicProjectionV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  agentRef: DigitalTwinRefV1;
  state: DigitalTwinPublicStateV1;
  /** Present when `paused`/`unavailable`; a code, never an internal detail. */
  reasonCode?: 'not_published' | 'stopped' | 'prerequisite_not_active' | 'capability_off';
  aiDisclosure: typeof DIGITAL_TWIN_AI_DISCLOSURE_V1;
  /** Present only when `available` (see `DigitalTwinPublicCreatorV1`). */
  creator?: DigitalTwinPublicCreatorV1;
  official: {
    /** Seed Trial: operator verification, disclosed as such. */
    method: 'operator_verified';
    disclosure: string;
    status: DigitalTwinPrerequisiteStatusV1;
    verifiedOn?: string;
    validUntil?: string;
  } | null;
  topics: string[];
  /** Read-only offer catalog (Creator-confirmed drafts); prices/links as the Creator wrote them; no payment. */
  offers: string[];
  /** How to reach the human (Creator-confirmed handoff defaults). */
  askHuman: string[];
  /** Report/complaint entry: a mailto or route the platform operates. */
  reportContact: string;
  /** Present when leads are accepted: the exact consent copy the Visitor must affirm (Task 13). */
  leadConsent?: { version: number; 'zh-CN': string; en: string };
  facetVersion: number;
  projectedAt: string;
}

export interface DigitalTwinPublicAskCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  question: string;
  language?: 'zh-CN' | 'en';
  /** Opaque, Visitor-generated session id (per-session rate limit key); never a principal. */
  visitorSessionId: string;
}

export interface DigitalTwinPublicAnswerV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  answerRef: DigitalTwinRefV1;
  facet: 'public';
  answerClass: DigitalTwinAnswerClassV1;
  noAnswerReason?: DigitalTwinNoAnswerReasonV1;
  /** Rendered label for the class; the Visitor UI must show it next to the text. */
  attribution: { zh: string; en: string };
  text: string;
  /** Count and kinds only; never excerpts of the Creator's items to a Visitor. */
  sources: { count: number; kinds: string[] };
  askHuman: string[];
  aiDisclosure: string;
  decisionDigest: DigestRef;
  createdAt: string;
}

export const DIGITAL_TWIN_PUBLIC_ATTRIBUTION_V1: Readonly<Record<DigitalTwinAnswerClassV1, { zh: string; en: string }>> = {
  confirmed: { zh: '本人确认过的内容 · AI 分身回答', en: 'Confirmed by the person · AI twin answer' },
  inferred: { zh: 'AI 推断，未经本人确认 · AI 分身回答', en: 'AI inference, not confirmed · AI twin answer' },
  no_answer: { zh: '不代答，请联系本人 · AI 分身', en: 'Not answered — please contact the person · AI twin' },
};

function normalizeTopics(input: unknown): string[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > DIGITAL_TWIN_PUBLIC_TOPIC_MAX) return null;
  const topics: string[] = [];
  for (const topic of input) {
    if (!isNonEmptyString(topic) || topic.trim().length > DIGITAL_TWIN_PUBLIC_TOPIC_MAX_CHARS) return null;
    const trimmed = topic.trim();
    if (!topics.includes(trimmed)) topics.push(trimmed);
  }
  return topics;
}

export function decodeDigitalTwinPublishCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinPublishCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (input.action !== 'publish' && input.action !== 'unpublish') return fail('invalid_enum', ['action']);
  const topics = normalizeTopics(input.topics);
  if (topics === null) return fail('invalid_shape', ['topics']);
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: input.action, ...(input.action === 'publish' ? { topics } : {}) } };
}

export function decodeDigitalTwinPublicAskCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinPublicAskCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isNonEmptyString(input.question) || input.question.trim().length > DIGITAL_TWIN_PUBLIC_QUESTION_MAX_CHARS) return fail('invalid_shape', ['question']);
  let language: 'zh-CN' | 'en' | undefined;
  if (input.language !== undefined) {
    if (input.language !== 'zh-CN' && input.language !== 'en') return fail('invalid_enum', ['language']);
    language = input.language;
  }
  if (!isNonEmptyString(input.visitorSessionId) || !DIGITAL_TWIN_VISITOR_SESSION_RE.test(input.visitorSessionId)) return fail('invalid_shape', ['visitorSessionId']);
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      question: input.question.trim(),
      ...(language ? { language } : {}),
      visitorSessionId: input.visitorSessionId,
    },
  };
}

export function decodeDigitalTwinPublicProjectionV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinPublicProjectionV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isMember(DIGITAL_TWIN_PUBLIC_STATES_V1, input.state)) return fail('invalid_enum', ['state']);
  if (!isRecord(input.agentRef) || input.agentRef.kind !== 'agent_account' || !isNonEmptyString(input.agentRef.id)) return fail('invalid_ref', ['agentRef']);
  if (!isRecord(input.aiDisclosure) || input.aiDisclosure['zh-CN'] !== DIGITAL_TWIN_AI_DISCLOSURE_V1['zh-CN']) return fail('invalid_shape', ['aiDisclosure']);
  if (!Array.isArray(input.topics) || !Array.isArray(input.offers) || !Array.isArray(input.askHuman)) return fail('invalid_shape', ['lists']);
  if (!isNonEmptyString(input.reportContact) || !isIsoTimestamp(input.projectedAt)) return fail('invalid_shape', ['reportContact/projectedAt']);
  if (input.creator !== undefined) {
    const creator = input.creator;
    if (!isRecord(creator) || !isNonEmptyString(creator.displayName) || creator.displayName.trim().length > DIGITAL_TWIN_CREATOR_DISPLAY_NAME_MAX_CHARS) return fail('invalid_shape', ['creator.displayName']);
    if (!isMember(DIGITAL_TWIN_CREATOR_DISPLAY_NAME_SOURCES_V1, creator.source)) return fail('invalid_enum', ['creator.source']);
    if (input.state !== 'available') return fail('invalid_shape', ['creator:only_when_available']);
  }
  // A public projection must never leak identity internals.
  const raw = JSON.stringify(input);
  for (const forbidden of ['principal:', 'ownerPrincipalId', 'evidenceNote', 'verifiedByPrincipalRef', 'statement']) {
    if (raw.includes(forbidden)) return fail('unknown_field', [`leak:${forbidden}`]);
  }
  return { ok: true, value: input as unknown as DigitalTwinPublicProjectionV1 };
}

export function decodeDigitalTwinPublicAnswerV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinPublicAnswerV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (input.facet !== 'public') return fail('invalid_enum', ['facet']);
  if (!isMember(['confirmed', 'inferred', 'no_answer'] as const, input.answerClass)) return fail('invalid_enum', ['answerClass']);
  if (typeof input.text !== 'string') return fail('invalid_shape', ['text']);
  if (!isRecord(input.sources) || typeof input.sources.count !== 'number') return fail('invalid_shape', ['sources']);
  if (!isRecord(input.attribution) || !isNonEmptyString(input.attribution.zh)) return fail('invalid_shape', ['attribution']);
  if (!isNonEmptyString(input.aiDisclosure) || !isIsoTimestamp(input.createdAt)) return fail('invalid_shape', ['aiDisclosure/createdAt']);
  return { ok: true, value: input as unknown as DigitalTwinPublicAnswerV1 };
}
