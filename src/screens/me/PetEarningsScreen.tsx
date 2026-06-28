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
  Modal,
  TextInput,
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
import {
  searchAggregatedOpportunities,
  participateInListing,
  fetchAggregatedSettlements,
  AggregatedListing,
  AggCategory,
  AGG_CATEGORY_ORDER,
  ParticipateResult,
  AggregatedSettlementRow,
} from '../../services/aggregatedMarket.api';
import {
  CATEGORY_LABELS,
  actionForCategory,
  actionLabel,
  sourceBadgeLabel,
  readPetLimits,
  computeLimitGuard,
  feeLines,
  PetLimitsView,
} from '../../services/aggregatedMarketView';
import { KITSUNE_DEFAULT_IMG } from '../../constants/posterAssets';
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
  const { t, language } = useI18n();
  const [range, setRange] = useState<EarningRange>('30d');

  const summaryQ = useQuery({ queryKey: ['pe-summary'], queryFn: fetchEarningSummary, staleTime: 30_000, retry: 1 });
  const breakdownQ = useQuery({ queryKey: ['pe-breakdown', range], queryFn: () => fetchEarningBreakdown(range), staleTime: 30_000, retry: 1 });
  const timelineQ = useQuery({ queryKey: ['pe-timeline', range], queryFn: () => fetchEarningTimeline(range), staleTime: 30_000, retry: 1 });
  const historyQ = useQuery({ queryKey: ['pe-history'], queryFn: () => fetchAxpHistory(30), staleTime: 30_000, retry: 1 });
  const flywheelQ = useQuery({ queryKey: ['pe-flywheel'], queryFn: () => referralApi.getMyFlywheel(), staleTime: 30_000, retry: 1 });
  const opportunitiesQ = useQuery({ queryKey: ['pe-opportunities'], queryFn: () => fetchOpportunities(10), staleTime: 30_000, retry: 1 });
  const profileQ = useQuery({ queryKey: ['pe-economic-profile'], queryFn: fetchPetEconomicProfile, staleTime: 30_000, retry: 1 });
  const [enabling, setEnabling] = useState(false);

  // ── 全网可接机会（聚合检索 + 半自主接活，需求 10.1/10.2/10.3）──
  const [aggCategory, setAggCategory] = useState<AggCategory | 'all'>('all');
  const [aggText, setAggText] = useState('');
  const [aggCriteria, setAggCriteria] = useState<{ category: AggCategory | 'all'; text: string }>({
    category: 'all',
    text: '',
  });
  const [selected, setSelected] = useState<AggregatedListing | null>(null);
  const [participating, setParticipating] = useState(false);
  const [participateResult, setParticipateResult] = useState<ParticipateResult | null>(null);

  const aggQ = useQuery({
    queryKey: ['pe-agg', aggCriteria.category, aggCriteria.text, language],
    queryFn: () =>
      searchAggregatedOpportunities({
        text: aggCriteria.text || undefined,
        category: aggCriteria.category === 'all' ? undefined : aggCriteria.category,
        lang: language === 'en' ? 'en' : 'zh',
        pageSize: 50,
      }),
    staleTime: 30_000,
    retry: 1,
  });
  const aggSettlementsQ = useQuery({
    queryKey: ['pe-agg-settlements'],
    queryFn: () => fetchAggregatedSettlements(20),
    staleTime: 30_000,
    retry: 1,
  });

  const onPickCategory = useCallback(
    (c: AggCategory | 'all') => {
      setAggCategory(c);
      setAggCriteria({ category: c, text: aggText.trim() });
    },
    [aggText],
  );
  const onAggSearch = useCallback(() => {
    setAggCriteria({ category: aggCategory, text: aggText.trim() });
  }, [aggCategory, aggText]);

  const openListing = useCallback((l: AggregatedListing) => {
    setSelected(l);
    setParticipateResult(null);
  }, []);
  const closeListing = useCallback(() => {
    setSelected(null);
    setParticipateResult(null);
    setParticipating(false);
  }, []);

  const onParticipate = useCallback(async () => {
    if (!selected) return;
    setParticipating(true);
    setParticipateResult(null);
    try {
      const r = await participateInListing({
        listing: selected,
        action: actionForCategory(selected.category),
      });
      setParticipateResult(r);
      if (r.ok) {
        aggSettlementsQ.refetch();
        summaryQ.refetch();
      }
    } catch (e: any) {
      setParticipateResult({ ok: false, status: 'rejected', reason: e?.message });
    } finally {
      setParticipating(false);
    }
  }, [selected, aggSettlementsQ, summaryQ]);

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
    let link = '';
    try {
      link = await referralApi.getMyLink();
    } catch { /* fall through to share fallback */ }
    // 拉新海报（需求 4.5）：跳分享海报屏（含二维码深链 ?ref=），而非纯链接。
    if (link) {
      try {
        navigation.navigate('ShareCard', {
          shareUrl: link,
          title: t({ en: 'Adopt an AI pet that earns', zh: '来养一只会赚钱的 AI 萌宠' }),
          subtitle: t({ en: 'Sign up with my link — we both get 200 AXP', zh: '用我的链接注册，双方各得 200 AXP' }),
          headerEmoji: '🐾',
          imageUrl: KITSUNE_DEFAULT_IMG,
          description: t({ en: 'Your pet earns in the marketplace. When you trade, I earn 2% as AXP.', zh: 'AI 萌宠在集市替你赚钱；你成交，我还能拿 2% AXP 返佣。' }),
          ctaLabel: t({ en: 'Scan to join', zh: '扫码加入' }),
          accentFrom: '#7c3aed',
          accentTo: '#2563eb',
        });
        return;
      } catch { /* navigation unavailable → plain share */ }
    }
    try {
      await Share.share({
        message: t({
          en: `Join me on Agentrix — your AI pet earns for you. Sign up with my link and we both get 200 AXP: ${link}`,
          zh: `来 Agentrix，让 AI 萌宠帮你赚钱！用我的链接注册，双方各得 200 AXP：${link}`,
        }),
      });
    } catch { /* user cancelled or share unavailable */ }
  }, [navigation, t]);

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
  const aggListings = aggQ.data ?? [];
  const aggSettlements = aggSettlementsQ.data ?? [];
  const petLimits = readPetLimits(profile?.earning?.spendingLimits, profile?.earning?.usedTodayAmount);

  return (
    <>
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

      {/* 链上授权入口（Agent Protocol Stack 需求 6.1/6.2）*/}
      <TouchableOpacity style={styles.onchainCard} onPress={() => navigation.navigate('OnchainAuth')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.onchainTitle}>🔐 {t({ en: 'On-chain Authorization', zh: '链上授权' })}</Text>
          <Text style={styles.onchainHint}>
            {t({
              en: 'Grant your pet a spending cap to pay on-chain, review or revoke it, and see on-chain activity.',
              zh: '给萌宠授权链上代付额度、查看/撤销，并查看链上动作记录。',
            })}
          </Text>
        </View>
        <Text style={styles.onchainChevron}>›</Text>
      </TouchableOpacity>

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

      {/* 全网机会日报 · 可转发海报入口 */}
      <Text style={styles.sectionHeader}>{t({ en: 'Daily Digest', zh: '机会日报' })}</Text>
      <TouchableOpacity style={styles.onchainCard} onPress={() => navigation.navigate('DigestPoster')} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <Text style={styles.onchainTitle}>🪂 {t({ en: 'Daily Opportunity Digest', zh: '全网机会日报' })}</Text>
          <Text style={styles.onchainHint}>
            {t({
              en: 'Today\'s picks: predictions / airdrops / tasks / skills. Generate a poster and share to WeChat groups.',
              zh: '今日精选：预测 / 空投 / 任务 / 技能工具，一键生成海报转发到微信群。',
            })}
          </Text>
        </View>
        <Text style={styles.onchainChevron}>›</Text>
      </TouchableOpacity>

      {/* 全网可接机会（聚合检索 + 半自主接活，需求 10.1/10.2/10.3）*/}
      <Text style={styles.sectionHeader}>🌐 {t({ en: 'All-Network Opportunities', zh: '全网可接机会' })}</Text>
      <View style={styles.aggCard}>
        <Text style={styles.aggHint}>
          {t({
            en: 'Internal + aggregated external listings, ranked together. Accept within your limits — fees settle via the unified ledger.',
            zh: '内部自营 + 全网已聚合外部条目混合排序，限额内一键接单，费用经统一账本结算。',
          })}
        </Text>
        {/* 品类切换 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aggChipRow}>
          <CategoryChip active={aggCategory === 'all'} label={t({ en: 'All', zh: '全部' })} onPress={() => onPickCategory('all')} />
          {AGG_CATEGORY_ORDER.map((c) => (
            <CategoryChip key={c} active={aggCategory === c} label={t(CATEGORY_LABELS[c])} onPress={() => onPickCategory(c)} />
          ))}
        </ScrollView>
        {/* 查询输入 */}
        <View style={styles.aggSearchRow}>
          <TextInput
            style={styles.aggInput}
            value={aggText}
            onChangeText={setAggText}
            onSubmitEditing={onAggSearch}
            placeholder={t({ en: 'Search (optional)', zh: '搜索（可留空按品类）' })}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.aggSearchBtn} onPress={onAggSearch}>
            <Text style={styles.aggSearchBtnText}>{t({ en: 'Search', zh: '检索' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {aggQ.isLoading && aggListings.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : aggListings.length === 0 ? (
        <Text style={styles.empty}>
          {t({ en: 'No matching opportunities. Try another category.', zh: '暂无匹配机会，换个品类试试。' })}
        </Text>
      ) : (
        aggListings.slice(0, 8).map((l) => (
          <TouchableOpacity key={l.identifier} style={styles.oppRow} activeOpacity={0.7} onPress={() => openListing(l)}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <SourceBadge source={l.source} internal={l.internal} t={t} />
                {l.category ? <Text style={styles.catBadge}>{t(CATEGORY_LABELS[l.category])}</Text> : null}
                {l.score ? <Text style={styles.scoreBadge}>{Math.round(l.score)}</Text> : null}
              </View>
              <Text style={styles.rowSource} numberOfLines={1}>{l.displayName}</Text>
              <Text style={styles.rowTime}>
                {l.gmv > 0 ? `${l.gmv.toLocaleString()} ${l.currency}` : t({ en: 'price varies', zh: '价格待定' })}
              </Text>
            </View>
            <View style={[styles.oppBtn, !l.canAccept && styles.oppBtnGhost]}>
              <Text style={[styles.oppBtnText, !l.canAccept && styles.oppBtnGhostText]}>
                {l.canAccept
                  ? t(actionLabel(l.category))
                  : t({ en: 'View', zh: '查看' })}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* 聚合成交流水与对账（需求 10.3）*/}
      <Text style={styles.sectionHeader}>{t({ en: 'Aggregated Settlements', zh: '聚合成交对账' })}</Text>
      {aggSettlementsQ.isLoading && aggSettlements.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : aggSettlements.length === 0 ? (
        <Text style={styles.empty}>
          {t({ en: 'No aggregated deals settled yet.', zh: '暂无聚合成交流水。' })}
        </Text>
      ) : (
        aggSettlements.slice(0, 8).map((s) => <SettlementRow key={s.id} row={s} t={t} />)
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

    {/* 接单弹窗（显示来源、限额、费率 —— 需求 10.2/10.3 测试入口）*/}
    <ParticipateModal
      listing={selected}
      limits={petLimits}
      petEnabled={!!profile?.earning?.enabled}
      participating={participating}
      result={participateResult}
      onConfirm={onParticipate}
      onClose={closeListing}
      t={t}
    />
    </>
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

// ── 全网机会 UI 组件（需求 10.1/10.2/10.3）──

function CategoryChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.aggChip, active && styles.aggChipActive]}>
      <Text style={[styles.aggChipText, active && styles.aggChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** 来源徽标：内部 = Agentrix，外部 = 连接器名（需求 10.1 来源徽标）。 */
function SourceBadge({ source, internal, t }: { source: string; internal: boolean; t: any }) {
  return (
    <View style={[styles.srcBadge, internal ? styles.srcBadgeInternal : styles.srcBadgeExternal]}>
      <Text style={[styles.srcBadgeText, internal ? styles.srcBadgeTextInternal : styles.srcBadgeTextExternal]}>
        {t(sourceBadgeLabel(source, internal))}
      </Text>
    </View>
  );
}

function SettlementRow({ row, t }: { row: AggregatedSettlementRow; t: any }) {
  const internal = row.source.toLowerCase() === 'internal' || row.source.toLowerCase().includes('agentrix');
  const statusColor = row.status === 'settled' ? '#22c55e' : row.status === 'failed' ? '#ef4444' : colors.textMuted;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <View style={styles.badgeRow}>
          <SourceBadge source={row.source} internal={internal} t={t} />
          {row.category ? <Text style={styles.catBadge}>{row.category}</Text> : null}
        </View>
        <Text style={styles.rowTime}>
          {t({ en: 'Fee', zh: '平台费' })} {row.platformFee.toLocaleString()} · {t({ en: 'Net', zh: '净收' })} {row.sellerNet.toLocaleString()} {row.currency}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowAmount}>{row.gmv.toLocaleString()} {row.currency}</Text>
        <Text style={[styles.settleStatus, { color: statusColor }]}>{row.status}</Text>
      </View>
    </View>
  );
}

function LimitLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.modalKv}>
      <Text style={styles.modalKvLabel}>{label}</Text>
      <Text style={styles.modalKvValue}>{value}</Text>
    </View>
  );
}

/**
 * 接单弹窗：显示来源、限额、费率（需求 10.2/10.3 测试入口）。
 * 代成交经 participateInListing → 后端 AggregationParticipationService（L3 执行核 + 围栏 / L4 结算）。
 */
function ParticipateModal({
  listing,
  limits,
  petEnabled,
  participating,
  result,
  onConfirm,
  onClose,
  t,
}: {
  listing: AggregatedListing | null;
  limits: PetLimitsView;
  petEnabled: boolean;
  participating: boolean;
  result: ParticipateResult | null;
  onConfirm: () => void;
  onClose: () => void;
  t: any;
}) {
  const visible = !!listing;
  const guard = computeLimitGuard(listing, limits, petEnabled);
  const { currency: cur, dailyRemaining, blockedByLimit } = guard;
  const confirmLabel = listing ? t(actionLabel(listing.category)) : '';
  const fees = feeLines(result?.feeBreakdown, cur);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {listing ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 头部：名称 + 来源/品类徽标 */}
              <Text style={styles.modalTitle} numberOfLines={2}>{listing.displayName}</Text>
              <View style={styles.badgeRow}>
                <SourceBadge source={listing.source} internal={listing.internal} t={t} />
                {listing.category ? <Text style={styles.catBadge}>{t(CATEGORY_LABELS[listing.category])}</Text> : null}
              </View>
              {listing.description ? (
                <Text style={styles.modalDesc} numberOfLines={4}>{listing.description}</Text>
              ) : null}

              {/* 成交额 */}
              <Text style={styles.modalSection}>{t({ en: 'Deal', zh: '成交额' })}</Text>
              <LimitLine
                label={t({ en: 'Amount (GMV)', zh: '成交额（GMV）' })}
                value={listing.gmv > 0 ? `${listing.gmv.toLocaleString()} ${cur}` : t({ en: 'price varies', zh: '价格待定' })}
              />

              {/* 限额（spendingLimits 双围栏，需求 10.2）*/}
              <Text style={styles.modalSection}>{t({ en: 'Spending Limits', zh: '限额围栏' })}</Text>
              {petEnabled && guard.hasLimits ? (
                <>
                  <LimitLine
                    label={t({ en: 'Per-tx limit', zh: '单笔上限' })}
                    value={limits.singleTxLimit != null ? `${limits.singleTxLimit.toLocaleString()} ${cur}` : '—'}
                  />
                  <LimitLine
                    label={t({ en: 'Daily remaining', zh: '今日剩余额度' })}
                    value={dailyRemaining != null ? `${dailyRemaining.toLocaleString()} ${cur}` : '—'}
                  />
                  <LimitLine
                    label={t({ en: 'Used today', zh: '今日已用' })}
                    value={`${(limits.usedTodayAmount ?? 0).toLocaleString()} ${cur}`}
                  />
                </>
              ) : (
                <Text style={styles.modalNote}>
                  {t({
                    en: 'Enable earning to set spending limits for your pet.',
                    zh: '开通赚钱能力后可为萌宠设置限额围栏。',
                  })}
                </Text>
              )}
              {blockedByLimit ? (
                <Text style={styles.modalWarn}>
                  ⚠️ {t({ en: 'Exceeds your limits — will be blocked by the fence.', zh: '超出限额，将被围栏拦截。' })}
                </Text>
              ) : null}

              {/* 费率（FeeResolverService 单一口径，需求 10.3）*/}
              <Text style={styles.modalSection}>{t({ en: 'Fees', zh: '费率' })}</Text>
              {fees.length > 0 ? (
                <>
                  {fees.map((line) => (
                    <LimitLine key={line.key} label={t(line.label)} value={line.value} />
                  ))}
                </>
              ) : (
                <Text style={styles.modalNote}>
                  {t({
                    en: 'Platform fee is computed by the unified fee resolver at settlement.',
                    zh: '平台费在结算时由统一费率源（FeeResolverService）计算。',
                  })}
                </Text>
              )}

              {/* 代成交结果 */}
              {result ? <ResultBanner result={result} t={t} /> : null}

              {/* 操作区 */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
                  <Text style={styles.modalCancelText}>{t({ en: 'Close', zh: '关闭' })}</Text>
                </TouchableOpacity>
                {listing.canAccept && (!result || result.status === 'rejected' || result.status === 'backend_gap') ? (
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, (participating || blockedByLimit) && { opacity: 0.5 }]}
                    disabled={participating || blockedByLimit}
                    onPress={onConfirm}
                  >
                    {participating ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalConfirmText}>{confirmLabel}</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {!listing.canAccept && listing.externalUrl ? (
                  <View style={styles.modalConfirmBtn}>
                    <Text style={styles.modalConfirmText}>{t({ en: 'Link discovery only', zh: '仅链接发现' })}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ResultBanner({ result, t }: { result: ParticipateResult; t: any }) {
  let msg: string;
  let color: string;
  switch (result.status) {
    case 'settled':
      color = '#22c55e';
      msg = t({ en: 'Settled and recorded in the ledger.', zh: '已结算并入统一账本。' });
      break;
    case 'executed_unsettled':
      color = '#eab308';
      msg = t({ en: 'Executed; awaiting settlement.', zh: '已执行，等待结算。' });
      break;
    case 'payment_required':
      color = '#eab308';
      msg = t({ en: 'Payment required (x402).', zh: '需付款（x402）。' });
      break;
    case 'backend_gap':
      color = colors.textMuted;
      msg = t({
        en: 'Participation backend not wired yet (task 22.1). Discovery + limits/fees preview work.',
        zh: '围栏内代成交后端待接入（任务 22.1）。检索与限额/费率预览已可用。',
      });
      break;
    default:
      color = '#ef4444';
      msg =
        result.reason === 'link-discovery-only'
          ? t({ en: 'Link-discovery only — no internal deal path.', zh: '仅链接发现，无内部成交路径。' })
          : t({ en: 'Rejected.', zh: '已拒绝。' }) + (result.reason ? ` (${result.reason})` : '');
  }
  return (
    <View style={[styles.resultBanner, { borderColor: color }]}>
      <Text style={[styles.resultText, { color }]}>{msg}</Text>
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
  onchainCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  onchainTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  onchainHint: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  onchainChevron: { fontSize: 28, color: colors.textMuted, fontWeight: '300' },
  // 全网可接机会
  aggCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  aggHint: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginBottom: 10 },
  aggChipRow: { gap: 8, paddingVertical: 2 },
  aggChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border },
  aggChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  aggChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  aggChipTextActive: { color: '#fff' },
  aggSearchRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  aggInput: { flex: 1, backgroundColor: colors.bgPrimary, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, color: colors.textPrimary, fontSize: 13 },
  aggSearchBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  aggSearchBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  srcBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  srcBadgeInternal: { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.4)' },
  srcBadgeExternal: { backgroundColor: 'rgba(244,63,94,0.10)', borderColor: 'rgba(244,63,94,0.35)' },
  srcBadgeText: { fontSize: 10, fontWeight: '700' },
  srcBadgeTextInternal: { color: '#818cf8' },
  srcBadgeTextExternal: { color: '#fb7185' },
  catBadge: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, backgroundColor: colors.bgPrimary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  scoreBadge: { fontSize: 10, fontWeight: '700', color: colors.textMuted, backgroundColor: colors.bgPrimary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  oppBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  oppBtnGhostText: { color: colors.textSecondary },
  settleStatus: { fontSize: 10, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  // 接单弹窗
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%', borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  modalDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: 8 },
  modalSection: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  modalKv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  modalKvLabel: { fontSize: 13, color: colors.textSecondary },
  modalKvValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  modalNote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, fontStyle: 'italic' },
  modalWarn: { fontSize: 12, color: '#f59e0b', marginTop: 8, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },
  modalConfirmBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: colors.accent },
  modalConfirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resultBanner: { marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: colors.bgPrimary },
  resultText: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
}));
