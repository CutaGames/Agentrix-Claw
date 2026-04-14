export type LocalLlamaContextProfile = 'text' | 'multimodal' | 'speech';
export type LocalLlamaContextInitStage = 'primary' | 'fallback';
export type LocalLlamaPlatformOs = 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'unknown';

const TEXT_CONTEXT_WINDOW = 4096;
const TEXT_FALLBACK_CONTEXT_WINDOW = 2048;
const MULTIMODAL_CONTEXT_WINDOW = 4096;
const MULTIMODAL_FALLBACK_CONTEXT_WINDOW = 3072;
const SPEECH_CONTEXT_WINDOW = 4096;
const SPEECH_FALLBACK_CONTEXT_WINDOW = 3072;

export interface LocalLlamaContextInitOptions {
  n_ctx: number;
  n_gpu_layers: number;
  use_mlock: boolean;
  ctx_shift?: boolean;
}

export function resolveLocalLlamaContextInitOptions(
  profile: LocalLlamaContextProfile,
  stage: LocalLlamaContextInitStage,
  platformOs: LocalLlamaPlatformOs,
): LocalLlamaContextInitOptions {
  const useFallback = stage === 'fallback';
  const onAndroid = platformOs === 'android';

  if (profile === 'multimodal') {
    return {
      n_ctx: useFallback ? MULTIMODAL_FALLBACK_CONTEXT_WINDOW : MULTIMODAL_CONTEXT_WINDOW,
      // Android OpenCL support in llama.rn is device- and quant-specific; keep local mobile loads CPU-first.
      n_gpu_layers: onAndroid ? 0 : (useFallback ? 0 : 99),
      use_mlock: !onAndroid && !useFallback,
      ctx_shift: true,
    };
  }

  if (profile === 'speech') {
    return {
      n_ctx: useFallback ? SPEECH_FALLBACK_CONTEXT_WINDOW : SPEECH_CONTEXT_WINDOW,
      n_gpu_layers: onAndroid ? 0 : (useFallback ? 0 : 99),
      use_mlock: !onAndroid && !useFallback,
      ctx_shift: true,
    };
  }

  return {
    n_ctx: useFallback ? TEXT_FALLBACK_CONTEXT_WINDOW : TEXT_CONTEXT_WINDOW,
    n_gpu_layers: onAndroid ? 0 : (useFallback ? 0 : 99),
    use_mlock: !onAndroid && !useFallback,
    ctx_shift: true,
  };
}

export function getLocalLlamaModelPathCandidates(modelPath: string): string[] {
  const normalized = modelPath.trim();
  if (!normalized) {
    return [];
  }

  const candidates = [normalized];
  if (normalized.startsWith('file://')) {
    candidates.push(normalized.replace(/^file:\/\//, ''));
  }

  return candidates.filter((candidate, index, items) => candidate && items.indexOf(candidate) === index);
}