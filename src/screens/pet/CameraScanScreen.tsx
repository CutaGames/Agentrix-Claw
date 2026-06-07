/**
 * CameraScanScreen — Sprint I #23 (v2 with guided wizard)
 *
 * Multi-angle camera scan to generate a 3D pet from a real-world object.
 * Per mobile-prd-v4 §4.3:
 *   1. Intro wizard explains the flow (3 steps with illustration)
 *   2. User taps "Start"
 *   3. AR guide ring shows orbit path
 *   4. Auto-capture 8-12 frames as user orbits
 *   5. Upload to backend pet-generation/scan
 *   6. Server runs NeRF / multi-view SfM → .glb → auto-rig → .vrm
 *   7. Push back to Mobile + any online Desktop
 *   8. Mobile shows success card with "✨ Set as my pet" / "📤 List for sale"
 *
 * V5 P5 feature — this is the mobile-exclusive killer creation flow.
 * Differentiation from PetCreator (text → 3D):
 *   - Camera-first, photo-driven (no text prompt needed)
 *   - Guided orbit capture (auto frames at 1.5s interval)
 *   - 30s vs 90s, since the model has real-world reference
 *   - Result feels "yours" — physical object becomes a digital pet
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
  ScrollView,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';
import { readUriAsBase64 } from '../../utils/readBase64';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MIN_FRAMES = 8;
const MAX_FRAMES = 12;
const CAPTURE_INTERVAL_MS = 1500;

// ── Types ────────────────────────────────────────────────────

interface ScanSubmitResponse {
  task_id: string;
  status: 'queued' | 'processing';
  estimated_seconds: number;
}

type ScanState =
  | 'intro'          // ⬅ NEW: guided wizard
  | 'permission'
  | 'ready'
  | 'scanning'
  | 'review'         // ⬅ NEW: preview frames before upload
  | 'uploading'
  | 'processing'
  | 'done'
  | 'error';

// ── API ──────────────────────────────────────────────────────

async function submitScanFrames(frameUris: string[]): Promise<ScanSubmitResponse> {
  const frames: string[] = [];
  for (const uri of frameUris) {
    // SDK 54 changed expo-file-system's API: the old
    // `FileSystem.readAsStringAsync({encoding: EncodingType.Base64})` path
    // crashes with "Cannot read property 'Base64' of undefined" because
    // `EncodingType` is no longer exported. `readUriAsBase64` wraps the
    // new `File(uri).base64()` API and falls back to `expo-file-system/legacy`
    // when needed.
    const base64 = await readUriAsBase64(uri);
    frames.push(`data:image/jpeg;base64,${base64}`);
  }
  return apiFetch<ScanSubmitResponse>('/v1/pet-generation/scan', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'camera_scan',
      frames,
      provider: 'hunyuan3d',
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

  const [state, setState] = useState<ScanState>('intro'); // ⬅ start with wizard
  const [frames, setFrames] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Wizard flow ──────────────────────────────────────────
  const handleStartFromIntro = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError(t({ en: 'Camera permission is required.', zh: '需要相机权限才能扫描。' }));
        setState('error');
        return;
      }
    }
    setState('ready');
  }, [permission, requestPermission, t]);

  // ── Pick from gallery (8 photos required) ─────────────────
  const handlePickFromGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: MAX_FRAMES,
        quality: 0.7,
      });
      if (result.canceled) return;
      const uris = result.assets.map((a) => a.uri);
      if (uris.length < MIN_FRAMES) {
        Alert.alert(
          t({ en: 'Not enough photos', zh: '照片数量不足' }),
          t({
            en: `Pick at least ${MIN_FRAMES} photos taken from different angles. You picked ${uris.length}.`,
            zh: `至少需要 ${MIN_FRAMES} 张不同角度的照片，你选了 ${uris.length} 张。`,
          }),
        );
        return;
      }
      setFrames(uris);
      setState('review');
    } catch (e: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || 'Picker failed');
    }
  }, [t]);

  // ── Auto-capture orbit ───────────────────────────────────
  const startScanning = useCallback(() => {
    setState('scanning');
    setFrames([]);
    setError('');
    captureTimerRef.current = setInterval(async () => {
      if (!cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
        setFrames((prev) => {
          const next = [...prev, photo.uri];
          if (next.length >= MAX_FRAMES) {
            stopScanning(next);
          }
          return next;
        });
      } catch {
        // skip
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
          en: `Need at least ${MIN_FRAMES} frames. You captured ${finalFrames.length}.`,
          zh: `至少需要 ${MIN_FRAMES} 帧，当前 ${finalFrames.length} 帧。请重试。`,
        }),
      );
      setState('ready');
      setFrames([]);
      return;
    }
    setFrames(finalFrames);
    setState('review');
  }, [frames, t]);

  const handleManualStop = useCallback(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    stopScanning(frames);
  }, [frames, stopScanning]);

  // ── Upload + poll ─────────────────────────────────────────
  const uploadFrames = useCallback(async () => {
    setState('uploading');
    try {
      const response = await submitScanFrames(frames);
      setTaskId(response.task_id);
      setState('processing');
      // Best-effort cleanup of camera-temp files (skip gallery uris).
      // SDK 54 file-system replaced FileSystem.deleteAsync with File.delete().
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { File: ExpoFile } = require('expo-file-system');
        for (const uri of frames) {
          if (uri.includes('Camera/')) {
            try {
              const f = new ExpoFile(uri);
              f.delete?.();
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      pollResult(response.task_id);
    } catch (err: any) {
      setError(err?.message || t({ en: 'Upload failed', zh: '上传失败' }));
      setState('error');
    }
  }, [frames, t]);

  const pollResult = useCallback((tid: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const r = await apiFetch<any>(`/v1/pet-generation/scan/${tid}`, { method: 'GET' });
        if (r?.status === 'completed' && r?.result_url) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setResultUrl(r.result_url);
          setState('done');
        } else if (r?.status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setError(r?.error || t({ en: 'Generation failed', zh: '生成失败' }));
          setState('error');
        }
      } catch {
        // network blip; keep polling
      }
    }, 5000);
  }, [t]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ──────────────────────────────────────────────────────────
  // RENDERS
  // ──────────────────────────────────────────────────────────

  // ── State: intro wizard ───────────────────────────────────
  if (state === 'intro') {
    return (
      <ScrollView contentContainerStyle={styles.introScroll}>
        <View style={styles.introHero}>
          <Text style={styles.introHeroEmoji}>📷✨</Text>
          <Text style={styles.introHeroTitle}>
            {t({ en: 'Photo → 3D Pet', zh: '拍照创生专属萌宠' })}
          </Text>
          <Text style={styles.introHeroSub}>
            {t({
              en: 'Turn any real-world object — your plush toy, a figurine, even a stone — into a unique 3D AI pet that lives across all your devices.',
              zh: '把任何现实物体 — 毛绒玩偶 / 手办 / 一块石头 — 都变成只属于你的 3D AI 宠物，跨设备陪伴。',
            })}
          </Text>
        </View>

        <Text style={styles.introSectionLabel}>
          {t({ en: 'How it works', zh: '使用步骤' })}
        </Text>

        <View style={styles.stepCard}>
          <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t({ en: 'Pick your subject', zh: '选一个对象' })}
            </Text>
            <Text style={styles.stepBody}>
              {t({
                en: 'A plush toy, action figure, or any object on a flat surface. Good lighting, plain background works best.',
                zh: '毛绒玩偶、手办或任何放在平面上的物体。光线均匀、背景简洁效果最好。',
              })}
            </Text>
          </View>
        </View>

        <View style={styles.stepCard}>
          <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t({ en: 'Orbit & auto-capture', zh: '环绕拍摄' })}
            </Text>
            <Text style={styles.stepBody}>
              {t({
                en: 'Slowly walk around the object once. The app auto-captures 8-12 frames at different angles. ~30 seconds total.',
                zh: '缓慢绕物体一圈，App 自动每 1.5 秒抓一张 (8-12 张不同角度)，总共约 30 秒。',
              })}
            </Text>
          </View>
        </View>

        <View style={styles.stepCard}>
          <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>
              {t({ en: 'AI rebuilds your pet', zh: 'AI 重建模型' })}
            </Text>
            <Text style={styles.stepBody}>
              {t({
                en: 'Server-side multi-view SfM + auto-rig + texture. ~90 seconds. You can leave the screen — we’ll notify you.',
                zh: '后台多视图重建 + 自动绑骨 + 纹理生成 ~90 秒，可以放下手机，完成后会通知你。',
              })}
            </Text>
          </View>
        </View>

        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>💡 {t({ en: 'Tips for best results', zh: '小贴士 · 提升成功率' })}</Text>
          <Text style={styles.tipsItem}>• {t({ en: 'Keep object centered in the dashed circle', zh: '保持物体在虚线圆圈内' })}</Text>
          <Text style={styles.tipsItem}>• {t({ en: 'Move smoothly — no jerky motions', zh: '平稳移动，避免抖动' })}</Text>
          <Text style={styles.tipsItem}>• {t({ en: 'Same distance throughout (~30-50cm)', zh: '保持距离均匀 (约 30-50 cm)' })}</Text>
          <Text style={styles.tipsItem}>• {t({ en: 'Avoid harsh shadows / glass / mirrors', zh: '避免强阴影、玻璃、镜面' })}</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtnLarge} onPress={handleStartFromIntro}>
          <Text style={styles.primaryBtnLargeText}>
            🔄 {t({ en: 'Start Camera Scan', zh: '开始相机扫描' })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={handlePickFromGallery}>
          <Text style={styles.linkBtnText}>
            🖼️ {t({ en: 'Or pick photos from gallery', zh: '或从相册选 8-12 张照片' })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => navigation.navigate('PetCreator')}
        >
          <Text style={styles.linkBtnText}>
            ✨ {t({ en: 'Prefer text-only? Use Text → 3D', zh: '想用文字描述？切换到「文字创生」' })}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── State: review captured frames ─────────────────────────
  if (state === 'review') {
    return (
      <ScrollView contentContainerStyle={styles.reviewScroll}>
        <Text style={styles.reviewTitle}>
          ✓ {t({ en: `${frames.length} frames captured`, zh: `已捕获 ${frames.length} 张` })}
        </Text>
        <Text style={styles.reviewSub}>
          {t({ en: 'Review and confirm — these become your pet.', zh: '检查一下，确认后开始生成 3D' })}
        </Text>
        <View style={styles.thumbGrid}>
          {frames.map((uri, idx) => (
            <View key={idx} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <View style={styles.thumbIndex}>
                <Text style={styles.thumbIndexText}>{idx + 1}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.primaryBtnLarge} onPress={uploadFrames}>
          <Text style={styles.primaryBtnLargeText}>
            🚀 {t({ en: 'Generate my 3D pet', zh: '开始生成我的 3D 萌宠' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => { setFrames([]); setState('ready'); }}
        >
          <Text style={styles.secondaryBtnText}>
            🔄 {t({ en: 'Retake', zh: '重拍' })}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── State: uploading ──────────────────────────────────────
  if (state === 'uploading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.title}>{t({ en: 'Uploading frames...', zh: '上传中...' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: `${frames.length} frames`, zh: `共 ${frames.length} 张` })}
        </Text>
      </View>
    );
  }

  // ── State: processing ─────────────────────────────────────
  if (state === 'processing') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>🧬</Text>
        <Text style={styles.title}>{t({ en: 'Generating 3D model...', zh: '正在生成 3D 模型...' })}</Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'This takes ~90 seconds. You can leave this screen — we will notify you when done.',
            zh: '大约需要 90 秒，可以离开此页面，完成后会通知你。',
          })}
        </Text>
        {taskId && <Text style={styles.taskId}>Task: {taskId}</Text>}
        <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('PetWardrobe')}>
          <Text style={styles.secondaryBtnText}>{t({ en: 'Wait in Wardrobe', zh: '去衣柜等待' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── State: done ───────────────────────────────────────────
  if (state === 'done') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>🎉</Text>
        <Text style={styles.title}>{t({ en: 'Your 3D pet is ready!', zh: '你的专属 3D 萌宠已就绪！' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: 'Equip it as your active pet, list it for sale, or mint it as NFT.', zh: '装备为主宠 · 上架交易 · 铸造 NFT 任你选' })}
        </Text>
        <TouchableOpacity
          style={styles.primaryBtnLarge}
          onPress={() => navigation.navigate('PetWardrobe')}
        >
          <Text style={styles.primaryBtnLargeText}>
            ✨ {t({ en: 'Set as my pet', zh: '设为我的主宠' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('NftMint', { taskId })}>
          <Text style={styles.secondaryBtnText}>🪙 {t({ en: 'Mint as NFT', zh: '铸造为 NFT' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── State: error ──────────────────────────────────────────
  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.primaryBtnLarge} onPress={() => setState('intro')}>
          <Text style={styles.primaryBtnLargeText}>{t({ en: 'Try Again', zh: '重新开始' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── State: ready / scanning — camera view ─────────────────
  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.guideRing}>
            <View style={styles.guideRingInner} />
          </View>

          <View style={styles.frameCounter}>
            <Text style={styles.frameCounterText}>
              {frames.length} / {MAX_FRAMES}
            </Text>
          </View>

          <View style={styles.instructionBox}>
            <Text style={styles.instructionText}>
              {state === 'ready'
                ? t({ en: 'Center your subject · tap Start', zh: '把物体放进圈中央 · 点击开始' })
                : t({ en: 'Slowly orbit the object', zh: '缓慢绕物体一圈' })}
            </Text>
          </View>

          {state === 'scanning' && (
            <View style={styles.dotsRow}>
              {Array.from({ length: MAX_FRAMES }).map((_, i) => (
                <View key={i} style={[styles.dot, i < frames.length && styles.dotFilled]} />
              ))}
            </View>
          )}
        </View>
      </CameraView>

      <View style={styles.controls}>
        {state === 'ready' ? (
          <TouchableOpacity style={styles.startBtn} onPress={startScanning}>
            <Text style={styles.startBtnText}>{t({ en: '🔄 Start orbit', zh: '🔄 开始环绕拍摄' })}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.scanningControls}>
            <TouchableOpacity style={styles.stopBtn} onPress={handleManualStop}>
              <Text style={styles.stopBtnText}>
                {frames.length >= MIN_FRAMES
                  ? t({ en: '✓ Done', zh: '✓ 完成' })
                  : t({ en: `Need ${MIN_FRAMES - frames.length} more`, zh: `还需 ${MIN_FRAMES - frames.length} 张` })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const THUMB_SIZE = (SCREEN_W - 16 * 2 - 8 * 3) / 4; // 4 per row

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  // Center screen used by uploading / processing / done / error
  center: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  // Intro wizard
  introScroll: {
    flexGrow: 1,
    backgroundColor: colors.bgPrimary,
    padding: 16,
    paddingBottom: 40,
  },
  introHero: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  introHeroEmoji: { fontSize: 56, marginBottom: 8 },
  introHeroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  introHeroSub: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  introSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  stepCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  stepBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  tipsBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    padding: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: '#06b6d4', marginBottom: 8 },
  tipsItem: { fontSize: 13, color: colors.textSecondary, lineHeight: 22 },
  primaryBtnLarge: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnLargeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  // Review state
  reviewScroll: {
    flexGrow: 1,
    backgroundColor: colors.bgPrimary,
    padding: 16,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  reviewSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    position: 'relative',
  },
  thumb: { width: '100%', height: '100%' },
  thumbIndex: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIndexText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Camera capture
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
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
  dotsRow: { position: 'absolute', bottom: 90, flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
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

  // Common
  bigIcon: { fontSize: 64, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  taskId: { fontSize: 11, color: colors.textMuted, marginTop: 8 },
  errorText: { fontSize: 16, color: '#ef4444', textAlign: 'center', marginBottom: 20 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
});
