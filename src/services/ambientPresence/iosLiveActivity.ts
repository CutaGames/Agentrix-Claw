/**
 * iosLiveActivity — JS bridge to the native PetCompanionActivity Swift
 * extension that surfaces the active pet on iOS lock screen / Dynamic
 * Island (P-9 Companion Redesign T12).
 *
 * Phase 1 strategy:
 *   - Native ActivityKit extension (`PetCompanionActivity.swift`) lands
 *     in the next EAS rebuild — requires bare-workflow native target
 *     creation in Xcode (T12.1). Phase 1 ships this JS layer with
 *     graceful no-op when the native module isn't yet bundled, so the
 *     code path is exercised without blocking on Xcode.
 *   - 12h auto-recycle (Apple cap is 12h max for Live Activities) via
 *     setTimeout that ends + restarts.
 *   - Activity state derived from CompanionMode per the R4.4 spec table.
 *
 * Public API:
 *   - isAvailable()                            → boolean
 *   - startPetLiveActivity(state)              → Promise<id|null>
 *   - updatePetLiveActivity(id, state)
 *   - endPetLiveActivity(id)
 *   - bootIosLiveActivityLifecycle(opts)       — AppState background → start
 *
 * Spec: requirements.md R1.6 / R4.2 / R4.4 / R4.5.
 */
import { AppState, NativeModules, Platform, type AppStateStatus } from 'react-native';
import type { CompanionMode } from '../petMode';
import { addVoiceDiagnostic } from '../voiceDiagnostics';

interface PetCompanionActivityNativeModule {
  isAvailable: () => Promise<boolean>;
  start: (state: SerializedActivityState) => Promise<string>;
  update: (id: string, state: SerializedActivityState) => Promise<void>;
  end: (id: string) => Promise<void>;
}

export interface ActivityState {
  mode: CompanionMode;
  petName: string;
  caption: string;
  walletDeltaText?: string | null;
  approvalCount?: number;
}

interface SerializedActivityState {
  mode: CompanionMode;
  pet_name: string;
  caption: string;
  wallet_delta_text: string | null;
  approval_count: number;
}

const MAX_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12h Apple cap

const MODE_TEXT: Record<CompanionMode, string> = {
  companion: '陪你在线',
  vigil: '在等你呢',
  journey: '和你一起走',
  whisper: '想说点什么',
  slumber: '今晚乖, Zzz',
  nudge: '有事找你',
  signing: '等你确认签名',
  working: '工作中,稍后再聊',
};

function getNativeModule(): PetCompanionActivityNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  const mod = (NativeModules as any).PetCompanionActivity
    ?? (NativeModules as any).IosLiveActivity
    ?? null;
  return mod as PetCompanionActivityNativeModule | null;
}

export function isIosLiveActivityAvailable(): boolean {
  return getNativeModule() !== null;
}

export function captionForMode(mode: CompanionMode): string {
  return MODE_TEXT[mode] ?? MODE_TEXT.companion;
}

function serialize(state: ActivityState): SerializedActivityState {
  return {
    mode: state.mode,
    pet_name: state.petName,
    caption: state.caption,
    wallet_delta_text: state.walletDeltaText ?? null,
    approval_count: state.approvalCount ?? 0,
  };
}

let _activityId: string | null = null;
let _recycleTimer: ReturnType<typeof setTimeout> | null = null;

export async function startPetLiveActivity(state: ActivityState): Promise<string | null> {
  const mod = getNativeModule();
  if (!mod) return null;
  if (_activityId) {
    // Already running — update in place instead of double-starting.
    await updatePetLiveActivity(_activityId, state);
    return _activityId;
  }
  try {
    const id = await mod.start(serialize(state));
    _activityId = id;
    addVoiceDiagnostic('ios-live-activity', 'started', { mode: state.mode });

    if (_recycleTimer) clearTimeout(_recycleTimer);
    _recycleTimer = setTimeout(() => {
      void recyclePetLiveActivity(state);
    }, MAX_LIFETIME_MS - 60_000); // recycle 1 min before cap

    return id;
  } catch (err) {
    addVoiceDiagnostic('ios-live-activity', 'start-failed', {
      error: (err as Error).message,
    });
    return null;
  }
}

async function recyclePetLiveActivity(state: ActivityState): Promise<void> {
  if (!_activityId) return;
  await endPetLiveActivity(_activityId);
  await startPetLiveActivity(state);
}

export async function updatePetLiveActivity(id: string, state: ActivityState): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    await mod.update(id, serialize(state));
  } catch (err) {
    addVoiceDiagnostic('ios-live-activity', 'update-failed', {
      error: (err as Error).message,
    });
  }
}

export async function endPetLiveActivity(id?: string): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  const target = id ?? _activityId;
  if (!target) return;
  try {
    await mod.end(target);
    addVoiceDiagnostic('ios-live-activity', 'ended');
  } catch {
    /* ignore */
  } finally {
    _activityId = null;
    if (_recycleTimer) {
      clearTimeout(_recycleTimer);
      _recycleTimer = null;
    }
  }
}

/**
 * AppState background → start Live Activity (so user sees the pet on
 * lock screen / Dynamic Island when out of app). Foreground keeps it
 * running too (provides background → foreground signal); only end on
 * explicit setting toggle or 12h cap.
 *
 * Caller passes getters because the activity needs fresh state at
 * the moment we start/update.
 */
export interface BootIosLiveActivityOpts {
  getMode: () => CompanionMode;
  getPetName: () => string;
  isEnabled: () => boolean;
}

export function bootIosLiveActivityLifecycle(opts: BootIosLiveActivityOpts): () => void {
  if (!isIosLiveActivityAvailable()) return () => undefined;

  const stateOf = (): ActivityState => {
    const mode = opts.getMode();
    return {
      mode,
      petName: opts.getPetName(),
      caption: captionForMode(mode),
    };
  };

  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (!opts.isEnabled()) return;
    if (state === 'background' || state === 'inactive') {
      void startPetLiveActivity(stateOf());
    }
    // Don't auto-end on 'active' — Live Activity continues to surface
    // the pet on Dynamic Island while the app is foreground too.
  });

  // Start immediately if currently active — the user just enabled the toggle
  // and we want them to see the pet on lock screen right away.
  if (AppState.currentState === 'active' && opts.isEnabled()) {
    void startPetLiveActivity(stateOf());
  }

  return () => {
    try {
      sub.remove();
    } catch {
      /* ignore */
    }
    void endPetLiveActivity();
  };
}
