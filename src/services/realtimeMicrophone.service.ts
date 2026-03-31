import { addVoiceDiagnostic } from './voiceDiagnostics';

type VoiceProcessorType = {
  addFrameListener: (listener: (frame: number[]) => void) => void;
  removeFrameListener: (listener: (frame: number[]) => void) => void;
  addErrorListener: (listener: (error: unknown) => void) => void;
  removeErrorListener: (listener: (error: unknown) => void) => void;
  hasRecordAudioPermission: () => Promise<boolean>;
  start: (frameLength: number, sampleRate: number) => Promise<void>;
  stop: () => Promise<void>;
  isRecording: () => Promise<boolean>;
};

export interface RealtimeMicrophoneCallbacks {
  onFrame: (audioChunk: ArrayBuffer) => void;
  onVolumeChange?: (value: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  /** Fired when speech is detected while input is muted (echo-cancel mode).
   *  Use this for barge-in: stop agent audio and resume mic input. */
  onBargeIn?: () => void;
  onError?: (error: Error) => void;
}

const FRAME_LENGTH = 512;
const SAMPLE_RATE = 16000;
const SPEECH_START_THRESHOLD = 0.15;
const SPEECH_END_THRESHOLD = 0.05;
// Increased from 30 to 50 frames (~1.6s silence) to prevent mid-sentence splits
const SPEECH_END_FRAME_COUNT = 50;
const MIN_SPEECH_FRAME_COUNT = 8;
const SPEECH_RESTART_COOLDOWN_FRAMES = 20;
/**
 * Number of frames to send as pre-roll when speech starts.
 * This avoids cutting off the beginning of a word.
 */
const SPEECH_PRE_ROLL_FRAMES = 6;
/**
 * Extra frames to send after speech ends (post-roll) so tail isn't clipped.
 */
const SPEECH_POST_ROLL_FRAMES = 8;
/**
 * Volume threshold for barge-in detection while mic is muted (agent speaking).
 * Lowered from 0.72 to 0.50 — phone users speaking at normal distance easily hit 0.50+
 * but typical phone speaker echo stays below 0.45 on most devices.
 */
const BARGE_IN_THRESHOLD = 0.50;
/**
 * Number of consecutive loud frames required to confirm barge-in.
 * Reduced from 20 to 10 frames (~320ms) — enough to confirm real speech,
 * while single-frame echo spikes still won't trigger false barge-in.
 */
const BARGE_IN_FRAME_COUNT = 10;
/**
 * Cooldown (ms) after mic is muted before barge-in detection activates.
 * Prevents initial TTS burst from triggering barge-in.
 */
const BARGE_IN_COOLDOWN_MS = 1500;

function getVoiceProcessor(): VoiceProcessorType | null {
  try {
    const { VoiceProcessor } = require('@picovoice/react-native-voice-processor');
    return VoiceProcessor?.instance ?? null;
  } catch {
    return null;
  }
}

function toPcmBuffer(frame: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(frame.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < frame.length; index += 1) {
    view.setInt16(index * 2, frame[index] ?? 0, true);
  }
  return buffer;
}

function calculateNormalizedVolume(frame: number[]): number {
  if (!frame.length) {
    return 0;
  }

  let sumSquares = 0;
  for (const sample of frame) {
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / frame.length) / 32767;
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0;
  }

  const dbfs = 20 * Math.log10(Math.max(rms, 1e-9));
  return Math.min(1, Math.max(0, (dbfs + 60) / 60));
}

export class RealtimeMicrophoneService {
  private callbacks: RealtimeMicrophoneCallbacks;
  private voiceProcessor: VoiceProcessorType | null = null;
  private frameListener: ((frame: number[]) => void) | null = null;
  private errorListener: ((error: unknown) => void) | null = null;
  private running = false;
  private speechActive = false;
  private silentFrameCount = 0;
  private speechFrameCount = 0;
  private restartCooldownFrameCount = 0;
  private pausedUntil = 0;
  /** When true, frames are not sent but speech detection still runs for barge-in */
  private muted = false;
  /** Consecutive loud frames while muted — need several to confirm barge-in (not echo) */
  private mutedLoudFrames = 0;
  /** Timestamp after which barge-in detection becomes active (cooldown after mute start) */
  private bargeInActiveAfter = 0;
  /** Ring buffer for pre-roll frames so we don't clip the start of speech */
  private preRollBuffer: ArrayBuffer[] = [];
  /** Post-roll counter: after speech ends, continue sending this many frames */
  private postRollRemaining = 0;

  constructor(callbacks: RealtimeMicrophoneCallbacks) {
    this.callbacks = callbacks;
  }

  static isAvailable(): boolean {
    return getVoiceProcessor() !== null;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const voiceProcessor = getVoiceProcessor();
    if (!voiceProcessor) {
      throw new Error('Realtime microphone processor unavailable');
    }

    const granted = await voiceProcessor.hasRecordAudioPermission();
    if (!granted) {
      throw new Error('Realtime microphone permission denied');
    }

    this.voiceProcessor = voiceProcessor;
    this.speechActive = false;
    this.silentFrameCount = 0;
    this.speechFrameCount = 0;
    this.restartCooldownFrameCount = 0;
    this.muted = false;
    this.mutedLoudFrames = 0;
    this.preRollBuffer = [];
    this.postRollRemaining = 0;

    this.frameListener = (frame: number[]) => {
      const normalizedVolume = calculateNormalizedVolume(frame);
      this.callbacks.onVolumeChange?.(normalizedVolume);

      if (Date.now() < this.pausedUntil) {
        return;
      }

      // Muted mode: don't send audio, but detect barge-in (user speaking over agent)
      if (this.muted) {
        // Skip barge-in detection during cooldown after mute starts (initial TTS burst)
        if (Date.now() < this.bargeInActiveAfter) {
          return;
        }
        // Use a higher threshold and require multiple consecutive loud frames
        // to distinguish real speech from speaker echo
        if (normalizedVolume >= BARGE_IN_THRESHOLD) {
          this.mutedLoudFrames += 1;
          if (this.mutedLoudFrames >= BARGE_IN_FRAME_COUNT) {
            addVoiceDiagnostic('realtime-mic', 'barge-in-detected', { normalizedVolume, frames: this.mutedLoudFrames });
            this.muted = false;
            this.mutedLoudFrames = 0;
            this.callbacks.onBargeIn?.();
          }
        } else {
          this.mutedLoudFrames = 0;
        }
        return;
      }

      if (!this.speechActive && this.restartCooldownFrameCount > 0) {
        this.restartCooldownFrameCount -= 1;
      }

      const pcmChunk = toPcmBuffer(frame);

      if (this.speechActive) {
        this.speechFrameCount += 1;
        if (normalizedVolume <= SPEECH_END_THRESHOLD) {
          this.silentFrameCount += 1;
          if (this.silentFrameCount >= SPEECH_END_FRAME_COUNT) {
            const speechFrameCount = this.speechFrameCount;
            this.speechActive = false;
            this.silentFrameCount = 0;
            this.speechFrameCount = 0;
            this.restartCooldownFrameCount = SPEECH_RESTART_COOLDOWN_FRAMES;
            this.postRollRemaining = SPEECH_POST_ROLL_FRAMES;

            if (speechFrameCount >= MIN_SPEECH_FRAME_COUNT) {
              addVoiceDiagnostic('realtime-mic', 'speech-end', { speechFrameCount });
              this.callbacks.onSpeechEnd?.();
            } else {
              addVoiceDiagnostic('realtime-mic', 'speech-end-ignored', { speechFrameCount });
            }
          }
        } else {
          this.silentFrameCount = 0;
        }
        // During speech: always send audio
        this.callbacks.onFrame(pcmChunk);
      } else if (
        normalizedVolume >= SPEECH_START_THRESHOLD
        && this.restartCooldownFrameCount === 0
      ) {
        this.silentFrameCount = 0;
        this.speechActive = true;
        this.speechFrameCount = 1;
        this.postRollRemaining = 0;
        addVoiceDiagnostic('realtime-mic', 'speech-start', { normalizedVolume });
        this.callbacks.onSpeechStart?.();
        // Flush pre-roll buffer so onset of speech isn't clipped
        for (const preRollChunk of this.preRollBuffer) {
          this.callbacks.onFrame(preRollChunk);
        }
        this.preRollBuffer = [];
        this.callbacks.onFrame(pcmChunk);
      } else {
        // No speech — buffer for pre-roll only, don't send to server
        this.preRollBuffer.push(pcmChunk);
        if (this.preRollBuffer.length > SPEECH_PRE_ROLL_FRAMES) {
          this.preRollBuffer.shift();
        }
        // Send post-roll frames after speech end so tail isn't clipped
        if (this.postRollRemaining > 0) {
          this.postRollRemaining -= 1;
          this.callbacks.onFrame(pcmChunk);
        }
      }
    };

    this.errorListener = (error: unknown) => {
      const nextError = error instanceof Error ? error : new Error(String(error));
      addVoiceDiagnostic('realtime-mic', 'error', { message: nextError.message });
      this.callbacks.onError?.(nextError);
    };

    voiceProcessor.addFrameListener(this.frameListener);
    voiceProcessor.addErrorListener(this.errorListener);

    try {
      await voiceProcessor.start(FRAME_LENGTH, SAMPLE_RATE);
      this.running = true;
      addVoiceDiagnostic('realtime-mic', 'start', { frameLength: FRAME_LENGTH, sampleRate: SAMPLE_RATE });
    } catch (error) {
      this.detachListeners();
      this.voiceProcessor = null;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.voiceProcessor) {
      this.running = false;
      return;
    }

    const processor = this.voiceProcessor;
    this.detachListeners();
    this.voiceProcessor = null;
    this.running = false;
    this.speechActive = false;
    this.silentFrameCount = 0;
    this.speechFrameCount = 0;
    this.restartCooldownFrameCount = 0;
    this.pausedUntil = 0;
    this.muted = false;
    this.mutedLoudFrames = 0;
    this.preRollBuffer = [];
    this.postRollRemaining = 0;

    try {
      if (await processor.isRecording()) {
        await processor.stop();
      }
    } catch (error) {
      addVoiceDiagnostic('realtime-mic', 'stop-error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  pauseInput(durationMs: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + Math.max(0, durationMs));
    this.speechActive = false;
    this.silentFrameCount = 0;
    this.speechFrameCount = 0;
    this.restartCooldownFrameCount = SPEECH_RESTART_COOLDOWN_FRAMES;
  }

  resumeInput(): void {
    this.pausedUntil = 0;
    this.muted = false;
    this.mutedLoudFrames = 0;
    this.speechActive = false;
    this.silentFrameCount = 0;
    this.speechFrameCount = 0;
    this.restartCooldownFrameCount = 0;
  }

  /** Mute audio sending but keep speech detection active for barge-in */
  muteForEchoCancel(): void {
    this.muted = true;
    this.mutedLoudFrames = 0;
    this.bargeInActiveAfter = Date.now() + BARGE_IN_COOLDOWN_MS;
    this.speechActive = false;
    this.silentFrameCount = 0;
    this.speechFrameCount = 0;
  }

  /** Unmute after agent stops speaking */
  unmuteInput(): void {
    this.muted = false;
    this.mutedLoudFrames = 0;
    this.restartCooldownFrameCount = SPEECH_RESTART_COOLDOWN_FRAMES;
  }

  private detachListeners() {
    if (this.voiceProcessor && this.frameListener) {
      this.voiceProcessor.removeFrameListener(this.frameListener);
    }
    if (this.voiceProcessor && this.errorListener) {
      this.voiceProcessor.removeErrorListener(this.errorListener);
    }
    this.frameListener = null;
    this.errorListener = null;
  }
}