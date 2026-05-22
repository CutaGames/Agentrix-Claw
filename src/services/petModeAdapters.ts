/**
 * Pet Mode adapters (Sprint P-6 phase 6.4 — 2026-05-22).
 *
 * Wires real platform events into the unified `petMode` bus:
 *
 *   - Backend `presence:pet.state` (emotion field) → mode transitions
 *   - DeviceEventEmitter `presence:approval:wrist-trigger` → approval mode
 *   - PetTapGameModal level-up callback (caller-driven)
 *
 * Lives outside `petMode.ts` so the core bus stays platform-agnostic and
 * unit-testable in pure-Node jest. The adapters lazily require RN
 * DeviceEventEmitter + connectPetPresence inside `bootPetModeAdapters`
 * so importing this module from tests does not pull in react-native.
 *
 * Idempotent: `bootPetModeAdapters({ token, deviceId })` may be called
 * once on login. Returns a disposer that disconnects all listeners.
 */
import { setPetMode, type PetMode } from './petMode';
import type { PetEmotion, PetState } from '../../shared/types/agentrix-presence';

export interface PetModeAdaptersOpts {
  token: string;
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
}

/**
 * Map a backend `PetEmotion` to a sensible `PetMode`. Emotions that
 * don't have a dedicated form fall back to `idle` (the bus is already
 * driven by chat/voice events, so the emotion mostly fine-tunes
 * what the pet does *between* user-initiated activity).
 *
 * Mapping rationale (intentionally conservative — avoid form thrash):
 *
 *   focused / excited → speaking (active engagement)
 *   tired / sleepy    → sleep
 *   concerned / sad / angry → idle (no dedicated alarmed sprite for
 *                                    pure emotion; reserve `alert` for
 *                                    actual approval modals)
 *   happy / love / calm → idle (default ambient)
 */
export function mapEmotionToMode(emotion: PetEmotion | undefined): PetMode {
  switch (emotion) {
    case 'focused':
    case 'excited':
      return 'speaking';
    case 'tired':
    case 'sleepy':
      return 'sleep';
    case 'concerned':
    case 'sad':
    case 'angry':
    case 'happy':
    case 'love':
    case 'calm':
    default:
      return 'idle';
  }
}

/**
 * Trigger a one-shot celebration sprite. Called by anything that wants
 * to "dance the pet" briefly — AXP level-up, achievement unlock, task
 * complete in chat, etc.
 */
export function celebratePet(source: string, ttlMs: number = 1200): void {
  setPetMode('done', source, ttlMs);
}

/**
 * Connect to the backend pet-presence socket and translate
 * `presence:pet.state` into `setPetMode(...)` calls. Returns a
 * disposer that closes the socket and clears the wrist-trigger
 * subscription.
 *
 * Lazily imports react-native + petPresence so the pure helpers above
 * stay importable in jest (pure-Node) without pulling RN runtime.
 */
export function bootPetModeAdapters(opts: PetModeAdaptersOpts): () => void {
  // Lazy requires — keep the static import graph free of react-native
  // so Node-only test consumers can import { mapEmotionToMode, celebratePet }
  // without the jest worker exploding on RN's `requireNativeComponent`.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { DeviceEventEmitter } = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { connectPetPresence } = require('./petPresence') as typeof import('./petPresence');

  // 1) Backend pet.state emotion → mode
  const handle = connectPetPresence({
    token: opts.token,
    deviceId: opts.deviceId,
    deviceName: opts.deviceName || 'Agentrix Mobile',
    appVersion: opts.appVersion || '1.0.0',
    handlers: {
      'presence:pet.state': (payload) => {
        const state = payload as PetState | null | undefined;
        if (!state) return;
        // Don't override speaking/listening/done that the local UI just
        // set — only apply emotion when the bus is at idle. (The order
        // here is "local action wins"; emotion is ambient.)
        const mode = mapEmotionToMode(state.emotion);
        if (mode === 'idle') return; // No-op transition, leave whatever local state set
        setPetMode(mode, `presence:emotion:${state.emotion}`);
      },
    },
  });

  // 2) Wrist trigger from a wearable / watch → high-risk approval mode
  //    (mirrors desktop `approval-active` event family).
  const wristSub = DeviceEventEmitter.addListener(
    'presence:approval:wrist-trigger',
    () => {
      setPetMode('approval', 'wrist-approval', 4000);
    },
  );

  return () => {
    try {
      handle.disconnect();
    } catch {
      /* noop */
    }
    wristSub.remove();
  };
}
