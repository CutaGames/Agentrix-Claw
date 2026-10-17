import { createGenericArchiveItemV2 } from '../agent-portability-archive-v2';
import {
  CANDIDATE_SNAPSHOT_SCHEMA,
  CURRENT_EXPERIENCE_CAPABILITIES,
  EXPERIENCE_TASK_SCHEMA,
  HANDOFF_PAIRING_CODE_PATTERN,
  HANDOFF_SESSION_SCHEMA,
  SUBMIT_CANDIDATES_BOUNDS,
  isExperienceCapabilityLive,
  parseCandidateSnapshotDetailV1,
  parseCandidateSnapshotV1,
  parseExperienceTaskV1,
  parseHandoffSessionV1,
  parseImportUpdateCheckV1,
  resolveExperienceCapability,
} from '../agent-portability-experience-v2';

function handoff() {
  return {
    schemaVersion: HANDOFF_SESSION_SCHEMA,
    sessionRef: 'handoff_session:abc',
    ownerRef: 'owner:6e10af3f',
    pairingCode: 'ABCDEFGH',
    nonceDigest: 'sha256:00',
    expiresAt: '2026-09-06T05:00:00.000Z',
    state: 'waiting',
    candidateCount: 0,
    capabilityState: 'not_implemented',
  };
}

function snapshot() {
  return {
    schemaVersion: CANDIDATE_SNAPSHOT_SCHEMA,
    snapshotRef: 'candidate_snapshot:1',
    ownerRef: 'owner:6e10af3f',
    sourceKind: 'official_export',
    itemCount: 12,
    digest: 'sha256:11',
    createdAt: '2026-09-06T05:00:00.000Z',
    immutable: true,
    defaultSelectedCount: 5,
    capabilityState: 'not_implemented',
  };
}

function task() {
  return {
    schemaVersion: EXPERIENCE_TASK_SCHEMA,
    taskRef: 'experience_task:1',
    ownerRef: 'owner:6e10af3f',
    kind: 'import',
    phase: 'preview',
    freshness: 'live',
    nextAction: 'review',
    jobRef: 'import_9d9b83bc',
    updatedAt: '2026-09-06T05:00:00.000Z',
    capabilityState: 'not_implemented',
  };
}

describe('agent-portability-experience/v2 contracts', () => {
  it('defaults every experience capability to not_implemented', () => {
    expect(Object.values(CURRENT_EXPERIENCE_CAPABILITIES)).toEqual([
      'not_implemented',
      'not_implemented',
      'not_implemented',
      'not_implemented',
      'not_implemented',
    ]);
    expect(isExperienceCapabilityLive('not_implemented')).toBe(false);
    expect(isExperienceCapabilityLive('blocked')).toBe(false);
    expect(isExperienceCapabilityLive('unknown')).toBe(false);
    expect(isExperienceCapabilityLive('limited_preview')).toBe(true);
    expect(isExperienceCapabilityLive('available')).toBe(true);
  });

  it('parses a valid handoff session and tolerates unknown fields', () => {
    const result = parseHandoffSessionV1({ ...handoff(), extra: 'ignored' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pairingCode).toBe('ABCDEFGH');
  });

  it('rejects the wrong handoff schema and ambiguous pairing codes', () => {
    const wrongSchema = parseHandoffSessionV1({ ...handoff(), schemaVersion: 'x/9' });
    expect(wrongSchema.ok).toBe(false);
    if (wrongSchema.ok === false) {
      expect(wrongSchema.issues).toContain(`schemaVersion:expected_${HANDOFF_SESSION_SCHEMA}`);
    }
    for (const bad of ['ABCDEFG', 'ABCDEFG0', 'abcdefgh', 'ABCDEFGHIJK']) {
      expect(HANDOFF_PAIRING_CODE_PATTERN.test(bad)).toBe(false);
      const result = parseHandoffSessionV1({ ...handoff(), pairingCode: bad });
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.issues).toContain('pairingCode:invalid_format');
    }
  });

  it('rejects invalid enums without throwing', () => {
    const result = parseHandoffSessionV1({ ...handoff(), state: 'connected' });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.issues).toContain('state:invalid_enum');
    expect(parseHandoffSessionV1(null).ok).toBe(false);
    expect(parseHandoffSessionV1('string').ok).toBe(false);
    expect(parseHandoffSessionV1([]).ok).toBe(false);
  });

  it('parses candidate snapshots and enforces immutability and selection bounds', () => {
    expect(parseCandidateSnapshotV1(snapshot()).ok).toBe(true);
    const mutable = parseCandidateSnapshotV1({ ...snapshot(), immutable: false });
    expect(mutable.ok).toBe(false);
    if (mutable.ok === false) expect(mutable.issues).toContain('immutable:must_be_true');
    const overSelected = parseCandidateSnapshotV1({ ...snapshot(), defaultSelectedCount: 13 });
    expect(overSelected.ok).toBe(false);
    if (overSelected.ok === false) {
      expect(overSelected.issues).toContain('defaultSelectedCount:exceeds_item_count');
    }
    const negative = parseCandidateSnapshotV1({ ...snapshot(), itemCount: -1 });
    expect(negative.ok).toBe(false);
  });

  it('parses a snapshot detail with items and drops unreadable rows without failing the snapshot', () => {
    const memory = createGenericArchiveItemV2({
      itemType: 'memory',
      sourceRef: { namespace: 'fixture.handoff', objectType: 'memory', id: 'm1' },
      sensitivity: 'owner',
      confidence: 1,
      lossiness: 'lossless',
      retention: 'owner_managed',
      payload: { content: 'Uses Cursor and Kiro for handoff.' },
    });
    const parsed = parseCandidateSnapshotDetailV1({
      ...snapshot(),
      items: [memory, { itemType: 'nope' }, 42],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.value.items).toEqual([memory]);
    expect(parseCandidateSnapshotDetailV1({ ...snapshot(), items: undefined }).ok).toBe(false);
    expect(parseCandidateSnapshotDetailV1(snapshot()).ok).toBe(false);
  });

  it('parses experience tasks and rejects unknown phases or bad timestamps', () => {
    expect(parseExperienceTaskV1(task()).ok).toBe(true);
    const badPhase = parseExperienceTaskV1({ ...task(), phase: 'done' });
    expect(badPhase.ok).toBe(false);
    if (badPhase.ok === false) expect(badPhase.issues).toContain('phase:invalid_enum');
    const badTime = parseExperienceTaskV1({ ...task(), updatedAt: 'yesterday' });
    expect(badTime.ok).toBe(false);
    if (badTime.ok === false) expect(badTime.issues).toContain('updatedAt:invalid_timestamp');
  });

  it('parses update checks with optional schema and receipt ref', () => {
    const result = parseImportUpdateCheckV1({
      sourceDigest: 'sha256:22',
      addedCount: 2,
      changedCount: 1,
      unchangedCount: 40,
      capabilityState: 'not_implemented',
    });
    expect(result.ok).toBe(true);
    const bad = parseImportUpdateCheckV1({
      sourceDigest: '',
      addedCount: 1.5,
      changedCount: 0,
      unchangedCount: 0,
      capabilityState: 'yes',
    });
    expect(bad.ok).toBe(false);
    if (bad.ok === false) {
      expect(bad.issues).toEqual(
        expect.arrayContaining([
          'sourceDigest:required_string',
          'addedCount:non_negative_integer',
          'capabilityState:invalid_enum',
        ]),
      );
    }
  });

  it('resolves capability from a projection only when the value is an exact state', () => {
    expect(resolveExperienceCapability(undefined, 'inbox')).toBe('not_implemented');
    expect(resolveExperienceCapability({}, 'inbox')).toBe('not_implemented');
    expect(resolveExperienceCapability({ experience: { capabilities: {} } }, 'inbox'))
      .toBe('not_implemented');
    expect(
      resolveExperienceCapability(
        { experience: { capabilities: { inbox: 'available' } } },
        'inbox',
      ),
    ).toBe('available');
    expect(
      resolveExperienceCapability(
        { experience: { capabilities: { inbox: 'limited_preview' } } },
        'inbox',
      ),
    ).toBe('limited_preview');
    for (const notAState of [true, 1, 'Available', 'ready', 'AVAILABLE', {}, null]) {
      expect(
        resolveExperienceCapability(
          { experience: { capabilities: { inbox: notAState } } },
          'inbox',
        ),
      ).toBe('unknown');
    }
  });

  it('freezes submit_candidates bounds', () => {
    expect(Object.isFrozen(SUBMIT_CANDIDATES_BOUNDS)).toBe(true);
    expect(SUBMIT_CANDIDATES_BOUNDS.maxSnapshotsPerSession).toBe(1);
    expect(SUBMIT_CANDIDATES_BOUNDS.maxItems).toBeGreaterThan(0);
    expect(SUBMIT_CANDIDATES_BOUNDS.maxPayloadBytes).toBeGreaterThan(
      SUBMIT_CANDIDATES_BOUNDS.maxItemBytes,
    );
  });
});
