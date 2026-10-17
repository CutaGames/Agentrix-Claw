/**
 * VAD Service — Voice Activity Detection for mobile
 *
 * Provides energy-based VAD as a lightweight client-side approach.
 * Monitors audio input levels to detect speech vs silence,
 * replacing the Android hard-coded 1.5s silence timeout
 * and giving iOS consistent behavior across devices.
 *
 * Architecture:
 *   1. Energy-based VAD (built-in) — uses audio metering from expo-av
 *   2. Future: SileroVAD ONNX integration when native module is available
 *
 * Key benefits:
 *   - Prevents premature cutoff when user pauses to think
 *   - Detects genuine end-of-speech more accurately
 *   - Adaptive silence threshold based on ambient noise
 */

import { addVoiceDiagnostic } from './voiceDiagnostics';

// ── Types ──────────────────────────────────────────────────

export interface VADCallbacks {
  /** Fired when speech activity detected (user started talking) */
  onSpeechStart: () => void;
  /** Fired when speech ended (sustained silence after speech) */
  onSpeechEnd: () => void;
  /** Continuous volume level updates (-160 to 0 dB, normalized to 0-1) */
  onVolumeChange?: (level: number) => void;
}

export interface VADConfig {
  /** Minimum dB level to consider as speech (default: -35) */
  speechThresholdDb?: number;
  /** How long silence must last to trigger speech-end, in ms (default: 1800) */
  silenceTimeoutMs?: number;
  /** Minimum speech duration before we consider it valid, in ms (default: 300) */
  minSpeechDurationMs?: number;
  /** Whether to adapt threshold based on ambient noise (default: true) */
  adaptiveThreshold?: boolean;
  /** Sampling interval for metering data, in ms (default: 100) */
  meterIntervalMs?: number;
}

// ── Defaults ──

const DEFAULT_SPEECH_THRESHOLD_DB = -35;
const DEFAULT_SILENCE_TIMEOUT_MS = 1800;
const DEFAULT_MIN_SPEECH_DURATION_MS = 300;
const DEFAULT_METER_INTERVAL_MS = 100;
const AMBIENT_WINDOW_SIZE = 30; // samples for ambient noise estimation

// ── Service ────────────────────────────────────────────────

export class VADService {
  private callbacks: VADCallbacks;
  private config: Required<VADConfig>;
  private running = false;
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  // State
  private isSpeechActive = false;
  private speechStartTime = 0;
  private lastSpeechTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  // Adaptive threshold
  private ambientSamples: number[] = [];
  private adaptedThresholdDb: number;

  // External audio source — the recording's metering data
  private getMeteringFn: (() => Promise<number>) | null = null;

  constructor(callbacks: VADCallbacks, config?: VADConfig) {
    this.callbacks = callbacks;
    this.config = {
      speechThresholdDb: config?.speechThresholdDb ?? DEFAULT_SPEECH_THRESHOLD_DB,
      silenceTimeoutMs: config?.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS,
      minSpeechDurationMs: config?.minSpeechDurationMs ?? DEFAULT_MIN_SPEECH_DURATION_MS,
      adaptiveThreshold: config?.adaptiveThreshold ?? true,
      meterIntervalMs: config?.meterIntervalMs ?? DEFAULT_METER_INTERVAL_MS,
    };
    this.adaptedThresholdDb = this.config.speechThresholdDb;
  }

  /**
   * Start VAD monitoring.
   * @param getMeteringFn — async function returning current dB level (typically from expo-av recording status)
   */
  start(getMeteringFn: () => Promise<number>): void {
    if (this.running) return;
    this.running = true;
    this.getMeteringFn = getMeteringFn;
    this.isSpeechActive = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    this.ambientSamples = [];
    this.adaptedThresholdDb = this.config.speechThresholdDb;

    addVoiceDiagnostic('vad', 'start', {
      threshold: this.config.speechThresholdDb,
      silenceTimeout: this.config.silenceTimeoutMs,
    });

    this.meterTimer = setInterval(() => {
      void this.processMeterSample();
    }, this.config.meterIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.getMeteringFn = null;
    addVoiceDiagnostic('vad', 'stop');
  }

  get isRunning(): boolean {
    return this.running;
  }

  get speechDetected(): boolean {
    return this.isSpeechActive;
  }

  /** Update silence timeout dynamically (e.g. user preference) */
  setSilenceTimeout(ms: number): void {
    this.config.silenceTimeoutMs = Math.max(500, Math.min(5000, ms));
  }

  // ── Internal ──

  private async processMeterSample(): Promise<void> {
    if (!this.running || !this.getMeteringFn) return;

    let dbLevel: number;
    try {
      dbLevel = await this.getMeteringFn();
    } catch {
      return; // Recording may have stopped
    }

    // Normalize dB to 0-1 for volume callback (dB range typically -160 to 0)
    const normalized = Math.max(0, Math.min(1, (dbLevel + 160) / 160));
    this.callbacks.onVolumeChange?.(normalized);

    const now = Date.now();
    const threshold = this.adaptedThresholdDb;
    const isSpeech = dbLevel > threshold;

    if (isSpeech) {
      this.lastSpeechTime = now;

      // Clear silence timer — user is speaking
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      if (!this.isSpeechActive) {
        this.isSpeechActive = true;
        this.speechStartTime = now;
        this.callbacks.onSpeechStart();
        addVoiceDiagnostic('vad', 'speech-start', { db: dbLevel.toFixed(1), threshold: threshold.toFixed(1) });
      }
    } else {
      // Silence detected
      if (this.config.adaptiveThreshold) {
        this.updateAmbientNoise(dbLevel);
      }

      if (this.isSpeechActive && !this.silenceTimer) {
        // Start silence countdown
        this.silenceTimer = setTimeout(() => {
          const speechDuration = now - this.speechStartTime;
          if (speechDuration >= this.config.minSpeechDurationMs) {
            this.isSpeechActive = false;
            this.callbacks.onSpeechEnd();
            addVoiceDiagnostic('vad', 'speech-end', {
              duration: speechDuration,
              silenceTimeout: this.config.silenceTimeoutMs,
            });
          }
          this.silenceTimer = null;
        }, this.config.silenceTimeoutMs);
      }
    }
  }

  private updateAmbientNoise(dbLevel: number): void {
    this.ambientSamples.push(dbLevel);
    if (this.ambientSamples.length > AMBIENT_WINDOW_SIZE) {
      this.ambientSamples.shift();
    }
    if (this.ambientSamples.length >= 10) {
      // Set threshold slightly above ambient average
      const avg = this.ambientSamples.reduce((a, b) => a + b, 0) / this.ambientSamples.length;
      this.adaptedThresholdDb = Math.max(
        this.config.speechThresholdDb, // never go below configured minimum
        avg + 8, // 8 dB above ambient
      );
    }
  }
}

/**
 * Helper to create a metering function from an expo-av Recording instance.
 * Usage: vadService.start(createRecordingMeterFn(recordingRef.current));
 */
export function createRecordingMeterFn(recording: any): () => Promise<number> {
  return async () => {
    if (!recording) return -160;
    try {
      const status = await recording.getStatusAsync();
      return status?.metering ?? -160;
    } catch {
      return -160;
    }
  };
}
