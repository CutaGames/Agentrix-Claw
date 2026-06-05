/**
 * FirstTaskStep — Soul_Birth ③ 「它帮我办成第一件真事」(OAuth 授权日历/邮箱 + 播报 + AXP)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.5(Requirements 4.1–4.7,Design §4 / §5.3 / §5.5)
 *
 * 行为(Design §4):
 *   - 选择:连接日历(google-calendar)/ 连接邮箱(gmail)/ 暂不连接(跳过本步)。
 *   - 选 OAuth → 走 §5.3 安装流程:取授权 URL → WebBrowser 打开 provider 授权页 →
 *     provider 回跳后端 `oauth/callback`(后端校验 state 并落库)→ 端侧检测安装是否完成。
 *   - 成功 → GET `/readout` 读当天日程/未读(R4.3)→ ttsSpeaker.speak 念出(R4.3)→
 *     rewardFromReality(固定 idempotencyKey,一次性,R4.4)→ 钱包跳动可视化(失败不影响
 *     发放,R4.4 / 镜像 R5.3a)→ onComplete()(R4.7)。
 *   - 拒绝/跳过 → 跳过 readout 直接 onComplete()(R4.5)。
 *   - 授权失败 / 读取失败 → 可重试或可跳过提示,**不阻塞主线**(R4.6 / Correctness Property 1)。
 *   - Google 不可达(授权 URL 未配置/失败)→ 提供系统日历 / IMAP 邮箱兜底选项(R6.6,§5.1)。
 *
 * OAuth 成功检测(关键):后端 `oauth/callback` 返回 JSON(非重定向到 deep link),因此
 * `WebBrowser.openAuthSessionAsync` 不会以 deep link 形式自动回传 success——provider 回跳
 * 发生在浏览器内、后端同步落库。故端侧策略为:**浏览器会话结束后轮询 `/connectors/installed`**,
 * 该连接器出现在已安装列表即视为授权成功(取消/失败则不出现)。这与 stripeCheckout 的
 * openAuthSessionAsync 模式一致,但以服务端安装态为权威判定。
 *
 * 复用:`getOAuthAuthorizeUrl` / `readoutToday` / `listInstalledConnectors` / `installConnector`
 *   (connectorApi)、`rewardFromReality`(aeonApi)、`getOnboardingTtsSpeaker`(/voice/tts +
 *   缓存/限频/降级)、`WebBrowser.openAuthSessionAsync`(与社交登录/Stripe 同款)、authStore.user.id。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { StepScaffold } from '../StepScaffold';
import type { SoulBirthStepProps } from '../types';
import { colors } from '../../../theme/colors';
import { useAuthStore } from '../../../stores/authStore';
import { getOnboardingTtsSpeaker } from '../../../services/onboarding/ttsSpeaker';
import {
  getOAuthAuthorizeUrl,
  readoutToday,
  listInstalledConnectors,
  installConnector,
} from '../../../services/connectorApi';
import { rewardFromReality } from '../../../services/aeon/aeonApi';
import type { CalendarEmailReadout } from '../../../../shared/types/connector';

// ── Tuning constants(Design §4)───────────────────────────────────────────────
/** 一次性「办成事」AXP 奖励额度(与 connector-catalog google-calendar/gmail rewardAxp 对齐)。 */
const FIRST_TASK_AXP = 12;
/** OAuth 回调后轮询安装态的尝试次数与间隔(回跳→落库通常瞬时,留少量重试容错)。 */
const INSTALL_POLL_ATTEMPTS = 4;
const INSTALL_POLL_DELAY_MS = 1_200;
/** readout 读取超时:超时即转可重试/可跳过,杜绝读取阶段无限挂起(Property 1)。 */
const READOUT_TIMEOUT_MS = 15_000;
/** 「办成」结果展示后自动推进的时延(也提供「继续」按钮即时推进)。 */
const DONE_AUTO_ADVANCE_MS = 3_200;

/** 连接选项 → OAuth 连接器 + Google 不可达时的兜底连接器(R6.6)。 */
interface ConnectChoice {
  key: 'calendar' | 'email';
  label: string;
  oauthConnectorId: string;
  /** 兜底连接器(非 OAuth):none / api_key,Google 不可达时使用。 */
  fallbackConnectorId: string;
  fallbackLabel: string;
}

const CHOICES: ConnectChoice[] = [
  {
    key: 'calendar',
    label: '连接日历',
    oauthConnectorId: 'google-calendar',
    fallbackConnectorId: 'system-calendar',
    fallbackLabel: '改用系统日历(无需 Google)',
  },
  {
    key: 'email',
    label: '连接邮箱',
    oauthConnectorId: 'gmail',
    fallbackConnectorId: 'imap-email',
    fallbackLabel: '改用 IMAP 邮箱(无需 Google)',
  },
];

type Phase = 'choose' | 'authorizing' | 'reading' | 'done' | 'error';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 给 Promise 套总超时:超时 reject(由调用方统一转可跳过),避免读取阶段无限挂起。 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** readout → TTS 念白(R4.3 例:"你今天有 N 个安排" / "有 N 封未读")。 */
function readoutToSpeech(r: CalendarEmailReadout): string {
  if (r.kind === 'calendar') {
    return r.count > 0 ? `你今天有 ${r.count} 个安排。` : '你今天还没有安排,可以轻松一点。';
  }
  return r.count > 0 ? `你有 ${r.count} 封未读邮件。` : '你的收件箱很干净,没有未读邮件。';
}

/** readout → 屏上标题(气泡展示;同时是 TTS 失败时的降级展示,R3.4 同款思路)。 */
function readoutHeadline(r: CalendarEmailReadout): string {
  if (r.kind === 'calendar') {
    return r.count > 0 ? `今天有 ${r.count} 个安排` : '今天暂无安排';
  }
  return r.count > 0 ? `有 ${r.count} 封未读邮件` : '收件箱很干净';
}

export function FirstTaskStep({ onComplete, onSkip }: SoulBirthStepProps) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [activeChoice, setActiveChoice] = useState<ConnectChoice | null>(null);
  const [readout, setReadout] = useState<CalendarEmailReadout | null>(null);
  const [axpAwarded, setAxpAwarded] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** 授权 URL 拿不到(Google 未配置/不可达)→ 展示兜底连接器选项(R6.6)。 */
  const [offerFallback, setOfferFallback] = useState(false);

  // 防重入 / 卸载守卫。
  const advancedRef = useRef(false);
  const rewardedRef = useRef(false);
  const cancelledRef = useRef(false);
  /** 已成功安装/授权的连接器 id;readout 失败时据此「只重试读取」而非重走授权。 */
  const installedConnectorIdRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      // 离场停止任何在播音频,释放资源。
      try {
        getOnboardingTtsSpeaker().stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /** 推进到下一步(R4.7);多路触发(自动/手动/兜底)只生效一次(Property 1)。 */
  const advance = useCallback(() => {
    if (advancedRef.current || cancelledRef.current) return;
    advancedRef.current = true;
    onComplete();
  }, [onComplete]);

  // ── 钱包跳动可视化(R4.4:可视化失败不影响奖励发放)──────────────────────────
  const bounce = useRef(new Animated.Value(0)).current;
  const triggerWalletBounce = useCallback(() => {
    // 纯本地动画;**整段包裹**——任何动画异常都不得回滚已发放的 AXP(R4.4 / Property 8)。
    try {
      bounce.setValue(0);
      Animated.sequence([
        Animated.spring(bounce, {
          toValue: 1,
          friction: 4,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0.92,
          duration: 140,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } catch {
      /* 可视化失败静默吞掉:奖励已在调用本函数前发放完成,不受影响。 */
    }
  }, [bounce]);

  // ── 发放一次性 AXP(R4.4:固定 idempotencyKey,后端去重保证一次性)──────────────
  const grantReward = useCallback(async () => {
    if (rewardedRef.current) return; // 本会话内只尝试一次(后端亦按 refId 幂等)。
    rewardedRef.current = true;
    const userId = useAuthStore.getState().user?.id ?? 'me';
    // 固定幂等键(R4.4 一次性 / Correctness Property 8);后端按 refId 去重。
    const idempotencyKey = `soul-birth-first-task-${userId}`;
    try {
      await rewardFromReality({
        amount: FIRST_TASK_AXP,
        reason: '它帮你办成了第一件事',
        refId: idempotencyKey,
      });
      if (cancelledRef.current) return;
      setAxpAwarded(FIRST_TASK_AXP);
    } catch {
      // 奖励桥接失败不阻塞主线(R4.6 / Property 1):仍继续推进,不展示 AXP 跳动。
      if (!cancelledRef.current) setAxpAwarded(null);
    }
  }, []);

  // ── 成功授权后:读取 → 播报 → 发奖 → 跳动 → 推进 ───────────────────────────────
  const runReadoutAndReward = useCallback(
    async (connectorId: string) => {
      installedConnectorIdRef.current = connectorId; // 已安装:后续 readout 失败可只重试读取
      setPhase('reading');
      setErrorMsg(null);

      // 1) 读取当天日程/未读(R4.3)。带超时;失败 → 可重试/可跳过(R4.6),不阻塞。
      let result: CalendarEmailReadout;
      try {
        const tzOffsetMinutes = -new Date().getTimezoneOffset(); // UTC 以东分钟数
        result = await withTimeout(
          readoutToday(connectorId, { tzOffsetMinutes }),
          READOUT_TIMEOUT_MS,
        );
      } catch {
        if (cancelledRef.current) return;
        setErrorMsg('读取你的日程/未读时遇到了点问题。');
        setPhase('error');
        return;
      }
      if (cancelledRef.current) return;
      setReadout(result);

      // 2) TTS 念出(R4.3)。ttsSpeaker 内部缓存/限频/失败降级,永不抛错、永不卡主线。
      try {
        void getOnboardingTtsSpeaker().speak(readoutToSpeech(result), { lang: 'zh' });
      } catch {
        /* 念白失败不影响主线(R3.4 同款降级);气泡已展示文本。 */
      }

      // 3) 发放一次性 AXP(R4.4)——先 await 发放,确保「发放在前、可视化在后」。
      await grantReward();
      if (cancelledRef.current) return;

      // 4) 钱包跳动可视化(失败不影响已发放金额,R4.4 / Property 8)。
      triggerWalletBounce();

      // 5) 展示结果并推进(R4.7);自动推进 + 「继续」按钮双保险。
      setPhase('done');
    },
    [grantReward, triggerWalletBounce],
  );

  // ── OAuth 安装流程(§5.3)──────────────────────────────────────────────────────
  /**
   * 走 OAuth:取授权 URL → 打开 provider 授权页 → 回跳后端落库 → 端侧轮询安装态判定成功。
   * 返回是否安装成功;授权 URL 取不到(Google 未配置/不可达)抛错 → 调用方降级兜底(R6.6)。
   */
  const runOAuthInstall = useCallback(async (connectorId: string): Promise<boolean> => {
    // 取授权 URL(后端未配置 provider 凭据时抛描述性错误 → 触发兜底)。
    const { url } = await getOAuthAuthorizeUrl(connectorId);

    // 打开 provider 授权页。returnUrl 为本应用 deep link;但后端 callback 返回 JSON、
    // 不重定向到 returnUrl,故浏览器会停在结果页由用户关闭——成功与否以服务端安装态为准。
    const returnUrl = Linking.createURL('connectors/oauth');
    try {
      await WebBrowser.openAuthSessionAsync(url, returnUrl, { showInRecents: true });
    } catch {
      /* 打开/关闭浏览器的异常不致命:仍以轮询安装态判定结果。 */
    }
    if (cancelledRef.current) return false;

    // 浏览器会话结束后轮询「我已安装」:出现该连接器即授权成功(取消/失败则不出现)。
    for (let i = 0; i < INSTALL_POLL_ATTEMPTS; i++) {
      try {
        const installed = await listInstalledConnectors();
        if (cancelledRef.current) return false;
        if (installed.some((c) => c.id === connectorId)) return true;
      } catch {
        /* 轮询瞬时失败:重试 */
      }
      if (i < INSTALL_POLL_ATTEMPTS - 1) await sleep(INSTALL_POLL_DELAY_MS);
    }
    return false;
  }, []);

  // ── 用户选择「连接日历 / 连接邮箱」──────────────────────────────────────────────
  const handleConnect = useCallback(
    async (choice: ConnectChoice) => {
      setActiveChoice(choice);
      setOfferFallback(false);
      setErrorMsg(null);
      setPhase('authorizing');
      try {
        const ok = await runOAuthInstall(choice.oauthConnectorId);
        if (cancelledRef.current) return;
        if (ok) {
          await runReadoutAndReward(choice.oauthConnectorId);
        } else {
          // 用户取消授权或回调未落库 → 可重试 / 可跳过(R4.6)。
          setErrorMsg('授权没有完成,你可以重试,或先跳过。');
          setPhase('error');
        }
      } catch {
        if (cancelledRef.current) return;
        // 取授权 URL 失败(Google 未配置/不可达)→ 提供兜底连接器(R6.6)。
        setErrorMsg('暂时连不上 Google,你可以改用无需 Google 的兜底方式,或先跳过。');
        setOfferFallback(true);
        setPhase('error');
      }
    },
    [runOAuthInstall, runReadoutAndReward],
  );

  // ── 兜底连接器(非 OAuth:system-calendar=none / imap-email=api_key,R6.6)─────────
  const handleFallback = useCallback(
    async (choice: ConnectChoice) => {
      setActiveChoice(choice);
      setOfferFallback(false);
      setErrorMsg(null);
      setPhase('authorizing');
      try {
        // 兜底连接器直接安装(none 立即可用;api_key 若需凭据则后端报错 → 转可跳过)。
        await installConnector({ connectorId: choice.fallbackConnectorId });
        if (cancelledRef.current) return;
        await runReadoutAndReward(choice.fallbackConnectorId);
      } catch {
        if (cancelledRef.current) return;
        // IMAP 等需在「连接器中心」补全凭据;此处保持轻量,转可跳过不阻塞主线(R4.6)。
        setErrorMsg('兜底连接需要更多信息,可在「连接器中心」完成,或先跳过这一步。');
        setOfferFallback(false);
        setPhase('error');
      }
    },
    [runReadoutAndReward],
  );

  // ── done 阶段自动推进(R4.7)+ 「继续」按钮 ──────────────────────────────────────
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(advance, DONE_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [phase, advance]);

  /**
   * error 阶段重试(R4.6):若连接器已安装(仅 readout/发奖环节失败)→ 只重试读取;
   * 否则(授权未完成)→ 重走授权安装流程。
   */
  const handleRetry = useCallback(() => {
    const installedId = installedConnectorIdRef.current;
    if (installedId) {
      void runReadoutAndReward(installedId);
    } else if (activeChoice) {
      void handleConnect(activeChoice);
    }
  }, [activeChoice, handleConnect, runReadoutAndReward]);

  // ── 渲染 ──────────────────────────────────────────────────────────────────────

  // authorizing / reading:加载态(顶部全局「跳过」仍可结束整条主线,R1.5)。
  if (phase === 'authorizing' || phase === 'reading') {
    const hint =
      phase === 'authorizing'
        ? '正在等待授权完成…完成后回到这里即可。'
        : '它正在读取你的日程/未读…';
    return (
      <StepScaffold title="让它帮你办成第一件事" subtitle={hint} onSkip={onSkip}>
        <ActivityIndicator size="large" color={colors.accent} />
      </StepScaffold>
    );
  }

  // done:展示读取结果 + AXP 跳动 + 继续。
  if (phase === 'done') {
    const bounceScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.18] });
    const bounceOpacity = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    return (
      <StepScaffold
        title="它帮你办成了第一件事"
        subtitle={readout ? '这是它刚刚为你读到的:' : undefined}
        onSkip={onSkip}
      >
        {readout ? (
          <View style={styles.resultBubble} accessibilityRole="text">
            <Text style={styles.resultHeadline}>{readoutHeadline(readout)}</Text>
            {readout.items && readout.items.length ? (
              <Text style={styles.resultItems} numberOfLines={3}>
                {readout.items.slice(0, 3).join(' · ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {axpAwarded != null ? (
          <Animated.View
            style={[
              styles.axpChip,
              { opacity: bounceOpacity, transform: [{ scale: bounceScale }] },
            ]}
            accessibilityRole="text"
            accessibilityLabel={`获得 ${axpAwarded} AXP`}
          >
            <Text style={styles.axpChipText}>+{axpAwarded} AXP</Text>
          </Animated.View>
        ) : null}

        <Pressable
          style={styles.primaryBtn}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel="继续"
        >
          <Text style={styles.primaryBtnText}>继续</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // error:可重试 / 可跳过(+ 可选兜底)——绝不阻塞主线(R4.6)。
  if (phase === 'error') {
    return (
      <StepScaffold
        title="差一点就成了"
        subtitle={errorMsg || '刚才没能办成,你可以重试或先跳过。'}
        onSkip={onSkip}
      >
        {activeChoice ? (
          <Pressable
            style={styles.primaryBtn}
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="重试"
          >
            <Text style={styles.primaryBtnText}>重试</Text>
          </Pressable>
        ) : null}

        {offerFallback && activeChoice ? (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => handleFallback(activeChoice)}
            accessibilityRole="button"
            accessibilityLabel={activeChoice.fallbackLabel}
          >
            <Text style={styles.secondaryBtnText}>{activeChoice.fallbackLabel}</Text>
          </Pressable>
        ) : null}

        {/* 跳过本步(跳过 readout 直接完成,R4.5);区别于顶部结束整条主线的「跳过」。 */}
        <Pressable
          style={styles.skipStepBtn}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel="跳过这一步"
        >
          <Text style={styles.skipStepText}>先跳过这一步 →</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // choose:连接日历 / 连接邮箱 / 暂不连接。
  return (
    <StepScaffold
      title="让它帮你办成第一件事"
      subtitle="连上日历或邮箱,它会念出你今天的安排与未读。"
      onSkip={onSkip}
    >
      {CHOICES.map((choice) => (
        <Pressable
          key={choice.key}
          style={styles.choiceBtn}
          onPress={() => handleConnect(choice)}
          accessibilityRole="button"
          accessibilityLabel={choice.label}
        >
          <Text style={styles.choiceText}>{choice.label}</Text>
        </Pressable>
      ))}

      {/* 拒绝/跳过授权 → 跳过 readout 直接完成本步(R4.5)。 */}
      <Pressable
        style={styles.skipStepBtn}
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel="暂不连接,跳过这一步"
      >
        <Text style={styles.skipStepText}>暂不连接 →</Text>
      </Pressable>
    </StepScaffold>
  );
}

export default FirstTaskStep;

const styles = StyleSheet.create({
  choiceBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  choiceText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  skipStepBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  skipStepText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  resultBubble: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 18,
    alignItems: 'center',
  },
  resultHeadline: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  resultItems: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  axpChip: {
    backgroundColor: colors.accentDark,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 22,
    marginBottom: 22,
  },
  axpChipText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
