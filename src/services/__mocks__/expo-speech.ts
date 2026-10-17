/**
 * Jest mock for `expo-speech` (ESM in node_modules). `speak` completes
 * synchronously through `onDone` so queue logic can drain without timers.
 */
export interface SpeechOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  voice?: string;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: unknown) => void;
}

const spoken: Array<{ text: string; options?: SpeechOptions }> = [];

export function speak(text: string, options?: SpeechOptions): void {
  spoken.push({ text, options });
  options?.onStart?.();
  options?.onDone?.();
}

export async function stop(): Promise<void> {}
export async function pause(): Promise<void> {}
export async function resume(): Promise<void> {}
export async function isSpeakingAsync(): Promise<boolean> { return false; }
export async function getAvailableVoicesAsync(): Promise<unknown[]> { return []; }

/** Test helper — not part of the real module. */
export function __getSpokenMock(): ReadonlyArray<{ text: string; options?: SpeechOptions }> {
  return spoken;
}

export default { speak, stop, pause, resume, isSpeakingAsync, getAvailableVoicesAsync };
