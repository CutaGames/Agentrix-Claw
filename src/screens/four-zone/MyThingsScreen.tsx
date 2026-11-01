/**
 * MyThingsScreen — 我的 → 设备 → 我的东西 (L9 S16, `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED=1`; deviceAssets.ts).
 *
 * The owner's "My things" list: what they still have (and what is for sale) first, then what is gone. A thing opens its
 * detail; "photograph one" opens the add screen; the approval cards and "I'm looking for" have their own screens. The
 * server decides who may use it (switches and the audience list); a closed route says so and nothing else.
 */
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  DEVICE_ASSETS_MOBILE_FAILURE_COPY,
  DEVICE_ASSETS_STATUS_COPY,
  formatDeviceAssetsMoney,
} from '../../services/deviceAssets';
import { DEVICE_ASSETS_QUERY_KEY, mobileDeviceAssetsClient } from '../../services/deviceAssetsRuntime';
import {
  DEVICE_ASSET_CONDITION_COPY_V1,
  RESALE_CATEGORY_COPY_V1,
  deviceAssetWarrantyEndsSoonV1,
  type DeviceAssetSummaryV1,
} from '../../../shared/types/device-assets';

const OPEN_STATUSES = ['owned', 'listed'];

export function MyThingsScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const signedIn = useAuthStore((state) => !!state.token);
  const client = React.useMemo(() => mobileDeviceAssetsClient(), []);
  const things = useQuery({
    queryKey: [...DEVICE_ASSETS_QUERY_KEY, 'things'],
    queryFn: () => client.listThings({ limit: 200 }),
    enabled: signedIn,
    retry: 0,
    staleTime: 30_000,
  });
  const result = things.data;
  const items: DeviceAssetSummaryV1[] = result?.ok === true ? result.value.items : [];
  const open = items.filter((item) => OPEN_STATUSES.indexOf(item.status) >= 0);
  const gone = items.filter((item) => OPEN_STATUSES.indexOf(item.status) < 0);

  const row = (item: DeviceAssetSummaryV1) => {
    const worth = formatDeviceAssetsMoney(item.estimate);
    const warrantySoon = deviceAssetWarrantyEndsSoonV1(item.warrantyUntil);
    return (
      <TouchableOpacity
        key={item.assetRef}
        style={styles.item}
        onPress={() => navigation.navigate('ThingDetail', { assetRef: item.assetRef })}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${t(DEVICE_ASSETS_STATUS_COPY[item.status])}`}
        testID={`my-things-item-${item.assetRef}`}
      >
        <Text style={styles.itemLabel}>{item.name}</Text>
        <Text style={styles.itemHint}>
          {`${t(RESALE_CATEGORY_COPY_V1[item.category])} · ${t(DEVICE_ASSET_CONDITION_COPY_V1[item.condition])} · ${t(DEVICE_ASSETS_STATUS_COPY[item.status])}`}
          {worth ? ` · ${t({ zh: '值', en: 'worth' })} ${worth}` : ''}
        </Text>
        {warrantySoon ? (
          <Text style={styles.warn}>{`${t({ zh: '保修快到期', en: 'Warranty ends soon' })}: ${item.warrantyUntil}`}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={things.isRefetching} onRefresh={() => void things.refetch()} />}
      testID="my-things-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'My things', zh: '我的东西' })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: 'What you have, what it is worth and when the warranty ends. Only you can see this list.',
          zh: '我有什么、值多少、保修到哪天。这个列表只有你自己看得到。',
        })}
      </Text>

      <TouchableOpacity
        style={styles.primary}
        onPress={() => navigation.navigate('AddThing')}
        accessibilityRole="button"
        testID="my-things-add"
      >
        <Text style={styles.primaryText}>{t({ en: 'Add one (take photos)', zh: '加一件（可以拍照）' })}</Text>
      </TouchableOpacity>

      {!signedIn ? <Text style={styles.muted}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY.no_session)}</Text> : null}
      {things.isLoading ? <ActivityIndicator /> : null}
      {result?.ok === false ? (
        <View style={styles.notice} testID={`my-things-failure-${result.failure}`}>
          <Text style={styles.noticeText}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[result.failure])}</Text>
        </View>
      ) : null}
      {things.isError ? <Text style={styles.muted}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY.failed)}</Text> : null}
      {result?.ok === true && items.length === 0 ? (
        <Text style={styles.muted} testID="my-things-empty">
          {t({ en: 'Nothing here yet. Add the first thing.', zh: '还没有记任何东西，先加一件。' })}
        </Text>
      ) : null}

      {open.length > 0 ? (
        <>
          <Text style={styles.section}>{t({ en: 'I have these', zh: '手上的' })}</Text>
          <View style={styles.block}>{open.map(row)}</View>
        </>
      ) : null}
      {gone.length > 0 ? (
        <>
          <Text style={styles.section}>{t({ en: 'Gone', zh: '已经出手的' })}</Text>
          <View style={styles.block}>{gone.map(row)}</View>
        </>
      ) : null}

      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('DisclosureCards')}
        accessibilityRole="button"
        testID="my-things-cards"
      >
        <Text style={styles.rowLabel}>{t({ en: 'Places and times to approve', zh: '待批准的地点和时间' })}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('Wanted')}
        accessibilityRole="button"
        testID="my-things-wanted"
      >
        <Text style={styles.rowLabel}>{t({ en: "I'm looking for", zh: '我在找' })}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      <Text style={styles.muted}>
        {t({
          en: 'Editing a listing, publishing it and the item page are on the web.',
          zh: '挂牌编辑、发布和物品页在网页上。',
        })}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10, paddingBottom: 40 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 6 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    warn: { color: c.warning, fontSize: 12, fontWeight: '700' },
    notice: { backgroundColor: c.bgCard, borderColor: c.warning, borderWidth: 1, borderRadius: 14, padding: 14 },
    noticeText: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    block: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
    item: { minHeight: 48, justifyContent: 'center', gap: 2 },
    itemLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    itemHint: { color: c.textMuted, fontSize: 12 },
    primary: { minHeight: 48, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
    row: {
      minHeight: 52,
      backgroundColor: c.bgCard,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    chevron: { color: c.textMuted, fontSize: 20 },
  });
