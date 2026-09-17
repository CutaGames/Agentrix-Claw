/**
 * DRW snapshot → Work-tab read-state card inputs — M2 slice A2 (decision d-50).
 *
 * The DRW client layer (`developerWorkspaceClient.ts`, taken verbatim from
 * f9076d9d5) reports each section of the remote workspace as a
 * `DeveloperWorkspaceReadState`. The Work tab renders those through the
 * M1.2.1 `WorkReadStateCard`, whose input is the display-layer
 * `WorkReadStateInput`. This module is the only bridge between the two: pure,
 * no fetch, no store, so the mapping is inside the root jest range
 * (M0.0.5 option b). It never widens a state — an unrecognised kind reduces
 * to `unknown` downstream, never to `ready`.
 */
import type { DeveloperWorkspaceSnapshot } from './developerWorkspaceClient';
import type { DeveloperWorkspaceReadState } from './developerWorkspaceReadState';
import type { WorkReadStateInput } from './workReadStateDisplay';

export function toWorkReadStateInput(state: DeveloperWorkspaceReadState): WorkReadStateInput {
  switch (state.kind) {
    case 'ready':
      return { state: 'ready', capturedAt: state.capturedAt };
    case 'partial':
      return {
        state: 'partial',
        capturedAt: state.capturedAt,
        reason: state.missing.length ? `missing:${state.missing.join(',')}` : undefined,
      };
    case 'offline_stale':
      return { state: 'offline_stale', capturedAt: state.capturedAt, reason: state.reason };
    case 'unavailable':
      return { state: 'unavailable', capability: state.capability, reason: state.reason };
    case 'unknown':
      return { state: 'unknown', reason: state.reason };
    case 'unauthorized':
      return { state: 'unauthorized', reason: state.reason };
    case 'unsupported':
      return { state: 'unsupported', capability: state.capability, reason: state.reason };
    case 'error':
      return { state: 'error', reason: state.reason };
    default:
      return { state: (state as { kind?: unknown }).kind };
  }
}

/** The four live sections the Work home summarises. Today / Next are schedule (M2.3) and stay separate. */
export const WORK_REMOTE_WORKSPACE_SECTIONS = ['machines', 'sessions', 'approvals', 'receipts'] as const;
export type WorkRemoteWorkspaceSection = (typeof WORK_REMOTE_WORKSPACE_SECTIONS)[number];

const DATA_KINDS: ReadonlySet<string> = new Set(['ready', 'partial', 'offline_stale']);

/** Whether a section state carries payload the card may render. */
export function workspaceSectionHasData(state: DeveloperWorkspaceReadState): boolean {
  return DATA_KINDS.has(state.kind);
}

/**
 * One read state for the whole remote workspace, shown on the release-boundary
 * card (`work-release-boundary` / `work-feature-unavailable`).
 *
 * - All four sections agree → that state, with the first section's
 *   capability / reason (this is the flag-off `unavailable · feature_disabled`
 *   case, the loading `unknown · loading` case, and the clean `ready` case).
 * - Some sections have data and others do not → `partial`, naming the
 *   sections that are missing, so the summary never claims more than the
 *   weakest section.
 * - No section has data and they disagree → the first non-data section's
 *   state (fail closed towards the blocking reason).
 */
export function summarizeWorkspaceReadState(snapshot: DeveloperWorkspaceSnapshot): WorkReadStateInput {
  const states = WORK_REMOTE_WORKSPACE_SECTIONS.map((section) => [section, snapshot[section]] as const);
  const kinds = new Set(states.map(([, state]) => state.kind));
  if (kinds.size === 1) return toWorkReadStateInput(states[0][1]);

  const withData = states.filter(([, state]) => workspaceSectionHasData(state));
  if (withData.length > 0) {
    const missing = states.filter(([, state]) => !workspaceSectionHasData(state)).map(([section]) => section);
    const capturedAt = withData
      .map(([, state]) => ('capturedAt' in state ? state.capturedAt : undefined))
      .find((value): value is string => typeof value === 'string');
    return { state: 'partial', capturedAt, reason: missing.length ? `missing:${missing.join(',')}` : undefined };
  }

  return toWorkReadStateInput(states[0][1]);
}

/** Whether the Work home should render the per-section cards at all. */
export function workspaceIsOpen(summary: WorkReadStateInput): boolean {
  return typeof summary.state === 'string' && DATA_KINDS.has(summary.state);
}
