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

export type WakeWordEngine = 'auto' | 'local-template' | 'system-speech';

export interface LocalWakeWordSample {
  id: string;
  createdAt: string;
  durationMs: number;
  vector: number[];
}

export interface LocalWakeWordModel {
  version: 1;
  displayName: string;
  sampleRate: number;
  samples: LocalWakeWordSample[];
  centroid: number[];
}

export interface CaptureLocalWakeWordSampleOptions {
  timeoutMs?: number;
}

export interface LocalWakeWordSelfCheckResult {
  matched: boolean;
  similarity: number;
  threshold: number;
  durationMs: number;
}

export interface LocalWakeWordServiceConfig {
  model: LocalWakeWordModel;
  threshold?: number;
  onWakeWord: () => void;
  onError?: (error: Error) => void;
}

const FRAME_LENGTH = 512;
const SAMPLE_RATE = 16000;
const START_THRESHOLD = 0.12;
const END_THRESHOLD = 0.035;
const END_FRAME_COUNT = 14;
const PREBUFFER_SAMPLES = Math.floor(SAMPLE_RATE * 0.2);
const MIN_DURATION_MS = 200;
const MAX_DURATION_MS = 2500;
const DEFAULT_TIMEOUT_MS = 4500;
const COOLDOWN_MS = 1500;
/** Global cooldown after a wake word fires — survives across listener re-creation. */
const GLOBAL_WAKE_COOLDOWN_MS = 4000;
let lastGlobalWakeTriggerAt = 0;
const MAX_SAVED_SAMPLES = 5;
export const LOCAL_WAKE_WORD_MIN_READY_SAMPLES = 3;

export interface LocalWakeWordModelReadiness {
  ready: boolean;
  sampleCount: number;
  minReadySamples: number;
  remainingSamples: number;
}

function getVoiceProcessor(): VoiceProcessorType | null {
  try {
    const { VoiceProcessor } = require('@picovoice/react-native-voice-processor');
    return VoiceProcessor?.instance ?? null;
  } catch {
    return null;
  }
}

function calculateNormalizedVolume(frame: ArrayLike<number>): number {
  if (!frame.length) {
    return 0;
  }

  let sumSquares = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const sample = frame[index] ?? 0;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / frame.length) / 32767;
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0;
  }

  const dbfs = 20 * Math.log10(Math.max(rms, 1e-9));
  return Math.min(1, Math.max(0, (dbfs + 60) / 60));
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 1e-8) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / norm);
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm <= 1e-8 || rightNorm <= 1e-8) {
    return 0;
  }

  return dot / Math.sqrt(leftNorm * rightNorm);
}

function thresholdFromSensitivity(sensitivity: number): number {
  const normalized = Math.max(0.05, Math.min(0.95, sensitivity));
  // Lower base from 0.82 to 0.65 so wake word triggers more easily
  return 0.65 - normalized * 0.25;
}

function meanAbsoluteDifference(samples: Float32Array): number {
  if (samples.length <= 1) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    total += Math.abs(samples[index] - samples[index - 1]);
  }
  return total / (samples.length - 1);
}

function zeroCrossingRate(samples: Float32Array): number {
  if (samples.length <= 1) {
    return 0;
  }

  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1] ?? 0;
    const current = samples[index] ?? 0;
    if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
      crossings += 1;
    }
  }
  return crossings / (samples.length - 1);
}

function goertzelEnergy(samples: Float32Array, sampleRate: number, frequency: number): number {
  if (!samples.length) {
    return 0;
  }

  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let index = 0; index < samples.length; index += 1) {
    q0 = coefficient * q1 - q2 + (samples[index] ?? 0);
    q2 = q1;
    q1 = q0;
  }

  const energy = q1 * q1 + q2 * q2 - coefficient * q1 * q2;
  return Math.max(0, energy / samples.length);
}

function averageVectors(vectors: number[][]): number[] {
  if (!vectors.length) {
    return [];
  }

  const length = vectors[0].length;
  const centroid = new Array<number>(length).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < length; index += 1) {
      centroid[index] += vector[index] ?? 0;
    }
  }

  for (let index = 0; index < length; index += 1) {
    centroid[index] /= vectors.length;
  }

  return normalizeVector(centroid);
}

function trimSilence(int16Samples: Int16Array): Int16Array {
  const frameSize = 160;
  const threshold = 0.04;
  let start = 0;
  let end = int16Samples.length;

  while (start + frameSize < int16Samples.length) {
    if (calculateNormalizedVolume(int16Samples.subarray(start, start + frameSize)) > threshold) {
      break;
    }
    start += frameSize;
  }

  while (end - frameSize > start) {
    if (calculateNormalizedVolume(int16Samples.subarray(end - frameSize, end)) > threshold) {
      break;
    }
    end -= frameSize;
  }

  return int16Samples.subarray(start, end);
}

function toFeatureVector(int16Samples: Int16Array): number[] | null {
  const trimmed = trimSilence(int16Samples);
  const durationMs = (trimmed.length / SAMPLE_RATE) * 1000;
  if (trimmed.length < SAMPLE_RATE * 0.2 || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
    return null;
  }

  let peak = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    peak = Math.max(peak, Math.abs(trimmed[index] ?? 0));
  }
  if (peak <= 0) {
    return null;
  }

  const normalized = new Float32Array(trimmed.length);
  for (let index = 0; index < trimmed.length; index += 1) {
    normalized[index] = (trimmed[index] ?? 0) / peak;
  }

  const segmentCount = 24;
  const vector: number[] = [];
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const start = Math.floor((segmentIndex / segmentCount) * normalized.length);
    const end = Math.max(start + 1, Math.floor(((segmentIndex + 1) / segmentCount) * normalized.length));
    const segment = normalized.subarray(start, end);

    const rms = calculateNormalizedVolume(segment);
    const zcr = zeroCrossingRate(segment);
    const derivative = meanAbsoluteDifference(segment);
    const lowEnergy = Math.log1p(goertzelEnergy(segment, SAMPLE_RATE, 350));
    const midEnergy = Math.log1p(goertzelEnergy(segment, SAMPLE_RATE, 900));
    const highEnergy = Math.log1p(goertzelEnergy(segment, SAMPLE_RATE, 1800));

    vector.push(rms, zcr, derivative, lowEnergy, midEnergy, highEnergy);
  }

  return normalizeVector(vector);
}

function scoreWakeWordMatch(model: LocalWakeWordModel, vector: number[]): number {
  if (!model.samples.length || !model.centroid.length) {
    return 0;
  }

  const sampleScores = model.samples.map((sample) => cosineSimilarity(vector, sample.vector));
  const bestSampleScore = Math.max(...sampleScores, 0);
  const centroidScore = cosineSimilarity(vector, model.centroid);
  return bestSampleScore * 0.75 + centroidScore * 0.25;
}

async function stopProcessor(processor: VoiceProcessorType) {
  try {
    if (await processor.isRecording()) {
      await processor.stop();
    }
  } catch {
    // ignore stop errors during cleanup
  }
}

async function captureUtterance(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Int16Array> {
  const processor = getVoiceProcessor();
  if (!processor) {
    throw new Error('Local wake-word processor unavailable');
  }

  const granted = await processor.hasRecordAudioPermission();
  if (!granted) {
    throw new Error('Local wake-word microphone permission denied');
  }

  return new Promise<Int16Array>((resolve, reject) => {
    const prebuffer: number[] = [];
    const utterance: number[] = [];
    let speechStarted = false;
    let silentFrames = 0;

    const cleanup = async () => {
      processor.removeFrameListener(frameListener);
      processor.removeErrorListener(errorListener);
      clearTimeout(timeoutHandle);
      await stopProcessor(processor);
    };

    const finish = async (result?: Int16Array, error?: Error) => {
      await cleanup();
      if (error) {
        reject(error);
        return;
      }
      if (!result) {
        reject(new Error('No wake-word sample captured'));
        return;
      }
      resolve(result);
    };

    const frameListener = (frame: number[]) => {
      const volume = calculateNormalizedVolume(frame);

      if (!speechStarted) {
        prebuffer.push(...frame);
        if (prebuffer.length > PREBUFFER_SAMPLES) {
          prebuffer.splice(0, prebuffer.length - PREBUFFER_SAMPLES);
        }

        if (volume >= START_THRESHOLD) {
          speechStarted = true;
          utterance.push(...prebuffer, ...frame);
          prebuffer.length = 0;
        }
        return;
      }

      utterance.push(...frame);
      if (volume <= END_THRESHOLD) {
        silentFrames += 1;
      } else {
        silentFrames = 0;
      }

      const durationMs = (utterance.length / SAMPLE_RATE) * 1000;
      if (silentFrames >= END_FRAME_COUNT || durationMs >= MAX_DURATION_MS) {
        void finish(new Int16Array(utterance));
      }
    };

    const errorListener = (error: unknown) => {
      const nextError = error instanceof Error ? error : new Error(String(error));
      void finish(undefined, nextError);
    };

    const timeoutHandle = setTimeout(() => {
      const durationMs = (utterance.length / SAMPLE_RATE) * 1000;
      if (speechStarted && durationMs >= MIN_DURATION_MS) {
        void finish(new Int16Array(utterance));
        return;
      }
      void finish(undefined, new Error('Timed out waiting for wake-word sample'));
    }, timeoutMs);

    processor.addFrameListener(frameListener);
    processor.addErrorListener(errorListener);

    processor.start(FRAME_LENGTH, SAMPLE_RATE).catch((error) => {
      void finish(undefined, error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export function getLocalWakeWordModelReadiness(
  model?: LocalWakeWordModel | null,
): LocalWakeWordModelReadiness {
  const sampleCount = model?.samples?.length ?? 0;
  const hasCentroid = Boolean(model?.centroid?.length);
  const ready = hasCentroid && sampleCount >= LOCAL_WAKE_WORD_MIN_READY_SAMPLES;

  return {
    ready,
    sampleCount,
    minReadySamples: LOCAL_WAKE_WORD_MIN_READY_SAMPLES,
    remainingSamples: Math.max(0, LOCAL_WAKE_WORD_MIN_READY_SAMPLES - sampleCount),
  };
}

export function hasLocalWakeWordModel(model?: LocalWakeWordModel | null): boolean {
  return getLocalWakeWordModelReadiness(model).ready;
}

export function getLocalWakeWordSampleCount(model?: LocalWakeWordModel | null): number {
  return model?.samples?.length ?? 0;
}

export function appendLocalWakeWordSample(
  existingModel: LocalWakeWordModel | null | undefined,
  sample: LocalWakeWordSample,
  displayName: string,
): LocalWakeWordModel {
  const samples = [...(existingModel?.samples ?? []), sample].slice(-MAX_SAVED_SAMPLES);
  return {
    version: 1,
    displayName: displayName.trim() || existingModel?.displayName || 'Hey Agentrix',
    sampleRate: SAMPLE_RATE,
    samples,
    centroid: averageVectors(samples.map((item) => item.vector)),
  };
}

export async function captureLocalWakeWordSample(
  options: CaptureLocalWakeWordSampleOptions = {},
): Promise<LocalWakeWordSample> {
  const samples = await captureUtterance(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const vector = toFeatureVector(samples);
  if (!vector) {
    throw new Error('Wake-word sample was too short or noisy');
  }

  return {
    id: `local-wake-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
    vector,
  };
}

export async function runLocalWakeWordSelfCheck(
  model: LocalWakeWordModel,
  threshold: number,
): Promise<LocalWakeWordSelfCheckResult> {
  const samples = await captureUtterance(DEFAULT_TIMEOUT_MS);
  const vector = toFeatureVector(samples);
  if (!vector) {
    throw new Error('Self-check speech was too short or noisy');
  }

  const similarity = scoreWakeWordMatch(model, vector);
  return {
    matched: similarity >= threshold,
    similarity,
    threshold,
    durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
  };
}

export class LocalWakeWordService {
  private config: LocalWakeWordServiceConfig | null = null;
  private processor: VoiceProcessorType | null = null;
  private frameListener: ((frame: number[]) => void) | null = null;
  private errorListener: ((error: unknown) => void) | null = null;
  private prebuffer: number[] = [];
  private utterance: number[] = [];
  private speechActive = false;
  private silentFrames = 0;
  private running = false;
  private lastTriggerAt = 0;
  private pausedUntil = 0;

  static isAvailable(): boolean {
    return getVoiceProcessor() !== null;
  }

  async init(config: LocalWakeWordServiceConfig): Promise<void> {
    this.config = config;
    addVoiceDiagnostic('local-wake', 'init', {
      samples: config.model.samples.length,
      displayName: config.model.displayName,
      threshold: config.threshold,
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const processor = getVoiceProcessor();
    if (!processor) {
      throw new Error('Local wake-word processor unavailable');
    }
    if (!this.config || !hasLocalWakeWordModel(this.config.model)) {
      throw new Error(`Local wake-word model needs at least ${LOCAL_WAKE_WORD_MIN_READY_SAMPLES} samples`);
    }

    const granted = await processor.hasRecordAudioPermission();
    if (!granted) {
      throw new Error('Local wake-word microphone permission denied');
    }

    this.processor = processor;
    this.prebuffer = [];
    this.utterance = [];
    this.speechActive = false;
    this.silentFrames = 0;

    this.frameListener = (frame: number[]) => {
      const volume = calculateNormalizedVolume(frame);

      if (!this.speechActive) {
        this.prebuffer.push(...frame);
        if (this.prebuffer.length > PREBUFFER_SAMPLES) {
          this.prebuffer.splice(0, this.prebuffer.length - PREBUFFER_SAMPLES);
        }

        if (volume >= START_THRESHOLD) {
          this.speechActive = true;
          this.utterance = [...this.prebuffer, ...frame];
          this.prebuffer = [];
          this.silentFrames = 0;
        }
        return;
      }

      this.utterance.push(...frame);
      if (volume <= END_THRESHOLD) {
        this.silentFrames += 1;
      } else {
        this.silentFrames = 0;
      }

      const durationMs = (this.utterance.length / SAMPLE_RATE) * 1000;
      if (this.silentFrames >= END_FRAME_COUNT || durationMs >= MAX_DURATION_MS) {
        this.flushCurrentUtterance();
      }
    };

    this.errorListener = (error: unknown) => {
      const nextError = error instanceof Error ? error : new Error(String(error));
      addVoiceDiagnostic('local-wake', 'error', { message: nextError.message });
      this.config?.onError?.(nextError);
    };

    processor.addFrameListener(this.frameListener);
    processor.addErrorListener(this.errorListener);
    await processor.start(FRAME_LENGTH, SAMPLE_RATE);
    this.running = true;
    addVoiceDiagnostic('local-wake', 'start');
  }

  pause(durationMs: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + Math.max(0, durationMs));
    addVoiceDiagnostic('local-wake', 'pause', { durationMs });
  }

  private flushCurrentUtterance() {
    const utterance = new Int16Array(this.utterance);
    this.utterance = [];
    this.speechActive = false;
    this.silentFrames = 0;

    if (Date.now() < this.pausedUntil) {
      return;
    }

    const durationMs = (utterance.length / SAMPLE_RATE) * 1000;
    if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
      addVoiceDiagnostic('local-wake', 'utterance-ignored', { durationMs });
      return;
    }

    const vector = toFeatureVector(utterance);
    if (!vector || !this.config) {
      return;
    }

    const threshold = this.config.threshold ?? thresholdFromSensitivity(0.85);
    const similarity = scoreWakeWordMatch(this.config.model, vector);
    addVoiceDiagnostic('local-wake', 'utterance-scored', {
      durationMs,
      similarity,
      threshold,
    });

    if (similarity < threshold) {
      return;
    }

    const now = Date.now();
    if (now - this.lastTriggerAt < COOLDOWN_MS || now - lastGlobalWakeTriggerAt < GLOBAL_WAKE_COOLDOWN_MS) {
      return;
    }

    this.lastTriggerAt = now;
    lastGlobalWakeTriggerAt = now;
    addVoiceDiagnostic('local-wake', 'wake-match', { similarity, threshold });
    this.config.onWakeWord();
  }

  async stop(): Promise<void> {
    if (!this.processor) {
      this.running = false;
      return;
    }

    const processor = this.processor;
    if (this.frameListener) {
      processor.removeFrameListener(this.frameListener);
    }
    if (this.errorListener) {
      processor.removeErrorListener(this.errorListener);
    }
    this.frameListener = null;
    this.errorListener = null;
    this.processor = null;
    this.running = false;
    this.prebuffer = [];
    this.utterance = [];
    this.speechActive = false;
    this.silentFrames = 0;
    await stopProcessor(processor);
    addVoiceDiagnostic('local-wake', 'stop');
  }

  async release(): Promise<void> {
    await this.stop();
    this.config = null;
    addVoiceDiagnostic('local-wake', 'release');
  }

  get isRunning(): boolean {
    return this.running;
  }
}

export { thresholdFromSensitivity };