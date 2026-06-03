import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  predictionApi,
  PredictionRound,
  PredictionBet,
  PredictionBalance,
  PolymarketEvent,
  BetSide,
} from '../../services/prediction.api';

const QUICK_BETS = [10, 25, 50, 100];

function formatCountdown(targetIso?: string, now: number = Date.now()): string {
  if (!targetIso) return '--:--';
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtPct(n: number) {
  return `${Math.round(n)}%`;
}

function fmtOdds(n: number | null) {
  if (n == null) return '—';
  return `${n.toFixed(2)}x`;
}

export function PredictScreen() {
  const { t } = useI18n();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [liveRounds, setLiveRounds] = useState<PredictionRound[]>([]);
  const [recentRounds, setRecentRounds] = useState<PredictionRound[]>([]);
  const [balance, setBalance] = useState<PredictionBalance | null>(null);
  const [myBets, setMyBets] = useState<PredictionBet[]>([]);
  const [polymarket, setPolymarket] = useState<PolymarketEvent[]>([]);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [betting, setBetting] = useState(false);
  const [betAmount, setBetAmount] = useState<number>(25);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const tasks: Array<Promise<any>> = [
        predictionApi.liveRounds('BTC', 4).catch(() => ({ items: [] })),
        predictionApi.recentRounds('BTC', 6).catch(() => ({ items: [] })),
        predictionApi.polymarketTrending(6).catch(() => ({ items: [] })),
      ];
      if (isAuthenticated) {
        tasks.push(predictionApi.myBalance().catch(() => null));
        tasks.push(predictionApi.myBets(10).catch(() => ({ items: [] })));
      }
      const [liveRes, recentRes, polyRes, balRes, betsRes] = await Promise.all(tasks);
      setLiveRounds(liveRes?.items || []);
      setRecentRounds(recentRes?.items || []);
      setPolymarket(polyRes?.items || []);
      if (isAuthenticated) {
        setBalance(balRes || null);
        setMyBets(betsRes?.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Initial + interval refresh
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  // Spot price (Binance) every 4s
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const j = await r.json();
        if (!cancelled && j?.price) setSpotPrice(parseFloat(j.price));
      } catch {
        // ignore
      }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Tick countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const currentRound = useMemo(
    () => liveRounds.find((r) => r.status === 'open') || null,
    [liveRounds],
  );
  const lockedRound = useMemo(
    () => liveRounds.find((r) => r.status === 'locked') || null,
    [liveRounds],
  );

  const myBetsByRound = useMemo(() => {
    const m = new Map<string, PredictionBet[]>();
    for (const b of myBets) {
      if (!m.has(b.roundId)) m.set(b.roundId, []);
      m.get(b.roundId)!.push(b);
    }
    return m;
  }, [myBets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const placeBet = async (side: BetSide) => {
    if (!isAuthenticated) {
      Alert.alert(
        t({ en: 'Login required', zh: '请先登录' }),
        t({ en: 'Sign in to start placing bets with virtual USDC.', zh: '登录后才能用虚拟 USDC 下注。' }),
      );
      return;
    }
    if (!currentRound) {
      Alert.alert(t({ en: 'No open round', zh: '当前没有可下注轮次' }));
      return;
    }
    if (betAmount < 1 || betAmount > 500) {
      Alert.alert(t({ en: 'Invalid amount', zh: '金额无效' }), t({ en: 'Amount must be 1-500 USDC.', zh: '下注金额需在 1-500 USDC 之间。' }));
      return;
    }
    setBetting(true);
    try {
      const res = await predictionApi.placeBet({
        roundId: currentRound.id,
        side,
        amount: betAmount,
      });
      Alert.alert(
        '✅ ' + t({ en: 'Bet placed', zh: '下注成功' }),
        t({
          en: `Bet ${betAmount} USDC on ${side.toUpperCase()}. Settles in ~5 minutes.`,
          zh: `已押 ${betAmount} USDC ${side === 'up' ? '看涨' : '看跌'}，约 5 分钟后开奖。`,
        }),
      );
      // Refresh
      refresh();
    } catch (e: any) {
      Alert.alert(t({ en: 'Bet failed', zh: '下注失败' }), e?.message || 'Unknown error');
    } finally {
      setBetting(false);
    }
  };

  const lockSecondsLeft = currentRound
    ? Math.max(0, Math.round((new Date(currentRound.lockTime).getTime() - now) / 1000))
    : 0;
  const settleSecondsLeft = lockedRound
    ? Math.max(0, Math.round((new Date(lockedRound.expiryTime).getTime() - now) / 1000))
    : 0;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* Hero: BTC spot */}
      <View style={styles.hero}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.heroLabel}>{t({ en: 'BTC / USDT (spot)', zh: 'BTC / USDT 现价' })}</Text>
            <Text style={styles.heroPrice}>
              {spotPrice ? `$${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🔥 {t({ en: 'NEW', zh: '上线' })}</Text>
          </View>
        </View>
        <Text style={styles.heroSubtitle}>
          {t({
            en: '5-min up/down rounds · virtual USDC · auto-settled at expiry',
            zh: '5 分钟一轮 · 虚拟 USDC · 到期自动开奖',
          })}
        </Text>
      </View>

      {/* Balance card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t({ en: 'My Balance', zh: '我的余额' })}</Text>
        {!isAuthenticated ? (
          <Text style={styles.muted}>
            {t({ en: 'Sign in to receive 1000 demo USDC and start playing.', zh: '登录后自动获得 1000 USDC 体验金，开始游戏。' })}
          </Text>
        ) : balance ? (
          <>
            <Text style={styles.balanceBig}>${Number(balance.balance).toFixed(2)} <Text style={styles.balanceUnit}>USDC</Text></Text>
            <View style={styles.statsRow}>
              <Stat label={t({ en: 'Net P&L', zh: '净盈亏' })} value={`${Number(balance.netPnl) >= 0 ? '+' : ''}${Number(balance.netPnl).toFixed(2)}`} color={Number(balance.netPnl) >= 0 ? '#22c55e' : '#ef4444'} />
              <Stat label={t({ en: 'Win Rate', zh: '胜率' })} value={balance.totalBets > 0 ? `${((balance.winsCount / balance.totalBets) * 100).toFixed(0)}%` : '—'} />
              <Stat label={t({ en: 'Bets', zh: '下单' })} value={String(balance.totalBets)} />
              <Stat label={t({ en: 'Best Streak', zh: '最长连胜' })} value={String(balance.bestStreak)} />
            </View>
          </>
        ) : (
          <Text style={styles.muted}>{t({ en: 'Loading balance…', zh: '加载中…' })}</Text>
        )}
      </View>

      {/* Current round */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>{t({ en: 'Current Round', zh: '当前轮次' })}</Text>
          {currentRound && (
            <View style={[styles.countdownBadge, lockSecondsLeft < 30 && { backgroundColor: '#7f1d1d' }]}>
              <Text style={styles.countdownText}>
                ⏱ {formatCountdown(currentRound.lockTime, now)}
              </Text>
            </View>
          )}
        </View>

        {!currentRound ? (
          <Text style={styles.muted}>{t({ en: 'Generating next round…', zh: '正在生成下一轮…' })}</Text>
        ) : (
          <>
            {/* Pool bar */}
            <View style={styles.poolBar}>
              <View style={[styles.poolBarUp, { flex: Math.max(0.5, currentRound.upPct) }]}>
                <Text style={styles.poolBarText}>UP {fmtPct(currentRound.upPct)}</Text>
              </View>
              <View style={[styles.poolBarDown, { flex: Math.max(0.5, currentRound.downPct) }]}>
                <Text style={styles.poolBarText}>DOWN {fmtPct(currentRound.downPct)}</Text>
              </View>
            </View>
            <Text style={styles.poolMeta}>
              {t({ en: 'Total pool', zh: '总池' })}: ${currentRound.totalPool.toFixed(2)} · {currentRound.upCount + currentRound.downCount} {t({ en: 'bets', zh: '人' })}
            </Text>

            {/* Quick amount */}
            <Text style={[styles.cardTitle, { fontSize: 14, marginTop: 12 }]}>{t({ en: 'Wager', zh: '下注金额' })}</Text>
            <View style={styles.quickRow}>
              {QUICK_BETS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.quickBtn, betAmount === amt && styles.quickBtnActive]}
                  onPress={() => setBetAmount(amt)}
                >
                  <Text style={[styles.quickBtnText, betAmount === amt && styles.quickBtnTextActive]}>{amt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* UP / DOWN buttons */}
            <View style={styles.betRow}>
              <TouchableOpacity
                style={[styles.betUp, betting && { opacity: 0.5 }]}
                disabled={betting}
                onPress={() => placeBet('up')}
              >
                <Text style={styles.betEmoji}>📈</Text>
                <Text style={styles.betLabel}>{t({ en: 'UP', zh: '看涨' })}</Text>
                <Text style={styles.betOdds}>x{fmtOdds(currentRound.upOdds)}</Text>
                {(myBetsByRound.get(currentRound.id) || []).filter((b) => b.side === 'up').length > 0 && (
                  <Text style={styles.betMine}>
                    ✓ {(myBetsByRound.get(currentRound.id) || []).filter((b) => b.side === 'up').reduce((s, b) => s + Number(b.amount), 0)} USDC
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.betDown, betting && { opacity: 0.5 }]}
                disabled={betting}
                onPress={() => placeBet('down')}
              >
                <Text style={styles.betEmoji}>📉</Text>
                <Text style={styles.betLabel}>{t({ en: 'DOWN', zh: '看跌' })}</Text>
                <Text style={styles.betOdds}>x{fmtOdds(currentRound.downOdds)}</Text>
                {(myBetsByRound.get(currentRound.id) || []).filter((b) => b.side === 'down').length > 0 && (
                  <Text style={styles.betMine}>
                    ✓ {(myBetsByRound.get(currentRound.id) || []).filter((b) => b.side === 'down').reduce((s, b) => s + Number(b.amount), 0)} USDC
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Locked round */}
      {lockedRound && (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{t({ en: 'Locked — settling soon', zh: '已锁定 · 即将开奖' })}</Text>
            <View style={[styles.countdownBadge, { backgroundColor: '#1f2d42' }]}>
              <Text style={styles.countdownText}>⏱ {formatCountdown(lockedRound.expiryTime, now)}</Text>
            </View>
          </View>
          <Text style={styles.muted}>
            {t({ en: 'Lock price', zh: '锁定价' })}: ${lockedRound.lockPrice ? Number(lockedRound.lockPrice).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
          </Text>
        </View>
      )}

      {/* Recent results */}
      {recentRounds.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t({ en: 'Recent Results', zh: '最近开奖' })}</Text>
          {recentRounds.slice(0, 6).map((r) => {
            const lock = r.lockPrice ? Number(r.lockPrice) : null;
            const close = r.closePrice ? Number(r.closePrice) : null;
            const delta = lock && close ? ((close - lock) / lock) * 100 : null;
            const isUp = r.outcome === 'up';
            const isDown = r.outcome === 'down';
            return (
              <View key={r.id} style={styles.recentRow}>
                <Text
                  style={[
                    styles.recentBadge,
                    {
                      color: isUp ? '#22c55e' : isDown ? '#ef4444' : colors.textMuted,
                      backgroundColor: isUp ? '#14532d' : isDown ? '#7f1d1d' : '#1f2d42',
                    },
                  ]}
                >
                  {isUp ? '↑ UP' : isDown ? '↓ DOWN' : r.outcome === 'tie' ? '= TIE' : 'VOIDED'}
                </Text>
                <Text style={styles.recentText}>
                  ${lock?.toFixed(0) ?? '—'} → ${close?.toFixed(0) ?? '—'}
                </Text>
                {delta != null && (
                  <Text style={[styles.recentDelta, { color: delta >= 0 ? '#22c55e' : '#ef4444' }]}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}%
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* My recent bets */}
      {isAuthenticated && myBets.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t({ en: 'My Recent Bets', zh: '我的下注' })}</Text>
          {myBets.slice(0, 8).map((b) => (
            <View key={b.id} style={styles.recentRow}>
              <Text style={[styles.recentBadge, { backgroundColor: b.side === 'up' ? '#14532d' : '#7f1d1d', color: b.side === 'up' ? '#22c55e' : '#ef4444' }]}>
                {b.side.toUpperCase()}
              </Text>
              <Text style={styles.recentText}>{Number(b.amount).toFixed(0)} USDC</Text>
              <Text
                style={[
                  styles.recentDelta,
                  {
                    color:
                      b.status === 'won'
                        ? '#22c55e'
                        : b.status === 'lost'
                        ? '#ef4444'
                        : b.status === 'refunded'
                        ? colors.textSecondary
                        : colors.accent,
                  },
                ]}
              >
                {b.status === 'won' ? `+${Number(b.payout).toFixed(2)}` : b.status === 'lost' ? '−' : b.status === 'refunded' ? '↺' : '⏳'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Polymarket trending */}
      {polymarket.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🌐 {t({ en: 'Polymarket Trending', zh: 'Polymarket 热点' })}</Text>
          <Text style={styles.muted}>
            {t({
              en: 'Read-only feed of on-chain prediction markets (Polygon CTF). On-chain betting in Phase 2.',
              zh: 'Polymarket 链上预测（Polygon CTF），当前为只读跳转，Phase 2 接入链上下注。',
            })}
          </Text>
          {polymarket.slice(0, 6).map((ev) => (
            <TouchableOpacity key={ev.id} style={styles.polyRow} onPress={() => Linking.openURL(ev.url)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.polyTitle} numberOfLines={2}>{ev.title}</Text>
                {(ev.yesPrice != null || ev.noPrice != null) && (
                  <Text style={styles.polyPrices}>
                    YES {ev.yesPrice != null ? `$${ev.yesPrice.toFixed(2)}` : '—'} · NO {ev.noPrice != null ? `$${ev.noPrice.toFixed(2)}` : '—'}
                  </Text>
                )}
              </View>
              <Text style={styles.polyArrow}>↗</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} >{value && <Text style={{ color: color || colors.textPrimary }}>{value}</Text>}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 32 },

  hero: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  heroLabel: { color: colors.textMuted, fontSize: 12 },
  heroPrice: { color: colors.textPrimary, fontSize: 30, fontWeight: '800', marginTop: 4 },
  heroSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  badge: {
    backgroundColor: '#7c2d12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: '#fed7aa', fontSize: 11, fontWeight: '700' },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  balanceBig: { color: colors.textPrimary, fontSize: 28, fontWeight: '800' },
  balanceUnit: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  stat: {
    flexBasis: '47%' as any,
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 10,
  },
  statValue: { fontSize: 16, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  countdownBadge: { backgroundColor: '#1e3a8a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countdownText: { color: '#bfdbfe', fontSize: 12, fontWeight: '700' },

  poolBar: { flexDirection: 'row', borderRadius: 999, overflow: 'hidden', height: 28, marginTop: 8 },
  poolBarUp: { backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  poolBarDown: { backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  poolBarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  poolMeta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },

  quickRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 12 },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBtnActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  quickBtnText: { color: colors.textSecondary, fontWeight: '700' },
  quickBtnTextActive: { color: colors.accent },

  betRow: { flexDirection: 'row', gap: 10 },
  betUp: {
    flex: 1,
    backgroundColor: '#14532d',
    borderColor: '#16a34a',
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  betDown: {
    flex: 1,
    backgroundColor: '#7f1d1d',
    borderColor: '#dc2626',
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  betEmoji: { fontSize: 26 },
  betLabel: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
  betOdds: { color: '#fff', fontSize: 12, opacity: 0.85, marginTop: 2 },
  betMine: { color: '#fff', fontSize: 11, marginTop: 6, fontWeight: '700' },

  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  recentText: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  recentDelta: { fontSize: 13, fontWeight: '700' },

  polyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  polyTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  polyPrices: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  polyArrow: { color: colors.accent, fontSize: 18 },
});
