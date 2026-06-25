/**
 * AgentEconomicStatusScreen — GET /agent-accounts/:id/economic-status.
 * Renders wallet / limit / credit / on-chain / capabilities REAL status enums
 * (enabled / not_enabled / failed). Shows 「未启用」 for not_enabled and an
 * explicit failed state — never empty placeholders (design Property 8).
 *
 * Agent id resolution order: route param → active instance's agentAccountId.
 */
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchAgentEconomicStatus,
  type AgentEconomicStatus,
  type CapabilityStatus,
} from '../../services/agentOpsApi';
import type { MeStackParamList } from '../../navigation/types';

type EcoRoute = RouteProp<MeStackParamList, 'AgentOpsEconomicStatus'>;

export function AgentEconomicStatusScreen() {
  const route = useRoute<EcoRoute>();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const activeInstance = useAuthStore((s) => s.activeInstance);
  const agentId =
    route.params?.agentId ??
    activeInstance?.agentAccountId ??
    activeInstance?.metadata?.agentAccountId;

  const statusQ = useQuery({
    queryKey: ['agent-economic-status', agentId],
    queryFn: () => fetchAgentEconomicStatus(agentId as string),
    enabled: !!agentId,
    retry: 1,
  });

  if (!agentId) {
    return (
      <View style={[styles.container, styles.centered]} testID="ao-economic-status-screen">
        <Text style={styles.empty}>
          {t({
            en: 'No agent account is linked yet. Deploy or connect an agent first.',
            zh: '尚未绑定 Agent 账户。请先部署或连接一个 Agent。',
          })}
        </Text>
      </View>
    );
  }

  const s = statusQ.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="ao-economic-status-screen"
      refreshControl={<RefreshControl refreshing={statusQ.isFetching} onRefresh={() => statusQ.refetch()} tintColor={c.accent} />}
    >
      {statusQ.isLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
      ) : statusQ.isError || !s ? (
        <Text style={styles.empty}>{t({ en: 'Failed to load economic status.', zh: '加载经济身份状态失败。' })}</Text>
      ) : (
        <Content s={s} styles={styles} c={c} t={t} />
      )}
    </ScrollView>
  );
}

function Content({
  s, styles, c, t,
}: {
  s: AgentEconomicStatus;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
}) {
  return (
    <>
      <Text style={styles.agentName}>{s.agentName || s.agentId}</Text>

      {/* Wallet */}
      <StatusCard
        icon="👛"
        title={t({ en: 'Wallet', zh: '钱包' })}
        status={s.wallet.status}
        styles={styles}
        c={c}
        t={t}
        testID="ao-eco-wallet"
        rows={[
          { label: t({ en: 'Address', zh: '地址' }), value: s.wallet.address ? `${s.wallet.address.slice(0, 8)}…${s.wallet.address.slice(-6)}` : null },
          { label: t({ en: 'Custody', zh: '托管' }), value: s.wallet.custody ?? null },
        ]}
        detail={s.wallet.detail}
      />

      {/* Limit */}
      <StatusCard
        icon="📈"
        title={t({ en: 'Spending limit', zh: '支出限额' })}
        status={s.limit.status}
        styles={styles}
        c={c}
        t={t}
        testID="ao-eco-limit"
        rows={[
          { label: t({ en: 'Daily', zh: '每日' }), value: fmtUsd(s.limit.usedTodayUsd, s.limit.dailyLimitUsd) },
          { label: t({ en: 'Monthly', zh: '每月' }), value: fmtUsd(s.limit.usedMonthUsd, s.limit.monthlyLimitUsd) },
        ]}
        detail={s.limit.detail}
      />

      {/* Credit */}
      <StatusCard
        icon="🎯"
        title={t({ en: 'Credit', zh: '信用' })}
        status={s.credit.status}
        styles={styles}
        c={c}
        t={t}
        testID="ao-eco-credit"
        rows={[
          { label: t({ en: 'Score', zh: '信用分' }), value: s.credit.creditScore != null ? String(s.credit.creditScore) : null },
          { label: t({ en: 'Risk', zh: '风险等级' }), value: s.credit.riskLevel ?? null },
        ]}
        detail={s.credit.detail}
      />

      {/* On-chain */}
      <StatusCard
        icon="⛓️"
        title={t({ en: 'On-chain identity', zh: '链上身份' })}
        status={s.onchain.status}
        styles={styles}
        c={c}
        t={t}
        testID="ao-eco-onchain"
        rows={[
          { label: t({ en: 'Chain', zh: '链' }), value: s.onchain.chain ?? null },
          { label: t({ en: 'Registry', zh: '注册表' }), value: s.onchain.registry ?? null },
          { label: t({ en: 'Tx', zh: '交易' }), value: s.onchain.txHash ? `${s.onchain.txHash.slice(0, 10)}…` : null },
        ]}
        detail={s.onchain.detail}
      />

      {/* Capabilities */}
      <View style={styles.capCard} testID="ao-eco-capabilities">
        <Text style={styles.capTitle}>{t({ en: 'Capabilities', zh: '能力' })}</Text>
        {s.capabilities?.length ? (
          s.capabilities.map((cap) => (
            <View key={cap.key} style={styles.capRow}>
              <Text style={styles.capKey}>{cap.key}</Text>
              <StatusBadge status={cap.status} c={c} styles={styles} t={t} />
            </View>
          ))
        ) : (
          <Text style={styles.empty}>{t({ en: 'No capabilities reported.', zh: '未上报能力。' })}</Text>
        )}
      </View>
    </>
  );
}

function StatusCard({
  icon, title, status, rows, detail, styles, c, t, testID,
}: {
  icon: string;
  title: string;
  status: CapabilityStatus;
  rows: Array<{ label: string; value: string | null }>;
  detail?: string;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
  testID?: string;
}) {
  const enabled = status === 'enabled';
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{icon} {title}</Text>
        <StatusBadge status={status} c={c} styles={styles} t={t} />
      </View>
      {enabled ? (
        rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Text style={[styles.rowValue, r.value == null && styles.rowValueMissing]}>
              {r.value == null ? t({ en: 'n/a', zh: '无' }) : r.value}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.notEnabledText}>
          {status === 'failed'
            ? t({ en: 'Failed — needs attention.', zh: '失败——需要处理。' })
            : t({ en: 'Not enabled (未启用).', zh: '未启用。' })}
          {detail ? ` ${detail}` : ''}
        </Text>
      )}
      {enabled && detail ? <Text style={styles.detailText}>{detail}</Text> : null}
    </View>
  );
}

function StatusBadge({
  status, c, styles, t,
}: {
  status: CapabilityStatus;
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  t: (d: { en: string; zh: string }) => string;
}) {
  const map: Record<CapabilityStatus, { color: string; label: string }> = {
    enabled: { color: c.success, label: t({ en: 'Enabled', zh: '已启用' }) },
    not_enabled: { color: c.textMuted, label: t({ en: 'Not enabled', zh: '未启用' }) },
    failed: { color: c.error, label: t({ en: 'Failed', zh: '失败' }) },
  };
  const { color, label } = map[status] ?? map.not_enabled;
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function fmtUsd(used?: number | null, limit?: number | null): string | null {
  if (used == null && limit == null) return null;
  const u = used != null ? `$${used.toFixed(2)}` : '$0';
  const l = limit != null ? `$${limit.toFixed(2)}` : '∞';
  return `${u} / ${l}`;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    centered: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', padding: 24, lineHeight: 19 },
    agentName: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
    rowLabel: { fontSize: 13, color: c.textMuted },
    rowValue: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    rowValueMissing: { color: c.textMuted, fontWeight: '400' },
    notEnabledText: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
    detailText: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    capCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: c.border },
    capTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    capRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    capKey: { fontSize: 13, color: c.textSecondary, flex: 1 },
  });
}
