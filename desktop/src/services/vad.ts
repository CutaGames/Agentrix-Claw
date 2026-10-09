/**
 * Voice Activity Detection (VAD) Service — Desktop
 *
 * Uses Silero VAD ONNX model running in the browser via ONNX Runtime Web
 * for precise speech endpoint detection.
 *
 * Features:
 * - Detects speech start/end with low latency (~96ms frames)
 * - Runs entirely client-side (zero cost, no network)
 * - Works alongside Web Speech API or as standalone
 * - Configurable thresholds for sensitivity tuning
 *
 * Dependencies (install separately):
 *   npm install onnxruntime-web
 *
 * Model: Silero VAD v5 (~2MB ONNX, bundled or fetched on first use)
 *   https://github.com/snakers4/silero-vad
 *
 * Usage:
 *   const vad = new SileroVAD();
 *   await vad.init('/models/silero_vad.onnx');
 *   vad.start({
 *     onSpeechStart: () => console.log('speaking'),
 *     onSpeechEnd: () => console.log('silence'),
 *   });
 */

export interface VADCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  /** Called every frame with speech probability (0-1) */
  onFrameProcessed?: (probability: number, isSpeech: boolean) => void;
}

export interface VADOptions {
  /** Speech probability threshold (0-1, default 0.5) */
  threshold?: number;
  /** Negative speech threshold for end detection (default 0.35) */
  negThreshold?: number;
  /** Min speech duration in ms to trigger onSpeechStart (default 250) */
  minSpeechDurationMs?: number;
  /** Silence duration in ms to trigger onSpeechEnd (default 700) */
  silenceDurationMs?: number;
  /** Sample rate (must be 16000 for Silero VAD) */
  sampleRate?: number;
}

// Silero VAD expects 16kHz mono, 96ms frames = 1536 samples
const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 1536; // 96ms at 16kHz

export class SileroVAD {
  private session: any = null; // onnxruntime.InferenceSession
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private running = false;
  private callbacks: VADCallbacks = {};
  private options: Required<VADOptions>;

  // VAD state
  private isSpeaking = false;
  private speechStartTime = 0;
  private lastSpeechTime = 0;
  private frameBuffer: Float32Array;
  private bufferOffset = 0;

  // ONNX model state tensors (Silero VAD is stateful RNN)
  private h: any = null;
  private c: any = null;

  constructor() {
    this.frameBuffer = new Float32Array(FRAME_SAMPLES);
    this.options = {
      threshold: 0.5,
      negThreshold: 0.35,
      minSpeechDurationMs: 250,
      silenceDurationMs: 700,
      sampleRate: SAMPLE_RATE,
    };
  }

  /**
   * Check if ONNX Runtime Web is available.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await import('onnxruntime-web' as any);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the VAD model.
   * @param modelPath URL or path to silero_vad.onnx model file
   */
  async init(modelPath: string): Promise<void> {
    try {
      const ort = await import('onnxruntime-web' as any);

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['wasm'],
      });

      // Initialize hidden state tensors (zeros)
      const batchSize = 1;
      const hiddenSize = 64;
      this.h = new ort.Tensor('float32', new Float32Array(2 * batchSize * hiddenSize), [2, batchSize, hiddenSize]);
      this.c = new ort.Tensor('float32', new Float32Array(2 * batchSize * hiddenSize), [2, batchSize, hiddenSize]);

      console.log('[VAD] Silero VAD model loaded');
    } catch (error: any) {
      console.error('[VAD] Failed to load model:', error);
      throw error;
    }
  }

  /**
   * Start VAD processing with microphone input.
   */
  async start(callbacks: VADCallbacks, options?: VADOptions): Promise<void> {
    if (!this.session) throw new Error('VAD not initialized. Call init() first.');
    if (this.running) return;

    this.callbacks = callbacks;
    if (options) {
      this.options = { ...this.options, ...options };
    }

    // Reset state
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
    this.bufferOffset = 0;
    this.resetModelState();

    // Get microphone
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Set up audio processing pipeline
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Use ScriptProcessorNode for frame-level processing
    // (AudioWorklet would be better but requires separate file)
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (event) => {
      if (!this.running) return;
      const inputData = event.inputBuffer.getChannelData(0);
      this.processAudioChunk(inputData);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
    this.running = true;

    console.log('[VAD] Started');
  }

  /**
   * Stop VAD processing and release resources.
   */
  stop(): void {
    this.running = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    console.log('[VAD] Stopped');
  }

  /**
   * Release model resources.
   */
  async release(): Promise<void> {
    this.stop();
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentlySpeaking(): boolean {
    return this.isSpeaking;
  }

  // ── Internal ──

  private processAudioChunk(samples: Float32Array): void {
    // Accumulate samples into frame buffer
    let offset = 0;
    while (offset < samples.length) {
      const remaining = FRAME_SAMPLES - this.bufferOffset;
      const toCopy = Math.min(remaining, samples.length - offset);

      this.frameBuffer.set(samples.subarray(offset, offset + toCopy), this.bufferOffset);
      this.bufferOffset += toCopy;
      offset += toCopy;

      if (this.bufferOffset >= FRAME_SAMPLES) {
        this.processFrame(this.frameBuffer);
        this.bufferOffset = 0;
      }
    }
  }

  private async processFrame(frame: Float32Array): Promise<void> {
    if (!this.session) return;

    try {
      const ort = await import('onnxruntime-web' as any);

      const inputTensor = new ort.Tensor('float32', frame, [1, FRAME_SAMPLES]);
      const srTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);

      const feeds: Record<string, any> = {
        input: inputTensor,
        sr: srTensor,
        h: this.h,
        c: this.c,
      };

      const results = await this.session.run(feeds);

      // Update state tensors
      this.h = results.hn;
      this.c = results.cn;

      const probability = results.output.data[0] as number;
      const isSpeechFrame = probability >= this.options.threshold;

      this.callbacks.onFrameProcessed?.(probability, isSpeechFrame);

      const now = Date.now();

      if (isSpeechFrame) {
        this.lastSpeechTime = now;

        if (!this.isSpeaking) {
          if (this.speechStartTime === 0) {
            this.speechStartTime = now;
          }
          // Check if speech duration exceeds minimum
          if (now - this.speechStartTime >= this.options.minSpeechDurationMs) {
            this.isSpeaking = true;
            this.callbacks.onSpeechStart?.();
          }
        }
      } else {
        // Below threshold
        if (probability < this.options.negThreshold) {
          this.speechStartTime = 0;
        }

        if (this.isSpeaking && now - this.lastSpeechTime >= this.options.silenceDurationMs) {
          this.isSpeaking = false;
          this.speechStartTime = 0;
          this.callbacks.onSpeechEnd?.();
        }
      }
    } catch (err) {
      console.warn('[VAD] Frame processing error:', err);
    }
  }

  private resetModelState(): void {
    if (!this.h || !this.c) return;
    // Zero out state tensors
    this.h.data.fill(0);
    this.c.data.fill(0);
  }
}
