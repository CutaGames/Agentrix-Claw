/**
 * Shared since REQ-mobile-047 (moved verbatim from web `frontend/lib/digital-twin/creation-flow.ts`
 * @ 19655706, which now re-exports this file). Web drives the flow; the phone shows the same
 * step states read-only and passes 0 for the page-local counts.
 *
 * W2 · the nine-step twin creation (product doc §1.9) as a pure step model.
 *
 * One draft per Agent (DT-R03.5): where the owner is in the flow is derived
 * from what the server already holds (profile, linked imports, interview,
 * interim records, private thread, publish readiness), so the flow resumes
 * on any device. The page-local part is the material of steps 2–3: sources
 * added on this page and the intake plans read for them (the server keeps no
 * readable copy of a plan). Since web `a3b0a30e` (E75 ②) they survive a reload
 * on the same device only: kept in that browser, per owner and Agent, for 24
 * hours, and cleared when step 5 commits them or the owner signs out; no
 * server draft in L3. Another device (the phone included) does not see them,
 * so it passes 0 for these counts and reads steps 2–3 from the server alone.
 *
 * Statuses:
 * - `done`: the server shows the step's outcome.
 * - `available`: can be worked on now.
 * - `locked`: waits for an earlier step (the reason says which).
 * - `blocked`: a capability is off for this Agent (the reason is the
 *   projection's own `blockedBy`), so nothing here pretends it works.
 */
import type {
  DigitalTwinCapabilityIdV1,
  DigitalTwinCapabilityV1,
  DigitalTwinProfileStateV1,
  DigitalTwinProjectionV1,
} from './digital-twin';
import type { DigitalTwinInterimStateV1 } from './digital-twin-interview';
import type { TwinPrivateThreadV1 } from './digital-twin-answer';
import { DIGITAL_TWIN_PUBLIC_PRESET_TOPICS_V1, type DigitalTwinPublishReadinessV1, type DigitalTwinPublicFacetRecordV1 } from './digital-twin-public';

export const TWIN_CREATION_STEP_IDS = [
  'entry',
  'bring',
  'rights',
  'interview',
  'confirm',
  'ask',
  'services',
  'check',
  'publish',
] as const;
export type TwinCreationStepId = (typeof TWIN_CREATION_STEP_IDS)[number];

export type TwinCreationStepStatus = 'done' | 'available' | 'locked' | 'blocked';

/** Why a step cannot be worked on yet; the page turns each into owner-readable copy. */
export type TwinCreationLockReason =
  | 'needs_profile'
  | 'needs_source'
  | 'needs_interview'
  | 'needs_private_ready'
  | 'needs_publish_ready';

export interface TwinCreationStepView {
  id: TwinCreationStepId;
  /** 1-based position, as shown to the owner ("第 2 / 9 步"). */
  index: number;
  status: TwinCreationStepStatus;
  lockReason?: TwinCreationLockReason;
  /** Present for `blocked`: the projection's `blockedBy` (or reason code). */
  blockedBy?: string;
  /** The owner can finish the flow without this step (voice / likeness style extras stay elsewhere). */
  optional: boolean;
}

/** Everything the model reads, flattened so tests do not need full server shapes. */
export interface TwinCreationInput {
  capabilities: ReadonlyArray<Pick<DigitalTwinCapabilityV1, 'capability' | 'status' | 'blockedBy' | 'reasonCode'>>;
  /** `null`: no profile yet (step 1 not done). */
  profileState: DigitalTwinProfileStateV1 | null;
  profileCreatedAt: string | null;
  /** Portability imports the twin has corroborated and linked. */
  linkedImportCount: number;
  /** The server's `ready_private` input (linked content + the core interview). */
  hasMinimum: boolean;
  interviewMinimumMet: boolean;
  /** Sources added on this page and not yet planned. */
  localSourceCount: number;
  /** Of those, how many still have no rights choice. */
  localSourcesWithoutRights: number;
  /** The interview's policy (never-answer list, inference scope, handoff) was accepted. */
  policyAccepted: boolean;
  /** Timestamp of the first twin answer in the private thread, if any. */
  firstAnswerAt: string | null;
  /** `null`: readiness not readable (for example the public capability is off). */
  publishReady: boolean | null;
  published: boolean;
}

export interface TwinCreationProjection {
  steps: TwinCreationStepView[];
  /** First step the owner can work on now; `null` when everything open is done. */
  current: TwinCreationStepId | null;
  /** The private twin can answer (`ready_private` or later). */
  privateReady: boolean;
  /** Milliseconds from creating the profile to the first private answer (DT-R03.3's ten-minute metric). */
  elapsedToFirstAnswerMs: number | null;
}

const OPTIONAL_STEPS: ReadonlySet<TwinCreationStepId> = new Set(['rights']);
const PRIVATE_READY_STATES: ReadonlySet<DigitalTwinProfileStateV1> = new Set(['ready_private', 'public_limited', 'active']);

function capability(input: TwinCreationInput, id: DigitalTwinCapabilityIdV1) {
  return input.capabilities.find((entry) => entry.capability === id) ?? null;
}

/** Off unless the projection says `available`; `unknown` is treated as off, never as on. */
function blockedBy(input: TwinCreationInput, id: DigitalTwinCapabilityIdV1): string | null {
  const entry = capability(input, id);
  if (entry?.status === 'available') return null;
  return entry?.blockedBy ?? entry?.reasonCode ?? entry?.status ?? `capability:${id}`;
}

function elapsed(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

export function resolveTwinCreation(input: TwinCreationInput): TwinCreationProjection {
  const hasProfile = input.profileState !== null;
  const privateReady = input.hasMinimum || (input.profileState !== null && PRIVATE_READY_STATES.has(input.profileState));
  const hasSomething = input.linkedImportCount > 0 || input.localSourceCount > 0;

  type Draft = { status: TwinCreationStepStatus; lockReason?: TwinCreationLockReason; blockedBy?: string };
  const done = (): Draft => ({ status: 'done' });
  const available = (): Draft => ({ status: 'available' });
  const locked = (lockReason: TwinCreationLockReason): Draft => ({ status: 'locked', lockReason });
  const blocked = (reason: string): Draft => ({ status: 'blocked', blockedBy: reason });
  const needsProfile = (next: () => Draft): Draft => (hasProfile ? next() : locked('needs_profile'));

  const privateOff = blockedBy(input, 'private_profile');
  const interviewOff = blockedBy(input, 'interview');
  const publicOff = blockedBy(input, 'public');

  const drafts: Record<TwinCreationStepId, Draft> = {
    entry: hasProfile ? done() : privateOff ? blocked(privateOff) : available(),
    // One source is enough to move on; the rest are read in the background.
    bring: needsProfile(() => (hasSomething ? done() : available())),
    // Rights are declared per added source. Memory linked from the companion
    // was already confirmed when it was brought in, so it needs no choice here.
    rights: needsProfile(() => {
      if (input.localSourceCount > 0) return input.localSourcesWithoutRights === 0 ? done() : available();
      return input.linkedImportCount > 0 ? done() : locked('needs_source');
    }),
    interview: needsProfile(() => (input.interviewMinimumMet ? done() : interviewOff ? blocked(interviewOff) : available())),
    confirm: needsProfile(() => {
      if (privateReady) return done();
      return hasSomething || input.interviewMinimumMet ? available() : locked('needs_source');
    }),
    ask: needsProfile(() => (input.firstAnswerAt ? done() : privateReady ? available() : locked('needs_private_ready'))),
    services: needsProfile(() => {
      if (input.policyAccepted) return done();
      if (interviewOff) return blocked(interviewOff);
      return input.interviewMinimumMet ? available() : locked('needs_interview');
    }),
    check: needsProfile(() => {
      if (publicOff) return blocked(publicOff);
      if (input.publishReady === true) return done();
      return privateReady ? available() : locked('needs_private_ready');
    }),
    publish: needsProfile(() => {
      if (input.published) return done();
      if (publicOff) return blocked(publicOff);
      return input.publishReady === true ? available() : locked('needs_publish_ready');
    }),
  };

  const steps = TWIN_CREATION_STEP_IDS.map((id, position): TwinCreationStepView => ({
    id,
    index: position + 1,
    optional: OPTIONAL_STEPS.has(id),
    ...drafts[id],
  }));
  const current = steps.find((step) => step.status === 'available')?.id ?? null;
  return {
    steps,
    current,
    privateReady,
    elapsedToFirstAnswerMs: elapsed(input.profileCreatedAt, input.firstAnswerAt),
  };
}

/** First twin turn in the private thread (the owner's first sourced answer). */
export function firstTwinAnswerAt(thread: TwinPrivateThreadV1 | null | undefined): string | null {
  const turn = thread?.turns.find((candidate) => candidate.role === 'twin');
  return turn?.createdAt ?? null;
}

/**
 * L9 P1-5b / P2-1 · the A1 end point, one implementation (coord 10-31, review L-1; l9-plan P2-1).
 * Start: the profile was created. End: the PUBLIC card has given one labelled answer (confirmed, inferred or no-answer)
 * to each of the five preset questions. The preset questions are the five topics of the bring demo
 * (`BRING_DEMO_TOPICS_V1`: what you do, experience, area, availability, price). Private answers (the owner trying the
 * twin in the private thread) never count; an answer without a label or with no preset topic does not count.
 * `TwinCreationProjection` and `twinCreationInputFrom` keep their shape.
 */
export const TWIN_ACTIVATION_PRESET_TOPICS_V1 = DIGITAL_TWIN_PUBLIC_PRESET_TOPICS_V1;
export type TwinActivationPresetTopicV1 = (typeof TWIN_ACTIVATION_PRESET_TOPICS_V1)[number];
export const TWIN_ACTIVATION_LABELED_ANSWERS_V1 = TWIN_ACTIVATION_PRESET_TOPICS_V1.length;
const TWIN_ACTIVATION_LABELS_V1: readonly string[] = ['confirmed', 'inferred', 'no_answer'];

/** One answer the twin gave, as the activation clock reads it. */
export interface TwinActivationAnswerV1 {
  facet: string;
  answerClass?: string | null;
  /** Which preset question it answered; absent or `null` for any other question. */
  presetTopic?: string | null;
  createdAt: string;
}

/** The first labelled public answer to each preset question, by topic. */
export function publicPresetAnswerTimes(answers: readonly TwinActivationAnswerV1[] | null | undefined): Partial<Record<TwinActivationPresetTopicV1, string>> {
  const first: Partial<Record<TwinActivationPresetTopicV1, string>> = {};
  for (const answer of answers ?? []) {
    if (answer?.facet !== 'public') continue;
    if (typeof answer.answerClass !== 'string' || !TWIN_ACTIVATION_LABELS_V1.includes(answer.answerClass)) continue;
    const topic = answer.presetTopic as TwinActivationPresetTopicV1;
    if (!(TWIN_ACTIVATION_PRESET_TOPICS_V1 as readonly unknown[]).includes(topic)) continue;
    if (!Number.isFinite(Date.parse(answer.createdAt))) continue;
    const seen = first[topic];
    if (!seen || Date.parse(answer.createdAt) < Date.parse(seen)) first[topic] = answer.createdAt;
  }
  return first;
}

/**
 * Milliseconds from creating the profile to the moment the last of the five preset questions got its first labelled
 * public answer; `null` when the start is unknown, any preset question is still unanswered, or the clock runs backwards.
 */
export function elapsedToPublicFiveAnswersMs(input: {
  profileCreatedAt: string | null;
  answers: readonly TwinActivationAnswerV1[] | null | undefined;
}): number | null {
  const first = publicPresetAnswerTimes(input.answers);
  const times = TWIN_ACTIVATION_PRESET_TOPICS_V1.map((topic) => first[topic]);
  if (times.some((at) => at === undefined)) return null;
  const end = (times as string[]).reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest));
  return elapsed(input.profileCreatedAt, end);
}

export interface TwinCreationReads {
  projection: DigitalTwinProjectionV1;
  interim?: DigitalTwinInterimStateV1 | null;
  thread?: TwinPrivateThreadV1 | null;
  publish?: { readiness: DigitalTwinPublishReadinessV1; record: DigitalTwinPublicFacetRecordV1 | null } | null;
  localSources?: ReadonlyArray<{ rights: string | null }>;
}

/** Adapter from what the page has read to the model's flat input. */
export function twinCreationInputFrom(reads: TwinCreationReads): TwinCreationInput {
  const { projection } = reads;
  const local = reads.localSources ?? [];
  return {
    capabilities: projection.capabilities,
    profileState: projection.profile?.state ?? null,
    profileCreatedAt: projection.profile?.createdAt ?? null,
    linkedImportCount: projection.selfModel?.linkedImportJobRefs.length ?? 0,
    hasMinimum: projection.selfModel?.hasMinimum ?? false,
    interviewMinimumMet: projection.interview?.progress.minimumMet ?? false,
    localSourceCount: local.length,
    localSourcesWithoutRights: local.filter((source) => !source.rights).length,
    policyAccepted: Boolean(reads.interim?.policy),
    firstAnswerAt: firstTwinAnswerAt(reads.thread),
    publishReady: reads.publish ? reads.publish.readiness.ready : null,
    published: reads.publish?.record?.state === 'published',
  };
}

export function isTwinCreationStepId(value: unknown): value is TwinCreationStepId {
  return typeof value === 'string' && (TWIN_CREATION_STEP_IDS as readonly string[]).includes(value);
}

/**
 * L9 P2-1 · the fast path: three stages on top of the same nine server steps.
 * Bring material or answer the five questions → see the five-question demo and edit → go public.
 * The nine steps, their locks and their order are untouched; the full list moves under "专业设置" /
 * "Advanced". Pure grouping, so the phone and the web read the same thing.
 */
export const TWIN_FAST_PATH_STAGE_IDS = ['material', 'demo', 'public'] as const;
export type TwinFastPathStageId = (typeof TWIN_FAST_PATH_STAGE_IDS)[number];

export const TWIN_FAST_PATH_STAGE_STEPS: Readonly<Record<TwinFastPathStageId, readonly TwinCreationStepId[]>> = {
  material: ['entry', 'bring', 'rights', 'interview'],
  demo: ['confirm', 'ask'],
  public: ['services', 'check', 'publish'],
};

export type TwinFastPathStageState = 'done' | 'now' | 'todo';

export interface TwinFastPathStageView {
  id: TwinFastPathStageId;
  state: TwinFastPathStageState;
  stepIds: readonly TwinCreationStepId[];
}

export interface TwinFastPathProjection {
  stages: TwinFastPathStageView[];
  /** The stage the shown step belongs to. */
  current: TwinFastPathStageId;
}

/** Which fast-path stage a server step belongs to. */
export function twinFastPathStageOf(step: TwinCreationStepId): TwinFastPathStageId {
  return TWIN_FAST_PATH_STAGE_IDS.find((id) => TWIN_FAST_PATH_STAGE_STEPS[id].includes(step)) ?? 'material';
}

/**
 * A stage is done when every step in it that the owner has to do is done (the optional rights step does not
 * hold a stage back), `now` while the shown step is inside it, otherwise `todo`.
 */
export function resolveTwinFastPath(model: Pick<TwinCreationProjection, 'steps'>, shown: TwinCreationStepId): TwinFastPathProjection {
  const current = twinFastPathStageOf(shown);
  const stages = TWIN_FAST_PATH_STAGE_IDS.map((id): TwinFastPathStageView => {
    const stepIds = TWIN_FAST_PATH_STAGE_STEPS[id];
    const required = model.steps.filter((step) => stepIds.includes(step.id) && !step.optional);
    const done = required.length > 0 && required.every((step) => step.status === 'done');
    return { id, stepIds, state: id === current ? 'now' : done ? 'done' : 'todo' };
  });
  return { stages, current };
}

