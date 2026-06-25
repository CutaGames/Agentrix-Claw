/**
 * AxpCenterScreen — real implementation (Sprint C3-C4).
 *
 * Shows balance, 7-day delta, full earn/spend/expire ledger. Pull-to-refresh.
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §4.
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchAxpBalance,
  fetchAxpHistory,
  AxpLedgerEntry,
  AxpBalanceView,
} from '../../services/axp.api';
import { themedStyles } from '../../theme/useTheme';

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function directionIcon(d: AxpLedgerEntry['direction']): string {
  switch (d) {
    case 'earn': return '📈';
    case 'spend': return '🛒';
    case 'expire': return '⏳';
    case 'adjust': return '⚙️';
    default: return '•';
  }
}

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

export function AxpCenterScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  const balanceQ = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    staleTime: 30_000,
    retry: 1,
  });

  const historyQ = useQuery({
    queryKey: ['axp-history'],
    queryFn: () => fetchAxpHistory(50),
    staleTime: 30_000,
    retry: 1,
  });

  const onRefresh = useCallback(() => {
    balanceQ.refetch();
    historyQ.refetch();
  }, [balanceQ, historyQ]);

  const balance = balanceQ.data;
  const items = historyQ.data?.items ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={balanceQ.isRefetching || historyQ.isRefetching}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>💎 {t({ en: 'AXP Center', zh: 'AXP 中心' })}</Text>

      {balanceQ.isLoading && !balance ? (
        <View style={styles.balanceCard}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <BalanceBlock balance={balance} t={t} />
      )}

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('PetEarnings')}
      >
        <Text style={styles.actionBtnText}>
          💰 {t({ en: 'Earnings Center', zh: '收益中心（含集市/USDT）' })}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => navigation.navigate('AxpRewardShop')}
      >
        <Text style={styles.actionBtnText}>
          🛍 {t({ en: 'Open Redeem Shop', zh: '兑换中心' })}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionHeader}>
        {t({ en: 'Recent Activity', zh: '最近记录' })}
      </Text>

      {historyQ.isLoading && items.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.accent} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>
          {t({
            en: 'No AXP activity yet. Sign in daily, chat with your pet, and invite friends.',
            zh: '还没有 AXP 记录。每日签到、陪伴主宠、邀请好友即可获得。',
          })}
        </Text>
      ) : (
        items.map((entry) => <LedgerRow key={entry.id} entry={entry} t={t} />)
      )}

      <Text style={styles.footer}>
        {t({
          en: '1 AXP = $0.001 · expires 12 months from earn date.',
          zh: '1 AXP = $0.001 · 获得后 12 个月过期。',
        })}
      </Text>
      <Text style={styles.disclaimer}>
        {t({
          en: 'AXP is a platform-internal reward. It is NOT a currency, NOT a security, and CANNOT be exchanged for fiat or transferred between accounts. Redemption is at Agentrix discretion.',
          zh: 'AXP 是平台内部积分，不是货币、不是证券，不能与法币双向兑换，也不能在账户之间转账。兑换权益由 Agentrix 最终解释。',
        })}
      </Text>
    </ScrollView>
  );
}

function BalanceBlock({
  balance,
  t,
}: {
  balance: AxpBalanceView | undefined;
  t: any;
}) {
  const bal = balance?.balance ?? 0;
  const usd = balance?.usd_value_cents ?? 0;
  return (
    <View style={styles.balanceCard}>
      <Text style={styles.balanceLabel}>{t({ en: 'Balance', zh: '余额' })}</Text>
      <Text style={styles.balanceValue}>{bal.toLocaleString()}</Text>
      <Text style={styles.balanceSub}>≈ {formatUsd(usd)}</Text>
      <View style={styles.statsRow}>
        <Stat label={t({ en: 'Earned', zh: '累计赚取' })} value={balance?.lifetime_earned ?? 0} />
        <Stat label={t({ en: 'Spent', zh: '累计消耗' })} value={balance?.lifetime_spent ?? 0} />
        <Stat label={t({ en: 'Expired', zh: '已过期' })} value={balance?.lifetime_expired ?? 0} />
      </View>
    </View>
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

function LedgerRow({ entry, t }: { entry: AxpLedgerEntry; t: any }) {
  const sign = entry.direction === 'earn' || (entry.direction === 'adjust' && entry.amount > 0) ? '+' : '-';
  const color =
    entry.direction === 'earn'
      ? '#22c55e'
      : entry.direction === 'expire'
        ? colors.textMuted
        : '#ef4444';
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{directionIcon(entry.direction)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowSource}>{entry.source}</Text>
        {entry.note ? <Text style={styles.rowNote}>{entry.note}</Text> : null}
        <Text style={styles.rowTime}>{formatTime(entry.created_at)}</Text>
      </View>
      <Text style={[styles.rowAmount, { color }]}>
        {sign}
        {entry.amount.toLocaleString()}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  balanceCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    minHeight: 160,
  },
  balanceLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  balanceValue: { fontSize: 40, fontWeight: '800', color: colors.accent, marginBottom: 4 },
  balanceSub: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  actionBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: { fontSize: 18 },
  rowSource: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  rowNote: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowTime: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '700' },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 20,
    opacity: 0.6,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 8,
    paddingHorizontal: 12,
    lineHeight: 14,
    opacity: 0.55,
  },
}));
