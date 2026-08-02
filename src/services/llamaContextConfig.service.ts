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
  n_batch: number;
  n_threads: number;
  n_gpu_layers: number;
  use_mlock: boolean;
  use_mmap: boolean;
  ctx_shift?: boolean;
  cache_type_k?: string;
  cache_type_v?: string;
}

export function resolveLocalLlamaContextInitOptions(
  profile: LocalLlamaContextProfile,
  stage: LocalLlamaContextInitStage,
  platformOs: LocalLlamaPlatformOs,
): LocalLlamaContextInitOptions {
  const useFallback = stage === 'fallback';
  const onAndroid = platformOs === 'android';

  // n_threads: use 4 threads on Android (typical big cores), all on iOS
  const threads = onAndroid ? 4 : 0; // 0 = llama.cpp auto-detect
  // n_batch: larger batch = faster prompt processing
  const batch = useFallback ? 128 : 256;
  // Q8_0 KV cache: halves KV memory vs f16, minimal quality loss
  const kvType = 'q8_0';

  if (profile === 'multimodal') {
    return {
      n_ctx: useFallback ? MULTIMODAL_FALLBACK_CONTEXT_WINDOW : MULTIMODAL_CONTEXT_WINDOW,
      n_batch: batch,
      n_threads: threads,
      // Android OpenCL support in llama.rn is device- and quant-specific; keep local mobile loads CPU-first.
      n_gpu_layers: onAndroid ? 0 : (useFallback ? 0 : 99),
      use_mlock: !onAndroid && !useFallback,
      use_mmap: true,
      ctx_shift: true,
      cache_type_k: kvType,
      cache_type_v: kvType,
    };
  }

  if (profile === 'speech') {
    return {
      n_ctx: useFallback ? SPEECH_FALLBACK_CONTEXT_WINDOW : SPEECH_CONTEXT_WINDOW,
      n_batch: batch,
      n_threads: threads,
      n_gpu_layers: onAndroid ? 0 : (useFallback ? 0 : 99),
      use_mlock: !onAndroid && !useFallback,
      use_mmap: true,
      ctx_shift: true,
      cache_type_k: kvType,
      cache_type_v: kvType,
    };
  }

  return {
    n_ctx: useFallback ? TEXT_FALLBACK_CONTEXT_WINDOW : TEXT_CONTEXT_WINDOW,
    n_batch: batch,
    n_threads: threads,
    n_gpu_layers: onAndroid ? 0 : (useFallback ? 0 : 99),
    use_mlock: !onAndroid && !useFallback,
    use_mmap: true,
    ctx_shift: true,
    cache_type_k: kvType,
    cache_type_v: kvType,
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