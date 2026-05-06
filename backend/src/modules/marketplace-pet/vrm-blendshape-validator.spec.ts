import { validateVrmBlendShapes, REQUIRED_BLEND_SHAPES } from './vrm-blendshape-validator';

describe('validateVrmBlendShapes (BE-T3.2)', () => {
  it('accepts a VRM 1.0 manifest with all 5 presets', () => {
    const m = {
      extensions: {
        VRMC_vrm: {
          expressions: {
            preset: {
              happy: { isBinary: false },
              sad: {},
              angry: {},
              surprised: {},
              neutral: {},
              blink: {}, // extra is fine
            },
          },
        },
      },
    };
    const r = validateVrmBlendShapes(m);
    expect(r.valid).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.expressionCount).toBeGreaterThanOrEqual(5);
  });

  it('rejects a VRM 1.0 manifest missing happy + angry', () => {
    const m = {
      extensions: {
        VRMC_vrm: {
          expressions: { preset: { sad: {}, surprised: {}, neutral: {} } },
        },
      },
    };
    const r = validateVrmBlendShapes(m);
    expect(r.valid).toBe(false);
    expect(r.missing.sort()).toEqual(['angry', 'happy']);
  });

  it('accepts a VRM 0.x manifest using presetName', () => {
    const m = {
      extensions: {
        VRM: {
          blendShapeMaster: {
            blendShapeGroups: [
              { name: 'JOY', presetName: 'joy' },
              { name: 'SORROW', presetName: 'sorrow' },
              { name: 'ANGRY', presetName: 'angry' },
              { name: 'SURPRISED', presetName: 'surprised' },
              { name: 'NEUTRAL', presetName: 'neutral' },
            ],
          },
        },
      },
    };
    const r = validateVrmBlendShapes(m);
    expect(r.valid).toBe(true);
    expect(r.found.happy).toBeTruthy(); // matched via "joy" alias
    expect(r.found.sad).toBeTruthy();   // matched via "sorrow" alias
  });

  it('handles generic expressions array', () => {
    const m = {
      expressions: [
        { name: 'happy' }, { name: 'sad' }, { name: 'angry' },
        { name: 'surprised' }, { name: 'neutral' },
      ],
    };
    expect(validateVrmBlendShapes(m).valid).toBe(true);
  });

  it('case-insensitive matching', () => {
    const m = {
      blendShapes: [
        { name: 'HAPPY' }, { name: 'Sad' }, { name: 'aNgRy' },
        { name: 'Surprised' }, { name: 'NEUTRAL' },
      ],
    };
    expect(validateVrmBlendShapes(m).valid).toBe(true);
  });

  it('returns valid=false on null / non-object input', () => {
    expect(validateVrmBlendShapes(null).valid).toBe(false);
    expect(validateVrmBlendShapes(undefined).valid).toBe(false);
    expect(validateVrmBlendShapes('not-an-object' as any).valid).toBe(false);
  });

  it('returns full missing list for empty manifest', () => {
    const r = validateVrmBlendShapes({});
    expect(r.valid).toBe(false);
    expect(r.missing.sort()).toEqual([...REQUIRED_BLEND_SHAPES].sort());
    expect(r.expressionCount).toBe(0);
  });

  it('exposes which alias satisfied each requirement (in `found`)', () => {
    const m = { expressions: [{ name: 'fun' }, { name: 'frown' }, { name: 'mad' }, { name: 'shock' }, { name: 'rest' }] };
    const r = validateVrmBlendShapes(m);
    expect(r.valid).toBe(true);
    expect(r.found.happy).toBe('fun');
    expect(r.found.sad).toBe('frown');
    expect(r.found.angry).toBe('mad');
    expect(r.found.surprised).toBe('shock');
    expect(r.found.neutral).toBe('rest');
  });

  describe('SC-T3.2 — script payload detection', () => {
    const baseValid = {
      extensions: {
        VRMC_vrm: {
          expressions: {
            preset: { happy: {}, sad: {}, angry: {}, surprised: {}, neutral: {} },
          },
        },
      },
    };

    it('rejects manifest containing <script> in extras', () => {
      const m = { ...baseValid, extras: { author: '<script>alert(1)</script>' } };
      const r = validateVrmBlendShapes(m);
      expect(r.valid).toBe(false);
      expect(r.scriptPayloadDetected).toBe(true);
      expect(r.scriptPayloadEvidence).toMatch(/script/);
    });

    it('rejects manifest with javascript: url in custom property', () => {
      const m = { ...baseValid, custom: { homepage: 'javascript:void(0)' } };
      expect(validateVrmBlendShapes(m).valid).toBe(false);
    });

    it('rejects manifest with onerror= handler in deeply nested string', () => {
      const m = { ...baseValid, meta: { thumb: { src: '" onerror="alert(1)' } } };
      expect(validateVrmBlendShapes(m).valid).toBe(false);
    });

    it('rejects manifest with eval(...) call string', () => {
      const m = { ...baseValid, license: 'eval(atob("..."))' };
      expect(validateVrmBlendShapes(m).valid).toBe(false);
    });

    it('clean manifest stays valid', () => {
      const r = validateVrmBlendShapes(baseValid);
      expect(r.valid).toBe(true);
      expect(r.scriptPayloadDetected).toBe(false);
    });
  });
});
