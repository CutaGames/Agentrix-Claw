import { Logger } from '@nestjs/common';
import type {
  TTSAdapter,
  TTSResult,
  TTSOptions,
  StreamingTTSAdapter,
  StreamingTTSCallbacks,
} from './voice-provider.interface';

/**
 * Kokoro TTS Adapter — Self-hosted, zero-cost, high-quality TTS.
 *
 * Kokoro is an open-source TTS model that can be self-hosted:
 * - 82M parameters, runs on CPU
 * - Multiple voices, natural prosody
 * - Supports English, Chinese, Japanese, Korean, French
 * - Apache 2.0 license — fully free for commercial use
 *
 * Deployment options:
 * 1. Docker: `docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu`
 * 2. Python: `pip install kokoro-onnx` + FastAPI wrapper
 * 3. Cloud: Deploy to any VM with 2GB+ RAM
 *
 * Config via env:
 *   KOKORO_TTS_URL=http://localhost:8880
 *   KOKORO_TTS_VOICE=af_heart (default female voice)
 *
 * Fish Audio alternative (also free/open-source):
 *   FISH_AUDIO_URL=http://localhost:8080
 *   FISH_AUDIO_API_KEY=...  (optional, for cloud hosted version)
 */

export class KokoroTTSAdapter implements StreamingTTSAdapter {
  readonly name = 'kokoro';
  private readonly logger = new Logger(KokoroTTSAdapter.name);
  private readonly baseUrl: string;
  private readonly defaultVoice: string;

  constructor() {
    this.baseUrl = process.env.KOKORO_TTS_URL || 'http://localhost:8880';
    this.defaultVoice = process.env.KOKORO_TTS_VOICE || 'af_heart';
  }

  get isAvailable(): boolean {
    return Boolean(process.env.KOKORO_TTS_URL);
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const voice = options?.voice || this.defaultVoice;
    const lang = options?.lang || 'en';

    // Kokoro FastAPI endpoint
    const url = `${this.baseUrl}/v1/audio/speech`;
    const body = {
      model: 'kokoro',
      input: text,
      voice: this.resolveVoice(voice, lang),
      response_format: 'mp3',
      speed: this.parseRate(options?.rate),
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Kokoro TTS error ${resp.status}: ${errText}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      contentType: 'audio/mpeg',
      provider: this.name,
    };
  }

  synthesizeStream(
    text: string,
    options: TTSOptions,
    callbacks: StreamingTTSCallbacks,
  ): { cancel: () => void } {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      try {
        const voice = options?.voice || this.defaultVoice;
        const lang = options?.lang || 'en';

        const url = `${this.baseUrl}/v1/audio/speech`;
        const body = {
          model: 'kokoro',
          input: text,
          voice: this.resolveVoice(voice, lang),
          response_format: 'mp3',
          speed: this.parseRate(options?.rate),
          stream: true,
        };

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error(`Kokoro TTS error ${resp.status}`);
        if (!resp.body) throw new Error('No response body');

        const reader = resp.body.getReader();
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && !cancelled) {
            callbacks.onChunk?.(Buffer.from(value));
          }
        }

        if (!cancelled) callbacks.onEnd?.();
      } catch (err: any) {
        if (!cancelled && err.name !== 'AbortError') {
          callbacks.onError?.(err);
        }
      }
    };

    run();

    return {
      cancel: () => {
        cancelled = true;
        controller.abort();
      },
    };
  }

  private resolveVoice(voice: string, lang: string): string {
    // Kokoro voice naming: {lang_code}_{voice_name}
    // e.g. af_heart (American female), am_adam (American male)
    // bf_emma (British female), zf_xiaoxiao (Chinese female)
    const voiceMap: Record<string, Record<string, string>> = {
      alloy: { en: 'af_heart', zh: 'zf_xiaoxiao' },
      echo: { en: 'am_adam', zh: 'zm_yunjian' },
      fable: { en: 'bf_emma', zh: 'zf_xiaoxiao' },
      nova: { en: 'af_nova', zh: 'zf_xiaoyi' },
      shimmer: { en: 'af_sky', zh: 'zf_xiaoxiao' },
      onyx: { en: 'am_michael', zh: 'zm_yunjian' },
    };

    const mapping = voiceMap[voice.toLowerCase()];
    if (mapping) {
      const langKey = lang.startsWith('zh') ? 'zh' : 'en';
      return mapping[langKey] || mapping.en;
    }

    // Direct voice ID pass-through
    return voice;
  }

  private parseRate(rate?: string): number {
    if (!rate) return 1.0;
    // Parse "+20%" → 1.2, "-10%" → 0.9
    const match = rate.match(/([+-]?\d+)%/);
    if (match) return 1.0 + parseInt(match[1], 10) / 100;
    return 1.0;
  }
}

/**
 * Fish Audio TTS Adapter — Alternative self-hosted TTS.
 *
 * Fish Audio supports voice cloning and multiple languages.
 * Can run locally or use their cloud API.
 */
export class FishAudioTTSAdapter implements TTSAdapter {
  readonly name = 'fish-audio';
  private readonly logger = new Logger(FishAudioTTSAdapter.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.FISH_AUDIO_URL || 'https://api.fish.audio';
    this.apiKey = process.env.FISH_AUDIO_API_KEY || '';
  }

  get isAvailable(): boolean {
    return Boolean(process.env.FISH_AUDIO_URL || process.env.FISH_AUDIO_API_KEY);
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const resp = await fetch(`${this.baseUrl}/v1/tts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        reference_id: options?.voice || undefined,
        format: 'mp3',
        latency: 'normal',
      }),
    });

    if (!resp.ok) {
      throw new Error(`Fish Audio error ${resp.status}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      contentType: 'audio/mpeg',
      provider: this.name,
    };
  }
}
