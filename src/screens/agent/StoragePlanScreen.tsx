import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { getStorageInfo, upgradeStoragePlan, StorageTier } from '../../services/openclaw.service';

const TIER_COLORS: Record<StorageTier, string> = {
  free: '#22c55e',
  starter: '#7c3aed',
  pro: '#0ea5e9',
};

const TIER_LABELS: Record<StorageTier, string> = {
  free: 'Early Access',
  starter: 'Starter',
  pro: 'Pro',
};

const STATIC_PLANS = [
  {
    tier: 'free' as StorageTier,
    storageGb: 10,
    priceUsdPerMonth: 0,
    label: '10 GB Free',
    highlight: false,
    perks: [
      '10 GB cloud storage',
      '1 cloud Agent instance',
      'Unlimited local & BYOC',
      '5200+ Skill Market',
    ],
    ctaLabel: 'Current Plan',
    ctaDisabled: true,
  },
  {
    tier: 'starter' as StorageTier,
    storageGb: 40,
    priceUsdPerMonth: 4.9,
    label: '40 GB Starter',
    highlight: true,
    perks: [
      '40 GB cloud storage',
      '3 cloud Agent instances',
      'Priority LLM queue',
      'Paid Skill call credits',
    ],
    ctaLabel: 'Upgrade · $4.9/mo',
    ctaDisabled: false,
  },
  {
    tier: 'pro' as StorageTier,
    storageGb: 100,
    priceUsdPerMonth: 12,
    label: '100 GB Pro',
    highlight: false,
    perks: [
      '100 GB cloud storage',
      '10 cloud Agent instances',
      'Team collaboration (5 members)',
      'Advanced analytics & logs',
    ],
    ctaLabel: 'Upgrade · $12/mo',
    ctaDisabled: false,
  },
];

export function StoragePlanScreen() {
  const [upgrading, setUpgrading] = useState<StorageTier | null>(null);

  const { data: storageInfo, isLoading } = useQuery({
    queryKey: ['storage-info'],
    queryFn: getStorageInfo,
    retry: 1,
  });

  const currentTier: StorageTier = storageInfo?.tier ?? 'free';
  const usedGb = storageInfo?.usedGb ?? 0;
  const totalGb = storageInfo?.totalGb ?? 10;
  const usedPercent = storageInfo?.usedPercent ?? 0;

  const handleUpgrade = async (tier: StorageTier) => {
    try {
      setUpgrading(tier);
      const result = await upgradeStoragePlan(tier);
      await Linking.openURL(result.checkoutUrl);
    } catch (e: any) {
      Alert.alert('Upgrade Failed', e?.message || 'Please try again later.');
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Current usage */}
      <View style={styles.usageCard}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageTitle}>Storage Usage</Text>
          <View style={[styles.tierBadge, { backgroundColor: TIER_COLORS[currentTier] + '22' }]}>
            <Text style={[styles.tierBadgeText, { color: TIER_COLORS[currentTier] }]}>
              {TIER_LABELS[currentTier]}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : (
          <>
            <View style={styles.bar}>
              <View style={[styles.barFill, {
                width: `${Math.min(usedPercent, 100)}%` as any,
                backgroundColor: usedPercent > 80 ? '#ef4444' : TIER_COLORS[currentTier],
              }]} />
            </View>
            <Text style={styles.usageSub}>
              {usedGb.toFixed(1)} GB used of {totalGb} GB
              {storageInfo?.isGiftStorage ? ' · 🎁 Early access gift' : ''}
            </Text>
          </>
        )}
      </View>

      {/* Plan cards */}
      <Text style={styles.sectionLabel}>STORAGE PLANS</Text>
      {STATIC_PLANS.map((plan) => {
        const isCurrentTier = plan.tier === currentTier;
        const accentColor = TIER_COLORS[plan.tier];
        const isUpgrading = upgrading === plan.tier;
        return (
          <View
            key={plan.tier}
            style={[
              styles.card,
              plan.highlight && styles.cardHighlight,
              isCurrentTier && { borderColor: accentColor + '55' },
            ]}
          >
            {plan.highlight && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
              </View>
            )}
            <View style={styles.cardHeader}>
              <Text style={[styles.storage, { color: isCurrentTier ? accentColor : colors.textPrimary }]}>
                {plan.storageGb} GB
              </Text>
              <Text style={styles.planName}>{plan.label}</Text>
            </View>
            <Text style={styles.price}>
              {plan.priceUsdPerMonth === 0 ? 'Free' : `$${plan.priceUsdPerMonth}`}
              {plan.priceUsdPerMonth > 0 && (
                <Text style={styles.priceSub}> / month</Text>
              )}
            </Text>
            <View style={styles.perks}>
              {plan.perks.map((perk, i) => (
                <Text key={i} style={styles.perk}>✓  {perk}</Text>
              ))}
            </View>
            {isCurrentTier ? (
              <View style={[styles.ctaDisabled, { borderColor: accentColor + '33' }]}>
                <Text style={[styles.ctaDisabledText, { color: accentColor }]}>✓ Current Plan</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.cta, plan.highlight ? styles.ctaPrimary : styles.ctaSecondary]}
                onPress={() => handleUpgrade(plan.tier)}
                disabled={isUpgrading}
              >
                {isUpgrading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.ctaText, !plan.highlight && { color: colors.textPrimary }]}>
                    {plan.ctaLabel}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <Text style={styles.footnote}>
        Upgrades are billed monthly and can be cancelled anytime. Storage increase applies immediately after payment.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  usageCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    marginBottom: 4,
  },
  usageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usageTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  tierBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  bar: {
    height: 8,
    backgroundColor: colors.bgPrimary,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  barFill: { height: '100%', borderRadius: 4 },
  usageSub: { fontSize: 12, color: colors.textSecondary },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardHighlight: {
    borderColor: '#7c3aed55',
    backgroundColor: '#7c3aed08',
  },
  popularBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  popularBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  storage: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  planName: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  price: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  priceSub: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  perks: { gap: 5, marginTop: 4 },
  perk: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  cta: { borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 6 },
  ctaPrimary: { backgroundColor: '#7c3aed' },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ctaDisabled: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1,
  },
  ctaDisabledText: { fontWeight: '700', fontSize: 15 },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 18,
    marginTop: 4,
  },
});
