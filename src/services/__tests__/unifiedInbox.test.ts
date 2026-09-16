import {
  type UnifiedInboxItem,
  compareRealtimeInboxItems,
  defaultCadenceForSource,
  isBatchEligible,
  partitionUnifiedInbox,
  weeklyInboxProgress,
} from '../unifiedInbox';

function item(overrides: Partial<UnifiedInboxItem> & { itemRef: string }): UnifiedInboxItem {
  return {
    source: 'developer_approval',
    cadence: 'realtime',
    risk: 'medium',
    digest: `digest-${overrides.itemRef}`,
    capturedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('MTR-R17.2 / design §4.3 — cadence partitions before sorting', () => {
  it('keeps weekly items out of the realtime sort', () => {
    const weekly = item({
      itemRef: 'twin:1',
      source: 'twin_review',
      cadence: 'weekly',
      risk: 'low',
    });
    const realtime = item({ itemRef: 'apr:1', risk: 'low' });

    const partitions = partitionUnifiedInbox([weekly, realtime]);
    expect(partitions.realtime.map((entry) => entry.itemRef)).toEqual(['apr:1']);
    expect(partitions.weekly.map((entry) => entry.itemRef)).toEqual(['twin:1']);
  });

  it('does not bury a low-risk weekly item behind realtime ones', () => {
    // The bug design §4.3 exists to prevent: with one shared sort, this
    // no-expiry low-risk review would be last forever.
    const items = [
      item({ itemRef: 'twin:1', source: 'twin_review', cadence: 'weekly', risk: 'low' }),
      item({ itemRef: 'apr:high', risk: 'high', expiresAt: '2026-09-15T01:00:00.000Z' }),
      item({ itemRef: 'apr:low', risk: 'low' }),
    ];
    const partitions = partitionUnifiedInbox(items);
    expect(partitions.weekly[0].itemRef).toBe('twin:1');
    expect(partitions.realtime).toHaveLength(2);
  });

  it('maps each source to its natural cadence', () => {
    expect(defaultCadenceForSource('developer_approval')).toBe('realtime');
    expect(defaultCadenceForSource('twin_review')).toBe('weekly');
    expect(defaultCadenceForSource('twin_answer')).toBe('weekly');
    expect(defaultCadenceForSource('schedule')).toBe('realtime');
  });
});

describe('realtime ordering — risk desc, then expiry asc', () => {
  it('sorts high before unknown before medium before low', () => {
    const items = [
      item({ itemRef: 'd', risk: 'low' }),
      item({ itemRef: 'b', risk: 'unknown' }),
      item({ itemRef: 'a', risk: 'high' }),
      item({ itemRef: 'c', risk: 'medium' }),
    ];
    expect(partitionUnifiedInbox(items).realtime.map((entry) => entry.itemRef))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts the soonest expiry first inside one risk band', () => {
    const items = [
      item({ itemRef: 'later', risk: 'high', expiresAt: '2026-09-15T05:00:00.000Z' }),
      item({ itemRef: 'sooner', risk: 'high', expiresAt: '2026-09-15T01:00:00.000Z' }),
      item({ itemRef: 'none', risk: 'high' }),
    ];
    expect(partitionUnifiedInbox(items).realtime.map((entry) => entry.itemRef))
      .toEqual(['sooner', 'later', 'none']);
  });

  it('treats an unparseable expiry as most urgent rather than as no expiry', () => {
    const items = [
      item({ itemRef: 'valid', risk: 'high', expiresAt: '2026-09-15T01:00:00.000Z' }),
      item({ itemRef: 'garbage', risk: 'high', expiresAt: 'tomorrow' }),
    ];
    expect(partitionUnifiedInbox(items).realtime[0].itemRef).toBe('garbage');
  });

  it('treats an unrecognised risk value as unknown', () => {
    const items = [
      item({ itemRef: 'weird', risk: 'catastrophic' as never }),
      item({ itemRef: 'medium', risk: 'medium' }),
      item({ itemRef: 'high', risk: 'high' }),
    ];
    expect(partitionUnifiedInbox(items).realtime.map((entry) => entry.itemRef))
      .toEqual(['high', 'weird', 'medium']);
  });

  it('is a total order so repeated renders agree', () => {
    const a = item({ itemRef: 'a', risk: 'high' });
    const b = item({ itemRef: 'b', risk: 'high' });
    expect(compareRealtimeInboxItems(a, b)).toBeLessThan(0);
    expect(compareRealtimeInboxItems(b, a)).toBeGreaterThan(0);
    expect(compareRealtimeInboxItems(a, a)).toBe(0);
  });

  it('handles an empty or missing list', () => {
    expect(partitionUnifiedInbox([])).toEqual({ realtime: [], weekly: [] });
    expect(partitionUnifiedInbox(undefined as never)).toEqual({ realtime: [], weekly: [] });
  });
});

describe('weekly partition', () => {
  it('reports progress against the batch the server declared', () => {
    const partitions = partitionUnifiedInbox([
      item({ itemRef: 't1', source: 'twin_review', cadence: 'weekly', risk: 'low' }),
      item({ itemRef: 't2', source: 'twin_review', cadence: 'weekly', risk: 'low' }),
    ]);
    expect(weeklyInboxProgress(partitions, 5)).toEqual({ total: 5, remaining: 2, done: 3 });
  });

  it('never reports a batch smaller than what is still open', () => {
    const partitions = partitionUnifiedInbox([
      item({ itemRef: 't1', source: 'twin_review', cadence: 'weekly', risk: 'low' }),
      item({ itemRef: 't2', source: 'twin_review', cadence: 'weekly', risk: 'low' }),
    ]);
    expect(weeklyInboxProgress(partitions, 1)).toEqual({ total: 2, remaining: 2, done: 0 });
    expect(weeklyInboxProgress(partitions)).toEqual({ total: 2, remaining: 2, done: 0 });
  });

  it('keeps batch actions away from realtime and from unknown risk', () => {
    expect(isBatchEligible(item({ itemRef: 'a', cadence: 'weekly', risk: 'low' }))).toBe(true);
    expect(isBatchEligible(item({ itemRef: 'b', cadence: 'weekly', risk: 'unknown' }))).toBe(false);
    expect(isBatchEligible(item({ itemRef: 'c', cadence: 'realtime', risk: 'low' }))).toBe(false);
  });
});
