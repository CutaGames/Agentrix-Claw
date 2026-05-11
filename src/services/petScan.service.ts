/**
 * petScan.service — Sprint 5 · Task 5.6
 *
 * Multi-angle photo upload service for 3D pet reconstruction.
 * Users capture 8-12 photos from different angles, which are uploaded
 * to the backend NeRF/SfM pipeline for .vrm model generation.
 *
 * API endpoints:
 *   POST /api/v1/pet-generation/scan   — submit photos for 3D reconstruction
 *   GET  /api/v1/pet-generation/scan/:taskId — poll task status
 */
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { apiFetch } from './api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScanSubmitResponse {
  /** Unique task identifier for polling */
  taskId: string;
  /** Current processing status */
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

export interface ScanResultResponse {
  /** Current processing status */
  status: 'queued' | 'processing' | 'completed' | 'failed';
  /** URL to the generated .vrm model (available when completed) */
  vrmUrl?: string;
  /** URL to a preview thumbnail (available when completed) */
  thumbnailUrl?: string;
  /** Error message (available when failed) */
  error?: string;
  /** Processing progress percentage (0-100) */
  progress?: number;
}

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Upload multiple photos for 3D reconstruction.
 *
 * Accepts an array of local file URIs (from expo-camera or image picker).
 * Photos are uploaded as multipart form data to the scan endpoint.
 *
 * @param photos - Array of local file URIs (file://, content://, ph://)
 * @returns Task submission response with taskId for polling
 */
export async function submitScanPhotos(photos: string[]): Promise<ScanSubmitResponse> {
  if (!photos.length) {
    throw new Error('At least one photo is required');
  }

  const formData = new FormData();

  for (let i = 0; i < photos.length; i++) {
    const uri = photos[i];
    const fileName = `scan_angle_${i + 1}.jpg`;

    // Handle content:// and ph:// URIs on Android/iOS
    let payload: any;
    if (uri.startsWith('content://') || uri.startsWith('ph://')) {
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64' as any,
        });
        payload = {
          uri: `data:image/jpeg;base64,${base64}`,
          name: fileName,
          type: 'image/jpeg',
        };
      } catch (err: any) {
        console.warn(`[petScan] Failed to read photo ${i}: ${err?.message}`);
        // Fall back to raw URI
        payload = { uri, name: fileName, type: 'image/jpeg' };
      }
    } else {
      payload = { uri, name: fileName, type: 'image/jpeg' };
    }

    formData.append('photos', payload as any);
  }

  // Add metadata
  formData.append('photoCount', String(photos.length));
  formData.append('platform', Platform.OS);

  return apiFetch<ScanSubmitResponse>('/pet-generation/scan', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Poll for scan task completion.
 *
 * Call this periodically after submitScanPhotos to check if the
 * 3D reconstruction is complete.
 *
 * @param taskId - Task ID returned from submitScanPhotos
 * @returns Current task status with optional result URLs
 */
export async function getScanTaskStatus(taskId: string): Promise<ScanResultResponse> {
  if (!taskId) {
    throw new Error('taskId is required');
  }

  return apiFetch<ScanResultResponse>(
    `/pet-generation/scan/${encodeURIComponent(taskId)}`,
  );
}

/**
 * Cancel a pending scan task.
 *
 * @param taskId - Task ID to cancel
 */
export async function cancelScanTask(taskId: string): Promise<void> {
  if (!taskId) return;

  try {
    await apiFetch(`/pet-generation/scan/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    });
  } catch {
    // Non-critical — task may already be completed or cancelled
  }
}

/**
 * Helper: Poll until task completes or fails.
 *
 * @param taskId - Task ID to poll
 * @param options - Polling options
 * @returns Final task result
 */
export async function pollScanUntilDone(
  taskId: string,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    onProgress?: (progress: number) => void;
  } = {},
): Promise<ScanResultResponse> {
  const { intervalMs = 3000, maxAttempts = 60, onProgress } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await getScanTaskStatus(taskId);

    if (result.progress && onProgress) {
      onProgress(result.progress);
    }

    if (result.status === 'completed' || result.status === 'failed') {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    status: 'failed',
    error: 'Polling timeout — task did not complete within expected time',
  };
}
