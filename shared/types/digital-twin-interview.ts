/**
 * Digital Twin — Twin Interview contract (`digital-twin/v1`, Task 4).
 *
 * The interview is the Creator's ten-minute path into a Self Model. Its output
 * is deliberately split in two:
 *
 *  - **Canonical candidates.** Facts, persona lines and style instructions become
 *    a `agentrix.generic-archive-items/2` document. Digital Twin never writes
 *    them: the document is submitted through the ordinary Agent Portability
 *    import flow (scan → preview → owner decision → canonical writer → receipt →
 *    read-back → undo). `writesCanonicalState: false` is a literal on the plan.
 *  - **Seed Trial interim records.** No-answer boundaries, inference scope,
 *    handoff and Mandate *defaults*, Offer Catalog drafts and the gold set stay
 *    inside the Digital Twin module as `interim_seed_*` product state. They are
 *    not a Trust relationship, not an Authority grant and not a payment fact
 *    (evidence/dt-g0-owner-map.md, tasks §0.1.4); `notAGrant: true` is a literal.
 *
 * Answers are versioned: re-answering appends a version, nothing is rewritten.
 */
import { findPortableSecretViolations } from './agent-portability';
import type { DigitalTwinConsentStateV1 } from './digital-twin-consent';
import type { DigitalTwinPublicFacetRecordV1 } from './digital-twin-public';
import type { DigitalTwinBodyStateV1 } from './digital-twin-body';
import type { DigitalTwinLeadStateV1 } from './digital-twin-lead';
import type { DigitalTwinContentStateV1 } from './digital-twin-content';
import type { DigitalTwinFacetApprovalRecordV1 } from './digital-twin-facet-approval';
import type { DigitalTwinStopRecordV1 } from './digital-twin-stop';
import {
  GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
  createGenericArchiveItemV2,
  defaultArchiveMetadataV2,
  type GenericArchiveItemV2,
  type GenericArchiveItemsDocumentV2,
} from './agent-portability-archive-v2';
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_FACETS_V1,
  DIGITAL_TWIN_INTERVIEW_SESSION_STATES_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  isDigitalTwinRefV1,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinFacetV1,
  type DigitalTwinInterviewProgressV1,
  type DigitalTwinInterviewSessionStateV1,
  type DigitalTwinRefV1,
} from './digital-twin';
import { computeDigest, type DigestRef } from './trust-loop-primitives';

const { isRecord, isNonEmptyString, isIsoTimestamp, isMember, isDigestRef, unknownKeys, fail } =
  DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION = 'twin-interview/v0' as const;
export const DIGITAL_TWIN_INTERVIEW_NAMESPACE = 'agentrix-digital-twin' as const;
export const DIGITAL_TWIN_INTERVIEW_SOURCE_OBJECT_TYPE = 'interview_answer' as const;
export const DIGITAL_TWIN_CANDIDATE_PLAN_DIGEST_DOMAIN = 'AGENTRIX_DIGITAL_TWIN_CANDIDATE_PLAN_V1' as const;
export const DIGITAL_TWIN_INTERVIEW_RESPONSE_DIGEST_DOMAIN =
  'AGENTRIX_DIGITAL_TWIN_INTERVIEW_RESPONSE_V1' as const;

/** Bounds an answer. Longer material belongs in content intake, not the interview. */
export const DIGITAL_TWIN_INTERVIEW_MAX_ANSWER_CHARS = 4000;
/** A multi-line answer yields at most this many candidates. */
export const DIGITAL_TWIN_INTERVIEW_MAX_LINES_PER_ANSWER = 20;
export const DIGITAL_TWIN_INTERVIEW_MAX_LINE_CHARS = 1000;

export const DIGITAL_TWIN_INTERVIEW_LANGUAGES_V1 = ['zh-CN', 'en'] as const;
export type DigitalTwinInterviewLanguageV1 = (typeof DIGITAL_TWIN_INTERVIEW_LANGUAGES_V1)[number];

export const DIGITAL_TWIN_INTERVIEW_MODALITIES_V1 = ['text', 'voice_transcript'] as const;
export type DigitalTwinInterviewModalityV1 = (typeof DIGITAL_TWIN_INTERVIEW_MODALITIES_V1)[number];

export const DIGITAL_TWIN_INTERVIEW_GROUPS_V1 = [
  'what_you_do',
  'how_you_think',
  'no_answer',
  'style',
  'handoff',
  'boundaries',
  'calibration',
] as const;
export type DigitalTwinInterviewGroupV1 = (typeof DIGITAL_TWIN_INTERVIEW_GROUPS_V1)[number];

export const DIGITAL_TWIN_INTERVIEW_OUTPUT_KINDS_V1 = [
  'confirmed_fact',
  'persona_line',
  'style_instruction',
  'offer_draft',
  'no_answer_boundary',
  'inference_scope',
  'handoff_default',
  'review_preference',
  'mandate_default',
  'gold_set_answer',
  'gold_set_refusal',
] as const;
export type DigitalTwinInterviewOutputKindV1 = (typeof DIGITAL_TWIN_INTERVIEW_OUTPUT_KINDS_V1)[number];

export const DIGITAL_TWIN_INTERIM_RECORDS_V1 = [
  'interim_seed_policy',
  'interim_seed_offer',
  'interim_seed_gold_set',
  'interim_seed_review_preference',
] as const;
export type DigitalTwinInterimRecordV1 = (typeof DIGITAL_TWIN_INTERIM_RECORDS_V1)[number];

export type DigitalTwinInterviewOutputTargetV1 =
  | { target: 'canonical'; itemType: 'memory' | 'instruction' }
  | { target: 'interim'; record: DigitalTwinInterimRecordV1 };

/**
 * Where each output kind may go. Anything that would look like a grant, a
 * consent or an offer is interim by construction; only facts and instructions
 * are canonical candidates.
 */
export const DIGITAL_TWIN_INTERVIEW_OUTPUT_TARGETS_V1: Readonly<
  Record<DigitalTwinInterviewOutputKindV1, DigitalTwinInterviewOutputTargetV1>
> = {
  confirmed_fact: { target: 'canonical', itemType: 'memory' },
  persona_line: { target: 'canonical', itemType: 'instruction' },
  style_instruction: { target: 'canonical', itemType: 'instruction' },
  offer_draft: { target: 'interim', record: 'interim_seed_offer' },
  no_answer_boundary: { target: 'interim', record: 'interim_seed_policy' },
  inference_scope: { target: 'interim', record: 'interim_seed_policy' },
  handoff_default: { target: 'interim', record: 'interim_seed_policy' },
  review_preference: { target: 'interim', record: 'interim_seed_review_preference' },
  mandate_default: { target: 'interim', record: 'interim_seed_policy' },
  gold_set_answer: { target: 'interim', record: 'interim_seed_gold_set' },
  gold_set_refusal: { target: 'interim', record: 'interim_seed_gold_set' },
};

export const DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1 = [
  'q01', 'q02', 'q03', 'q04', 'q05', 'q06', 'q07', 'q08', 'q09', 'q10',
  'q11', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17', 'q18', 'q19', 'q20',
] as const;
export type DigitalTwinInterviewQuestionIdV1 = (typeof DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1)[number];

/** The five questions that make the ten-minute private twin (design Appendix A). */
export const DIGITAL_TWIN_INTERVIEW_CORE_QUESTION_IDS_V1: readonly DigitalTwinInterviewQuestionIdV1[] = [
  'q01',
  'q02',
  'q05',
  'q09',
  'q14',
];

export interface DigitalTwinInterviewQuestionV1 {
  id: DigitalTwinInterviewQuestionIdV1;
  group: DigitalTwinInterviewGroupV1;
  core: boolean;
  outputs: readonly DigitalTwinInterviewOutputKindV1[];
  /** Facet the answer is filed under unless the Creator says otherwise. */
  defaultFacet: DigitalTwinFacetV1;
  /** Each non-empty line of the answer becomes its own candidate. */
  splitLines: boolean;
  prompt: Readonly<Record<DigitalTwinInterviewLanguageV1, string>>;
}

export interface DigitalTwinInterviewTemplateV1 {
  templateVersion: typeof DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION;
  coreQuestionIds: readonly DigitalTwinInterviewQuestionIdV1[];
  questions: readonly DigitalTwinInterviewQuestionV1[];
}

function q(
  id: DigitalTwinInterviewQuestionIdV1,
  group: DigitalTwinInterviewGroupV1,
  outputs: readonly DigitalTwinInterviewOutputKindV1[],
  defaultFacet: DigitalTwinFacetV1,
  splitLines: boolean,
  zh: string,
  en: string,
): DigitalTwinInterviewQuestionV1 {
  return {
    id,
    group,
    core: DIGITAL_TWIN_INTERVIEW_CORE_QUESTION_IDS_V1.includes(id),
    outputs,
    defaultFacet,
    splitLines,
    prompt: { 'zh-CN': zh, en },
  };
}

/** Frozen starter template v0 (design Appendix A). Changing a prompt requires a new version. */
export const DIGITAL_TWIN_INTERVIEW_TEMPLATE_V0: DigitalTwinInterviewTemplateV1 = {
  templateVersion: DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION,
  coreQuestionIds: DIGITAL_TWIN_INTERVIEW_CORE_QUESTION_IDS_V1,
  questions: [
    q('q01', 'what_you_do', ['persona_line', 'offer_draft'], 'public', false,
      '用一句话介绍你为谁解决什么问题。',
      'In one sentence: whom do you help, and with what problem?'),
    q('q02', 'what_you_do', ['confirmed_fact', 'offer_draft'], 'public', true,
      '你目前提供哪些服务或产品？每项大致价格或区间、时长、交付方式。',
      'Which services or products do you offer today? For each: rough price or range, duration, and how it is delivered.'),
    q('q03', 'what_you_do', ['confirmed_fact', 'offer_draft', 'handoff_default'], 'public', true,
      '哪些服务可以直接预约？哪些必须先和你聊？预约或联系方式是什么？',
      'Which services can be booked directly, which need a conversation first, and how do people book or reach you?'),
    q('q04', 'what_you_do', ['confirmed_fact'], 'public', true,
      '你的典型客户是谁？什么样的人不适合找你？',
      'Who is your typical client, and who is not a good fit?'),
    q('q05', 'how_you_think', ['confirmed_fact'], 'public', true,
      '最常被问到的十个问题分别是什么？你的标准回答是什么？（每行一问一答）',
      'What are the ten questions you are asked most, and your standard answers? (one question and answer per line)'),
    q('q06', 'how_you_think', ['confirmed_fact'], 'public', false,
      '你最常被误解的一个观点是什么，正确的说法是什么？',
      'Which of your views is misunderstood most often, and what is the correct version?'),
    q('q07', 'how_you_think', ['confirmed_fact'], 'public', true,
      '有哪些你明确不同意的行业流行说法？',
      'Which popular claims in your field do you explicitly disagree with?'),
    q('q08', 'how_you_think', ['confirmed_fact'], 'public', false,
      '过去一年你改变过看法的一件事是什么？',
      'What is one thing you changed your mind about in the past year?'),
    q('q09', 'no_answer', ['no_answer_boundary'], 'private', true,
      '哪些话题绝不允许分身代答，必须转给你本人？（每行一条）',
      'Which topics must the twin never answer for you and always hand to you? (one per line)'),
    q('q10', 'no_answer', ['no_answer_boundary', 'style_instruction'], 'private', false,
      '涉及价格折扣、合同、退款时，分身应该怎么说？',
      'When discounts, contracts or refunds come up, what should the twin say?'),
    q('q11', 'no_answer', ['inference_scope'], 'private', true,
      '哪些领域你允许分身根据你的公开内容做推断？哪些不允许？（每行一条，注明允许/不允许）',
      'In which areas may the twin infer from your public content, and where is inference forbidden? (one per line, mark allowed/forbidden)'),
    q('q12', 'style', ['style_instruction'], 'public', false,
      '你希望分身用什么语气、多长的回答？举一段你满意的自己的文字。',
      'What tone and answer length should the twin use? Paste a passage of your own writing you are happy with.'),
    q('q13', 'style', ['style_instruction'], 'public', false,
      '有没有你常用的表达、比喻或口头禅？有没有你绝不使用的词？',
      'Do you have signature expressions, metaphors or catchphrases? Words you never use?'),
    q('q14', 'handoff', ['confirmed_fact', 'handoff_default'], 'public', false,
      '访客要找你本人时，你希望他们通过什么方式联系？预计多久回复？',
      'When a visitor wants you in person, how should they reach you, and how soon do you usually reply?'),
    q('q15', 'handoff', ['review_preference'], 'private', false,
      '每周你愿意花多少时间复核分身的回答？希望在什么时间收到摘要？',
      'How much time per week will you spend reviewing the twin, and when should the digest arrive?'),
    q('q16', 'boundaries', ['mandate_default'], 'private', true,
      '分身可以出现在哪些渠道（网站、公众号、群分享链接）？不希望出现在哪里？（每行一条）',
      'Where may the twin appear (website, official account, group share links), and where not? (one per line)'),
    q('q17', 'boundaries', ['mandate_default'], 'private', false,
      '是否允许分身用你的声音回答？是否允许生成你的形象视频？用于哪些场景？（这只是意向；正式同意在肖像授权步骤单独录制）',
      'May the twin answer in your voice? Generate video of your likeness? For which scenarios? (Intent only; formal consent is recorded separately in the likeness step.)'),
    q('q18', 'boundaries', ['no_answer_boundary'], 'private', true,
      '有哪些人或机构的问题你不希望分身回答？（每行一条）',
      'Are there people or organisations whose questions the twin should not answer? (one per line)'),
    q('q19', 'calibration', ['gold_set_answer'], 'private', true,
      '请给出三个访客可能问、且你希望分身答对的问题及你的答案。（每行一问一答）',
      'Give three questions a visitor might ask that the twin should get right, with your answers. (one per line)'),
    q('q20', 'calibration', ['gold_set_refusal'], 'private', true,
      '请给出两个分身应该拒答的问题。（每行一条）',
      'Give two questions the twin should refuse. (one per line)'),
  ],
};

const QUESTION_BY_ID: ReadonlyMap<string, DigitalTwinInterviewQuestionV1> = new Map(
  DIGITAL_TWIN_INTERVIEW_TEMPLATE_V0.questions.map((question) => [question.id, question]),
);

export function digitalTwinInterviewQuestionV1(id: string): DigitalTwinInterviewQuestionV1 | undefined {
  return QUESTION_BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// Responses and session
// ---------------------------------------------------------------------------

export interface DigitalTwinInterviewResponseCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  questionId: DigitalTwinInterviewQuestionIdV1;
  modality: DigitalTwinInterviewModalityV1;
  /** Required unless `skipped`. Trimmed, 1..MAX_ANSWER_CHARS. */
  text?: string;
  skipped?: boolean;
  language?: DigitalTwinInterviewLanguageV1;
  facet?: DigitalTwinFacetV1;
  /** Provenance of a voice answer's transcript; the audio itself never enters Digital Twin. */
  transcriptRef?: DigitalTwinRefV1;
}

export interface DigitalTwinInterviewResponseV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  questionId: DigitalTwinInterviewQuestionIdV1;
  /** 1-based; re-answering appends. */
  version: number;
  modality: DigitalTwinInterviewModalityV1;
  skipped: boolean;
  /** Empty string when skipped. */
  text: string;
  textDigest: DigestRef;
  language: DigitalTwinInterviewLanguageV1;
  facet: DigitalTwinFacetV1;
  transcriptRef?: DigitalTwinRefV1;
  createdAt: string;
}

export interface DigitalTwinInterviewSessionV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  sessionRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  templateVersion: typeof DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION;
  state: DigitalTwinInterviewSessionStateV1;
  progress: DigitalTwinInterviewProgressV1;
  /** Latest version of every answered or skipped question. */
  responses: DigitalTwinInterviewResponseV1[];
  lastPlanDigest?: DigestRef;
  createdAt: string;
  updatedAt: string;
}

export function computeDigitalTwinInterviewProgressV1(
  responses: readonly Pick<DigitalTwinInterviewResponseV1, 'questionId' | 'skipped'>[],
): DigitalTwinInterviewProgressV1 {
  const answered = new Set<string>();
  const skipped = new Set<string>();
  for (const response of responses) {
    (response.skipped ? skipped : answered).add(response.questionId);
  }
  const coreAnswered = DIGITAL_TWIN_INTERVIEW_CORE_QUESTION_IDS_V1.filter((id) => answered.has(id)).length;
  return {
    answered: answered.size,
    skipped: skipped.size,
    total: DIGITAL_TWIN_INTERVIEW_TEMPLATE_V0.questions.length,
    coreAnswered,
    coreTotal: DIGITAL_TWIN_INTERVIEW_CORE_QUESTION_IDS_V1.length,
    minimumMet: coreAnswered === DIGITAL_TWIN_INTERVIEW_CORE_QUESTION_IDS_V1.length,
  };
}

export function deriveDigitalTwinInterviewSessionStateV1(
  progress: DigitalTwinInterviewProgressV1,
): DigitalTwinInterviewSessionStateV1 {
  if (progress.answered + progress.skipped >= progress.total && progress.minimumMet) return 'complete';
  if (progress.minimumMet) return 'minimum_met';
  return 'in_progress';
}

export function computeDigitalTwinInterviewResponseDigestV1(input: {
  questionId: string;
  version: number;
  text: string;
  facet: DigitalTwinFacetV1;
  skipped: boolean;
}): DigestRef {
  return computeDigest({ domain: DIGITAL_TWIN_INTERVIEW_RESPONSE_DIGEST_DOMAIN, ...input });
}

/**
 * Common credential shapes the shared Portability detector does not cover
 * (GitHub, Slack, Google API keys, inline password/secret assignments).
 * A Creator pasting these into a twin would leak them to every Visitor.
 */
const EXTRA_SECRET_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S{6,}/i,
];

/** Secret material never enters an interview answer or an intake line, even as a candidate. */
export function digitalTwinTextLooksSecretV1(text: string): boolean {
  if (findPortableSecretViolations({ text }).length > 0) return true;
  return EXTRA_SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeAnswerText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function decodeDigitalTwinInterviewResponseCommandV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinInterviewResponseCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'questionId',
    'modality',
    'text',
    'skipped',
    'language',
    'facet',
    'transcriptRef',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  const { questionId, modality } = input;
  if (!isMember(DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1, questionId)) return fail('invalid_enum', ['questionId']);
  if (!isMember(DIGITAL_TWIN_INTERVIEW_MODALITIES_V1, modality)) return fail('invalid_enum', ['modality']);
  if (input.skipped !== undefined && typeof input.skipped !== 'boolean') return fail('invalid_shape', ['skipped']);
  let language: DigitalTwinInterviewLanguageV1 | undefined;
  if (input.language !== undefined) {
    if (!isMember(DIGITAL_TWIN_INTERVIEW_LANGUAGES_V1, input.language)) return fail('invalid_enum', ['language']);
    language = input.language;
  }
  let facet: DigitalTwinFacetV1 | undefined;
  if (input.facet !== undefined) {
    if (!isMember(DIGITAL_TWIN_FACETS_V1, input.facet)) return fail('invalid_enum', ['facet']);
    facet = input.facet;
  }
  let transcriptRef: DigitalTwinRefV1 | undefined;
  if (input.transcriptRef !== undefined) {
    if (!isDigitalTwinRefV1(input.transcriptRef) || input.transcriptRef.kind !== 'transcript') {
      return fail('invalid_ref', ['transcriptRef']);
    }
    transcriptRef = input.transcriptRef;
  }
  const skipped = input.skipped === true;
  if (skipped) {
    if (input.text !== undefined && input.text !== '') return fail('invalid_shape', ['text must be empty when skipped']);
    return {
      ok: true,
      value: {
        schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
        questionId,
        modality,
        skipped: true,
        ...(language !== undefined ? { language } : {}),
        ...(facet !== undefined ? { facet } : {}),
      },
    };
  }
  if (typeof input.text !== 'string') return fail('invalid_shape', ['text']);
  const text = normalizeAnswerText(input.text);
  if (text.length === 0) return fail('invalid_shape', ['text is empty']);
  if (text.length > DIGITAL_TWIN_INTERVIEW_MAX_ANSWER_CHARS) return fail('invalid_shape', ['text exceeds max length']);
  if (modality === 'voice_transcript' && transcriptRef === undefined) {
    return fail('invalid_shape', ['voice_transcript requires transcriptRef']);
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      questionId,
      modality,
      text,
      skipped: false,
      ...(language !== undefined ? { language } : {}),
      ...(facet !== undefined ? { facet } : {}),
      ...(transcriptRef !== undefined ? { transcriptRef } : {}),
    },
  };
}

export function decodeDigitalTwinInterviewResponseV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinInterviewResponseV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['response must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'questionId',
    'version',
    'modality',
    'skipped',
    'text',
    'textDigest',
    'language',
    'facet',
    'transcriptRef',
    'createdAt',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isMember(DIGITAL_TWIN_INTERVIEW_QUESTION_IDS_V1, input.questionId)) return fail('invalid_enum', ['questionId']);
  if (!(Number.isInteger(input.version) && (input.version as number) >= 1)) return fail('invalid_shape', ['version']);
  if (!isMember(DIGITAL_TWIN_INTERVIEW_MODALITIES_V1, input.modality)) return fail('invalid_enum', ['modality']);
  if (typeof input.skipped !== 'boolean') return fail('invalid_shape', ['skipped']);
  if (typeof input.text !== 'string') return fail('invalid_shape', ['text']);
  if (!isDigestRef(input.textDigest)) return fail('invalid_shape', ['textDigest']);
  if (!isMember(DIGITAL_TWIN_INTERVIEW_LANGUAGES_V1, input.language)) return fail('invalid_enum', ['language']);
  if (!isMember(DIGITAL_TWIN_FACETS_V1, input.facet)) return fail('invalid_enum', ['facet']);
  if (input.transcriptRef !== undefined && (!isDigitalTwinRefV1(input.transcriptRef) || input.transcriptRef.kind !== 'transcript')) {
    return fail('invalid_ref', ['transcriptRef']);
  }
  if (!isIsoTimestamp(input.createdAt)) return fail('invalid_timestamp', ['createdAt']);
  return { ok: true, value: input as unknown as DigitalTwinInterviewResponseV1 };
}

export function decodeDigitalTwinInterviewSessionV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinInterviewSessionV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['session must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'sessionRef',
    'profileRef',
    'templateVersion',
    'state',
    'progress',
    'responses',
    'lastPlanDigest',
    'createdAt',
    'updatedAt',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isDigitalTwinRefV1(input.sessionRef) || input.sessionRef.kind !== 'interview_session') return fail('invalid_ref', ['sessionRef']);
  if (!isDigitalTwinRefV1(input.profileRef) || input.profileRef.kind !== 'digital_twin_profile') return fail('invalid_ref', ['profileRef']);
  if (input.templateVersion !== DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION) return fail('unknown_contract_version', ['templateVersion']);
  if (!isMember(DIGITAL_TWIN_INTERVIEW_SESSION_STATES_V1, input.state)) return fail('invalid_enum', ['state']);
  if (!isRecord(input.progress)) return fail('invalid_shape', ['progress']);
  if (!Array.isArray(input.responses)) return fail('invalid_shape', ['responses']);
  const seen = new Set<string>();
  for (const item of input.responses) {
    const decoded = decodeDigitalTwinInterviewResponseV1(item);
    if (decoded.ok === false) return decoded as DigitalTwinDecodeResultV1<DigitalTwinInterviewSessionV1>;
    if (seen.has(decoded.value.questionId)) return fail('invalid_shape', ['responses must hold one latest version per question']);
    seen.add(decoded.value.questionId);
  }
  if (input.lastPlanDigest !== undefined && !isDigestRef(input.lastPlanDigest)) return fail('invalid_shape', ['lastPlanDigest']);
  if (!isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt)) return fail('invalid_timestamp', ['createdAt/updatedAt']);
  return { ok: true, value: input as unknown as DigitalTwinInterviewSessionV1 };
}

// ---------------------------------------------------------------------------
// Candidate plan (preview; nothing is written)
// ---------------------------------------------------------------------------

export const DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA = 'agent-portability:import-jobs' as const;

export interface DigitalTwinCandidatePlanCanonicalItemV1 {
  /** Equals `document.items[i].sourceRef.id`. */
  sourceId: string;
  questionId: DigitalTwinInterviewQuestionIdV1;
  version: number;
  outputKind: Extract<DigitalTwinInterviewOutputKindV1, 'confirmed_fact' | 'persona_line' | 'style_instruction'>;
  itemType: 'memory' | 'instruction';
  facet: DigitalTwinFacetV1;
}

export interface DigitalTwinCandidatePlanInterimV1 {
  policy: {
    record: 'interim_seed_policy';
    /** Literal: these defaults can never become an Authority grant. */
    notAGrant: true;
    noAnswerBoundaries: string[];
    inferenceScope: string[];
    handoffDefaults: string[];
    mandateDefaults: string[];
  };
  offerDrafts: { record: 'interim_seed_offer'; items: string[] };
  reviewPreferences: { record: 'interim_seed_review_preference'; items: string[] };
  goldSet: { record: 'interim_seed_gold_set'; shouldAnswer: string[]; shouldRefuse: string[] };
}

export interface DigitalTwinCandidatePlanV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  planRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  sessionRef: DigitalTwinRefV1;
  templateVersion: typeof DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION;
  canonical: {
    document: GenericArchiveItemsDocumentV2;
    items: DigitalTwinCandidatePlanCanonicalItemV1[];
    submitVia: typeof DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA;
    writesCanonicalState: false;
  };
  interim: DigitalTwinCandidatePlanInterimV1;
  skippedQuestionIds: DigitalTwinInterviewQuestionIdV1[];
  unansweredQuestionIds: DigitalTwinInterviewQuestionIdV1[];
  planDigest: DigestRef;
  createdAt: string;
}

const FACET_SENSITIVITY: Readonly<Record<DigitalTwinFacetV1, GenericArchiveItemV2['sensitivity']>> = {
  public: 'public',
  work: 'owner',
  private: 'private',
};

function answerLines(response: DigitalTwinInterviewResponseV1, splitLines: boolean): string[] {
  if (!splitLines) return [response.text];
  return response.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, DIGITAL_TWIN_INTERVIEW_MAX_LINES_PER_ANSWER)
    .map((line) => line.slice(0, DIGITAL_TWIN_INTERVIEW_MAX_LINE_CHARS));
}

function sourceId(response: DigitalTwinInterviewResponseV1, lineIndex: number): string {
  return `${DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION}:${response.questionId}:v${response.version}:${lineIndex}`;
}

/**
 * Pure. Same responses → same plan (`planDigest` excludes `createdAt`/`planRef`).
 * Canonical items carry the question and version in `sourceRef` so a later
 * receipt can be traced to exactly one answer version.
 */
export function buildDigitalTwinCandidatePlanV1(input: {
  profileRef: DigitalTwinRefV1;
  sessionRef: DigitalTwinRefV1;
  planId: string;
  responses: readonly DigitalTwinInterviewResponseV1[];
  now: string;
}): DigitalTwinCandidatePlanV1 {
  const items: GenericArchiveItemV2[] = [];
  const meta: DigitalTwinCandidatePlanCanonicalItemV1[] = [];
  const interim: DigitalTwinCandidatePlanInterimV1 = {
    policy: {
      record: 'interim_seed_policy',
      notAGrant: true,
      noAnswerBoundaries: [],
      inferenceScope: [],
      handoffDefaults: [],
      mandateDefaults: [],
    },
    offerDrafts: { record: 'interim_seed_offer', items: [] },
    reviewPreferences: { record: 'interim_seed_review_preference', items: [] },
    goldSet: { record: 'interim_seed_gold_set', shouldAnswer: [], shouldRefuse: [] },
  };
  const skipped: DigitalTwinInterviewQuestionIdV1[] = [];
  const answeredIds = new Set<string>();

  const ordered = [...input.responses].sort((a, b) => a.questionId.localeCompare(b.questionId));
  for (const response of ordered) {
    const question = digitalTwinInterviewQuestionV1(response.questionId);
    if (!question) continue;
    if (response.skipped) {
      skipped.push(response.questionId);
      continue;
    }
    answeredIds.add(response.questionId);
    const lines = answerLines(response, question.splitLines);
    for (const outputKind of question.outputs) {
      const target = DIGITAL_TWIN_INTERVIEW_OUTPUT_TARGETS_V1[outputKind];
      if (target.target === 'interim') {
        switch (outputKind) {
          case 'offer_draft':
            interim.offerDrafts.items.push(...lines);
            break;
          case 'no_answer_boundary':
            interim.policy.noAnswerBoundaries.push(...lines);
            break;
          case 'inference_scope':
            interim.policy.inferenceScope.push(...lines);
            break;
          case 'handoff_default':
            interim.policy.handoffDefaults.push(...lines);
            break;
          case 'mandate_default':
            interim.policy.mandateDefaults.push(...lines);
            break;
          case 'review_preference':
            interim.reviewPreferences.items.push(...lines);
            break;
          case 'gold_set_answer':
            interim.goldSet.shouldAnswer.push(...lines);
            break;
          case 'gold_set_refusal':
            interim.goldSet.shouldRefuse.push(...lines);
            break;
          default:
            break;
        }
        continue;
      }
      // Canonical: one archive item per line; instructions keep the whole answer.
      const canonicalLines = target.itemType === 'instruction' ? [response.text] : lines;
      canonicalLines.forEach((line, index) => {
        const id = `${sourceId(response, index)}:${outputKind}`;
        const metadata = { ...defaultArchiveMetadataV2(target.itemType), sensitivity: FACET_SENSITIVITY[response.facet] };
        const sourceRef = {
          namespace: DIGITAL_TWIN_INTERVIEW_NAMESPACE,
          objectType: DIGITAL_TWIN_INTERVIEW_SOURCE_OBJECT_TYPE,
          id,
          version: String(response.version),
        };
        items.push(
          target.itemType === 'instruction'
            ? createGenericArchiveItemV2({
                itemType: 'instruction',
                sourceRef,
                payload: { text: line, title: `${question.id} ${outputKind}` },
                ...metadata,
              })
            : createGenericArchiveItemV2({
                itemType: 'memory',
                sourceRef,
                payload: { content: line },
                ...metadata,
              }),
        );
        meta.push({
          sourceId: id,
          questionId: response.questionId,
          version: response.version,
          outputKind: outputKind as DigitalTwinCandidatePlanCanonicalItemV1['outputKind'],
          itemType: target.itemType,
          facet: response.facet,
        });
      });
    }
  }

  const unanswered = DIGITAL_TWIN_INTERVIEW_TEMPLATE_V0.questions
    .map((question) => question.id)
    .filter((id) => !answeredIds.has(id) && !skipped.includes(id));

  const document: GenericArchiveItemsDocumentV2 = { schemaVersion: GENERIC_ARCHIVE_ITEMS_SCHEMA_V2, items };
  const digestBody = {
    profileRef: input.profileRef,
    sessionRef: input.sessionRef,
    templateVersion: DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION,
    document,
    items: meta,
    interim,
    skipped,
    unanswered,
  };
  return {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    planRef: { kind: 'candidate_plan', id: input.planId },
    profileRef: input.profileRef,
    sessionRef: input.sessionRef,
    templateVersion: DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION,
    canonical: { document, items: meta, submitVia: DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA, writesCanonicalState: false },
    interim,
    skippedQuestionIds: skipped,
    unansweredQuestionIds: unanswered,
    planDigest: computeDigest({ domain: DIGITAL_TWIN_CANDIDATE_PLAN_DIGEST_DOMAIN, ...digestBody }),
    createdAt: input.now,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function decodeDigitalTwinCandidatePlanV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinCandidatePlanV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['plan must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'planRef',
    'profileRef',
    'sessionRef',
    'templateVersion',
    'canonical',
    'interim',
    'skippedQuestionIds',
    'unansweredQuestionIds',
    'planDigest',
    'createdAt',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isDigitalTwinRefV1(input.planRef) || input.planRef.kind !== 'candidate_plan') return fail('invalid_ref', ['planRef']);
  if (!isDigitalTwinRefV1(input.profileRef) || input.profileRef.kind !== 'digital_twin_profile') return fail('invalid_ref', ['profileRef']);
  if (!isDigitalTwinRefV1(input.sessionRef) || input.sessionRef.kind !== 'interview_session') return fail('invalid_ref', ['sessionRef']);
  if (input.templateVersion !== DIGITAL_TWIN_INTERVIEW_TEMPLATE_VERSION) return fail('unknown_contract_version', ['templateVersion']);
  const canonical = input.canonical;
  if (!isRecord(canonical)) return fail('invalid_shape', ['canonical']);
  if (unknownKeys(canonical, ['document', 'items', 'submitVia', 'writesCanonicalState']).length > 0) {
    return fail('unknown_field', ['canonical']);
  }
  if (canonical.writesCanonicalState !== false) return fail('invalid_shape', ['canonical.writesCanonicalState must be false']);
  if (canonical.submitVia !== DIGITAL_TWIN_CANDIDATE_SUBMIT_VIA) return fail('invalid_enum', ['canonical.submitVia']);
  if (!isRecord(canonical.document) || canonical.document.schemaVersion !== GENERIC_ARCHIVE_ITEMS_SCHEMA_V2 || !Array.isArray(canonical.document.items)) {
    return fail('invalid_shape', ['canonical.document']);
  }
  if (!Array.isArray(canonical.items) || canonical.items.length !== canonical.document.items.length) {
    return fail('invalid_shape', ['canonical.items must align with document.items']);
  }
  const interim = input.interim;
  if (!isRecord(interim) || !isRecord(interim.policy) || interim.policy.notAGrant !== true) {
    return fail('invalid_shape', ['interim.policy.notAGrant must be true']);
  }
  if (interim.policy.record !== 'interim_seed_policy') return fail('invalid_enum', ['interim.policy.record']);
  for (const key of ['noAnswerBoundaries', 'inferenceScope', 'handoffDefaults', 'mandateDefaults']) {
    if (!isStringArray(interim.policy[key])) return fail('invalid_shape', [`interim.policy.${key}`]);
  }
  if (!isRecord(interim.offerDrafts) || interim.offerDrafts.record !== 'interim_seed_offer' || !isStringArray(interim.offerDrafts.items)) {
    return fail('invalid_shape', ['interim.offerDrafts']);
  }
  if (!isRecord(interim.goldSet) || interim.goldSet.record !== 'interim_seed_gold_set') return fail('invalid_shape', ['interim.goldSet']);
  if (!isStringArray(input.skippedQuestionIds) || !isStringArray(input.unansweredQuestionIds)) {
    return fail('invalid_shape', ['skipped/unanswered']);
  }
  if (!isDigestRef(input.planDigest)) return fail('invalid_shape', ['planDigest']);
  if (!isIsoTimestamp(input.createdAt)) return fail('invalid_timestamp', ['createdAt']);
  return { ok: true, value: input as unknown as DigitalTwinCandidatePlanV1 };
}

// ---------------------------------------------------------------------------
// Interim decision (owner confirms Seed Trial product records; never canonical)
// ---------------------------------------------------------------------------

export const DIGITAL_TWIN_INTERIM_DECISION_KINDS_V1 = [
  'policy',
  'offer_drafts',
  'review_preferences',
  'gold_set',
] as const;
export type DigitalTwinInterimDecisionKindV1 = (typeof DIGITAL_TWIN_INTERIM_DECISION_KINDS_V1)[number];

export interface DigitalTwinInterimDecisionCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  planRef: DigitalTwinRefV1;
  /** Must equal the plan the owner previewed; a stale plan is rejected, never merged. */
  planDigest: DigestRef;
  accept: DigitalTwinInterimDecisionKindV1[];
}

export function decodeDigitalTwinInterimDecisionCommandV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinInterimDecisionCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, ['schemaVersion', 'planRef', 'planDigest', 'accept']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isDigitalTwinRefV1(input.planRef) || input.planRef.kind !== 'candidate_plan') return fail('invalid_ref', ['planRef']);
  if (!isDigestRef(input.planDigest)) return fail('invalid_shape', ['planDigest']);
  if (!Array.isArray(input.accept) || input.accept.length === 0) return fail('invalid_shape', ['accept']);
  const accept: DigitalTwinInterimDecisionKindV1[] = [];
  for (const kind of input.accept) {
    if (!isMember(DIGITAL_TWIN_INTERIM_DECISION_KINDS_V1, kind)) return fail('invalid_enum', ['accept']);
    if (!accept.includes(kind)) accept.push(kind);
  }
  return {
    ok: true,
    value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, planRef: input.planRef, planDigest: input.planDigest, accept },
  };
}

/** Digital Twin-owned interim state as projected to the owner (refs/digests/product text only). */
export interface DigitalTwinInterimStateV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  policy: (DigitalTwinCandidatePlanInterimV1['policy'] & { version: number; sourcePlanDigest: DigestRef }) | null;
  offerDrafts: (DigitalTwinCandidatePlanInterimV1['offerDrafts'] & { version: number; sourcePlanDigest: DigestRef }) | null;
  reviewPreferences:
    | (DigitalTwinCandidatePlanInterimV1['reviewPreferences'] & { version: number; sourcePlanDigest: DigestRef })
    | null;
  goldSet: (DigitalTwinCandidatePlanInterimV1['goldSet'] & { version: number; sourcePlanDigest: DigestRef }) | null;
  /** Twin Stop record (`interim_seed_stop`, Task 11); absent until the first stop. */
  stop?: DigitalTwinStopRecordV1;
  /** Seed Trial identity/consent records (`interim_seed_represents`, `interim_seed_likeness_consent`, Task 7). */
  consent?: DigitalTwinConsentStateV1;
  /** Seed Trial publish decision (`interim_seed_public_facet`, Task 10). */
  publicFacet?: DigitalTwinPublicFacetRecordV1;
  /** Seed Trial public Facet approvals (`interim_seed_facet_approval`, refs only; memory → public twin, 2026-09-15). */
  facetApprovals?: DigitalTwinFacetApprovalRecordV1;
  /** Seed Trial body assets (`interim_seed_body_asset`, Task 8); provider handles only, never media. */
  body?: DigitalTwinBodyStateV1;
  /** Seed Trial consented leads (`interim_seed_lead`, Task 13). */
  leads?: DigitalTwinLeadStateV1;
  /** Seed Trial content drafts (`interim_seed_content_draft`, Task 15). */
  content?: DigitalTwinContentStateV1;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Self Model link (after the Portability commit)
// ---------------------------------------------------------------------------

/** Agent Portability job ids are opaque (`import_<hex>` in production, uuids in fixtures); same bound as its owner read. */
const IMPORT_JOB_ID_RE = /^[0-9A-Za-z_-]{8,64}$/;

export interface DigitalTwinLinkSelfModelCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  /** Agent Portability import job id whose committed receipt covers the candidates. */
  importJobId: string;
  /** Digest of the candidate plan the job was built from, if the client still has it. */
  planDigest?: DigestRef;
}

export function decodeDigitalTwinLinkSelfModelCommandV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinLinkSelfModelCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, ['schemaVersion', 'importJobId', 'planDigest']);
  if (extra.length > 0) return fail('unknown_field', extra);
  const { importJobId } = input;
  if (!isNonEmptyString(importJobId) || !IMPORT_JOB_ID_RE.test(importJobId.trim())) return fail('invalid_shape', ['importJobId']);
  let planDigest: DigestRef | undefined;
  if (input.planDigest !== undefined) {
    if (!isDigestRef(input.planDigest)) return fail('invalid_shape', ['planDigest']);
    planDigest = input.planDigest;
  }
  return {
    ok: true,
    value: {
      schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
      importJobId: importJobId.trim(),
      ...(planDigest !== undefined ? { planDigest } : {}),
    },
  };
}
