/**
 * 人人都有分身 v1 (E116, owner 2026-10-17「分身照建议」).
 *
 * One tap makes a private twin; the owner adds to it whenever they like; one more
 * tap puts a public card online. Everything here is additive: new routes under
 * `/v1/me/twin` and `GET /v1/public/twin/agents/:agentId/card`, new optional
 * interim record `interim_seed_everyone`. No shape an older client already
 * decodes changes, so the train can ship the backend before the surfaces.
 *
 * Rules carried from the decision:
 *   ① everyone gets a twin (cohort admission is open while the flag is on);
 *   ② one tap = private only; the public card needs its own tap, a confirmed name
 *      and the 18+ / "this is me" attestation (E105 ②), and the usual visibility step-up;
 *   ③ what the owner writes (intro, answers, notes) is a source at once; anything a
 *      model infers still goes through confirmation (L8 A2 inbox, not this slice);
 *   ④ no source → "我是 X 的 AI 分身，这件事 X 还没告诉我，我帮你转给 X";
 *   ⑤ at most 30 Visitor answers per twin per rolling 24 hours, then "leave a message";
 *   ⑥ the name stays 分身.
 *
 * Decoders in this file ignore unknown keys on purpose (forward-compatible views),
 * unlike the frozen `digital-twin/v1` decoders.
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_PROFILE_STATES_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinFacetV1,
  type DigitalTwinProfileStateV1,
} from './digital-twin';
import type { DigitalTwinAnswerLanguageV1, DigitalTwinContextSensitivityV1, TwinContextItemV1 } from './digital-twin-answer';
import {
  digitalTwinInterimRecordStatusV1,
  type DigitalTwinLikenessConsentRecordV1,
  type DigitalTwinRepresentsRecordV1,
} from './digital-twin-consent';
import { REPRESENTATION_HANDOFF_OWNER_INBOX_REF_V1, type RepresentationMandateTermsV1 } from './representation-mandate';
import {
  DIGITAL_TWIN_INTERVIEW_MAX_ANSWER_CHARS,
  digitalTwinInterviewQuestionV1,
  digitalTwinTextLooksSecretV1,
  type DigitalTwinInterviewQuestionIdV1,
  type DigitalTwinInterviewResponseV1,
} from './digital-twin-interview';
import { computeDigest } from './trust-loop-primitives';

const { isRecord, isNonEmptyString, isIsoTimestamp, isMember, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

/**
 * Backend switch; exact `'1'`. Off: `GET /v1/me/twin` answers `unavailable / flag_off`, every write
 * answers 503, the anonymous card is `unavailable`, and nothing else in the twin changes.
 */
export const DIGITAL_TWIN_EVERYONE_V1_FLAG = 'DIGITAL_TWIN_EVERYONE_V1_ENABLED' as const;
/**
 * Capabilities the open cohort admits while the flag is on (review LOW-5). Body, likeness and the
 * hard-off ones keep their own admission rules.
 */
export const DIGITAL_TWIN_EVERYONE_COHORT_CAPABILITIES_V1 = [
  'private_profile',
  'interview',
  'review',
  'public',
  'content_intake',
  'offer_lead',
  'stop',
] as const;
/** Web switch (build time); exact `'1'`. */
export const DIGITAL_TWIN_EVERYONE_V1_WEB_FLAG = 'NEXT_PUBLIC_TWIN_EVERYONE_V1_ENABLED' as const;
export const DIGITAL_TWIN_EVERYONE_RECORD = 'interim_seed_everyone' as const;
/** `source` of the Agent one tap makes for an owner who has none (idempotent per owner). */
export const DIGITAL_TWIN_EVERYONE_AGENT_SOURCE = 'twin-everyone-v1' as const;

export const DIGITAL_TWIN_EVERYONE_LIMITS_V1 = {
  introMaxChars: 280,
  noteMaxChars: 1000,
  notesMax: 50,
  boundariesMax: 20,
  boundaryMaxChars: 60,
  displayNameMaxChars: 40,
  /** E116 ⑤: Visitor answers per twin per rolling window. */
  visitorDailyCap: 30,
  visitorWindowMs: 24 * 60 * 60 * 1000,
  /** Owner-stated items handed to the model when lexical retrieval finds nothing (small personal twins). */
  ownerStatedPromptMax: 24,
  /** Review MEDIUM-4: Visitor answers one network may take from one twin per rolling window. */
  visitorPerNetworkDaily: 10,
  pendingQuestionsMax: 5,
  pendingQuestionsWindowDays: 14,
  answeredReviewRefsMax: 200,
  /** How many Agents the chooser lists when an owner has several. */
  agentChoicesMax: 10,
} as const;

/**
 * Order of the "one question at a time" card: questions about the person first.
 * The policy questions (q09–q11, q15–q18, q20) are not asked here; the boundaries
 * card and the professional settings cover them.
 */
export const DIGITAL_TWIN_EVERYONE_QUESTION_ORDER_V1: readonly DigitalTwinInterviewQuestionIdV1[] = [
  'q01', 'q05', 'q06', 'q08', 'q07', 'q04', 'q12', 'q13', 'q14', 'q02', 'q03', 'q19',
];

/** What the owner ticks before the public card goes online (E105 ②, E116 ②). Changing the text needs a new version. */
export const DIGITAL_TWIN_EVERYONE_ATTESTATION_V1 = {
  version: 'twin-everyone-attest/v1',
  'zh-CN': '我已年满 18 岁。这是我本人的分身，名片上的名字和介绍由我负责。',
  en: 'I am 18 or older. This is my own twin, and I am responsible for the name and intro on its card.',
} as const;

/** Shown on every public card made through this flow: the platform did not verify who it is. */
export const DIGITAL_TWIN_EVERYONE_UNVERIFIED_LABEL_V1 = {
  'zh-CN': '由本人创建，平台未核实身份',
  en: 'Made by the person; identity not verified by the platform',
} as const;

export const DIGITAL_TWIN_EVERYONE_FACETS_V1 = ['public', 'private'] as const;
export type DigitalTwinEveryoneFacetV1 = (typeof DIGITAL_TWIN_EVERYONE_FACETS_V1)[number];

// ---------------------------------------------------------------------------
// Stored record (interim JSON; server-owned)
// ---------------------------------------------------------------------------

export interface DigitalTwinEveryoneNoteV1 {
  noteId: string;
  text: string;
  facet: DigitalTwinEveryoneFacetV1;
  createdAt: string;
}

export interface DigitalTwinEveryonePublicCardRecordV1 {
  state: 'published' | 'unpublished';
  displayName: string;
  attestation: { copyVersion: string; attestedAt: string };
  publishedAt?: string;
  unpublishedAt?: string;
  /**
   * The Representation Mandate this publish created (S46, 10-17): with the Authority flags on, a public
   * answer needs one. Recorded so unpublishing withdraws exactly that grant and never the owner's own.
   */
  mandateGrantRef?: string;
}

/**
 * S46 (10-17): what publishing a self-attested card lets the twin do, as Representation Mandate terms
 * (Authority records it on the owner's Pass): text answers and messages to the public on the web, from
 * the public Facet, hand-off to the owner's inbox. No money, no bookings, no voice or likeness.
 */
export function digitalTwinEveryoneMandateTermsV1(now: string): RepresentationMandateTermsV1 {
  return {
    actions: ['answer', 'lead', 'handoff'],
    modes: ['text'],
    audiences: ['public'],
    channels: ['web'],
    topics: [],
    dataClasses: ['public_facet'],
    validFrom: now,
    handoffContactRefs: [REPRESENTATION_HANDOFF_OWNER_INBOX_REF_V1],
  };
}

/** Bound into the publish preview digest, so the owner's confirmation covers the mandate too. */
export const DIGITAL_TWIN_EVERYONE_MANDATE_SUMMARY_V1 = 'text_answers_messages_handoff_public_web' as const;

export interface DigitalTwinEveryoneRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: typeof DIGITAL_TWIN_EVERYONE_RECORD;
  /** Bumped on every owner write. */
  version: number;
  /** `''` until the owner writes one. Public by nature: it is the card's intro. */
  intro: string;
  notes: DigitalTwinEveryoneNoteV1[];
  /** Topics the twin never answers (on top of the platform ceiling and the policy boundaries). */
  boundaries: string[];
  /** Visitor review items the owner already answered with a note; hidden from "pending". */
  answeredReviewRefs: string[];
  publicCard?: DigitalTwinEveryonePublicCardRecordV1;
  updatedAt: string;
}

/**
 * Review MEDIUM-3: a represents record the operator revoked, or a likeness consent the owner revoked,
 * keeps a self-attested card closed. A "no" on record always outranks the card.
 */
export function digitalTwinEveryoneCardRevokedV1(
  interim: { consent?: { represents?: DigitalTwinRepresentsRecordV1 | null; likeness?: DigitalTwinLikenessConsentRecordV1 | null } } | null | undefined,
  now: string,
): boolean {
  return (
    digitalTwinInterimRecordStatusV1(interim?.consent?.represents ?? null, now) === 'revoked' ||
    digitalTwinInterimRecordStatusV1(interim?.consent?.likeness ?? null, now) === 'revoked'
  );
}

export function emptyDigitalTwinEveryoneRecordV1(now: string): DigitalTwinEveryoneRecordV1 {
  return {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    record: DIGITAL_TWIN_EVERYONE_RECORD,
    version: 0,
    intro: '',
    notes: [],
    boundaries: [],
    answeredReviewRefs: [],
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Owner-stated sources (E116 ③): the owner's own words are sources at once
// ---------------------------------------------------------------------------

/** Context item ids made here start with this; they are never canonical Self Model ids. */
export const DIGITAL_TWIN_OWNER_STATED_PREFIX = 'owner_stated:' as const;
export const DIGITAL_TWIN_OWNER_STATED_DIGEST_DOMAIN = 'AGENTRIX_DIGITAL_TWIN_OWNER_STATED_V1' as const;

export function isDigitalTwinOwnerStatedIdV1(id: string): boolean {
  return typeof id === 'string' && id.startsWith(DIGITAL_TWIN_OWNER_STATED_PREFIX);
}

/** Interview outputs that are statements about the person (not grants, offers or policy). */
const OWNER_STATED_OUTPUTS = new Set(['confirmed_fact', 'persona_line', 'gold_set_answer', 'style_instruction']);

function sensitivityForFacet(facet: DigitalTwinFacetV1 | DigitalTwinEveryoneFacetV1): DigitalTwinContextSensitivityV1 {
  if (facet === 'public') return 'public';
  if (facet === 'work') return 'owner';
  return 'private';
}

function ownerStatedItem(
  id: string,
  kind: TwinContextItemV1['kind'],
  text: string,
  facet: DigitalTwinFacetV1 | DigitalTwinEveryoneFacetV1,
  version: number,
): TwinContextItemV1 {
  const canonicalId = `${DIGITAL_TWIN_OWNER_STATED_PREFIX}${id}`;
  return {
    canonicalId,
    kind,
    text,
    sensitivity: sensitivityForFacet(facet),
    sourceItemRef: canonicalId,
    sourceItemDigest: computeDigest({ domain: DIGITAL_TWIN_OWNER_STATED_DIGEST_DOMAIN, id: canonicalId, text }).value,
    currentVersion: String(version),
  };
}

/**
 * The owner's own words as answer sources: the intro (public), each answered
 * interview question about the person (its facet as the owner filed it; one item
 * per line for the line-per-entry questions) and each note. Skipped or empty
 * answers and the policy questions yield nothing. Pure and deterministic.
 */
export function digitalTwinOwnerStatedItemsV1(input: {
  record?: DigitalTwinEveryoneRecordV1 | null;
  responses?: readonly DigitalTwinInterviewResponseV1[] | null;
}): TwinContextItemV1[] {
  const items: TwinContextItemV1[] = [];
  const record = input.record ?? null;
  if (record && record.intro.trim()) {
    // The intro is the card's text: public only while the everyone card is published (review LOW-4),
    // so a professional twin that is already public does not start quoting it before the owner publishes.
    const introFacet = record.publicCard?.state === 'published' ? 'public' : 'private';
    items.push(ownerStatedItem('intro', 'memory', record.intro.trim(), introFacet, record.version));
  }
  for (const response of input.responses ?? []) {
    if (response.skipped || !response.text.trim()) continue;
    const question = digitalTwinInterviewQuestionV1(response.questionId);
    if (!question || !question.outputs.some((output) => OWNER_STATED_OUTPUTS.has(output))) continue;
    const kind: TwinContextItemV1['kind'] = question.outputs.every((output) => output === 'style_instruction') ? 'persona' : 'memory';
    const lines = question.splitLines
      ? response.text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
      : [response.text.trim()];
    lines.forEach((line, index) => {
      items.push(ownerStatedItem(`${response.questionId}:${response.version}:${index}`, kind, line, response.facet, response.version));
    });
  }
  for (const note of record?.notes ?? []) {
    if (!note.text.trim()) continue;
    items.push(ownerStatedItem(`note:${note.noteId}`, 'memory', note.text.trim(), note.facet, 1));
  }
  return items;
}

// ---------------------------------------------------------------------------
// What the twin says when it does not know (E116 ④) and when the day is full (⑤)
// ---------------------------------------------------------------------------

function nameOrDefault(name: string | null | undefined, language: DigitalTwinAnswerLanguageV1): string {
  const cleaned = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
  if (cleaned) return cleaned;
  return language === 'zh-CN' ? '本人' : 'the person';
}

export function renderDigitalTwinEveryoneUnknownTextV1(input: { name?: string | null; language: DigitalTwinAnswerLanguageV1 }): string {
  const name = nameOrDefault(input.name, input.language);
  if (input.language === 'zh-CN') return `我是 ${name} 的 AI 分身，这件事 ${name} 还没告诉我，我帮你转给 ${name}。`;
  return `I'm ${name}'s AI twin. ${name} hasn't told me about this yet, so I'll pass it on to ${name}.`;
}

/**
 * What the model is told to reply when the sources do not answer (review LOW-10): a fixed sentence
 * without the owner's name, so a name can never rewrite the rules. The server swaps it for the
 * full E116 sentence before anyone sees it.
 */
export const DIGITAL_TWIN_EVERYONE_UNKNOWN_SENTINEL_V1 = {
  'zh-CN': '这件事我还不知道。',
  en: "I don't know this yet.",
} as const;

/** True when a generated reply is the sentinel or the "not told yet" sentence (or a close paraphrase). */
export function isDigitalTwinEveryoneUnknownReplyV1(text: string): boolean {
  const compact = (text ?? '').replace(/\s+/g, '');
  return (
    compact.includes('还没告诉我') ||
    compact.includes('这件事我还不知道') ||
    compact.includes('我还不知道这件事') ||
    /hasn['’]?t told me|has not told me|don['’]?t know this yet|do not know this yet/i.test(text ?? '')
  );
}

export function renderDigitalTwinEveryoneCapTextV1(input: { name?: string | null; language: DigitalTwinAnswerLanguageV1 }): string {
  const name = nameOrDefault(input.name, input.language);
  if (input.language === 'zh-CN') return `今天我替 ${name} 回答的次数已经用完了。请给 ${name} 留言，${name} 会看到。`;
  return `I've answered as many questions for ${name} as I can today. Please leave ${name} a message; ${name} will see it.`;
}

// ---------------------------------------------------------------------------
// "它懂你多少" and the next question
// ---------------------------------------------------------------------------

export interface DigitalTwinEveryoneKnowledgeV1 {
  /** Grows with what the owner gave; not a test score. */
  points: number;
  /** 0 还不了解你 · 1 刚认识你 · 2 有点了解你 · 3 挺懂你了 */
  level: 0 | 1 | 2 | 3;
  hasIntro: boolean;
  answeredQuestions: number;
  notes: number;
  linkedImports: number;
}

export function digitalTwinEveryoneKnowledgeV1(input: {
  hasIntro: boolean;
  answeredQuestions: number;
  notes: number;
  linkedImports: number;
}): DigitalTwinEveryoneKnowledgeV1 {
  const points = (input.hasIntro ? 2 : 0) + input.answeredQuestions * 2 + input.notes + input.linkedImports * 3;
  const level: DigitalTwinEveryoneKnowledgeV1['level'] = points === 0 ? 0 : points < 6 ? 1 : points < 16 ? 2 : 3;
  return { points, level, ...input };
}

export interface DigitalTwinEveryoneQuestionV1 {
  questionId: DigitalTwinInterviewQuestionIdV1;
  prompt: { 'zh-CN': string; en: string };
  defaultFacet: DigitalTwinEveryoneFacetV1;
  /** One answer per line is expected (Q&A lists). */
  splitLines: boolean;
}

function everyoneQuestionView(questionId: DigitalTwinInterviewQuestionIdV1): DigitalTwinEveryoneQuestionV1 | null {
  const question = digitalTwinInterviewQuestionV1(questionId);
  if (!question) return null;
  return {
    questionId,
    prompt: { 'zh-CN': question.prompt['zh-CN'], en: question.prompt.en },
    defaultFacet: question.defaultFacet === 'public' ? 'public' : 'private',
    splitLines: question.splitLines,
  };
}

/**
 * Next question for the one-question card: the first one in order that has neither
 * an answer nor a skip; once everything was answered or skipped, the skipped ones
 * come back in order (skipping only means "not now"). `null` when all are answered.
 * `after` moves past a question the owner just skipped in this session.
 */
export function nextDigitalTwinEveryoneQuestionV1(
  responses: readonly Pick<DigitalTwinInterviewResponseV1, 'questionId' | 'skipped' | 'text'>[] | null | undefined,
  after?: DigitalTwinInterviewQuestionIdV1,
): DigitalTwinEveryoneQuestionV1 | null {
  const answered = new Set<string>();
  const skipped = new Set<string>();
  for (const response of responses ?? []) {
    if (!response.skipped && response.text.trim()) answered.add(response.questionId);
    else skipped.add(response.questionId);
  }
  const order = DIGITAL_TWIN_EVERYONE_QUESTION_ORDER_V1;
  const start = after ? order.indexOf(after) + 1 : 0;
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  const fresh = rotated.find((id) => !answered.has(id) && !skipped.has(id) && id !== after);
  if (fresh) return everyoneQuestionView(fresh);
  const again = rotated.find((id) => !answered.has(id) && id !== after) ?? rotated.find((id) => !answered.has(id));
  return again ? everyoneQuestionView(again) : null;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface DigitalTwinEveryoneAgentChoiceV1 {
  agentAccountId: string;
  name: string | null;
  hasTwin: boolean;
}

export interface DigitalTwinEveryoneAnswerViewV1 {
  questionId: DigitalTwinInterviewQuestionIdV1;
  prompt: { 'zh-CN': string; en: string };
  text: string;
  facet: DigitalTwinEveryoneFacetV1;
  version: number;
  updatedAt: string;
}

/** A Visitor question the twin could not answer (from the Review Queue); the owner can answer it with a note. */
export interface DigitalTwinEveryonePendingQuestionV1 {
  reviewRef: string;
  question: string;
  askedAt: string;
}

export interface DigitalTwinEveryonePublicCardViewV1 {
  state: 'private' | 'published';
  displayName: string | null;
  /** `/share/agent/<id>` while published. */
  shareRoute: string | null;
  visitorAnswersLast24h: number;
  visitorDailyCap: number;
  /** Whether the publish button can work right now; `blockedBy` says why not. */
  canPublish: boolean;
  blockedBy?: string;
}

export interface DigitalTwinEveryoneTwinViewV1 {
  agentAccountId: string;
  profileState: DigitalTwinProfileStateV1;
  stopped: boolean;
  /** What the twin calls the owner: the card name, else the nickname, else the Agent's name. */
  displayName: string | null;
  intro: string;
  knowledge: DigitalTwinEveryoneKnowledgeV1;
  nextQuestion: DigitalTwinEveryoneQuestionV1 | null;
  answers: DigitalTwinEveryoneAnswerViewV1[];
  notes: DigitalTwinEveryoneNoteV1[];
  boundaries: string[];
  pendingQuestions: DigitalTwinEveryonePendingQuestionV1[];
  publicCard: DigitalTwinEveryonePublicCardViewV1;
  /** The full creation flow, now "专业设置". */
  proSettingsRoute: string;
}

export const DIGITAL_TWIN_EVERYONE_HOME_STATUSES_V1 = ['unavailable', 'needs_agent_choice', 'no_twin', 'ready'] as const;
export type DigitalTwinEveryoneHomeStatusV1 = (typeof DIGITAL_TWIN_EVERYONE_HOME_STATUSES_V1)[number];

export interface DigitalTwinEveryoneHomeV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  status: DigitalTwinEveryoneHomeStatusV1;
  /** `unavailable` only. */
  reasonCode?: 'flag_off' | 'capability_off' | 'not_in_cohort';
  /** `needs_agent_choice` only: the owner has several Agents and none (or several) has a twin. */
  agents?: DigitalTwinEveryoneAgentChoiceV1[];
  /** `no_twin` only: the Agent one tap will use; `null` = one tap also makes the Agent. */
  agentAccountId?: string | null;
  /** `ready` only. */
  twin?: DigitalTwinEveryoneTwinViewV1;
}

/** `GET /v1/public/twin/agents/:agentId/card` (anonymous). Nothing here comes from a private Facet. */
export interface DigitalTwinEveryoneCardV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  state: 'available' | 'unavailable';
  displayName: string | null;
  intro: string;
  /** Always false for this flow: the card is self-attested. */
  verified: false;
  unverifiedLabel: typeof DIGITAL_TWIN_EVERYONE_UNVERIFIED_LABEL_V1;
  /** False once today's Visitor answers are used up; the page then offers "leave a message". */
  askOpen: boolean;
}

// ---------------------------------------------------------------------------
// Commands (server decoders; unknown keys are refused here, they are writes)
// ---------------------------------------------------------------------------

export interface DigitalTwinEveryoneCreateCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  /** Needed only when the owner has several Agents (`needs_agent_choice`). */
  agentAccountId?: string;
}

export interface DigitalTwinEveryoneIntroCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  /** `''` clears it. */
  intro: string;
}

export interface DigitalTwinEveryoneAnswerCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  questionId: DigitalTwinInterviewQuestionIdV1;
  /** Required unless `skipped` or `remove`. */
  text?: string;
  /** "Not now": the card moves on and the question comes back later. */
  skipped?: boolean;
  /** Delete the current answer (a new, empty version; the twin stops using it). */
  remove?: boolean;
  facet?: DigitalTwinEveryoneFacetV1;
  language?: DigitalTwinAnswerLanguageV1;
}

export interface DigitalTwinEveryoneNoteCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  text: string;
  facet?: DigitalTwinEveryoneFacetV1;
  /** Answering a pending Visitor question: that question leaves the pending list. */
  reviewRef?: string;
}

export interface DigitalTwinEveryoneBoundariesCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  boundaries: string[];
}

export interface DigitalTwinEveryoneAskCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  question: string;
  language?: DigitalTwinAnswerLanguageV1;
}

export interface DigitalTwinEveryonePublishCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: 'publish' | 'unpublish';
  /** publish only: the name the card shows, confirmed by the owner. */
  displayName?: string;
  /** publish only: must be `true`. */
  adultAttested?: boolean;
  /** publish only: must equal `DIGITAL_TWIN_EVERYONE_ATTESTATION_V1.version`. */
  attestationCopyVersion?: string;
  /** The visibility preview digest (checked by the controller, D16). */
  previewDigest?: unknown;
}

const UUID_LIKE = /^[0-9a-zA-Z_-]{8,80}$/;
const QUESTION_ID = /^q(0[1-9]|1[0-9]|20)$/;

function cleanLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function refuseUnknown(record: Record<string, unknown>, allowed: readonly string[]): DigitalTwinDecodeResultV1<never> | null {
  const extra = Object.keys(record).filter((key) => !allowed.includes(key));
  return extra.length > 0 ? fail('unknown_field', extra) : null;
}

function checkSchema(record: Record<string, unknown>): DigitalTwinDecodeResultV1<never> | null {
  return record.schemaVersion === DIGITAL_TWIN_SCHEMA_VERSION ? null : fail('unknown_schema_version', [`schemaVersion=${String(record.schemaVersion)}`]);
}

function optionalFacet(value: unknown): DigitalTwinEveryoneFacetV1 | undefined | null {
  if (value === undefined) return undefined;
  return isMember(DIGITAL_TWIN_EVERYONE_FACETS_V1, value) ? value : null;
}

function optionalLanguage(value: unknown): DigitalTwinAnswerLanguageV1 | undefined | null {
  if (value === undefined) return undefined;
  return value === 'zh-CN' || value === 'en' ? value : null;
}

export function decodeDigitalTwinEveryoneCreateCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneCreateCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'agentAccountId']);
  if (bad) return bad;
  if (input.agentAccountId !== undefined && (typeof input.agentAccountId !== 'string' || !UUID_LIKE.test(input.agentAccountId))) {
    return fail('invalid_ref', ['agentAccountId']);
  }
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, ...(typeof input.agentAccountId === 'string' ? { agentAccountId: input.agentAccountId } : {}) } };
}

export function decodeDigitalTwinEveryoneIntroCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneIntroCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'intro']);
  if (bad) return bad;
  if (typeof input.intro !== 'string') return fail('invalid_shape', ['intro must be a string']);
  const intro = cleanLine(input.intro);
  if (intro.length > DIGITAL_TWIN_EVERYONE_LIMITS_V1.introMaxChars) return fail('invalid_shape', ['intro too long']);
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, intro } };
}

export function decodeDigitalTwinEveryoneAnswerCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneAnswerCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'questionId', 'text', 'skipped', 'remove', 'facet', 'language']);
  if (bad) return bad;
  if (typeof input.questionId !== 'string' || !QUESTION_ID.test(input.questionId) || !digitalTwinInterviewQuestionV1(input.questionId)) {
    return fail('invalid_enum', ['questionId']);
  }
  const skipped = input.skipped === true;
  const remove = input.remove === true;
  if ((input.skipped !== undefined && typeof input.skipped !== 'boolean') || (input.remove !== undefined && typeof input.remove !== 'boolean')) {
    return fail('invalid_shape', ['skipped/remove must be booleans']);
  }
  if (skipped && remove) return fail('invalid_shape', ['skipped and remove are exclusive']);
  const facet = optionalFacet(input.facet);
  const language = optionalLanguage(input.language);
  if (facet === null) return fail('invalid_enum', ['facet']);
  if (language === null) return fail('invalid_enum', ['language']);
  let text: string | undefined;
  if (!skipped && !remove) {
    if (!isNonEmptyString(input.text)) return fail('invalid_shape', ['text is required']);
    text = input.text.trim();
    if (text.length > DIGITAL_TWIN_INTERVIEW_MAX_ANSWER_CHARS) return fail('invalid_shape', ['text too long']);
  } else if (input.text !== undefined) {
    return fail('invalid_shape', ['text is not allowed with skipped/remove']);
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      questionId: input.questionId as DigitalTwinInterviewQuestionIdV1,
      ...(text !== undefined ? { text } : {}),
      ...(skipped ? { skipped: true } : {}),
      ...(remove ? { remove: true } : {}),
      ...(facet ? { facet } : {}),
      ...(language ? { language } : {}),
    },
  };
}

export function decodeDigitalTwinEveryoneNoteCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneNoteCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'text', 'facet', 'reviewRef']);
  if (bad) return bad;
  if (!isNonEmptyString(input.text)) return fail('invalid_shape', ['text is required']);
  const text = input.text.trim();
  if (text.length > DIGITAL_TWIN_EVERYONE_LIMITS_V1.noteMaxChars) return fail('invalid_shape', ['text too long']);
  const facet = optionalFacet(input.facet);
  if (facet === null) return fail('invalid_enum', ['facet']);
  if (input.reviewRef !== undefined && (typeof input.reviewRef !== 'string' || !UUID_LIKE.test(input.reviewRef))) return fail('invalid_ref', ['reviewRef']);
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      text,
      ...(facet ? { facet } : {}),
      ...(typeof input.reviewRef === 'string' ? { reviewRef: input.reviewRef } : {}),
    },
  };
}

export function decodeDigitalTwinEveryoneBoundariesCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneBoundariesCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'boundaries']);
  if (bad) return bad;
  if (!Array.isArray(input.boundaries) || input.boundaries.length > DIGITAL_TWIN_EVERYONE_LIMITS_V1.boundariesMax) {
    return fail('invalid_shape', ['boundaries must be a list of at most 20']);
  }
  const boundaries: string[] = [];
  for (const raw of input.boundaries) {
    if (typeof raw !== 'string') return fail('invalid_shape', ['boundaries must be strings']);
    const topic = cleanLine(raw);
    if (!topic) continue;
    if (topic.length > DIGITAL_TWIN_EVERYONE_LIMITS_V1.boundaryMaxChars) return fail('invalid_shape', ['boundary too long']);
    if (!boundaries.includes(topic)) boundaries.push(topic);
  }
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, boundaries } };
}

export function decodeDigitalTwinEveryoneAskCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneAskCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'question', 'language']);
  if (bad) return bad;
  if (!isNonEmptyString(input.question)) return fail('invalid_shape', ['question is required']);
  const question = input.question.trim();
  if (question.length > 2000) return fail('invalid_shape', ['question too long']);
  const language = optionalLanguage(input.language);
  if (language === null) return fail('invalid_enum', ['language']);
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, question, ...(language ? { language } : {}) } };
}

export function decodeDigitalTwinEveryonePublishCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryonePublishCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  const bad = checkSchema(input) ?? refuseUnknown(input, ['schemaVersion', 'action', 'displayName', 'adultAttested', 'attestationCopyVersion', 'previewDigest']);
  if (bad) return bad;
  if (input.action !== 'publish' && input.action !== 'unpublish') return fail('invalid_enum', ['action']);
  if (input.action === 'unpublish') {
    return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: 'unpublish', ...(input.previewDigest !== undefined ? { previewDigest: input.previewDigest } : {}) } };
  }
  if (!isNonEmptyString(input.displayName)) return fail('invalid_shape', ['displayName is required']);
  const displayName = cleanLine(input.displayName);
  if (!displayName || displayName.length > DIGITAL_TWIN_EVERYONE_LIMITS_V1.displayNameMaxChars) return fail('invalid_shape', ['displayName length']);
  if (digitalTwinTextLooksSecretV1(displayName)) return fail('invalid_shape', ['displayName looks like a secret']);
  if (input.adultAttested !== true) return fail('invalid_shape', ['adultAttested must be true']);
  if (input.attestationCopyVersion !== DIGITAL_TWIN_EVERYONE_ATTESTATION_V1.version) return fail('invalid_enum', ['attestationCopyVersion']);
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      action: 'publish',
      displayName,
      adultAttested: true,
      attestationCopyVersion: DIGITAL_TWIN_EVERYONE_ATTESTATION_V1.version,
      ...(input.previewDigest !== undefined ? { previewDigest: input.previewDigest } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// View decoders (clients; unknown keys are ignored so the server can add fields)
// ---------------------------------------------------------------------------

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPrompt(value: unknown): value is { 'zh-CN': string; en: string } {
  return isRecord(value) && isString(value['zh-CN']) && isString(value.en);
}

function decodeQuestion(value: unknown): DigitalTwinEveryoneQuestionV1 | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.questionId) || !QUESTION_ID.test(value.questionId) || !isPrompt(value.prompt)) return undefined;
  if (!isMember(DIGITAL_TWIN_EVERYONE_FACETS_V1, value.defaultFacet) || typeof value.splitLines !== 'boolean') return undefined;
  return {
    questionId: value.questionId as DigitalTwinInterviewQuestionIdV1,
    prompt: { 'zh-CN': value.prompt['zh-CN'], en: value.prompt.en },
    defaultFacet: value.defaultFacet,
    splitLines: value.splitLines,
  };
}

function decodeKnowledge(value: unknown): DigitalTwinEveryoneKnowledgeV1 | undefined {
  if (!isRecord(value)) return undefined;
  const { points, level, hasIntro, answeredQuestions, notes, linkedImports } = value;
  if (typeof points !== 'number' || ![0, 1, 2, 3].includes(level as number) || typeof hasIntro !== 'boolean') return undefined;
  if (typeof answeredQuestions !== 'number' || typeof notes !== 'number' || typeof linkedImports !== 'number') return undefined;
  return { points, level: level as DigitalTwinEveryoneKnowledgeV1['level'], hasIntro, answeredQuestions, notes, linkedImports };
}

function decodeTwinView(value: unknown): DigitalTwinEveryoneTwinViewV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (!isString(value.agentAccountId) || !isMember(DIGITAL_TWIN_PROFILE_STATES_V1, value.profileState) || typeof value.stopped !== 'boolean') return undefined;
  if (!(value.displayName === null || isString(value.displayName)) || !isString(value.intro) || !isString(value.proSettingsRoute)) return undefined;
  const knowledge = decodeKnowledge(value.knowledge);
  const nextQuestion = decodeQuestion(value.nextQuestion);
  if (!knowledge || nextQuestion === undefined) return undefined;
  if (!Array.isArray(value.answers) || !Array.isArray(value.notes) || !Array.isArray(value.boundaries) || !Array.isArray(value.pendingQuestions)) return undefined;
  const answers: DigitalTwinEveryoneAnswerViewV1[] = [];
  for (const item of value.answers) {
    if (!isRecord(item) || !isString(item.questionId) || !QUESTION_ID.test(item.questionId) || !isPrompt(item.prompt) || !isString(item.text)) return undefined;
    if (!isMember(DIGITAL_TWIN_EVERYONE_FACETS_V1, item.facet) || typeof item.version !== 'number' || !isIsoTimestamp(item.updatedAt)) return undefined;
    answers.push({ questionId: item.questionId as DigitalTwinInterviewQuestionIdV1, prompt: item.prompt, text: item.text, facet: item.facet, version: item.version, updatedAt: item.updatedAt });
  }
  const notes: DigitalTwinEveryoneNoteV1[] = [];
  for (const item of value.notes) {
    if (!isRecord(item) || !isString(item.noteId) || !isString(item.text) || !isMember(DIGITAL_TWIN_EVERYONE_FACETS_V1, item.facet) || !isIsoTimestamp(item.createdAt)) return undefined;
    notes.push({ noteId: item.noteId, text: item.text, facet: item.facet, createdAt: item.createdAt });
  }
  if (!value.boundaries.every(isString)) return undefined;
  const pendingQuestions: DigitalTwinEveryonePendingQuestionV1[] = [];
  for (const item of value.pendingQuestions) {
    if (!isRecord(item) || !isString(item.reviewRef) || !isString(item.question) || !isIsoTimestamp(item.askedAt)) return undefined;
    pendingQuestions.push({ reviewRef: item.reviewRef, question: item.question, askedAt: item.askedAt });
  }
  const card = value.publicCard;
  if (!isRecord(card) || (card.state !== 'private' && card.state !== 'published')) return undefined;
  if (!(card.displayName === null || isString(card.displayName)) || !(card.shareRoute === null || isString(card.shareRoute))) return undefined;
  if (typeof card.visitorAnswersLast24h !== 'number' || typeof card.visitorDailyCap !== 'number' || typeof card.canPublish !== 'boolean') return undefined;
  if (card.blockedBy !== undefined && !isString(card.blockedBy)) return undefined;
  return {
    agentAccountId: value.agentAccountId,
    profileState: value.profileState,
    stopped: value.stopped,
    displayName: value.displayName as string | null,
    intro: value.intro,
    knowledge,
    nextQuestion,
    answers,
    notes,
    boundaries: [...(value.boundaries as string[])],
    pendingQuestions,
    publicCard: {
      state: card.state,
      displayName: card.displayName as string | null,
      shareRoute: card.shareRoute as string | null,
      visitorAnswersLast24h: card.visitorAnswersLast24h,
      visitorDailyCap: card.visitorDailyCap,
      canPublish: card.canPublish,
      ...(isString(card.blockedBy) ? { blockedBy: card.blockedBy } : {}),
    },
    proSettingsRoute: value.proSettingsRoute,
  };
}

export function decodeDigitalTwinEveryoneHomeV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneHomeV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['home must be an object']);
  const bad = checkSchema(input);
  if (bad) return bad;
  if (!isMember(DIGITAL_TWIN_EVERYONE_HOME_STATUSES_V1, input.status)) return fail('invalid_enum', ['status']);
  const base = { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, status: input.status } as const;
  switch (input.status) {
    case 'unavailable': {
      const reason = input.reasonCode;
      if (reason !== 'flag_off' && reason !== 'capability_off' && reason !== 'not_in_cohort') return fail('invalid_enum', ['reasonCode']);
      return { ok: true, value: { ...base, reasonCode: reason } };
    }
    case 'needs_agent_choice': {
      if (!Array.isArray(input.agents) || input.agents.length === 0) return fail('invalid_shape', ['agents']);
      const agents: DigitalTwinEveryoneAgentChoiceV1[] = [];
      for (const agent of input.agents) {
        if (!isRecord(agent) || !isString(agent.agentAccountId) || !(agent.name === null || isString(agent.name)) || typeof agent.hasTwin !== 'boolean') {
          return fail('invalid_shape', ['agents[]']);
        }
        agents.push({ agentAccountId: agent.agentAccountId, name: agent.name as string | null, hasTwin: agent.hasTwin });
      }
      return { ok: true, value: { ...base, agents } };
    }
    case 'no_twin': {
      if (!(input.agentAccountId === null || isString(input.agentAccountId))) return fail('invalid_shape', ['agentAccountId']);
      return { ok: true, value: { ...base, agentAccountId: input.agentAccountId as string | null } };
    }
    default: {
      const twin = decodeTwinView(input.twin);
      if (!twin) return fail('invalid_shape', ['twin']);
      return { ok: true, value: { ...base, twin } };
    }
  }
}

export function decodeDigitalTwinEveryoneCardV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinEveryoneCardV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['card must be an object']);
  const bad = checkSchema(input);
  if (bad) return bad;
  if (input.state !== 'available' && input.state !== 'unavailable') return fail('invalid_enum', ['state']);
  if (!(input.displayName === null || isString(input.displayName)) || !isString(input.intro) || input.verified !== false || typeof input.askOpen !== 'boolean') {
    return fail('invalid_shape', ['card fields']);
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      state: input.state,
      displayName: input.displayName as string | null,
      intro: input.intro,
      verified: false,
      unverifiedLabel: DIGITAL_TWIN_EVERYONE_UNVERIFIED_LABEL_V1,
      askOpen: input.askOpen,
    },
  };
}
