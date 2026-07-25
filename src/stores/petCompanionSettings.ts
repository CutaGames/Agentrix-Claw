/**
 * petCompanionSettings — unified namespace for the P-9 Companion
 * Redesign Phase 1 settings (T20.1).
 *
 * Phase 1 wave 15: rather than scatter slices across settingsStore,
 * agenticCommerce.service, systemAssistantBridge, formVariant.service,
 * and ad-hoc MMKV keys, we expose ONE store-shaped helper that:
 *   - Pulls all those values into a single read API
 *   - Bridges UI updates back to the underlying primitive stores
 *
 * Why a wrapper instead of moving everything: the per-service stores
 * are already wired into bus emits + cron + intent handlers. Replacing
 * them would be a multi-day refactor with no user-visible benefit. The
 * wrapper gives us "petCompanionSettings/v1" as a single mental model
 * for the CompanionSettings UI + future migrations.
 *
 * Spec: requirements.md R10.3.
 */
import { mmkv } from './mmkvStorage';
import {
  getReverseCallPolicy,
  setReverseCallPolicy,
  type ReverseCallPolicy,
} from '../services/systemAssistantBridge';
import {
  getLimits as getAgenticLimits,
  setLimits as setAgenticLimits,
  type AgenticCommerceLimits,
} from '../services/agenticCommerce.service';
import {
  getPersistedFormVariant,
  setManualLock,
  clearManualLock,
  type FormVariant,
} from '../services/formVariant.service';

const PUSH_CHANNELS_KEY = 'companion_push_channels/v1';

export interface PushChannels {
  moodDiary: boolean;
  sittingReminder: boolean;
  stepsReminder: boolean;
  walletDelta: boolean;
  approval: boolean;
  agenticCommerce: boolean;
}

export const DEFAULT_PUSH_CHANNELS: PushChannels = {
  moodDiary: true,
  sittingReminder: true,
  stepsReminder: true,
  walletDelta: true,
  approval: true,
  agenticCommerce: true,
};

const QUIET_HOURS_KEY = 'companion_quiet_hours/v1';

export interface QuietHoursPref {
  startHour: number; // 0-23
  endHour: number; // 0-23
  weekendVariant: 'same' | 'shifted'; // shifted = +1h on weekends
}

export const DEFAULT_QUIET_HOURS: QuietHoursPref = {
  startHour: 22,
  endHour: 8,
  weekendVariant: 'same',
};

const VOICE_GREET_PREFS_KEY = 'companion_voice_greet/v1';

export interface VoiceGreetPrefs {
  enabled: boolean;
  dailyMax: number;
  scenarios: {
    morning: boolean;
    evening: boolean;
    comeback: boolean;
    milestone: boolean;
  };
}

export const DEFAULT_VOICE_GREET_PREFS: VoiceGreetPrefs = {
  enabled: true,
  dailyMax: 3,
  scenarios: {
    morning: true,
    evening: true,
    comeback: true,
    milestone: true,
  },
};

// ─── Read API ────────────────────────────────────────────────────────────

export interface PetCompanionSettings {
  agenticCommerce: AgenticCommerceLimits;
  reverseCalls: ReverseCallPolicy;
  formVariant: {
    manualVariant?: FormVariant;
    manualLockedUntilMs?: number;
  };
  pushChannels: PushChannels;
  quietHours: QuietHoursPref;
  voiceGreet: VoiceGreetPrefs;
}

function readJsonOrDefault<T>(key: string, def: T): T {
  try {
    const raw = mmkv.getString(key);
    if (!raw) return def;
    return { ...def, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return def;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    mmkv.set(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function getPushChannels(): PushChannels {
  return readJsonOrDefault(PUSH_CHANNELS_KEY, DEFAULT_PUSH_CHANNELS);
}

export function setPushChannels(patch: Partial<PushChannels>): PushChannels {
  const next = { ...getPushChannels(), ...patch };
  writeJson(PUSH_CHANNELS_KEY, next);
  return next;
}

export function isPushChannelEnabled(kind: keyof PushChannels): boolean {
  return getPushChannels()[kind] !== false;
}

export function getQuietHours(): QuietHoursPref {
  return readJsonOrDefault(QUIET_HOURS_KEY, DEFAULT_QUIET_HOURS);
}

export function setQuietHours(patch: Partial<QuietHoursPref>): QuietHoursPref {
  const next = { ...getQuietHours(), ...patch };
  writeJson(QUIET_HOURS_KEY, next);
  return next;
}

export function getVoiceGreetPrefs(): VoiceGreetPrefs {
  return readJsonOrDefault(VOICE_GREET_PREFS_KEY, DEFAULT_VOICE_GREET_PREFS);
}

export function setVoiceGreetPrefs(patch: Partial<VoiceGreetPrefs>): VoiceGreetPrefs {
  const next = { ...getVoiceGreetPrefs(), ...patch };
  writeJson(VOICE_GREET_PREFS_KEY, next);
  return next;
}

/**
 * Single read for the entire petCompanionSettings/v1 surface — useful
 * for backend sync (Phase 2) and the export-as-JSON button.
 */
export function getPetCompanionSettings(): PetCompanionSettings {
  return {
    agenticCommerce: getAgenticLimits(),
    reverseCalls: getReverseCallPolicy(),
    formVariant: {
      manualVariant: getPersistedFormVariant().manualVariant,
      manualLockedUntilMs: getPersistedFormVariant().manualLockedUntilMs,
    },
    pushChannels: getPushChannels(),
    quietHours: getQuietHours(),
    voiceGreet: getVoiceGreetPrefs(),
  };
}

/**
 * Atomic-ish patch — applies each section to its underlying primitive store.
 * Phase 1 doesn't atomically rollback if one fails; failures only affect
 * that section. Caller can refetch via getPetCompanionSettings() after.
 */
export function patchPetCompanionSettings(
  patch: Partial<PetCompanionSettings>,
): void {
  if (patch.agenticCommerce) setAgenticLimits(patch.agenticCommerce);
  if (patch.reverseCalls) setReverseCallPolicy(patch.reverseCalls);
  if (patch.formVariant?.manualVariant && patch.formVariant.manualLockedUntilMs) {
    const hours = (patch.formVariant.manualLockedUntilMs - Date.now()) / (3600 * 1000);
    if (hours > 0) setManualLock(patch.formVariant.manualVariant, hours);
    else clearManualLock();
  }
  if (patch.pushChannels) setPushChannels(patch.pushChannels);
  if (patch.quietHours) setQuietHours(patch.quietHours);
  if (patch.voiceGreet) setVoiceGreetPrefs(patch.voiceGreet);
}
