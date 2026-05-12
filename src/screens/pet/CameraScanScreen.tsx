/**
 * CameraScanScreen — Sprint I #23
 *
 * Multi-angle camera scan to generate a 3D pet from a real-world object.
 * Per mobile-prd-v4 §4.3:
 *   1. User taps "Scan"
 *   2. AR guide ring shows orbit path (ARKit / ARCore)
 *   3. Auto-capture 8-12 frames as user orbits
 *   4. Upload to backend pet-generation/scan
 *   5. Server runs NeRF / multi-view SfM → .glb → auto-rig → .vrm
 *   6. Push back to Mobile + any online Desktop
 *   7. Mobile shows "✨ Set as my pet"
 *
 * V5 P5 feature — this is the mobile-exclusive creation mode.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_FRAMES = 8;
const MAX_FRAMES = 12;
const CAPTURE_INTERVAL_MS = 1500; // auto-capture every 1.5s

// ── Types ────────────────────────────────────────────────────

interface ScanSubmitResponse {
  task_id: string;
  status: 'queued' | 'processing';
  estimated_seconds: number;
}

type ScanState = 'permission' | 'ready' | 'scanning' | 'uploading' | 'processing' | 'done' | 'error';

// ── API ──────────────────────────────────────────────────────

async function submitScanFrames(frameUris: string[]): Promise<ScanSubmitResponse> {
  // Upload frames as base64 array
  const frames: string[] = [];
  for (const uri of frameUris) {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    frames.push(`data:image/jpeg;base64,${base64}`);
  }

  return apiFetch<ScanSubmitResponse>('/v1/pet-generation/scan', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'camera_scan',
      frames,
      provider: 'hunyuan3d', // default provider for scan
      resultFormat: 'GLB',
      enablePBR: true,
    }),
  });
}

// ── Component ────────────────────────────────────────────────

export function CameraScanScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [state, setState] = useState<ScanState>('permission');
  const [frames, setFrames] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check permission on mount
  useEffect(() => {
    if (permission?.granted) {
      setState('ready');
    }
  }, [permission]);

  const handleRequestPermission = useCallback(async () => {
    const result = await requestPermission();
    if (result.granted) {
      setState('ready');
    } else {
      setError(t({ en: 'Camera permission is required for scanning.', zh: '扫描需要相机权限。' }));
      setState('error');
    }
  }, [requestPermission, t]);

  // Start auto-capture
  const startScanning = useCallback(() => {
    setState('scanning');
    setFrames([]);
    setError('');

    captureTimerRef.current = setInterval(async () => {
      if (!cameraRef.current) return;

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          skipProcessing: true,
        });
        setFrames((prev) => {
          const next = [...prev, photo.uri];
          if (next.length >= MAX_FRAMES) {
            // Auto-stop when max frames reached
            stopScanning(next);
          }
          return next;
        });
      } catch {
        // Silently skip failed captures
      }
    }, CAPTURE_INTERVAL_MS);
  }, []);

  const stopScanning = useCallback((capturedFrames?: string[]) => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    const finalFrames = capturedFrames || frames;
    if (finalFrames.length < MIN_FRAMES) {
      Alert.alert(
        t({ en: 'Not enough frames', zh: '帧数不足' }),
        t({
          en: `Need at least ${MIN_FRAMES} frames. You captured ${finalFrames.length}. Try again.`,
          zh: `至少需要 ${MIN_FRAMES} 帧，当前 ${finalFrames.length} 帧。请重试。`,
        }),
      );
      setState('ready');
      setFrames([]);
      return;
    }

    // Upload
    uploadFrames(finalFrames);
  }, [frames, t]);

  const uploadFrames = useCallback(async (frameUris: string[]) => {
    setState('uploading');
    try {
      const response = await submitScanFrames(frameUris);
      setTaskId(response.task_id);
      setState('processing');

      // Clean up temp files
      for (const uri of frameUris) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } catch (err: any) {
      setError(err?.message || t({ en: 'Upload failed', zh: '上传失败' }));
      setState('error');
    }
  }, [t]);

  const handleManualStop = useCallback(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    stopScanning(frames);
  }, [frames, stopScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
      }
    };
  }, []);

  // ── Render states ──────────────────────────────────────────

  if (state === 'permission' || !permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>📷</Text>
        <Text style={styles.title}>{t({ en: 'Camera Access', zh: '相机权限' })}</Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'We need camera access to scan objects and create 3D pets.',
            zh: '需要相机权限来扫描物体并生成 3D 宠物。',
          })}
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestPermission}>
          <Text style={styles.primaryBtnText}>{t({ en: 'Grant Permission', zh: '授权相机' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'uploading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.title}>{t({ en: 'Uploading frames...', zh: '上传中...' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: `${frames.length} frames captured`, zh: `已捕获 ${frames.length} 帧` })}
        </Text>
      </View>
    );
  }

  if (state === 'processing') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>🧬</Text>
        <Text style={styles.title}>{t({ en: 'Generating 3D model...', zh: '生成 3D 模型中...' })}</Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'This may take 60-120 seconds. You can leave this screen.',
            zh: '大约需要 60-120 秒，你可以离开此页面。',
          })}
        </Text>
        {taskId && <Text style={styles.taskId}>Task: {taskId}</Text>}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('PetWardrobe')}
        >
          <Text style={styles.secondaryBtnText}>{t({ en: 'Go to Wardrobe', zh: '去衣柜等待' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>❌</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setState('ready')}>
          <Text style={styles.primaryBtnText}>{t({ en: 'Try Again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Ready or Scanning — show camera
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* AR guide overlay */}
        <View style={styles.overlay}>
          {/* Orbit guide ring */}
          <View style={styles.guideRing}>
            <View style={styles.guideRingInner} />
          </View>

          {/* Frame counter */}
          <View style={styles.frameCounter}>
            <Text style={styles.frameCounterText}>
              {frames.length} / {MAX_FRAMES}
            </Text>
          </View>

          {/* Instructions */}
          <View style={styles.instructionBox}>
            <Text style={styles.instructionText}>
              {state === 'ready'
                ? t({ en: 'Point at object and tap Start', zh: '对准物体后点击开始' })
                : t({ en: 'Slowly orbit around the object', zh: '缓慢绕物体一周' })}
            </Text>
          </View>

          {/* Progress dots */}
          {state === 'scanning' && (
            <View style={styles.dotsRow}>
              {Array.from({ length: MAX_FRAMES }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i < frames.length && styles.dotFilled]}
                />
              ))}
            </View>
          )}
        </View>
      </CameraView>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {state === 'ready' ? (
          <TouchableOpacity style={styles.startBtn} onPress={startScanning}>
            <Text style={styles.startBtnText}>
              {t({ en: '🔄 Start Scan', zh: '🔄 开始扫描' })}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.scanningControls}>
            <TouchableOpacity style={styles.stopBtn} onPress={handleManualStop}>
              <Text style={styles.stopBtnText}>
                {frames.length >= MIN_FRAMES
                  ? t({ en: '✓ Done', zh: '✓ 完成' })
                  : t({ en: `Need ${MIN_FRAMES - frames.length} more`, zh: `还需 ${MIN_FRAMES - frames.length} 帧` })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideRing: {
    width: SCREEN_W * 0.7,
    height: SCREEN_W * 0.7,
    borderRadius: SCREEN_W * 0.35,
    borderWidth: 2,
    borderColor: 'rgba(0,212,255,0.5)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideRingInner: {
    width: SCREEN_W * 0.3,
    height: SCREEN_W * 0.3,
    borderRadius: SCREEN_W * 0.15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  frameCounter: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  frameCounterText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  instructionBox: {
    position: 'absolute',
    bottom: 120,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  instructionText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  dotsRow: {
    position: 'absolute',
    bottom: 90,
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotFilled: { backgroundColor: colors.accent },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 40,
  },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scanningControls: { alignItems: 'center' },
  stopBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  stopBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Center states
  bigIcon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
  taskId: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  errorText: { fontSize: 16, color: '#ef4444', textAlign: 'center', marginBottom: 20 },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 12 },
  secondaryBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
});
