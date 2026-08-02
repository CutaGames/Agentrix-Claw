/**
 * SubscribePlanScreen — subscription catalog + AXP discount slider.
 *
 * Tiers: Free / Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69.
 * AXP discount section uses a custom Pressable + Animated slider (no
 * external slider dependency). Max 20% of subscription price can be
 * offset by AXP (1 AXP = $0.001).
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §3.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { fetchAxpBalance } from '../../services/axp.api';
import { showAxpToast } from '../../stores/axpToastStore';
import {
  fetchSubscriptionCatalog,
  fetchMySubscription,
  SubscriptionTier,
  TierCatalogEntry,
} from '../../services/subscription.api';
import { themedStyles } from '../../theme/useTheme';

// ── Constants ─────────────────────────────────────────────────

const CYAN = '#22d3ee';

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

// ── Custom Slider Component ───────────────────────────────────

interface AxpSliderProps {
  value: number;
  maxValue: number;
  onValueChange: (v: number) => void;
}

function AxpSlider({ value, maxValue, onValueChange }: AxpSliderProps) {
  const trackWidth = useRef(0);
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gestureState) => {
        // Calculate position from touch
        const ratio = Math.max(0, Math.min(1, gestureState.x0 / (trackWidth.current || 1)));
        const newVal = Math.round(ratio * maxValue);
        onValueChange(Math.min(newVal, maxValue));
      },
      onPanResponderMove: (_, gestureState) => {
        if (trackWidth.current === 0) return;
        const ratio = Math.max(0, Math.min(1, gestureState.moveX / (trackWidth.current || 1)));
        const newVal = Math.round(ratio * maxValue);
        onValueChange(Math.min(newVal, maxValue));
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const progress = maxValue > 0 ? value / maxValue : 0;

  return (
    <View style={sliderStyles.container} onLayout={onLayout} {...panResponder.panHandlers}>
      {/* Track background */}
      <View style={sliderStyles.track}>
        {/* Filled track */}
        <View style={[sliderStyles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
      {/* Thumb */}
      <View
        style={[
          sliderStyles.thumb,
          { left: `${progress * 100}%`, marginLeft: -12 },
        ]}
      />
    </View>
  );
}

const sliderStyles = themedStyles(() => StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
    marginVertical: 8,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: CYAN,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CYAN,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
}));

// ── Main Screen ───────────────────────────────────────────────

export function SubscribePlanScreen() {
  const { t } = useI18n();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [axpToApply, setAxpToApply] = useState(0);

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

  const axpBalanceQ = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    staleTime: 30_000,
    retry: 1,
  });

  const tiers = catalogQ.data?.tiers ?? [];
  const current = currentQ.data;
  const axpBalance = axpBalanceQ.data?.balance ?? 0;

  // Selected tier for AXP discount calculation
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const selectedEntry = tiers.find((e) => e.tier === selectedTier);
  const selectedPriceCents = selectedEntry
    ? cycle === 'monthly'
      ? selectedEntry.pricing.monthly_cents
      : selectedEntry.pricing.yearly_cents
    : 0;

  // 20% cap: max AXP usable = min(balance, 20% of price in AXP)
  // 1 AXP = $0.001 → price in AXP = priceCents / 0.1
  const priceInAxp = selectedPriceCents > 0 ? Math.floor(selectedPriceCents / 0.1) : 0;
  const maxAxpDiscount = Math.min(axpBalance, Math.floor(priceInAxp * 0.2));
  const discountPct = priceInAxp > 0 ? (axpToApply / priceInAxp) * 100 : 0;

  const onSelectTier = useCallback(
    (tier: SubscriptionTier) => {
      if (tier === 'free') {
        Alert.alert(
          t({ en: 'Free tier', zh: '免费档' }),
          t({ en: 'You are already on the free tier.', zh: '你当前就是免费档。' }),
        );
        return;
      }
      if (tier === 'enterprise') {
        Alert.alert(
          t({ en: 'Enterprise', zh: '企业合同' }),
          t({ en: 'Contact sales@agentrix.top for a custom quote.', zh: '联系 sales@agentrix.top 定制合同。' }),
        );
        return;
      }
      setSelectedTier(tier);
      setAxpToApply(0);
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

      {/* Tier cards */}
      {catalogQ.isLoading && tiers.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        tiers.map((entry) => (
          <TierCard
            key={entry.tier}
            entry={entry}
            cycle={cycle}
            isCurrent={current?.tier === entry.tier}
            isSelected={selectedTier === entry.tier}
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

      {/* ── 💎 Use AXP to save ────────────────────────────── */}
      <View style={styles.axpSection}>
        <Text style={styles.axpSectionTitle}>
          💎 {t({ en: 'Use AXP to save', zh: '使用 AXP 抵扣' })}
        </Text>

        {/* Balance display */}
        <View style={styles.axpBalanceRow}>
          <Text style={styles.axpBalanceLabel}>
            {t({ en: 'Current AXP Balance', zh: '当前 AXP 余额' })}
          </Text>
          <Text style={styles.axpBalanceValue}>
            {axpBalance.toLocaleString()} AXP
          </Text>
        </View>

        {axpBalance === 0 ? (
          /* Disabled state */
          <View style={styles.axpDisabledBox}>
            <Text style={styles.axpDisabledText}>
              {t({
                en: 'Earn AXP through daily check-in, chatting, and co-raising',
                zh: '通过每日签到、聊天和共养来获取 AXP',
              })}
            </Text>
          </View>
        ) : selectedTier && selectedPriceCents > 0 ? (
          /* Active slider state */
          <>
            <Text style={styles.axpDesc}>
              {t({
                en: `Apply AXP to save on your ${selectedTier.toUpperCase()} subscription (max 20% of price).`,
                zh: `使用 AXP 抵扣 ${selectedTier.toUpperCase()} 订阅费用（最多抵扣 20%）。`,
              })}
            </Text>

            {/* Custom slider */}
            <AxpSlider
              value={axpToApply}
              maxValue={maxAxpDiscount}
              onValueChange={setAxpToApply}
            />

            {/* Slider labels */}
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>0%</Text>
              <Text style={styles.sliderLabelText}>20%</Text>
            </View>

            {/* Discount info */}
            <View style={styles.axpDiscountInfo}>
              <Text style={styles.axpDiscountText}>
                {t({
                  en: `Apply ${axpToApply} AXP = ${discountPct.toFixed(1)}% off`,
                  zh: `使用 ${axpToApply} AXP = 抵扣 ${discountPct.toFixed(1)}%`,
                })}
              </Text>
            </View>
          </>
        ) : (
          /* No tier selected */
          <Text style={styles.axpDesc}>
            {t({
              en: 'Select a paid tier above to apply AXP discount.',
              zh: '选择上方的付费档位后可使用 AXP 折扣。',
            })}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// ── Tier Card ─────────────────────────────────────────────────

function TierCard({
  entry,
  cycle,
  isCurrent,
  isSelected,
  onSelect,
  t,
}: {
  entry: TierCatalogEntry;
  cycle: 'monthly' | 'yearly';
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: () => void;
  t: (desc: string | { en: string; zh: string }) => string;
}) {
  const price =
    cycle === 'monthly' ? entry.pricing.monthly_cents : entry.pricing.yearly_cents;
  const accent = TIER_ACCENTS[entry.tier];

  return (
    <View
      style={[
        styles.card,
        { borderColor: isSelected ? accent : accent + '44' },
        isSelected && { borderWidth: 2 },
      ]}
    >
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
        style={[
          styles.selectBtn,
          isCurrent && styles.selectBtnDisabled,
          { backgroundColor: isCurrent ? colors.border : accent },
        ]}
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

// ── Styles ────────────────────────────────────────────────────

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },

  // Cycle toggle
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

  // Current banner
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

  // Tier card
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

  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 20,
    opacity: 0.7,
  },

  // ── AXP Discount Section ────────────────────────────────
  axpSection: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CYAN + '44',
    marginTop: 24,
  },
  axpSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  axpBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '66',
  },
  axpBalanceLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  axpBalanceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: CYAN,
  },
  axpDesc: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 8,
  },
  axpDisabledBox: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  axpDisabledText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderLabelText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  axpDiscountInfo: {
    backgroundColor: CYAN + '15',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CYAN + '33',
  },
  axpDiscountText: {
    fontSize: 14,
    fontWeight: '600',
    color: CYAN,
  },
}));
