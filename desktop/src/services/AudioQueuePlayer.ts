/**
 * Web-based audio queue player for streaming TTS.
 * Plays TTS audio URLs sequentially, one sentence at a time.
 * Uses Web Audio API for reliable autoplay in Tauri WebView2.
 */

import { API_BASE, apiFetch } from "./store";

export class AudioQueuePlayer {
  private queue: string[] = [];
  private isPlaying = false;
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private token: string;
  private onFinishedAll: (() => void) | null;
  private onPlayStateChange: ((playing: boolean) => void) | null;
  private onError: ((message: string) => void) | null;
  private hasReportedError = false;

  constructor(
    token: string,
    onFinishedAll?: () => void,
    onPlayStateChange?: (playing: boolean) => void,
    onError?: (message: string) => void,
  ) {
    this.token = token;
    this.onFinishedAll = onFinishedAll || null;
    this.onPlayStateChange = onPlayStateChange || null;
    this.onError = onError || null;
    // Create AudioContext immediately (should be within user gesture context)
    try {
      this.audioCtx = new AudioContext();
      // Resume in case it's suspended
      void this.audioCtx.resume();
    } catch {
      console.warn("[AudioQueuePlayer] Failed to create AudioContext");
    }
  }

  /** Enqueue a text sentence for TTS playback */
  enqueue(text: string, lang?: "zh" | "en") {
    const truncated = text.slice(0, 1500);
    const langParam = lang ? `&lang=${lang}` : "";
    const url = `${API_BASE}/voice/tts?text=${encodeURIComponent(truncated)}${langParam}`;
    this.queue.push(url);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private reportError(message: string) {
    if (this.hasReportedError) {
      return;
    }
    this.hasReportedError = true;
    this.onError?.(message);
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.onPlayStateChange?.(false);
      this.onFinishedAll?.();
      return;
    }

    this.isPlaying = true;
    this.onPlayStateChange?.(true);
    const url = this.queue.shift()!;

    try {
      const res = await apiFetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) {
        const message = `Voice playback unavailable (TTS HTTP ${res.status}).`;
        console.warn("[AudioQueuePlayer] TTS fetch failed:", res.status);
        this.reportError(message);
        this.playNext();
        return;
      }

      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        this.playNext();
        return;
      }

      // Try Web Audio API first (no autoplay restrictions)
      if (this.audioCtx) {
        try {
          await this.audioCtx.resume();
          const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer.slice(0));
          const source = this.audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.audioCtx.destination);
          this.currentSource = source;

          source.onended = () => {
            this.currentSource = null;
            this.playNext();
          };

          source.start();
          return;
        } catch (e) {
          console.warn("[AudioQueuePlayer] Web Audio fallback to HTMLAudio:", e);
        }
      }

      // Fallback: HTMLAudioElement
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);

      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        this.playNext();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        console.warn("[AudioQueuePlayer] HTMLAudio playback error");
        this.reportError("Voice playback unavailable.");
        this.playNext();
      };

      await audio.play();
    } catch (e) {
      console.warn("[AudioQueuePlayer] playNext error:", e);
      const message = e instanceof Error && e.message
        ? `Voice playback unavailable (${e.message}).`
        : "Voice playback unavailable.";
      this.reportError(message);
      this.currentSource = null;
      this.playNext();
    }
  }

  /** Stop all playback and clear queue */
  stopAll() {
    this.queue = [];
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }
    if (this.audioCtx) {
      try { void this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    this.isPlaying = false;
    this.onPlayStateChange?.(false);
  }

  get playing() {
    return this.isPlaying;
  }
}

/**
 * Detect language from text (Chinese vs English).
 * Returns "zh" if text contains CJK characters, otherwise "en".
 */
export function detectLang(text: string): "zh" | "en" {
  return /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
}

/**
 * Sentence boundary detector for streaming TTS.
 * Accumulates text chunks and emits complete sentences.
 */
export class SentenceAccumulator {
  private buffer = "";
  private onSentence: (sentence: string) => void;

  // Chinese-aware punctuation delimiters
  private static BOUNDARY_RE = /[^。！？.!?\n]+[。！？.!?\n]+/g;
  private static EARLY_FLUSH_CHARS = 36;
  private static EARLY_FLUSH_PUNCT = /[、，:;；—]/;

  constructor(onSentence: (sentence: string) => void) {
    this.onSentence = onSentence;
  }

  /** Feed a new chunk from SSE stream */
  push(chunk: string) {
    this.buffer += chunk;

    // Try to extract complete sentences
    const matches = this.buffer.match(SentenceAccumulator.BOUNDARY_RE);
    if (matches) {
      let consumed = 0;
      for (const sentence of matches) {
        const trimmed = sentence.trim();
        if (trimmed.length > 0) {
          this.onSentence(trimmed);
        }
        consumed += sentence.length;
      }
      this.buffer = this.buffer.slice(consumed);
    }

    // Early flush: if buffer is long enough and has a weak delimiter
    if (
      this.buffer.length >= SentenceAccumulator.EARLY_FLUSH_CHARS &&
      SentenceAccumulator.EARLY_FLUSH_PUNCT.test(this.buffer)
    ) {
      const lastPunctIdx = Math.max(
        ...Array.from(this.buffer).map((ch, i) =>
          SentenceAccumulator.EARLY_FLUSH_PUNCT.test(ch) ? i : -1,
        ),
      );
      if (lastPunctIdx > 0) {
        const sentence = this.buffer.slice(0, lastPunctIdx + 1).trim();
        if (sentence) this.onSentence(sentence);
        this.buffer = this.buffer.slice(lastPunctIdx + 1);
      }
    }
  }

  /** Flush any remaining text (call when streaming ends) */
  flush() {
    const trimmed = this.buffer.trim();
    if (trimmed.length > 0) {
      this.onSentence(trimmed);
    }
    this.buffer = "";
  }

  /** Reset without emitting */
  reset() {
    this.buffer = "";
  }
}
