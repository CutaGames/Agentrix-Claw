/**
 * CameraScanScreen — Sprint 5 · Task 5.5
 *
 * Multi-angle photo capture screen for 3D pet generation.
 * Users take 8-12 photos of a real object from different angles,
 * which are uploaded to the backend for NeRF/SfM 3D reconstruction.
 *
 * Simplified AR flow (no native ARKit/ARCore required):
 *   1. Show camera preview (expo-camera)
 *   2. Overlay: circular guide + rotation instructions
 *   3. Progress: "3/12 photos captured"
 *   4. Manual capture button
 *   5. Upload all photos → poll for result
 *   6. Show generated VRM preview + "Set as my pet" button
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { submitScanPhotos, getScanTaskStatus } from '../../services/petScan.service';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MIN_PHOTOS = 8;
const MAX_PHOTOS = 12;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max

type ScanPhase = 'capture' | 'uploading' | 'processing' | 'result' | 'error';

export default function CameraScanScreen({ navigation }: any) {
  const [phase, setPhase] = useState<ScanPhase>('capture');
  const [photos, setPhotos] = useState<string[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [resultVrmUrl, setResultVrmUrl] = useState<string | null>(null);
  const [resultThumbnail, setResultThumbnail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

  // Lazy-load expo-camera to avoid crashes on unsupported platforms
  const [CameraView, setCameraView] = useState<any>(null);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cameraModule = require('expo-camera');
        const Camera = cameraModule.CameraView || cameraModule.Camera;
        if (mounted) setCameraView(() => Camera);

        // Request permission
        const { status } = await (
          cameraModule.useCameraPermissions
            ? cameraModule.requestCameraPermissionsAsync?.()
            : cameraModule.Camera?.requestCameraPermissionsAsync?.()
        ) || { status: 'undetermined' };
        if (mounted) setCameraPermission(status === 'granted');
      } catch {
        if (mounted) setCameraPermission(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Take a photo
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || photos.length >= MAX_PHOTOS) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) {
        setPhotos((prev) => [...prev, photo.uri]);
      }
    } catch (err: any) {
      console.warn('[CameraScan] capture failed:', err?.message);
    }
  }, [photos.length]);

  // Remove a photo
  const handleRemovePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Submit photos for 3D reconstruction
  const handleSubmit = useCallback(async () => {
    if (photos.length < MIN_PHOTOS) {
      Alert.alert(
        '需要更多照片',
        `请至少拍摄 ${MIN_PHOTOS} 张不同角度的照片（当前 ${photos.length} 张）`,
      );
      return;
    }

    setPhase('uploading');

    try {
      const result = await submitScanPhotos(photos);

      if (!result?.taskId) {
        throw new Error('未获取到任务 ID');
      }

      setPhase('processing');

      // Poll for completion
      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setPhase('error');
          setErrorMessage('处理超时，请稍后在"我的宠物"中查看结果');
          return;
        }

        attempts++;
        const status = await getScanTaskStatus(result.taskId);

        if (status.status === 'completed' && status.vrmUrl) {
          setResultVrmUrl(status.vrmUrl);
          setResultThumbnail(status.thumbnailUrl || null);
          setPhase('result');
          return;
        }

        if (status.status === 'failed') {
          setPhase('error');
          setErrorMessage(status.error || '3D 重建失败，请重试');
          return;
        }

        // Continue polling
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        return poll();
      };

      await poll();
    } catch (err: any) {
      setPhase('error');
      setErrorMessage(err?.message || '上传失败，请检查网络后重试');
    }
  }, [photos]);

  // Set generated VRM as active pet
  const handleSetAsPet = useCallback(() => {
    if (resultVrmUrl) {
      // Navigate back with the VRM URL as result
      navigation.navigate('PetCompanion', { vrmUrl: resultVrmUrl });
    }
  }, [resultVrmUrl, navigation]);

  // Retry from error state
  const handleRetry = useCallback(() => {
    setPhase('capture');
    setPhotos([]);
    setErrorMessage(null);
    setResultVrmUrl(null);
    setResultThumbnail(null);
  }, []);

  // ── Render: No camera permission ────────────────────────────────────────

  if (cameraPermission === false) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>📷 需要相机权限</Text>
        <Text style={styles.errorText}>
          请在系统设置中允许 Agentrix 访问相机
        </Text>
      </View>
    );
  }

  // ── Render: Processing / Uploading ──────────────────────────────────────

  if (phase === 'uploading' || phase === 'processing') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.processingTitle}>
          {phase === 'uploading' ? '正在上传照片...' : '正在生成 3D 模型...'}
        </Text>
        <Text style={styles.processingSubtitle}>
          {phase === 'processing'
            ? '这可能需要 1-3 分钟，请耐心等待'
            : `${photos.length} 张照片`}
        </Text>
      </View>
    );
  }

  // ── Render: Result ──────────────────────────────────────────────────────

  if (phase === 'result') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.resultTitle}>✨ 3D 宠物生成完成</Text>
        {resultThumbnail && (
          <Image
            source={{ uri: resultThumbnail }}
            style={styles.resultThumbnail}
            contentFit="cover"
          />
        )}
        <TouchableOpacity style={styles.primaryButton} onPress={handleSetAsPet}>
          <Text style={styles.primaryButtonText}>设为我的宠物</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleRetry}>
          <Text style={styles.secondaryButtonText}>重新扫描</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: Error ───────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>❌ 生成失败</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
          <Text style={styles.primaryButtonText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: Capture phase ───────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <View style={styles.cameraContainer}>
        {CameraView && cameraPermission ? (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
        ) : (
          <View style={[styles.camera, styles.cameraPlaceholder]}>
            <ActivityIndicator size="small" color="#6366f1" />
          </View>
        )}

        {/* Circular guide overlay */}
        <View style={styles.guideOverlay} pointerEvents="none">
          <View style={styles.guideCircle} />
          <Text style={styles.guideText}>
            绕物体缓慢旋转拍摄
          </Text>
        </View>

        {/* Progress indicator */}
        <View style={styles.progressBadge}>
          <Text style={styles.progressText}>
            {photos.length}/{MAX_PHOTOS} 张
          </Text>
        </View>
      </View>

      {/* Photo strip */}
      {photos.length > 0 && (
        <ScrollView
          horizontal
          style={styles.photoStrip}
          contentContainerStyle={styles.photoStripContent}
          showsHorizontalScrollIndicator={false}
        >
          {photos.map((uri, index) => (
            <TouchableOpacity
              key={`photo-${index}`}
              onLongPress={() => handleRemovePhoto(index)}
              style={styles.photoThumb}
            >
              <Image source={{ uri }} style={styles.photoThumbImage} contentFit="cover" />
              <View style={styles.photoIndex}>
                <Text style={styles.photoIndexText}>{index + 1}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {/* Capture button */}
        <TouchableOpacity
          style={[
            styles.captureButton,
            (!cameraReady || photos.length >= MAX_PHOTOS) && styles.captureButtonDisabled,
          ]}
          onPress={handleCapture}
          disabled={!cameraReady || photos.length >= MAX_PHOTOS}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        {/* Submit button */}
        {photos.length >= MIN_PHOTOS && (
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitButtonGradient}
            >
              <Text style={styles.submitButtonText}>
                生成 3D 宠物 →
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          💡 拍摄 {MIN_PHOTOS}-{MAX_PHOTOS} 张不同角度的照片，长按可删除
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0b1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideCircle: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    borderRadius: SCREEN_WIDTH * 0.3,
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.6)',
    borderStyle: 'dashed',
  },
  guideText: {
    color: '#ffffff',
    fontSize: 14,
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoStrip: {
    maxHeight: 80,
    backgroundColor: '#1e293b',
  },
  photoStripContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumbImage: {
    width: 60,
    height: 60,
  },
  photoIndex: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIndexText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#0f172a',
    gap: 20,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    borderColor: '#475569',
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
  submitButton: {
    flex: 1,
    maxWidth: 200,
  },
  submitButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  instructions: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
  },
  instructionText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  // Processing states
  processingTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  processingSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
  },
  // Result state
  resultTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  resultThumbnail: {
    width: 200,
    height: 200,
    borderRadius: 16,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  // Error state
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});
