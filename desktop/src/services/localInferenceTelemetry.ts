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
