/**
 * posterShare.test — 移动端机会海报数据映射纯函数覆盖
 * （marketplace-aggregation-production-loop · C9 / 需求 7.1、7.3）。
 *
 * 覆盖对话卡片「生成海报」(OpportunityCards) 与日报海报屏 (DigestPosterScreen) 共用的
 * 海报分享链接 / 头部 emoji 映射。渲染与系统分享（ViewShot + expo-sharing）属 RN 运行时，
 * 由 APK 端到端验证，不在此 node 单测范围。
 */
import {
  posterShareUrl,
  posterEmojiFor,
  digestPosterShareUrl,
  POSTER_SITE_BASE,
  POSTER_CATEGORY_EMOJI,
  POSTER_DEFAULT_EMOJI,
} from '../aggregatedMarketView';
import type { AggregatedListing } from '../aggregatedMarket.api';

function makeListing(overrides: Partial<AggregatedListing> = {}): AggregatedListing {
  return {
    identifier: 'urn:air:remoteok:task:abc-123',
    displayName: 'Senior RN Engineer',
    score: 80,
    source: 'remoteok',
    internal: false,
    category: 'task',
    canAccept: true,
    canDiscover: true,
    canPublish: false,
    aggregated: true,
    gmv: 1000,
    currency: 'USDC',
    externalId: 'abc-123',
    connectorSource: 'remoteok',
    ...overrides,
  };
}

describe('posterShareUrl', () => {
  it('prefers the external listing URL when present', () => {
    const listing = makeListing({ externalUrl: 'https://remoteok.com/jobs/abc-123' });
    expect(posterShareUrl(listing)).toBe('https://remoteok.com/jobs/abc-123');
  });

  it('falls back to a site opportunity detail URL when there is no external link', () => {
    const listing = makeListing({ externalUrl: undefined });
    expect(posterShareUrl(listing)).toBe(
      `${POSTER_SITE_BASE}/opportunity/${encodeURIComponent('urn:air:remoteok:task:abc-123')}`,
    );
  });

  it('encodes special characters in the identifier so the URL stays valid', () => {
    const listing = makeListing({ externalUrl: undefined, identifier: 'urn:air:x:y:a b&c?d' });
    const url = posterShareUrl(listing);
    // URN colons and unsafe chars must be percent-encoded in the path segment.
    expect(url).toBe(`${POSTER_SITE_BASE}/opportunity/${encodeURIComponent('urn:air:x:y:a b&c?d')}`);
    expect(url).not.toContain(' ');
    expect(url).not.toContain('&');
  });

  it('tolerates a missing identifier without throwing', () => {
    const listing = makeListing({ externalUrl: undefined, identifier: '' as any });
    expect(posterShareUrl(listing)).toBe(`${POSTER_SITE_BASE}/opportunity/`);
  });

  it('honours a custom site base', () => {
    const listing = makeListing({ externalUrl: undefined });
    expect(posterShareUrl(listing, 'https://example.test')).toBe(
      `https://example.test/opportunity/${encodeURIComponent('urn:air:remoteok:task:abc-123')}`,
    );
  });
});

describe('posterEmojiFor', () => {
  it('maps every category to its dedicated emoji', () => {
    (Object.keys(POSTER_CATEGORY_EMOJI) as Array<keyof typeof POSTER_CATEGORY_EMOJI>).forEach((cat) => {
      expect(posterEmojiFor(cat)).toBe(POSTER_CATEGORY_EMOJI[cat]);
    });
  });

  it('falls back to the default emoji when category is null/undefined', () => {
    expect(posterEmojiFor(null)).toBe(POSTER_DEFAULT_EMOJI);
    expect(posterEmojiFor(undefined)).toBe(POSTER_DEFAULT_EMOJI);
  });
});

describe('digestPosterShareUrl', () => {
  it('prefers the backend-provided shareUrl', () => {
    expect(digestPosterShareUrl({ shareUrl: 'https://agentrix.top/d/2026-05-10', date: '2026-05-10' })).toBe(
      'https://agentrix.top/d/2026-05-10',
    );
  });

  it('falls back to a dated digest URL when shareUrl is absent', () => {
    expect(digestPosterShareUrl({ date: '2026-05-10' })).toBe(`${POSTER_SITE_BASE}/digest/2026-05-10`);
  });

  it('falls back to "today" when neither shareUrl nor date is present', () => {
    expect(digestPosterShareUrl(null)).toBe(`${POSTER_SITE_BASE}/digest/today`);
    expect(digestPosterShareUrl({})).toBe(`${POSTER_SITE_BASE}/digest/today`);
  });

  it('honours a custom site base for the fallback', () => {
    expect(digestPosterShareUrl({ date: '2026-05-10' }, 'https://example.test')).toBe(
      'https://example.test/digest/2026-05-10',
    );
  });
});
