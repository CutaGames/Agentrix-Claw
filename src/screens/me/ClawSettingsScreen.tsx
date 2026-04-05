import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput, Share, Platform, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { UiComplexity } from '../../stores/settingsStore';
import type { LocalAiStatus } from '../../stores/settingsStore';
import { useI18n, type Language } from '../../stores/i18nStore';
import { resolveMobileWakeWordConfig } from '../../config/wakeWord';
import { clearVoiceDiagnostics, getVoiceDiagnosticsCount, getVoiceDiagnosticsText } from '../../services/voiceDiagnostics';
import {
  getAndroidOverlayPermissionStatus,
  requestAndroidOverlayPermission,
  syncAndroidBackgroundWakeWordConfig,
  isAndroidBackgroundWakeWordAvailable,
} from '../../services/androidBackgroundWakeWord.service';
import {
  appendLocalWakeWordSample,
  captureLocalWakeWordSample,
  getLocalWakeWordModelReadiness,
  getLocalWakeWordSampleCount,
  hasLocalWakeWordModel,
  runLocalWakeWordSelfCheck,
  thresholdFromSensitivity,
  type WakeWordEngine,
} from '../../services/localWakeWord.service';

export function ClawSettingsScreen() {
  const navigation = useNavigation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const uiComplexity = useSettingsStore((s) => s.uiComplexity);
  const setUiComplexity = useSettingsStore((s) => s.setUiComplexity);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const toggleNotifications = useSettingsStore((s) => s.toggleNotifications);
  const wakeWordConfig = useSettingsStore((s) => s.wakeWordConfig);
  const setWakeWordConfig = useSettingsStore((s) => s.setWakeWordConfig);
  const resetWakeWordConfig = useSettingsStore((s) => s.resetWakeWordConfig);
  const { language, setLanguage, t } = useI18n();
  const localAiEnabled = useSettingsStore((s) => s.localAiEnabled);
  const localAiStatus = useSettingsStore((s) => s.localAiStatus);
  const localAiProgress = useSettingsStore((s) => s.localAiProgress);
  const localAiModelId = useSettingsStore((s) => s.localAiModelId);
  const setLocalAiEnabled = useSettingsStore((s) => s.setLocalAiEnabled);
  const setLocalAiStatus = useSettingsStore((s) => s.setLocalAiStatus);
  const setLocalAiProgress = useSettingsStore((s) => s.setLocalAiProgress);
  const effectiveWakeWordConfig = resolveMobileWakeWordConfig(wakeWordConfig);
  const diagnosticsCount = getVoiceDiagnosticsCount();
  const [localWakeWordBusy, setLocalWakeWordBusy] = useState(false);
  const [localWakeWordStatus, setLocalWakeWordStatus] = useState('');
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState<boolean | null>(null);

  const localWakeWordSampleCount = useMemo(
    () => getLocalWakeWordSampleCount(wakeWordConfig.localModel),
    [wakeWordConfig.localModel],
  );
  const localWakeWordReadiness = useMemo(
    () => getLocalWakeWordModelReadiness(wakeWordConfig.localModel),
    [wakeWordConfig.localModel],
  );
  const hasLocalModel = hasLocalWakeWordModel(wakeWordConfig.localModel);
  const effectiveWakeEngine = useMemo<WakeWordEngine>(() => {
    if ((wakeWordConfig.engine === 'local-template' || wakeWordConfig.engine === 'auto') && hasLocalModel) {
      return 'local-template';
    }
    return 'system-speech';
  }, [hasLocalModel, wakeWordConfig.engine]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isAndroidBackgroundWakeWordAvailable()) {
      return;
    }
    void getAndroidOverlayPermissionStatus()
      .then(setOverlayPermissionGranted)
      .catch(() => setOverlayPermissionGranted(false));
  }, [wakeWordConfig.enabled, wakeWordConfig.localModel]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isAndroidBackgroundWakeWordAvailable()) {
      return;
    }
    void syncAndroidBackgroundWakeWordConfig({
      enabled: wakeWordConfig.enabled,
      displayName: wakeWordConfig.displayName,
      threshold: thresholdFromSensitivity(wakeWordConfig.sensitivity),
      activeInstanceId: null,
      activeInstanceName: null,
      model: hasLocalModel ? wakeWordConfig.localModel : null,
    }).catch(() => {});
  }, [hasLocalModel, wakeWordConfig.displayName, wakeWordConfig.enabled, wakeWordConfig.localModel, wakeWordConfig.sensitivity]);

  const wakeWordEngineOptions: { id: WakeWordEngine; label: string; desc: string }[] = [
    {
      id: 'auto',
      label: t({ en: 'Auto', zh: '自动' }),
      desc: t({ en: 'Prefer the device-local model, then system fallback', zh: '优先端侧本地模型，失败后回退到系统识别' }),
    },
    {
      id: 'local-template',
      label: t({ en: 'Local', zh: '本地模型' }),
      desc: t({ en: 'Template model trained on this device only', zh: '当前设备本地训练的模板模型' }),
    },
    {
      id: 'system-speech',
      label: t({ en: 'System', zh: '系统识别' }),
      desc: t({ en: 'Use built-in speech fallback', zh: '使用系统语音识别兜底' }),
    },
  ];

  const currentWakeEngineDescription = useMemo(() => {
    return wakeWordEngineOptions.find((option) => option.id === wakeWordConfig.engine)?.desc ?? wakeWordEngineOptions[0].desc;
  }, [wakeWordConfig.engine, wakeWordEngineOptions]);

  const handleToggleWakeWord = () => {
    const nextEnabled = !wakeWordConfig.enabled;
    setWakeWordConfig({ enabled: nextEnabled });
    if (
      nextEnabled
      && Platform.OS === 'android'
      && isAndroidBackgroundWakeWordAvailable()
      && !hasLocalModel
    ) {
      Alert.alert(
        t({ en: 'Local sample required for Android background wake word', zh: 'Android 后台唤醒需要先录制本地样本' }),
        t({
          en: `The floating ball can stay on screen after exit, but background wake-word listening only starts after you record at least ${localWakeWordReadiness.minReadySamples} clean local samples.`,
          zh: `退出 App 后悬浮球可以保留，但后台热词监听只有在你至少录制 ${localWakeWordReadiness.minReadySamples} 条清晰本地样本后才会开始。未录样时仍可点击悬浮球进入语音页。`,
        }),
      );
    }
  };

  const handleRecordLocalSample = async () => {
    setLocalWakeWordBusy(true);
    setLocalWakeWordStatus(t({ en: 'Listening for one wake-word sample...', zh: '正在录制一条本地唤醒词样本，请对着手机说出唤醒词...' }));
    try {
      const sample = await captureLocalWakeWordSample();
      const nextModel = appendLocalWakeWordSample(
        wakeWordConfig.localModel,
        sample,
        wakeWordConfig.displayName,
      );
      setWakeWordConfig({
        localModel: nextModel,
        engine: 'local-template',
      });
      const nextReadiness = getLocalWakeWordModelReadiness(nextModel);
      setLocalWakeWordStatus(
        nextReadiness.ready
          ? t({
              en: `Saved sample ${nextReadiness.sampleCount}. Local wake word is ready. Run self-check once to confirm it matches your voice consistently.`,
              zh: `已保存第 ${nextReadiness.sampleCount} 条样本，本地唤醒词已就绪。建议再做一次自检，确认它能稳定匹配你的声音。`,
            })
          : t({
              en: `Saved sample ${nextReadiness.sampleCount}. Record ${nextReadiness.remainingSamples} more clean samples before local wake word takes over. Until then, Auto still uses system speech fallback.`,
              zh: `已保存第 ${nextReadiness.sampleCount} 条样本。还需要补录 ${nextReadiness.remainingSamples} 条清晰样本，本地唤醒词才会真正接管。此之前，自动模式仍会使用系统语音兜底。`,
            }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalWakeWordStatus(
        t({
          en: `Sample capture failed: ${message}`,
          zh: `样本录制失败：${message}`,
        }),
      );
      Alert.alert(t({ en: 'Local wake-word sample failed', zh: '本地唤醒词录制失败' }), message);
    } finally {
      setLocalWakeWordBusy(false);
    }
  };

  const handleRunLocalSelfCheck = async () => {
    if (!wakeWordConfig.localModel || !hasLocalModel) {
      Alert.alert(
        t({ en: 'Model required', zh: '需要先训练模型' }),
        t({
          en: `Record at least ${localWakeWordReadiness.minReadySamples} local wake-word samples first.`,
          zh: `请先录制至少 ${localWakeWordReadiness.minReadySamples} 条本地唤醒词样本。`,
        }),
      );
      return;
    }

    setLocalWakeWordBusy(true);
    setLocalWakeWordStatus(t({ en: 'Self-check is listening...', zh: '本地模型自检中，请再说一次唤醒词...' }));
    try {
      const result = await runLocalWakeWordSelfCheck(
        wakeWordConfig.localModel,
        thresholdFromSensitivity(wakeWordConfig.sensitivity),
      );
      setLocalWakeWordStatus(
        t({
          en: `Self-check score ${result.similarity.toFixed(3)} / threshold ${result.threshold.toFixed(3)}`,
          zh: `自检分数 ${result.similarity.toFixed(3)} / 阈值 ${result.threshold.toFixed(3)}`,
        }),
      );
      Alert.alert(
        t({ en: 'Local wake-word self-check', zh: '本地唤醒词自检' }),
        result.matched
          ? t({ en: `Matched successfully. Score ${result.similarity.toFixed(3)}.`, zh: `匹配成功，分数 ${result.similarity.toFixed(3)}。` })
          : t({ en: `Not matched. Score ${result.similarity.toFixed(3)}. Try recording more samples or lowering sensitivity.`, zh: `未匹配成功，分数 ${result.similarity.toFixed(3)}。建议补录更多样本，或适当降低灵敏度门槛。` }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalWakeWordStatus(t({ en: `Self-check failed: ${message}`, zh: `自检失败：${message}` }));
      Alert.alert(t({ en: 'Local self-check failed', zh: '本地自检失败' }), message);
    } finally {
      setLocalWakeWordBusy(false);
    }
  };

  const handleClearLocalModel = () => {
    Alert.alert(
      t({ en: 'Clear local model', zh: '清空本地模型' }),
      t({ en: 'This removes all recorded wake-word samples on this device.', zh: '这会删除当前设备上的所有本地唤醒词样本。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Clear', zh: '清空' }),
          style: 'destructive',
          onPress: () => {
            setWakeWordConfig({ localModel: null, engine: wakeWordConfig.engine === 'local-template' ? 'auto' : wakeWordConfig.engine });
            setLocalWakeWordStatus(t({ en: 'Local wake-word samples were cleared.', zh: '本地唤醒词样本已清空。' }));
          },
        },
      ],
    );
  };

  const uiModes: { id: UiComplexity; icon: string; label: string; desc: string }[] = [
    { id: 'beginner', icon: '🌱', label: t({ en: 'Beginner', zh: '入门' }), desc: t({ en: 'Chat, basic skills, simple setup', zh: '聊天、基础技能、简化设置' }) },
    { id: 'advanced', icon: '🔧', label: t({ en: 'Advanced', zh: '进阶' }), desc: t({ en: '+ Workflows, Memory Hub, API Keys, Teams', zh: '+ 工作流、记忆中心、API 密钥、团队功能' }) },
    { id: 'professional', icon: '⚡', label: t({ en: 'Professional', zh: '专业' }), desc: t({ en: '+ Permissions Matrix, Custom LLM, MCP Tools', zh: '+ 权限矩阵、自定义 LLM、MCP 工具' }) },
  ];

  const settingGroups = [
    {
      title: t({ en: 'AI Engine', zh: 'AI 引擎' }),
      items: [
        {
          id: 'local-ai',
          icon: '🧠',
          label: t({ en: 'Local AI Model', zh: '本地 AI 模型' }),
          value: localAiStatus === 'ready'
            ? t({ en: 'Ready', zh: '已就绪' })
            : localAiStatus === 'downloading'
            ? `${localAiProgress}%`
            : t({ en: 'Not downloaded', zh: '未下载' }),
        },
        {
          id: 'wearable-devices',
          icon: '🕶️',
          label: t({ en: 'Wearable Devices', zh: '可穿戴设备' }),
          value: '',
        },
      ],
    },
    {
      title: t({ en: 'Agent', zh: '智能体' }),
      items: [
        { id: 'notify', icon: '🔔', label: t({ en: 'Notifications', zh: '通知' }), value: notificationsEnabled ? t({ en: 'On', zh: '开启' }) : t({ en: 'Off', zh: '关闭' }) },
        { id: 'theme', icon: '🎨', label: t({ en: 'Theme', zh: '主题' }), value: t({ en: 'Dark', zh: '深色' }) },
      ],
    },
    {
      title: t({ en: 'Developer', zh: '开发者' }),
      items: [
        { id: 'api', icon: '🤖', label: t({ en: 'AI Providers & Subscriptions', zh: 'AI 厂商与订阅' }), value: '' },
        { id: 'logs', icon: '📋', label: t({ en: 'Debug Logs', zh: '调试日志' }), value: diagnosticsCount > 0 ? `${diagnosticsCount}` : '' },
      ],
    },
    {
      title: t({ en: 'About', zh: '关于' }),
      items: [
        { id: 'version', icon: 'ℹ️', label: t({ en: 'App Version', zh: '应用版本' }), value: '1.0.0' },
        { id: 'terms', icon: '📜', label: t({ en: 'Terms of Service', zh: '服务条款' }), value: '' },
        { id: 'privacy', icon: '🔒', label: t({ en: 'Privacy Policy', zh: '隐私政策' }), value: '' },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* UI Complexity Selector */}
      <View style={styles.group}>
        <Text style={styles.groupTitle}>{t({ en: 'Interface Mode', zh: '界面模式' })}</Text>
        <View style={styles.modeCard}>
          <Text style={styles.modeDesc}>{t({ en: 'Choose how much of the app is visible', zh: '选择你想看到的功能复杂度' })}</Text>
          <View style={styles.modeRow}>
            {uiModes.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[styles.modeBtn, uiComplexity === mode.id && styles.modeBtnActive]}
                onPress={() => setUiComplexity(mode.id)}
              >
                <Text style={styles.modeIcon}>{mode.icon}</Text>
                <Text style={[styles.modeLabel, uiComplexity === mode.id && styles.modeLabelActive]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {uiModes.find((m) => m.id === uiComplexity) && (
            <Text style={styles.modeCurrentDesc}>
              {uiModes.find((m) => m.id === uiComplexity)!.icon} {' '}
              {uiModes.find((m) => m.id === uiComplexity)!.desc}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>{t({ en: 'Language', zh: '语言' })}</Text>
        <View style={styles.modeCard}>
          <Text style={styles.modeDesc}>{t({ en: 'Switch the entire app language here', zh: '在这里切换整个 App 的显示语言' })}</Text>
          <View style={styles.modeRow}>
            {([
              { code: 'en' as Language, icon: '🇺🇸', label: 'English' },
              { code: 'zh' as Language, icon: '🇨🇳', label: '中文' },
            ]).map((item) => (
              <TouchableOpacity
                key={item.code}
                style={[styles.modeBtn, language === item.code && styles.modeBtnActive]}
                onPress={() => setLanguage(item.code)}
              >
                <Text style={styles.modeIcon}>{item.icon}</Text>
                <Text style={[styles.modeLabel, language === item.code && styles.modeLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.modeCurrentDesc}>
            {language === 'zh'
              ? t({ en: 'Current language: Chinese', zh: '当前语言：中文' })
              : t({ en: 'Current language: English', zh: '当前语言：English' })}
          </Text>
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>{t({ en: 'Wake Word', zh: '唤醒词' })}</Text>
        <View style={styles.modeCard}>
          <Text style={styles.modeDesc}>
            {t({ en: 'The mobile app now uses a device-local wake-word model first, with system speech recognition as fallback.', zh: '移动端现在默认优先使用端侧本地唤醒词模型，系统语音识别仅作为兜底。' })}
          </Text>

          <TouchableOpacity
            style={[styles.toggleRow, wakeWordConfig.enabled && styles.toggleRowActive]}
            onPress={handleToggleWakeWord}
          >
            <Text style={styles.toggleLabel}>{t({ en: 'Enable wake word', zh: '开启唤醒词' })}</Text>
            <Text style={[styles.toggleValue, wakeWordConfig.enabled && styles.toggleValueActive]}>
              {wakeWordConfig.enabled ? t({ en: 'On', zh: '已开启' }) : t({ en: 'Off', zh: '已关闭' })}
            </Text>
          </TouchableOpacity>

          <Text style={styles.subsectionTitle}>{t({ en: 'Wake-word engine', zh: '唤醒词引擎' })}</Text>
          <View style={styles.modeRow}>
            {wakeWordEngineOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.modeBtn, styles.engineBtn, wakeWordConfig.engine === option.id && styles.modeBtnActive]}
                onPress={() => setWakeWordConfig({ engine: option.id })}
              >
                <Text style={[styles.modeLabel, wakeWordConfig.engine === option.id && styles.modeLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.modeCurrentDesc}>{currentWakeEngineDescription}</Text>

          <Text style={styles.subsectionTitle}>{t({ en: 'Local wake-word model', zh: '本地唤醒词模型' })}</Text>
          <Text style={styles.modeCurrentDesc}>
            {t({
              en: `Saved samples: ${localWakeWordSampleCount}. Local mode becomes available at ${localWakeWordReadiness.minReadySamples} samples.`,
              zh: `已保存样本：${localWakeWordSampleCount} 条。本地模式要到 ${localWakeWordReadiness.minReadySamples} 条样本后才会启用。`,
            })}
          </Text>
          <Text style={styles.modeCurrentDesc}>
            {hasLocalModel
              ? t({ en: 'A trained local model is available on this device.', zh: '当前设备已存在可用的本地模型。' })
              : t({
                  en: `Local training is still incomplete. Record ${localWakeWordReadiness.remainingSamples || localWakeWordReadiness.minReadySamples} more clean samples, or keep using system speech fallback.`,
                  zh: `本地训练还没完成。请继续补录 ${localWakeWordReadiness.remainingSamples || localWakeWordReadiness.minReadySamples} 条清晰样本，或者继续使用系统语音兜底。`,
                })}
          </Text>
          <Text style={styles.modeCurrentDesc}>
            {effectiveWakeEngine === 'local-template'
              ? t({ en: 'Current active engine: local wake-word model.', zh: '当前实际生效引擎：本地唤醒词模型。' })
              : t({ en: 'Current active engine: system speech fallback. This path does not need local training.', zh: '当前实际生效引擎：系统语音兜底。这条路径不需要本地训练。' })}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, localWakeWordBusy && styles.actionBtnDisabled]}
              onPress={() => void handleRecordLocalSample()}
              disabled={localWakeWordBusy}
            >
              <Text style={styles.actionBtnText}>
                {localWakeWordBusy
                  ? t({ en: 'Listening...', zh: '录制中...' })
                  : t({ en: 'Record sample', zh: '录制样本' })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, (!hasLocalModel || localWakeWordBusy) && styles.actionBtnDisabled]}
              onPress={() => void handleRunLocalSelfCheck()}
              disabled={!hasLocalModel || localWakeWordBusy}
            >
              <Text style={styles.actionBtnText}>{t({ en: 'Self-check', zh: '自检' })}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.secondaryBtn, !hasLocalModel && styles.actionBtnDisabled]}
            onPress={handleClearLocalModel}
            disabled={!hasLocalModel}
          >
            <Text style={styles.secondaryBtnText}>{t({ en: 'Clear local model', zh: '清空本地模型' })}</Text>
          </TouchableOpacity>
          {!!localWakeWordStatus && (
            <Text style={styles.localStatusText}>{localWakeWordStatus}</Text>
          )}

          {Platform.OS === 'android' && (
            <>
              <Text style={styles.subsectionTitle}>{t({ en: 'Android background wake word', zh: 'Android 后台唤醒' })}</Text>
              <Text style={styles.modeCurrentDesc}>
                {t({
                  en: `When the app goes to background, Android can keep a floating ball through a foreground service. Background wake-word listening starts only after at least ${localWakeWordReadiness.minReadySamples} local samples have been recorded.`,
                  zh: `当 App 退到后台后，Android 会通过前台服务保留系统悬浮球。后台热词监听只有在至少录制 ${localWakeWordReadiness.minReadySamples} 条本地样本后才会开始。`,
                })}
              </Text>
              <Text style={styles.modeCurrentDesc}>
                {hasLocalModel
                  ? t({ en: 'Background wake word is eligible on this device once overlay permission is granted.', zh: '当前设备在授权悬浮窗后，已经具备后台热词唤醒条件。' })
                  : t({ en: 'Until local training is ready, Android background mode only keeps the floating ball visible. Tap it to enter voice.', zh: '在本地训练完成之前，Android 后台模式只会保留悬浮球显示，点击后进入语音页，但不会自动热词唤醒。' })}
              </Text>
              <Text style={styles.modeCurrentDesc}>
                {overlayPermissionGranted
                  ? t({ en: 'Overlay permission: granted', zh: '悬浮窗权限：已授权' })
                  : t({ en: 'Overlay permission: required for the floating ball after exit', zh: '悬浮窗权限：退出后继续显示悬浮球必须授权' })}
              </Text>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  void requestAndroidOverlayPermission()
                    .then(() => getAndroidOverlayPermissionStatus())
                    .then(setOverlayPermissionGranted)
                    .catch((error) => {
                      const message = error instanceof Error ? error.message : String(error);
                      Alert.alert(t({ en: 'Permission request failed', zh: '权限申请失败' }), message);
                    });
                }}
              >
                <Text style={styles.secondaryBtnText}>
                  {overlayPermissionGranted
                    ? t({ en: 'Re-open overlay permission page', zh: '重新打开悬浮窗权限页' })
                    : t({ en: 'Grant overlay permission', zh: '授权悬浮窗权限' })}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <TextInput
            value={wakeWordConfig.displayName}
            onChangeText={(text) => setWakeWordConfig({ displayName: text })}
            placeholder={t({ en: 'Primary wake phrase, e.g. Hey Agentrix', zh: '主唤醒短语，例如 Hey Agentrix' })}
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
          />

          <TextInput
            value={wakeWordConfig.fallbackPhrases.join(', ')}
            onChangeText={(text) => setWakeWordConfig({ fallbackPhrases: text.split(',').map((item) => item.trim()).filter(Boolean) })}
            placeholder={t({ en: 'System wake phrases, comma separated', zh: '系统唤醒短语，逗号分隔' })}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.textInput}
          />

          <TextInput
            value={String(wakeWordConfig.sensitivity)}
            onChangeText={(text) => {
              const parsed = Number(text);
              if (!Number.isNaN(parsed)) {
                setWakeWordConfig({ sensitivity: parsed });
              }
              if (!text.trim()) {
                setWakeWordConfig({ sensitivity: 0.65 });
              }
            }}
            placeholder="0.65"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.textInput}
          />

          <Text style={styles.modeCurrentDesc}>
            {t({ en: 'Current runtime:', zh: '当前运行配置：' })}{' '}
            {effectiveWakeWordConfig.enabled
              ? `${effectiveWakeWordConfig.displayName} · ${effectiveWakeEngine === 'local-template'
                ? t({ en: `Local model (${localWakeWordSampleCount} samples)`, zh: `本地模型（${localWakeWordSampleCount} 条样本）` })
                : t({ en: `System speech fallback (${effectiveWakeWordConfig.fallbackPhrases.join(', ')})`, zh: `系统语音兜底（${effectiveWakeWordConfig.fallbackPhrases.join(', ')}）` })}`
              : t({ en: 'disabled', zh: '已关闭' })}
          </Text>
          <Text style={styles.modeCurrentDesc}>
            {hasLocalModel
              ? t({ en: 'The app can use your on-device local wake-word model in the foreground.', zh: '当前前台可以直接使用端侧本地唤醒词模型。' })
              : t({ en: `Foreground mode can still fall back to system wake-phrase listening, but local wake word and Android background wake word stay disabled until you record ${localWakeWordReadiness.minReadySamples} usable samples.`, zh: `前台仍可退回到系统唤醒短语监听，但本地唤醒词和 Android 后台热词唤醒会保持关闭，直到你录到 ${localWakeWordReadiness.minReadySamples} 条可用样本。` })}
          </Text>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              resetWakeWordConfig();
              Alert.alert(t({ en: 'Reset complete', zh: '已重置' }), t({ en: 'Wake-word settings now fall back to packaged defaults.', zh: '唤醒词设置已回退到打包默认值。' }));
            }}
          >
            <Text style={styles.secondaryBtnText}>{t({ en: 'Reset to packaged defaults', zh: '重置为打包默认值' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {settingGroups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.groupItems}>
            {group.items.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.item, i < group.items.length - 1 && styles.itemBorder]}
                onPress={() => {
                  if (item.id === 'local-ai') {
                    navigation.navigate('LocalAiModel' as never);
                    return;
                  }
                  if (item.id === 'wearable-devices') {
                    navigation.navigate('WearableHub' as never);
                    return;
                  }
                  if (item.id === 'notify') {
                    toggleNotifications(!notificationsEnabled);
                    return;
                  }
                  if (item.id === 'api') {
                    navigation.navigate('ApiKeys' as never);
                    return;
                  }
                  if (item.id === 'logs') {
                    const diagnosticsText = getVoiceDiagnosticsText();
                    Alert.alert(
                      t({ en: 'Debug Logs', zh: '调试日志' }),
                      diagnosticsCount > 0
                        ? t({ en: `${diagnosticsCount} diagnostic entries are stored locally. You can share them or clear them here.`, zh: `当前本地已保存 ${diagnosticsCount} 条诊断日志。你可以直接分享或清空。` })
                        : t({ en: 'No diagnostic entries captured yet.', zh: '当前还没有采集到诊断日志。' }),
                      [
                        {
                          text: t({ en: 'Share', zh: '分享' }),
                          onPress: () => {
                            void Share.share({ message: diagnosticsText });
                          },
                        },
                        {
                          text: t({ en: 'Clear', zh: '清空' }),
                          style: 'destructive',
                          onPress: () => {
                            clearVoiceDiagnostics();
                            Alert.alert(t({ en: 'Cleared', zh: '已清空' }), t({ en: 'Diagnostic logs were cleared.', zh: '诊断日志已清空。' }));
                          },
                        },
                        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
                      ],
                    );
                  }
                }}
              >
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <Text style={styles.itemLabel}>{item.label}</Text>
                {item.value ? <Text style={styles.itemValue}>{item.value}</Text> : null}
                <Text style={styles.itemArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.dangerBtn}
        onPress={() => Alert.alert(t({ en: 'Sign Out', zh: '退出登录' }), t({ en: 'Are you sure?', zh: '确定要退出登录吗？' }), [
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
          { text: t({ en: 'Sign Out', zh: '退出登录' }), style: 'destructive', onPress: clearAuth },
        ])}
      >
        <Text style={styles.dangerBtnText}>{t({ en: 'Sign Out', zh: '退出登录' })}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40, gap: 20 },
  group: { gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 4 },
  groupItems: { backgroundColor: colors.bgCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  item: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemIcon: { fontSize: 18, width: 26 },
  itemLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  itemValue: { fontSize: 13, color: colors.textMuted },
  itemArrow: { fontSize: 20, color: colors.textMuted },
  dangerBtn: { alignItems: 'center', padding: 14, backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.error + '55' },
  dangerBtnText: { color: colors.error, fontWeight: '700', fontSize: 15 },
  // ── UI Mode ──
  modeCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  modeDesc: { fontSize: 13, color: colors.textMuted },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  modeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  modeIcon: { fontSize: 22 },
  modeLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  modeLabelActive: { color: colors.accent },
  modeCurrentDesc: { fontSize: 12, color: colors.textSecondary, paddingTop: 2 },
  subsectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  engineBtn: { flexBasis: 0 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent + '18',
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  localStatusText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  textInput: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bgSecondary,
  },
  toggleRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '12',
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  toggleValue: { color: colors.textMuted, fontSize: 12 },
  toggleValueActive: { color: colors.accent },
  secondaryBtn: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
