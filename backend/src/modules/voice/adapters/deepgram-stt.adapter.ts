import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import type {
  StreamingSTTAdapter,
  StreamingSTTSession,
  StreamingSTTCallbacks,
  STTResult,
  STTOptions,
} from './voice-provider.interface';

/**
 * Deepgram Nova-2 STT Adapter — Real-time streaming speech-to-text.
 *
 * Features:
 * - True WebSocket streaming (not file upload)
 * - Interim + final results
 * - Language detection
 * - Smart formatting, punctuation
 * - Endpointing (VAD)
 *
 * Requires: DEEPGRAM_API_KEY env variable
 */

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

export class DeepgramSTTAdapter implements StreamingSTTAdapter {
  readonly name = 'deepgram-nova2';
  private readonly logger = new Logger(DeepgramSTTAdapter.name);
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
  }

  get isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Non-streaming transcription — sends entire buffer at once via WebSocket.
   */
  async transcribe(audio: Buffer, mimeType: string, options?: STTOptions): Promise<STTResult> {
    if (!this.apiKey) throw new Error('Deepgram API key not configured');

    const encoding = this.resolveEncoding(mimeType);
    const lang = this.resolveLang(options?.lang);

    const url = new URL(DEEPGRAM_WS_URL);
    url.searchParams.set('model', options?.model || 'nova-2');
    url.searchParams.set('smart_format', 'true');
    url.searchParams.set('punctuate', 'true');
    if (lang !== 'auto') {
      url.searchParams.set('language', lang);
    } else {
      url.searchParams.set('detect_language', 'true');
    }
    if (encoding) {
      url.searchParams.set('encoding', encoding);
    }

    // Use REST API for non-streaming (simpler)
    const restUrl = `https://api.deepgram.com/v1/listen?model=${options?.model || 'nova-2'}&smart_format=true&punctuate=true${lang !== 'auto' ? `&language=${lang}` : '&detect_language=true'}`;

    const resp = await fetch(restUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': mimeType || 'audio/webm',
      },
      body: new Uint8Array(audio) as any,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Deepgram API error ${resp.status}: ${body}`);
    }

    const data = await resp.json() as any;
    const channel = data?.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    return {
      text: alternative?.transcript || '',
      lang: channel?.detected_language || lang,
      confidence: alternative?.confidence,
      provider: this.name,
    };
  }

  /**
   * Streaming STT — opens a WebSocket for real-time audio.
   */
  async createStreamingSession(
    options: STTOptions,
    callbacks: StreamingSTTCallbacks,
  ): Promise<StreamingSTTSession> {
    if (!this.apiKey) throw new Error('Deepgram API key not configured');

    const lang = this.resolveLang(options?.lang);

    const url = new URL(DEEPGRAM_WS_URL);
    url.searchParams.set('model', options?.model || 'nova-2');
    url.searchParams.set('smart_format', 'true');
    url.searchParams.set('punctuate', 'true');
    url.searchParams.set('interim_results', 'true');
    url.searchParams.set('endpointing', '1200'); // 1200ms silence = endpoint (prevents mid-sentence splits)
    url.searchParams.set('vad_events', 'true');
    if (lang !== 'auto') {
      url.searchParams.set('language', lang);
    } else {
      url.searchParams.set('detect_language', 'true');
    }
    if (options?.prompt) {
      url.searchParams.set('keywords', options.prompt);
    }
    if (options?.encoding) {
      url.searchParams.set('encoding', options.encoding);
    }
    if (options?.sampleRate) {
      url.searchParams.set('sample_rate', String(options.sampleRate));
    }

    const ws = new WebSocket(url.toString(), {
      headers: {
        Authorization: `Token ${this.apiKey}`,
      },
    });

    const pendingChunks: Buffer[] = [];
    let ended = false;
    let aborted = false;
    let opened = false;
    let pendingEnd = false;
    let connectError: Error | null = null;

    const openPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (opened || aborted) {
          return;
        }
        const error = new Error('Deepgram streaming session open timed out');
        connectError = error;
        try { ws.close(); } catch {}
        reject(error);
      }, 8000);

      ws.once('open', () => {
        clearTimeout(timeout);
        opened = true;
        this.logger.debug('Deepgram streaming session opened');

        while (pendingChunks.length > 0 && ws.readyState === WebSocket.OPEN) {
          const chunk = pendingChunks.shift();
          if (chunk) {
            ws.send(chunk);
          }
        }

        if (pendingEnd && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          setTimeout(() => {
            try { ws.close(); } catch {}
          }, 1000);
        }

        resolve();
      });

      ws.once('error', (err) => {
        clearTimeout(timeout);
        if (opened || aborted) {
          return;
        }
        connectError = err as Error;
        reject(err as Error);
      });
    });

    ws.on('message', (rawData: Buffer) => {
      if (aborted) return;
      try {
        const msg = JSON.parse(rawData.toString('utf8'));

        if (msg.type === 'Results') {
          const channel = msg.channel;
          const alternative = channel?.alternatives?.[0];
          const transcript = alternative?.transcript || '';
          const isFinal = msg.is_final === true;

          if (!transcript) return;

          if (isFinal) {
            callbacks.onFinal?.({
              text: transcript,
              lang: channel?.detected_language || lang,
              confidence: alternative?.confidence,
              provider: this.name,
            });
          } else {
            callbacks.onInterim?.(transcript);
          }
        }

        if (msg.type === 'Error') {
          callbacks.onError?.(new Error(msg.message || 'Deepgram streaming error'));
        }
      } catch (err) {
        this.logger.warn('Failed to parse Deepgram message', err);
      }
    });

    ws.on('error', (err) => {
      if (!aborted && opened) {
        callbacks.onError?.(err as Error);
      }
    });

    ws.on('close', () => {
      if (!aborted && !ended) {
        this.logger.debug('Deepgram streaming session closed');
      }
    });

    await openPromise.catch((error) => {
      throw connectError || error;
    });

    return {
      write: (chunk: Buffer) => {
        if (aborted) {
          return;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
          return;
        }

        if (!opened) {
          pendingChunks.push(Buffer.from(chunk));
        }
      },
      end: () => {
        ended = true;
        if (ws.readyState === WebSocket.OPEN) {
          // Send empty buffer to signal end
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          setTimeout(() => {
            try { ws.close(); } catch {}
          }, 1000);
          return;
        }

        pendingEnd = true;
      },
      abort: () => {
        aborted = true;
        pendingChunks.length = 0;
        try { ws.close(); } catch {}
      },
    };
  }

  private resolveLang(lang?: string): string {
    if (!lang || lang === 'auto') return 'auto';
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
    return lang;
  }

  private resolveEncoding(mimeType: string): string | null {
    if (!mimeType) return null;
    if (mimeType.includes('opus')) return 'opus';
    if (mimeType.includes('webm')) return 'opus'; // webm usually contains opus
    if (mimeType.includes('wav') || mimeType.includes('pcm')) return 'linear16';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('m4a') || mimeType.includes('aac') || mimeType.includes('mp4')) return 'aac';
    if (mimeType.includes('flac')) return 'flac';
    return null;
  }
}
