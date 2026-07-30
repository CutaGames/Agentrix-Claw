/**
 * voiceGreetScheduler — orchestrates proactive Voice_Greet triggers on
 * mobile (P-9 Companion Redesign T11).
 *
 * Triggers (R3.1, R3.4, R3.5):
 *   - First foreground 07:00-09:00 + first-unlock-of-day → 'morning'
 *   - Last activity in 21:00-22:30 → 'evening'
 *   - presence:pet.proactive { kind:'missed_you' } event from socket
 *     (already bridged in petModeAdapters wave 6) → companionEvents
 *     emits voice-greet directly; no scheduling needed here
 *   - Lv up / steps milestone / task complete → 'milestone'
 *   - Manual triggered via PetDetailSheet "🎙 打招呼" → 'manual'
 *
 * Daily quota (default 3, configurable in T20 Companion_Settings) is
 * tracked in MMKV under `pet_voice_greet_count_<yyyymmdd>`. Only
 * `manual` bypasses the quota (the user is asking for it explicitly).
 *
 * Quiet_Hours (default 22:00-08:00) suppresses everything except 'manual'.
 *
 * Public API:
 *   - bootVoiceGreetScheduler() — call once after authenticated boot;
 *     returns disposer
 *   - triggerVoiceGreet(scenario) — imperative, used by PetDetailSheet
 *
 * Spec: requirements.md R3.1 / R3.4 / R3.5 / R10.10.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { mmkv } from '../stores/mmkvStorage';
import { fetchPetGreet, type GreetScenario } from './petGreet.api';
import { companionEvents } from './companionEvents.service';
import { addVoiceDiagnostic } from './voiceDiagnostics';

const DAILY_DEFAULT_MAX = 3;
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;
const MORNING_START_HOUR = 7;
const MORNING_END_HOUR = 9;
const EVENING_START_HOUR = 21;
const EVENING_END_HOUR_EXCLUSIVE = 23; // 22:30 ≈ 22 hour bucket, allow 22 inclusive

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `pet_voice_greet_count_${y}${m}${day}`;
}

function lastSeenKey(scenario: GreetScenario): string {
  return `pet_voice_greet_last_${scenario}`;
}

function readCount(): number {
  try {
    const raw = mmkv.getString(todayKey());
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function bumpCount(): void {
  try {
    mmkv.set(todayKey(), String(readCount() + 1));
  } catch {
    /* ignore */
  }
}

function readLastSeen(scenario: GreetScenario): number {
  try {
    const raw = mmkv.getString(lastSeenKey(scenario));
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function bumpLastSeen(scenario: GreetScenario): void {
  try {
    mmkv.set(lastSeenKey(scenario), String(Date.now()));
  } catch {
    /* ignore */
  }
}

function isQuietHours(now = new Date()): boolean {
  const h = now.getHours();
  // 22:00 ≤ h < 24, OR 0 ≤ h < 8
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

function isMorningWindow(now = new Date()): boolean {
  const h = now.getHours();
  return h >= MORNING_START_HOUR && h < MORNING_END_HOUR;
}

function isEveningWindow(now = new Date()): boolean {
  const h = now.getHours();
  return h >= EVENING_START_HOUR && h < EVENING_END_HOUR_EXCLUSIVE;
}

interface GreetGuardOptions {
  /** Ignore quiet hours (manual triggers + override). */
  bypassQuietHours?: boolean;
  /** Ignore daily quota (manual). */
  bypassQuota?: boolean;
  /** Minimum seconds since the last greet of the same scenario. */
  minIntervalSec?: number;
}

function passesGuards(scenario: GreetScenario, opts: GreetGuardOptions): boolean {
  if (!opts.bypassQuietHours && isQuietHours()) return false;
  if (!opts.bypassQuota && readCount() >= DAILY_DEFAULT_MAX) return false;
  if (opts.minIntervalSec) {
    const last = readLastSeen(scenario);
    if (last && Date.now() - last < opts.minIntervalSec * 1000) return false;
  }
  return true;
}

/**
 * Imperative entry point — fires a Voice_Greet for a scenario after
 * passing guards (quiet hours / quota / debounce). Returns true on
 * success.
 */
export async function triggerVoiceGreet(
  scenario: GreetScenario,
  options: GreetGuardOptions = {},
): Promise<boolean> {
  const isManual = scenario === 'manual';
  const guards: GreetGuardOptions = {
    bypassQuietHours: options.bypassQuietHours ?? isManual,
    bypassQuota: options.bypassQuota ?? isManual,
    minIntervalSec: options.minIntervalSec ?? (isManual ? 5 : 30 * 60),
  };
  if (!passesGuards(scenario, guards)) {
    addVoiceDiagnostic('voice-greet-scheduler', 'guarded', { scenario });
    return false;
  }

  // P-9 wave 15 — honor per-scenario opt-out from CompanionSettings
  // voiceGreet prefs. Manual scenario always passes (user just tapped).
  if (scenario !== 'manual') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const { getVoiceGreetPrefs } = require('../stores/petCompanionSettings') as typeof import('../stores/petCompanionSettings');
      const prefs = getVoiceGreetPrefs();
      if (!prefs.enabled) {
        addVoiceDiagnostic('voice-greet-scheduler', 'feature-disabled', { scenario });
        return false;
      }
      const allowedScenarios = prefs.scenarios as Record<string, boolean>;
      if (allowedScenarios[scenario] === false) {
        addVoiceDiagnostic('voice-greet-scheduler', 'scenario-disabled', { scenario });
        return false;
      }
      // Also honor user-tuned dailyMax (override the default 3).
      if (prefs.dailyMax !== undefined && readCount() >= prefs.dailyMax) {
        addVoiceDiagnostic('voice-greet-scheduler', 'daily-max-reached', {
          scenario,
          dailyMax: prefs.dailyMax,
        });
        return false;
      }
    } catch {
      /* ignore — fall through to default behavior */
    }
  }

  try {
    const greet = await fetchPetGreet(scenario, 'zh');
    if (!greet?.text) {
      addVoiceDiagnostic('voice-greet-scheduler', 'empty-text', { scenario });
      return false;
    }
    companionEvents.emit({
      type: 'voice-greet',
      scenario,
      text: greet.text,
      ttsUrl: greet.ttsUrl ?? null,
      lang: greet.lang,
    });
    if (!isManual) bumpCount();
    bumpLastSeen(scenario);
    addVoiceDiagnostic('voice-greet-scheduler', 'fired', {
      scenario,
      source: greet.source,
    });
    return true;
  } catch (err) {
    addVoiceDiagnostic('voice-greet-scheduler', 'fetch-failed', {
      scenario,
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Boot the scheduler. Hooks AppState to fire 'morning' / 'evening' /
 * 'comeback' (when going active after backgrounded > 6h) at appropriate
 * windows. Returns a disposer.
 */
export function bootVoiceGreetScheduler(): () => void {
  let lastBackgroundedAt: number | null = null;

  const evaluateForeground = () => {
    const now = new Date();

    // Comeback — was backgrounded > 6h
    if (
      lastBackgroundedAt !== null &&
      Date.now() - lastBackgroundedAt > 6 * 60 * 60 * 1000
    ) {
      void triggerVoiceGreet('comeback');
      lastBackgroundedAt = null;
      return;
    }

    if (isMorningWindow(now)) {
      // Only once per day for morning (debounced via lastSeen >= 8h)
      void triggerVoiceGreet('morning', { minIntervalSec: 8 * 3600 });
      return;
    }
    if (isEveningWindow(now)) {
      void triggerVoiceGreet('evening', { minIntervalSec: 8 * 3600 });
      return;
    }
  };

  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      evaluateForeground();
    } else if (state === 'background' || state === 'inactive') {
      lastBackgroundedAt = Date.now();
    }
  });

  // Evaluate once on boot in case the app was started in the morning window.
  setTimeout(() => evaluateForeground(), 1500);

  return () => {
    try {
      sub.remove();
    } catch {
      /* ignore */
    }
  };
}
