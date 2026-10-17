/**
 * readBase64 — Cross-SDK helper for reading any local URI as a base64 string.
 *
 * **Why this exists**
 * --------------------
 * Mobile expo-file-system shipped a major rewrite in SDK 54
 * (expo-file-system@~19). The legacy module-level API
 *
 *   FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
 *
 * is gone in the new module — both `readAsStringAsync` and `EncodingType` are
 * `undefined`, which crashes with the exact error users were hitting on the
 * "拍照创生" / Pet Camera Scan screen:
 *
 *   ⚠️  Cannot read property 'Base64' of undefined
 *
 * The replacement is a `File` class with a `.base64()` async method:
 *
 *   const f = new File(uri);
 *   const b64 = await f.base64();
 *
 * For the (very narrow) case where SDK ever flips back, we lazy-require the
 * `legacy` submodule.
 *
 * Public contract
 * ---------------
 *   readUriAsBase64(uri): Promise<string>
 *     Resolves to a plain base64 string (no `data:` prefix).
 *
 *   readUriAsDataUrl(uri, mime?): Promise<string>
 *     Resolves to `data:<mime>;base64,<...>`.
 *
 * Both helpers handle `file://`, `content://`, `ph://`, and HTTP(S) URIs
 * (the last is downloaded into the cache directory before reading).
 */
import { File as ExpoFile } from 'expo-file-system';

function inferMime(uri: string): string {
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return 'image/jpeg';
}

export async function readUriAsBase64(uri: string): Promise<string> {
  if (!uri) throw new Error('readUriAsBase64: empty URI');

  // Prefer the SDK 54+ File API. It handles file://, content://, ph://, and
  // can read remote URLs after a download.
  try {
    const file = new ExpoFile(uri);
    const b64 = await file.base64();
    if (typeof b64 === 'string' && b64.length > 0) return b64;
    throw new Error('File.base64 returned empty');
  } catch (err) {
    // Fallback: legacy module (still shipped under /legacy until full removal).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const legacy = require('expo-file-system/legacy');
      if (legacy?.readAsStringAsync) {
        return await legacy.readAsStringAsync(uri, {
          encoding: legacy.EncodingType?.Base64 ?? 'base64',
        });
      }
    } catch {
      /* keep original error */
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function readUriAsDataUrl(uri: string, mime?: string): Promise<string> {
  // Already a data URL? Pass through.
  if (uri.startsWith('data:')) return uri;
  const m = mime || inferMime(uri);
  const b64 = await readUriAsBase64(uri);
  return `data:${m};base64,${b64}`;
}

/**
 * Best-effort detection of whether a URI must be inlined (because the
 * receiver — typically a backend `multipart/form-data` upload — cannot
 * resolve `content://` / `ph://`). Returns true for those non-file schemes.
 */
export function uriRequiresInlining(uri: string): boolean {
  if (!uri) return false;
  return (
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('asset-library://')
  );
}


// ── Write helpers ──────────────────────────────────────────────────────────

/**
 * Get the cache directory in a SDK-version-tolerant way. SDK 54 moved
 * directory accessors from `FileSystem.cacheDirectory` to
 * `Paths.cache.uri`.
 */
export function getCacheDirectoryUri(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const fs = require('expo-file-system');
    if (fs?.Paths?.cache?.uri) return String(fs.Paths.cache.uri);
    if (fs?.cacheDirectory) return String(fs.cacheDirectory);
    if (fs?.documentDirectory) return String(fs.documentDirectory);
  } catch { /* ignore */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const legacy = require('expo-file-system/legacy');
    if (legacy?.cacheDirectory) return String(legacy.cacheDirectory);
    if (legacy?.documentDirectory) return String(legacy.documentDirectory);
  } catch { /* ignore */ }
  return null;
}

/**
 * Write a base64 payload to a file URI. Returns the resulting file URI on
 * success.
 *
 *   await writeBase64ToFile('cache://x.wav', '<b64>')
 *
 * Uses the new `File.write(bytes)` path when available, falling back to the
 * legacy `writeAsStringAsync({encoding: 'base64'})` shape.
 */
export async function writeBase64ToFile(uri: string, base64: string): Promise<string> {
  // Prefer the new `File` class with a Uint8Array payload — avoids the
  // missing `EncodingType.Base64` constant entirely.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const fs = require('expo-file-system');
    if (fs?.File && typeof fs.File === 'function') {
      const file = new fs.File(uri);
      // SDK 54: `File.write(string)` accepts a base64 string directly when
      // the File path resolves to a file URI? No — `File.write` writes raw
      // bytes. We decode the base64 ourselves to a Uint8Array.
      const binary = decodeBase64(base64);
      try {
        if (typeof file.create === 'function') file.create();
      } catch { /* ignore "already exists" */ }
      if (typeof file.write === 'function') {
        file.write(binary);
        return uri;
      }
    }
  } catch { /* fall through to legacy */ }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const legacy = require('expo-file-system/legacy');
    if (legacy?.writeAsStringAsync) {
      await legacy.writeAsStringAsync(uri, base64, {
        encoding: legacy.EncodingType?.Base64 ?? 'base64',
      });
      return uri;
    }
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
  throw new Error('writeBase64ToFile: no working file-system API found');
}

function decodeBase64(b64: string): Uint8Array {
  // Use atob if available (RN provides it via Hermes runtime); fall back to
  // Buffer otherwise.
  const stripped = b64.replace(/\s+/g, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g.atob === 'function') {
    const bin = g.atob(stripped);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { Buffer } = require('buffer');
  return new Uint8Array(Buffer.from(stripped, 'base64'));
}

/**
 * Best-effort delete of a local file URI. Never throws.
 */
export async function bestEffortDelete(uri: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const fs = require('expo-file-system');
    if (fs?.File) {
      try {
        const f = new fs.File(uri);
        f.delete?.();
        return;
      } catch { /* fall through */ }
    }
  } catch { /* ignore */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const legacy = require('expo-file-system/legacy');
    if (legacy?.deleteAsync) {
      await legacy.deleteAsync(uri, { idempotent: true });
    }
  } catch { /* ignore */ }
}
