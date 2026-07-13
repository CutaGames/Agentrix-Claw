import { mmkv } from '../stores/mmkvStorage';

const VOICE_DIAGNOSTICS_KEY = 'voice_diagnostics_v1';
const MAX_ENTRIES = 150;

export interface VoiceDiagnosticEntry {
  timestamp: string;
  scope: string;
  event: string;
  details?: string;
}

function safeStringify(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, (_key, current) => {
      if (typeof current === 'function') return '[function]';
      if (current instanceof Error) {
        return { message: current.message, stack: current.stack };
      }
      return current;
    });
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

export function getVoiceDiagnostics(): VoiceDiagnosticEntry[] {
  const raw = mmkv.getString(VOICE_DIAGNOSTICS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addVoiceDiagnostic(scope: string, event: string, details?: unknown): void {
  const entries = getVoiceDiagnostics();
  entries.push({
    timestamp: new Date().toISOString(),
    scope,
    event,
    details: safeStringify(details),
  });
  const trimmed = entries.slice(-MAX_ENTRIES);
  mmkv.set(VOICE_DIAGNOSTICS_KEY, JSON.stringify(trimmed));
}

export function clearVoiceDiagnostics(): void {
  mmkv.delete(VOICE_DIAGNOSTICS_KEY);
}

export function getVoiceDiagnosticsCount(): number {
  return getVoiceDiagnostics().length;
}

export function getVoiceDiagnosticsText(): string {
  const entries = getVoiceDiagnostics();
  if (entries.length === 0) {
    return 'No voice diagnostics captured yet.';
  }

  return entries
    .map((entry) => {
      const details = entry.details ? ` ${entry.details}` : '';
      return `[${entry.timestamp}] ${entry.scope}:${entry.event}${details}`;
    })
    .join('\n');
}