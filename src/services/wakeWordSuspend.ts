/**
 * wakeWordSuspend — module-scope coordination hook for R9.11 wake-word
 * conflict resolution (P-9 wave 11 T17.1).
 *
 * When the user triggers a system assistant (Hey Siri / 小爱同学 / etc),
 * native code surfaces an event that calls `suspendSelfWakeWord(durationMs)`
 * here. Active SpeechWakeWord listeners read `isWakeWordSuspended()` on
 * each detection event and skip dispatch until the timer expires.
 *
 * Phase 1:
 *   - Pure JS module — no native code yet (Phase 2 wires iOS/Android
 *     system-wake detection that calls suspendSelfWakeWord(8000)).
 *   - Manual via `Companion_Settings → 完全靠系统助手` — sets
 *     `useSettingsStore.wakeWordConfig.enabled = false` instead of
 *     suspend (permanent disable, not transient).
 *
 * Spec: requirements.md R9.11.
 */
import { addVoiceDiagnostic } from './voiceDiagnostics';

let _suspendUntilMs = 0;

export function suspendSelfWakeWord(durationMs: number, source = 'system-assistant'): void {
  const until = Date.now() + Math.max(0, durationMs);
  if (until > _suspendUntilMs) {
    _suspendUntilMs = until;
    addVoiceDiagnostic('wake-word-suspend', source, { durationMs });
  }
}

export function isWakeWordSuspended(): boolean {
  return _suspendUntilMs > Date.now();
}

export function clearWakeWordSuspend(): void {
  _suspendUntilMs = 0;
}

export function getWakeWordSuspendRemainingMs(): number {
  return Math.max(0, _suspendUntilMs - Date.now());
}
