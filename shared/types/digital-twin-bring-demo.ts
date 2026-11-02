/**
 * L9 P2-2 · 带进来后 60 秒演示 5 问 (target-l9 2.7). Contract between the backend demo route and the web preview.
 *
 * The owner pasted or dropped an export from another AI. The preview already lists the memory lines; this asks
 * the server for "customers might ask you these five things", each answered ONLY from one of those lines
 * (quoted word for word) or marked as "needs you". Nothing is invented, nothing is stored: the lines are
 * read, answered and forgotten.
 *
 * Labels (the three the twin already uses, `confirmed` / `inferred` / `no_answer`, shown as the owner reads them):
 * - `confirmed`  本人确认: the line is the owner's own work line, they ticked it in the preview, and it clearly
 *                answers the topic.
 * - `inferred`   AI 推断: a work line that only partly answers the topic, or one the owner has not ticked.
 * - `needs_you`  需要你: price, discount, contract, refund, medical, legal and investment questions ALWAYS (the
 *                twin never answers them), and any topic with no line to quote.
 */

export const BRING_DEMO_TOPICS_V1 = ['services', 'experience', 'area', 'hours', 'price'] as const;
export type BringDemoTopicV1 = (typeof BRING_DEMO_TOPICS_V1)[number];

export const BRING_DEMO_CATEGORIES_V1 = ['work', 'private'] as const;
/** `work`: 工作和服务. `private`: 私事, not used by default. */
export type BringDemoCategoryV1 = (typeof BRING_DEMO_CATEGORIES_V1)[number];

export const BRING_DEMO_LABELS_V1 = ['confirmed', 'inferred', 'needs_you'] as const;
export type BringDemoLabelV1 = (typeof BRING_DEMO_LABELS_V1)[number];

export const BRING_DEMO_LANGUAGES_V1 = ['zh', 'en'] as const;
export type BringDemoLanguageV1 = (typeof BRING_DEMO_LANGUAGES_V1)[number];

/** Why a question is "needs you". */
export type BringDemoNeedsYouReasonV1 = 'commitment' | 'no_source';

/** Fewer answerable questions than this: say so, and send the owner to the interview instead. */
export const BRING_DEMO_MIN_ANSWERABLE_V1 = 3;
export const BRING_DEMO_QUESTION_COUNT_V1 = 5;
/** A demo that takes longer than this does not count as "within 60 seconds" (A2). */
export const BRING_DEMO_BUDGET_MS_V1 = 60_000;

export const BRING_DEMO_LIMITS_V1 = {
  maxMemories: 300,
  maxIdLength: 64,
  maxTextLength: 1000,
  maxIndustryLength: 40,
  maxQuoteLength: 160,
} as const;

export const BRING_DEMO_ROUTES_V1 = {
  create: '/v1/me/twin/bring-demo',
  feedback: '/v1/me/twin/bring-demo/feedback',
} as const;

export interface BringDemoMemoryV1 {
  /** The preview's own item id; echoed back so the page can mark lines. */
  id: string;
  text: string;
  /** The owner ticked this line in the preview. */
  selected: boolean;
  /** The owner moved this line between work and private; wins over the server's guess. */
  ownerCategory?: BringDemoCategoryV1;
}

export interface BringDemoRequestV1 {
  memories: BringDemoMemoryV1[];
  /** One short line, optional: the question wording only. */
  industry?: string;
  language: BringDemoLanguageV1;
}

export interface BringDemoClassifiedV1 {
  id: string;
  category: BringDemoCategoryV1;
}

export interface BringDemoQuestionV1 {
  topic: BringDemoTopicV1;
  question: string;
  label: BringDemoLabelV1;
  /** `null` for `needs_you`. */
  answer: string | null;
  /** The source sentence, word for word (a prefix with `quoteCut` when it was very long). `null` for `needs_you`. */
  quote: string | null;
  quoteCut: boolean;
  /** Which preview line the quote came from. */
  quoteMemoryId: string | null;
  needsYouReason: BringDemoNeedsYouReasonV1 | null;
}

export interface BringDemoResultV1 {
  schemaVersion: 1;
  /** Opaque, only for matching the feedback to this demo in the log. */
  demoId: string;
  found: number;
  workCount: number;
  privateCount: number;
  classified: BringDemoClassifiedV1[];
  questions: BringDemoQuestionV1[];
  /** How many of the five carry an answer (`confirmed` or `inferred`). */
  answerableCount: number;
  /** `false`: fewer than 3 answerable; the page says what is missing and goes to the interview. */
  enough: boolean;
  /** Topics with nothing to quote, in question order. */
  missingTopics: BringDemoTopicV1[];
  elapsedMs: number;
  withinBudget: boolean;
}

export interface BringDemoFeedbackV1 {
  demoId: string;
  /** "这 5 条里有几条可以直接用？" 0 to 5. */
  usable: 0 | 1 | 2 | 3 | 4 | 5;
}

export type BringDemoDecodeV1<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

/** Strip control characters and collapse whitespace; the demo only ever uses plain text. */
export function cleanBringDemoText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function decodeBringDemoRequestV1(input: unknown): BringDemoDecodeV1<BringDemoRequestV1> {
  if (!isRecord(input)) return { ok: false, errors: ['body'] };
  const extra = unknownKeys(input, ['memories', 'industry', 'language']);
  if (extra.length > 0) return { ok: false, errors: extra.map((key) => `unknown:${key}`) };
  if (!(BRING_DEMO_LANGUAGES_V1 as readonly unknown[]).includes(input.language)) return { ok: false, errors: ['language'] };
  if (!Array.isArray(input.memories) || input.memories.length === 0 || input.memories.length > BRING_DEMO_LIMITS_V1.maxMemories) {
    return { ok: false, errors: ['memories'] };
  }
  const memories: BringDemoMemoryV1[] = [];
  const seen = new Set<string>();
  for (const raw of input.memories) {
    if (!isRecord(raw) || unknownKeys(raw, ['id', 'text', 'selected', 'ownerCategory']).length > 0) return { ok: false, errors: ['memories[]'] };
    if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > BRING_DEMO_LIMITS_V1.maxIdLength || seen.has(raw.id)) {
      return { ok: false, errors: ['memories[].id'] };
    }
    if (typeof raw.text !== 'string' || raw.text.length > BRING_DEMO_LIMITS_V1.maxTextLength) return { ok: false, errors: ['memories[].text'] };
    if (typeof raw.selected !== 'boolean') return { ok: false, errors: ['memories[].selected'] };
    if (raw.ownerCategory !== undefined && !(BRING_DEMO_CATEGORIES_V1 as readonly unknown[]).includes(raw.ownerCategory)) {
      return { ok: false, errors: ['memories[].ownerCategory'] };
    }
    seen.add(raw.id);
    const text = cleanBringDemoText(raw.text);
    if (!text) continue;
    memories.push({
      id: raw.id,
      text,
      selected: raw.selected,
      ...(raw.ownerCategory ? { ownerCategory: raw.ownerCategory as BringDemoCategoryV1 } : {}),
    });
  }
  if (memories.length === 0) return { ok: false, errors: ['memories'] };
  let industry: string | undefined;
  if (input.industry !== undefined) {
    if (typeof input.industry !== 'string') return { ok: false, errors: ['industry'] };
    const cleaned = cleanBringDemoText(input.industry);
    if (cleaned.length > BRING_DEMO_LIMITS_V1.maxIndustryLength) return { ok: false, errors: ['industry'] };
    industry = cleaned || undefined;
  }
  return { ok: true, value: { memories, ...(industry ? { industry } : {}), language: input.language as BringDemoLanguageV1 } };
}

export function decodeBringDemoFeedbackV1(input: unknown): BringDemoDecodeV1<BringDemoFeedbackV1> {
  if (!isRecord(input) || unknownKeys(input, ['demoId', 'usable']).length > 0) return { ok: false, errors: ['body'] };
  if (typeof input.demoId !== 'string' || !/^[0-9a-f]{16,40}$/.test(input.demoId)) return { ok: false, errors: ['demoId'] };
  const usable = input.usable;
  if (typeof usable !== 'number' || !Number.isInteger(usable) || usable < 0 || usable > BRING_DEMO_QUESTION_COUNT_V1) {
    return { ok: false, errors: ['usable'] };
  }
  return { ok: true, value: { demoId: input.demoId, usable: usable as BringDemoFeedbackV1['usable'] } };
}

/**
 * The page checks what the server sent before it shows a word of it. A wrong shape is `null`, not a half page.
 * Every answered question must carry its quote; a "needs you" question must carry neither answer nor quote.
 */
export function decodeBringDemoResultV1(input: unknown): BringDemoResultV1 | null {
  if (!isRecord(input) || input.schemaVersion !== 1 || typeof input.demoId !== 'string') return null;
  if (!Array.isArray(input.questions) || input.questions.length !== BRING_DEMO_QUESTION_COUNT_V1) return null;
  if (!Array.isArray(input.classified) || !Array.isArray(input.missingTopics)) return null;
  for (const key of ['found', 'workCount', 'privateCount', 'answerableCount', 'elapsedMs'] as const) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key] as number)) return null;
  }
  if (typeof input.enough !== 'boolean' || typeof input.withinBudget !== 'boolean') return null;
  const classified: BringDemoClassifiedV1[] = [];
  for (const row of input.classified) {
    if (!isRecord(row) || typeof row.id !== 'string' || !(BRING_DEMO_CATEGORIES_V1 as readonly unknown[]).includes(row.category)) return null;
    classified.push({ id: row.id, category: row.category as BringDemoCategoryV1 });
  }
  const questions: BringDemoQuestionV1[] = [];
  for (const row of input.questions) {
    if (!isRecord(row) || typeof row.question !== 'string') return null;
    if (!(BRING_DEMO_TOPICS_V1 as readonly unknown[]).includes(row.topic)) return null;
    if (!(BRING_DEMO_LABELS_V1 as readonly unknown[]).includes(row.label)) return null;
    const needsYou = row.label === 'needs_you';
    if (needsYou) {
      if (row.answer !== null || row.quote !== null || row.quoteMemoryId !== null) return null;
      if (row.needsYouReason !== 'commitment' && row.needsYouReason !== 'no_source') return null;
    } else {
      if (typeof row.answer !== 'string' || typeof row.quote !== 'string' || row.quote.length === 0 || typeof row.quoteMemoryId !== 'string') return null;
      if (row.needsYouReason !== null) return null;
    }
    // Price is never answered, whatever the server said.
    if (row.topic === 'price' && !needsYou) return null;
    questions.push({
      topic: row.topic as BringDemoTopicV1,
      question: row.question,
      label: row.label as BringDemoLabelV1,
      answer: row.answer as string | null,
      quote: row.quote as string | null,
      quoteCut: row.quoteCut === true,
      quoteMemoryId: row.quoteMemoryId as string | null,
      needsYouReason: row.needsYouReason as BringDemoNeedsYouReasonV1 | null,
    });
  }
  return {
    schemaVersion: 1,
    demoId: input.demoId,
    found: input.found as number,
    workCount: input.workCount as number,
    privateCount: input.privateCount as number,
    classified,
    questions,
    answerableCount: input.answerableCount as number,
    enough: input.enough,
    missingTopics: (input.missingTopics as unknown[]).filter((topic): topic is BringDemoTopicV1 => (BRING_DEMO_TOPICS_V1 as readonly unknown[]).includes(topic)),
    elapsedMs: input.elapsedMs as number,
    withinBudget: input.withinBudget,
  };
}

/** The page's own words for the three labels (one place so the web and tests read the same). */
export const BRING_DEMO_LABEL_TEXT_V1: Readonly<Record<BringDemoLabelV1, { zh: string; en: string }>> = {
  confirmed: { zh: '本人确认', en: 'Confirmed by you' },
  inferred: { zh: 'AI 推断', en: 'AI inferred' },
  needs_you: { zh: '需要你', en: 'Needs you' },
};
