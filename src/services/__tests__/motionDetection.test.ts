/**
 * Unit tests for motionDetection.service pure helpers (P1 journey variant).
 * Pure-Node jest — only the exported `_internal` pure functions are tested;
 * detectWalking() itself depends on expo-location runtime.
 */
import { _internal } from '../motionDetection.service';

const { speedToWalking, distanceMeters, WALK_MIN_MPS, WALK_MAX_MPS } = _internal;

describe('motionDetection._internal', () => {
  describe('speedToWalking', () => {
    it('returns null for missing/invalid speed (caller falls back)', () => {
      expect(speedToWalking(null)).toBeNull();
      expect(speedToWalking(undefined)).toBeNull();
      expect(speedToWalking(NaN)).toBeNull();
      expect(speedToWalking(-1)).toBeNull();
    });

    it('classifies a typical walking pace as walking', () => {
      expect(speedToWalking(1.4)).toBe(true); // ~5 km/h
      expect(speedToWalking(WALK_MIN_MPS)).toBe(true);
      expect(speedToWalking(WALK_MAX_MPS)).toBe(true);
    });

    it('rejects standing still and vehicle speeds', () => {
      expect(speedToWalking(0)).toBe(false); // standing
      expect(speedToWalking(0.1)).toBe(false); // jitter
      expect(speedToWalking(8)).toBe(false); // ~29 km/h, driving
    });
  });

  describe('distanceMeters (haversine)', () => {
    it('is ~0 for identical points', () => {
      const p = { latitude: 1.3521, longitude: 103.8198 };
      expect(distanceMeters(p, p)).toBeCloseTo(0, 5);
    });

    it('approximates a known short displacement', () => {
      // ~0.0001 deg latitude ≈ 11.1 m
      const a = { latitude: 1.35210, longitude: 103.8198 };
      const b = { latitude: 1.35220, longitude: 103.8198 };
      const d = distanceMeters(a, b);
      expect(d).toBeGreaterThan(9);
      expect(d).toBeLessThan(13);
    });
  });
});
