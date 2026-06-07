import Constants from 'expo-constants';
import type { LocalWakeWordModel, WakeWordEngine } from '../services/localWakeWord.service';

export interface MobileWakeWordSettingsOverride {
  enabled?: boolean;
  engine?: WakeWordEngine;
  fallbackPhrases?: string[];
  displayName?: string;
  sensitivity?: number;
  localModel?: LocalWakeWordModel | null;
}

export interface MobileWakeWordConfig {
  enabled: boolean;
  engine: WakeWordEngine;
  fallbackPhrases: string[];
  displayName: string;
  sensitivity: number;
  localModel: LocalWakeWordModel | null;
}

interface ExpoWakeWordExtra {
  enabled?: boolean;
  fallbackPhrases?: string[];
  displayName?: string;
  sensitivity?: number;
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function buildDefaultFallbackPhrases(displayName?: string): string[] {
  const label = displayName?.trim() || 'Hey Agentrix';
  return uniqueList([
    label,
    'Hey Agentrix',
    'Hi Agentrix',
    'Agentrix',
    'Hey Agent Tricks',
    'Hi Agent Tricks',
    'Agent Tricks',
    'Hey Agent Rix',
    'Agent Rix',
    'Hey Claw',
    '嘿 Agentrix',
    '你好 Agentrix',
  ]);
}

function parseList(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
  }

  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function clampSensitivity(value: number): number {
  if (value < 0.05) return 0.05;
  if (value > 0.95) return 0.95;
  return value;
}

export function resolveMobileWakeWordConfig(settings?: MobileWakeWordSettingsOverride): MobileWakeWordConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    wakeWord?: ExpoWakeWordExtra;
  };
  const extraWakeWord = extra.wakeWord ?? {};

  const configuredDisplayName =
    settings?.displayName?.trim() ||
    extraWakeWord.displayName?.trim() ||
    process.env.EXPO_PUBLIC_WAKE_WORD_LABEL ||
    'Hey Agentrix';

  const fallbackPhrases =
    settings?.fallbackPhrases?.length
      ? settings.fallbackPhrases.map((item) => item.trim()).filter(Boolean)
      : extraWakeWord.fallbackPhrases?.length
        ? extraWakeWord.fallbackPhrases.map((item) => item.trim()).filter(Boolean)
        : parseList(process.env.EXPO_PUBLIC_WAKE_WORD_FALLBACK_PHRASES);

  const resolvedFallbackPhrases = fallbackPhrases.length > 0 ? uniqueList(fallbackPhrases) : buildDefaultFallbackPhrases(configuredDisplayName);
  const sanitizedEngine = settings?.engine === 'local-template' || settings?.engine === 'system-speech' ? settings.engine : 'auto';
  const displayName = configuredDisplayName || resolvedFallbackPhrases[0] || 'Hey Agentrix';

  return {
    enabled: parseBoolean(settings?.enabled ?? extraWakeWord.enabled ?? process.env.EXPO_PUBLIC_WAKE_WORD_ENABLED, true),
    engine: sanitizedEngine,
    fallbackPhrases: resolvedFallbackPhrases,
    displayName,
    sensitivity: clampSensitivity(
      parseNumber(settings?.sensitivity ?? extraWakeWord.sensitivity ?? process.env.EXPO_PUBLIC_WAKE_WORD_SENSITIVITY, 0.65),
    ),
    localModel: settings?.localModel ?? null,
  };
}