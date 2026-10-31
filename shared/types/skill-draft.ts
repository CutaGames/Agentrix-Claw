/**
 * Skills that grow from experience (L8 batch 2, C2). When the same automation has run successfully N times
 * (default 5, `agent_automation_runs`), the owner can ask the platform to distil a skill draft from it. A draft is only
 * text: a title, a summary and a few steps. It does nothing until the owner confirms it, and a draft that is not
 * confirmed can never be run. Distilling calls a model on the platform's quota, so each owner has a daily cap
 * (default 3 calls); past the cap nothing is created and no model is called.
 *
 * Behind `SKILL_DISTILL_V1_ENABLED` (server, default off); every route answers 404 while it is off.
 *
 * Routes (`/skill-drafts`, owner only, signed in):
 * - `GET  ?status=`                  → `{ success, data: { items: SkillDraftViewV1[] } }`
 * - `POST scan`                      → `{ success, data: SkillDraftScanV1 }` (looks for candidates, distils at most the cap)
 * - `POST :draftRef/decision`        body `{ decision: 'confirm' | 'decline' }` → `{ success, data: SkillDraftViewV1 }`
 * - `GET  enabled`                   → the confirmed ones (what the Agent may use)
 */
export const SKILL_DISTILL_FLAG_V1 = 'SKILL_DISTILL_V1_ENABLED';

export const SKILL_DRAFT_STATUSES_V1 = ['pending', 'confirmed', 'declined'] as const;
export type SkillDraftStatusV1 = (typeof SKILL_DRAFT_STATUSES_V1)[number];

export const SKILL_DRAFT_DECISIONS_V1 = ['confirm', 'decline'] as const;
export type SkillDraftDecisionV1 = (typeof SKILL_DRAFT_DECISIONS_V1)[number];

export const SKILL_DRAFT_LIMITS_V1 = {
  titleMax: 60,
  summaryMax: 400,
  stepsMax: 8,
  stepMax: 200,
  /** Successful runs of one automation before it can become a draft. */
  defaultMinRuns: 5,
  /** Model calls per owner per UTC day. */
  defaultDailyCap: 3,
} as const;

export interface SkillDraftViewV1 {
  draftRef: string;
  title: string;
  summary: string;
  steps: string[];
  /** Copied from the automation it came from, never chosen by the model. */
  tools: string[];
  successRuns: number;
  status: SkillDraftStatusV1;
  createdAt: string;
  decidedAt: string | null;
}

export interface SkillDraftScanV1 {
  created: SkillDraftViewV1[];
  /** True when the daily cap stopped the work: nothing more was distilled today. */
  capReached: boolean;
  remainingToday: number;
}

export const SKILL_DRAFTS_PATH_V1 = '/skill-drafts';
export const SKILL_DRAFTS_SCAN_PATH_V1 = '/skill-drafts/scan';
export const SKILL_DRAFTS_ENABLED_PATH_V1 = '/skill-drafts/enabled';
export function skillDraftListPathV1(status?: SkillDraftStatusV1): string {
  return `${SKILL_DRAFTS_PATH_V1}${status ? `?status=${status}` : ''}`;
}
export function skillDraftDecisionPathV1(draftRef: string): string {
  return `${SKILL_DRAFTS_PATH_V1}/${encodeURIComponent(draftRef)}/decision`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}
function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

/** A link, a wallet-style `0x` address or an e-mail address in model text. */
const SKILL_DRAFT_UNSAFE_TEXT = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)|\b0x[0-9a-f]{8,}|[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/**
 * What a model reply may contain: `{ "title", "summary", "steps": [...] }`, plain text only. Anything else (missing
 * parts, too long, too many steps, no JSON) is `null` and no draft is stored. The reply is untrusted: it cannot add tools.
 */
export function parseSkillDraftModelReplyV1(text: unknown): { title: string; summary: string; steps: string[] } | null {
  if (typeof text !== 'string' || text.length > 20_000) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const row = record(parsed);
  if (!row || !Array.isArray(row.steps)) return null;
  const title = cleanLine(row.title, SKILL_DRAFT_LIMITS_V1.titleMax);
  const summary = cleanLine(row.summary, SKILL_DRAFT_LIMITS_V1.summaryMax);
  if (!title || !summary || row.steps.length < 1 || row.steps.length > SKILL_DRAFT_LIMITS_V1.stepsMax) return null;
  const steps: string[] = [];
  for (const raw of row.steps) {
    const step = cleanLine(raw, SKILL_DRAFT_LIMITS_V1.stepMax);
    if (!step) return null;
    steps.push(step);
  }
  // The prompt asks for no links, addresses or e-mail; the reply is untrusted, so code enforces it.
  if ([title, summary, ...steps].some((line) => SKILL_DRAFT_UNSAFE_TEXT.test(line))) return null;
  return { title, summary, steps };
}

export function decodeSkillDraftViewV1(value: unknown): SkillDraftViewV1 | null {
  const row = record(value);
  if (!row || typeof row.draftRef !== 'string' || !oneOf(SKILL_DRAFT_STATUSES_V1, row.status) || !isIso(row.createdAt)) return null;
  if (!(row.decidedAt === null || isIso(row.decidedAt))) return null;
  const title = cleanLine(row.title, SKILL_DRAFT_LIMITS_V1.titleMax);
  const summary = cleanLine(row.summary, SKILL_DRAFT_LIMITS_V1.summaryMax);
  if (!title || !summary || !Array.isArray(row.steps) || row.steps.length > SKILL_DRAFT_LIMITS_V1.stepsMax) return null;
  if (!Array.isArray(row.tools) || row.tools.length > 50 || !row.tools.every((tool) => typeof tool === 'string' && tool.length <= 80)) return null;
  if (!Number.isInteger(row.successRuns) || (row.successRuns as number) < 0) return null;
  const steps: string[] = [];
  for (const raw of row.steps) {
    const step = cleanLine(raw, SKILL_DRAFT_LIMITS_V1.stepMax);
    if (!step) return null;
    steps.push(step);
  }
  return {
    draftRef: row.draftRef,
    title,
    summary,
    steps,
    tools: [...(row.tools as string[])],
    successRuns: row.successRuns as number,
    status: row.status,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt as string | null,
  };
}

export function decodeSkillDraftResponseV1(body: unknown): SkillDraftViewV1 | null {
  return decodeSkillDraftViewV1(record(body)?.data);
}

export function decodeSkillDraftListV1(body: unknown): SkillDraftViewV1[] | null {
  const items = record(record(body)?.data)?.items;
  if (!Array.isArray(items) || items.length > 200) return null;
  const out: SkillDraftViewV1[] = [];
  for (const item of items) {
    const view = decodeSkillDraftViewV1(item);
    if (!view) return null;
    out.push(view);
  }
  return out;
}

export function decodeSkillDraftScanV1(body: unknown): SkillDraftScanV1 | null {
  const data = record(record(body)?.data);
  if (!data || typeof data.capReached !== 'boolean' || !Number.isInteger(data.remainingToday) || (data.remainingToday as number) < 0) return null;
  const created = decodeSkillDraftListV1({ data: { items: data.created } });
  return created ? { created, capReached: data.capReached, remainingToday: data.remainingToday as number } : null;
}
