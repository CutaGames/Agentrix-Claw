/**
 * OTA Model Download Service
 *
 * Real model download orchestration for on-device local models.
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
  packageRevision?: string;
  /** Download size in bytes */
  sizeBytes: number;
  /** Human-readable size */
  sizeLabel: string;
  /** CDN base URL — full URL is `${cdnBase}/${filename}` */
  cdnBase: string;
  declaredCapabilities?: OtaModelDeclaredCapabilities;
  multimodalProjector?: OtaModelArtifact;
  audioOutputModel?: OtaModelArtifact;
  vocoder?: OtaModelArtifact;
}

export interface OtaModelDeclaredCapabilities {
  visionInput: boolean;
  audioInput: boolean;
  onDeviceAudioOutput: boolean;
}

export interface OtaModelArtifact {
  kind: 'model' | 'mmproj' | 'tts-model' | 'vocoder';
  filename: string;
  sizeBytes: number;
  sizeLabel: string;
  cdnBase?: string;
}

type OtaModelArtifactKey = 'model' | 'multimodalProjector' | 'audioOutputModel' | 'vocoder';

interface ResolvedOtaModelArtifact {
  key: OtaModelArtifactKey;
  artifact: OtaModelArtifact;
}

interface OtaInstallManifestRecord {
  packageRevision: string;
  installedAt: number;
  artifacts: Partial<Record<OtaModelArtifactKey, string>>;
}

type OtaInstallManifest = Record<string, OtaInstallManifestRecord>;

export interface StartDownloadOptions {
  forceRedownload?: boolean;
}

const INSTALL_MANIFEST_FILENAME = '.agentrix-model-install-manifest.json';

/**
 * Available models for OTA download.
 * CDN hosted on HF Mirror (public weights, no auth required).
 */
const MODEL_REGISTRY: Record<string, OtaModelEntry> = {
  'gemma-4-2b': {
    id: 'gemma-4-2b',
    name: 'Gemma 4 E2B (Q4_K_M)',
    filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
    packageRevision: '2026-04-12-gemma4-e2b-r1',
    sizeBytes: 3_110_000_000,
    sizeLabel: '3.1 GB',
    cdnBase: 'https://hf-mirror.com/unsloth/gemma-4-E2B-it-GGUF/resolve/main',
    declaredCapabilities: {
      visionInput: true,
      audioInput: false,
      onDeviceAudioOutput: false,
    },
    multimodalProjector: {
      kind: 'mmproj',
      filename: 'mmproj-F16.gguf',
      sizeBytes: 986_000_000,
      sizeLabel: '986 MB',
    },
  },
  'gemma-4-4b': {
    id: 'gemma-4-4b',
    name: 'Gemma 4 E4B (Q4_K_M)',
    filename: 'gemma-4-E4B-it-Q4_K_M.gguf',
    packageRevision: '2026-04-12-gemma4-e4b-r1',
    sizeBytes: 4_980_000_000,
    sizeLabel: '5.0 GB',
    cdnBase: 'https://hf-mirror.com/unsloth/gemma-4-E4B-it-GGUF/resolve/main',
    declaredCapabilities: {
      visionInput: true,
      audioInput: false,
      onDeviceAudioOutput: false,
    },
    multimodalProjector: {
      kind: 'mmproj',
      filename: 'mmproj-F16.gguf',
      sizeBytes: 990_000_000,
      sizeLabel: '990 MB',
    },
  },
  'qwen2.5-omni-3b': {
    id: 'qwen2.5-omni-3b',
    name: 'Qwen2.5 Omni 3B (Q4_K_M)',
    filename: 'Qwen2.5-Omni-3B-Q4_K_M.gguf',
    sizeBytes: 2_100_000_000,
    sizeLabel: '2.1 GB',
    cdnBase: 'https://hf-mirror.com/ggml-org/Qwen2.5-Omni-3B-GGUF/resolve/main',
    declaredCapabilities: {
      visionInput: true,
      audioInput: true,
      onDeviceAudioOutput: true,
    },
    multimodalProjector: {
      kind: 'mmproj',
      filename: 'mmproj-Qwen2.5-Omni-3B-Q8_0.gguf',
      sizeBytes: 1_540_000_000,
      sizeLabel: '1.5 GB',
    },
    audioOutputModel: {
      kind: 'tts-model',
      filename: 'OuteTTS-0.3-500M-Q4_K_M.gguf',
      sizeBytes: 403_000_000,
      sizeLabel: '403 MB',
      cdnBase: 'https://hf-mirror.com/OuteAI/OuteTTS-0.3-500M-GGUF/resolve/main',
    },
    vocoder: {
      kind: 'vocoder',
      filename: 'WavTokenizer-Large-75-Q5_1.gguf',
      sizeBytes: 73_300_000,
      sizeLabel: '73 MB',
      cdnBase: 'https://hf-mirror.com/ggml-org/WavTokenizer/resolve/main',
    },
  },
};

const DEFAULT_DECLARED_CAPABILITIES: OtaModelDeclaredCapabilities = {
  visionInput: false,
  audioInput: false,
  onDeviceAudioOutput: false,
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

function supportsNativeModelStorage(): boolean {
  return Platform.OS !== 'web';
}

function getModelsDir(): Directory | null {
  if (!supportsNativeModelStorage()) {
    return null;
  }

  return new Directory(Paths.document, 'models');
}

function getModelFile(filename: string): ExpoFile | null {
  const modelsDir = getModelsDir();
  if (!modelsDir) {
    return null;
  }

  return new ExpoFile(modelsDir, filename);
}

function getInstallManifestFile(): ExpoFile | null {
  const modelsDir = getModelsDir();
  if (!modelsDir) {
    return null;
  }

  return new ExpoFile(modelsDir, INSTALL_MANIFEST_FILENAME);
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${Math.round(bytes / 1_000_000)} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }
  return `${bytes} B`;
}

function getPrimaryArtifact(entry: OtaModelEntry): OtaModelArtifact {
  return {
    kind: 'model',
    filename: entry.filename,
    sizeBytes: entry.sizeBytes,
    sizeLabel: entry.sizeLabel,
    cdnBase: entry.cdnBase,
  };
}

function resolveArtifacts(entry: OtaModelEntry): ResolvedOtaModelArtifact[] {
  const artifacts: ResolvedOtaModelArtifact[] = [
    { key: 'model', artifact: getPrimaryArtifact(entry) },
  ];

  if (entry.multimodalProjector) {
    artifacts.push({ key: 'multimodalProjector', artifact: entry.multimodalProjector });
  }

  if (entry.audioOutputModel) {
    artifacts.push({ key: 'audioOutputModel', artifact: entry.audioOutputModel });
  }

  if (entry.vocoder) {
    artifacts.push({ key: 'vocoder', artifact: entry.vocoder });
  }

  return artifacts;
}

function isArtifactFilePresent(artifact: OtaModelArtifact | null | undefined): boolean {
  if (!artifact) {
    return false;
  }

  const file = getModelFile(artifact.filename);
  return !!file && file.exists && file.size > artifact.sizeBytes * 0.95;
}

function getExpectedPackageRevision(entry: OtaModelEntry): string {
  if (entry.packageRevision) {
    return entry.packageRevision;
  }

  return resolveArtifacts(entry)
    .map((item) => `${item.key}:${item.artifact.filename}:${item.artifact.sizeBytes}`)
    .join('|');
}

function requiresInstallManifest(entry: OtaModelEntry): boolean {
  return !!entry.packageRevision;
}

function readInstallManifest(): OtaInstallManifest {
  const manifestFile = getInstallManifestFile();
  if (!manifestFile?.exists) {
    return {};
  }

  try {
    const parsed = JSON.parse(manifestFile.textSync());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as OtaInstallManifest;
  } catch {
    return {};
  }
}

function writeInstallManifest(manifest: OtaInstallManifest): void {
  const modelsDir = getModelsDir();
  const manifestFile = getInstallManifestFile();
  if (!modelsDir || !manifestFile) {
    return;
  }

  if (!modelsDir.exists) {
    modelsDir.create({ idempotent: true, intermediates: true });
  }

  if (!manifestFile.exists) {
    manifestFile.create({ intermediates: true, overwrite: true });
  }

  manifestFile.write(JSON.stringify(manifest));
}

function clearInstallRecord(modelId: string): void {
  const manifest = readInstallManifest();
  if (!manifest[modelId]) {
    return;
  }

  delete manifest[modelId];

  if (Object.keys(manifest).length === 0) {
    const manifestFile = getInstallManifestFile();
    if (manifestFile?.exists) {
      manifestFile.delete();
    }
    return;
  }

  writeInstallManifest(manifest);
}

function recordInstalledArtifacts(entry: OtaModelEntry): void {
  const manifest = readInstallManifest();
  const artifacts = resolveArtifacts(entry).reduce<Partial<Record<OtaModelArtifactKey, string>>>(
    (acc, item) => {
      acc[item.key] = item.artifact.filename;
      return acc;
    },
    {},
  );

  manifest[entry.id] = {
    packageRevision: getExpectedPackageRevision(entry),
    installedAt: Date.now(),
    artifacts,
  };

  writeInstallManifest(manifest);
}

function isArtifactDownloaded(
  entry: OtaModelEntry,
  key: OtaModelArtifactKey,
  artifact: OtaModelArtifact | null | undefined,
  manifest = readInstallManifest(),
): boolean {
  if (!artifact || !isArtifactFilePresent(artifact)) {
    return false;
  }

  if (!requiresInstallManifest(entry)) {
    return true;
  }

  const installRecord = manifest[entry.id];
  return !!installRecord
    && installRecord.packageRevision === getExpectedPackageRevision(entry)
    && installRecord.artifacts[key] === artifact.filename;
}

function purgeInvalidArtifacts(entry: OtaModelEntry, forceRedownload = false): void {
  const manifest = readInstallManifest();
  let deletedAny = false;

  for (const item of resolveArtifacts(entry)) {
    const file = getModelFile(item.artifact.filename);
    if (!file?.exists) {
      continue;
    }

    if (forceRedownload || !isArtifactDownloaded(entry, item.key, item.artifact, manifest)) {
      file.delete();
      deletedAny = true;
    }
  }

  if (forceRedownload || deletedAny) {
    clearInstallRecord(entry.id);
  }
}

function getArtifactPath(
  entry: OtaModelEntry,
  key: OtaModelArtifactKey,
  artifact: OtaModelArtifact | null | undefined,
): string | null {
  if (!artifact) {
    return null;
  }

  if (!isArtifactDownloaded(entry, key, artifact)) {
    return null;
  }

  const file = getModelFile(artifact.filename);
  return file?.exists ? file.uri : null;
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

  static getDeclaredCapabilities(modelId?: string | null): OtaModelDeclaredCapabilities {
    if (!modelId) {
      return DEFAULT_DECLARED_CAPABILITIES;
    }

    return MODEL_REGISTRY[modelId]?.declaredCapabilities ?? DEFAULT_DECLARED_CAPABILITIES;
  }

  static declaresVisionInput(modelId?: string | null): boolean {
    return this.getDeclaredCapabilities(modelId).visionInput;
  }

  static declaresAudioInput(modelId?: string | null): boolean {
    return this.getDeclaredCapabilities(modelId).audioInput;
  }

  static declaresOnDeviceAudioOutput(modelId?: string | null): boolean {
    return this.getDeclaredCapabilities(modelId).onDeviceAudioOutput;
  }

  static getPackageSizeBytes(modelId: string): number {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return 0;
    return resolveArtifacts(entry).reduce((sum, item) => sum + item.artifact.sizeBytes, 0);
  }

  static getPackageSizeLabel(modelId: string): string {
    return formatSize(this.getPackageSizeBytes(modelId));
  }

  /**
   * Check if a model is already downloaded and available locally.
   */
  static isModelDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return false;

    return isArtifactDownloaded(entry, 'model', getPrimaryArtifact(entry));
  }

  static isMultimodalProjectorDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.multimodalProjector) return false;
    return isArtifactDownloaded(entry, 'multimodalProjector', entry.multimodalProjector);
  }

  static isVocoderDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.vocoder) return false;
    return isArtifactDownloaded(entry, 'vocoder', entry.vocoder);
  }

  static isAudioOutputModelDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.audioOutputModel) return false;
    return isArtifactDownloaded(entry, 'audioOutputModel', entry.audioOutputModel);
  }

  static hasOnDeviceAudioOutputAssets(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.audioOutputModel || !entry.vocoder) return false;
    return isArtifactDownloaded(entry, 'audioOutputModel', entry.audioOutputModel)
      && isArtifactDownloaded(entry, 'vocoder', entry.vocoder);
  }

  static findDownloadedOnDeviceAudioOutputModelId(preferredModelId?: string | null): string | null {
    if (
      preferredModelId
      && this.declaresOnDeviceAudioOutput(preferredModelId)
      && this.hasOnDeviceAudioOutputAssets(preferredModelId)
    ) {
      return preferredModelId;
    }

    return Object.keys(MODEL_REGISTRY).find((modelId) => (
      this.declaresOnDeviceAudioOutput(modelId)
      && this.hasOnDeviceAudioOutputAssets(modelId)
    )) || null;
  }

  static areRequiredArtifactsDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return false;

    const manifest = readInstallManifest();
    return resolveArtifacts(entry).every((item) => (
      isArtifactDownloaded(entry, item.key, item.artifact, manifest)
    ));
  }

  /**
   * Get the local file URI for a downloaded model.
   */
  static getLocalPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return null;
    return getArtifactPath(entry, 'model', getPrimaryArtifact(entry));
  }

  static getMultimodalProjectorPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    return entry ? getArtifactPath(entry, 'multimodalProjector', entry.multimodalProjector) : null;
  }

  static getVocoderPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    return entry ? getArtifactPath(entry, 'vocoder', entry.vocoder) : null;
  }

  static getAudioOutputModelPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    return entry ? getArtifactPath(entry, 'audioOutputModel', entry.audioOutputModel) : null;
  }

  static hasMultimodalAssets(modelId: string): boolean {
    return this.isMultimodalProjectorDownloaded(modelId);
  }

  static hasVocoderAssets(modelId: string): boolean {
    return this.isVocoderDownloaded(modelId);
  }

  static hasAnyOnDeviceAudioOutputAssets(preferredModelId?: string | null): boolean {
    return !!this.findDownloadedOnDeviceAudioOutputModelId(preferredModelId);
  }

  /**
   * Get available disk space in bytes.
   */
  static getFreeDiskSpace(): number {
    if (!supportsNativeModelStorage()) {
      return Number.MAX_SAFE_INTEGER;
    }

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
    options: StartDownloadOptions = {},
  ): Promise<void> {
    if (!supportsNativeModelStorage()) {
      callbacks.onError?.('On-device model downloads are unavailable on web.');
      return;
    }

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
    if (!modelsDir) {
      callbacks.onError?.('Native model storage is unavailable on this platform.');
      return;
    }

    if (!modelsDir.exists) {
      modelsDir.create({ idempotent: true, intermediates: true });
    }

    const artifacts = resolveArtifacts(entry);
    purgeInvalidArtifacts(entry, !!options.forceRedownload);

    const totalBytes = artifacts.reduce((sum, item) => sum + item.artifact.sizeBytes, 0);
    const manifest = readInstallManifest();
    const alreadyDownloadedBytes = artifacts.reduce(
      (sum, item) => sum + (
        isArtifactDownloaded(entry, item.key, item.artifact, manifest)
          ? item.artifact.sizeBytes
          : 0
      ),
      0,
    );
    const missingBytes = Math.max(totalBytes - alreadyDownloadedBytes, 0);

    // Check disk space
    const freeSpace = this.getFreeDiskSpace();
    if (freeSpace < missingBytes * 1.1) {
      const needed = Math.ceil(missingBytes / (1024 * 1024 * 1024) * 10) / 10;
      callbacks.onError?.(`Insufficient disk space. Need ${needed} GB free.`);
      return;
    }

    // If already fully downloaded, skip
    if (alreadyDownloadedBytes >= totalBytes * 0.95 && this.areRequiredArtifactsDownloaded(modelId)) {
      const localPath = this.getLocalPath(modelId);
      this.emitProgress('complete', 100, totalBytes, totalBytes);
      callbacks.onComplete?.(localPath || getModelFile(entry.filename)?.uri || '');
      return;
    }

    this.emitProgress('checking', Math.round((alreadyDownloadedBytes / totalBytes) * 100), alreadyDownloadedBytes, totalBytes);

    try {
      let confirmedBytes = alreadyDownloadedBytes;
      this.emitProgress('downloading', Math.max(1, Math.round((confirmedBytes / totalBytes) * 100)), confirmedBytes, totalBytes);

      for (const item of artifacts) {
        const { artifact } = item;
        if (isArtifactDownloaded(entry, item.key, artifact)) {
          continue;
        }

        const downloadUrl = `${artifact.cdnBase || entry.cdnBase}/${artifact.filename}`;
        const progressInterval = setInterval(() => {
          if (this.aborted) {
            clearInterval(progressInterval);
            return;
          }

          try {
            const tempFile = getModelFile(artifact.filename);
            const currentSize = tempFile?.exists ? tempFile.size : 0;
            const bytesDownloaded = Math.min(confirmedBytes + currentSize, totalBytes);
            const percent = Math.min(Math.round((bytesDownloaded / totalBytes) * 100), 99);
            const elapsedMs = Date.now() - this.downloadStartTime;
            const speedBps = elapsedMs > 0 ? (bytesDownloaded / elapsedMs) * 1000 : 0;
            const remainingBytes = totalBytes - bytesDownloaded;
            const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;

            this.emitProgress('downloading', percent, bytesDownloaded, totalBytes, speedBps, etaSeconds);
          } catch {
            // File may not exist yet during initial download phase
          }
        }, 1000);

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

        if (!result.exists) {
          throw new Error(`Downloaded file not found after downloading ${artifact.filename}.`);
        }

        if (result.size < artifact.sizeBytes * 0.95) {
          result.delete();
          throw new Error(`Download incomplete for ${artifact.filename}: got ${result.size} bytes, expected ~${artifact.sizeBytes}`);
        }

        confirmedBytes += artifact.sizeBytes;
      }

      if (this.aborted) return;

      this.emitProgress('verifying', 99, totalBytes, totalBytes);
      recordInstalledArtifacts(entry);
      this.emitProgress('complete', 100, totalBytes, totalBytes);
      callbacks.onComplete?.(getModelFile(entry.filename)?.uri || '');

    } catch (error) {
      if (this.aborted) return;
      const msg = error instanceof Error ? error.message : String(error);
      this.emitProgress('error', 0, 0, totalBytes, 0, 0, msg);
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
        for (const item of resolveArtifacts(entry)) {
          try {
            const file = getModelFile(item.artifact.filename);
            if (file?.exists) file.delete();
          } catch { /* ignore */ }
        }
        clearInstallRecord(modelId);
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
      for (const item of resolveArtifacts(entry)) {
        const file = getModelFile(item.artifact.filename);
        if (file?.exists) {
          file.delete();
        }
      }
      clearInstallRecord(modelId);
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
      const path = this.getLocalPath(id);
      if (path) {
        const sizeBytes = resolveArtifacts(entry).reduce((sum, item) => {
          const file = getModelFile(item.artifact.filename);
          return sum + (file?.exists ? file.size : 0);
        }, 0);
        results.push({ modelId: id, path, sizeBytes });
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
