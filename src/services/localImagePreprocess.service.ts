import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { addVoiceDiagnostic } from './voiceDiagnostics';

/**
 * Aggressively downscale a device image before feeding it to the on-device
 * mmproj image encoder.
 *
 * Why per-model tuning:
 *   - Gemma 4 mmproj: `image_max_tokens=512` → ~448×448 patchified. 768px JPEG
 *     Q0.85 gives ~20–40s first-token on 8-core Android CPU.
 *   - Qwen2.5-Omni 3B / 3.5-Omni-Light: dynamic ViT packs up to ~1280 tokens
 *     for a 768px image, which combined with the Q8 projector can push first
 *     token past 240s on mid-tier Android. We cap these models at 512px JPEG
 *     Q0.80 (≈60–100 KB), which together with `image_max_tokens=256` on the
 *     native bridge keeps them in the 30–60s range.
 *
 * This only runs when the input URI points at a real file (file://, content://)
 * — we leave data: URIs alone because they are typically already pre-scaled.
 */
const MODEL_PREPROCESS_PROFILE: Record<string, { width: number; quality: number }> = {
  // Qwen dynamic ViT: a 384px JPEG → ~64–128 image tokens after patching,
  // which pairs with `image_max_tokens: 128` in the native bridge to give
  // ~8–15s first-token on Android CPU (down from 240s+).
  'qwen2.5-omni-3b': { width: 384, quality: 0.75 },
  'qwen3.5-omni-light': { width: 384, quality: 0.75 },
  // Gemma's encoder saturates around 448×448; keep a slightly larger buffer.
  'gemma-4-2b': { width: 640, quality: 0.80 },
  'gemma-4-4b': { width: 640, quality: 0.80 },
  'gemma-nano-2b': { width: 640, quality: 0.80 },
};
const DEFAULT_PREPROCESS_PROFILE = { width: 640, quality: 0.80 } as const;

export const LocalImagePreprocessService = {
  getProfile(modelId?: string | null): { width: number; quality: number } {
    if (modelId && MODEL_PREPROCESS_PROFILE[modelId]) {
      return MODEL_PREPROCESS_PROFILE[modelId];
    }
    return { ...DEFAULT_PREPROCESS_PROFILE };
  },

  async downscaleForLocalVision(uri: string, modelId?: string | null): Promise<string> {
    if (!uri) {
      return uri;
    }

    // data: URIs are assumed already in a reasonable shape. Skipping them
    // also avoids a round-trip through ImageManipulator's base64 path.
    if (uri.startsWith('data:')) {
      return uri;
    }

    const profile = LocalImagePreprocessService.getProfile(modelId);
    const startedAt = Date.now();
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: profile.width } }],
        {
          compress: profile.quality,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      let bytes: number | null = null;
      try {
        const info = await FileSystem.getInfoAsync(result.uri, { size: true } as any);
        if (info.exists && typeof (info as any).size === 'number') {
          bytes = (info as any).size;
        }
      } catch {}

      addVoiceDiagnostic('local-image-preprocess', 'downscale-ok', {
        from: uri.slice(0, 80),
        modelId: modelId || null,
        profileWidth: profile.width,
        profileQuality: profile.quality,
        toWidth: result.width,
        toHeight: result.height,
        bytes,
        ms: Date.now() - startedAt,
      });

      return result.uri;
    } catch (error) {
      addVoiceDiagnostic('local-image-preprocess', 'downscale-failed', {
        from: uri.slice(0, 80),
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - startedAt,
      });
      // Fall back to the original — the runtime can still try to process it,
      // just slower.
      return uri;
    }
  },
};
