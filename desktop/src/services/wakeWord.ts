/**
 * Wake Word Service — Desktop (Tauri/Web via Porcupine WASM)
 *
 * Uses Picovoice Porcupine Web SDK (WASM) for browser-based wake word detection.
 * Works in Tauri WebView and any modern browser (Chrome, Edge, Firefox).
 *
 * Dependencies (must be installed separately):
 *   npm install @picovoice/porcupine-web @picovoice/web-voice-processor
 *
 * Setup:
 *   1. Get a free Picovoice access key at https://console.picovoice.ai/
 *   2. Train custom wake word "Hey Agentrix" → download .ppn WASM model
 *   3. Host the model file or bundle it with the app
 *   4. Pass accessKey and modelPath to init()
 *
 * Usage:
 *   const wakeWord = new DesktopWakeWordService();
 *   await wakeWord.init({ accessKey: '...', onWakeWord: () => startVoice() });
 *   await wakeWord.start();
 */

export type WakeWordCallback = (keywordIndex: number) => void;

export interface DesktopWakeWordConfig {
  /** Picovoice access key */
  accessKey: string;
  /** Path or URL to custom keyword .ppn model (WASM-compatible) */
  customKeywordPath?: string;
  /** Built-in keyword to use (e.g. 'picovoice', 'alexa', 'jarvis') */
  builtInKeyword?: string;
  /** Detection sensitivity (0.0 - 1.0, default 0.5) */
  sensitivity?: number;
  /** Called when wake word is detected */
  onWakeWord: WakeWordCallback;
  /** Called on error */
  onError?: (error: Error) => void;
}

// Porcupine Web types (avoids hard dependency)
interface PorcupineWeb {
  process(pcm: Int16Array): number;
  release(): void;
}

interface WebVoiceProcessor {
  subscribe(engine: any): Promise<void>;
  unsubscribe(engine: any): Promise<void>;
  reset(): Promise<void>;
}

export class DesktopWakeWordService {
  private porcupine: PorcupineWeb | null = null;
  private processor: WebVoiceProcessor | null = null;
  private running = false;
  private config: DesktopWakeWordConfig | null = null;

  /**
   * Check if Porcupine Web SDK is available.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await Promise.all([
        import('@picovoice/porcupine-web' as any),
        import('@picovoice/web-voice-processor' as any),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the wake word engine.
   */
  async init(config: DesktopWakeWordConfig): Promise<void> {
    this.config = config;

    if (!(await DesktopWakeWordService.isAvailable())) {
      console.warn('[WakeWord] Porcupine Web SDK not installed.');
      return;
    }

    try {
      const { Porcupine, BuiltInKeyword } = await import('@picovoice/porcupine-web' as any);

      const keywordDetectionCallback = {
        processFrame: (pcm: Int16Array) => {
          if (!this.porcupine) return;
          const keywordIndex = this.porcupine.process(pcm);
          if (keywordIndex >= 0) {
            config.onWakeWord(keywordIndex);
          }
        },
      };

      if (config.customKeywordPath) {
        // Custom wake word model
        const modelResp = await fetch(config.customKeywordPath);
        const modelBytes = new Uint8Array(await modelResp.arrayBuffer());

        this.porcupine = await Porcupine.create(
          config.accessKey,
          {
            customKeywordPath: config.customKeywordPath,
            sensitivity: config.sensitivity ?? 0.5,
          },
        );
      } else {
        // Built-in keyword
        const keyword = config.builtInKeyword || 'picovoice';
        this.porcupine = await Porcupine.create(
          config.accessKey,
          {
            builtInKeyword: keyword,
            sensitivity: config.sensitivity ?? 0.5,
          },
        );
      }

      // Store the frame processor wrapper for WebVoiceProcessor
      (this as any)._frameProcessor = keywordDetectionCallback;

      console.log('[WakeWord] Porcupine WASM initialized');
    } catch (error: any) {
      console.error('[WakeWord] Init failed:', error);
      config.onError?.(error instanceof Error ? error : new Error(error?.message || 'Init failed'));
    }
  }

  /**
   * Start listening for the wake word.
   */
  async start(): Promise<void> {
    if (!this.porcupine || this.running) return;

    try {
      const { WebVoiceProcessor: WVP } = await import('@picovoice/web-voice-processor' as any);
      this.processor = WVP;

      await WVP.subscribe((this as any)._frameProcessor);
      this.running = true;
      console.log('[WakeWord] Desktop listening started');
    } catch (error: any) {
      console.error('[WakeWord] Start failed:', error);
      this.config?.onError?.(error instanceof Error ? error : new Error(error?.message || 'Start failed'));
    }
  }

  /**
   * Stop listening.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.processor) return;

    try {
      await this.processor.unsubscribe((this as any)._frameProcessor);
      this.running = false;
      console.log('[WakeWord] Desktop listening stopped');
    } catch (error: any) {
      console.error('[WakeWord] Stop failed:', error);
    }
  }

  /**
   * Release all resources.
   */
  async release(): Promise<void> {
    await this.stop();
    if (this.porcupine) {
      try { this.porcupine.release(); } catch {}
      this.porcupine = null;
    }
    if (this.processor) {
      try { await this.processor.reset(); } catch {}
      this.processor = null;
    }
    this.config = null;
    console.log('[WakeWord] Released');
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isInitialized(): boolean {
    return this.porcupine !== null;
  }
}
