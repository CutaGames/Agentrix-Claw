/**
 * 我的 → 套餐与模型 (D19): the plan structure and what is never charged, the same words as the web pricing
 * page (`src/services/planCopy.ts`, compared with the web source by a test).
 *
 * - No price, no checkout and no AXP discount: D19 keeps prices off until a real checkout works, and AXP has
 *   no fixed dollar value (DECISIONS). The old screen showed catalog dollar prices, "返现" / Auto-Earn and an
 *   AXP-for-dollars slider (the same problem desktop fixed in 273da444, REQ-desktop-055).
 * - The owner's current plan is read from `GET /v1/subscription`; unreadable = the line is left out.
 * - Links open the public site in the browser (`planUrl`), never an address from the server.
 */
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { fetchMySubscription, type SubscriptionTier } from '../../services/subscription.api';
import {
  AXP_NOTE,
  ESCROW_NOTE,
  NEVER_CHARGED,
  NEVER_CHARGED_TITLE,
  NO_PRICE_NOTE,
  PLAN_HIGHLIGHT_BADGE,
  PLANS,
  planUrl,
} from '../../services/planCopy';
import { themedStyles } from '../../theme/useTheme';

const TIER_LABELS: Record<SubscriptionTier, { en: string; zh: string }> = {
  free: { en: 'Free', zh: '免费' },
  lite: { en: 'Lite', zh: 'Lite' },
  plus: { en: 'Plus', zh: 'Plus' },
  pro: { en: 'Pro', zh: 'Pro' },
  elite: { en: 'Elite', zh: 'Elite' },
  enterprise: { en: 'Enterprise', zh: '企业' },
};

export function SubscribePlanScreen() {
  const { t } = useI18n();
  const currentQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: fetchMySubscription,
    staleTime: 60_000,
    retry: 1,
  });
  const currentTier = currentQ.data?.tier;
  const currentLabel = currentTier && TIER_LABELS[currentTier] ? t(TIER_LABELS[currentTier]) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="subscribe-plan-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Plans', zh: '套餐' })}
      </Text>
      {currentLabel ? (
        <Text style={styles.current} testID="subscribe-plan-current">
          {t({ en: `Your plan: ${currentLabel}`, zh: `你现在的档位：${currentLabel}` })}
        </Text>
      ) : null}

      {PLANS.map((plan) => (
        <View key={plan.key} style={[styles.card, plan.highlight && styles.cardHighlight]} testID={`plan-card-${plan.key}`}>
          {plan.highlight ? <Text style={styles.badge}>{t(PLAN_HIGHLIGHT_BADGE)}</Text> : null}
          <Text style={styles.planName} accessibilityRole="header">
            {t(plan.name)}
          </Text>
          <Text style={styles.planPrice}>{t(plan.price)}</Text>
          <Text style={styles.body}>{t(plan.description)}</Text>
          {plan.features.map((feature) => (
            <Text key={feature.en} style={styles.feature}>
              {'✓  '}
              {t(feature)}
            </Text>
          ))}
          {plan.cta && plan.path ? (
            <TouchableOpacity
              style={[styles.cta, plan.highlight && styles.ctaHighlight]}
              onPress={() => void Linking.openURL(planUrl(plan.path!))}
              accessibilityRole="link"
              testID={`plan-cta-${plan.key}`}
            >
              <Text style={[styles.ctaText, plan.highlight && styles.ctaTextHighlight]}>{t(plan.cta)}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <Text style={styles.note}>{t(ESCROW_NOTE)}</Text>
      <Text style={styles.smallNote}>{t(NO_PRICE_NOTE)}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t(NEVER_CHARGED_TITLE)}
        </Text>
        {NEVER_CHARGED.map((item) => (
          <Text key={item.en} style={styles.feature}>
            {'✓  '}
            {t(item)}
          </Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          AXP
        </Text>
        <Text style={styles.body}>{t(AXP_NOTE)}</Text>
      </View>

      <TouchableOpacity
        style={styles.link}
        onPress={() => void Linking.openURL(planUrl('/pricing'))}
        accessibilityRole="link"
        testID="plan-pricing-page"
      >
        <Text style={styles.linkText}>{t({ en: 'The pricing page on the web', zh: '网页上的价格页' })}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  current: { fontSize: 14, color: colors.textSecondary, marginBottom: 14 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHighlight: { borderColor: colors.accent, borderWidth: 2 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  planName: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  planPrice: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 6 },
  body: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 8 },
  feature: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },
  cta: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaHighlight: { backgroundColor: colors.accent, borderColor: colors.accent },
  ctaText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  ctaTextHighlight: { color: colors.onAccent },
  note: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
  smallNote: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: 8, textAlign: 'center' },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 16,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  link: { marginTop: 18, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.accent },
}));
