/**
 * formVariant — orchestrates the 4 ambient pet variants (default / work /
 * night / journey) per design.md §Components/Core 2 + R7.
 *
 * Phase 1 strategy (T11):
 *   - Pure deterministic resolver `resolveCurrentVariant(ctx)` for testability.
 *   - `bootFormVariantWatcher()` polls every 15min and emits
 *     `companionEvents.emit('mode-changed', ...)` when the variant changes.
 *   - Calendar / health detection are best-effort: when the modules are
 *     not installed (Phase 1 doesn't ship `expo-calendar` / `expo-health`),
 *     the resolver gracefully falls back to the manual + Quiet_Hours
 *     paths.
 *   - Manual lock from CompanionSettings (T20) overrides everything for
 *     up to `manualLockUntilMs`.
 *
 * Spec: requirements.md R6.1-R6.10 + R7.1-R7.6, design.md §Components/Core 2.
 */
import { companionEvents } from './companionEvents.service';
import { setCompanionMode, getCompanionMode } from './petMode';
import { addVoiceDiagnostic } from './voiceDiagnostics';

export type FormVariant = 'default' | 'work' | 'night' | 'journey';

export interface FormVariantContext {
  manualLockedUntilMs?: number;
  manualVariant?: FormVariant;
  isInQuietHours?: boolean;
  isInCalendarMeeting?: boolean;
  isWalking?: boolean;
}

/**
 * Pure decision — priority order:
 *   manual lock > Quiet_Hours > calendar meeting > walking > default
 *
 * Exported for tests; production calls go through `resolveAndApply`.
 */
export function resolveCurrentVariant(ctx: FormVariantContext): FormVariant {
  if (
    ctx.manualLockedUntilMs &&
    Date.now() < ctx.manualLockedUntilMs &&
    ctx.manualVariant
  ) {
    return ctx.manualVariant;
  }
  if (ctx.isInQuietHours) return 'night';
  if (ctx.isInCalendarMeeting) return 'work';
  if (ctx.isWalking) return 'journey';
  return 'default';
}

// ─── Persisted manual lock state ────────────────────────────────────────

const STORAGE_KEY = 'form_variant/v1';

interface PersistedState {
  manualVariant?: FormVariant;
  manualLockedUntilMs?: number;
}

let _storage: { getString(k: string): string | undefined; set(k: string, v: string): void } = {
  getString: () => undefined,
  set: () => undefined,
};
let _storageBound = false;

function getStorage() {
  if (_storageBound) return _storage;
  try {
    // Lazy require so jest never tries to load react-native-mmkv.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('../stores/mmkvStorage') as typeof import('../stores/mmkvStorage');
    _storage = mod.mmkv as unknown as typeof _storage;
  } catch {
    /* keep no-op */
  }
  _storageBound = true;
  return _storage;
}

export function getPersistedFormVariant(): PersistedState {
  try {
    const raw = getStorage().getString(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

export function setManualLock(variant: FormVariant, hours: number): void {
  const next: PersistedState = {
    manualVariant: variant,
    manualLockedUntilMs: Date.now() + hours * 3600 * 1000,
  };
  try {
    getStorage().set(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  addVoiceDiagnostic('form-variant', 'manual-lock', { variant, hours });
}

export function clearManualLock(): void {
  try {
    getStorage().set(STORAGE_KEY, JSON.stringify({}));
  } catch {
    /* ignore */
  }
  addVoiceDiagnostic('form-variant', 'manual-clear');
}

// ─── Detection helpers ──────────────────────────────────────────────────

const QUIET_DEFAULT_START = 22; // 22:00
const QUIET_DEFAULT_END = 8; // 08:00

function isInQuietHours(now = new Date()): boolean {
  const h = now.getHours();
  return h >= QUIET_DEFAULT_START || h < QUIET_DEFAULT_END;
}

async function isInCalendarMeeting(): Promise<boolean> {
  // Best-effort: lazy-require expo-calendar. The package isn't bundled yet
  // (lands in a future EAS rebuild); until then this resolves false and the
  // resolver falls back to the walking / default paths. Once the native dep
  // is present this activates automatically with no further code change.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Calendar = require('expo-calendar') as any;
    if (!Calendar?.getCalendarsAsync || !Calendar?.getEventsAsync) return false;
    const perm = await Calendar.getCalendarPermissionsAsync?.();
    if (perm && !perm.granted) return false;
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes?.EVENT);
    if (!Array.isArray(cals) || cals.length === 0) return false;
    const now = new Date();
    const soon = new Date(now.getTime() + 5 * 60 * 1000); // next 5 min window
    const events = await Calendar.getEventsAsync(
      cals.map((c: any) => c.id),
      now,
      soon,
    );
    // "In a meeting" = an event is happening right now (started, not ended).
    return (Array.isArray(events) ? events : []).some((e: any) => {
      const start = new Date(e.startDate).getTime();
      const end = new Date(e.endDate).getTime();
      return start <= now.getTime() && end > now.getTime() && !e.allDay;
    });
  } catch {
    return false;
  }
}

async function isWalking(): Promise<boolean> {
  // P1: real detection via expo-location (already a dependency), replacing
  // the old hardcoded `false`. Best-effort + silent — never prompts for
  // permission here, only reads when foreground permission already granted.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { detectWalking } = require('./motionDetection.service') as typeof import('./motionDetection.service');
    return await detectWalking();
  } catch {
    return false;
  }
}

// ─── Boot — 15 min poll + key event triggers ─────────────────────────────

const POLL_INTERVAL_MS = 15 * 60 * 1000;

async function gatherContext(): Promise<FormVariantContext> {
  const persisted = getPersistedFormVariant();
  const [meeting, walking] = await Promise.all([
    isInCalendarMeeting().catch(() => false),
    isWalking().catch(() => false),
  ]);
  return {
    manualLockedUntilMs: persisted.manualLockedUntilMs,
    manualVariant: persisted.manualVariant,
    isInQuietHours: isInQuietHours(),
    isInCalendarMeeting: meeting,
    isWalking: walking,
  };
}

const VARIANT_TO_MODE: Record<FormVariant, 'companion' | 'working' | 'slumber' | 'journey'> = {
  default: 'companion',
  work: 'working',
  night: 'slumber',
  journey: 'journey',
};

let _lastVariant: FormVariant | null = null;

export async function evaluateAndApply(): Promise<FormVariant> {
  const ctx = await gatherContext();
  const next = resolveCurrentVariant(ctx);
  if (next === _lastVariant) return next;

  const cur = getCompanionMode();
  const nextMode = VARIANT_TO_MODE[next];
  // Variants are an ambient layer; only override low-priority modes
  // (companion / working / slumber / journey). Don't clobber signing /
  // nudge / whisper which are explicit intent.
  const preserveModes = new Set(['signing', 'nudge', 'whisper']);
  if (!preserveModes.has(cur)) {
    setCompanionMode(nextMode, `form-variant:${next}`);
  }
  _lastVariant = next;
  companionEvents.emit({
    type: 'mode-changed',
    from: cur,
    to: nextMode,
    source: `form-variant:${next}`,
  });
  addVoiceDiagnostic('form-variant', 'evaluated', { next, ctxAtTrigger: ctx });
  return next;
}

export function bootFormVariantWatcher(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let appStateSub: { remove: () => void } | null = null;

  const scheduleEvaluate = () => {
    void evaluateAndApply();
  };

  // Initial evaluate after 1.5s so the rest of boot can settle.
  const initial = setTimeout(scheduleEvaluate, 1500);

  // Periodic poll
  timer = setInterval(scheduleEvaluate, POLL_INTERVAL_MS);

  // Re-evaluate on app foreground (lazy-require react-native so this
  // file stays importable from pure-Node jest tests).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { AppState } = require('react-native') as typeof import('react-native');
    appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleEvaluate();
    });
  } catch {
    /* ignore — non-RN runtime */
  }

  return () => {
    clearTimeout(initial);
    if (timer) clearInterval(timer);
    appStateSub?.remove();
    _lastVariant = null;
  };
}
