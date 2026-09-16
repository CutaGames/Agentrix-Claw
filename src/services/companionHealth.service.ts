/**
 * companionHealth — health/movement nudges for the P-9 companion (T22).
 *
 * Phase 1 strategy:
 *   - Lazy require `expo-sensors`'s Pedometer to keep this file pure-Node
 *     test friendly. When the module isn't installed (or permission is
 *     denied), all polled values default to 0 and no nudges fire.
 *   - 15-min poll for cumulative day-step count. State persisted to MMKV
 *     under `pet_companion_daily_steps_<yyyymmdd>` so we don't over-count
 *     across app restarts.
 *   - Sitting heuristic: if app foreground continuously for 60min without
 *     a Pedometer step delta of ≥ 100, fire a sitting nudge. Once-per-hour
 *     cap; Quiet_Hours suppress.
 *   - Step-count milestones: 5000 / 8000 / 10000 — fire `journey` mode +
 *     `voice-greet milestone` once per day per milestone.
 *   - At 18:00 if today's steps < 5000, fire one nudge "今天还差 N 步,
 *     陪我走一会儿?" — once per day.
 *
 * Spec: requirements.md R7.4 / R7.5 / R7.6.
 */
import { mmkv } from '../stores/mmkvStorage';
import { addVoiceDiagnostic } from './voiceDiagnostics';
import { companionEvents } from './companionEvents.service';
import { setCompanionMode } from './petMode';

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const SITTING_INTERVAL_MS = 60 * 60 * 1000;
const STEP_DELTA_FOR_MOVEMENT = 100;
const MILESTONES: number[] = [5000, 8000, 10000];
const LATE_REMINDER_HOUR = 18;

interface DayState {
  totalSteps: number;
  lastSampleAt: number;
  /** Step count at the last sitting check; bumped every 60min if delta < threshold. */
  sittingBaseline: number;
  /** Last hour we fired a sitting nudge. */
  lastSittingNudgeMs: number;
  /** Milestones already announced today. */
  announcedMilestones: number[];
  /** Whether the 18:00 late-reminder fired today. */
  lateReminderFired: boolean;
}

const DEFAULT_DAY_STATE: DayState = {
  totalSteps: 0,
  lastSampleAt: 0,
  sittingBaseline: 0,
  lastSittingNudgeMs: 0,
  announcedMilestones: [],
  lateReminderFired: false,
};

function todayKey(): string {
  const d = new Date();
  return `pet_companion_daily_steps_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function readDayState(): DayState {
  try {
    const raw = mmkv.getString(todayKey());
    if (!raw) return { ...DEFAULT_DAY_STATE };
    return { ...DEFAULT_DAY_STATE, ...(JSON.parse(raw) as Partial<DayState>) };
  } catch {
    return { ...DEFAULT_DAY_STATE };
  }
}

function writeDayState(state: DayState): void {
  try {
    mmkv.set(todayKey(), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function isQuietHours(now = new Date()): boolean {
  const h = now.getHours();
  return h >= 22 || h < 8;
}

async function readPedometerStepCount(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Sensors = require('expo-sensors') as any;
    const Pedometer = Sensors?.Pedometer ?? Sensors?.default?.Pedometer;
    if (!Pedometer?.getStepCountAsync) return 0;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    const res = await Pedometer.getStepCountAsync(start, end);
    return Number(res?.steps) || 0;
  } catch {
    return 0;
  }
}

async function pedometerAvailable(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Sensors = require('expo-sensors') as any;
    const Pedometer = Sensors?.Pedometer ?? Sensors?.default?.Pedometer;
    if (!Pedometer?.isAvailableAsync) return false;
    return !!(await Pedometer.isAvailableAsync());
  } catch {
    return false;
  }
}

interface EvalSummary {
  available: boolean;
  totalSteps: number;
  delta: number;
  milestonesFired: number[];
  sittingNudge: boolean;
  lateReminder: boolean;
}

export async function evaluateOnce(): Promise<EvalSummary> {
  const now = Date.now();
  const ok = await pedometerAvailable();
  if (!ok) {
    addVoiceDiagnostic('companion-health', 'unavailable');
    return { available: false, totalSteps: 0, delta: 0, milestonesFired: [], sittingNudge: false, lateReminder: false };
  }

  const totalSteps = await readPedometerStepCount();
  const state = readDayState();
  const delta = Math.max(0, totalSteps - state.totalSteps);
  state.totalSteps = totalSteps;
  state.lastSampleAt = now;

  const milestonesFired: number[] = [];
  let sittingNudge = false;
  let lateReminder = false;

  if (!isQuietHours()) {
    // Milestones
    for (const ms of MILESTONES) {
      if (totalSteps >= ms && !state.announcedMilestones.includes(ms)) {
        state.announcedMilestones.push(ms);
        milestonesFired.push(ms);
        try {
          setCompanionMode('journey', `health:milestone:${ms}`, { ttlMs: 4000 });
          // P-9 wave 15 (T22.3) — movement-relevant greeting text. Phase 1
          // emits a local greet bypassing /pet/greet so the steps count
          // shows up directly without needing a backend round-trip.
          companionEvents.emit({
            type: 'voice-greet',
            scenario: 'milestone',
            text: ms === 5000
              ? `走了 ${totalSteps} 步啦,真棒!`
              : ms === 8000
                ? `${totalSteps} 步,陪你走了好远~`
                : `破万了!${totalSteps} 步,我都看见了。`,
            lang: 'zh',
          });
        } catch {
          /* ignore */
        }
        addVoiceDiagnostic('companion-health', 'milestone', { ms, totalSteps });
      }
    }

    // Sitting heuristic
    if (state.lastSittingNudgeMs === 0 || now - state.lastSittingNudgeMs >= SITTING_INTERVAL_MS) {
      const sittingDelta = totalSteps - state.sittingBaseline;
      if (state.sittingBaseline > 0 && sittingDelta < STEP_DELTA_FOR_MOVEMENT) {
        // User has been seated/inactive for ~1h
        sittingNudge = true;
        state.lastSittingNudgeMs = now;
        try {
          companionEvents.emit({
            type: 'voice-greet',
            scenario: 'manual',
            text: '久坐啦,起来走 5 分钟?',
            lang: 'zh',
          });
          setCompanionMode('nudge', 'health:sitting', { ttlMs: 4000 });
        } catch {
          /* ignore */
        }
        addVoiceDiagnostic('companion-health', 'sitting-nudge', { sittingDelta });
      }
      state.sittingBaseline = totalSteps;
    }

    // 18:00 late reminder
    const h = new Date().getHours();
    if (h >= LATE_REMINDER_HOUR && !state.lateReminderFired && totalSteps < 5000) {
      lateReminder = true;
      state.lateReminderFired = true;
      try {
        companionEvents.emit({
          type: 'voice-greet',
          scenario: 'manual',
          text: `今天才 ${totalSteps} 步,陪我走会儿?`,
          lang: 'zh',
        });
        setCompanionMode('nudge', 'health:late-reminder', { ttlMs: 4000 });
      } catch {
        /* ignore */
      }
      addVoiceDiagnostic('companion-health', 'late-reminder', { totalSteps });
    }
  }

  writeDayState(state);

  return {
    available: true,
    totalSteps,
    delta,
    milestonesFired,
    sittingNudge,
    lateReminder,
  };
}

/**
 * Boot the periodic health watcher. Returns disposer.
 *
 * Lazily requires AppState so this file stays usable from pure-Node jest.
 */
export function bootCompanionHealthWatcher(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let appStateSub: { remove: () => void } | null = null;

  const tick = () => {
    void evaluateOnce();
  };

  const initial = setTimeout(tick, 3000);
  timer = setInterval(tick, POLL_INTERVAL_MS);

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { AppState } = require('react-native') as typeof import('react-native');
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
  } catch {
    /* non-RN runtime */
  }

  return () => {
    clearTimeout(initial);
    if (timer) clearInterval(timer);
    appStateSub?.remove();
  };
}

/** Return today's step total — used by 今日小结 card (T20.3). */
export function getTodaySteps(): number {
  return readDayState().totalSteps;
}
