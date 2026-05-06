import { describe, it, expect } from 'vitest';
import {
  PET_EMOTIONS,
  RIVE_EMOTION_TRIGGERS,
  TRIGGER_TO_EMOTION,
  emotionTrigger,
  RIVE_STATE_MACHINE_NAME,
  RIVE_EMOTION_TRANSITION_BUDGET_MS,
} from '../services/riveEmotionMap';

describe('riveEmotionMap (RD-T2.1)', () => {
  it('declares exactly 10 emotions matching the P0-2 baseline', () => {
    expect(PET_EMOTIONS).toHaveLength(10);
    expect([...PET_EMOTIONS].sort()).toEqual([
      'angry', 'curious', 'embarrassed', 'excited', 'happy',
      'loving', 'neutral', 'sad', 'sleepy', 'surprised',
    ]);
  });

  it('every emotion has a unique camelCase trigger', () => {
    const triggers = Object.values(RIVE_EMOTION_TRIGGERS);
    expect(triggers).toHaveLength(10);
    expect(new Set(triggers).size).toBe(10);
    for (const t of triggers) {
      expect(t).toMatch(/^to[A-Z][a-zA-Z]+$/);
    }
  });

  it('1:1 mapping between emotion and trigger (no orphans)', () => {
    for (const e of PET_EMOTIONS) {
      const trigger = RIVE_EMOTION_TRIGGERS[e];
      expect(trigger).toBeTruthy();
      expect(TRIGGER_TO_EMOTION[trigger]).toBe(e);
    }
  });

  it('exports the canonical state machine name "PetSM"', () => {
    expect(RIVE_STATE_MACHINE_NAME).toBe('PetSM');
  });

  it('emotionTrigger() returns the right trigger for known emotions', () => {
    expect(emotionTrigger('happy')).toBe('toHappy');
    expect(emotionTrigger('embarrassed')).toBe('toEmbarrassed');
    expect(emotionTrigger('loving')).toBe('toLoving');
  });

  it('emotionTrigger() falls back to neutral for unknown / nullish input (forward-compat)', () => {
    expect(emotionTrigger(null)).toBe('toNeutral');
    expect(emotionTrigger(undefined)).toBe('toNeutral');
    expect(emotionTrigger('' as any)).toBe('toNeutral');
    expect(emotionTrigger('rage_v2_unknown')).toBe('toNeutral');
  });

  it('publishes a 200ms transition budget aligned with RD-T2.2/2.3/2.4', () => {
    expect(RIVE_EMOTION_TRANSITION_BUDGET_MS).toBe(200);
  });
});
