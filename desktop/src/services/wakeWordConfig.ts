export interface DesktopWakeWordConfig {
  enabled: boolean;
  accessKey: string;
  builtInKeyword: string;
  customKeywordPath: string;
  displayName: string;
  sensitivity: number;
}

type DesktopWakeWordConfigInput = Partial<DesktopWakeWordConfig>;

export const DESKTOP_WAKE_WORD_STORAGE_KEY = 'agentrix_wake_word_config';
export const DESKTOP_WAKE_WORD_EVENT = 'agentrix:wake-word-config-changed';

const DEFAULT_CONFIG: DesktopWakeWordConfig = {
  enabled: true,
  accessKey: '',
  builtInKeyword: 'picovoice',
  customKeywordPath: '',
  displayName: 'Picovoice',
  sensitivity: 0.65,
};

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

function readStoredConfig(): DesktopWakeWordConfigInput {
  try {
    const raw = localStorage.getItem(DESKTOP_WAKE_WORD_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as DesktopWakeWordConfigInput;
  } catch {
    return {};
  }
}

export function readDesktopWakeWordConfig(): DesktopWakeWordConfig {
  const win = window as any;
  const runtimeConfig = (win.__AGENTRIX_WAKE_WORD_CONFIG__ ?? {}) as DesktopWakeWordConfigInput;
  const storedConfig = readStoredConfig();
  const accessKey =
    storedConfig.accessKey?.trim() ||
    runtimeConfig.accessKey?.trim() ||
    win.__AGENTRIX_WAKE_WORD_KEY__ ||
    import.meta.env.VITE_PICOVOICE_ACCESS_KEY ||
    '';
  const builtInKeyword =
    storedConfig.builtInKeyword?.trim() ||
    runtimeConfig.builtInKeyword?.trim() ||
    import.meta.env.VITE_PICOVOICE_BUILT_IN_KEYWORD ||
    DEFAULT_CONFIG.builtInKeyword;
  const customKeywordPath =
    storedConfig.customKeywordPath?.trim() ||
    runtimeConfig.customKeywordPath?.trim() ||
    import.meta.env.VITE_PICOVOICE_CUSTOM_KEYWORD_PATH ||
    '';
  const displayName =
    storedConfig.displayName?.trim() ||
    runtimeConfig.displayName?.trim() ||
    import.meta.env.VITE_PICOVOICE_WAKE_WORD_LABEL ||
    (customKeywordPath ? 'Custom wake word' : builtInKeyword);

  return {
    enabled: parseBoolean(storedConfig.enabled ?? runtimeConfig.enabled ?? import.meta.env.VITE_PICOVOICE_WAKE_WORD_ENABLED, DEFAULT_CONFIG.enabled),
    accessKey,
    builtInKeyword,
    customKeywordPath,
    displayName,
    sensitivity: clampSensitivity(
      parseNumber(storedConfig.sensitivity ?? runtimeConfig.sensitivity ?? import.meta.env.VITE_PICOVOICE_WAKE_WORD_SENSITIVITY, DEFAULT_CONFIG.sensitivity),
    ),
  };
}

export function saveDesktopWakeWordConfig(nextConfig: DesktopWakeWordConfigInput): DesktopWakeWordConfig {
  const current = readDesktopWakeWordConfig();
  const merged: DesktopWakeWordConfig = {
    enabled: nextConfig.enabled ?? current.enabled,
    accessKey: nextConfig.accessKey?.trim() ?? current.accessKey,
    builtInKeyword: nextConfig.builtInKeyword?.trim() || current.builtInKeyword,
    customKeywordPath: nextConfig.customKeywordPath?.trim() ?? current.customKeywordPath,
    displayName: nextConfig.displayName?.trim() || current.displayName,
    sensitivity: clampSensitivity(nextConfig.sensitivity ?? current.sensitivity),
  };
  localStorage.setItem(DESKTOP_WAKE_WORD_STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(DESKTOP_WAKE_WORD_EVENT, { detail: merged }));
  return merged;
}

export function resetDesktopWakeWordConfig(): DesktopWakeWordConfig {
  localStorage.removeItem(DESKTOP_WAKE_WORD_STORAGE_KEY);
  const fallback = readDesktopWakeWordConfig();
  window.dispatchEvent(new CustomEvent(DESKTOP_WAKE_WORD_EVENT, { detail: fallback }));
  return fallback;
}