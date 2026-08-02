/**
 * Sprint P-6 Phase 6.4 — petModeAdapters unit tests.
 *
 * The adapters wire backend pet-presence + RN DeviceEventEmitter into
 * the petMode bus. Here we test the pure logic — emotion → mode
 * mapping + celebratePet helper — without standing up a full RN +
 * socket.io fixture. Integration of the full bootPetModeAdapters() is
 * exercised by the Maestro spec `.maestro/44-mobile-pet-forms.yaml`.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  mapEmotionToMode,
  celebratePet,
} from '../petModeAdapters';
import {
  getPetMode,
  _internalResetForTests,
} from '../petMode';

beforeEach(() => {
  _internalResetForTests();
});

describe('mapEmotionToMode', () => {
  it('maps focused / excited to speaking', () => {
    expect(mapEmotionToMode('focused')).toBe('speaking');
    expect(mapEmotionToMode('excited')).toBe('speaking');
  });

  it('maps tired / sleepy to sleep', () => {
    expect(mapEmotionToMode('tired')).toBe('sleep');
    expect(mapEmotionToMode('sleepy')).toBe('sleep');
  });

  it('maps neutral / negative emotions to idle (no false alarm pose)', () => {
    expect(mapEmotionToMode('happy')).toBe('idle');
    expect(mapEmotionToMode('love')).toBe('idle');
    expect(mapEmotionToMode('calm')).toBe('idle');
    expect(mapEmotionToMode('sad')).toBe('idle');
    expect(mapEmotionToMode('angry')).toBe('idle');
    expect(mapEmotionToMode('concerned')).toBe('idle');
  });

  it('maps undefined to idle (defensive default)', () => {
    expect(mapEmotionToMode(undefined)).toBe('idle');
  });
});

describe('celebratePet', () => {
  it('sets pet mode to done with the configured ttl', () => {
    expect(getPetMode()).toBe('idle');
    celebratePet('test-source', 50);
    expect(getPetMode()).toBe('done');
  });

  it('reverts to idle after the ttl elapses', async () => {
    celebratePet('test-source', 30);
    expect(getPetMode()).toBe('done');
    await new Promise((r) => setTimeout(r, 70));
    expect(getPetMode()).toBe('idle');
  });

  it('uses the default 1200ms ttl when not specified', () => {
    celebratePet('default-ttl');
    expect(getPetMode()).toBe('done');
    // We don't wait the full 1200ms here; reset to clear the pending
    // timer so jest can exit cleanly.
    _internalResetForTests();
  });
});
