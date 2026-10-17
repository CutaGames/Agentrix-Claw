/**
 * LocalWhisperService
 *
 * On-device audio transcription using whisper.rn (whisper.cpp React Native binding).
 * Used when a whisper-base GGUF audio encoder is downloaded alongside the local model.
 *
 * Architecture:
 *   Voice audio (WAV/M4A) → whisper.rn transcription → plain text → local LLM (Gemma 4)
 *
 * This avoids sending raw audio bytes to the main model (which has no native audio
 * tokeniser in the current GGUF package and would stall on "Exception in HostFunction").
 */

import { Platform } from 'react-native';
import { OtaModelDownloadService } from './otaModelDownload.service';
import { addVoiceDiagnostic } from './voiceDiagnostics';

// ── Type shim for whisper.rn ─────────────────────────────

interface WhisperTranscribeOptions {
  language?: string;
  translate?: boolean;
  maxLen?: number;
  tokenTimestamps?: boolean;
}

interface WhisperTranscribeResult {
  result: string;
  segments?: Array<{ text: string; t0: number; t1: number }>;
}

interface WhisperTranscribeHandle {
  stop: () => void;
  promise: Promise<WhisperTranscribeResult>;
}

interface WhisperContext {
  transcribe(audioPath: string, options?: WhisperTranscribeOptions): WhisperTranscribeHandle;
  release(): Promise<void>;
}

interface WhisperRnModule {
  initWhisper(options: { filePath: string; isBundleAsset?: boolean }): Promise<WhisperContext>;
}

// ── Module resolution ────────────────────────────────────

let cachedModule: WhisperRnModule | null | undefined = undefined;

function getModule(): WhisperRnModule | null {
  if (Platform.OS === 'web') return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = require('whisper.rn') as WhisperRnModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

// ── Context cache ────────────────────────────────────────

let activeContext: WhisperContext | null = null;
let activeEncoderPath: string | null = null;

// ── Service ──────────────────────────────────────────────

const TRANSCRIBE_TIMEOUT_MS = 30_000;

export const LocalWhisperService = {
  /**
   * Returns true if whisper.rn is installed AND the audio encoder for
   * this model is downloaded. Only then does local STT make sense.
   */
  isAvailableForModel(modelId: string | null | undefined): boolean {
    if (!getModule()) return false;
    if (!modelId) return false;
    return OtaModelDownloadService.isAudioEncoderDownloaded(modelId);
  },

  /**
   * Transcribe `audioUri` (WAV or M4A local file URI) using the model's
   * whisper-base audio encoder. Returns the transcript text.
   *
   * Throws on timeout, encoder-not-found, or whisper.rn error.
   */
  async transcribe(
    modelId: string,
    audioUri: string,
    languageHint?: string,
  ): Promise<string> {
    const mod = getModule();
    if (!mod) {
      throw new Error('whisper.rn is not installed on this build.');
    }

    const encoderPath = OtaModelDownloadService.getAudioEncoderPath(modelId);
    if (!encoderPath) {
      throw new Error(`Audio encoder for model ${modelId} is not downloaded.`);
    }

    // Re-use context when the same encoder file is already loaded.
    if (!activeContext || activeEncoderPath !== encoderPath) {
      if (activeContext) {
        await activeContext.release().catch(() => {/* ignore */});
        activeContext = null;
        activeEncoderPath = null;
      }

      addVoiceDiagnostic('local-whisper', 'init-start', { modelId, encoderPath });
      activeContext = await mod.initWhisper({ filePath: encoderPath });
      activeEncoderPath = encoderPath;
      addVoiceDiagnostic('local-whisper', 'init-ready', { modelId });
    }

    // Map language hint — whisper uses ISO-639-1 codes (e.g. 'zh', 'en')
    const language = languageHint && languageHint !== 'auto' ? languageHint : undefined;

    // whisper.rn's `transcribe(audioPath)` expects a plain filesystem path,
    // not a `file://` URI. Passing the URI as-is causes whisper.rn to treat
    // it as an inline base64 string and fail with "Illegal base64 character
    // 3a" (hex 3a = ':' in "file:"). Strip the scheme before handing off.
    const audioPath = audioUri.startsWith('file://')
      ? decodeURIComponent(audioUri.replace(/^file:\/+/, '/'))
      : audioUri;

    const { stop, promise } = activeContext.transcribe(audioPath, language ? { language } : {});

    addVoiceDiagnostic('local-whisper', 'transcribe-start', { modelId, language: language || 'auto' });

    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          stop();
          reject(new Error('whisper-timeout'));
        }, TRANSCRIBE_TIMEOUT_MS),
      ),
    ]);

    const text = result.result?.trim() || '';
    addVoiceDiagnostic('local-whisper', 'transcribe-done', {
      modelId,
      chars: text.length,
    });

    return text;
  },

  /**
   * Release the cached whisper context to free RAM. Call when switching
   * models or when the app backgrounds for an extended period.
   */
  async releaseContext(): Promise<void> {
    if (activeContext) {
      await activeContext.release().catch(() => {/* ignore */});
      activeContext = null;
      activeEncoderPath = null;
    }
  },
};
