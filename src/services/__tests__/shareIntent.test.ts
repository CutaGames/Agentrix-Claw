/**
 * shareIntent 纯函数单测（unified-growth-attribution-layer · Task 1.2）。
 * 覆盖:槽位映射、缺 id 生成短码、确定性、?ref 附带、URL 合法。
 */
import {
  buildShareIntent,
  deriveAttributionRef,
  appendRef,
  SHARE_SITE_BASE,
  predictionToShareIntent,
  digestToShareIntent,
  opportunityToShareIntent,
  referralToShareIntent,
  inviteToShareIntent,
  petSkinToShareIntent,
  type ShareIntent,
} from '../shareIntent';

describe('deriveAttributionRef', () => {
  it('is deterministic for the same (sourceType, entityId)', () => {
    const a = deriveAttributionRef('prediction', 'market-1');
    const b = deriveAttributionRef('prediction', 'market-1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9A-Z]{6,12}$/);
  });

  it('differs across entities/sources', () => {
    expect(deriveAttributionRef('prediction', 'm1')).not.toBe(deriveAttributionRef('prediction', 'm2'));
    expect(deriveAttributionRef('prediction', 'm1')).not.toBe(deriveAttributionRef('digest', 'm1'));
  });

  it('falls back to a code when no entity id', () => {
    const code = deriveAttributionRef('other');
    expect(code).toMatch(/^[0-9A-Z]{6,8}$/);
  });
});

describe('appendRef', () => {
  it('adds ?ref for a bare path', () => {
    expect(appendRef('/lsm/market/1', 'ABC')).toBe(`${SHARE_SITE_BASE}/lsm/market/1?ref=ABC`);
  });
  it('uses & when the path already has a query', () => {
    expect(appendRef('/c/X?foo=1', 'ABC')).toBe(`${SHARE_SITE_BASE}/c/X?foo=1&ref=ABC`);
  });
  it('leaves absolute URLs intact (adds ref)', () => {
    expect(appendRef('https://remoteok.com/j/1', 'ABC')).toBe('https://remoteok.com/j/1?ref=ABC');
  });
  it('encodes special chars in ref', () => {
    expect(appendRef('/x', 'a b&c')).toContain('ref=a%20b%26c');
  });
});

describe('buildShareIntent', () => {
  const base: ShareIntent = {
    sourceType: 'prediction',
    sourceEntityId: 'market-42',
    targetPath: '/lsm/market/42',
    title: '世界杯 决赛',
    oddsList: [{ label: '主胜', value: '2.10', highlight: true }],
    leftImageUrl: 'a.png',
    rightImageUrl: 'b.png',
  };

  it('maps slots into ShareCardProps + attributed url with ?ref', () => {
    const out = buildShareIntent(base);
    expect(out.attributionRef).toBe(deriveAttributionRef('prediction', 'market-42'));
    expect(out.attributedUrl).toBe(`${SHARE_SITE_BASE}/lsm/market/42?ref=${out.attributionRef}`);
    expect(out.shareCardProps.shareUrl).toBe(out.attributedUrl);
    expect(out.shareCardProps.title).toBe('世界杯 决赛');
    expect(out.shareCardProps.oddsList).toHaveLength(1);
    expect(out.shareCardProps.leftImageUrl).toBe('a.png');
    expect(out.sourceType).toBe('prediction');
    expect(out.sourceEntityId).toBe('market-42');
  });

  it('honours an explicit attributionRef (referral ?ref 归一)', () => {
    const out = buildShareIntent({ ...base, attributionRef: 'REFXYZ' });
    expect(out.attributionRef).toBe('REFXYZ');
    expect(out.attributedUrl).toContain('ref=REFXYZ');
  });

  it('generates a ref when none and no entity id', () => {
    const out = buildShareIntent({ sourceType: 'other', targetPath: '/x' });
    expect(out.attributionRef).toMatch(/^[0-9A-Z]{6,8}$/);
    expect(out.attributedUrl).toContain('ref=');
  });
});

describe('source mappers', () => {
  it('predictionToShareIntent keeps odds + flags + market path', () => {
    const i = predictionToShareIntent({ marketId: 'm7', title: '决赛', oddsList: [{ label: '主', value: '2.0' }], homeImageUrl: 'h.png', awayImageUrl: 'a.png' });
    const out = buildShareIntent(i);
    expect(out.sourceType).toBe('prediction');
    expect(out.attributedUrl).toContain('/lsm/market/m7?ref=');
    expect(out.shareCardProps.oddsList).toHaveLength(1);
    expect(out.shareCardProps.leftImageUrl).toBe('h.png');
  });

  it('digestToShareIntent targets dated digest', () => {
    const out = buildShareIntent(digestToShareIntent({ date: '2026-07-05', statsLabel: '3 机会' }));
    expect(out.sourceType).toBe('digest');
    expect(out.attributedUrl).toContain('/digest/2026-07-05?ref=');
  });

  it('opportunityToShareIntent prefers external url', () => {
    const out = buildShareIntent(opportunityToShareIntent({ identifier: 'urn:x:1', title: 'Job', externalUrl: 'https://remoteok.com/j/1' }));
    expect(out.attributedUrl).toBe('https://remoteok.com/j/1?ref=' + out.attributionRef);
  });

  it('opportunityToShareIntent falls back to /opportunity/:urn', () => {
    const out = buildShareIntent(opportunityToShareIntent({ identifier: 'urn:x:1', title: 'Job' }));
    expect(out.attributedUrl).toContain('/opportunity/urn%3Ax%3A1?ref=');
  });

  it('referralToShareIntent unifies refCode as attributionRef', () => {
    const out = buildShareIntent(referralToShareIntent({ refCode: 'REF123', targetPath: '/world/feed' }));
    expect(out.attributionRef).toBe('REF123');
    expect(out.sourceType).toBe('referral');
    expect(out.attributedUrl).toContain('/world/feed?ref=REF123');
  });

  it('inviteToShareIntent + petSkinToShareIntent map correctly', () => {
    const inv = buildShareIntent(inviteToShareIntent({ inviteCode: 'INV9', petName: '福福' }));
    expect(inv.sourceType).toBe('invite');
    expect(inv.attributedUrl).toContain('/invite/INV9?ref=INV9');
    const pet = buildShareIntent(petSkinToShareIntent({ skinId: 's1', name: '狐狸皮肤', imageUrl: 'x.png' }));
    expect(pet.sourceType).toBe('pet');
    expect(pet.attributedUrl).toContain('/market/skin/s1?ref=');
    expect(pet.shareCardProps.imageUrl).toBe('x.png');
  });
});
