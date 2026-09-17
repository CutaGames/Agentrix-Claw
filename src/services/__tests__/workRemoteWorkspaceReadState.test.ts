import {
  createDeveloperWorkspaceFeatureDisabledSnapshot,
  createDeveloperWorkspaceUnpublishedApiSnapshot,
  type DeveloperWorkspaceSnapshot,
} from '../developerWorkspaceClient';
import { DEVELOPER_WORKSPACE_READ_STATES, type DeveloperWorkspaceReadState } from '../developerWorkspaceReadState';
import { buildDeveloperWorkHomeModel } from '../developerWorkspaceWorkModel';
import { reduceWorkReadState, WORK_READ_STATES } from '../workReadStateDisplay';
import {
  WORK_REMOTE_WORKSPACE_SECTIONS,
  summarizeWorkspaceReadState,
  toWorkReadStateInput,
  workspaceIsOpen,
  workspaceSectionHasData,
} from '../workRemoteWorkspaceReadState';

const ready = (data: unknown = []): DeveloperWorkspaceReadState => ({
  kind: 'ready', data, capturedAt: '2026-09-16T00:00:00Z', source: 'api', defaultOff: false,
});

function withSections(
  base: DeveloperWorkspaceSnapshot,
  overrides: Partial<Record<(typeof WORK_REMOTE_WORKSPACE_SECTIONS)[number], DeveloperWorkspaceReadState>>,
): DeveloperWorkspaceSnapshot {
  return { ...base, ...(overrides as Partial<DeveloperWorkspaceSnapshot>) };
}

describe('M2 A2 — the DRW snapshot renders through the M1.2.1 read-state card, never a blank screen', () => {
  it('speaks the same eight states as the display reducer', () => {
    expect([...DEVELOPER_WORKSPACE_READ_STATES].sort()).toEqual([...WORK_READ_STATES].sort());
  });

  it('maps every DRW kind onto a reducible card input that keeps capability / reason verbatim (MTR-R07.3)', () => {
    const samples: DeveloperWorkspaceReadState[] = [
      ready(),
      { kind: 'partial', data: {}, missing: ['machines'], capturedAt: 't1', source: 'api', defaultOff: false },
      { kind: 'offline_stale', capturedAt: 't2', reason: 'network_unreachable', source: 'api' },
      { kind: 'unavailable', capability: 'developer.workspace_v1', reason: 'feature_disabled' },
      { kind: 'unknown', reason: 'loading' },
      { kind: 'unauthorized', reason: 'token_expired' },
      { kind: 'unsupported', capability: 'developer.schedule.today_v1', reason: 'unsupported_schema' },
      { kind: 'error', reason: 'http_503', retryable: true },
    ];
    for (const sample of samples) {
      const input = toWorkReadStateInput(sample);
      const display = reduceWorkReadState(input);
      expect(display.state).toBe(sample.kind);
      expect(display.fellBack).toBe(false);
      if ('capability' in sample) expect(display.capability).toBe(sample.capability);
      if ('reason' in sample) expect(display.reason).toBe(sample.reason);
    }
    expect(toWorkReadStateInput({ kind: 'partial', data: {}, missing: ['a', 'b'], capturedAt: 't', source: 'api', defaultOff: false }).reason)
      .toBe('missing:a,b');
  });

  it('reduces an unrecognised kind to unknown downstream, never to ready', () => {
    const display = reduceWorkReadState(toWorkReadStateInput({ kind: 'weird' } as never));
    expect(display.state).toBe('unknown');
    expect(display.showsData).toBe(false);
  });

  it('flag off → one honest unavailable · developer.workspace_v1 · feature_disabled card, sections closed', () => {
    const summary = summarizeWorkspaceReadState(createDeveloperWorkspaceFeatureDisabledSnapshot('a1'));
    expect(summary).toEqual({ state: 'unavailable', capability: 'developer.workspace_v1', reason: 'feature_disabled' });
    expect(workspaceIsOpen(summary)).toBe(false);
    expect(reduceWorkReadState(summary).showsData).toBe(false);
  });

  it('API not published (live, nothing back yet) → unavailable with the machines capability, sections closed', () => {
    const summary = summarizeWorkspaceReadState(createDeveloperWorkspaceUnpublishedApiSnapshot('a1'));
    expect(summary.state).toBe('unavailable');
    expect(summary.reason).toBe('developer_api_not_published');
    expect(workspaceIsOpen(summary)).toBe(false);
  });

  it('loading → unknown · loading (what buildDeveloperWorkHomeModel emits while the hook is in flight)', () => {
    const model = buildDeveloperWorkHomeModel({
      routeAgentId: 'a1',
      flagEnabled: true,
      mode: 'api',
      liveStatus: 'loading',
    });
    const summary = summarizeWorkspaceReadState(model.snapshot);
    expect(summary).toEqual({ state: 'unknown', reason: 'loading' });
    expect(workspaceIsOpen(summary)).toBe(false);
  });

  it('unresolved agent → the directory reason, not a guessed scope (MTR-R17.6)', () => {
    const model = buildDeveloperWorkHomeModel({ flagEnabled: true, mode: 'api', directoryContext: null });
    const summary = summarizeWorkspaceReadState(model.snapshot);
    expect(summary).toEqual({ state: 'unknown', reason: 'agent_context_unresolved' });
  });

  it('all four sections ready → ready, and the section cards open', () => {
    const base = createDeveloperWorkspaceUnpublishedApiSnapshot('a1');
    const snapshot = withSections(base, {
      machines: ready([{ machineRef: 'm1' }]),
      sessions: ready([]),
      approvals: ready([]),
      receipts: ready({ layers: [], terminal: null, completed: false }),
    });
    const summary = summarizeWorkspaceReadState(snapshot);
    expect(summary).toEqual({ state: 'ready', capturedAt: '2026-09-16T00:00:00Z' });
    expect(workspaceIsOpen(summary)).toBe(true);
  });

  it('mixed sections → partial naming the sections without data (never claims more than the weakest)', () => {
    const base = createDeveloperWorkspaceUnpublishedApiSnapshot('a1');
    const snapshot = withSections(base, {
      machines: ready([{ machineRef: 'm1' }]),
      sessions: { kind: 'error', reason: 'http_503', retryable: true },
    });
    const summary = summarizeWorkspaceReadState(snapshot);
    expect(summary.state).toBe('partial');
    expect(summary.reason).toBe('missing:sessions,approvals,receipts');
    expect(summary.capturedAt).toBe('2026-09-16T00:00:00Z');
    expect(workspaceIsOpen(summary)).toBe(true);
    expect(reduceWorkReadState(summary).showsStaleness).toBe(true);
  });

  it('no data anywhere and disagreeing kinds → the first blocking section, sections closed', () => {
    const base = createDeveloperWorkspaceUnpublishedApiSnapshot('a1');
    const snapshot = withSections(base, {
      machines: { kind: 'unauthorized', reason: 'token_expired' },
      sessions: { kind: 'error', reason: 'http_503', retryable: true },
    });
    const summary = summarizeWorkspaceReadState(snapshot);
    expect(summary).toEqual({ state: 'unauthorized', reason: 'token_expired' });
    expect(workspaceIsOpen(summary)).toBe(false);
  });

  it('only ready / partial / offline_stale carry payload', () => {
    const withData = DEVELOPER_WORKSPACE_READ_STATES.filter((kind) =>
      workspaceSectionHasData({ kind } as DeveloperWorkspaceReadState),
    );
    expect(withData).toEqual(['ready', 'partial', 'offline_stale']);
  });
});
