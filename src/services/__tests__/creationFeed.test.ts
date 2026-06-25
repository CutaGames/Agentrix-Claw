/**
 * creationFeed 纯逻辑单测(World Creation & Feed · task 3.6)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 5.8(livestream/stage 进行中才可直接进入)、5.9(冷启动空态)、
 *     5.10(预加载 / 省流模式)。
 *
 * 仅覆盖无 RN 依赖的纯逻辑(组件渲染测试在 jest-expo 落地后补,见 jest.config.js)。
 */
import {
  isLiveType,
  offeringActiveAt,
  isCreationLiveNow,
  preferredPreviewUri,
  nextPreloadUri,
  isColdStartEmpty,
  preloadPreviewUris,
  selectUrisToPrefetch,
  isWithinRenderWindow,
  shouldRenderPreview,
  activeWindowIndices,
  recycledIndices,
  FEED_PRELOAD_LOOKAHEAD,
  FEED_RENDER_WINDOW_RADIUS,
} from '../creationFeed';
import type { CreationDiscoveryItem, Offering } from '../../../shared/types/creation';

const NOW = 1_000_000_000_000;

function offering(over: Partial<Offering> = {}): Offering {
  return {
    id: 'off-1',
    kind: 'ticket',
    name: '午夜脱口秀门票',
    verbs: ['book'],
    ...over,
  };
}

function item(over: Partial<CreationDiscoveryItem> = {}): CreationDiscoveryItem {
  return {
    id: 'c-1',
    type: 'livestream',
    title: '午夜脱口秀',
    preview: { kind: 'cover', url: 'https://cdn/x.jpg' },
    creator: { accountId: 'owner-1', name: '豆豆' },
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    canEnter: true,
    ...over,
  };
}

describe('isLiveType', () => {
  it('is true only for livestream/stage', () => {
    expect(isLiveType({ type: 'livestream' })).toBe(true);
    expect(isLiveType({ type: 'stage' })).toBe(true);
    expect(isLiveType({ type: 'shop' })).toBe(false);
    expect(isLiveType({ type: 'game' })).toBe(false);
    expect(isLiveType({ type: 'place' })).toBe(false);
  });
});

describe('offeringActiveAt', () => {
  it('false when no schedule', () => {
    expect(offeringActiveAt(offering(), NOW)).toBe(false);
    expect(offeringActiveAt(offering({ availability: {} }), NOW)).toBe(false);
    expect(offeringActiveAt(offering({ availability: { schedule: [] } }), NOW)).toBe(false);
  });

  it('true when now is within a window', () => {
    const o = offering({ availability: { schedule: [{ startsAt: NOW - 1000, endsAt: NOW + 1000 }] } });
    expect(offeringActiveAt(o, NOW)).toBe(true);
  });

  it('treats missing endsAt as ongoing after start', () => {
    const o = offering({ availability: { schedule: [{ startsAt: NOW - 1000 }] } });
    expect(offeringActiveAt(o, NOW)).toBe(true);
  });

  it('false before start or after end', () => {
    const before = offering({ availability: { schedule: [{ startsAt: NOW + 1000, endsAt: NOW + 2000 }] } });
    const after = offering({ availability: { schedule: [{ startsAt: NOW - 2000, endsAt: NOW - 1000 }] } });
    expect(offeringActiveAt(before, NOW)).toBe(false);
    expect(offeringActiveAt(after, NOW)).toBe(false);
  });

  it('is true at exact window boundaries (inclusive)', () => {
    const startEdge = offering({ availability: { schedule: [{ startsAt: NOW, endsAt: NOW + 10 }] } });
    const endEdge = offering({ availability: { schedule: [{ startsAt: NOW - 10, endsAt: NOW }] } });
    expect(offeringActiveAt(startEdge, NOW)).toBe(true);
    expect(offeringActiveAt(endEdge, NOW)).toBe(true);
  });
});

describe('isCreationLiveNow (需求 5.8)', () => {
  it('false for non-live types regardless of schedule', () => {
    const shopNow = item({
      type: 'shop',
      offerings: [offering({ availability: { schedule: [{ startsAt: NOW - 1, endsAt: NOW + 1 }] } })],
    });
    expect(isCreationLiveNow(shopNow, NOW)).toBe(false);
  });

  it('true when any offering window is active now', () => {
    const live = item({
      type: 'stage',
      offerings: [
        offering({ id: 'a', availability: { schedule: [{ startsAt: NOW + 5000 }] } }),
        offering({ id: 'b', availability: { schedule: [{ startsAt: NOW - 5000, endsAt: NOW + 5000 }] } }),
      ],
    });
    expect(isCreationLiveNow(live, NOW)).toBe(true);
  });

  it('false when livestream has no active window', () => {
    const upcoming = item({ offerings: [offering({ availability: { schedule: [{ startsAt: NOW + 1 }] } })] });
    expect(isCreationLiveNow(upcoming, NOW)).toBe(false);
    expect(isCreationLiveNow(item({ offerings: [] }), NOW)).toBe(false);
    expect(isCreationLiveNow(item({ offerings: undefined }), NOW)).toBe(false);
  });
});

describe('preferredPreviewUri', () => {
  it('prefers thumbnail then url', () => {
    expect(preferredPreviewUri({ preview: { kind: 'cover', url: 'u', thumbnailUrl: 't' } })).toBe('t');
    expect(preferredPreviewUri({ preview: { kind: 'cover', url: 'u' } })).toBe('u');
  });

  it('empty string when no preview', () => {
    expect(preferredPreviewUri({ preview: undefined as never })).toBe('');
  });
});

describe('nextPreloadUri (需求 5.10)', () => {
  const items = [
    { preview: { kind: 'cover' as const, url: 'u0', thumbnailUrl: 't0' } },
    { preview: { kind: 'cover' as const, url: 'u1', thumbnailUrl: 't1' } },
    { preview: { kind: 'cover' as const, url: 'u2' } },
  ];

  it('returns next item preview uri', () => {
    expect(nextPreloadUri(items, 0, false)).toBe('t1');
    expect(nextPreloadUri(items, 1, false)).toBe('u2');
  });

  it('null at end of list', () => {
    expect(nextPreloadUri(items, 2, false)).toBeNull();
  });

  it('null in data-saver mode (no auto preload)', () => {
    expect(nextPreloadUri(items, 0, true)).toBeNull();
  });

  it('null for invalid active index', () => {
    expect(nextPreloadUri(items, -1, false)).toBeNull();
  });
});

describe('isColdStartEmpty (需求 5.9)', () => {
  it('true only when loaded, no error, and zero items', () => {
    expect(isColdStartEmpty({ isLoading: false, isError: false, itemCount: 0 })).toBe(true);
  });

  it('false while loading / on error / when items exist', () => {
    expect(isColdStartEmpty({ isLoading: true, isError: false, itemCount: 0 })).toBe(false);
    expect(isColdStartEmpty({ isLoading: false, isError: true, itemCount: 0 })).toBe(false);
    expect(isColdStartEmpty({ isLoading: false, isError: false, itemCount: 3 })).toBe(false);
  });
});

// ============================================================
// task 3.7 — 下一屏预加载(N+1/N+2)+ 去重(需求 5.2 / 5.6 / 5.10)
// ============================================================

type PreviewItem = Pick<CreationDiscoveryItem, 'preview'>;

function preview(url: string, thumb?: string): PreviewItem {
  return { preview: { kind: 'cover', url, ...(thumb ? { thumbnailUrl: thumb } : {}) } };
}

describe('preloadPreviewUris (需求 5.6 流畅滑动)', () => {
  const items: PreviewItem[] = [
    preview('u0', 't0'),
    preview('u1', 't1'),
    preview('u2'),
    preview('u3', 't3'),
    preview('u4'),
  ];

  it('default lookahead is N+1 and N+2 (prefers thumbnail)', () => {
    expect(FEED_PRELOAD_LOOKAHEAD).toBe(2);
    expect(preloadPreviewUris(items, 0)).toEqual(['t1', 'u2']);
    expect(preloadPreviewUris(items, 1)).toEqual(['u2', 't3']);
  });

  it('clamps near the tail (only existing items)', () => {
    expect(preloadPreviewUris(items, 3)).toEqual(['u4']);
    expect(preloadPreviewUris(items, 4)).toEqual([]);
  });

  it('returns empty in data-saver mode (no auto preload, 需求 5.10)', () => {
    expect(preloadPreviewUris(items, 0, true)).toEqual([]);
  });

  it('returns empty for invalid active index', () => {
    expect(preloadPreviewUris(items, -1)).toEqual([]);
  });

  it('honors custom lookahead and treats <=0 as no preload', () => {
    expect(preloadPreviewUris(items, 0, false, 1)).toEqual(['t1']);
    expect(preloadPreviewUris(items, 0, false, 3)).toEqual(['t1', 'u2', 't3']);
    expect(preloadPreviewUris(items, 0, false, 0)).toEqual([]);
    expect(preloadPreviewUris(items, 0, false, -2)).toEqual([]);
  });

  it('skips empty preview uris and de-duplicates', () => {
    const dup: PreviewItem[] = [
      preview('u0'),
      { preview: { kind: 'cover', url: '' } }, // 空 URI 应被跳过
      preview('same'),
      preview('same'), // 重复应去重
    ];
    expect(preloadPreviewUris(dup, 0, false, 3)).toEqual(['same']);
  });
});

describe('selectUrisToPrefetch (需求 5.6 避免重复 prefetch)', () => {
  it('filters out already-prefetched uris (Set input)', () => {
    const already = new Set(['a', 'b']);
    expect(selectUrisToPrefetch(['a', 'c', 'd'], already)).toEqual(['c', 'd']);
  });

  it('accepts an array as the already-prefetched source', () => {
    expect(selectUrisToPrefetch(['x', 'y'], ['y'])).toEqual(['x']);
  });

  it('de-duplicates within the candidate batch and drops empties', () => {
    expect(selectUrisToPrefetch(['a', 'a', '', 'b'], new Set<string>())).toEqual(['a', 'b']);
  });

  it('returns empty when everything is already prefetched', () => {
    expect(selectUrisToPrefetch(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });
});

// ============================================================
// task 3.7 — 预览懒加载与离屏回收的渲染窗口(需求 5.2 / 5.6)
// ============================================================

describe('isWithinRenderWindow / shouldRenderPreview (需求 5.2 懒加载)', () => {
  it('default radius keeps current ± 1 in window', () => {
    expect(FEED_RENDER_WINDOW_RADIUS).toBe(1);
    expect(isWithinRenderWindow(4, 5)).toBe(true); // 前一张
    expect(isWithinRenderWindow(5, 5)).toBe(true); // 当前
    expect(isWithinRenderWindow(6, 5)).toBe(true); // 后一张
    expect(isWithinRenderWindow(3, 5)).toBe(false); // 离屏 → 回收
    expect(isWithinRenderWindow(7, 5)).toBe(false);
  });

  it('shouldRenderPreview mirrors the render window', () => {
    expect(shouldRenderPreview(5, 5)).toBe(true);
    expect(shouldRenderPreview(3, 5)).toBe(false);
  });

  it('no active card (activeIndex < 0) → nothing renders heavy preview', () => {
    expect(isWithinRenderWindow(0, -1)).toBe(false);
    expect(shouldRenderPreview(0, -1)).toBe(false);
  });

  it('respects a custom radius', () => {
    expect(isWithinRenderWindow(2, 5, 3)).toBe(true);
    expect(isWithinRenderWindow(1, 5, 3)).toBe(false);
  });
});

describe('activeWindowIndices (需求 5.2/5.6)', () => {
  it('returns clamped contiguous indices around active', () => {
    expect(activeWindowIndices(5, 10)).toEqual([4, 5, 6]);
  });

  it('clamps at the list head and tail', () => {
    expect(activeWindowIndices(0, 10)).toEqual([0, 1]);
    expect(activeWindowIndices(9, 10)).toEqual([8, 9]);
  });

  it('empty for no active card or empty list', () => {
    expect(activeWindowIndices(-1, 10)).toEqual([]);
    expect(activeWindowIndices(0, 0)).toEqual([]);
  });

  it('respects a custom radius', () => {
    expect(activeWindowIndices(5, 10, 2)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('recycledIndices (离屏回收)', () => {
  it('is the complement of the active window', () => {
    expect(recycledIndices(5, 10)).toEqual([0, 1, 2, 3, 7, 8, 9]);
  });

  it('window + recycled partition the whole list (no overlap, full cover)', () => {
    const total = 8;
    const active = activeWindowIndices(3, total);
    const recycled = recycledIndices(3, total);
    expect([...active, ...recycled].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(active.some((i) => recycled.includes(i))).toBe(false);
  });

  it('when no active card, everything is recycled', () => {
    expect(recycledIndices(-1, 3)).toEqual([0, 1, 2]);
  });

  it('empty for empty list', () => {
    expect(recycledIndices(0, 0)).toEqual([]);
  });
});
