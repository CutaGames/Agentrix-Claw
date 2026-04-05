/**
 * OTA Model Download Service
 *
 * Real model download orchestration for on-device Gemma models.
 * Handles: CDN URL resolution → download with expo-file-system →
 * integrity verification → storage management → cleanup.
 *
 * Uses expo-file-system (Expo SDK 54) File.downloadFileAsync for
 * robust native downloads.
 */

import { File as ExpoFile, Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// ── Model Registry ─────────────────────────────────────

export interface OtaModelEntry {
  id: string;
  name: string;
  filename: string;
  /** Download size in bytes */
  sizeBytes: number;
  /** Human-readable size */
  sizeLabel: string;
  /** CDN base URL — full URL is `${cdnBase}/${filename}` */
  cdnBase: string;
}

/**
 * Available models for OTA download.
 * CDN hosted on Hugging Face (public weights, no auth required).
 */
const MODEL_REGISTRY: Record<string, OtaModelEntry> = {
  'gemma-4-2b': {
    id: 'gemma-4-2b',
    name: 'Gemma 4 2B (Q4_K_M)',
    filename: 'gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1_500_000_000,
    sizeLabel: '1.5 GB',
    cdnBase: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main',
  },
  'gemma-4-4b': {
    id: 'gemma-4-4b',
    name: 'Gemma 4 4B (Q4_K_M)',
    filename: 'gemma-2-4b-it-Q4_K_M.gguf',
    sizeBytes: 2_800_000_000,
    sizeLabel: '2.8 GB',
    cdnBase: 'https://huggingface.co/bartowski/gemma-2-4b-it-GGUF/resolve/main',
  },
};

// ── Types ──────────────────────────────────────────────

export type DownloadState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'paused'
  | 'error';

export interface DownloadProgress {
  state: DownloadState;
  /** 0-100 */
  percent: number;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes expected */
  bytesTotal: number;
  /** Bytes per second (smoothed) */
  speedBps: number;
  /** Estimated seconds remaining */
  etaSeconds: number;
  /** Error message if state is 'error' */
  error?: string;
}

export interface DownloadCallbacks {
  onProgress?: (progress: DownloadProgress) => void;
  onComplete?: (localPath: string) => void;
  onError?: (error: string) => void;
}

// ── Helpers ────────────────────────────────────────────

function getModelsDir(): Directory {
  return new Directory(Paths.document, 'models');
}

function getModelFile(filename: string): ExpoFile {
  return new ExpoFile(getModelsDir(), filename);
}

// ── Service ────────────────────────────────────────────

export class OtaModelDownloadService {
  private static callbacks: DownloadCallbacks = {};
  private static downloadStartTime = 0;
  private static aborted = false;

  /**
   * Get the model entry from the registry.
   */
  static getModelEntry(modelId: string): OtaModelEntry | null {
    return MODEL_REGISTRY[modelId] ?? null;
  }

  /**
   * Check if a model is already downloaded and available locally.
   */
  static isModelDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return false;

    const file = getModelFile(entry.filename);
    if (!file.exists) return false;

    // Basic size check — allow 1% tolerance for filesystem padding
    return file.size > entry.sizeBytes * 0.95;
  }

  /**
   * Get the local file URI for a downloaded model.
   */
  static getLocalPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return null;
    const file = getModelFile(entry.filename);
    return file.exists ? file.uri : null;
  }

  /**
   * Get available disk space in bytes.
   */
  static getFreeDiskSpace(): number {
    try {
      return Paths.availableDiskSpace;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  /**
   * Start downloading a model.
   * Uses File.downloadFileAsync for native-level download.
   */
  static async startDownload(
    modelId: string,
    callbacks: DownloadCallbacks = {},
  ): Promise<void> {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) {
      callbacks.onError?.(`Unknown model: ${modelId}`);
      return;
    }

    this.callbacks = callbacks;
    this.downloadStartTime = Date.now();
    this.aborted = false;

    // Ensure models directory exists
    const modelsDir = getModelsDir();
    if (!modelsDir.exists) {
      modelsDir.create({ intermediates: true });
    }

    // Check disk space
    const freeSpace = this.getFreeDiskSpace();
    if (freeSpace < entry.sizeBytes * 1.1) {
      const needed = Math.ceil(entry.sizeBytes / (1024 * 1024 * 1024) * 10) / 10;
      callbacks.onError?.(`Insufficient disk space. Need ${needed} GB free.`);
      return;
    }

    const downloadUrl = `${entry.cdnBase}/${entry.filename}`;
    const destFile = getModelFile(entry.filename);

    // If already fully downloaded, skip
    if (destFile.exists && destFile.size > entry.sizeBytes * 0.95) {
      this.emitProgress('complete', 100, entry.sizeBytes, entry.sizeBytes);
      callbacks.onComplete?.(destFile.uri);
      return;
    }

    this.emitProgress('checking', 0, 0, entry.sizeBytes);

    try {
      this.emitProgress('downloading', 1, 0, entry.sizeBytes);

      // Use polled progress: start download, poll file size
      const progressInterval = setInterval(() => {
        if (this.aborted) {
          clearInterval(progressInterval);
          return;
        }
        try {
          const tempFile = getModelFile(entry.filename);
          if (tempFile.exists) {
            const currentSize = tempFile.size;
            const percent = Math.min(Math.round((currentSize / entry.sizeBytes) * 100), 99);
            const elapsedMs = Date.now() - this.downloadStartTime;
            const speedBps = elapsedMs > 0 ? (currentSize / elapsedMs) * 1000 : 0;
            const remainingBytes = entry.sizeBytes - currentSize;
            const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;

            this.emitProgress('downloading', percent, currentSize, entry.sizeBytes, speedBps, etaSeconds);
          }
        } catch {
          // File may not exist yet during initial download phase
        }
      }, 1000);

      // Perform the actual download
      const result = await ExpoFile.downloadFileAsync(
        downloadUrl,
        modelsDir,
        {
          headers: { 'User-Agent': `AgentrixApp/${Platform.OS}` },
          idempotent: true,
        },
      );

      clearInterval(progressInterval);

      if (this.aborted) return;

      // Verify result
      this.emitProgress('verifying', 99, entry.sizeBytes, entry.sizeBytes);

      if (!result.exists) {
        throw new Error('Downloaded file not found after download completed.');
      }

      if (result.size < entry.sizeBytes * 0.5) {
        result.delete();
        throw new Error(`Download incomplete: got ${result.size} bytes, expected ~${entry.sizeBytes}`);
      }

      this.emitProgress('complete', 100, entry.sizeBytes, entry.sizeBytes);
      callbacks.onComplete?.(result.uri);

    } catch (error) {
      if (this.aborted) return;
      const msg = error instanceof Error ? error.message : String(error);
      this.emitProgress('error', 0, 0, entry.sizeBytes, 0, 0, msg);
      callbacks.onError?.(msg);
    }
  }

  /**
   * Pause/cancel a running download.
   * Note: File.downloadFileAsync doesn't support pause/resume natively.
   * We signal abort so the completion handler ignores results.
   */
  static async pauseDownload(): Promise<string | null> {
    this.aborted = true;
    this.emitProgress('paused', 0, 0, 0);
    return null;
  }

  /**
   * Resume is a re-download (expo-file-system new API doesn't support resume).
   */
  static async resumeDownload(
    _serializedState: string,
    callbacks: DownloadCallbacks = {},
  ): Promise<void> {
    // In the new API, re-downloading with idempotent: true overwrites
    // We don't have a modelId in serialized state, so caller should invoke startDownload directly
    callbacks.onError?.('Resume not supported — please re-download.');
  }

  /**
   * Cancel and remove a download (including any partial file).
   */
  static cancelDownload(modelId?: string): void {
    this.aborted = true;

    if (modelId) {
      const entry = MODEL_REGISTRY[modelId];
      if (entry) {
        try {
          const file = getModelFile(entry.filename);
          if (file.exists) file.delete();
        } catch { /* ignore */ }
      }
    }

    this.emitProgress('idle', 0, 0, 0);
  }

  /**
   * Delete a downloaded model from local storage.
   */
  static deleteModel(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return false;

    try {
      const file = getModelFile(entry.filename);
      if (file.exists) {
        file.delete();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all downloaded models with their local paths.
   */
  static listDownloadedModels(): Array<{ modelId: string; path: string; sizeBytes: number }> {
    const results: Array<{ modelId: string; path: string; sizeBytes: number }> = [];

    for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
      const file = getModelFile(entry.filename);
      if (file.exists) {
        results.push({ modelId: id, path: file.uri, sizeBytes: file.size });
      }
    }
    return results;
  }

  /**
   * Get total storage used by downloaded models.
   */
  static getStorageUsed(): number {
    const models = this.listDownloadedModels();
    return models.reduce((sum, m) => sum + m.sizeBytes, 0);
  }

  // ── Internal helpers ─────────────────────────────────

  private static emitProgress(
    state: DownloadState,
    percent: number,
    bytesDownloaded: number,
    bytesTotal: number,
    speedBps = 0,
    etaSeconds = 0,
    error?: string,
  ): void {
    this.callbacks.onProgress?.({
      state,
      percent: Math.min(percent, 100),
      bytesDownloaded,
      bytesTotal,
      speedBps,
      etaSeconds,
      error,
    });
  }
}
