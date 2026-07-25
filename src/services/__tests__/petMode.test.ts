/**
 * Sprint P-6 (2026-05-22) — Mobile petMode bus unit test.
 *
 * Mirrors `desktop/src/test/petMode.test.ts` but for the RN-flavored
 * mobile bus (no Tauri, no CustomEvent, simple Set listeners).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  setPetMode,
  getPetMode,
  subscribePetMode,
  resolveSpriteForMode,
  _internalResetForTests,
  type PetMode,
} from '../petMode';

beforeEach(() => {
  _internalResetForTests();
});

describe('mobile petMode bus', () => {
  it('starts in idle by default', () => {
    expect(getPetMode()).toBe('idle');
  });

  it('emits a single event when a non-idle mode is set', () => {
    const seen: PetMode[] = [];
    subscribePetMode((mode) => seen.push(mode));
    setPetMode('listening', 'test');
    expect(seen).toEqual(['listening']);
    expect(getPetMode()).toBe('listening');
  });

  it('is idempotent — setting the same mode twice does not re-emit', () => {
    const seen: PetMode[] = [];
    subscribePetMode((mode) => seen.push(mode));
    setPetMode('speaking', 'test');
    setPetMode('speaking', 'test');
    expect(seen).toEqual(['speaking']);
  });

  it('reverts to idle after ttlMs elapses', async () => {
    const seen: PetMode[] = [];
    subscribePetMode((mode) => seen.push(mode));
    setPetMode('done', 'celebration', 30);
    expect(seen).toEqual(['done']);
    // Wait beyond ttl
    await new Promise((r) => setTimeout(r, 70));
    expect(seen).toEqual(['done', 'idle']);
    expect(getPetMode()).toBe('idle');
  });

  it('unsubscribe stops further callbacks', () => {
    const seen: PetMode[] = [];
    const off = subscribePetMode((mode) => seen.push(mode));
    setPetMode('listening', 'test');
    off();
    setPetMode('speaking', 'test');
    expect(seen).toEqual(['listening']);
  });

  it('maps computer-use to idle (not applicable on mobile)', () => {
    setPetMode('computer-use' as PetMode, 'test');
    expect(getPetMode()).toBe('idle');
  });

  it('resolveSpriteForMode degrades thinking/typing to talk', () => {
    expect(resolveSpriteForMode('idle')).toBe('idle');
    expect(resolveSpriteForMode('listening')).toBe('listen');
    expect(resolveSpriteForMode('speaking')).toBe('talk');
    expect(resolveSpriteForMode('thinking')).toBe('talk');
    expect(resolveSpriteForMode('typing')).toBe('talk');
    expect(resolveSpriteForMode('done')).toBe('pro-done');
    expect(resolveSpriteForMode('sleep')).toBe('sleep');
    expect(resolveSpriteForMode('approval')).toBe('alert');
    expect(resolveSpriteForMode('wardrobe')).toBe('idle');
  });

  it('listener exceptions do not break the bus', () => {
    const seen: PetMode[] = [];
    subscribePetMode(() => {
      throw new Error('boom');
    });
    subscribePetMode((mode) => seen.push(mode));
    setPetMode('listening', 'test');
    expect(seen).toEqual(['listening']);
  });
});
