import { Logger } from '@nestjs/common';

/**
 * Speech Emotion Detection — Detects user emotion from voice characteristics.
 *
 * Uses audio features (pitch, energy, tempo, spectral) to classify emotion,
 * which the agent can use to adjust its response tone.
 *
 * Approaches (in priority order):
 * 1. Lightweight heuristic analysis (zero-cost, runs inline)
 *    - Energy level → excitement/calm
 *    - Speech rate → urgency/relaxed
 *    - Pitch variance → emotional/neutral
 * 2. Open-source SER model via ONNX (Wav2Vec2-based, ~50MB)
 *    - More accurate but requires model download
 *    - Runs on CPU, ~100ms per utterance
 *
 * Emotions: neutral, happy, sad, angry, surprised, fearful, disgusted
 * Simplified set for agent tone adjustment: neutral, positive, negative, urgent
 */

export type EmotionLabel = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful';
export type SimplifiedEmotion = 'neutral' | 'positive' | 'negative' | 'urgent';

export interface EmotionResult {
  emotion: EmotionLabel;
  simplified: SimplifiedEmotion;
  confidence: number;
  features: {
    energy: number;       // 0-1, normalized RMS energy
    speechRate: number;   // syllables per second estimate
    pitchVariance: number; // 0-1, normalized pitch variation
  };
}

export interface EmotionDetectionConfig {
  /** Use ONNX model if available (more accurate but slower) */
  useModel?: boolean;
  /** Path to ONNX emotion model */
  modelPath?: string;
}

export class EmotionDetector {
  private readonly logger = new Logger(EmotionDetector.name);
  private onnxSession: any = null;

  constructor(private config: EmotionDetectionConfig = {}) {}

  /**
   * Initialize ONNX model if configured.
   */
  async init(): Promise<void> {
    if (!this.config.useModel || !this.config.modelPath) return;

    try {
      const ort = require('onnxruntime-node');
      this.onnxSession = await ort.InferenceSession.create(this.config.modelPath);
      this.logger.log('Emotion detection ONNX model loaded');
    } catch (err: any) {
      this.logger.warn(`Failed to load emotion model: ${err.message}. Falling back to heuristic.`);
    }
  }

  /**
   * Detect emotion from PCM audio buffer (16kHz mono).
   */
  async detect(audioBuffer: Buffer, sampleRate = 16000): Promise<EmotionResult> {
    const features = this.extractFeatures(audioBuffer, sampleRate);

    if (this.onnxSession) {
      return this.detectWithModel(audioBuffer, sampleRate, features);
    }

    return this.detectHeuristic(features);
  }

  /**
   * Get a tone instruction for the agent based on detected emotion.
   */
  getToneInstruction(result: EmotionResult): string {
    switch (result.simplified) {
      case 'positive':
        return 'The user sounds happy/excited. Match their positive energy with an upbeat, enthusiastic tone.';
      case 'negative':
        return 'The user sounds upset or frustrated. Respond with empathy, patience, and a calm, supportive tone.';
      case 'urgent':
        return 'The user sounds rushed or anxious. Be concise and direct. Address their need quickly without unnecessary pleasantries.';
      case 'neutral':
      default:
        return '';
    }
  }

  // ── Feature Extraction ──

  private extractFeatures(buffer: Buffer, sampleRate: number): EmotionResult['features'] {
    // Convert buffer to Float32 samples
    const samples = new Float32Array(buffer.length / 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = buffer.readInt16LE(i * 2) / 32768;
    }

    // RMS Energy
    let sumSquares = 0;
    for (const s of samples) sumSquares += s * s;
    const rms = Math.sqrt(sumSquares / samples.length);
    const energy = Math.min(1, rms / 0.15); // Normalize: 0.15 RMS is loud speech

    // Speech rate estimate (zero-crossing rate as proxy)
    let zeroCrossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) zeroCrossings++;
    }
    const durationSec = samples.length / sampleRate;
    const zcr = zeroCrossings / samples.length;
    // Higher ZCR correlates with faster speech and more fricatives
    const speechRate = Math.min(1, zcr / 0.15);

    // Pitch variance (using autocorrelation-based rough estimate)
    const pitchVariance = this.estimatePitchVariance(samples, sampleRate);

    return { energy, speechRate, pitchVariance };
  }

  private estimatePitchVariance(samples: Float32Array, sampleRate: number): number {
    // Simple autocorrelation pitch detection on windowed segments
    const windowSize = Math.floor(sampleRate * 0.03); // 30ms windows
    const hopSize = Math.floor(sampleRate * 0.01); // 10ms hop
    const pitches: number[] = [];

    for (let start = 0; start + windowSize < samples.length; start += hopSize) {
      const window = samples.subarray(start, start + windowSize);
      const pitch = this.detectPitchAutocorrelation(window, sampleRate);
      if (pitch > 50 && pitch < 500) pitches.push(pitch);
    }

    if (pitches.length < 3) return 0;

    // Calculate coefficient of variation
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const variance = pitches.reduce((sum, p) => sum + (p - mean) ** 2, 0) / pitches.length;
    const cv = Math.sqrt(variance) / mean;

    return Math.min(1, cv / 0.3); // Normalize: 0.3 CV is high variation
  }

  private detectPitchAutocorrelation(window: Float32Array, sampleRate: number): number {
    const minLag = Math.floor(sampleRate / 500); // 500 Hz max
    const maxLag = Math.floor(sampleRate / 50);  // 50 Hz min

    let bestLag = 0;
    let bestCorr = 0;

    for (let lag = minLag; lag <= Math.min(maxLag, window.length / 2); lag++) {
      let corr = 0;
      for (let i = 0; i < window.length - lag; i++) {
        corr += window[i] * window[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    return bestLag > 0 ? sampleRate / bestLag : 0;
  }

  // ── Heuristic Classification ──

  private detectHeuristic(features: EmotionResult['features']): EmotionResult {
    const { energy, speechRate, pitchVariance } = features;

    let emotion: EmotionLabel = 'neutral';
    let simplified: SimplifiedEmotion = 'neutral';
    let confidence = 0.5;

    // High energy + high pitch variance → excited/happy or angry
    if (energy > 0.7 && pitchVariance > 0.5) {
      if (speechRate > 0.6) {
        emotion = 'angry';
        simplified = 'urgent';
        confidence = 0.6;
      } else {
        emotion = 'happy';
        simplified = 'positive';
        confidence = 0.55;
      }
    }
    // High energy + fast speech → urgent
    else if (energy > 0.6 && speechRate > 0.7) {
      emotion = 'surprised';
      simplified = 'urgent';
      confidence = 0.55;
    }
    // Low energy + slow speech → sad/calm
    else if (energy < 0.3 && speechRate < 0.3) {
      emotion = 'sad';
      simplified = 'negative';
      confidence = 0.5;
    }
    // Moderate everything → neutral
    else {
      emotion = 'neutral';
      simplified = 'neutral';
      confidence = 0.7;
    }

    return { emotion, simplified, confidence, features };
  }

  // ── ONNX Model Classification ──

  private async detectWithModel(
    buffer: Buffer,
    sampleRate: number,
    features: EmotionResult['features'],
  ): Promise<EmotionResult> {
    try {
      const ort = require('onnxruntime-node');
      const samples = new Float32Array(buffer.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buffer.readInt16LE(i * 2) / 32768;
      }

      const inputTensor = new ort.Tensor('float32', samples, [1, samples.length]);
      const results = await this.onnxSession.run({ input: inputTensor });

      const logits = results.output?.data;
      if (!logits) return this.detectHeuristic(features);

      // Softmax
      const maxLogit = Math.max(...logits);
      const exps = Array.from(logits as Float32Array).map((l: number) => Math.exp(l - maxLogit));
      const sumExps = exps.reduce((a: number, b: number) => a + b, 0);
      const probs = exps.map((e: number) => e / sumExps);

      const labels: EmotionLabel[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful'];
      const maxIdx = probs.indexOf(Math.max(...probs));

      const emotion = labels[maxIdx] || 'neutral';
      const simplifiedMap: Record<EmotionLabel, SimplifiedEmotion> = {
        neutral: 'neutral',
        happy: 'positive',
        sad: 'negative',
        angry: 'urgent',
        surprised: 'positive',
        fearful: 'negative',
      };

      return {
        emotion,
        simplified: simplifiedMap[emotion],
        confidence: probs[maxIdx],
        features,
      };
    } catch (err: any) {
      this.logger.warn(`Model inference failed: ${err.message}`);
      return this.detectHeuristic(features);
    }
  }
}
