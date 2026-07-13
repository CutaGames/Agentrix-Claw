/**
 * petInteractionFx — Mobile haptic + audio cue layer (Phase C / C-9 + C-10).
 *
 * Centralises every "feedback effect" the mobile pet plays so screens don't
 * each spin up their own `expo-haptics` / `expo-av` import. Behaviour mirrors
 * desktop where useful, but honours mobile platform specifics:
 *
 *   - Honour iOS silent switch (`playsInSilentModeIOS: false`).
 *   - Lazy-load `expo-av` on first sound to avoid loading it for users who
 *     never tap the pet.
 *   - Single global mute toggle persisted under
 *     `AsyncStorage:pet.fx.muted = '1'`. Anyone can flip it via
 *     `setPetFxMuted(true)`.
 *
 * Public API
 * ----------
 *   playPetFx('tap')     — light haptic + chirp
 *   playPetFx('feed')    — medium haptic + crunch
 *   playPetFx('hold')    — heavy haptic + purr (long-press)
 *   playPetFx('sleep')   — no haptic + soft snore loop (returns disposer)
 *   playPetFx('cheer')   — success haptic + cheer (level up, achievement)
 *   setPetFxMuted(bool)  — persist + apply mute toggle
 *   isPetFxMuted()       — current value (sync, cached)
 *
 * Sound assets
 * ------------
 * Sound files would live under `assets/pets/sounds/*.m4a`. To keep the diff
 * tight we ship the haptic layer immediately and degrade gracefully when
 * audio assets are absent — `requirePetSound()` returns `null` and the
 * sound playback is skipped, but haptics still fire.
 */
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PetFx = 'tap' | 'feed' | 'hold' | 'sleep' | 'cheer';

const MUTE_KEY = 'agentrix.pet.fx.muted';

let muted = false;
let muteHydrated = false;
let avModule: any | null = null;
let snoreSound: any | null = null;

async function hydrateMute() {
  if (muteHydrated) return;
  try {
    const v = await AsyncStorage.getItem(MUTE_KEY);
    muted = v === '1';
  } catch {
    /* ignore */
  }
  muteHydrated = true;
}

export function isPetFxMuted(): boolean {
  return muted;
}

export async function setPetFxMuted(value: boolean): Promise<void> {
  muted = value;
  muteHydrated = true;
  try {
    await AsyncStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (value && snoreSound) {
    try { await snoreSound.stopAsync(); } catch { /* ignore */ }
  }
}

function fireHaptic(kind: PetFx) {
  // Wrapped in try/catch because `expo-haptics` no-ops on web but throws on
  // some Android emulators that lack the vibrator service.
  try {
    switch (kind) {
      case 'tap':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'feed':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'hold':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'cheer':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'sleep':
        // No haptic — we don't want to vibrate while user is putting pet to
        // sleep.
        break;
    }
  } catch {
    /* ignore */
  }
}

function requirePetSound(kind: PetFx): any | null {
  // We use try/require so missing assets don't break Metro packager.
  try {
    switch (kind) {
      case 'tap':
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        return require('../../assets/pets/sounds/chirp.m4a');
      case 'feed':
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        return require('../../assets/pets/sounds/crunch.m4a');
      case 'hold':
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        return require('../../assets/pets/sounds/purr.m4a');
      case 'sleep':
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        return require('../../assets/pets/sounds/snore.m4a');
      case 'cheer':
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        return require('../../assets/pets/sounds/cheer.m4a');
    }
  } catch {
    return null;
  }
  return null;
}

async function loadAv() {
  if (avModule) return avModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    avModule = require('expo-av');
    if (avModule?.Audio?.setAudioModeAsync) {
      await avModule.Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    }
  } catch {
    avModule = null;
  }
  return avModule;
}

async function playSound(kind: PetFx, opts: { loop?: boolean } = {}) {
  if (muted) return null;
  const asset = requirePetSound(kind);
  if (!asset) return null;
  const av = await loadAv();
  if (!av?.Audio?.Sound) return null;
  try {
    const { sound } = await av.Audio.Sound.createAsync(asset, {
      shouldPlay: true,
      isLooping: !!opts.loop,
      volume: 0.6,
    });
    if (!opts.loop) {
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status?.didJustFinish) {
          sound.unloadAsync().catch(() => undefined);
        }
      });
    }
    return sound;
  } catch {
    return null;
  }
}

/**
 * Play the requested feedback. For looped sounds (only `sleep`) we return a
 * disposer so the caller can stop them.
 */
export async function playPetFx(kind: PetFx): Promise<() => void> {
  if (!muteHydrated) await hydrateMute();
  fireHaptic(kind);

  if (kind === 'sleep') {
    if (snoreSound) {
      // already playing
      return () => disposeSnore();
    }
    snoreSound = await playSound('sleep', { loop: true });
    return () => disposeSnore();
  }

  await playSound(kind);
  return () => {};
}

function disposeSnore() {
  if (!snoreSound) return;
  const ref = snoreSound;
  snoreSound = null;
  try {
    ref.stopAsync?.().catch(() => undefined);
    ref.unloadAsync?.().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** Stop any looping pet FX (used when leaving the companion screen). */
export function stopPetFx() {
  disposeSnore();
}
