/**
 * SettleAeonStep — Soul_Birth ⑤ 「安家永曜城」(圈地 + 附近的人 + 签到 +15 AXP)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.6(Requirements 5.1–5.6,Design §2 settle_aeon 段)
 *
 * 行为(Design §2 settle_aeon / R5.1–5.6):
 *   - 引导首次圈地:取当前定位 → `claimPlot`(R5.1)。
 *   - 圈地后展示「附近的人」作为社交锚点:`findNearbyPeople`(R5.2,best-effort 失败不阻塞)。
 *   - 签到:`checkInPlot` 由 **后端**发放 15 AXP(CHECKIN_REWARD_AXP,+连续加成),
 *     端侧仅 surface `AeonCheckinResult.rewardAxp` 做钱包跳动可视化(R5.3)。
 *       · R5.3b 仅显式签到才发:**圈地不发**,只有用户点「签到」才触发后端发放;本组件
 *         任何路径都不再二次发放(后端 checkIn 已 creditWallet,见 plot.service.ts)。
 *       · R5.3a 可视化失败不影响发放:跳动动画整段 try/catch,奖励已在后端落定,不回滚。
 *   - R5.4 无定位允许跳过不报错:定位失败 → 友好提示 + 「暂不安家」(onComplete),不报错阻塞。
 *   - R5.5 完成圈地或跳过 → onComplete()(标记 settle_aeon 完成)。
 *   - R5.6 settle_aeon 完成 → 主线结束进常规主界面(host 在全部步骤完成时自动终止)。
 *
 * 复用(不重写 Aeon 能力):`claimPlot` / `findNearbyPeople` / `checkInPlot` / `listMyPlots`
 *   (aeonApi)、`getCurrentLocation` + `withTimeout`(weatherGarnish,GPS+权限+缓存兜底)、
 *   `petName`(soulBirthStore,作圈地展示名)。覆盖层为导航器 sibling,统一走轻量内联 UI,
 *   不内嵌 AeonMapScreen(避免 useNavigation/host 复杂度)。
 *
 * 不变式:
 *   - Property 1 主线必达:每个阶段都提供推进/跳过路径(onComplete / 顶部 onSkip);
 *     定位/圈地/附近/签到任一失败都不卡死(Error Handling 表)。
 *   - Property 8 AXP 显式签到唯一来源:仅 `handleCheckIn` 触发后端发放;可视化失败不回滚。
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
import { StepScaffold } from '../StepScaffold';
import type { SoulBirthStepProps } from '../types';
import { colors } from '../../../theme/colors';
import { useSoulBirthStore } from '../../../stores/soulBirthStore';
import {
  claimPlot,
  findNearbyPeople,
  checkInPlot,
  listMyPlots,
} from '../../../services/aeon/aeonApi';
import {
  getCurrentLocation,
  withTimeout,
  type GeoPoint,
} from '../../../services/onboarding/weatherGarnish';
import { AEON_GEO } from '../../../../shared/types/aeon-world';
import type {
  AeonPlotDto,
  AeonNearbyPerson,
  AeonCheckinResult,
} from '../../../../shared/types/aeon-world';
import { themedStyles } from '../../../theme/useTheme';

// ── Tuning constants(Design §2 settle_aeon / Error Handling)──────────────────
/** 签到奖励额度(展示用;真实发放在后端 checkIn,与 CHECKIN_REWARD_AXP 同源,R5.3)。 */
const CHECKIN_AXP = AEON_GEO.CHECKIN_REWARD_AXP;
/** 定位超时:超时即视为「无定位」,允许跳过不报错(R5.4 / Property 1)。 */
const LOCATION_TIMEOUT_MS = 10_000;
/** 「附近的人」搜索半径(复用 Aeon 默认半径)。 */
const NEARBY_RADIUS_M = AEON_GEO.NEARBY_DEFAULT_RADIUS_M;
/** 签到完成后自动推进时延(也提供「进入永曜城」按钮即时推进,R5.6)。 */
const DONE_AUTO_ADVANCE_MS = 3_400;
/** 附近的人列表最多展示条数(社交锚点,点到即止)。 */
const NEARBY_MAX_SHOWN = 6;

type Phase = 'intro' | 'working' | 'claimed' | 'done' | 'error' | 'no_location';

/** 距离格式化(米 / 公里)。 */
function formatDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return '';
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} 公里`;
  return `${Math.max(0, Math.round(distanceM))} 米`;
}

/** 取当前定位(封顶超时;失败/超时 → null,绝不抛错,R5.4)。 */
async function resolveLocation(): Promise<GeoPoint | null> {
  try {
    return await withTimeout(getCurrentLocation(), LOCATION_TIMEOUT_MS);
  } catch {
    return null;
  }
}

export function SettleAeonStep({ onComplete, onSkip }: SoulBirthStepProps) {
  const petName = useSoulBirthStore((s) => s.petName);

  const [phase, setPhase] = useState<Phase>('intro');
  const [busyHint, setBusyHint] = useState('正在准备…');
  const [plot, setPlot] = useState<AeonPlotDto | null>(null);
  const [nearby, setNearby] = useState<AeonNearbyPerson[]>([]);
  const [axpAwarded, setAxpAwarded] = useState<number | null>(null);
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 防重入 / 卸载守卫。
  const advancedRef = useRef(false);
  const cancelledRef = useRef(false);
  /** 圈地时使用的坐标,签到优先复用(再尝试取一次更新值)。 */
  const coordsRef = useRef<GeoPoint | null>(null);
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  /** 推进/完成本步(R5.5);多路触发(自动/手动/跳过)只生效一次(Property 1)。 */
  const advance = useCallback(() => {
    if (advancedRef.current || cancelledRef.current) return;
    advancedRef.current = true;
    onComplete();
  }, [onComplete]);

  // ── 钱包跳动可视化(R5.3a:可视化失败不影响已发放金额)──────────────────────────
  const bounce = useRef(new Animated.Value(0)).current;
  const triggerWalletBounce = useCallback(() => {
    // 纯本地动画;**整段包裹**——奖励已在后端 checkIn 落定,任何动画异常都不得回滚(R5.3a / Property 8)。
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
      /* 可视化失败静默吞掉:奖励已发放,不受影响。 */
    }
  }, [bounce]);

  // ── 附近的人(R5.2):best-effort,失败不影响主线 ─────────────────────────────────
  const loadNearby = useCallback(async (loc: GeoPoint, plotId: string) => {
    try {
      const people = await findNearbyPeople({
        lat: loc.lat,
        lng: loc.lng,
        radiusM: NEARBY_RADIUS_M,
        plotId,
      });
      if (!cancelledRef.current) setNearby(people);
    } catch {
      /* 附近的人加载失败:仅缺社交锚点,不阻塞圈地/签到(Property 1)。 */
    }
  }, []);

  // ── 首次圈地(R5.1)────────────────────────────────────────────────────────────
  const handleClaim = useCallback(async () => {
    setErrorMsg(null);
    setBusyHint('正在定位你现在的位置…');
    setPhase('working');

    const loc = await resolveLocation();
    if (cancelledRef.current) return;
    if (!loc) {
      // R5.4:无定位 → 允许跳过,不报错阻塞。
      setPhase('no_location');
      return;
    }
    coordsRef.current = loc;

    setBusyHint('正在为你圈下第一块地…');
    let claimed: AeonPlotDto | null = null;
    try {
      claimed = await claimPlot({
        lat: loc.lat,
        lng: loc.lng,
        displayName: petName ?? undefined,
      });
    } catch {
      // 该网格可能已圈过地 → 取既有地块继续,避免卡住(Property 1)。
      try {
        const mine = await listMyPlots();
        if (cancelledRef.current) return;
        claimed = mine[0] ?? null;
      } catch {
        /* ignore,转 error 处理 */
      }
    }
    if (cancelledRef.current) return;

    if (!claimed) {
      setErrorMsg('圈地没成功,你可以重试,或先跳过这一步。');
      setPhase('error');
      return;
    }
    setPlot(claimed);
    setPhase('claimed');
    // 圈地完成即展示附近的人(R5.2);不 await,不阻塞 UI。
    void loadNearby(loc, claimed.id);
  }, [petName, loadNearby]);

  // ── 签到(R5.3:后端发 15 AXP,端侧仅可视化)────────────────────────────────────
  const handleCheckIn = useCallback(async () => {
    const currentPlot = plot;
    if (!currentPlot) return;
    setErrorMsg(null);
    setBusyHint('正在签到…');
    setPhase('working');

    // 重新取一次坐标更稳;失败回退到圈地坐标。
    let loc = await resolveLocation();
    if (cancelledRef.current) return;
    if (!loc) loc = coordsRef.current;
    if (!loc) {
      setErrorMsg('签到需要定位,稍后再试,或先完成安家。');
      setPhase('error');
      return;
    }

    let result: AeonCheckinResult;
    try {
      // R5.3b 显式签到才发:仅此处触发后端发放;后端 checkIn 已 creditWallet,端侧不二次发放。
      result = await checkInPlot(currentPlot.id, loc.lat, loc.lng);
    } catch {
      if (cancelledRef.current) return;
      // 签到失败(可能离地块太远 / 网络)→ 可重试或先完成,不阻塞主线(Property 1)。
      setErrorMsg('签到没成功(可能离这块地太远),可以重试,或先完成安家。');
      setPhase('error');
      return;
    }
    if (cancelledRef.current) return;

    // 后端已发放 AXP(R5.3);端侧仅 surface 金额做钱包跳动,绝不二次发放(Property 8)。
    setAxpAwarded(result.rewardAxp);
    setCheckinMsg(result.message || null);
    // 可视化跳动(失败不影响已发放金额,R5.3a)。
    triggerWalletBounce();
    setPhase('done');
  }, [plot, triggerWalletBounce]);

  // ── done 阶段自动推进(R5.6)+ 「进入永曜城」按钮 ─────────────────────────────────
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(advance, DONE_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [phase, advance]);

  // ── 渲染 ──────────────────────────────────────────────────────────────────────

  // working:定位 / 圈地 / 签到 加载态(顶部「跳过」仍可结束整条主线,R1.5)。
  if (phase === 'working') {
    return (
      <StepScaffold title="安家永曜城" subtitle={busyHint} onSkip={onSkip}>
        <ActivityIndicator size="large" color={colors.accent} />
      </StepScaffold>
    );
  }

  // no_location:无定位 → 允许跳过,不报错阻塞(R5.4)。语气友好,非错误。
  if (phase === 'no_location') {
    return (
      <StepScaffold
        title="先记着这件事"
        subtitle="现在拿不到你的位置,安家可以稍后在永曜城里随时完成。"
        onSkip={onSkip}
      >
        <Pressable
          style={styles.secondaryBtn}
          onPress={handleClaim}
          accessibilityRole="button"
          accessibilityLabel="再试一次定位"
        >
          <Text style={styles.secondaryBtnText}>再试一次</Text>
        </Pressable>
        <Pressable
          style={styles.skipStepBtn}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel="暂不安家,完成引导"
        >
          <Text style={styles.skipStepText}>暂不安家 →</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // error:可重试 / 可跳过——绝不阻塞主线(Property 1)。
  if (phase === 'error') {
    // 已圈到地 → 重试回签到;否则重试回圈地。
    const onRetry = plot ? handleCheckIn : handleClaim;
    return (
      <StepScaffold
        title="差一点就成了"
        subtitle={errorMsg || '刚才没能完成,你可以重试或先跳过。'}
        onSkip={onSkip}
      >
        <Pressable
          style={styles.primaryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="重试"
        >
          <Text style={styles.primaryBtnText}>重试</Text>
        </Pressable>
        <Pressable
          style={styles.skipStepBtn}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel={plot ? '完成安家' : '先跳过这一步'}
        >
          <Text style={styles.skipStepText}>{plot ? '完成安家 →' : '先跳过这一步 →'}</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // claimed:圈地成功 → 展示附近的人(R5.2)+ 签到入口(R5.3)+ 直接完成(仅圈地不发 AXP,R5.3b)。
  if (phase === 'claimed') {
    return (
      <StepScaffold
        title="你在永曜城安家了"
        subtitle={
          plot?.displayName
            ? `「${plot.displayName}」已经是你的地盘,看看附近有谁。`
            : '这块地已经是你的地盘,看看附近有谁。'
        }
        onSkip={onSkip}
      >
        <View style={styles.nearbyCard} accessibilityRole="text">
          <Text style={styles.nearbyHeadline}>
            {nearby.length > 0 ? `附近有 ${nearby.length} 位居民` : '你是这一带第一个安家的居民'}
          </Text>
          {nearby.slice(0, NEARBY_MAX_SHOWN).map((p) => (
            <View key={p.userId} style={styles.nearbyRow}>
              <View style={styles.nearbyDot} />
              <Text style={styles.nearbyName} numberOfLines={1}>
                {p.displayName || '匿名居民'}
              </Text>
              <Text style={styles.nearbyDist}>{formatDistance(p.distanceM)}</Text>
            </View>
          ))}
          {nearby.length === 0 ? (
            <Text style={styles.nearbyEmpty}>签到一下,让附近的人发现你。</Text>
          ) : null}
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={handleCheckIn}
          accessibilityRole="button"
          accessibilityLabel={`签到领 ${CHECKIN_AXP} AXP`}
        >
          <Text style={styles.primaryBtnText}>签到领 {CHECKIN_AXP} AXP</Text>
        </Pressable>

        {/* 仅圈地、不签到也可完成本步(R5.5);此路径不发 AXP(R5.3b)。 */}
        <Pressable
          style={styles.skipStepBtn}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel="先完成安家"
        >
          <Text style={styles.skipStepText}>先完成安家 →</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // done:签到完成 → AXP 跳动可视化(R5.3)+ 进入永曜城(R5.6)。
  if (phase === 'done') {
    const bounceScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.18] });
    const bounceOpacity = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const gotAxp = (axpAwarded ?? 0) > 0;
    return (
      <StepScaffold
        title="安家完成"
        subtitle={
          gotAxp
            ? '它已经在你身边的真实世界落了脚。'
            : checkinMsg || '今天已经签到过啦,它已经在你身边落了脚。'
        }
        onSkip={onSkip}
      >
        {gotAxp ? (
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
          accessibilityLabel="进入永曜城"
        >
          <Text style={styles.primaryBtnText}>进入永曜城</Text>
        </Pressable>
      </StepScaffold>
    );
  }

  // intro:引导首次圈地(R5.1)。
  return (
    <StepScaffold
      title="安家永曜城"
      subtitle="在真实地图上圈一块地、看看附近有谁、签到拿 AXP,让它落地在你身边。"
      onSkip={onSkip}
    >
      <Pressable
        style={styles.primaryBtn}
        onPress={handleClaim}
        accessibilityRole="button"
        accessibilityLabel="在我所在的位置圈一块地"
      >
        <Text style={styles.primaryBtnText}>圈一块地,安个家</Text>
      </Pressable>

      {/* 没条件/不想圈地也可完成本步(R5.5);此路径不发 AXP(R5.3b)。 */}
      <Pressable
        style={styles.skipStepBtn}
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel="暂不安家,完成引导"
      >
        <Text style={styles.skipStepText}>暂不安家 →</Text>
      </Pressable>
    </StepScaffold>
  );
}

export default SettleAeonStep;

const styles = themedStyles(() => StyleSheet.create({
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
    marginTop: 4,
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
  nearbyCard: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  nearbyHeadline: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  nearbyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginRight: 10,
  },
  nearbyName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  nearbyDist: {
    color: colors.textMuted,
    fontSize: 13,
    marginLeft: 8,
  },
  nearbyEmpty: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
  axpChip: {
    backgroundColor: colors.accentDark,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 22,
    marginBottom: 22,
    alignSelf: 'center',
  },
  axpChipText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
}));
