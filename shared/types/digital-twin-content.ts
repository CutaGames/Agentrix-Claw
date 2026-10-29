/**
 * Digital Twin — Question-to-Content Loop drafts (design §6.11; Task 15; Seed Trial).
 *
 * The weekly digest already names the questions most worth answering. A content
 * draft turns the Creator's *confirmed* answers on one topic into an article
 * draft the Creator can download and publish elsewhere. Drafts are never
 * auto-published, carry explicit AI marking and the refs of the confirmed
 * answers they were built from, and keep their own idempotency separate from
 * any canonical commit (15.6). Video/talking-head output waits for Task 8's
 * real providers.
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinRefV1,
} from './digital-twin';
import type { DigestRef } from './trust-loop-primitives';

const { isRecord, isNonEmptyString, isMember, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_CONTENT_KINDS_V1 = ['article_draft'] as const;
export type DigitalTwinContentKindV1 = (typeof DIGITAL_TWIN_CONTENT_KINDS_V1)[number];

export const DIGITAL_TWIN_CONTENT_STATES_V1 = ['draft', 'downloaded', 'discarded'] as const;
export type DigitalTwinContentDraftStateV1 = (typeof DIGITAL_TWIN_CONTENT_STATES_V1)[number];

export const DIGITAL_TWIN_CONTENT_AI_MARKING_V1 = {
  'zh-CN': '本文由 AI 分身依据本人确认过的问答整理成草稿，发布前请本人审阅。',
  en: 'Drafted by the AI twin from answers the person confirmed; review before publishing.',
} as const;

export const DIGITAL_TWIN_CONTENT_MIN_SOURCES = 1;
export const DIGITAL_TWIN_CONTENT_MAX_SOURCES = 12;

export interface DigitalTwinContentDraftV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_content_draft';
  draftRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  kind: DigitalTwinContentKindV1;
  topic: string;
  title: string;
  /** Markdown body; begins with the AI marking line. */
  body: string;
  /** Confirmed answer decisions the draft is built from (attribution). */
  sourceDecisionRefs: DigitalTwinRefV1[];
  aiMarking: { explicit: true; text: string };
  model: { provider: string; modelUsed: string; byo: boolean } | null;
  state: DigitalTwinContentDraftStateV1;
  /** Digest of topic + source refs; two requests for the same inputs return the same draft. */
  inputDigest: DigestRef;
  createdAt: string;
  updatedAt: string;
}

/** The interim container stored on `DigitalTwinInterimStateV1.content`. */
export interface DigitalTwinContentStateV1 {
  drafts: DigitalTwinContentDraftV1[];
  updatedAt: string;
}

export interface DigitalTwinContentDraftCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  kind: DigitalTwinContentKindV1;
  topic: string;
  /** Confirmed answer decision ids to build from; empty = the most recent confirmed answers. */
  sourceDecisionIds: string[];
  language?: 'zh-CN' | 'en';
}

export interface DigitalTwinContentDecisionCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: 'downloaded' | 'discard';
}

export function decodeDigitalTwinContentDraftCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinContentDraftCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isMember(DIGITAL_TWIN_CONTENT_KINDS_V1, input.kind)) return fail('invalid_enum', ['kind']);
  if (!isNonEmptyString(input.topic) || input.topic.trim().length > 120) return fail('invalid_shape', ['topic']);
  const ids = input.sourceDecisionIds ?? [];
  if (!Array.isArray(ids) || ids.length > DIGITAL_TWIN_CONTENT_MAX_SOURCES || !ids.every((id) => isNonEmptyString(id) && id.length <= 80)) {
    return fail('invalid_shape', ['sourceDecisionIds']);
  }
  let language: 'zh-CN' | 'en' | undefined;
  if (input.language !== undefined) {
    if (input.language !== 'zh-CN' && input.language !== 'en') return fail('invalid_enum', ['language']);
    language = input.language;
  }
  return {
    ok: true,
    value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, kind: input.kind, topic: input.topic.trim(), sourceDecisionIds: [...new Set(ids as string[])], ...(language ? { language } : {}) },
  };
}

export function decodeDigitalTwinContentDecisionCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinContentDecisionCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (input.action !== 'downloaded' && input.action !== 'discard') return fail('invalid_enum', ['action']);
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: input.action } };
}

/** Deterministic fallback draft when no model can write: the confirmed Q&A verbatim, still useful and still honest. */
export function renderDigitalTwinContentFallbackV1(input: { topic: string; pairs: Array<{ question: string; answer: string }>; language: 'zh-CN' | 'en' }): { title: string; body: string } {
  const zh = input.language === 'zh-CN';
  const title = zh ? `关于「${input.topic}」，我确认过的回答` : `What I have confirmed about "${input.topic}"`;
  const sections = input.pairs.map((pair, index) => `## ${index + 1}. ${pair.question}\n\n${pair.answer}`).join('\n\n');
  return { title, body: `${DIGITAL_TWIN_CONTENT_AI_MARKING_V1[input.language]}\n\n# ${title}\n\n${sections}\n` };
}
