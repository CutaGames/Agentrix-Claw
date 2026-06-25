import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, TextInput, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { confirmDesktopPairWithApiBase, bindOpenClaw, mapRawInstance } from '../../services/auth';
import { registerLocalRelayAgent } from '../../services/openclaw.service';
import {
  getPetTask,
  listPetTasks,
  submitPetTask,
  type PetProvider,
  type PetStyle,
  type PetTaskSummary,
  type UploadedPetImage,
  uploadPetScanImage,
} from '../../services/petCreator';
import { themedStyles } from '../../theme/useTheme';

const PET_SCAN_VIEWS = [
  {
    key: 'front',
    title: { en: 'Front', zh: '正面' },
    hint: { en: 'Face, chest, and ears visible.', zh: '确保脸部、胸口和耳朵清晰可见。' },
  },
  {
    key: 'left',
    title: { en: 'Left', zh: '左侧' },
    hint: { en: 'Keep the full body on the left profile.', zh: '左侧轮廓完整入镜。' },
  },
  {
    key: 'right',
    title: { en: 'Right', zh: '右侧' },
    hint: { en: 'Mirror the left profile shot.', zh: '与左侧形成完整对称信息。' },
  },
  {
    key: 'back',
    title: { en: 'Back', zh: '背面' },
    hint: { en: 'Show tail, back, and rear silhouette.', zh: '拍到尾巴、背部和后侧轮廓。' },
  },
  {
    key: 'top',
    title: { en: 'Top', zh: '俯视' },
    hint: { en: 'Capture head top and body volume.', zh: '覆盖头顶与整体体积。' },
  },
  {
    key: 'bottom',
    title: { en: 'Bottom', zh: '仰视' },
    hint: { en: 'Get chin, paws, and underside structure.', zh: '补齐下巴、四肢和腹部信息。' },
  },
] as const;

const PET_STYLES: Array<{ value: PetStyle; label: string }> = [
  { value: 'chibi', label: 'Chibi' },
  { value: 'anime', label: 'Anime' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'realistic', label: 'Realistic' },
];

const PET_PROVIDERS: Array<{ value: PetProvider; label: string }> = [
  { value: 'meshy', label: 'Meshy' },
  { value: 'hunyuan3d', label: 'Hunyuan3D' },
];

type ScreenMode = 'qr' | 'pet';
type CaptureSource = 'camera' | 'library';
type PetViewKey = (typeof PET_SCAN_VIEWS)[number]['key'];

/**
 * ScanScreen now hosts two real flows:
 *   • 六视角宠物扫描生成：拍 6 个视角 -> 上传 -> 提交 pet-generation scan 任务
 *   • 通用二维码配对：桌面端 / 网页端 / OpenClaw / Relay / Deep Link / Plain URL
 */
export function ScanScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const { addInstance, setActiveInstance } = useAuthStore.getState();

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScreenMode>('qr');
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [petPrompt, setPetPrompt] = useState('');
  const [petStyle, setPetStyle] = useState<PetStyle>('chibi');
  const [petProvider, setPetProvider] = useState<PetProvider>('meshy');
  const [petViews, setPetViews] = useState<Partial<Record<PetViewKey, UploadedPetImage>>>({});
  const [uploadingView, setUploadingView] = useState<PetViewKey | null>(null);
  const [petSubmitting, setPetSubmitting] = useState(false);
  const [petTaskId, setPetTaskId] = useState<string | null>(null);
  const [petTaskStatus, setPetTaskStatus] = useState<string | null>(null);
  const [recentTasks, setRecentTasks] = useState<PetTaskSummary[]>([]);

  React.useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission?.granted, requestPermission]);

  React.useEffect(() => {
    let cancelled = false;
    listPetTasks(8)
      .then((tasks) => {
        if (!cancelled) setRecentTasks(tasks.filter((task) => task.mode === 'scan'));
      })
      .catch((error: any) => {
        console.warn(`[ScanScreen] failed to load pet scan tasks: ${error?.message || error}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const completedPetViews = PET_SCAN_VIEWS.filter((slot) => !!petViews[slot.key]).length;

  const refreshRecentTasks = async () => {
    try {
      const tasks = await listPetTasks(8);
      setRecentTasks(tasks.filter((task) => task.mode === 'scan'));
    } catch (error: any) {
      console.warn(`[ScanScreen] failed to refresh pet scan tasks: ${error?.message || error}`);
    }
  };

  const handleCapturePetView = async (slotKey: PetViewKey, source: CaptureSource) => {
    try {
      if (source === 'camera') {
        const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraPerm.granted) {
          Alert.alert(
            t({ en: 'Camera permission required', zh: '需要相机权限' }),
            t({ en: 'Please grant camera permission to capture pet views.', zh: '请授予相机权限后再采集宠物视角。' }),
          );
          return;
        }
      } else {
        const mediaPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPerm.granted) {
          Alert.alert(
            t({ en: 'Photo library permission required', zh: '需要相册权限' }),
            t({ en: 'Please grant photo library permission to import a pet view.', zh: '请授予相册权限后再导入宠物视角。' }),
          );
          return;
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.85,
            mediaTypes: 'images' as any,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            quality: 0.85,
            mediaTypes: 'images' as any,
          });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        throw new Error(t({ en: 'Image capture failed.', zh: '图片采集失败。' }));
      }

      setUploadingView(slotKey);
      const uploaded = await uploadPetScanImage({
        uri: asset.uri,
        name: asset.fileName || `pet-${slotKey}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });

      setPetViews((prev) => ({
        ...prev,
        [slotKey]: uploaded,
      }));
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Upload failed', zh: '上传失败' }),
        error?.message || t({ en: 'Failed to upload pet view.', zh: '宠物视角上传失败。' }),
      );
    } finally {
      setUploadingView(null);
    }
  };

  const handleRemovePetView = (slotKey: PetViewKey) => {
    setPetViews((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  };

  const handleSubmitPetScan = async () => {
    if (completedPetViews !== PET_SCAN_VIEWS.length) {
      Alert.alert(
        t({ en: 'Incomplete scan set', zh: '采集未完成' }),
        t({ en: 'Please capture all 6 views before submitting.', zh: '请先补齐 6 个视角再提交生成。' }),
      );
      return;
    }

    const scanImageUrls = PET_SCAN_VIEWS
      .map((slot) => petViews[slot.key]?.publicUrl)
      .filter((value): value is string => !!value);

    setPetSubmitting(true);
    try {
      const result = await submitPetTask({
        mode: 'scan',
        provider: petProvider,
        style: petStyle,
        prompt: petPrompt.trim() || undefined,
        scanImageUrls,
        enableAnimation: true,
      });
      const taskId = result?.taskId || result?.task?.taskId || null;
      const status = result?.status || result?.task?.status || 'submitted';
      setPetTaskId(taskId);
      setPetTaskStatus(status);
      await refreshRecentTasks();
      Alert.alert(
        t({ en: 'Pet generation started', zh: '宠物生成已启动' }),
        taskId
          ? t({ en: `Task ${taskId} has been submitted.`, zh: `任务 ${taskId} 已提交。` })
          : t({ en: 'Six-view pet generation task submitted.', zh: '六视角宠物生成任务已提交。' }),
      );
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Submission failed', zh: '提交失败' }),
        error?.message || t({ en: 'Failed to create pet generation task.', zh: '创建宠物生成任务失败。' }),
      );
    } finally {
      setPetSubmitting(false);
    }
  };

  const handleRefreshPetTask = async () => {
    if (!petTaskId) return;
    try {
      const task = await getPetTask(petTaskId);
      setPetTaskStatus(task?.status || task?.task?.status || 'unknown');
      await refreshRecentTasks();
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Refresh failed', zh: '刷新失败' }),
        error?.message || t({ en: 'Failed to refresh pet task.', zh: '宠物任务刷新失败。' }),
      );
    }
  };

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);

    try {
      const scanText = data.trim();

      // ── 1) Desktop / Web pair QR ──
      if (scanText.includes('agentrix.top/pair') || scanText.includes('platform=desktop') || scanText.includes('platform=web')) {
        const pairUrl = new URL(scanText);
        const pairSession = pairUrl.searchParams.get('session');
        const platform = pairUrl.searchParams.get('platform') || 'desktop';
        const pairApiBase = pairUrl.searchParams.get('api') || undefined;
        if (!pairSession) throw new Error(t({ en: 'QR code missing session info.', zh: '二维码缺少会话信息。' }));

        // Retry confirm up to 2 times with delay (session may still be propagating)
        let lastErr: any;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await confirmDesktopPairWithApiBase(pairSession, pairApiBase);
            lastErr = null;
            break;
          } catch (e: any) {
            lastErr = e;
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
        if (lastErr) {
          const platformLabel = platform === 'web'
            ? t({ en: 'Web', zh: '网页端' })
            : t({ en: 'Desktop', zh: '桌面端' });
          throw new Error(
            t({
              en: `${platformLabel} session expired or not found. Please refresh the QR code on ${platformLabel} and try again.`,
              zh: `${platformLabel}会话已过期或不存在，请在${platformLabel}刷新二维码后重新扫描。`,
            }),
          );
        }

        const platformLabel = platform === 'web'
          ? t({ en: 'Web', zh: '网页端' })
          : t({ en: 'Desktop', zh: '桌面端' });
        Alert.alert(
          t({ en: 'Paired!', zh: '配对成功！' }),
          t({ en: `${platformLabel} is now logged in with your account.`, zh: `${platformLabel}已使用你的账号登录。` }),
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        setProcessing(false);
        return;
      }

      // ── 2) JSON payload (OpenClaw / Relay) ──
      let parsedData: { url?: string; token?: string; relayToken?: string; wsRelayUrl?: string; mode?: string; name?: string } | null = null;
      try {
        const json = JSON.parse(scanText);
        parsedData = {
          url: json.url || json.instanceUrl || json.apiUrl || json.serverUrl,
          token: json.token || json.apiToken || json.instanceToken,
          relayToken: json.relayToken,
          wsRelayUrl: json.wsRelayUrl,
          mode: json.mode,
          name: json.name,
        };
      } catch {
        // not JSON, continue to other handlers
      }

      // ── 3) Deep link (agentrix:// or clawlink://) ──
      if (!parsedData && (
        scanText.startsWith('agentrix://connect') ||
        scanText.startsWith('clawlink://connect') ||
        scanText.startsWith('https://clawlink.app/connect')
      )) {
        const u = new URL(scanText);
        const host = u.searchParams.get('host') || u.searchParams.get('hostname') || '';
        const port = u.searchParams.get('port') || '7474';
        const token = u.searchParams.get('token') || u.searchParams.get('instanceId') || '';
        if (host) {
          parsedData = { url: `http://${host}:${port}`, token, mode: 'direct' };
        } else if (token) {
          parsedData = { relayToken: token, wsRelayUrl: 'wss://api.agentrix.top/relay', mode: 'relay' };
        }
      }

      // ── 4) Plain URL ──
      if (!parsedData && (scanText.startsWith('http') || scanText.startsWith('ws'))) {
        parsedData = { url: scanText };
      }

      // ── 5) host:port pattern ──
      if (!parsedData) {
        const m = scanText.match(/^([a-zA-Z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?(?:\?token=(.+))?$/);
        if (m) {
          parsedData = { url: `http://${m[1]}:${m[2] || '7474'}`, token: m[3] || '', mode: 'direct' };
        }
      }

      if (!parsedData) throw new Error(t({ en: 'QR code format not recognized.', zh: '无法识别的二维码格式。' }));

      // ── Connect: Relay or Direct ──
      if (parsedData.mode === 'relay' || parsedData.relayToken) {
        if (!parsedData.relayToken) throw new Error('Relay QR missing relayToken.');
        const registered = await registerLocalRelayAgent({
          relayToken: parsedData.relayToken,
          name: parsedData.name || 'My PC Agent',
          wsRelayUrl: parsedData.wsRelayUrl,
        });
        const instance = mapRawInstance(registered, {
          name: registered.name || 'My PC (Agentrix Relay)',
          instanceUrl: parsedData.wsRelayUrl || 'wss://api.agentrix.top/relay',
          deployType: 'local',
          relayToken: parsedData.relayToken,
          wsRelayUrl: parsedData.wsRelayUrl,
        });
        addInstance?.(instance);
        setActiveInstance?.(instance.id);
        Alert.alert(t({ en: 'Connected!', zh: '连接成功！' }), t({ en: 'Agent connected via relay.', zh: '智能体已通过中继连接。' }),
          [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        if (!parsedData.url) throw new Error(t({ en: 'QR code missing URL.', zh: '二维码缺少地址。' }));
        const result = await bindOpenClaw({
          instanceUrl: parsedData.url,
          apiToken: parsedData.token || '',
          instanceName: parsedData.name || 'My Agent',
        });
        const instance = mapRawInstance(result, {
          name: result.name || 'My Agent',
          instanceUrl: parsedData.url,
          deployType: 'existing',
        });
        addInstance?.(instance);
        setActiveInstance?.(instance.id);
        Alert.alert(t({ en: 'Connected!', zh: '连接成功！' }), t({ en: 'Agent connected.', zh: '智能体已连接。' }),
          [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (error: any) {
      Alert.alert(
        t({ en: 'Scan Error', zh: '扫描错误' }),
        error.message || t({ en: 'Failed to process QR code.', zh: '二维码处理失败。' }),
      );
      setScanned(false);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission?.granted) {
    if (mode === 'qr') {
      return (
        <View style={styles.center}>
          <Text style={styles.permText}>{t({ en: 'Camera permission required', zh: '需要相机权限' })}</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>{t({ en: 'Grant Permission', zh: '授予权限' })}</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'pet' && styles.modeChipActive]}
          onPress={() => setMode('pet')}
        >
          <Text style={[styles.modeChipText, mode === 'pet' && styles.modeChipTextActive]}>
            {t({ en: '6-View Pet Scan', zh: '六视角生成' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'qr' && styles.modeChipActive]}
          onPress={() => setMode('qr')}
        >
          <Text style={[styles.modeChipText, mode === 'qr' && styles.modeChipTextActive]}>
            {t({ en: 'QR Pairing', zh: '二维码配对' })}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'pet' ? (
        <ScrollView contentContainerStyle={styles.petScrollContent}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>{t({ en: 'Six-view pet scan generator', zh: '六视角宠物扫描生成' })}</Text>
            <Text style={styles.heroDescription}>
              {t({
                en: 'Capture front, left, right, back, top, and bottom views. Each image is uploaded immediately, then submitted as a real pet-generation scan task.',
                zh: '依次采集正面、左侧、右侧、背面、俯视、仰视。每张图片会先上传，再作为真实 pet-generation 扫描任务提交。',
              })}
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>{completedPetViews}/6</Text>
                <Text style={styles.heroStatLabel}>{t({ en: 'views ready', zh: '视角已就绪' })}</Text>
              </View>
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatValue}>{petProvider}</Text>
                <Text style={styles.heroStatLabel}>{t({ en: 'provider', zh: '服务商' })}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t({ en: 'Provider', zh: '服务商' })}</Text>
            <View style={styles.chipRow}>
              {PET_PROVIDERS.map((provider) => (
                <TouchableOpacity
                  key={provider.value}
                  style={[styles.choiceChip, petProvider === provider.value && styles.choiceChipActive]}
                  onPress={() => setPetProvider(provider.value)}
                >
                  <Text style={[styles.choiceChipText, petProvider === provider.value && styles.choiceChipTextActive]}>
                    {provider.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, styles.sectionTitleSpacing]}>{t({ en: 'Style', zh: '风格' })}</Text>
            <View style={styles.chipRow}>
              {PET_STYLES.map((style) => (
                <TouchableOpacity
                  key={style.value}
                  style={[styles.choiceChip, petStyle === style.value && styles.choiceChipActive]}
                  onPress={() => setPetStyle(style.value)}
                >
                  <Text style={[styles.choiceChipText, petStyle === style.value && styles.choiceChipTextActive]}>
                    {style.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t({ en: 'Prompt override (optional)', zh: '补充描述（可选）' })}</Text>
            <TextInput
              style={styles.promptInput}
              multiline
              numberOfLines={4}
              value={petPrompt}
              onChangeText={setPetPrompt}
              placeholder={t({
                en: 'Optional: describe material, expression, accessories, or animation mood.',
                zh: '可选：补充材质、表情、配饰或动作氛围。',
              })}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {PET_SCAN_VIEWS.map((slot) => {
            const uploaded = petViews[slot.key];
            const busy = uploadingView === slot.key;
            return (
              <View key={slot.key} style={styles.captureCard}>
                <View style={styles.captureCardHeader}>
                  <View>
                    <Text style={styles.captureTitle}>{t(slot.title)}</Text>
                    <Text style={styles.captureHint}>{t(slot.hint)}</Text>
                  </View>
                  <View style={[styles.captureBadge, uploaded && styles.captureBadgeReady]}>
                    <Text style={[styles.captureBadgeText, uploaded && styles.captureBadgeTextReady]}>
                      {uploaded ? t({ en: 'Ready', zh: '已完成' }) : t({ en: 'Pending', zh: '待采集' })}
                    </Text>
                  </View>
                </View>

                {uploaded ? (
                  <Image source={{ uri: uploaded.localUri }} style={styles.capturePreview} resizeMode="cover" />
                ) : (
                  <View style={styles.capturePlaceholder}>
                    {busy ? (
                      <>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={styles.capturePlaceholderText}>{t({ en: 'Uploading view...', zh: '正在上传视角...' })}</Text>
                      </>
                    ) : (
                      <Text style={styles.capturePlaceholderText}>{t({ en: 'No image yet', zh: '尚未采集图片' })}</Text>
                    )}
                  </View>
                )}

                <View style={styles.captureActionsRow}>
                  <TouchableOpacity
                    style={[styles.captureActionBtn, busy && styles.captureActionBtnDisabled]}
                    disabled={busy || uploadingView !== null || petSubmitting}
                    onPress={() => handleCapturePetView(slot.key, 'camera')}
                  >
                    <Text style={styles.captureActionText}>{t({ en: 'Capture', zh: '拍摄' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.captureActionBtnSecondary, busy && styles.captureActionBtnDisabled]}
                    disabled={busy || uploadingView !== null || petSubmitting}
                    onPress={() => handleCapturePetView(slot.key, 'library')}
                  >
                    <Text style={styles.captureActionText}>{t({ en: 'Import', zh: '导入' })}</Text>
                  </TouchableOpacity>
                  {uploaded && (
                    <TouchableOpacity
                      style={styles.captureRemoveBtn}
                      disabled={petSubmitting}
                      onPress={() => handleRemovePetView(slot.key)}
                    >
                      <Text style={styles.captureRemoveText}>{t({ en: 'Remove', zh: '移除' })}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[
              styles.submitPetBtn,
              (petSubmitting || uploadingView !== null || completedPetViews !== PET_SCAN_VIEWS.length) && styles.submitPetBtnDisabled,
            ]}
            disabled={petSubmitting || uploadingView !== null || completedPetViews !== PET_SCAN_VIEWS.length}
            onPress={handleSubmitPetScan}
          >
            <Text style={styles.submitPetText}>
              {petSubmitting
                ? t({ en: 'Submitting pet scan...', zh: '正在提交宠物扫描...' })
                : t({ en: 'Submit 6-view generation', zh: '提交六视角生成' })}
            </Text>
          </TouchableOpacity>

          {(petTaskId || recentTasks.length > 0) && (
            <View style={styles.sectionCard}>
              <View style={styles.taskHeader}>
                <Text style={styles.sectionTitle}>{t({ en: 'Latest scan task', zh: '最近扫描任务' })}</Text>
                {petTaskId && (
                  <TouchableOpacity onPress={handleRefreshPetTask}>
                    <Text style={styles.taskRefreshText}>{t({ en: 'Refresh', zh: '刷新' })}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {petTaskId && (
                <View style={styles.taskSummaryCard}>
                  <Text style={styles.taskSummaryLabel}>Task ID</Text>
                  <Text style={styles.taskSummaryValue}>{petTaskId}</Text>
                  <Text style={styles.taskSummaryLabel}>{t({ en: 'Status', zh: '状态' })}</Text>
                  <Text style={styles.taskSummaryValue}>{petTaskStatus || 'submitted'}</Text>
                </View>
              )}

              {recentTasks.slice(0, 3).map((task) => (
                <View key={task.taskId} style={styles.recentTaskRow}>
                  <View style={styles.recentTaskMeta}>
                    <Text style={styles.recentTaskTitle}>{task.taskId}</Text>
                    <Text style={styles.recentTaskHint}>{task.style || task.provider || 'scan'}</Text>
                  </View>
                  <Text style={styles.recentTaskStatus}>{task.status}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned && !processing ? undefined : handleBarCodeScanned}
          />

          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              {processing && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.processingText}>{t({ en: 'Processing...', zh: '处理中...' })}</Text>
                </View>
              )}
            </View>

            <Text style={styles.hint}>
              {t({ en: 'Scan desktop, web, or agent QR code', zh: '扫描桌面端、网页端或智能体二维码' })}
            </Text>

            {scanned && !processing && (
              <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
                <Text style={styles.rescanText}>{t({ en: 'Tap to Rescan', zh: '点击重新扫描' })}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  permBtn: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modeSwitch: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: colors.bgPrimary,
    zIndex: 3,
  },
  modeChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: {
    backgroundColor: '#12304d',
    borderColor: colors.accent,
  },
  modeChipText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  modeChipTextActive: {
    color: colors.textPrimary,
  },
  petScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    backgroundColor: colors.bgPrimary,
    gap: 14,
  },
  heroCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  heroDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  heroStatPill: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0d1e31',
    borderWidth: 1,
    borderColor: '#1f4668',
  },
  heroStatValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  sectionTitleSpacing: {
    marginTop: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  choiceChipActive: {
    borderColor: colors.accent,
    backgroundColor: '#12304d',
  },
  choiceChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  choiceChipTextActive: {
    color: colors.textPrimary,
  },
  promptInput: {
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
  },
  captureCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  captureCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  captureTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  captureHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 220,
  },
  captureBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2f3746',
  },
  captureBadgeReady: {
    backgroundColor: 'rgba(16,185,129,0.16)',
  },
  captureBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  captureBadgeTextReady: {
    color: colors.success,
  },
  capturePreview: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: colors.bgSecondary,
  },
  capturePlaceholder: {
    height: 160,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    gap: 10,
  },
  capturePlaceholderText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  captureActionsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  captureActionBtn: {
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  captureActionBtnSecondary: {
    borderRadius: 14,
    backgroundColor: '#15446d',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  captureActionBtnDisabled: {
    opacity: 0.55,
  },
  captureActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  captureRemoveBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: 'rgba(127,29,29,0.18)',
  },
  captureRemoveText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '700',
  },
  submitPetBtn: {
    borderRadius: 18,
    paddingVertical: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitPetBtnDisabled: {
    opacity: 0.45,
  },
  submitPetText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '800',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskRefreshText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  taskSummaryCard: {
    borderRadius: 16,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
    marginBottom: 10,
  },
  taskSummaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  taskSummaryValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  recentTaskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  recentTaskMeta: {
    flex: 1,
    paddingRight: 12,
  },
  recentTaskTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  recentTaskHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  recentTaskStatus: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: {
    width: 260, height: 260, borderRadius: 20,
    borderWidth: 3, borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  processingOverlay: { alignItems: 'center', gap: 12 },
  processingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  hint: { marginTop: 24, fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: 32 },
  rescanBtn: { marginTop: 16, backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  rescanText: { color: '#fff', fontWeight: '700', fontSize: 14 },
}));
