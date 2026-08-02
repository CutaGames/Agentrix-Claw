/**
 * World Engine Local Cache — Task 16.1
 *
 * Implements:
 * - Local 3D asset cache (max 500MB, LRU eviction)
 * - Degraded mode for low-spec devices (2-4GB RAM, iOS 15/Android 11)
 * - Push notification on generation completion
 * - 3-minute global timeout with error display and retry
 * - Progress percentage updates every 3 seconds
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8, 10.10
 */

import * as FileSystem from 'expo-file-system';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ============================================================
// Constants
// ============================================================

/** Maximum cache size: 500MB */
const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024;

/** Cache directory path */
const CACHE_DIR = `${FileSystem.cacheDirectory}world-engine-assets/`;

/** Global generation timeout: 3 minutes */
const GENERATION_TIMEOUT_MS = 3 * 60 * 1000;

/** Progress poll interval: 3 seconds */
const PROGRESS_POLL_INTERVAL_MS = 3_000;

/** Low-spec device RAM threshold: 4GB */
const LOW_SPEC_RAM_THRESHOLD_MB = 4096;

/** Minimum RAM for full 3D: 4GB */
const MIN_RAM_FOR_3D_MB = 4096;

// ============================================================
// Types
// ============================================================

export interface CacheEntry {
  assetId: string;
  filePath: string;
  sizeBytes: number;
  lastAccessedAt: number;
  meshType: 'glb' | 'gif' | 'png';
}

export interface DeviceCapabilityProfile {
  /** Whether the device supports full 3D rendering */
  supports3D: boolean;
  /** Whether the device is in degraded mode */
  degradedMode: boolean;
  /** Total RAM in MB */
  totalRamMb: number;
  /** OS version */
  osVersion: string;
  /** Reason for degraded mode (if applicable) */
  degradedReason?: string;
}

export interface GenerationProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Current stage description */
  stage: string;
  /** Estimated time remaining in seconds */
  estimatedSecondsRemaining: number;
  /** Whether the generation has completed */
  completed: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================================
// Device Capability Detection (R10.5, R10.8)
// ============================================================

/**
 * Detect device capabilities and determine if degraded mode is needed.
 *
 * Degraded mode activates for:
 * - Devices with 2-4GB RAM
 * - iOS 15 / Android 11 (minimum supported versions)
 *
 * In degraded mode:
 * - Static scan guide (no AR overlay)
 * - 2D preview instead of 3D viewer
 * - Reduced texture resolution
 *
 * Requirements: 10.5, 10.8
 */
export function detectDeviceCapabilities(): DeviceCapabilityProfile {
  const totalRamMb = Device.totalMemory
    ? Math.round(Device.totalMemory / (1024 * 1024))
    : 8192; // Default to 8GB if unknown

  const osVersion = Device.osVersion || '0';
  const majorVersion = parseInt(osVersion.split('.')[0], 10) || 0;

  let degradedMode = false;
  let degradedReason: string | undefined;

  // Check RAM
  if (totalRamMb < MIN_RAM_FOR_3D_MB) {
    degradedMode = true;
    degradedReason = `Low RAM: ${totalRamMb}MB (minimum ${MIN_RAM_FOR_3D_MB}MB for 3D)`;
  }

  // Check OS version
  if (Platform.OS === 'ios' && majorVersion <= 15) {
    degradedMode = true;
    degradedReason = `iOS ${osVersion} (minimum iOS 16 for full 3D)`;
  } else if (Platform.OS === 'android' && majorVersion <= 11) {
    degradedMode = true;
    degradedReason = `Android ${osVersion} (minimum Android 12 for full 3D)`;
  }

  return {
    supports3D: !degradedMode,
    degradedMode,
    totalRamMb,
    osVersion,
    degradedReason,
  };
}

// ============================================================
// LRU Cache Management (R10.1, R10.2)
// ============================================================

/** In-memory cache index (persisted to disk on changes) */
let cacheIndex: CacheEntry[] = [];
let cacheInitialized = false;

/**
 * Initialize the cache directory and load the index.
 */
export async function initCache(): Promise<void> {
  if (cacheInitialized) return;

  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }

    // Load cache index from disk
    const indexPath = `${CACHE_DIR}index.json`;
    const indexInfo = await FileSystem.getInfoAsync(indexPath);
    if (indexInfo.exists) {
      const content = await FileSystem.readAsStringAsync(indexPath);
      cacheIndex = JSON.parse(content);
    }

    cacheInitialized = true;
  } catch (error) {
    console.warn('[WorldEngineCache] Init failed:', error);
    cacheIndex = [];
    cacheInitialized = true;
  }
}

/**
 * Get a cached asset file path, or null if not cached.
 * Updates the LRU access timestamp.
 */
export async function getCachedAsset(
  assetId: string,
  meshType: 'glb' | 'gif' | 'png' = 'glb',
): Promise<string | null> {
  await initCache();

  const entry = cacheIndex.find(
    (e) => e.assetId === assetId && e.meshType === meshType,
  );

  if (!entry) return null;

  // Verify file still exists
  const fileInfo = await FileSystem.getInfoAsync(entry.filePath);
  if (!fileInfo.exists) {
    // Remove stale entry
    cacheIndex = cacheIndex.filter((e) => e !== entry);
    await saveCacheIndex();
    return null;
  }

  // Update LRU timestamp
  entry.lastAccessedAt = Date.now();
  await saveCacheIndex();

  return entry.filePath;
}

/**
 * Cache a downloaded asset file.
 * Evicts LRU entries if cache exceeds 500MB.
 */
export async function cacheAsset(
  assetId: string,
  sourceUrl: string,
  meshType: 'glb' | 'gif' | 'png' = 'glb',
): Promise<string> {
  await initCache();

  const fileName = `${assetId}.${meshType}`;
  const filePath = `${CACHE_DIR}${fileName}`;

  // Download the file
  const downloadResult = await FileSystem.downloadAsync(sourceUrl, filePath);

  if (downloadResult.status !== 200) {
    throw new Error(`Download failed: HTTP ${downloadResult.status}`);
  }

  // Get file size
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  const sizeBytes = (fileInfo as any).size || 0;

  // Add to cache index
  const existingIdx = cacheIndex.findIndex(
    (e) => e.assetId === assetId && e.meshType === meshType,
  );
  if (existingIdx >= 0) {
    cacheIndex[existingIdx] = {
      assetId,
      filePath,
      sizeBytes,
      lastAccessedAt: Date.now(),
      meshType,
    };
  } else {
    cacheIndex.push({
      assetId,
      filePath,
      sizeBytes,
      lastAccessedAt: Date.now(),
      meshType,
    });
  }

  // Evict if over size limit
  await evictIfNeeded();
  await saveCacheIndex();

  return filePath;
}

/**
 * Evict LRU entries until cache is under 500MB.
 */
async function evictIfNeeded(): Promise<void> {
  let totalSize = cacheIndex.reduce((sum, e) => sum + e.sizeBytes, 0);

  // Sort by last accessed (oldest first)
  const sorted = [...cacheIndex].sort(
    (a, b) => a.lastAccessedAt - b.lastAccessedAt,
  );

  while (totalSize > MAX_CACHE_SIZE_BYTES && sorted.length > 0) {
    const oldest = sorted.shift()!;
    totalSize -= oldest.sizeBytes;

    // Delete file
    try {
      await FileSystem.deleteAsync(oldest.filePath, { idempotent: true });
    } catch {
      // Ignore deletion errors
    }

    // Remove from index
    cacheIndex = cacheIndex.filter((e) => e !== oldest);
  }
}

/**
 * Save the cache index to disk.
 */
async function saveCacheIndex(): Promise<void> {
  try {
    const indexPath = `${CACHE_DIR}index.json`;
    await FileSystem.writeAsStringAsync(indexPath, JSON.stringify(cacheIndex));
  } catch (error) {
    console.warn('[WorldEngineCache] Failed to save index:', error);
  }
}

/**
 * Get current cache size in bytes.
 */
export function getCacheSize(): number {
  return cacheIndex.reduce((sum, e) => sum + e.sizeBytes, 0);
}

/**
 * Clear the entire cache.
 */
export async function clearCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    cacheIndex = [];
    cacheInitialized = false;
  } catch (error) {
    console.warn('[WorldEngineCache] Clear failed:', error);
  }
}

// ============================================================
// Generation Progress Tracking (R10.3, R10.4)
// ============================================================

/**
 * Poll generation progress with 3-second intervals and 3-minute global timeout.
 *
 * @param jobId - The generation job ID
 * @param onProgress - Callback for progress updates
 * @param apiBaseUrl - Backend API base URL
 * @returns Final generation result
 *
 * Requirements: 10.3, 10.4
 */
export async function trackGenerationProgress(
  jobId: string,
  onProgress: (progress: GenerationProgress) => void,
  apiBaseUrl: string,
): Promise<{ success: boolean; assetId?: string; error?: string }> {
  const startTime = Date.now();
  let lastProgress: GenerationProgress = {
    percent: 0,
    stage: 'Initializing...',
    estimatedSecondsRemaining: 60,
    completed: false,
  };

  return new Promise((resolve) => {
    const pollInterval = setInterval(async () => {
      // Check global timeout (3 minutes)
      const elapsed = Date.now() - startTime;
      if (elapsed >= GENERATION_TIMEOUT_MS) {
        clearInterval(pollInterval);
        const timeoutProgress: GenerationProgress = {
          percent: lastProgress.percent,
          stage: 'Timeout',
          estimatedSecondsRemaining: 0,
          completed: true,
          error: '生成超时（3分钟）。请重试。',
        };
        onProgress(timeoutProgress);
        resolve({ success: false, error: 'Generation timed out (3 minutes)' });
        return;
      }

      try {
        // Poll backend for status
        const response = await fetch(
          `${apiBaseUrl}/api/v1/world-engine/jobs/${jobId}/status`,
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        lastProgress = {
          percent: data.progress || 0,
          stage: data.stage || 'Processing...',
          estimatedSecondsRemaining: data.estimatedSecondsRemaining || 0,
          completed: data.status === 'completed' || data.status === 'failed',
          error: data.error,
        };

        onProgress(lastProgress);

        if (lastProgress.completed) {
          clearInterval(pollInterval);
          if (data.status === 'completed') {
            resolve({ success: true, assetId: data.resultAssetId });
          } else {
            resolve({ success: false, error: data.error || 'Generation failed' });
          }
        }
      } catch (error) {
        // Network error — don't fail immediately, keep polling
        console.warn('[WorldEngineCache] Progress poll failed:', error);
      }
    }, PROGRESS_POLL_INTERVAL_MS);
  });
}

// ============================================================
// Push Notifications (R10.10)
// ============================================================

/**
 * Schedule a push notification for generation completion.
 * Called when user navigates away during generation.
 *
 * Requirements: 10.10
 */
export async function scheduleGenerationCompleteNotification(
  assetName: string,
): Promise<string | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎮 世界资产生成完成',
        body: `"${assetName}" 已准备就绪！点击查看。`,
        data: { type: 'world_engine_generation_complete' },
      },
      trigger: null, // Immediate (will be replaced by server-triggered in production)
    });

    return notificationId;
  } catch (error) {
    console.warn('[WorldEngineCache] Notification scheduling failed:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification (e.g., user returns to app before completion).
 */
export async function cancelGenerationNotification(
  notificationId: string,
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Ignore
  }
}
