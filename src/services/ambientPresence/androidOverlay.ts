/**
 * androidOverlay — JS bridge to the native CompanionOverlayModule
 * (Android SYSTEM_ALERT_WINDOW companion ball that renders OUTSIDE
 * the app, on top of WeChat / Douyin / launcher).
 *
 * P-9 Companion Redesign T13 strategy:
 *   - Audit (T0.4) found `AndroidBackgroundWakeWordService.kt` already
 *     ships a complete TYPE_APPLICATION_OVERLAY service with ball UI +
 *     drag handlers. Rather than rebuild from scratch, we wire a thin
 *     JS bridge to (a) start/stop a similar overlay specifically for
 *     companion presence, (b) pass current CompanionMode → emoji + text,
 *     (c) handle deep-link callbacks from native taps.
 *   - Phase 1 ships the JS layer + handler wiring; the native module
 *     extension to add `CompanionOverlayModule.kt` will land in the
 *     next EAS rebuild (requires bare-workflow native code change).
 *
 * Public API (all no-ops on iOS / when native module unavailable):
 *   - hasOverlayPermission() → Promise<boolean>
 *   - requestOverlayPermission() → Promise<boolean>
 *   - startSystemOverlay(state)
 *   - updateSystemOverlay(state)
 *   - stopSystemOverlay()
 *   - attachOverlayDeepLinks(navigationRef) — wires `agentrix://companion-tap`
 *     and `agentrix://companion-longpress` to ConversationBubble / PetDetailSheet
 *
 * Spec: requirements.md R1.5, design.md §Ambient Presence (Android).
 */
import { Platform, NativeModules, Linking, AppState, type AppStateStatus } from 'react-native';
import type { CompanionMode } from '../petMode';
import { companionSheets } from '../../components/companion/sheetRefRegistry';
import { addVoiceDiagnostic } from '../voiceDiagnostics';

interface CompanionOverlayNativeModule {
  hasPermission: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
  start: (state: SerializedOverlayState) => Promise<void>;
  update: (state: SerializedOverlayState) => Promise<void>;
  stop: () => Promise<void>;
}

interface SerializedOverlayState {
  mode: CompanionMode;
  petName: string;
  caption: string;
  emoji: string;
}

function getNativeModule(): CompanionOverlayNativeModule | null {
  if (Platform.OS !== 'android') return null;
  const mod = (NativeModules as any).CompanionOverlayModule
    ?? (NativeModules as any).AndroidCompanionOverlay
    ?? null;
  return mod as CompanionOverlayNativeModule | null;
}

/** Fast capability check — used by Companion_Settings to gate the toggle. */
export function isAndroidSystemOverlayAvailable(): boolean {
  return getNativeModule() !== null;
}

export async function hasOverlayPermission(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.hasPermission();
  } catch (err) {
    addVoiceDiagnostic('android-overlay', 'has-permission-failed', {
      error: (err as Error).message,
    });
    return false;
  }
}

export async function requestOverlayPermission(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.requestPermission();
  } catch (err) {
    addVoiceDiagnostic('android-overlay', 'request-permission-failed', {
      error: (err as Error).message,
    });
    return false;
  }
}

const MODE_PRESENTATION: Record<CompanionMode, { emoji: string; caption: string }> = {
  companion: { emoji: '🐾', caption: '陪你在线' },
  vigil: { emoji: '😌', caption: '在等你呢' },
  journey: { emoji: '🚶', caption: '和你一起走' },
  whisper: { emoji: '💬', caption: '想说点什么' },
  slumber: { emoji: '😴', caption: '今晚乖, Zzz' },
  nudge: { emoji: '🚨', caption: '有事找你' },
  signing: { emoji: '🔐', caption: '等你确认签名' },
  working: { emoji: '🛠', caption: '工作中' },
};

function buildState(mode: CompanionMode, petName: string): SerializedOverlayState {
  const p = MODE_PRESENTATION[mode] ?? MODE_PRESENTATION.companion;
  return { mode, petName, emoji: p.emoji, caption: p.caption };
}

export async function startSystemOverlay(mode: CompanionMode, petName: string): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    await mod.start(buildState(mode, petName));
    addVoiceDiagnostic('android-overlay', 'started', { mode });
  } catch (err) {
    addVoiceDiagnostic('android-overlay', 'start-failed', {
      error: (err as Error).message,
    });
  }
}

export async function updateSystemOverlay(mode: CompanionMode, petName: string): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    await mod.update(buildState(mode, petName));
  } catch {
    /* ignore — update is best-effort */
  }
}

export async function stopSystemOverlay(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    await mod.stop();
    addVoiceDiagnostic('android-overlay', 'stopped');
  } catch {
    /* ignore */
  }
}

/**
 * Wire deep-link callbacks from the native overlay UI.
 *
 *   `agentrix://companion-tap`         → open ConversationBubble
 *   `agentrix://companion-longpress`   → open PetDetailSheet
 *
 * Native overlay calls Linking.openURL with these URLs when the user
 * taps / long-presses the overlay. Wave 6 ships the JS handler; native
 * UI emits these in the next EAS rebuild.
 *
 * Returns disposer.
 */
export function attachOverlayDeepLinks(): () => void {
  const sub = Linking.addEventListener('url', (evt) => {
    const url = evt.url || '';
    if (url.startsWith('agentrix://companion-tap')) {
      addVoiceDiagnostic('android-overlay', 'deep-link-tap');
      companionSheets.conversation.present({ autoActivateVoice: true });
      return;
    }
    if (url.startsWith('agentrix://companion-longpress')) {
      addVoiceDiagnostic('android-overlay', 'deep-link-longpress');
      companionSheets.petDetail.present();
      return;
    }
  });
  return () => {
    try {
      sub.remove();
    } catch {
      /* ignore */
    }
  };
}

/**
 * Boot the AppState ↔ overlay lifecycle bridge.
 * Backgrounded + permission granted + setting enabled → start overlay.
 * Foregrounded → stop overlay (RN ball takes over).
 *
 * Caller passes a getter for the current mode + petName so we always
 * push fresh state at start/update.
 */
export interface BootAndroidOverlayOpts {
  getMode: () => CompanionMode;
  getPetName: () => string;
  isEnabled: () => boolean;
}

export function bootAndroidOverlayLifecycle(opts: BootAndroidOverlayOpts): () => void {
  if (!isAndroidSystemOverlayAvailable()) return () => undefined;

  const detachLinks = attachOverlayDeepLinks();

  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (!opts.isEnabled()) return;
    if (state === 'active') {
      void stopSystemOverlay();
    } else if (state === 'background' || state === 'inactive') {
      void startSystemOverlay(opts.getMode(), opts.getPetName());
    }
  });

  return () => {
    try {
      sub.remove();
    } catch {
      /* ignore */
    }
    try {
      detachLinks();
    } catch {
      /* ignore */
    }
    void stopSystemOverlay();
  };
}
