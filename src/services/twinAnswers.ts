/**
 * twinAnswers — M0 "分身区原生编辑" (briefs/mobile-redesign-v1.md section 6, M0 row "常用编辑（问答、服务介绍）原生"): the
 * owner edits the answers visitors meet (one-line intro, services, booking, common questions, how to reach them) and
 * updates the services on the twin card from the phone, without opening the web.
 *
 * Same owner routes the web interview uses:
 *   GET  /v1/agents/:id/twin/interview              latest answer per question + interim state
 *   POST /v1/agents/:id/twin/interview/responses    append one answer version (idempotent; earlier versions stay)
 *   POST /v1/agents/:id/twin/interview/plan         preview; the decision binds to this exact plan digest
 *   POST /v1/agents/:id/twin/interview/decisions    accept only `offer_drafts` from the plan the owner just saw
 * The phone accepts nothing else: the policy (what the twin hands to the owner, where it may infer) stays a web review,
 * and the facts in these answers become twin memory through the Portability import, which the phone does not run yet.
 * The screen says so rather than presenting a saved answer as something the twin already uses.
 */
import {
  DIGITAL_TWIN_INTERVIEW_MAX_ANSWER_CHARS,
  DIGITAL_TWIN_INTERVIEW_TEMPLATE_V0,
  decodeDigitalTwinCandidatePlanV1,
  decodeDigitalTwinInterviewSessionV1,
  digitalTwinTextLooksSecretV1,
  type DigitalTwinInterviewQuestionIdV1,
} from '../../shared/types/digital-twin-interview';
import { DIGITAL_TWIN_SCHEMA_VERSION, type DigitalTwinRefV1 } from '../../shared/types/digital-twin';
import type { DigestRef } from '../../shared/types/trust-loop-primitives';
import { isSafeTwinAgentId, readDigitalTwinEnvelope, resolveTwinTransport, twinAuthHeaders, type TwinStatusTransportInput } from './twinStatus';

export const TWIN_ANSWER_QUESTION_IDS = ['q01', 'q02', 'q03', 'q05', 'q14'] as const satisfies readonly DigitalTwinInterviewQuestionIdV1[];
export type TwinAnswerQuestionId = (typeof TWIN_ANSWER_QUESTION_IDS)[number];
type Lang = 'zh' | 'en';

export interface TwinAnswerQuestion {
  id: TwinAnswerQuestionId;
  prompt: string;
  /** One item per line (the services list, the question-and-answer list). */
  splitLines: boolean;
  /** The answer feeds the services on the twin card (an `offer_draft` output). */
  feedsCard: boolean;
  /** The answer also carries facts that only reach the twin's memory through the import. */
  needsImport: boolean;
}

export function twinAnswerQuestions(lang: Lang): TwinAnswerQuestion[] {
  return TWIN_ANSWER_QUESTION_IDS.map((id) => {
    const question = DIGITAL_TWIN_INTERVIEW_TEMPLATE_V0.questions.find((q) => q.id === id)!;
    return {
      id,
      prompt: question.prompt[lang === 'zh' ? 'zh-CN' : 'en'],
      splitLines: question.splitLines,
      feedsCard: question.outputs.includes('offer_draft'),
      needsImport: question.outputs.some((output) => output === 'confirmed_fact' || output === 'persona_line' || output === 'style_instruction'),
    };
  });
}

export interface TwinAnswersView {
  answers: Partial<Record<TwinAnswerQuestionId, { text: string; version: number }>>;
  /** What the twin card lists as services right now (interim offer drafts). */
  cardServices: string[];
}

export type TwinAnswersRead =
  | { kind: 'ready'; data: TwinAnswersView }
  | { kind: 'unauthorized' | 'unavailable' | 'error'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function interviewPath(agentAccountId: string, tail = ''): string {
  return `/v1/agents/${encodeURIComponent(agentAccountId)}/twin/interview${tail}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** GET interview body → the five answers and the card's services. Anything unreadable is an error, never a guess. */
export function readTwinAnswers(status: number, body: unknown): TwinAnswersRead {
  if (status === 401) return { kind: 'unauthorized', reason: 'authentication_required' };
  if (status === 404 || status === 503) return { kind: 'unavailable', reason: status === 404 ? 'not_found' : 'capability_unavailable' };
  if (status < 200 || status >= 300) return { kind: 'error', reason: `http_${status}` };
  const data = isRecord(body) && body.success === true && isRecord(body.data) ? body.data : null;
  if (!data || data.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return { kind: 'error', reason: 'response_malformed' };
  const answers: TwinAnswersView['answers'] = {};
  if (data.session !== null && data.session !== undefined) {
    const decoded = decodeDigitalTwinInterviewSessionV1(data.session);
    if ('reasonCode' in decoded) return { kind: 'error', reason: 'session_malformed' };
    for (const response of decoded.value.responses) {
      if ((TWIN_ANSWER_QUESTION_IDS as readonly string[]).includes(response.questionId) && !response.skipped) {
        answers[response.questionId as TwinAnswerQuestionId] = { text: response.text, version: response.version };
      }
    }
  }
  const offerDrafts = isRecord(data.interim) && isRecord(data.interim.offerDrafts) ? data.interim.offerDrafts : null;
  return { kind: 'ready', data: { answers, cardServices: stringList(offerDrafts?.items) } };
}

async function send(
  agentAccountId: string,
  method: 'GET' | 'POST',
  tail: string,
  input: TwinStatusTransportInput & { idempotencyKey?: string },
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown } | { blocked: 'agent_account_required' | 'authentication_required' } | null> {
  if (!isSafeTwinAgentId(agentAccountId)) return { blocked: 'agent_account_required' };
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { blocked: 'authentication_required' };
  const headers: Record<string, string> = { ...twinAuthHeaders(token) };
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;
  try {
    const response = await transport.request({ method, path: `${baseUrl}${interviewPath(agentAccountId, tail)}`, headers, ...(body ? { body } : {}) });
    return { status: response.status, body: response.body };
  } catch {
    return null;
  }
}

export async function fetchTwinAnswers(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinAnswersRead> {
  const response = await send(agentAccountId, 'GET', '', input);
  if (!response) return { kind: 'error', reason: 'network' };
  if ('blocked' in response) return response.blocked === 'authentication_required' ? { kind: 'unauthorized', reason: response.blocked } : { kind: 'unavailable', reason: response.blocked };
  return readTwinAnswers(response.status, response.body);
}

export type TwinAnswerCommandOutcome<T> =
  | { kind: 'done'; value: T }
  | { kind: 'invalid'; reason: 'empty' | 'too_long' | 'looks_secret' }
  | { kind: 'rejected'; reasonCode: string }
  | { kind: 'blocked'; reason: 'agent_account_required' | 'authentication_required' }
  | { kind: 'failed'; reason: string; retryable: boolean };

function commandOutcome<T>(
  response: Awaited<ReturnType<typeof send>>,
  read: (value: Record<string, unknown>) => T | null,
): TwinAnswerCommandOutcome<T> {
  if (!response) return { kind: 'failed', reason: 'network', retryable: true };
  if ('blocked' in response) return { kind: 'blocked', reason: response.blocked };
  // plan_stale / idempotency_conflict come back as 409 with the reason in the body.
  if (response.status === 409) {
    const reasonCode = isRecord(response.body) && typeof response.body.reasonCode === 'string' ? response.body.reasonCode : 'conflict';
    return { kind: 'rejected', reasonCode };
  }
  const envelope = readDigitalTwinEnvelope(response.status, response.body);
  if (envelope.ok === false) {
    const state = envelope.state;
    if (state.kind === 'unavailable') return { kind: 'rejected', reasonCode: state.reason };
    if (state.kind === 'error') return { kind: 'failed', reason: state.reason, retryable: state.retryable };
    return { kind: 'failed', reason: state.kind, retryable: false };
  }
  const value = read(envelope.value);
  return value === null ? { kind: 'failed', reason: 'response_malformed', retryable: false } : { kind: 'done', value };
}

/** Client-side checks the server repeats: 1..4000 characters, nothing that looks like a key or password. */
export function checkTwinAnswerText(text: string): 'empty' | 'too_long' | 'looks_secret' | null {
  const trimmed = text.replace(/\r\n?/g, '\n').trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > DIGITAL_TWIN_INTERVIEW_MAX_ANSWER_CHARS) return 'too_long';
  if (digitalTwinTextLooksSecretV1(trimmed)) return 'looks_secret';
  return null;
}

/**
 * Appends a new answer version; the earlier versions stay on the server. `voice_transcript` marks an answer the owner
 * spoke (transcribed on the phone, maybe edited after); the audio itself never reaches the twin.
 */
export async function saveTwinAnswer(
  agentAccountId: string,
  questionId: TwinAnswerQuestionId,
  text: string,
  lang: Lang,
  input: TwinStatusTransportInput & { idempotencyKey: string; modality?: 'text' | 'voice_transcript' },
): Promise<TwinAnswerCommandOutcome<{ version: number }>> {
  if (!(TWIN_ANSWER_QUESTION_IDS as readonly string[]).includes(questionId)) return { kind: 'blocked', reason: 'agent_account_required' };
  const invalid = checkTwinAnswerText(text);
  if (invalid) return { kind: 'invalid', reason: invalid };
  const body = {
    schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION,
    questionId,
    modality: input.modality === 'voice_transcript' ? 'voice_transcript' : 'text',
    text: text.replace(/\r\n?/g, '\n').trim(),
    language: lang === 'zh' ? 'zh-CN' : 'en',
  };
  const response = await send(agentAccountId, 'POST', '/responses', input, body);
  return commandOutcome(response, (value) => {
    const responses = Array.isArray(value.responses) ? value.responses : [];
    const mine = responses.find((item) => isRecord(item) && item.questionId === questionId);
    return isRecord(mine) && typeof mine.version === 'number' ? { version: mine.version } : null;
  });
}

export interface TwinCardServicesPreview {
  planRef: DigitalTwinRefV1;
  planDigest: DigestRef;
  services: string[];
}

/** Builds the plan from the current answers and returns what the card would list. Nothing is accepted yet. */
export async function previewTwinCardServices(
  agentAccountId: string,
  input: TwinStatusTransportInput = {},
): Promise<TwinAnswerCommandOutcome<TwinCardServicesPreview>> {
  const response = await send(agentAccountId, 'POST', '/plan', input);
  return commandOutcome(response, (value) => {
    const decoded = decodeDigitalTwinCandidatePlanV1(value);
    if ('reasonCode' in decoded) return null;
    const plan = decoded.value;
    return { planRef: plan.planRef, planDigest: plan.planDigest, services: [...plan.interim.offerDrafts.items] };
  });
}

/** Accepts the services from exactly the plan the owner saw; a changed answer since then makes the server say plan_stale. */
export async function acceptTwinCardServices(
  agentAccountId: string,
  preview: Pick<TwinCardServicesPreview, 'planRef' | 'planDigest'>,
  input: TwinStatusTransportInput & { idempotencyKey: string },
): Promise<TwinAnswerCommandOutcome<{ services: string[] }>> {
  const body = { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, planRef: preview.planRef, planDigest: preview.planDigest, accept: ['offer_drafts'] };
  const response = await send(agentAccountId, 'POST', '/decisions', input, body);
  return commandOutcome(response, (value) => {
    const offerDrafts = isRecord(value.offerDrafts) ? value.offerDrafts : null;
    return offerDrafts ? { services: stringList(offerDrafts.items) } : null;
  });
}

/** Unique per user action (not a secret); the server keeps it to make a retried tap a replay instead of a second version. */
export function newTwinAnswerKey(action: 'answer' | 'services', now: number = Date.now(), random: () => number = Math.random): string {
  const tail = Array.from({ length: 4 }, () => Math.floor(random() * 0x100000000).toString(16).padStart(8, '0')).join('');
  return `mobile-twin-${action}-${now.toString(36)}-${tail}`;
}
