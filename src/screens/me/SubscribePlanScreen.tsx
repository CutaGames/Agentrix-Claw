/**
 * SubscribePlanScreen — real catalog (Sprint D2).
 *
 * Stripe checkout hand-off is still TODO (deferred to Sprint D2 backend
 * wiring). This screen renders the real catalog + shows the user's
 * current tier with a clear upgrade CTA.
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §3.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchSubscriptionCatalog,
  fetchMySubscription,
  SubscriptionTier,
  TierCatalogEntry,
  SubscriptionView,
} from '../../services/subscription.api';

function formatPrice(cents: number): string {
  if (cents < 0) return 'Contact';
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

const TIER_ACCENTS: Record<SubscriptionTier, string> = {
  free: '#9ca3af',
  lite: '#60a5fa',
  plus: '#a78bfa',
  pro: '#f472b6',
  elite: '#fbbf24',
  enterprise: '#f97316',
};

const TIER_LABELS: Record<SubscriptionTier, { en: string; zh: string }> = {
  free: { en: 'Free', zh: '免费' },
  lite: { en: 'Lite', zh: 'Lite' },
  plus: { en: 'Plus', zh: 'Plus' },
  pro: { en: 'Pro', zh: 'Pro' },
  elite: { en: 'Elite', zh: 'Elite' },
  enterprise: { en: 'Enterprise', zh: '企业' },
};

const TIER_BLURB: Record<SubscriptionTier, { en: string; zh: string }> = {
  free: { en: 'Try everything · small quotas · AXP rewards', zh: '所有功能可试 · 小配额 · 获得 AXP' },
  lite: { en: 'Remove hard limits · 5% AXP cashback', zh: '去除硬限 · 5% AXP 返现' },
  plus: { en: 'Golden tier · 10% cashback · auto-earn · guild', zh: '黄金档 · 10% 返现 · Auto-Earn · 公会' },
  pro: { en: 'Core tier · full dev toolkit · 15% cashback · L3 co-sign', zh: '核心 · 全开发者套件 · 15% 返现 · L3 协签' },
  elite: { en: 'Flagship · 0% fees · Pet SDK beta · 20% cashback', zh: '旗舰 · 0 手续费 · Pet SDK · 20% 返现' },
  enterprise: { en: 'Private deploy · SSO · SLA · custom branding', zh: '私有部署 · SSO · SLA · 白标' },
};

export function SubscribePlanScreen() {
  const { t } = useI18n();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');

  const catalogQ = useQuery({
    queryKey: ['subscription-catalog'],
    queryFn: fetchSubscriptionCatalog,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const currentQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: fetchMySubscription,
    staleTime: 60_000,
    retry: 1,
  });

  const tiers = catalogQ.data?.tiers ?? [];
  const current = currentQ.data;

  const onSelectTier = useCallback(
    (tier: SubscriptionTier) => {
      if (tier === 'free') {
        Alert.alert(
          t({ en: 'Free tier', zh: '免费档' }),
          t({
            en: 'You are already on the free tier.',
            zh: '你当前就是免费档。',
          }),
        );
        return;
      }
      if (tier === 'enterprise') {
        Alert.alert(
          t({ en: 'Enterprise', zh: '企业合同' }),
          t({
            en: 'Contact sales@agentrix.top for a custom quote.',
            zh: '联系 sales@agentrix.top 定制合同。',
          }),
        );
        return;
      }
      Alert.alert(
        t({ en: 'Subscribe', zh: '订阅' }),
        t({
          en: 'Stripe checkout will be wired in Sprint D2 — you will be redirected to secure payment.',
          zh: 'Stripe 付款跳转将于 Sprint D2 接入，点击后会跳转到安全支付页。',
        }),
      );
    },
    [t],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t({ en: 'Choose your plan', zh: '选择你的订阅' })}</Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'All abilities are available at every tier. Quotas scale with you.',
          zh: '所有能力在每档都开放 · 配额随订阅升级',
        })}
      </Text>

      {/* Cycle toggle */}
      <View style={styles.cycleToggle}>
        <TouchableOpacity
          style={[styles.cycleBtn, cycle === 'monthly' && styles.cycleBtnActive]}
          onPress={() => setCycle('monthly')}
        >
          <Text style={[styles.cycleBtnText, cycle === 'monthly' && styles.cycleBtnTextActive]}>
            {t({ en: 'Monthly', zh: '月付' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cycleBtn, cycle === 'yearly' && styles.cycleBtnActive]}
          onPress={() => setCycle('yearly')}
        >
          <Text style={[styles.cycleBtnText, cycle === 'yearly' && styles.cycleBtnTextActive]}>
            {t({ en: 'Yearly · save ~17%', zh: '年付 · 约省 17%' })}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Current tier banner */}
      {current ? (
        <View style={styles.currentBanner}>
          <Text style={styles.currentLabel}>
            {t({ en: 'Current plan', zh: '当前档位' })}
          </Text>
          <Text style={styles.currentTier}>
            {t(TIER_LABELS[current.tier])}{' '}
            <Text style={{ fontSize: 12, color: colors.textMuted }}>· {current.status}</Text>
          </Text>
        </View>
      ) : null}

      {catalogQ.isLoading && tiers.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        tiers.map((entry) => (
          <TierCard
            key={entry.tier}
            entry={entry}
            cycle={cycle}
            isCurrent={current?.tier === entry.tier}
            onSelect={() => onSelectTier(entry.tier)}
            t={t}
          />
        ))
      )}

      <Text style={styles.footer}>
        {t({
          en: 'Prices in USD. Year = 10 months discounted. Cancel anytime.',
          zh: '价格为美元 · 年付享 10 个月价格 · 可随时取消',
        })}
      </Text>
    </ScrollView>
  );
}

function TierCard({
  entry,
  cycle,
  isCurrent,
  onSelect,
  t,
}: {
  entry: TierCatalogEntry;
  cycle: 'monthly' | 'yearly';
  isCurrent: boolean;
  onSelect: () => void;
  t: any;
}) {
  const price =
    cycle === 'monthly' ? entry.pricing.monthly_cents : entry.pricing.yearly_cents;
  const accent = TIER_ACCENTS[entry.tier];
  return (
    <View style={[styles.card, { borderColor: accent + '66' }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.tierName, { color: accent }]}>
          {t(TIER_LABELS[entry.tier])}
        </Text>
        <Text style={styles.tierPrice}>
          {formatPrice(price)}
          <Text style={styles.tierUnit}>
            {price > 0 ? (cycle === 'monthly' ? '/mo' : '/yr') : ''}
          </Text>
        </Text>
      </View>
      <Text style={styles.tierBlurb}>{t(TIER_BLURB[entry.tier])}</Text>
      <View style={styles.quotaRow}>
        <Quota label="LLM" value={quotaValue(entry.quota.llm_budget_cents_monthly, 'cents')} />
        <Quota label={t({ en: 'Pets', zh: '主宠' })} value={quotaValue(entry.quota.pets_max)} />
        <Quota label={t({ en: 'Devices', zh: '设备' })} value={quotaValue(entry.quota.devices_max)} />
        <Quota label={t({ en: 'Fee', zh: '拍卖费' })} value={`${entry.quota.auction_fee_bps / 100}%`} />
      </View>
      <TouchableOpacity
        style={[styles.selectBtn, isCurrent && styles.selectBtnDisabled, { backgroundColor: isCurrent ? colors.border : accent }]}
        onPress={onSelect}
        disabled={isCurrent}
      >
        <Text style={styles.selectBtnText}>
          {isCurrent
            ? t({ en: 'Current', zh: '当前' })
            : entry.tier === 'enterprise'
              ? t({ en: 'Contact sales', zh: '联系销售' })
              : entry.tier === 'free'
                ? t({ en: 'Default', zh: '默认' })
                : t({ en: 'Choose', zh: '选择' })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Quota({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quotaCell}>
      <Text style={styles.quotaLabel}>{label}</Text>
      <Text style={styles.quotaValue}>{value}</Text>
    </View>
  );
}

function quotaValue(v: number, format: 'default' | 'cents' = 'default'): string {
  if (v < 0) return '∞';
  if (format === 'cents') {
    if (v === 0) return '$0';
    return `$${(v / 100).toFixed(v < 100 ? 2 : 0)}`;
  }
  return v.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
  },
  cycleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  cycleBtnActive: { backgroundColor: colors.accent },
  cycleBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  cycleBtnTextActive: { color: '#fff' },
  currentBanner: {
    backgroundColor: colors.accent + '20',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent + '55',
  },
  currentLabel: { fontSize: 11, color: colors.textMuted },
  currentTier: { fontSize: 16, fontWeight: '700', color: colors.accent, marginTop: 2 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tierName: { fontSize: 18, fontWeight: '800' },
  tierPrice: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  tierUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  tierBlurb: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 12 },
  quotaRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  quotaCell: { flex: 1 },
  quotaLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 2 },
  quotaValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  selectBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  selectBtnDisabled: {},
  selectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 20,
    opacity: 0.7,
  },
});
