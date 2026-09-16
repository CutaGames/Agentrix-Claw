/**
 * Face Detection Utility — Task 18.1
 *
 * On-device face detection for World Engine scan pipeline.
 * Uses expo-camera's built-in face detection (backed by MLKit/Vision on device).
 *
 * Rejects upload if any frame contains a detectable human face
 * occupying > 5% of frame area. Does not retain the rejected image
 * beyond the rejection response.
 *
 * Phase 1: Uses expo-camera FaceDetector API (MLKit-based, ~3MB model bundled).
 * The detection runs entirely on-device — no network call needed.
 *
 * Requirements: 12.2
 */

import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Face detection result for a single frame.
 */
export interface FaceDetectionResult {
  /** Whether the frame passed (no face > 5% area) */
  passed: boolean;
  /** Number of faces detected */
  facesDetected: number;
  /** Largest face area as percentage of frame (0-100) */
  largestFaceAreaPercent: number;
  /** Rejection reason if failed */
  reason?: string;
}

/**
 * Detected face bounding box from the camera/image analysis.
 */
export interface DetectedFace {
  bounds: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
}

/** Minimum face area percentage to trigger rejection (5%) */
const FACE_AREA_THRESHOLD_PERCENT = 5;

/**
 * Check a single image frame for face detection.
 *
 * This function is called per-frame during the scan capture flow.
 * If a face occupying > 5% of the frame area is detected, the frame
 * is rejected and should NOT be uploaded or retained.
 *
 * @param faces - Array of detected faces from expo-camera onFacesDetected
 * @param frameWidth - Width of the camera frame in pixels
 * @param frameHeight - Height of the camera frame in pixels
 * @returns FaceDetectionResult indicating pass/fail
 */
export function checkFrameForFaces(
  faces: DetectedFace[],
  frameWidth: number,
  frameHeight: number,
): FaceDetectionResult {
  if (!faces || faces.length === 0) {
    return {
      passed: true,
      facesDetected: 0,
      largestFaceAreaPercent: 0,
    };
  }

  const frameArea = frameWidth * frameHeight;
  if (frameArea <= 0) {
    return {
      passed: true,
      facesDetected: 0,
      largestFaceAreaPercent: 0,
    };
  }

  // Calculate the largest face area as a percentage of the frame
  let largestFaceAreaPercent = 0;

  for (const face of faces) {
    const faceArea = face.bounds.size.width * face.bounds.size.height;
    const facePercent = (faceArea / frameArea) * 100;

    if (facePercent > largestFaceAreaPercent) {
      largestFaceAreaPercent = facePercent;
    }
  }

  // Round to 2 decimal places
  largestFaceAreaPercent = Math.round(largestFaceAreaPercent * 100) / 100;

  const passed = largestFaceAreaPercent <= FACE_AREA_THRESHOLD_PERCENT;

  return {
    passed,
    facesDetected: faces.length,
    largestFaceAreaPercent,
    reason: passed
      ? undefined
      : `Face detected occupying ${largestFaceAreaPercent.toFixed(1)}% of frame (limit: ${FACE_AREA_THRESHOLD_PERCENT}%). People scanning is not allowed.`,
  };
}

/**
 * Batch check multiple frames for face detection.
 *
 * Used before upload submission to verify all captured frames are clean.
 * Returns the first failing frame's result, or a pass result if all frames pass.
 *
 * @param frames - Array of { faces, width, height } for each captured frame
 * @returns FaceDetectionResult for the batch
 */
export function batchCheckFrames(
  frames: Array<{
    faces: DetectedFace[];
    width: number;
    height: number;
  }>,
): FaceDetectionResult {
  for (const frame of frames) {
    const result = checkFrameForFaces(frame.faces, frame.width, frame.height);
    if (!result.passed) {
      return result;
    }
  }

  return {
    passed: true,
    facesDetected: 0,
    largestFaceAreaPercent: 0,
  };
}

/**
 * Camera face detection settings for expo-camera.
 *
 * These settings configure the on-device MLKit face detector
 * for optimal performance in the World Engine scan flow.
 *
 * Usage in WorldEngineScannerScreen:
 * ```tsx
 * import { Camera } from 'expo-camera';
 * import { FACE_DETECTION_SETTINGS, checkFrameForFaces } from '../utils/faceDetection';
 *
 * <Camera
 *   faceDetectorSettings={FACE_DETECTION_SETTINGS}
 *   onFacesDetected={({ faces }) => {
 *     const result = checkFrameForFaces(faces, frameWidth, frameHeight);
 *     if (!result.passed) {
 *       // Show rejection UI, discard frame
 *     }
 *   }}
 * />
 * ```
 */
export const FACE_DETECTION_SETTINGS = {
  mode: 'fast' as const, // Use fast mode for real-time detection (≤2ms/frame target)
  detectLandmarks: 'none' as const, // We only need bounding box, not landmarks
  runClassifications: 'none' as const, // No smile/eye classification needed
  minDetectionInterval: 200, // Check every 200ms to stay within 2ms/frame budget
  tracking: false, // No face tracking needed — just detection
};

/**
 * Get a user-friendly rejection message for face detection failures.
 * Supports Chinese (default) and English.
 */
export function getFaceRejectionMessage(locale: string = 'zh'): {
  title: string;
  message: string;
} {
  if (locale.startsWith('en')) {
    return {
      title: 'Face Detected',
      message:
        'People scanning is not allowed. Please scan objects only. The captured image has been discarded.',
    };
  }

  // Default: Chinese
  return {
    title: '检测到人脸',
    message: '不允许扫描人物。请仅扫描物品。已丢弃捕获的图像。',
  };
}
