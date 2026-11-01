/**
 * DisclosureCardsScreen — 我的东西 → 待批准的地点和时间 (L9 S16, `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED=1`; deviceAssets.ts).
 *
 * The approval cards waiting for the owner: a buyer asked for the pickup point or a meeting time. Each card is approved
 * (optionally with the exact place or time typed in) or denied, one at a time; there is no "always allow". The answer
 * replaces the card in place; the list is not read again.
 */
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  DEVICE_ASSETS_CARDS_COPY,
  DEVICE_ASSETS_CARD_FIELD_COPY,
  DEVICE_ASSETS_CARD_STATUS_COPY,
  DEVICE_ASSETS_MOBILE_FAILURE_COPY,
  type DeviceAssetsMobileFailure,
} from '../../services/deviceAssets';
import { DEVICE_ASSETS_QUERY_KEY, mobileDeviceAssetsClient } from '../../services/deviceAssetsRuntime';
import { RESALE_LISTING_LIMITS_V1, type ResaleDisclosureCardOwnerViewV1 } from '../../../shared/types/resale';

export function DisclosureCardsScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const signedIn = useAuthStore((state) => !!state.token);
  const client = React.useMemo(() => mobileDeviceAssetsClient(), []);
  const cards = useQuery({
    queryKey: [...DEVICE_ASSETS_QUERY_KEY, 'cards', 'pending'],
    queryFn: () => client.listCards({ status: 'pending' }),
    enabled: signedIn,
    retry: 0,
  });
  const [answered, setAnswered] = React.useState<Record<string, ResaleDisclosureCardOwnerViewV1>>({});
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [failures, setFailures] = React.useState<Record<string, DeviceAssetsMobileFailure>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const result = cards.data;
  const items = result?.ok === true ? result.value.items.map((card) => answered[card.cardRef] ?? card) : [];

  const decide = async (card: ResaleDisclosureCardOwnerViewV1, decision: 'approve' | 'deny') => {
    setBusy(card.cardRef);
    setFailures((current) => {
      const next = { ...current };
      delete next[card.cardRef];
      return next;
    });
    try {
      const value = decision === 'approve' ? values[card.cardRef] : undefined;
      const answer = await client.decideCard(card.cardRef, value ? { decision, value } : { decision });
      if (answer.ok === true) setAnswered((current) => ({ ...current, [card.cardRef]: answer.value }));
      else setFailures((current) => ({ ...current, [card.cardRef]: answer.failure }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={cards.isRefetching}
          onRefresh={() => {
            setAnswered({});
            void cards.refetch();
          }}
        />
      }
      testID="disclosure-cards-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Places and times to approve', zh: '待批准的地点和时间' })}
      </Text>
      <Text style={styles.muted}>{t(DEVICE_ASSETS_CARDS_COPY.explain)}</Text>
      {cards.isLoading ? <ActivityIndicator /> : null}
      {result?.ok === false ? (
        <View style={styles.notice} testID={`disclosure-cards-failure-${result.failure}`}>
          <Text style={styles.noticeText}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[result.failure])}</Text>
        </View>
      ) : null}
      {result?.ok === true && items.length === 0 ? (
        <Text style={styles.muted} testID="disclosure-cards-empty">
          {t({ en: 'Nothing is waiting for you.', zh: '没有等你批准的。' })}
        </Text>
      ) : null}
      {items.map((card) => {
        const pending = card.status === 'pending';
        const failure = failures[card.cardRef];
        return (
          <View key={card.cardRef} style={styles.card} testID={`disclosure-card-${card.cardRef}`}>
            <Text style={styles.cardTitle}>{card.listingTitle}</Text>
            <Text style={styles.body}>
              {`${card.buyerLabel} ${t({ zh: '想知道', en: 'asks for the' })} ${t(DEVICE_ASSETS_CARD_FIELD_COPY[card.field])}`}
            </Text>
            <Text style={pending ? styles.todo : styles.muted}>{t(DEVICE_ASSETS_CARD_STATUS_COPY[card.status])}</Text>
            {pending ? (
              <>
                <Text style={styles.muted}>{`${t({ zh: '到期', en: 'Expires' })} ${new Date(card.expiresAt).toLocaleString()}`}</Text>
                <TextInput
                  style={styles.input}
                  value={values[card.cardRef] ?? ''}
                  onChangeText={(text) => setValues((current) => ({ ...current, [card.cardRef]: text }))}
                  maxLength={RESALE_LISTING_LIMITS_V1.pickupPointMax}
                  placeholder={
                    card.field === 'pickup_point'
                      ? t({ zh: '例如：Tampines MRT 出口 A', en: 'For example: Tampines MRT exit A' })
                      : t({ zh: '例如：周六下午 3 点', en: 'For example: Saturday 3 pm' })
                  }
                  accessibilityLabel={t(DEVICE_ASSETS_CARD_FIELD_COPY[card.field])}
                  testID={`disclosure-card-value-${card.cardRef}`}
                />
                <Text style={styles.muted}>{t(DEVICE_ASSETS_CARDS_COPY.valueHint)}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.approve}
                    onPress={() => void decide(card, 'approve')}
                    disabled={busy === card.cardRef}
                    accessibilityRole="button"
                    testID={`disclosure-card-approve-${card.cardRef}`}
                  >
                    {busy === card.cardRef ? <ActivityIndicator /> : <Text style={styles.approveText}>{t({ en: 'Approve this one', zh: '批准这一次' })}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deny}
                    onPress={() => void decide(card, 'deny')}
                    disabled={busy === card.cardRef}
                    accessibilityRole="button"
                    testID={`disclosure-card-deny-${card.cardRef}`}
                  >
                    <Text style={styles.denyText}>{t({ en: 'Deny', zh: '拒绝' })}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
            {failure ? <Text style={styles.warn}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[failure])}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 12, paddingBottom: 40 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 6 },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    todo: { color: c.warning, fontSize: 13, fontWeight: '800' },
    warn: { color: c.warning, fontSize: 13, fontWeight: '700' },
    notice: { backgroundColor: c.bgCard, borderColor: c.warning, borderWidth: 1, borderRadius: 14, padding: 14 },
    noticeText: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '800' },
    input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, color: c.textPrimary, paddingHorizontal: 12, fontSize: 15 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    approve: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    approveText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    deny: { minHeight: 46, minWidth: 88, borderRadius: 12, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
    denyText: { color: c.danger, fontSize: 14, fontWeight: '800' },
  });
