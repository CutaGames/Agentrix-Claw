/**
 * FirstWordsStep — Soul_Birth ② 「灵魂第一句话」(诞生时刻兜底 + 天气锦上添花 + TTS)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.4(Requirements 3.1–3.8,Design §3.2 / §3.3 / §3.4)
 *
 * 行为:
 *   - 进入即用本地时间生成 Birth_Moment_Line 主句(必达,R3.1/R3.2),并以文字气泡常显
 *     ——气泡本身即 TTS 失败时的降级展示(R3.4)。
 *   - 通过 ttsSpeaker 以中文音色播报主句(R3.3);合成/播放失败 → 文字气泡继续主线(R3.4)。
 *   - Weather_Garnish(可选追加,**绝不阻塞/延迟主句**,C4):主句已入队后才发起定位+天气
 *     (各 5s 超时),成功则追加播报并显示气泡;任一失败静默跳过(R3.5/R3.6)。
 *   - 第一句话(含可选天气句)**播报结束** 或 用户在本段**跳过这句** → onComplete()
 *     推进到 connect_desktop(R3.7)。右上角「跳过」为全局跳过整条主线(R1.5)。
 *   - 兜底:即使音频从不播放(静音设备/原生不可用),也有总超时强制推进(主线必达,
 *     Correctness Property 1)。
 *
 * 复用:`buildBirthMomentLine`(纯本地)、`getOnboardingTtsSpeaker`(/voice/tts + 缓存/限频/降级,
 *   播放复用 AudioQueuePlayer)、`getWeatherGarnish`(expo-location + Open-Meteo,withTimeout 封顶)。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { StepScaffold } from '../StepScaffold';
import type { SoulBirthStepProps } from '../types';
import { colors } from '../../../theme/colors';
import { useSoulBirthStore } from '../../../stores/soulBirthStore';
import { buildBirthMomentLine } from '../../../services/onboarding/birthMomentLine';
import { getOnboardingTtsSpeaker } from '../../../services/onboarding/ttsSpeaker';
import { getWeatherGarnish } from '../../../services/onboarding/weatherGarnish';
import { themedStyles } from '../../../theme/useTheme';

/** 总超时兜底:即便音频从不触发 drain(静音/原生不可用),也保证推进(Property 1)。 */
const HARD_ADVANCE_TIMEOUT_MS = 30_000;

export function FirstWordsStep({ onComplete, onSkip }: SoulBirthStepProps) {
  const petName = useSoulBirthStore((s) => s.petName);

  // 主句:进入即生成(纯本地、必达)。useRef 锁定一次生成的时刻,避免重渲染漂移。
  const mainLineRef = useRef<string>('');
  if (!mainLineRef.current) {
    mainLineRef.current = buildBirthMomentLine(new Date(), petName ?? undefined);
  }
  const mainLine = mainLineRef.current;

  const [weatherLine, setWeatherLine] = useState<string | null>(null);
  // 主句气泡始终展示 → 同时充当 TTS 失败时的降级展示(R3.4)。无需单独 degraded 状态。

  // 防重复推进:auto-advance / 手动「跳过这句」/ 兜底超时 多路触发只生效一次。
  const advancedRef = useRef(false);
  const cancelledRef = useRef(false);

  const advance = useCallback(() => {
    if (advancedRef.current || cancelledRef.current) return;
    advancedRef.current = true;
    onComplete();
  }, [onComplete]);

  // ── 呼吸光晕(说话指示) ───────────────────────────────────────────────────
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // ── 播报编排(主句先播,天气句追加,播完推进) ─────────────────────────────
  useEffect(() => {
    cancelledRef.current = false;
    advancedRef.current = false;
    const speaker = getOnboardingTtsSpeaker();

    // 兜底:无论音频是否真的播放,总超时后强制推进,杜绝冷场卡死(Property 1)。
    const hardTimer = setTimeout(advance, HARD_ADVANCE_TIMEOUT_MS);

    (async () => {
      // 1) 主句:立即合成并入队播报;失败/超时由 ttsSpeaker 内部降级(气泡已常显,R3.4)。
      //    onDegrade 无需额外动作——主句文字本就在屏上展示。
      await speaker.speak(mainLine, { lang: 'zh', onDegrade: () => {} });
      if (cancelledRef.current) return;

      // 2) Weather_Garnish:主句已入队后才发起,定位+天气各 5s 超时即返回 null(R3.5/R3.6/C4)。
      //    主句播放与天气获取在此天然并行——本段绝不阻塞/延迟主句播放。
      const wxLine = await getWeatherGarnish();
      if (cancelledRef.current) return;
      if (wxLine) {
        setWeatherLine(wxLine);
        await speaker.speak(wxLine, { lang: 'zh', onDegrade: () => {} });
        if (cancelledRef.current) return;
      }

      // 3) 等整段(主句 + 可选天气句)播完 → 推进(R3.7)。
      //    whenIdle 在队列已空时立即 resolve;否则在下次 drain 时 resolve。
      await speaker.whenIdle();
      if (cancelledRef.current) return;
      advance();
    })();

    return () => {
      cancelledRef.current = true;
      clearTimeout(hardTimer);
      // 离场停止播放,释放 whenIdle 等待者(避免悬挂的 Promise)。
      try {
        speaker.stop();
      } catch {
        /* ignore */
      }
    };
    // mainLine 在首次渲染即锁定且稳定;仅挂载时编排一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 用户在本段主动「跳过这句」→ 直接推进到 connect_desktop(R3.7「被用户跳过」)。
  // 注意:这与右上角全局「跳过」(onSkip → 结束整条主线,R1.5)语义不同。
  const handleSkipLine = useCallback(() => {
    advance();
  }, [advance]);

  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] });

  return (
    <StepScaffold
      title="灵魂的第一句话"
      subtitle="它会在诞生这一刻对你说话——即使没开定位,也绝不冷场。"
      onSkip={onSkip}
    >
      {/* 说话指示(呼吸光晕) */}
      <View style={styles.haloWrap}>
        <Animated.View
          style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
        />
        <View style={styles.haloCore} />
      </View>

      {/* 主句气泡(常显;同时是 TTS 失败的降级展示,R3.4) */}
      <View
        testID="first-words-bubble"
        style={styles.bubble}
        accessibilityRole="text"
        accessibilityLabel={mainLine}
      >
        <Text style={styles.bubbleText}>{mainLine}</Text>
      </View>

      {/* 天气追加气泡(仅在成功获取时出现,R3.5) */}
      {weatherLine ? (
        <View style={[styles.bubble, styles.bubbleWeather]} accessibilityRole="text">
          <Text style={styles.bubbleText}>{weatherLine}</Text>
        </View>
      ) : null}

      {/* 跳过这句 → 推进到下一段(R3.7);与全局跳过区分 */}
      <Pressable
        style={styles.skipLineBtn}
        onPress={handleSkipLine}
        accessibilityRole="button"
        accessibilityLabel="跳过这句,继续"
      >
        <Text style={styles.skipLineText}>跳过这句 →</Text>
      </Pressable>
    </StepScaffold>
  );
}

export default FirstWordsStep;

const styles = themedStyles(() => StyleSheet.create({
  haloWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  halo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
  },
  haloCore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
  },
  bubble: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  bubbleWeather: {
    borderColor: colors.accentDark,
  },
  bubbleText: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
  skipLineBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  skipLineText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
}));
