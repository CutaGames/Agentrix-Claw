/**
 * WantedScreen — 我的东西 → 我在找 (L9 S16, `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED=1`; deviceAssets.ts).
 *
 * "I'm looking for": a kind of thing, optionally the most you would pay and an area. There is no free text box. Up to
 * three at a time; each can be paused, resumed or deleted. Matches from people you confirmed (exchanging cards or by
 * account) are listed and open the web item page. Every write answers the whole list again.
 */
import React from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { APP_URL } from '../../config/env';
import { joinWebUrl } from '../../services/webHandoff';
import {
  DEVICE_ASSETS_MOBILE_FAILURE_COPY,
  DEVICE_ASSETS_WANTED_STATUS_COPY,
  formatDeviceAssetsMoney,
  parseDeviceAssetsSgd,
  type DeviceAssetsMobileFailure,
  type DeviceAssetsMobileResult,
} from '../../services/deviceAssets';
import { DEVICE_ASSETS_QUERY_KEY, mobileDeviceAssetsClient } from '../../services/deviceAssetsRuntime';
import { RESALE_CATEGORIES_V1, RESALE_CATEGORY_COPY_V1, type ResaleCategoryV1 } from '../../../shared/types/device-assets';
import {
  RESALE_AREAS_V1,
  RESALE_AREA_COPY_V1,
  RESALE_WANTED_WHO_COPY_V1,
  resaleItemPagePathV1,
  type ResaleAreaV1,
  type ResaleWantedListV1,
} from '../../../shared/types/resale';

export function WantedScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const signedIn = useAuthStore((state) => !!state.token);
  const client = React.useMemo(() => mobileDeviceAssetsClient(), []);
  const read = useQuery({
    queryKey: [...DEVICE_ASSETS_QUERY_KEY, 'wanted'],
    queryFn: () => client.listWanted(),
    enabled: signedIn,
    retry: 0,
  });
  const [latest, setLatest] = React.useState<ResaleWantedListV1 | null>(null);
  const [category, setCategory] = React.useState<ResaleCategoryV1>('laptop');
  const [area, setArea] = React.useState<ResaleAreaV1 | null>(null);
  const [maxPrice, setMaxPrice] = React.useState('');
  const [failure, setFailure] = React.useState<DeviceAssetsMobileFailure | null>(null);
  const [priceProblem, setPriceProblem] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const result = read.data;
  const list = latest ?? (result?.ok === true ? result.value : null);

  const apply = async (action: () => Promise<DeviceAssetsMobileResult<ResaleWantedListV1 | true>>) => {
    setBusy(true);
    setFailure(null);
    try {
      const answer = await action();
      if (answer.ok === false) {
        setFailure(answer.failure);
        return;
      }
      if (answer.value === true) {
        setLatest(null);
        void read.refetch();
      } else {
        setLatest(answer.value);
      }
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    setPriceProblem(false);
    const minor = maxPrice.trim() ? parseDeviceAssetsSgd(maxPrice) : null;
    if (maxPrice.trim() && minor === null) {
      setPriceProblem(true);
      return;
    }
    void apply(() => client.addWanted({ category, maxPrice: minor === null ? null : { amountMinor: minor, currency: 'SGD' }, area }));
  };

  const chip = (selected: boolean, label: string, onPress: () => void, key: string) => (
    <TouchableOpacity key={key} style={[styles.chip, selected ? styles.chipOn : null]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      <Text style={selected ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="wanted-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: "I'm looking for", zh: '我在找' })}
      </Text>
      <Text style={styles.muted}>{t(RESALE_WANTED_WHO_COPY_V1)}</Text>
      {read.isLoading ? <ActivityIndicator /> : null}
      {result?.ok === false ? (
        <View style={styles.notice} testID={`wanted-failure-${result.failure}`}>
          <Text style={styles.noticeText}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[result.failure])}</Text>
        </View>
      ) : null}

      {list ? (
        <>
          {list.matches.length > 0 ? (
            <>
              <Text style={styles.section}>{t({ en: 'Matches', zh: '有了' })}</Text>
              <View style={styles.block} testID="wanted-matches">
                {list.matches.map((match) => (
                  <TouchableOpacity
                    key={`${match.wantedRef}-${match.listingRef}`}
                    style={styles.item}
                    onPress={() => void Linking.openURL(joinWebUrl(APP_URL, resaleItemPagePathV1(match.listingRef))).catch(() => undefined)}
                    accessibilityRole="link"
                    testID={`wanted-match-${match.listingRef}`}
                  >
                    <Text style={styles.itemLabel}>{match.title}</Text>
                    <Text style={styles.itemHint}>{`${formatDeviceAssetsMoney(match.asking)} · ${t(RESALE_AREA_COPY_V1[match.area])}`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.section}>{t({ en: 'What I am looking for', zh: '我登记的' })}</Text>
          {list.items.length === 0 ? <Text style={styles.muted}>{t({ en: 'Nothing yet.', zh: '还没有登记。' })}</Text> : null}
          {list.items.map((item) => (
            <View key={item.wantedRef} style={styles.block} testID={`wanted-item-${item.wantedRef}`}>
              <Text style={styles.itemLabel}>{t(RESALE_CATEGORY_COPY_V1[item.category])}</Text>
              <Text style={styles.itemHint}>
                {[
                  item.maxPrice ? `${t({ zh: '最多', en: 'Up to' })} ${formatDeviceAssetsMoney(item.maxPrice)}` : null,
                  item.area ? t(RESALE_AREA_COPY_V1[item.area]) : null,
                  t(DEVICE_ASSETS_WANTED_STATUS_COPY[item.status]),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <View style={styles.chips}>
                {item.status === 'active'
                  ? chip(false, t({ en: 'Pause', zh: '暂停' }), () => void apply(() => client.pauseWanted(item.wantedRef)), 'pause')
                  : null}
                {item.status === 'paused'
                  ? chip(false, t({ en: 'Keep looking', zh: '继续找' }), () => void apply(() => client.resumeWanted(item.wantedRef)), 'resume')
                  : null}
                {chip(false, t({ en: 'Delete', zh: '删除' }), () => void apply(() => client.removeWanted(item.wantedRef)), 'delete')}
              </View>
            </View>
          ))}

          <Text style={styles.section}>{t({ en: 'Add one', zh: '加一条' })}</Text>
          <View style={styles.block} testID="wanted-form">
            <Text style={styles.label}>{t({ en: 'Kind', zh: '类别' })}</Text>
            <View style={styles.chips}>
              {RESALE_CATEGORIES_V1.map((value) => chip(category === value, t(RESALE_CATEGORY_COPY_V1[value]), () => setCategory(value), value))}
            </View>
            <Text style={styles.label}>{t({ en: 'Most you would pay (S$, optional)', zh: '最多出多少（新元，可不填）' })}</Text>
            <TextInput
              style={styles.input}
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="decimal-pad"
              placeholder="700"
              accessibilityLabel={t({ en: 'Most you would pay', zh: '最多出多少' })}
              testID="wanted-max-price"
            />
            {priceProblem ? <Text style={styles.warn}>{t({ zh: '最高价请填数字。', en: 'Write the top price as a number.' })}</Text> : null}
            <Text style={styles.label}>{t({ en: 'Area (optional)', zh: '区域（可不选）' })}</Text>
            <View style={styles.chips}>
              {chip(area === null, t({ en: 'Anywhere', zh: '都行' }), () => setArea(null), 'any')}
              {RESALE_AREAS_V1.map((value) => chip(area === value, t(RESALE_AREA_COPY_V1[value]), () => setArea(value), value))}
            </View>
            <TouchableOpacity style={styles.primary} onPress={add} disabled={busy} accessibilityRole="button" testID="wanted-add">
              {busy ? <ActivityIndicator /> : <Text style={styles.primaryText}>{t({ en: 'Add', zh: '登记' })}</Text>}
            </TouchableOpacity>
          </View>
        </>
      ) : null}
      {failure ? <Text style={styles.warn} testID={`wanted-write-failure-${failure}`}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[failure])}</Text> : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10, paddingBottom: 40 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 6 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    label: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    warn: { color: c.warning, fontSize: 13, fontWeight: '700' },
    notice: { backgroundColor: c.bgCard, borderColor: c.warning, borderWidth: 1, borderRadius: 14, padding: 14 },
    noticeText: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    block: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    item: { minHeight: 48, justifyContent: 'center', gap: 2 },
    itemLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    itemHint: { color: c.textMuted, fontSize: 12 },
    input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, color: c.textPrimary, paddingHorizontal: 12, fontSize: 15 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    chipOn: { borderColor: c.accent, backgroundColor: c.cardAlt },
    chipText: { color: c.textSecondary, fontSize: 13 },
    chipTextOn: { color: c.textPrimary, fontSize: 13, fontWeight: '800' },
    primary: { minHeight: 48, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
  });
