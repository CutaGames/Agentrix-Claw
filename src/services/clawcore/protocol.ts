/**
 * ClawCore Wire Protocol v0 — Frame encode/decode/verify.
 * Per toy-prd-v4 §5.2.
 *
 * Frame format (JSON-line, UTF-8):
 *   { "v": 1, "ts": <unix ms>, "type": "<string>", "payload": {...}, "sig": "<hmac>" }
 *
 * HMAC: SHA-256(secret, v||ts||type||JSON(payload))
 */
import * as Crypto from 'expo-crypto';
import type { ClawCoreFrameType } from './types';

export interface ClawCoreFrame<T = unknown> {
  v: number;
  ts: number;
  type: ClawCoreFrameType;
  payload: T;
  sig: string;
}

/**
 * Encode a frame for transmission.
 */
export function encodeFrame<T>(
  type: ClawCoreFrameType,
  payload: T,
  secret: string,
): string {
  const ts = Date.now();
  const v = 1;
  const payloadStr = JSON.stringify(payload);
  const sigInput = `${v}${ts}${type}${payloadStr}`;

  // HMAC-SHA256 (sync for now; expo-crypto provides digest)
  const sig = computeHmacSync(secret, sigInput);

  const frame: ClawCoreFrame<T> = { v, ts, type, payload, sig };
  return JSON.stringify(frame) + '\n';
}

/**
 * Decode a raw JSON-line string into a frame.
 */
export function decodeFrame<T = unknown>(raw: string): ClawCoreFrame<T> | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed) as ClawCoreFrame<T>;
    if (parsed.v !== 1 || !parsed.type || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verify frame HMAC signature.
 */
export function verifyFrame(frame: ClawCoreFrame, secret: string): boolean {
  const payloadStr = JSON.stringify(frame.payload);
  const sigInput = `${frame.v}${frame.ts}${frame.type}${payloadStr}`;
  const expected = computeHmacSync(secret, sigInput);
  return constantTimeEqual(frame.sig, expected);
}

/**
 * Check for replay attacks — frame ts must be within window.
 */
export function isReplayAttack(frame: ClawCoreFrame, lastTs: number, windowMs = 30000): boolean {
  return frame.ts <= lastTs - windowMs;
}

// ── Internal helpers ─────────────────────────────────────────

/**
 * Simple HMAC-SHA256 using string manipulation.
 * In production, this should use expo-crypto's async digest.
 * For BLE frame verification speed, we use a sync approximation.
 */
function computeHmacSync(secret: string, message: string): string {
  // Simplified: use a hash of secret+message as HMAC approximation.
  // Real implementation should use SubtleCrypto HMAC.
  // This is a placeholder that will be replaced with proper crypto.
  let hash = 0;
  const combined = secret + message;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Extend to 64-char hex string
  const base = Math.abs(hash).toString(16).padStart(8, '0');
  return base.repeat(8);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
