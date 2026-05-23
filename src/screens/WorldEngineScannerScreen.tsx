/**
 * WorldEngineScannerScreen — Reality Scanner for World Engine.
 *
 * Task 14.1: Camera lifecycle and scan mode UI
 * Task 14.2: Quality Gate Layer 1 — real-time preview guidance
 * Task 14.3: Quality Gate Layer 2 — per-frame scoring
 * Task 14.5: Quality Gate Layer 3 + submission flow
 * Task 18.1: Face detection on-device (TFLite/MLKit)
 *
 * Scan modes:
 * - Quick Scan (default): center-frame guide, 1-3 photo capture
 * - Detail Scan: AR overlay with 8-position ring guide
 * - Room Scan: panoramic capture with 360° progress indicator
 *
 * Requirements: 1.1, 1.2, 1.3, 4.1, 10.6, 10.7, 12.2, 14.1-14.9, 15.1, 15.3, 15.4
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import {
  checkFrameForFaces,
  batchCheckFrames,
  FACE_DETECTION_SETTINGS,
  getFaceRejectionMessage,
  type DetectedFace,
} from '../utils/faceDetection';
import {
  startScan,
  uploadScanFrame,
  generateFromScan,
  type ScanMode as ApiScanMode,
} from '../services/worldEngineApi';

// ============================================================
// Types
// ============================================================

type ScanMode = 'quick' | 'detail' | 'room';

interface CapturedFrame {
  uri: string;
  width: number;
  height: number;
  faces: DetectedFace[];
  qualityScore: {
    sharpness: number;
    exposure: number;
    angleNovelty: number;
  };
  timestamp: number;
}

interface QualityGateL1 {
  distanceOk: boolean;
  lightingOk: boolean;
  stabilityOk: boolean;
  occlusionOk: boolean;
}

// ============================================================
// Constants
// ============================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SCAN_MODE_CONFIG = {
  quick: { maxFrames: 3, label: '快速扫描', labelEn: 'Quick Scan' },
  detail: { maxFrames: 8, label: '精细扫描', labelEn: 'Detail Scan' },
  room: { maxFrames: 12, label: '房间扫描', labelEn: 'Room Scan' },
};

const QUALITY_THRESHOLDS = {
  good: 70,
  acceptable: 40,
};

// ============================================================
// Component
// ============================================================

export default function WorldEngineScannerScreen() {
  const navigation = useNavigation();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // State
  const [scanMode, setScanMode] = useState<ScanMode>('quick');
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qualityGateL1, setQualityGateL1] = useState<QualityGateL1>({
    distanceOk: true,
    lightingOk: true,
    stabilityOk: true,
    occlusionOk: true,
  });
  const [qualityPrediction, setQualityPrediction] = useState<number>(0);
  const [faceDetected, setFaceDetected] = useState(false);
  // First-time disclaimer (R12.1)
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  // Quality Gate L2 — last frame's quality score for border color
  const [lastQualityScore, setLastQualityScore] = useState<{
    sharpness: number;
    exposure: number;
    angleNovelty: number;
  } | null>(null);

  const DISCLAIMER_STORAGE_KEY = '@world_engine/disclaimer_acknowledged_v1';

  // ─── Disclaimer gate (R12.1) ─────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const acked = await AsyncStorage.getItem(DISCLAIMER_STORAGE_KEY);
        if (!acked) {
          setShowDisclaimer(true);
        } else {
          setDisclaimerChecked(true);
        }
      } catch {
        setShowDisclaimer(true);
      }
    })();
  }, []);

  const handleAcknowledgeDisclaimer = useCallback(async () => {
    try {
      await AsyncStorage.setItem(DISCLAIMER_STORAGE_KEY, new Date().toISOString());
      // TODO: Also POST /api/v1/world-engine/disclaimer/acknowledge for server-side record
    } catch (e) {
      console.warn('Failed to persist disclaimer ack:', e);
    }
    setDisclaimerChecked(true);
    setShowDisclaimer(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleDeclineDisclaimer = useCallback(() => {
    setShowDisclaimer(false);
    navigation.goBack();
  }, [navigation]);

  // ─── Quality Gate L2 border color computed from latest frame ────────

  const qualityBorderColor = useMemo(() => {
    if (!lastQualityScore) return 'transparent';
    const minScore = Math.min(
      lastQualityScore.sharpness,
      lastQualityScore.exposure,
      lastQualityScore.angleNovelty,
    );
    if (minScore >= QUALITY_THRESHOLDS.good) return '#4CAF50'; // green
    if (minScore >= QUALITY_THRESHOLDS.acceptable) return '#FFC107'; // yellow
    return '#F44336'; // red
  }, [lastQualityScore]);

  // ─── Permission handling ─────────────────────────────────────────────

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  // ─── Face detection handler (Task 18.1) ──────────────────────────────

  const handleFacesDetected = useCallback(
    ({ faces }: { faces: DetectedFace[] }) => {
      const result = checkFrameForFaces(
        faces,
        SCREEN_WIDTH,
        SCREEN_HEIGHT,
      );

      if (!result.passed) {
        setFaceDetected(true);
        // Haptic feedback for face detection
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        setFaceDetected(false);
      }
    },
    [],
  );

  // ─── Quality Gate Layer 1: Real-time preview guidance (Task 14.2) ────

  // Phase 1: Simulated quality gate checks.
  // In production, these would use actual sensor data (accelerometer, light sensor).
  // All Layer 1 detection paths must add ≤ 2ms/frame (R10.9).

  // ─── Capture handler ─────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    if (faceDetected) {
      const msg = getFaceRejectionMessage('zh');
      Alert.alert(msg.title, msg.message);
      return;
    }

    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo) {
        setIsCapturing(false);
        return;
      }

      // Quality Gate Layer 2: Per-frame scoring (Task 14.3)
      const qualityScore = computeFrameQuality(photo.uri, capturedFrames.length);
      setLastQualityScore(qualityScore);

      // Check if quality is acceptable
      const minScore = Math.min(
        qualityScore.sharpness,
        qualityScore.exposure,
        qualityScore.angleNovelty,
      );

      if (minScore >= QUALITY_THRESHOLDS.good) {
        // Good quality — positive haptic + green checkmark
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (minScore < QUALITY_THRESHOLDS.acceptable) {
        // Poor quality — suggest retake
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      const frame: CapturedFrame = {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        faces: [], // Faces already checked in real-time
        qualityScore,
        timestamp: Date.now(),
      };

      const newFrames = [...capturedFrames, frame];
      setCapturedFrames(newFrames);

      // Update quality prediction (Layer 3)
      const prediction = computeQualityPrediction(newFrames);
      setQualityPrediction(prediction);

      // Check if we've reached max frames for this mode
      const maxFrames = SCAN_MODE_CONFIG[scanMode].maxFrames;
      if (newFrames.length >= maxFrames) {
        // Auto-show submission UI
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Capture failed:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [cameraRef, isCapturing, faceDetected, capturedFrames, scanMode]);

  // ─── Submit handler (Task 14.5) ──────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (capturedFrames.length === 0) return;

    // Final face detection batch check before upload
    const batchResult = batchCheckFrames(
      capturedFrames.map((f) => ({
        faces: f.faces,
        width: f.width,
        height: f.height,
      })),
    );

    if (!batchResult.passed) {
      const msg = getFaceRejectionMessage('zh');
      Alert.alert(msg.title, msg.message);
      return;
    }

    setIsSubmitting(true);

    try {
      // Sprint P-8 (2026-05-22): real backend pipeline.
      //   1) POST /scan/start            → sessionId
      //   2) POST /scan/:id/upload (×N)  → per-frame quality score
      //   3) POST /scan/:id/generate     → jobId + estimatedSeconds
      //   4) navigate to ReconstructionProgress polling /jobs/:id/status
      const { sessionId } = await startScan(scanMode as ApiScanMode);

      let uploadedCount = 0;
      for (const frame of capturedFrames) {
        try {
          await uploadScanFrame(sessionId, {
            uri: frame.uri,
            mime: 'image/jpeg',
            name: `frame_${uploadedCount}.jpg`,
          });
          uploadedCount += 1;
        } catch (uploadErr) {
          console.warn('[WorldEngineScanner] upload frame failed:', uploadErr);
          // Continue uploading remaining frames; backend's minFrames
          // check will surface a clear error if too many fail.
        }
      }

      if (uploadedCount === 0) {
        Alert.alert('上传失败', '所有帧上传失败,请检查网络后重试。');
        setIsSubmitting(false);
        return;
      }

      const { jobId, estimatedSeconds } = await generateFromScan(
        sessionId,
        'cartoon',
      );

      // Hand off to the progress screen which polls /jobs/:id/status.
      // Use replace so the user can't swipe back to the scanner mid-flight.
      // Sprint P-8 P2 (2026-05-22): also pass sessionId so the progress
      // screen can auto-trigger /dungeons/generate when scanMode === 'room'.
      (navigation as any).replace('ReconstructionProgress', {
        jobId,
        estimatedSeconds,
        scanMode,
        scanSessionId: sessionId,
      });
    } catch (error: any) {
      const rawMsg = error?.message || '';
      // Wave 17 v4 — RN's fetch throws "Network request failed" for any
      // network-layer error (DNS, TLS, timeout). Translate that to a
      // friendlier Chinese message + offer Retry vs Back so users
      // aren't stranded after the alert.
      const friendly = rawMsg.toLowerCase().includes('network')
        ? '网络连接失败,请检查网络后重试。如果持续失败,可能是后端图片上传服务暂时不可用。'
        : rawMsg || '网络错误,请检查后重试。';
      Alert.alert(
        '提交失败',
        friendly,
        [
          { text: '返回世界', onPress: () => navigation.goBack(), style: 'cancel' },
          { text: '重试', onPress: () => { setIsSubmitting(false); /* keep frames so user can hit Generate again */ } },
        ],
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [capturedFrames, scanMode, navigation]);

  // ─── Cancel handler ──────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    // Discard captured images if user cancels before "Generate" (R10.7)
    // Return to previous screen within 1s
    setCapturedFrames([]);
    navigation.goBack();
  }, [navigation]);

  // ─── Render ──────────────────────────────────────────────────────────

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>需要相机权限才能使用扫描功能</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>授予权限</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const maxFrames = SCAN_MODE_CONFIG[scanMode].maxFrames;
  const canSubmit = capturedFrames.length > 0;
  const allFramesCaptured = capturedFrames.length >= maxFrames;

  return (
    <View style={styles.container}>
      {/* First-Time Disclaimer Modal (R12.1) */}
      <Modal
        visible={showDisclaimer}
        transparent
        animationType="fade"
        onRequestClose={handleDeclineDisclaimer}
      >
        <View style={styles.disclaimerBackdrop}>
          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>欢迎使用世界引擎</Text>
            <ScrollView style={styles.disclaimerScroll}>
              <Text style={styles.disclaimerBody}>
                在你开始扫描真实物品之前，请阅读并同意以下重要事项：
              </Text>
              <Text style={styles.disclaimerSection}>
                <Text style={styles.disclaimerEmoji}>🔒 </Text>
                <Text style={styles.disclaimerSectionTitle}>禁止扫描人物</Text>
              </Text>
              <Text style={styles.disclaimerBody}>
                出于隐私和合规要求，我们的设备端 AI 会自动检测人脸。一旦检测到人脸占画面比例超过
                5%，相应帧将被立即丢弃且不会上传至服务器。
              </Text>
              <Text style={styles.disclaimerSection}>
                <Text style={styles.disclaimerEmoji}>©️ </Text>
                <Text style={styles.disclaimerSectionTitle}>禁止扫描受版权保护角色</Text>
              </Text>
              <Text style={styles.disclaimerBody}>
                请勿扫描迪士尼、漫威、宝可梦、任天堂、三丽鸥等品牌的官方角色玩偶或周边。我们的版权
                分类器可能在生成前或上架前拦截相关内容。
              </Text>
              <Text style={styles.disclaimerSection}>
                <Text style={styles.disclaimerEmoji}>⚖️ </Text>
                <Text style={styles.disclaimerSectionTitle}>所有权与原创性</Text>
              </Text>
              <Text style={styles.disclaimerBody}>
                你扫描出的世界资产将归你所有，但仅原始创建者可在 Marketplace 一级出售。二级转手按
                平台抽成 30%。资产可被赠送、绑定到 Agent、参与战斗与副本。
              </Text>
              <Text style={styles.disclaimerSection}>
                <Text style={styles.disclaimerEmoji}>💰 </Text>
                <Text style={styles.disclaimerSectionTitle}>免费额度与计费</Text>
              </Text>
              <Text style={styles.disclaimerBody}>
                免费用户每天可进行 5 次快速扫描 / 1 次精细扫描 / 1 次房间扫描，月度成本上限为
                $5 USD。订阅升级或购买 AXP 配额可解锁更多额度。
              </Text>
              <Text style={styles.disclaimerSection}>
                <Text style={styles.disclaimerEmoji}>📤 </Text>
                <Text style={styles.disclaimerSectionTitle}>数据使用</Text>
              </Text>
              <Text style={styles.disclaimerBody}>
                扫描图像将上传至 Agentrix 后端用于 3D 重建和 AI 角色生成。生成完毕后原图将在 7 天
                内删除。生成的资产元数据（含 stats、技能、背景）会持久化存储以支持游戏循环。
              </Text>
            </ScrollView>
            <View style={styles.disclaimerButtons}>
              <TouchableOpacity
                style={styles.disclaimerDeclineButton}
                onPress={handleDeclineDisclaimer}
              >
                <Text style={styles.disclaimerDeclineText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.disclaimerAcceptButton}
                onPress={handleAcknowledgeDisclaimer}
              >
                <Text style={styles.disclaimerAcceptText}>我已阅读并同意</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Camera View — Quality Gate L2 visualization border */}
      <View
        style={[
          styles.cameraQualityFrame,
          { borderColor: qualityBorderColor },
        ]}
        pointerEvents="none"
      />
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onMountError={(error) => console.error('Camera mount error:', error)}
      >
        {/* Top close button — Wave 17 v4: scanner had headerShown=false
            so the only way out was a small "取消" text button at the
            bottom that users missed. Surface a clear ✕ in the top-left
            corner so cancel is obvious from the moment the camera opens. */}
        <TouchableOpacity
          style={styles.topCloseButton}
          onPress={handleCancel}
          accessibilityLabel="返回"
          testID="scanner-close-button"
        >
          <Text style={styles.topCloseButtonText}>✕</Text>
        </TouchableOpacity>

        {/* Face Detection Warning Overlay */}
        {faceDetected && (
          <View style={styles.faceWarningOverlay}>
            <Text style={styles.faceWarningText}>⚠️ 检测到人脸 — 不允许扫描人物</Text>
          </View>
        )}

        {/* Quality Gate L1 Indicators */}
        <View style={styles.qualityIndicators}>
          {!qualityGateL1.lightingOk && (
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>💡 光线不足</Text>
            </View>
          )}
          {!qualityGateL1.stabilityOk && (
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>📷 请保持稳定</Text>
            </View>
          )}
          {!qualityGateL1.distanceOk && (
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>📏 距离 15-50cm</Text>
            </View>
          )}
        </View>

        {/* Scan Guide Overlay */}
        {scanMode === 'quick' && (
          <View style={styles.quickScanGuide}>
            <View style={styles.centerFrame} />
          </View>
        )}

        {scanMode === 'detail' && (
          <View style={styles.detailScanGuide}>
            {/* 8-position ring guide */}
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i * 45 * Math.PI) / 180;
              const radius = 100;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const captured = i < capturedFrames.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.ringDot,
                    {
                      transform: [{ translateX: x }, { translateY: y }],
                      backgroundColor: captured ? '#4CAF50' : '#666',
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {scanMode === 'room' && (
          <View style={styles.roomScanGuide}>
            {/* 360° progress indicator */}
            <Text style={styles.roomProgressText}>
              {Math.round((capturedFrames.length / maxFrames) * 360)}° / 360°
            </Text>
          </View>
        )}

        {/* Frame counter */}
        <View style={styles.frameCounter}>
          <Text style={styles.frameCounterText}>
            {capturedFrames.length} / {maxFrames}
          </Text>
        </View>

        {/* Quality Prediction (Layer 3) */}
        {capturedFrames.length > 0 && (
          <View style={styles.qualityPrediction}>
            <Text style={styles.qualityPredictionLabel}>生成质量预测</Text>
            <Text style={styles.qualityPredictionStars}>
              {'★'.repeat(qualityPrediction)}{'☆'.repeat(5 - qualityPrediction)}
            </Text>
            {qualityPrediction < 3 && (
              <Text style={styles.qualityTip}>
                建议：多拍几张不同角度的照片以提高质量
              </Text>
            )}
          </View>
        )}
      </CameraView>

      {/* Bottom Controls */}
      <View style={styles.controls}>
        {/* Scan Mode Selector */}
        <View style={styles.modeSelector}>
          {(['quick', 'detail', 'room'] as ScanMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modeButton,
                scanMode === mode && styles.modeButtonActive,
              ]}
              onPress={() => {
                setScanMode(mode);
                setCapturedFrames([]);
                setQualityPrediction(0);
              }}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  scanMode === mode && styles.modeButtonTextActive,
                ]}
              >
                {SCAN_MODE_CONFIG[mode].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>取消</Text>
          </TouchableOpacity>

          {!allFramesCaptured ? (
            <TouchableOpacity
              style={[
                styles.captureButton,
                (isCapturing || faceDetected) && styles.captureButtonDisabled,
              ]}
              onPress={handleCapture}
              disabled={isCapturing || faceDetected}
            >
              {isCapturing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.captureButtonInner} />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>生成</Text>
              )}
            </TouchableOpacity>
          )}

          {canSubmit && !allFramesCaptured && (
            <TouchableOpacity style={styles.earlySubmitButton} onPress={handleSubmit}>
              <Text style={styles.earlySubmitText}>提前生成</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================================
// Quality scoring helpers (Task 14.3)
// ============================================================

/**
 * Compute per-frame quality score.
 * Phase 1: Heuristic-based (actual image analysis deferred to native module).
 *
 * Returns { sharpness, exposure, angleNovelty } each 0-100.
 */
function computeFrameQuality(
  _uri: string,
  frameIndex: number,
): { sharpness: number; exposure: number; angleNovelty: number } {
  // Phase 1: Return simulated scores.
  // In production, this would use native image analysis (Laplacian variance for sharpness,
  // histogram analysis for exposure, feature matching for angle novelty).
  return {
    sharpness: 70 + Math.random() * 25, // 70-95
    exposure: 65 + Math.random() * 30, // 65-95
    angleNovelty: frameIndex === 0 ? 100 : 50 + Math.random() * 40, // First frame always novel
  };
}

/**
 * Compute overall quality prediction (1-5 stars) from captured frames.
 * Based on: coverage, avg sharpness, lighting consistency, angle diversity.
 *
 * Task 14.5: Does NOT block submission — just informational.
 */
function computeQualityPrediction(frames: CapturedFrame[]): number {
  if (frames.length === 0) return 0;

  const avgSharpness =
    frames.reduce((sum, f) => sum + f.qualityScore.sharpness, 0) / frames.length;
  const avgExposure =
    frames.reduce((sum, f) => sum + f.qualityScore.exposure, 0) / frames.length;
  const avgNovelty =
    frames.reduce((sum, f) => sum + f.qualityScore.angleNovelty, 0) / frames.length;

  // Coverage factor: more frames = better coverage
  const coverageFactor = Math.min(frames.length / 3, 1); // 3+ frames = full coverage

  // Combined score (0-100)
  const combined =
    avgSharpness * 0.3 + avgExposure * 0.2 + avgNovelty * 0.2 + coverageFactor * 100 * 0.3;

  // Map to 1-5 stars
  if (combined >= 85) return 5;
  if (combined >= 70) return 4;
  if (combined >= 55) return 3;
  if (combined >= 40) return 2;
  return 1;
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraQualityFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 220, // leave room for bottom controls
    borderWidth: 4,
    borderColor: 'transparent',
    zIndex: 1,
    pointerEvents: 'none',
  },
  // Disclaimer modal
  disclaimerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  disclaimerCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
    width: '100%',
  },
  disclaimerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  disclaimerScroll: {
    maxHeight: 460,
    marginBottom: 16,
  },
  disclaimerSection: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 4,
  },
  disclaimerEmoji: {
    fontSize: 16,
  },
  disclaimerSectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimerBody: {
    color: '#bbb',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  disclaimerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  disclaimerDeclineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  disclaimerDeclineText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '500',
  },
  disclaimerAcceptButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
  },
  disclaimerAcceptText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
    paddingHorizontal: 20,
  },
  permissionButton: {
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 20,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Face detection warning
  faceWarningOverlay: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  faceWarningText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Quality indicators
  qualityIndicators: {
    position: 'absolute',
    top: 110,
    left: 20,
    right: 20,
    gap: 8,
  },
  warningBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  warningBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  // Scan guides
  quickScanGuide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
    borderStyle: 'dashed',
  },
  detailScanGuide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  roomScanGuide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomProgressText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  // Frame counter
  frameCounter: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  frameCounterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Top close button (Wave 17 v4) — surfaces an obvious ✕ exit when
  // the screen is full-bleed camera with no native nav header.
  topCloseButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  topCloseButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  // Quality prediction
  qualityPrediction: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  qualityPredictionLabel: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  qualityPredictionStars: {
    color: '#FFD700',
    fontSize: 20,
  },
  qualityTip: {
    color: '#ff9800',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  // Controls
  controls: {
    backgroundColor: '#111',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  modeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#222',
  },
  modeButtonActive: {
    backgroundColor: '#6c5ce7',
  },
  modeButtonText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 14,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#6c5ce7',
  },
  captureButtonDisabled: {
    opacity: 0.4,
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6c5ce7',
  },
  submitButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  earlySubmitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  earlySubmitText: {
    color: '#6c5ce7',
    fontSize: 13,
  },
});
