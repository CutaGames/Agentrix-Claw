/**
 * PetEarningsScreen — 萌宠收益中心（Pet Earning Flywheel 需求 2）。
 *
 * 聚合展示萌宠通过所有集市渠道赚到的收益：AXP 余额（平台积分，无法币折算）+ USDT 集市收入、
 * 按来源分类占比、收益走势、收益明细。数据来自 /api/v1/pet-earnings/*。
 * AXP 与 USDT 分单位展示，不相加。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import Svg, { Polyline, Line as SvgLine } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { themedStyles } from '../../theme/useTheme';
import {
  fetchEarningSummary,
  fetchEarningBreakdown,
  fetchEarningTimeline,
  fetchPetEconomicProfile,
  enablePetEarning,
  EarningRange,
} from '../../services/petEarnings.api';
import { fetchAxpHistory, AxpLedgerEntry } from '../../services/axp.api';
import { referralApi } from '../../services/referral.api';
import { fetchOpportunities, acceptOpportunity, Opportunity } from '../../services/petEarnings.api';
import { Alert } from 'react-native';

const RANGES: Array<{ key: EarningRange; label: { en: string; zh: string } }> = [
  { key: '7d', label: { en: '7D', zh: '7天' } },
  { key: '30d', label: { en: '30D', zh: '30天' } },
  { key: 'all', label: { en: 'All', zh: '全部' } },
];

const CAT_COLORS = ['#16a34a', '#2563eb', '#eab308', '#db2777', '#9333ea', '#0891b2', '#f97316', '#64748b'];
const CHART_W = 300;
const CHART_H = 90;

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(ts).toISOString().slice(0, 10);
}

export function PetEarningsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const [range, setRange] = useState<EarningRange>('30d');

  const summaryQ = useQuery({ queryKey: ['pe-summary'], queryFn: fetchEarningSummary, staleTime: 30_000, retry: 1 });
  const breakdownQ = useQuery({ queryKey: ['pe-breakdown', range], queryFn: () => fetchEarningBreakdown(range), staleTime: 30_000, retry: 1 });
  const timelineQ = useQuery({ queryKey: ['pe-timeline', range], queryFn: () => fetchEarningTimeline(range), staleTime: 30_000, retry: 1 });
  const historyQ = useQuery({ queryKey: ['pe-history'], queryFn: () => fetchAxpHistory(30), staleTime: 30_000, retry: 1 });
  const flywheelQ = useQuery({ queryKey: ['pe-flywheel'], queryFn: () => referralApi.getMyFlywheel(), staleTime: 30_000, retry: 1 });
  const opportunitiesQ = useQuery({ queryKey: ['pe-opportunities'], queryFn: () => fetchOpportunities(10), staleTime: 30_000, retry: 1 });
  const profileQ = useQuery({ queryKey: ['pe-economic-profile'], queryFn: fetchPetEconomicProfile, staleTime: 30_000, retry: 1 });
  const [enabling, setEnabling] = useState(false);

  const onEnableEarning = useCallback(async () => {
    setEnabling(true);
    try {
      const r = await enablePetEarning();
      Alert.alert(
        t({ en: 'Earning enabled', zh: '赚钱能力已开通' }),
        r.alreadyBound
          ? t({ en: 'Your pet is already set up to earn.', zh: '你的萌宠已具备赚钱能力。' })
          : t({ en: 'Your pet now has a wallet and can earn in the marketplace.', zh: '萌宠已拥有钱包，可在集市赚钱了。' }),
      );
      profileQ.refetch(); summaryQ.refetch();
    } catch (e: any) {
      Alert.alert(t({ en: 'Failed', zh: '开通失败' }), e?.message || t({ en: 'Please try again.', zh: '请稍后再试。' }));
    } finally {
      setEnabling(false);
    }
  }, [t, profileQ, summaryQ]);

  const onRefresh = useCallback(() => {
    summaryQ.refetch(); breakdownQ.refetch(); timelineQ.refetch(); historyQ.refetch();
  }, [summaryQ, breakdownQ, timelineQ, historyQ]);

  const onInvite = useCallback(async () => {
    try {
      const link = await referralApi.getMyLink();
      await Share.share({
        message: t({
          en: `Join me on Agentrix — your AI pet earns for you. Sign up with my link and we both get 200 AXP: ${link}`,
          zh: `来 Agentrix，让 AI 萌宠帮你赚钱！用我的链接注册，双方各得 200 AXP：${link}`,
        }),
      });
    } catch { /* user cancelled or share unavailable */ }
  }, [t]);

  const onAccept = useCallback(async (op: Opportunity) => {
    try {
      await acceptOpportunity(op.taskId);
      Alert.alert(
        t({ en: 'Accepted', zh: '已接单' }),
        t({ en: `Your pet placed a bid on "${op.title}". Earnings will appear here when completed.`, zh: `萌宠已为你投标「${op.title}」。完成后收益会显示在这里。` }),
      );
      opportunitiesQ.refetch();
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Cannot accept', zh: '无法接单' }),
        e?.message || t({ en: 'Please try again later.', zh: '请稍后再试。' }),
      );
    }
  }, [t, opportunitiesQ]);

  const summary = summaryQ.data;
  const profile = profileQ.data;
  const breakdown = breakdownQ.data ?? [];
  const axpItems = breakdown.filter((b) => b.unit === 'AXP');
  const usdtItems = breakdown.filter((b) => b.unit === 'USDT');
  const timeline = timelineQ.data ?? [];
  const history = historyQ.data?.items ?? [];
  const flywheel = flywheelQ.data;
  const opportunities = opportunitiesQ.data ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={summaryQ.isRefetching || breakdownQ.isRefetching}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>💰 {t({ en: 'Earnings Center', zh: '收益中心' })}</Text>

      {/* 汇总头：AXP + USDT 分单位 */}
      {summaryQ.isLoading && !summary ? (
        <View style={styles.balanceCard}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t({ en: 'AXP Balance', zh: 'AXP 余额' })}</Text>
          <Text style={styles.balanceValue}>{(summary?.axp.balance ?? 0).toLocaleString()}</Text>
          <Text style={styles.balanceSub}>{t({ en: 'platform points', zh: '平台积分' })}</Text>
          <View style={styles.statsRow}>
            <Stat label={t({ en: 'Earned', zh: '累计赚取' })} value={summary?.axp.lifetimeEarned ?? 0} />
            <Stat label={t({ en: 'Spent', zh: '累计消耗' })} value={summary?.axp.lifetimeSpent ?? 0} />
            <Stat label={t({ en: 'Expired', zh: '已过期' })} value={summary?.axp.lifetimeExpired ?? 0} />
          </View>
          {(summary?.usdt.lifetimeEarned ?? 0) > 0 && (
            <View style={styles.usdtRow}>
              <Text style={styles.usdtLabel}>{t({ en: 'USDT (marketplace)', zh: 'USDT 集市收入' })}</Text>
              <Text style={styles.usdtValue}>{(summary?.usdt.lifetimeEarned ?? 0).toLocaleString()} USDT</Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('AxpRewardShop')}>
        <Text style={styles.actionBtnText}>🛍 {t({ en: 'Redeem', zh: '去兑付' })}</Text>
      </TouchableOpacity>

      {/* 萌宠 = 会赚钱的经济主体（需求 3 / 任务 5.2）*/}
      <Text style={styles.sectionHeader}>{t({ en: 'Your Earning Pet', zh: '会赚钱的萌宠' })}</Text>
      <View style={styles.flywheelCard}>
        {profileQ.isLoading && !profile ? (
          <ActivityIndicator color={colors.accent} />
        ) : profile?.earning?.enabled ? (
          <>
            <View style={styles.flywheelStats}>
              <Stat label={t({ en: 'Credit', zh: '信用分' })} value={Math.round(profile.earning.creditScore ?? 0)} />
              <Stat label={t({ en: 'Used Today', zh: '今日已用' })} value={Math.round(profile.earning.usedTodayAmount ?? 0)} />
              <Stat label={t({ en: 'Deals', zh: '成交数' })} value={Math.round(profile.earning.totalTransactions ?? 0)} />
            </View>
            <Text style={styles.flywheelHint}>
              {t({
                en: `${profile.pet?.name ?? 'Your pet'} has a wallet and earns in the marketplace. Daily spend cap protects you.`,
                zh: `${profile.pet?.name ?? '你的萌宠'} 已有钱包并在集市赚钱，日限额为你兜底风控。`,
              })}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.flywheelHint}>
              {t({
                en: 'Enable earning to give your pet a wallet so it can accept marketplace tasks and earn for you.',
                zh: '开通赚钱能力后，萌宠会获得钱包，可在集市接活替你赚钱。',
              })}
            </Text>
            <TouchableOpacity style={[styles.inviteBtn, enabling && { opacity: 0.6 }]} disabled={enabling} onPress={onEnableEarning}>
              {enabling ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.actionBtnText}>⚡ {t({ en: 'Enable Earning', zh: '开通赚钱能力' })}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 区间切换 */}
      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.rangeChip, range === r.key && styles.rangeChipActive]}
          >
            <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>
              {t(r.label)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 收益走势 */}
      <Text style={styles.sectionHeader}>{t({ en: 'Trend', zh: '收益走势' })}</Text>
      <TrendChart timeline={timeline} loading={timelineQ.isLoading} t={t} />

      {/* 来源分类拆分 */}
      <Text style={styles.sectionHeader}>{t({ en: 'By Source', zh: '来源拆分' })}</Text>
      {breakdownQ.isLoading && breakdown.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : axpItems.length === 0 && usdtItems.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No earnings in this range yet.', zh: '该区间还没有收益。' })}</Text>
      ) : (
        <>
          {axpItems.sort((a, b) => b.amount - a.amount).map((b, i) => (
            <BreakdownBar key={`axp-${b.category}`} item={b} color={CAT_COLORS[i % CAT_COLORS.length]} unitLabel="AXP" />
          ))}
          {usdtItems.map((b) => (
            <BreakdownBar key="usdt" item={{ ...b, category: t({ en: 'Marketplace (USDT)', zh: '集市成交' }) }} color="#10b981" unitLabel="USDT" />
          ))}
        </>
      )}

      {/* 收益明细 */}
      <Text style={styles.sectionHeader}>{t({ en: 'Recent', zh: '收益明细' })}</Text>
      {historyQ.isLoading && history.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : history.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No records yet.', zh: '暂无记录。' })}</Text>
      ) : (
        history.map((e) => <LedgerRow key={e.id} entry={e} />)
      )}

      {/* 萌宠帮我赚（半自主接活）*/}
      <Text style={styles.sectionHeader}>{t({ en: 'Pet Earns for You', zh: '萌宠帮我赚' })}</Text>
      {opportunitiesQ.isLoading && opportunities.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : opportunities.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No open tasks right now.', zh: '暂无可接任务。' })}</Text>
      ) : (
        opportunities.slice(0, 5).map((op) => (
          <View key={op.taskId} style={styles.oppRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowSource} numberOfLines={1}>{op.title}</Text>
              <Text style={styles.rowTime}>{op.type} · {op.budget} {op.currency}</Text>
            </View>
            <TouchableOpacity style={styles.oppBtn} onPress={() => onAccept(op)}>
              <Text style={styles.oppBtnText}>{t({ en: 'Accept', zh: '接单' })}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* 我的拉新（飞轮"拉新"环）*/}
      <Text style={styles.sectionHeader}>{t({ en: 'Invite & Earn', zh: '邀请好友赚 AXP' })}</Text>
      <View style={styles.flywheelCard}>
        <View style={styles.flywheelStats}>
          <Stat label={t({ en: 'Invited', zh: '已邀请' })} value={flywheel?.invited ?? 0} />
          <Stat label={t({ en: 'Rewarded', zh: '已奖励' })} value={flywheel?.rewardedSignups ?? 0} />
          <Stat label={t({ en: 'GMV Reward AXP', zh: '返佣 AXP' })} value={flywheel?.totalGmvRewardAxp ?? 0} />
        </View>
        <Text style={styles.flywheelHint}>
          {t({ en: 'Friend signs up → both get 200 AXP. They trade → you earn 2% as AXP.', zh: '好友注册 → 双方各得 200 AXP；TA 成交 → 你按 2% 得 AXP 返佣。' })}
        </Text>
        <TouchableOpacity style={styles.inviteBtn} onPress={onInvite}>
          <Text style={styles.actionBtnText}>🔗 {t({ en: 'Get Invite Link', zh: '获取邀请链接' })}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        {t({
          en: 'AXP is a platform reward (points), not a currency and has no fiat valuation. USDT income is from on-chain marketplace settlements.',
          zh: 'AXP 为平台积分（非货币、无法币定价）。USDT 收入来自链上集市成交结算。',
        })}
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TrendChart({ timeline, loading, t }: { timeline: Array<{ date: string; axpEarned: number }>; loading: boolean; t: any }) {
  if (loading) return <View style={[styles.chartBox, { height: CHART_H }]}><ActivityIndicator color={colors.accent} /></View>;
  const pts = timeline.filter((p) => p.axpEarned > 0);
  if (pts.length < 2) return <View style={[styles.chartBox, { height: CHART_H }]}><Text style={styles.empty}>{t({ en: 'Not enough data', zh: '数据不足' })}</Text></View>;
  const vals = timeline.map((p) => p.axpEarned);
  const maxV = Math.max(...vals, 1);
  const n = timeline.length;
  const coords = timeline.map((p, i) => {
    const x = (i / Math.max(1, n - 1)) * CHART_W;
    const y = CHART_H - (p.axpEarned / maxV) * (CHART_H - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <View style={[styles.chartBox, { height: CHART_H }]}>
      <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
        <SvgLine x1="0" y1={CHART_H - 6} x2={CHART_W} y2={CHART_H - 6} stroke={colors.border} strokeWidth="1" />
        <Polyline points={coords.join(' ')} fill="none" stroke={colors.accent} strokeWidth="2" />
      </Svg>
    </View>
  );
}

function BreakdownBar({ item, color, unitLabel }: { item: { category: string; amount: number; pctOfUnit: number }; color: string; unitLabel: string }) {
  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <Text style={styles.barCat}>{item.category}</Text>
        <Text style={styles.barAmt}>{item.amount.toLocaleString()} {unitLabel}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, item.pctOfUnit)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function LedgerRow({ entry }: { entry: AxpLedgerEntry }) {
  const isEarn = entry.direction === 'earn' || (entry.direction === 'adjust' && entry.amount > 0);
  const color = entry.direction === 'earn' ? '#22c55e' : entry.direction === 'expire' ? colors.textMuted : '#ef4444';
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowSource}>{entry.source}</Text>
        {entry.note ? <Text style={styles.rowNote}>{entry.note}</Text> : null}
        <Text style={styles.rowTime}>{formatTime(entry.created_at)}</Text>
      </View>
      <Text style={[styles.rowAmount, { color }]}>{isEarn ? '+' : '-'}{entry.amount.toLocaleString()}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  balanceCard: { backgroundColor: colors.bgCard, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 16, minHeight: 160 },
  balanceLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  balanceValue: { fontSize: 40, fontWeight: '800', color: colors.accent, marginBottom: 4 },
  balanceSub: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  usdtRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  usdtLabel: { fontSize: 12, color: colors.textMuted },
  usdtValue: { fontSize: 14, fontWeight: '700', color: '#10b981' },
  actionBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  rangeChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  rangeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  rangeText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  rangeTextActive: { color: '#fff' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10, paddingHorizontal: 4 },
  chartBox: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginVertical: 12, paddingHorizontal: 20 },
  barRow: { marginBottom: 10 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barCat: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  barAmt: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  rowSource: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  rowNote: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowTime: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '700' },
  disclaimer: { textAlign: 'center', fontSize: 10, color: colors.textMuted, marginTop: 20, paddingHorizontal: 12, lineHeight: 14, opacity: 0.55 },
  flywheelCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  flywheelStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  flywheelHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  inviteBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  oppBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  oppBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
}));
