/**
 * What the app does with the Android background wake-word service when the setting or the app state
 * changes (Claw build 536, REQ-mobile-086 follow-up).
 *
 * Android does not let an app create a foreground service that needs the microphone while the app is in the
 * background, whatever other exemption it has
 * (https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start). 1.3.0 started
 * the service only when the app went to the back, so on Android 14+ it stood down with
 * "Starting FGS with type microphone" and background wake-word never ran. Now:
 * - app in front, setting on: tell the service the app is in front (no listening, no ball), then start it;
 * - app went to the back, setting on: tell the running service to listen; only when none is running, try
 *   starting it (older Android still allows that; Android 14+ refuses and the service stands down);
 * - setting off: stop.
 * A native module without `setAppForeground` (older binary) keeps the 1.3.0 behaviour.
 *
 * No React Native import here, so the plan is testable in plain jest.
 */
export type BackgroundWakeWordStepV1 = 'front' | 'back' | 'sync' | 'start' | 'start_if_idle' | 'stop';

export function planBackgroundWakeWord(input: { enabled: boolean; appActive: boolean; foregroundSignal: boolean }): BackgroundWakeWordStepV1[] {
  if (!input.foregroundSignal) {
    // 1.3.0: the service never runs while the app is in front.
    return input.enabled && !input.appActive ? ['sync', 'start'] : ['sync', 'stop'];
  }
  const where: BackgroundWakeWordStepV1 = input.appActive ? 'front' : 'back';
  if (!input.enabled) return [where, 'sync', 'stop'];
  return input.appActive ? ['front', 'sync', 'start'] : ['back', 'sync', 'start_if_idle'];
}

export interface BackgroundWakeWordNativeV1 {
  syncConfig(configJson: string): Promise<unknown>;
  startService(): Promise<unknown>;
  stopService(): Promise<unknown>;
  /** Resolves whether a service is running. Missing on binaries before this change. */
  setAppForeground?: (foreground: boolean) => Promise<boolean>;
}

/** Runs the steps in order; a failing step does not skip the rest (the first error is thrown at the end). */
export async function runBackgroundWakeWordPlan(steps: BackgroundWakeWordStepV1[], native: BackgroundWakeWordNativeV1, configJson: string): Promise<void> {
  let running = false;
  let firstError: unknown;
  let failed = false;
  for (const step of steps) {
    try {
      if (step === 'front' || step === 'back') {
        running = native.setAppForeground ? (await native.setAppForeground(step === 'front')) === true : false;
      } else if (step === 'sync') {
        await native.syncConfig(configJson);
      } else if (step === 'start' || (step === 'start_if_idle' && !running)) {
        await native.startService();
      } else if (step === 'stop') {
        await native.stopService();
      }
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }
  if (failed) throw firstError;
}
