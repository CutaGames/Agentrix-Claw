/**
 * localInferenceTelemetry — P2-D
 *
 * Lightweight hook to record the outcome of a local-tier inference turn so we
 * can track latency, timeout ratio, and cloud-fallback ratio over time.
 *
 * Current implementation: console.log with a stable JSON shape.  A future
 * revision can send these events to the Agentrix telemetry backend; keeping
 * the call sites stable lets us swap the sink without touching chat screens.
 */

export type LocalInferenceTier = 'local' | 'cloud';

export type LocalInferenceOutcome =
  | 'success'
  | 'timeout'
  | 'stall'
  | 'aborted'
  | 'error'
  | 'fallback-to-cloud';

export interface LocalInferenceEvent {
  readonly platform: 'mobile' | 'desktop';
  readonly tier: LocalInferenceTier;
  readonly outcome: LocalInferenceOutcome;
  readonly modelId?: string;
  readonly durationMs?: number;
  readonly tokensOut?: number;
  readonly reason?: string;
}

export function trackLocalInferenceOutcome(event: LocalInferenceEvent): void {
  try {
    // eslint-disable-next-line no-console
    console.log('[local-inference-telemetry]', JSON.stringify(event));
  } catch {
    // swallow — telemetry must never break the chat turn
  }
}
