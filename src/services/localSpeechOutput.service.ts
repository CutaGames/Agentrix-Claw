import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import type { LlamaContext } from 'llama.rn';
import { Platform } from 'react-native';

import { encodeFloat32ToWav } from './localPcmWav.service';
import {
  getLocalLlamaModelPathCandidates,
  resolveLocalLlamaContextInitOptions,
} from './llamaContextConfig.service';
import { OtaModelDownloadService } from './otaModelDownload.service';

const LOCAL_SPEECH_SAMPLE_RATE = 24000;
const LOCAL_SPEECH_STOP_TOKENS = ['<|im_end|>'];
const LOCAL_SPEECH_CANCELED_MESSAGE = 'Local speech synthesis cancelled.';

type LlamaSpeechContext = LlamaContext & {
  initVocoder: (options: {
    path: string;
    n_batch?: number;
  }) => Promise<boolean>;
  isVocoderEnabled: () => Promise<boolean>;
  getFormattedAudioCompletion: (
    speaker: object | null,
    textToSpeak: string,
  ) => Promise<{ prompt: string; grammar?: string }>;
  getAudioCompletionGuideTokens: (textToSpeak: string) => Promise<number[]>;
  decodeAudioTokens: (tokens: number[]) => Promise<number[]>;
  releaseVocoder: () => Promise<void>;
  stopCompletion: () => Promise<void>;
};

type LlamaSpeechModule = Pick<typeof import('llama.rn'), 'initLlama'>;

export interface LocalSpeechOutputRequest {
  modelId?: string | null;
  text: string;
  speakerConfig?: Record<string, unknown> | null;
}

export interface LocalSpeechOutputResult {
  fileUri: string;
  modelId: string;
  sampleRate: number;
  audioTokenCount: number;
}

let activeContext: LlamaContext | null = null;
let activePackModelId: string | null = null;
let loadingPromise: Promise<LlamaContext> | null = null;
let activeRequestId = 0;
let cachedLlamaSpeechModule: LlamaSpeechModule | null = null;

function getLlamaSpeechModule(): LlamaSpeechModule {
  if (Platform.OS === 'web') {
    throw new Error('On-device speech synthesis is unavailable on web.');
  }

  if (!cachedLlamaSpeechModule) {
    cachedLlamaSpeechModule = require('llama.rn') as LlamaSpeechModule;
  }

  return cachedLlamaSpeechModule;
}

function withSpeech(context: LlamaContext): LlamaSpeechContext {
  return context as unknown as LlamaSpeechContext;
}

function resetState(): void {
  activeContext = null;
  activePackModelId = null;
  loadingPromise = null;
}

function resolveSpeechPackModelId(preferredModelId?: string | null): string {
  const resolvedModelId = OtaModelDownloadService.findDownloadedOnDeviceAudioOutputModelId(preferredModelId);
  if (!resolvedModelId) {
    throw new Error('No on-device speech output pack is downloaded on this device.');
  }

  return resolvedModelId;
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

async function writeWavFileToCache(wavBuffer: Buffer): Promise<string> {
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!directory) {
    return `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
  }

  const fileUri = `${directory}local-speech-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  await FileSystem.writeAsStringAsync(fileUri, wavBuffer.toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

async function releaseActiveContext(): Promise<void> {
  if (!activeContext) {
    resetState();
    return;
  }

  const context = activeContext;
  const speechContext = withSpeech(context);

  try {
    await speechContext.releaseVocoder();
  } catch {}

  try {
    await context.release();
  } catch {}

  resetState();
}

async function initializeSpeechLlamaContext(modelPath: string): Promise<LlamaContext> {
  const llamaSpeechModule = getLlamaSpeechModule();
  let lastError: unknown = null;

  for (const candidate of getLocalLlamaModelPathCandidates(modelPath)) {
    try {
      return await llamaSpeechModule.initLlama({
        model: candidate,
        ...resolveLocalLlamaContextInitOptions('speech', 'primary', Platform.OS),
      });
    } catch (primaryError) {
      lastError = primaryError;
      try {
        return await llamaSpeechModule.initLlama({
          model: candidate,
          ...resolveLocalLlamaContextInitOptions('speech', 'fallback', Platform.OS),
        });
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError || 'unknown runtime error');
  throw new Error(`Failed to initialize the on-device speech runtime: ${reason}`);
}

async function ensureSpeechContext(modelId?: string | null): Promise<{ context: LlamaContext; modelId: string }> {
  const packModelId = resolveSpeechPackModelId(modelId);
  if (activeContext && activePackModelId === packModelId) {
    return { context: activeContext, modelId: packModelId };
  }

  if (loadingPromise && activePackModelId === packModelId) {
    return { context: await loadingPromise, modelId: packModelId };
  }

  if (activeContext) {
    await releaseActiveContext();
  }

  const speechModelPath = OtaModelDownloadService.getAudioOutputModelPath(packModelId);
  const vocoderPath = OtaModelDownloadService.getVocoderPath(packModelId);
  if (!speechModelPath || !vocoderPath) {
    throw new Error(`Speech output artifacts for ${packModelId} are incomplete on disk.`);
  }

  activePackModelId = packModelId;
  loadingPromise = initializeSpeechLlamaContext(speechModelPath).then(async (context) => {
    const speechContext = withSpeech(context);
    try {
      const initialized = await speechContext.initVocoder({
        path: vocoderPath,
        n_batch: 256,
      });
      const ready = initialized && await speechContext.isVocoderEnabled();
      if (!ready) {
        throw new Error('Failed to initialize the on-device vocoder.');
      }

      if (activePackModelId !== packModelId) {
        try {
          await speechContext.releaseVocoder();
        } catch {}
        try {
          await context.release();
        } catch {}
        throw new Error(LOCAL_SPEECH_CANCELED_MESSAGE);
      }

      activeContext = context;
      loadingPromise = null;
      return context;
    } catch (error) {
      try {
        await speechContext.releaseVocoder();
      } catch {}
      try {
        await context.release();
      } catch {}
      if (activePackModelId === packModelId) {
        resetState();
      }
      throw error;
    }
  }).catch((error) => {
    if (activePackModelId === packModelId) {
      resetState();
    }
    throw error;
  });

  return { context: await loadingPromise, modelId: packModelId };
}

export class LocalSpeechOutputService {
  static hasOnDeviceSpeechPack(modelId?: string | null): boolean {
    return !!OtaModelDownloadService.findDownloadedOnDeviceAudioOutputModelId(modelId);
  }

  static isCancellationError(error: unknown): boolean {
    return error instanceof Error && error.message === LOCAL_SPEECH_CANCELED_MESSAGE;
  }

  static async cancelActiveSynthesis(): Promise<void> {
    activeRequestId += 1;
    if (!activeContext) {
      return;
    }

    try {
      await withSpeech(activeContext).stopCompletion();
    } catch {}
  }

  static async synthesizeToFile(
    request: LocalSpeechOutputRequest,
  ): Promise<LocalSpeechOutputResult> {
    const text = normalizeSpeechText(request.text);
    if (!text) {
      throw new Error('Speech synthesis text is empty.');
    }

    const requestId = activeRequestId + 1;
    activeRequestId = requestId;

    const { context, modelId } = await ensureSpeechContext(request.modelId);
    const speechContext = withSpeech(context);
    const formatted = await speechContext.getFormattedAudioCompletion(
      request.speakerConfig || null,
      text,
    );

    if (requestId !== activeRequestId) {
      throw new Error(LOCAL_SPEECH_CANCELED_MESSAGE);
    }

    const guideTokens = await speechContext.getAudioCompletionGuideTokens(text);
    if (requestId !== activeRequestId) {
      throw new Error(LOCAL_SPEECH_CANCELED_MESSAGE);
    }

    const streamedAudioTokens: number[] = [];

    const completionResult = await context.completion(
      {
        prompt: formatted.prompt,
        grammar: formatted.grammar,
        guide_tokens: guideTokens,
        n_predict: 4096,
        temperature: 0.7,
        top_p: 0.9,
        stop: LOCAL_SPEECH_STOP_TOKENS,
      },
      (data) => {
        if (typeof data.token === 'number') {
          streamedAudioTokens.push(data.token);
        }
      },
    );

    if (requestId !== activeRequestId) {
      throw new Error(LOCAL_SPEECH_CANCELED_MESSAGE);
    }

    const audioTokens = completionResult.audio_tokens?.length
      ? completionResult.audio_tokens
      : streamedAudioTokens;

    if (!audioTokens.length) {
      throw new Error('The on-device speech model returned no audio tokens.');
    }

    const decodedAudio = await speechContext.decodeAudioTokens(audioTokens);
    if (requestId !== activeRequestId) {
      throw new Error(LOCAL_SPEECH_CANCELED_MESSAGE);
    }

    const wavBuffer = encodeFloat32ToWav(Float32Array.from(decodedAudio), {
      sampleRate: LOCAL_SPEECH_SAMPLE_RATE,
    });
    const fileUri = await writeWavFileToCache(wavBuffer);

    return {
      fileUri,
      modelId,
      sampleRate: LOCAL_SPEECH_SAMPLE_RATE,
      audioTokenCount: audioTokens.length,
    };
  }

  static async release(): Promise<void> {
    activeRequestId += 1;
    await releaseActiveContext();
  }
}