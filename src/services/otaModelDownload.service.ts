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
import { addVoiceDiagnostic } from './voiceDiagnostics';

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

export type OtaModelArtifactKey = 'model' | 'multimodalProjector' | 'audioOutputModel' | 'vocoder';

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

export interface StartupPackageMigrationResult {
  invalidatedModelIds: string[];
  removedArtifacts: string[];
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
    packageRevision: '2026-04-13-gemma4-e2b-r2',
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
    packageRevision: '2026-04-13-gemma4-e4b-r2',
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
  currentArtifactKey?: OtaModelArtifactKey;
  currentArtifactFilename?: string;
  currentArtifactIndex?: number;
  artifactCount?: number;
}

export interface DownloadCallbacks {
  onProgress?: (progress: DownloadProgress) => void;
  onComplete?: (localPath: string) => void;
  onError?: (error: string) => void;
}

export interface ModelArtifactStatus {
  key: OtaModelArtifactKey;
  kind: OtaModelArtifact['kind'];
  filename: string;
  sizeBytes: number;
  sizeLabel: string;
  downloaded: boolean;
  required: boolean;
}

interface OtaE2EMockState {
  downloadedArtifactKeys: OtaModelArtifactKey[];
  nextDownloadError: string | null;
}

// ── Helpers ────────────────────────────────────────────

function supportsNativeModelStorage(): boolean {
  return Platform.OS !== 'web';
}

function supportsOtaE2EMock(): boolean {
  const runtime = globalThis as typeof globalThis & {
    __AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__?: boolean;
  };

  return Platform.OS === 'web' && !!runtime.__AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__;
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

function upsertInstallRecord(
  entry: OtaModelEntry,
  patch: Partial<OtaInstallManifestRecord>,
): OtaInstallManifestRecord {
  const manifest = readInstallManifest();
  const nextRecord: OtaInstallManifestRecord = {
    packageRevision: getExpectedPackageRevision(entry),
    installedAt: Date.now(),
    ...manifest[entry.id],
    ...patch,
    artifacts: {
      ...(manifest[entry.id]?.artifacts || {}),
      ...(patch.artifacts || {}),
    },
  };

  manifest[entry.id] = nextRecord;
  writeInstallManifest(manifest);
  return nextRecord;
}

function recordInstalledArtifact(
  entry: OtaModelEntry,
  key: OtaModelArtifactKey,
  artifact: OtaModelArtifact,
): void {
  upsertInstallRecord(entry, {
    installedAt: Date.now(),
    artifacts: {
      [key]: artifact.filename,
    },
  });
}

function recordInstalledArtifacts(entry: OtaModelEntry): void {
  const artifacts = resolveArtifacts(entry).reduce<Partial<Record<OtaModelArtifactKey, string>>>(
    (acc, item) => {
      acc[item.key] = item.artifact.filename;
      return acc;
    },
    {},
  );

  upsertInstallRecord(entry, {
    installedAt: Date.now(),
    artifacts,
  });
}

function clearArtifactInstallRecord(modelId: string, key: OtaModelArtifactKey): void {
  const manifest = readInstallManifest();
  const currentRecord = manifest[modelId];
  if (!currentRecord?.artifacts[key]) {
    return;
  }

  const nextArtifacts = { ...currentRecord.artifacts };
  delete nextArtifacts[key];

  if (Object.keys(nextArtifacts).length === 0) {
    delete manifest[modelId];
  } else {
    manifest[modelId] = {
      ...currentRecord,
      installedAt: Date.now(),
      artifacts: nextArtifacts,
    };
  }

  if (Object.keys(manifest).length === 0) {
    const manifestFile = getInstallManifestFile();
    if (manifestFile?.exists) {
      manifestFile.delete();
    }
    return;
  }

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

  for (const item of resolveArtifacts(entry)) {
    const file = getModelFile(item.artifact.filename);
    if (!file?.exists) {
      if (forceRedownload) {
        clearArtifactInstallRecord(entry.id, item.key);
      }
      continue;
    }

    if (forceRedownload || !isArtifactDownloaded(entry, item.key, item.artifact, manifest)) {
      file.delete();
      clearArtifactInstallRecord(entry.id, item.key);
    }
  }

  if (forceRedownload) {
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
  private static startupMigrationResult: StartupPackageMigrationResult | null = null;
  private static e2eMockStates: Record<string, OtaE2EMockState> = {};

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

  static configureE2EMockState(modelId: string, patch: Partial<OtaE2EMockState>): void {
    const entry = MODEL_REGISTRY[modelId];
    const mockState = this.getE2EMockState(modelId);
    if (!entry || !mockState) {
      return;
    }

    const validKeys = new Set(resolveArtifacts(entry).map((item) => item.key));

    if (Object.prototype.hasOwnProperty.call(patch, 'downloadedArtifactKeys')) {
      const nextKeys = patch.downloadedArtifactKeys ?? [];
      mockState.downloadedArtifactKeys = Array.from(new Set(nextKeys.filter((key): key is OtaModelArtifactKey => validKeys.has(key))));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'nextDownloadError')) {
      mockState.nextDownloadError = patch.nextDownloadError ?? null;
    }
  }

  static resetE2EMockState(modelId?: string): void {
    if (modelId) {
      delete this.e2eMockStates[modelId];
      return;
    }

    this.e2eMockStates = {};
  }

  static getArtifactStatuses(modelId: string): ModelArtifactStatus[] {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) {
      return [];
    }

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return resolveArtifacts(entry).map((item) => ({
        key: item.key,
        kind: item.artifact.kind,
        filename: item.artifact.filename,
        sizeBytes: item.artifact.sizeBytes,
        sizeLabel: item.artifact.sizeLabel,
        downloaded: e2eDownloadedArtifactKeys.has(item.key),
        required: true,
      }));
    }

    const manifest = readInstallManifest();
    return resolveArtifacts(entry).map((item) => ({
      key: item.key,
      kind: item.artifact.kind,
      filename: item.artifact.filename,
      sizeBytes: item.artifact.sizeBytes,
      sizeLabel: item.artifact.sizeLabel,
      downloaded: isArtifactDownloaded(entry, item.key, item.artifact, manifest),
      required: true,
    }));
  }

  static runStartupPackageMigration(): StartupPackageMigrationResult {
    if (this.startupMigrationResult) {
      return this.startupMigrationResult;
    }

    const result: StartupPackageMigrationResult = {
      invalidatedModelIds: [],
      removedArtifacts: [],
    };

    if (!supportsNativeModelStorage()) {
      this.startupMigrationResult = result;
      return result;
    }

    const manifest = readInstallManifest();

    for (const entry of Object.values(MODEL_REGISTRY)) {
      if (!requiresInstallManifest(entry)) {
        continue;
      }

      let removedPrimaryArtifact = false;

      for (const item of resolveArtifacts(entry)) {
        if (!isArtifactFilePresent(item.artifact)) {
          if (manifest[entry.id]?.artifacts[item.key]) {
            clearArtifactInstallRecord(entry.id, item.key);
          }
          continue;
        }

        if (isArtifactDownloaded(entry, item.key, item.artifact, manifest)) {
          continue;
        }

        const file = getModelFile(item.artifact.filename);
        if (file?.exists) {
          file.delete();
          result.removedArtifacts.push(item.artifact.filename);
          if (item.key === 'model') {
            removedPrimaryArtifact = true;
          }
        }
        clearArtifactInstallRecord(entry.id, item.key);
      }

      if (removedPrimaryArtifact) {
        result.invalidatedModelIds.push(entry.id);
      }
    }

    if (result.invalidatedModelIds.length > 0 || result.removedArtifacts.length > 0) {
      addVoiceDiagnostic('local-model-download', 'startup-migration', result);
    }
    this.startupMigrationResult = result;
    return result;
  }

  /**
   * Check if a model is already downloaded and available locally.
   */
  static isModelDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) return false;

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('model');
    }
    return isArtifactDownloaded(entry, 'model', getPrimaryArtifact(entry));
  }

  static isMultimodalProjectorDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.multimodalProjector) return false;

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('multimodalProjector');
    }
    return isArtifactDownloaded(entry, 'multimodalProjector', entry.multimodalProjector);
  }

  static isVocoderDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.vocoder) return false;

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('vocoder');
    }
    return isArtifactDownloaded(entry, 'vocoder', entry.vocoder);
  }

  static isAudioOutputModelDownloaded(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.audioOutputModel) return false;

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('audioOutputModel');
    }
    return isArtifactDownloaded(entry, 'audioOutputModel', entry.audioOutputModel);
  }

  static hasOnDeviceAudioOutputAssets(modelId: string): boolean {
    const entry = MODEL_REGISTRY[modelId];
    if (!entry?.audioOutputModel || !entry.vocoder) return false;
    return this.isAudioOutputModelDownloaded(modelId)
      && this.isVocoderDownloaded(modelId);
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

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return resolveArtifacts(entry).every((item) => e2eDownloadedArtifactKeys.has(item.key));
    }
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

    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('model') ? `e2e://models/${entry.filename}` : null;
    }
    return getArtifactPath(entry, 'model', getPrimaryArtifact(entry));
  }

  static getMultimodalProjectorPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (entry && e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('multimodalProjector')
        ? `e2e://models/${entry.multimodalProjector?.filename || 'mmproj.gguf'}`
        : null;
    }
    return entry ? getArtifactPath(entry, 'multimodalProjector', entry.multimodalProjector) : null;
  }

  static getVocoderPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (entry && e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('vocoder')
        ? `e2e://models/${entry.vocoder?.filename || 'vocoder.gguf'}`
        : null;
    }
    return entry ? getArtifactPath(entry, 'vocoder', entry.vocoder) : null;
  }

  static getAudioOutputModelPath(modelId: string): string | null {
    const entry = MODEL_REGISTRY[modelId];
    const e2eDownloadedArtifactKeys = this.getE2EMockDownloadedArtifactKeys(modelId);
    if (entry && e2eDownloadedArtifactKeys) {
      return e2eDownloadedArtifactKeys.has('audioOutputModel')
        ? `e2e://models/${entry.audioOutputModel?.filename || 'speech-model.gguf'}`
        : null;
    }
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
    const entry = MODEL_REGISTRY[modelId];
    if (!entry) {
      callbacks.onError?.(`Unknown model: ${modelId}`);
      return;
    }

    if (supportsOtaE2EMock()) {
      await this.startE2EMockDownload(modelId, entry, callbacks, options);
      return;
    }

    if (!supportsNativeModelStorage()) {
      callbacks.onError?.('On-device model downloads are unavailable on web.');
      return;
    }

    this.callbacks = callbacks;
    this.downloadStartTime = Date.now();
    this.aborted = false;
    this.startupMigrationResult = null;

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

    addVoiceDiagnostic('local-model-download', 'start', {
      modelId,
      forceRedownload: !!options.forceRedownload,
      artifactCount: artifacts.length,
      alreadyDownloadedBytes,
      totalBytes,
      artifacts: artifacts.map((item) => ({
        key: item.key,
        filename: item.artifact.filename,
        sizeBytes: item.artifact.sizeBytes,
      })),
    });

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
      this.emitProgress('complete', 100, totalBytes, totalBytes, 0, 0, undefined, {
        artifactCount: artifacts.length,
      });
      addVoiceDiagnostic('local-model-download', 'already-complete', {
        modelId,
        totalBytes,
      });
      callbacks.onComplete?.(localPath || getModelFile(entry.filename)?.uri || '');
      return;
    }

    this.emitProgress('checking', Math.round((alreadyDownloadedBytes / totalBytes) * 100), alreadyDownloadedBytes, totalBytes, 0, 0, undefined, {
      artifactCount: artifacts.length,
    });

    try {
      let confirmedBytes = alreadyDownloadedBytes;
      this.emitProgress('downloading', Math.max(1, Math.round((confirmedBytes / totalBytes) * 100)), confirmedBytes, totalBytes, 0, 0, undefined, {
        artifactCount: artifacts.length,
      });

      for (let index = 0; index < artifacts.length; index += 1) {
        const item = artifacts[index];
        const { artifact } = item;
        if (isArtifactDownloaded(entry, item.key, artifact)) {
          continue;
        }

        const downloadUrl = `${artifact.cdnBase || entry.cdnBase}/${artifact.filename}`;
        addVoiceDiagnostic('local-model-download', 'artifact-start', {
          modelId,
          key: item.key,
          filename: artifact.filename,
          sizeBytes: artifact.sizeBytes,
          index: index + 1,
          artifactCount: artifacts.length,
        });

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

            this.emitProgress('downloading', percent, bytesDownloaded, totalBytes, speedBps, etaSeconds, undefined, {
              currentArtifactKey: item.key,
              currentArtifactFilename: artifact.filename,
              currentArtifactIndex: index + 1,
              artifactCount: artifacts.length,
            });
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
        recordInstalledArtifact(entry, item.key, artifact);
        addVoiceDiagnostic('local-model-download', 'artifact-complete', {
          modelId,
          key: item.key,
          filename: artifact.filename,
          sizeBytes: artifact.sizeBytes,
          confirmedBytes,
          totalBytes,
        });
      }

      if (this.aborted) return;

      this.emitProgress('verifying', 99, totalBytes, totalBytes, 0, 0, undefined, {
        artifactCount: artifacts.length,
      });
      recordInstalledArtifacts(entry);
      this.emitProgress('complete', 100, totalBytes, totalBytes, 0, 0, undefined, {
        artifactCount: artifacts.length,
      });
      addVoiceDiagnostic('local-model-download', 'package-complete', {
        modelId,
        totalBytes,
        artifactCount: artifacts.length,
      });
      callbacks.onComplete?.(getModelFile(entry.filename)?.uri || '');

    } catch (error) {
      if (this.aborted) return;
      const msg = error instanceof Error ? error.message : String(error);
      this.emitProgress('error', 0, 0, totalBytes, 0, 0, msg, {
        artifactCount: artifacts.length,
      });
      addVoiceDiagnostic('local-model-download', 'error', {
        modelId,
        message: msg,
      });
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

    if (supportsOtaE2EMock()) {
      this.configureE2EMockState(modelId, { downloadedArtifactKeys: [], nextDownloadError: null });
      return true;
    }

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
    extras: Partial<DownloadProgress> = {},
  ): void {
    this.callbacks.onProgress?.({
      state,
      percent: Math.min(percent, 100),
      bytesDownloaded,
      bytesTotal,
      speedBps,
      etaSeconds,
      error,
      ...extras,
    });
  }

  private static getE2EMockState(modelId: string): OtaE2EMockState | null {
    if (!supportsOtaE2EMock()) {
      return null;
    }

    if (!this.e2eMockStates[modelId]) {
      this.e2eMockStates[modelId] = {
        downloadedArtifactKeys: [],
        nextDownloadError: null,
      };
    }

    return this.e2eMockStates[modelId];
  }

  private static getE2EMockDownloadedArtifactKeys(modelId: string): Set<OtaModelArtifactKey> | null {
    const mockState = this.getE2EMockState(modelId);
    if (!mockState) {
      return null;
    }

    return new Set(mockState.downloadedArtifactKeys);
  }

  private static async startE2EMockDownload(
    modelId: string,
    entry: OtaModelEntry,
    callbacks: DownloadCallbacks,
    options: StartDownloadOptions,
  ): Promise<void> {
    const mockState = this.getE2EMockState(modelId);
    if (!mockState) {
      callbacks.onError?.('OTA E2E mock is unavailable.');
      return;
    }

    this.callbacks = callbacks;
    this.downloadStartTime = Date.now();
    this.aborted = false;
    this.startupMigrationResult = null;

    if (options.forceRedownload) {
      mockState.downloadedArtifactKeys = [];
    }

    const artifacts = resolveArtifacts(entry);
    const totalBytes = artifacts.reduce((sum, item) => sum + item.artifact.sizeBytes, 0);
    let downloadedArtifactKeys = new Set(mockState.downloadedArtifactKeys);
    let confirmedBytes = artifacts.reduce(
      (sum, item) => sum + (downloadedArtifactKeys.has(item.key) ? item.artifact.sizeBytes : 0),
      0,
    );

    const missingArtifacts = artifacts.filter((item) => !downloadedArtifactKeys.has(item.key));

    if (missingArtifacts.length === 0) {
      this.emitProgress('complete', 100, totalBytes, totalBytes, 0, 0, undefined, {
        artifactCount: artifacts.length,
      });
      callbacks.onComplete?.(`e2e://models/${entry.filename}`);
      return;
    }

    this.emitProgress(
      'checking',
      Math.round((confirmedBytes / totalBytes) * 100),
      confirmedBytes,
      totalBytes,
      0,
      0,
      undefined,
      { artifactCount: artifacts.length },
    );

    for (let index = 0; index < missingArtifacts.length; index += 1) {
      if (this.aborted) {
        return;
      }

      const item = missingArtifacts[index];
      const artifactProgressBytes = Math.max(Math.floor(item.artifact.sizeBytes * 0.65), 1);
      const previewBytesDownloaded = Math.min(confirmedBytes + artifactProgressBytes, totalBytes);
      const previewPercent = Math.min(Math.max(Math.round((previewBytesDownloaded / totalBytes) * 100), 1), 99);

      this.emitProgress('downloading', previewPercent, previewBytesDownloaded, totalBytes, item.artifact.sizeBytes * 4, 1, undefined, {
        currentArtifactKey: item.key,
        currentArtifactFilename: item.artifact.filename,
        currentArtifactIndex: index + 1,
        artifactCount: missingArtifacts.length,
      });
      await this.waitForE2EMockTick();

      if (this.aborted) {
        return;
      }

      if (mockState.nextDownloadError) {
        const errorMessage = mockState.nextDownloadError;
        mockState.nextDownloadError = null;
        this.emitProgress('error', previewPercent, confirmedBytes, totalBytes, 0, 0, errorMessage, {
          currentArtifactKey: item.key,
          currentArtifactFilename: item.artifact.filename,
          currentArtifactIndex: index + 1,
          artifactCount: missingArtifacts.length,
        });
        callbacks.onError?.(errorMessage);
        return;
      }

      downloadedArtifactKeys.add(item.key);
      mockState.downloadedArtifactKeys = Array.from(downloadedArtifactKeys);
      confirmedBytes += item.artifact.sizeBytes;
      const percent = Math.min(Math.round((confirmedBytes / totalBytes) * 100), 99);

      this.emitProgress('downloading', percent, confirmedBytes, totalBytes, item.artifact.sizeBytes * 5, 0, undefined, {
        currentArtifactKey: item.key,
        currentArtifactFilename: item.artifact.filename,
        currentArtifactIndex: index + 1,
        artifactCount: missingArtifacts.length,
      });
      await this.waitForE2EMockTick();
    }

    this.emitProgress('verifying', 99, totalBytes, totalBytes, 0, 0, undefined, {
      artifactCount: artifacts.length,
    });
    await this.waitForE2EMockTick();
    this.emitProgress('complete', 100, totalBytes, totalBytes, 0, 0, undefined, {
      artifactCount: artifacts.length,
    });
    callbacks.onComplete?.(`e2e://models/${entry.filename}`);
  }

  private static waitForE2EMockTick(delayMs = 24): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
