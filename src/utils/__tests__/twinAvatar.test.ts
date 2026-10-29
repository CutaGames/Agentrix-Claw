/**
 * Pure part of the mobile twin mark (E131 direction A, brand-yowo-v1 §3).
 * The RN component itself is not rendered here (mobile jest has no RN renderer):
 * this covers the size and echo-ring decision, the initial, the accessible name,
 * the photo fallback decision, the colours and the badge glyph placement.
 */
import {
  TWIN_MARK_NO_ECHO_AT_OR_BELOW,
  resolvePalette,
  twinMarkColors,
  twinMarkGeometry,
} from '../../../shared/design-tokens';
import {
  twinAvatarAccessibleName,
  twinAvatarColors,
  twinAvatarGlyph,
  twinAvatarInitial,
  twinAvatarInitialFont,
  twinAvatarLayout,
  twinAvatarPhotoUrl,
} from '../twinAvatar';

describe('twinAvatarLayout: size and echo ring', () => {
  it('reads the geometry from the shared spec, nothing of its own', () => {
    expect(twinAvatarLayout(60).geometry).toEqual(twinMarkGeometry(60));
    expect(twinAvatarLayout(60, true).geometry).toEqual(twinMarkGeometry(60, { echo: true }));
    expect(twinAvatarLayout(60).size).toBe(60);
  });

  it('60 px: ring 4% (2.4 px), gap 2% floored at 1 px (1.2 px), photo inside both', () => {
    const { geometry: g } = twinAvatarLayout(60);
    expect(g.ring.width).toBeCloseTo(2.4, 6);
    expect(g.ring.radius + g.ring.width / 2).toBeCloseTo(30, 6);
    expect(g.photo.diameter).toBeCloseTo(52.8, 6);
  });

  it('60 px: the ring is one arc open at the badge, and the badge has a one-gap cut (mark-spec A1)', () => {
    const { geometry: g } = twinAvatarLayout(60);
    // Centre line 28.8, badge radius 7.8; the arc is drawn the long way round, clockwise.
    expect(g.ring.path).toMatch(/^M[\d.]+ [\d.]+A28\.8 28\.8 0 1 1 [\d.]+ [\d.]+$/);
    // Each end sits 7.8 + 2 x 1.2 + 2.4 / 2 = 11.4 px from the badge centre.
    for (const p of [g.ring.start, g.ring.end]) {
      expect(Math.hypot(p.x - g.badge.centerX, p.y - g.badge.centerY)).toBeCloseTo(11.4, 6);
    }
    expect(g.badge.cutRadius).toBeCloseTo(9, 6);
    expect(g.badge.showGlyph).toBe(true);
  });

  it('draws the badge as a plain dot below 20 px', () => {
    expect(twinAvatarLayout(19).geometry.badge.showGlyph).toBe(false);
    expect(twinAvatarLayout(20).geometry.badge.showGlyph).toBe(true);
  });

  it('draws no echo ring by default, at any size', () => {
    for (const size of [20, 24, 32, 33, 40, 48, 60, 96, 256]) {
      expect(twinAvatarLayout(size).showEcho).toBe(false);
      expect(twinAvatarLayout(size, false).showEcho).toBe(false);
    }
  });

  it('draws the echo ring only when switched on and above 32 px', () => {
    expect(TWIN_MARK_NO_ECHO_AT_OR_BELOW).toBe(32);
    expect(twinAvatarLayout(256, true).showEcho).toBe(true);
    expect(twinAvatarLayout(96, true).showEcho).toBe(true);
    expect(twinAvatarLayout(33, true).showEcho).toBe(true);
    expect(twinAvatarLayout(32, true).showEcho).toBe(false);
    expect(twinAvatarLayout(24, true).showEcho).toBe(false);
    expect(twinAvatarLayout(20, true).showEcho).toBe(false);
  });

  it('keeps the ring and the badge at 32 px and below', () => {
    const { geometry: g } = twinAvatarLayout(32, true);
    expect(g.showEcho).toBe(false);
    expect(g.ring.width).toBeGreaterThanOrEqual(1.5);
    expect(g.badge.radius).toBeGreaterThan(0);
  });

  it('gives a zero-size layout, and no echo, for a size that is not a positive number', () => {
    for (const size of [0, -5, NaN, Infinity, -Infinity]) {
      const layout = twinAvatarLayout(size, true);
      expect(layout.size).toBe(0);
      expect(layout.showEcho).toBe(false);
    }
  });
});

describe('twinAvatarInitial', () => {
  it('takes the first character, upper-cased for Latin', () => {
    expect(twinAvatarInitial('阿澜', 'zh')).toBe('阿');
    expect(twinAvatarInitial('  lan  ', 'en')).toBe('L');
    expect(twinAvatarInitial('Lan', 'zh')).toBe('L');
  });

  it('keeps a character outside the basic plane whole', () => {
    expect(twinAvatarInitial('𠮷野家', 'zh')).toBe('𠮷');
  });

  it('falls back to a fixed text in the app language when there is no name', () => {
    for (const name of [null, undefined, '', '   ']) {
      expect(twinAvatarInitial(name, 'zh')).toBe('分');
      expect(twinAvatarInitial(name, 'en')).toBe('AI');
    }
  });
});

describe('twinAvatarInitialFont', () => {
  it('sets a CJK character a step smaller and lighter than a Latin letter, the weight as a string for RN', () => {
    const g = twinAvatarLayout(100).geometry;
    // Photo 88 px: CJK 0.42 x 88 = 36.96, Latin 0.44 x 88 = 38.72.
    expect(twinAvatarInitialFont(g, '阿').fontSize).toBeCloseTo(36.96, 6);
    expect(twinAvatarInitialFont(g, '分').fontSize).toBeCloseTo(36.96, 6);
    expect(twinAvatarInitialFont(g, 'L').fontSize).toBeCloseTo(38.72, 6);
    expect(twinAvatarInitialFont(g, 'AI').fontSize).toBeCloseTo(38.72, 6);
    // 64 px and up (mark-spec §4): Latin 400, CJK 300.
    expect(twinAvatarInitialFont(g, '阿').fontWeight).toBe('300');
    expect(twinAvatarInitialFont(g, 'L').fontWeight).toBe('400');
  });

  it('weights the QR screen size (60 px box, photo 52.8 px) Latin 500, CJK 400', () => {
    const g = twinAvatarLayout(60).geometry;
    expect(g.photo.diameter).toBeCloseTo(52.8, 6);
    expect(twinAvatarInitialFont(g, '阿').fontWeight).toBe('400');
    expect(twinAvatarInitialFont(g, 'L').fontWeight).toBe('500');
  });

  it('uses 0.6 of the photo and weight 500 for both at 24 px and below', () => {
    // 24 px box: ring 1.5, gap 1, photo 19 px.
    const g = twinAvatarLayout(24).geometry;
    expect(twinAvatarInitialFont(g, '阿').fontSize).toBeCloseTo(11.4, 6);
    expect(twinAvatarInitialFont(g, 'L').fontSize).toBeCloseTo(11.4, 6);
    expect(twinAvatarInitialFont(g, '阿').fontWeight).toBe('500');
    expect(twinAvatarInitialFont(g, 'L').fontWeight).toBe('500');
  });
});

describe('twinAvatarAccessibleName', () => {
  it('uses the real name, in one language', () => {
    expect(twinAvatarAccessibleName('阿澜', 'zh')).toBe('阿澜的 AI 分身');
    expect(twinAvatarAccessibleName('Lan', 'en')).toBe("Lan's AI twin");
    expect(twinAvatarAccessibleName('  Lan  ', 'en')).toBe("Lan's AI twin");
  });

  it('reads just the label when there is no name', () => {
    expect(twinAvatarAccessibleName(null, 'zh')).toBe('AI 分身');
    expect(twinAvatarAccessibleName('', 'en')).toBe('AI twin');
    expect(twinAvatarAccessibleName(undefined, 'en')).toBe('AI twin');
  });

  it('has no Chinese in the English name and no English word beside AI in the Chinese one', () => {
    expect(twinAvatarAccessibleName('Lan', 'en')).not.toMatch(/[\u4e00-\u9fff]/);
    expect(twinAvatarAccessibleName(null, 'en')).not.toMatch(/[\u4e00-\u9fff]/);
    expect(twinAvatarAccessibleName('阿澜', 'zh').replace('AI', '')).not.toMatch(/[A-Za-z]/);
  });
});

describe('twinAvatarPhotoUrl: photo or initial', () => {
  it('tries a photo address, trimmed', () => {
    expect(twinAvatarPhotoUrl('https://cdn.example/a.jpg', null)).toBe('https://cdn.example/a.jpg');
    expect(twinAvatarPhotoUrl('  https://cdn.example/a.jpg ', undefined)).toBe('https://cdn.example/a.jpg');
  });

  it('shows the initial when there is no photo address', () => {
    expect(twinAvatarPhotoUrl(null, null)).toBeNull();
    expect(twinAvatarPhotoUrl(undefined, null)).toBeNull();
    expect(twinAvatarPhotoUrl('', null)).toBeNull();
    expect(twinAvatarPhotoUrl('   ', null)).toBeNull();
  });

  it('falls back to the initial for the address that failed, and tries a new address once', () => {
    const failed = 'https://cdn.example/broken.jpg';
    expect(twinAvatarPhotoUrl(failed, failed)).toBeNull();
    expect(twinAvatarPhotoUrl('https://cdn.example/new.jpg', failed)).toBe('https://cdn.example/new.jpg');
  });
});

describe('twinAvatarColors', () => {
  it('is the shared mapping on the resolved palette', () => {
    expect(twinAvatarColors('light', 'sky-blue')).toEqual(twinMarkColors(resolvePalette('light', 'sky-blue')));
    expect(twinAvatarColors('dark', 'nebula-violet')).toEqual(twinMarkColors(resolvePalette('dark', 'nebula-violet')));
  });

  it('is sky blue on a light screen and the lighter sky blue on a dark one', () => {
    const light = twinAvatarColors('light', 'sky-blue');
    expect(light.ring).toBe('#1460ED');
    expect(light.echo).toBe('#1460ED');
    expect(light.badge).toBe('#1460ED');
    expect(light.badgeGlyph).toBe('#FFFFFF');
    expect(light.gap).toBe('#FFFFFF');
    // mark-spec §3: the initial is neutral, surface-2 disc and body text.
    expect(light.initialBackground).toBe('#EEF1F4');
    expect(light.initialText).toBe('#0E1419');
    // The label (chevron and words, no pill) is the accent's text shade.
    expect(light.label).toBe('#1460ED');
    const dark = twinAvatarColors('dark', 'sky-blue');
    expect(dark.ring).toBe('#6EA8FF');
    expect(dark.badge).toBe('#6EA8FF');
    expect(dark.badgeGlyph).toBe('#06142E');
    expect(dark.initialBackground).toBe('#1C2127');
    expect(dark.initialText).toBe('#EEF2F5');
    expect(dark.label).toBe('#6EA8FF');
  });
});

describe('twinAvatarGlyph: the AX chevron placed on the badge', () => {
  it('moves and scales the chevron path onto the badge centre', () => {
    const g = twinAvatarLayout(100).geometry;
    const { d, strokeWidth } = twinAvatarGlyph(g);
    const s = g.badge.glyph.scale;
    const cx = g.badge.centerX;
    const cy = g.badge.centerY;
    expect(strokeWidth).toBe(0);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    // M36 94 L72 26 L108 94 H92 L72 57 L52 94 H36 Z, relative to the chevron point (72, 61).
    expect(d.replace(/[-\d.\s]+/g, ' ').trim()).toBe('M L L H L L H Z');
    const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const expected = [
      cx - 36 * s, cy + 33 * s,
      cx, cy - 35 * s,
      cx + 36 * s, cy + 33 * s,
      cx + 20 * s,
      cx, cy - 4 * s,
      cx - 20 * s, cy + 33 * s,
      cx - 36 * s,
    ];
    expect(nums).toHaveLength(expected.length);
    expected.forEach((v, i) => expect(nums[i]).toBeCloseTo(v, 2));
  });

  it('keeps the chevron, with its stroke, inside the badge disc at every size', () => {
    for (const size of [20, 24, 32, 48, 49, 96, 100, 256]) {
      const g = twinAvatarLayout(size).geometry;
      const { d, strokeWidth } = twinAvatarGlyph(g);
      const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      // Points: M(2) L(2) L(2) H(1) L(2) L(2) H(1); H keeps the previous y (the last point's y).
      const pts: Array<[number, number]> = [];
      let lastY = 0;
      let i = 0;
      for (const cmd of d.match(/[MLHVZ]/g) || []) {
        if (cmd === 'Z') continue;
        if (cmd === 'H') {
          pts.push([nums[i], lastY]);
          i += 1;
        } else {
          lastY = nums[i + 1];
          pts.push([nums[i], lastY]);
          i += 2;
        }
      }
      for (const [x, y] of pts) {
        const dist = Math.hypot(x - g.badge.centerX, y - g.badge.centerY) + strokeWidth / 2;
        expect(dist).toBeLessThanOrEqual(g.badge.radius + 0.01);
      }
    }
  });

  it('adds the extra stroke at 48 px and below, in avatar px, and none above', () => {
    const small = twinAvatarLayout(32).geometry;
    expect(twinAvatarGlyph(small).strokeWidth).toBeCloseTo(small.badge.glyph.strokeWidth * small.badge.glyph.scale, 2);
    expect(twinAvatarGlyph(small).strokeWidth).toBeGreaterThan(0);
    expect(twinAvatarGlyph(twinAvatarLayout(49).geometry).strokeWidth).toBe(0);
  });

  it('draws nothing rather than a wrong shape for a path command it does not handle', () => {
    const g = twinAvatarLayout(100).geometry;
    const odd = { ...g, badge: { ...g.badge, glyph: { ...g.badge.glyph, path: 'M0 0C1 1 2 2 3 3Z' } } };
    expect(twinAvatarGlyph(odd).d).toBe('');
  });
});
