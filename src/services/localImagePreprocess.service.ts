import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { addVoiceDiagnostic } from './voiceDiagnostics';

/**
 * Aggressively downscale a device image before feeding it to the on-device
 * mmproj image encoder.
 *
 * Why: Gemma 4 mmproj runs at `image_max_tokens=512` → roughly a 448×448
 * patchified image. Feeding a 4000×3000 / 2.4 MB JPEG wastes a lot of CPU on
 * decode + resize that llama.cpp will throw away anyway. By the time we hand
 * mmproj a ~768px JPEG (~150-250 KB), the encode time on an 8-core Android
 * CPU drops from ~2-3 min to ~20-40 s for the first token, which is the
 * difference between "usable" and "users think it crashed".
 *
 * This only runs when the input URI points at a real file (file://, content://)
 * — we leave data: URIs alone because they are typically already pre-scaled.
 */
export const LocalImagePreprocessService = {
  async downscaleForLocalVision(uri: string): Promise<string> {
    if (!uri) {
      return uri;
    }

    // data: URIs are assumed already in a reasonable shape. Skipping them
    // also avoids a round-trip through ImageManipulator's base64 path.
    if (uri.startsWith('data:')) {
      return uri;
    }

    const startedAt = Date.now();
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 768 } }],
        {
          compress: 0.85,
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
