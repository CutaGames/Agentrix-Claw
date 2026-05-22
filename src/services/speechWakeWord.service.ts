import { isLiveSpeechRecognitionAvailable, requestLiveSpeechPermissions, startLiveSpeechRecognition, type LiveSpeechController } from './liveSpeech.service';
import { addVoiceDiagnostic } from './voiceDiagnostics';

export interface SpeechWakeWordConfig {
  phrases: string[];
  language: string;
  onWakeWord: (phrase: string) => void;
  onError?: (error: Error) => void;
}

const AGENTRIX_ALIAS_GROUP = [
  'agentrix',
  'agenttrix',
  'agentricks',
  'agentricks',
  'agent tricks',
  'agent tricks',
  'agent rix',
  'agent ricks',
  'agent rigs',
  'agent rigs',
  'agent race',
  'agent trace',
  'agent x',
  'agent ex',
  'a gentrix',
  'a gent tricks',
  'hey agent x',
  'hey agent tricks',
  'hi agent x',
  'agents tricks',
];

function canonicalizeWakeWordText(value: string): string {
  let normalized = normalizeTranscript(value);

  for (const alias of AGENTRIX_ALIAS_GROUP) {
    const normalizedAlias = normalizeTranscript(alias);
    if (!normalizedAlias) {
      continue;
    }
    normalized = normalized.split(normalizedAlias).join('agentrix');
  }

  return normalized;
}

function expandPhraseAliases(phrases: string[]): string[] {
  const expanded = new Set<string>();

  for (const phrase of phrases) {
    const trimmedPhrase = phrase.trim();
    if (!trimmedPhrase) {
      continue;
    }

    expanded.add(trimmedPhrase);

    if (/agentrix/i.test(trimmedPhrase)) {
      for (const alias of AGENTRIX_ALIAS_GROUP) {
        expanded.add(trimmedPhrase.replace(/agentrix/gi, alias));
      }
    }
  }

  return Array.from(expanded);
}

function normalizeTranscript(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s.,!?;:，。！？、'"`~^*()\[\]{}<>|\\/_+-]+/g, '')
    .trim();
}

function findMatchedPhrase(transcript: string, phrases: string[]): string | null {
  const normalizedTranscript = canonicalizeWakeWordText(transcript);
  if (!normalizedTranscript) {
    return null;
  }

  for (const phrase of phrases) {
    const normalizedPhrase = canonicalizeWakeWordText(phrase);
    if (normalizedPhrase && normalizedTranscript.includes(normalizedPhrase)) {
      return phrase;
    }
  }

  return null;
}

export class SpeechWakeWordService {
  private controller: LiveSpeechController | null = null;
  private config: SpeechWakeWordConfig | null = null;
  private running = false;
  private stoppedManually = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
  private lastErrorTime = 0;
  private static readonly MAX_CONSECUTIVE_ERRORS = 3;
  private static readonly ERROR_WINDOW_MS = 5000;

  static isAvailable(): boolean {
    return isLiveSpeechRecognitionAvailable();
  }

  async init(config: SpeechWakeWordConfig): Promise<void> {
    this.config = {
      ...config,
      phrases: expandPhraseAliases(config.phrases.map((item) => item.trim()).filter(Boolean)),
    };
    addVoiceDiagnostic('speech-wake', 'init', {
      phraseCount: this.config.phrases.length,
      displayName: this.config.phrases[0] || 'Agentrix',
      language: this.config.language,
    });
  }

  async start(): Promise<void> {
    if (this.running || !this.config) {
      return;
    }
    this.consecutiveErrors = 0;
    this.lastErrorTime = 0;
    if (!SpeechWakeWordService.isAvailable()) {
      addVoiceDiagnostic('speech-wake', 'unavailable');
      this.config.onError?.(new Error('Speech wake word recognition unavailable'));
      return;
    }

    const permission = await requestLiveSpeechPermissions();
    if (!permission?.granted) {
      addVoiceDiagnostic('speech-wake', 'permission-denied');
      this.config.onError?.(new Error('Speech wake word permission denied'));
      return;
    }

    this.stoppedManually = false;
    addVoiceDiagnostic('speech-wake', 'start');
    this.startController();
  }

  private startController() {
    if (!this.config || this.controller) {
      return;
    }

    const { language, phrases, onWakeWord, onError } = this.config;

    this.controller = startLiveSpeechRecognition(
      language,
      {
        onStart: () => {
          this.running = true;
          addVoiceDiagnostic('speech-wake', 'recognition-start');
        },
        onEnd: () => {
          this.controller = null;
          this.running = false;
          if (this.stoppedManually) {
            return;
          }
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.startController();
          }, 400);
        },
        onInterimResult: (transcript) => {
          const matched = findMatchedPhrase(transcript, phrases);
          if (!matched) {
            return;
          }
          this.stoppedManually = true;
          this.controller?.abort();
          this.controller = null;
          this.running = false;
          addVoiceDiagnostic('speech-wake', 'wake-match-interim', { matched });
          onWakeWord(matched);
        },
        onFinalResult: (transcript) => {
          const matched = findMatchedPhrase(transcript, phrases);
          if (!matched) {
            return;
          }
          this.stoppedManually = true;
          this.controller?.abort();
          this.controller = null;
          this.running = false;
          addVoiceDiagnostic('speech-wake', 'wake-match-final', { matched });
          onWakeWord(matched);
        },
        onError: (event) => {
          if (event?.error === 'aborted' || event?.error === 'no-speech') {
            return;
          }
          const now = Date.now();
          if (now - this.lastErrorTime > SpeechWakeWordService.ERROR_WINDOW_MS) {
            this.consecutiveErrors = 0;
          }
          this.consecutiveErrors++;
          this.lastErrorTime = now;
          addVoiceDiagnostic('speech-wake', 'recognition-error', event);
          if (this.consecutiveErrors >= SpeechWakeWordService.MAX_CONSECUTIVE_ERRORS) {
            addVoiceDiagnostic('speech-wake', 'too-many-errors-stopping', { count: this.consecutiveErrors });
            this.stoppedManually = true;
            try { this.controller?.abort(); } catch {}
            this.controller = null;
            this.running = false;
            // Auto-recovery: retry after 15s cooldown
            this.restartTimer = setTimeout(() => {
              if (this.config && !this.running) {
                this.consecutiveErrors = 0;
                this.lastErrorTime = 0;
                this.stoppedManually = false;
                addVoiceDiagnostic('speech-wake', 'auto-recovery-attempt');
                this.start().catch(() => {});
              }
            }, 15000) as unknown as ReturnType<typeof setTimeout>;
            return;
          }
          onError?.(new Error(event?.message || event?.error || 'Speech wake word error'));
        },
      },
      phrases,
    );
  }

  async stop(): Promise<void> {
    this.stoppedManually = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try { this.controller?.abort(); } catch {}
    this.controller = null;
    this.running = false;
    addVoiceDiagnostic('speech-wake', 'stop');
  }

  async release(): Promise<void> {
    await this.stop();
    this.config = null;
    addVoiceDiagnostic('speech-wake', 'release');
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isInitialized(): boolean {
    return this.config !== null;
  }
}