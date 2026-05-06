/**
 * Anti-snipe auction extension — Phase 3 W1 BE-T3.9.
 *
 * Pure function: given the current auction end time and the time of a new bid,
 * returns the (possibly extended) end time per anti-snipe policy.
 *
 * Policy v1:
 *  - If the bid arrives within `windowMs` of `currentEndsAt`, push end out by
 *    `extensionMs`.
 *  - Hard cap at `maxEndsAt` (typically `originalEndsAt + maxExtensionMs`)
 *    to prevent infinite extensions.
 *  - Bids outside the trigger window do NOT modify the end time.
 *
 * Defaults: 60s trigger window, +120s extension, 24h max total extension.
 */

export interface AntiSnipeInput {
  currentEndsAt: Date;
  bidAt: Date;
  /** Original (unextended) auction end. Used as the anchor for the max-extension cap. */
  originalEndsAt: Date;
  triggerWindowMs?: number;
  extensionMs?: number;
  maxTotalExtensionMs?: number;
}

export interface AntiSnipeResult {
  newEndsAt: Date;
  extended: boolean;
  /** True when the bid would have triggered an extension but max was reached. */
  cappedAtMax: boolean;
}

const DEFAULT_TRIGGER_WINDOW_MS = 60_000;       // 1 minute
const DEFAULT_EXTENSION_MS = 120_000;            // 2 minutes
const DEFAULT_MAX_TOTAL_EXTENSION_MS = 86_400_000; // 24 hours

export function applyAntiSnipe(input: AntiSnipeInput): AntiSnipeResult {
  const triggerWindowMs = input.triggerWindowMs ?? DEFAULT_TRIGGER_WINDOW_MS;
  const extensionMs = input.extensionMs ?? DEFAULT_EXTENSION_MS;
  const maxTotalExtensionMs = input.maxTotalExtensionMs ?? DEFAULT_MAX_TOTAL_EXTENSION_MS;

  const currentEndsMs = input.currentEndsAt.getTime();
  const bidMs = input.bidAt.getTime();
  const remainingMs = currentEndsMs - bidMs;

  // Bid arrived too late (after auction already ended) → no-op.
  if (remainingMs < 0) {
    return { newEndsAt: input.currentEndsAt, extended: false, cappedAtMax: false };
  }

  // Outside the trigger window → no extension.
  if (remainingMs > triggerWindowMs) {
    return { newEndsAt: input.currentEndsAt, extended: false, cappedAtMax: false };
  }

  const proposed = currentEndsMs + extensionMs;
  const maxAllowed = input.originalEndsAt.getTime() + maxTotalExtensionMs;

  if (proposed >= maxAllowed) {
    return {
      newEndsAt: new Date(maxAllowed),
      extended: maxAllowed > currentEndsMs,
      cappedAtMax: true,
    };
  }

  return { newEndsAt: new Date(proposed), extended: true, cappedAtMax: false };
}
