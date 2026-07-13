/**
 * BirthStep — Soul_Birth ① 「诞生你的 AI」(起名 + 选皮肤 + 云端 provision 苏醒动画)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.3(Requirements 2.1–2.8,Design §2.3 / §3.1)
 *
 * 行为(Design §2.3 / §3.1):
 *   - 起名:名称输入(持久化为 Claw_Instance 展示名,R2.8)。
 *   - 选皮肤:默认灵狐 clan A(R2.2);三按钮「换一个 / 拍一张 / 去市场选」(R2.3):
 *       · 换一个 → 在内置形象间循环切换(本地、离线可用,主线不依赖网络)。
 *       · 拍一张 → 进 WorldEngineScanner 拍照生成(复用现有扫描流)。
 *       · 去市场选 → 进皮肤拍卖市场(复用现有 PetsSkins)。
 *   - 确认 → `provisionCloudAgent({ name, llmProvider })`(R2.4),进入「灵魂正在苏醒」
 *     全屏覆盖动画(柔光呼吸 + 文案轮播),**不展示原始进度条**(R2.5)。
 *   - 并行轮询 `getInstanceById`(每 3s),90s 硬超时(R2.6);provision/轮询提前失败即时
 *     提示(R2.6a);结束态出现前动画持续(R2.6b);失败保留 name/avatar 可重试。
 *   - 成功(实例可查询且可用)→ setBirth({ instanceId, petName, avatarId }) → onComplete()(R2.7)。
 *
 * 复用:`provisionCloudAgent`/`getInstanceById`(openclaw.service)、`mapRawInstance`+authStore
 *   (与 CloudDeployScreen 同款 provision 落地)、`PetRenderer`(形象预览)、`navRefNavigate`
 *   (覆盖层 sibling 位置不能用 useNavigation,统一走共享 navigationRef)。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StepScaffold } from '../StepScaffold';
import type { SoulBirthStepProps } from '../types';
import { colors } from '../../../theme/colors';
import { PetRenderer, type PetClan } from '../../pet/PetRiveRenderer';
import {
  provisionCloudAgent,
  getInstanceById,
  type OpenClawInstanceInfo,
} from '../../../services/openclaw.service';
import { mapRawInstance } from '../../../services/auth';
import { useAuthStore } from '../../../stores/authStore';
import { useSoulBirthStore } from '../../../stores/soulBirthStore';
import { navRefNavigate } from '../../../navigation/navigationRef';
import { themedStyles } from '../../../theme/useTheme';

// ── Tuning constants (Design §3.1) ───────────────────────────────────────────
const POLL_INTERVAL_MS = 3_000; // 轮询 getInstanceById 间隔
const HARD_TIMEOUT_MS = 90_000; // 硬超时(R2.6)
const COPY_ROTATE_MS = 2_400; // 苏醒文案轮播间隔
const NAME_MAX_LEN = 24;

/**
 * 内置形象目录(本地、离线可用 → 主线不依赖网络,Property 1)。
 * 默认(index 0)= 灵狐 clan A(R2.2);「换一个」在本目录内循环。
 * 每项携带 renderer 的 clan 短码(A..F)与 idle 情绪,复用 PetRenderer 视觉。
 */
interface BuiltinAvatar {
  id: string;
  name: string;
  clan: PetClan;
  emotion: string;
}

const BUILTIN_AVATARS: BuiltinAvatar[] = [
  { id: 'kitsune-a', name: '灵狐', clan: 'A', emotion: 'happy' },
  { id: 'sprout-b', name: '萌芽', clan: 'B', emotion: 'calm' },
  { id: 'lumi-c', name: '墨灵', clan: 'C', emotion: 'thinking' },
  { id: 'vibe-d', name: '皮皮', clan: 'D', emotion: 'excited' },
  { id: 'whale-e', name: '鲸语', clan: 'E', emotion: 'focused' },
  { id: 'teddy-f', name: '暖暖', clan: 'F', emotion: 'love' },
];

const DEFAULT_NAME = '小灵';

/** 苏醒文案(轮播)。`{name}` 由当前名称替换。 */
const AWAKENING_COPY = [
  '正在为你的灵魂注入意识…',
  '在云端点亮第一缕星火…',
  '{name} 正在睁开眼睛…',
  '马上就好,它就要醒来了…',
];

type Phase = 'setup' | 'awakening' | 'failed';

/** 实例是否已「苏醒」可用:active 或已分配 instanceUrl(与 CloudDeployScreen 同款判定)。 */
function isAwake(info: OpenClawInstanceInfo | null | undefined): boolean {
  if (!info) return false;
  return info.status === 'active' || !!info.instanceUrl;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function BirthStep({ onComplete, onSkip }: SoulBirthStepProps) {
  const setBirth = useSoulBirthStore((s) => s.setBirth);
  const suspend = useSoulBirthStore((s) => s.suspend);
  const addInstance = useAuthStore((s) => s.addInstance);
  const setActiveInstance = useAuthStore((s) => s.setActiveInstance);

  const [phase, setPhase] = useState<Phase>('setup');
  // 从 store 草稿恢复名称/形象(R2.3 往返保留):用户点「拍一张 / 去市场选」离开覆盖层前
  // 会把当前输入持久化到 store(见 handleCameraGenerate / handleGoMarket);本组件在 host
  // 暂挂期间会被卸载,返回时重新挂载——此处用懒初始化从 store 读回,使名称/形象原样恢复。
  const [petName, setPetName] = useState(() => useSoulBirthStore.getState().petName ?? '');
  const [avatarIndex, setAvatarIndex] = useState(() => {
    const storedId = useSoulBirthStore.getState().avatarId;
    const idx = storedId ? BUILTIN_AVATARS.findIndex((a) => a.id === storedId) : -1;
    return idx >= 0 ? idx : 0;
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copyIndex, setCopyIndex] = useState(0);

  const avatar = BUILTIN_AVATARS[avatarIndex] ?? BUILTIN_AVATARS[0];
  const effectiveName = petName.trim() || DEFAULT_NAME;

  // 卸载时取消任何在途轮询(避免 setState-after-unmount / 串味)。
  const cancelledRef = useRef(false);
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // ── 苏醒呼吸光晕动画 ───────────────────────────────────────────────────────
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'awakening') return;
    breathe.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, breathe]);

  // ── 苏醒文案轮播 ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'awakening') return;
    setCopyIndex(0);
    const timer = setInterval(() => {
      setCopyIndex((i) => (i + 1) % AWAKENING_COPY.length);
    }, COPY_ROTATE_MS);
    return () => clearInterval(timer);
  }, [phase]);

  // ── 形象选择三按钮(R2.3) ────────────────────────────────────────────────
  const handleSwitchBuiltin = useCallback(() => {
    setAvatarIndex((i) => (i + 1) % BUILTIN_AVATARS.length);
  }, []);

  // 覆盖层处于导航器 sibling 位置,useNavigation 会抛错 → 统一走共享 navigationRef。
  // 离开覆盖层去全屏目标前:① 把当前名称/形象草稿持久化到 store(返回后恢复,R2.3 往返保留);
  // ② `suspend()` 让 SoulBirthHost 临时让出全屏,避免不透明覆盖层遮挡目标屏(修复 task 3.3)。
  // 返回时 host 监听到导航变化即 `resume()`,本步在同一位置原样恢复。
  const handleCameraGenerate = useCallback(() => {
    setBirth({ petName: petName.trim(), avatarId: avatar.id });
    suspend();
    navRefNavigate('World', { screen: 'WorldEngineScanner' });
  }, [petName, avatar.id, setBirth, suspend]);

  const handleGoMarket = useCallback(() => {
    setBirth({ petName: petName.trim(), avatarId: avatar.id });
    suspend();
    navRefNavigate('Plaza', { screen: 'PetsSkins' });
  }, [petName, avatar.id, setBirth, suspend]);

  // ── 成功落地(R2.7 / R2.8) ───────────────────────────────────────────────
  const finishSuccess = useCallback(
    (info: OpenClawInstanceInfo, name: string, avatarId: string) => {
      // 复用 CloudDeployScreen 落地:登记实例并设为活跃,使后续段(first_words / 陪伴)可用。
      try {
        const instance = mapRawInstance(info, {
          name,
          instanceUrl: info.instanceUrl || `cloud-${info.id}.openclaw.app`,
          deployType: 'cloud',
        });
        addInstance(instance);
        setActiveInstance(instance.id);
      } catch {
        /* 登记失败不阻塞主线:实例已在后端创建,getMyInstances 仍可回填(主线必达)。 */
      }
      // 持久化 birth 段产出(名称作为展示名,R2.8;实例 id / 形象,R2.7)。
      setBirth({ instanceId: info.id, petName: name, avatarId });
      onComplete();
    },
    [addInstance, setActiveInstance, setBirth, onComplete],
  );

  // ── provision + 轮询(Design §3.1) ───────────────────────────────────────
  const runProvision = useCallback(async () => {
    const name = effectiveName;
    const avatarId = avatar.id;
    cancelledRef.current = false;
    setErrorMsg(null);
    setPhase('awakening');
    // 立即持久化 name/avatar:即便中途被杀进程,重进也保留用户输入(R2.6/R2.6a)。
    setBirth({ petName: name, avatarId });

    const deadline = Date.now() + HARD_TIMEOUT_MS;
    try {
      const result = await provisionCloudAgent({ name, llmProvider: 'default' });
      if (cancelledRef.current) return;

      let info: OpenClawInstanceInfo = result;
      // 轮询直到可用或硬超时;期间动画持续(R2.6b)。
      while (!isAwake(info) && Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        if (cancelledRef.current) return;
        try {
          info = await getInstanceById(result.id);
          if (cancelledRef.current) return;
          if (info.status === 'error') {
            // 提前失败:立即提示,不必等满 90s(R2.6a)。
            setErrorMsg('你的灵魂在苏醒时遇到了点波折。');
            setPhase('failed');
            return;
          }
        } catch {
          /* 轮询瞬时失败:保持动画继续轮询,直至可用或硬超时(R2.6b)。 */
        }
      }

      if (cancelledRef.current) return;
      if (isAwake(info)) {
        finishSuccess(info, name, avatarId);
      } else {
        // 90s 硬超时仍无结果(R2.6)。
        setErrorMsg('苏醒超时了,云端还没准备好。');
        setPhase('failed');
      }
    } catch (e: any) {
      if (cancelledRef.current) return;
      // provision 调用本身提前失败(R2.6a)。
      setErrorMsg(e?.message || '云端孵化失败,请稍后再试。');
      setPhase('failed');
    }
  }, [effectiveName, avatar.id, setBirth, finishSuccess]);

  // ── 渲染:苏醒动画(全屏覆盖,无进度条 R2.5,无跳过以维持沉浸 R2.6b) ─────────
  if (phase === 'awakening') {
    const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.18] });
    const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
    const copy = AWAKENING_COPY[copyIndex].replace('{name}', effectiveName);
    return (
      <SafeAreaView style={styles.awakeningFill} edges={['top', 'bottom']}>
        <View style={styles.awakeningBody}>
          <View style={styles.glowWrap}>
            <Animated.View
              style={[
                styles.glow,
                { opacity: glowOpacity, transform: [{ scale: glowScale }] },
              ]}
            />
            <PetRenderer clan={avatar.clan} emotion={avatar.emotion} width={168} height={168} />
          </View>
          <Text style={styles.awakeningTitle}>灵魂正在苏醒</Text>
          <Text style={styles.awakeningCopy}>{copy}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── 渲染:失败重试(保留 name/avatar,R2.6/R2.6a) ───────────────────────────
  if (phase === 'failed') {
    return (
      <StepScaffold
        title="它还没醒来"
        subtitle={errorMsg || '云端孵化遇到了一点问题。'}
        onSkip={onSkip}
      >
        <View style={styles.failCard}>
          <PetRenderer clan={avatar.clan} emotion="sleepy" width={120} height={120} />
          <Text style={styles.failName}>
            {effectiveName} · {avatar.name}
          </Text>
          <Text style={styles.failHint}>名称与形象已保留,可直接重试。</Text>
        </View>
        <Pressable
          style={styles.primaryBtn}
          onPress={runProvision}
          accessibilityRole="button"
          accessibilityLabel="重试苏醒"
        >
          <Text style={styles.primaryBtnText}>再次唤醒它</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => setPhase('setup')}
          accessibilityRole="button"
          accessibilityLabel="返回修改名称与形象"
        >
          <Text style={styles.secondaryBtnText}>改个名字 / 形象</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // ── 渲染:起名 + 选皮肤(setup) ───────────────────────────────────────────
  return (
    <StepScaffold
      title="诞生你的 AI"
      subtitle="给它起个名字、选个形象,看着它在云端苏醒。"
      onSkip={onSkip}
    >
      {/* 形象预览(默认灵狐 clan A,R2.2) */}
      <View style={styles.avatarPreview}>
        <PetRenderer clan={avatar.clan} emotion={avatar.emotion} width={140} height={140} />
        <Text style={styles.avatarName}>{avatar.name}</Text>
      </View>

      {/* 名称输入(R2.1 / R2.8) */}
      <Text style={styles.label}>给它起个名字</Text>
      <TextInput
        testID="birth-name-input"
        style={styles.input}
        placeholder={DEFAULT_NAME}
        placeholderTextColor={colors.textMuted}
        value={petName}
        onChangeText={setPetName}
        maxLength={NAME_MAX_LEN}
        returnKeyType="done"
        accessibilityLabel="灵魂名称输入框"
      />

      {/* 三按钮:换一个 / 拍一张 / 去市场选(R2.3) */}
      <View style={styles.avatarActions}>
        <Pressable
          style={styles.chip}
          onPress={handleSwitchBuiltin}
          accessibilityRole="button"
          accessibilityLabel="换一个内置形象"
        >
          <Text style={styles.chipText}>换一个</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={handleCameraGenerate}
          accessibilityRole="button"
          accessibilityLabel="拍一张生成形象"
        >
          <Text style={styles.chipText}>拍一张</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={handleGoMarket}
          accessibilityRole="button"
          accessibilityLabel="去皮肤市场选择"
        >
          <Text style={styles.chipText}>去市场选</Text>
        </Pressable>
      </View>

      {/* 确认 → provision(R2.4) */}
      <Pressable
        style={styles.primaryBtn}
        onPress={runProvision}
        accessibilityRole="button"
        accessibilityLabel="确认并唤醒"
      >
        <Text style={styles.primaryBtnText}>赋予它灵魂</Text>
      </Pressable>
    </StepScaffold>
  );
}

export default BirthStep;

const styles = themedStyles(() => StyleSheet.create({
  // setup
  avatarPreview: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  label: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  input: {
    width: '100%',
    backgroundColor: colors.input,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  avatarActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 28,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  // awakening
  awakeningFill: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  awakeningBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  glowWrap: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.accent,
  },
  awakeningTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  awakeningCopy: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  // failed
  failCard: {
    alignItems: 'center',
    marginBottom: 24,
  },
  failName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  failHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 6,
  },
}));
