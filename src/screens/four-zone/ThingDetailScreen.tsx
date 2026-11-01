/**
 * ThingDetailScreen — 我的东西 → 一件 (L9 S16, `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED=1`; deviceAssets.ts).
 *
 * One thing, read only: what it is, worth, warranty, a linked registered device, and — while selling is open on the
 * server — its listing's state. Editing the thing or the listing, publishing and the item page open on the web. Private
 * fields are never shown on the phone: only whether they are kept encrypted.
 */
import React from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { APP_URL } from '../../config/env';
import { joinWebUrl } from '../../services/webHandoff';
import {
  DEVICE_ASSETS_LISTING_STATUS_COPY,
  DEVICE_ASSETS_MOBILE_FAILURE_COPY,
  DEVICE_ASSETS_STATUS_COPY,
  deviceAssetsListingFor,
  formatDeviceAssetsMoney,
} from '../../services/deviceAssets';
import { DEVICE_ASSETS_QUERY_KEY, mobileDeviceAssetsClient } from '../../services/deviceAssetsRuntime';
import { DEVICE_ASSET_CONDITION_COPY_V1, RESALE_CATEGORY_COPY_V1, deviceAssetWarrantyEndsSoonV1 } from '../../../shared/types/device-assets';

type Copy = { zh: string; en: string };

export function ThingDetailScreen({ route }: { route?: { params?: { assetRef?: string } } }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const signedIn = useAuthStore((state) => !!state.token);
  const client = React.useMemo(() => mobileDeviceAssetsClient(), []);
  const assetRef = typeof route?.params?.assetRef === 'string' ? route.params.assetRef : '';
  const thing = useQuery({
    queryKey: [...DEVICE_ASSETS_QUERY_KEY, 'thing', assetRef],
    queryFn: () => client.getThing(assetRef),
    enabled: signedIn,
    retry: 0,
  });
  const listings = useQuery({
    queryKey: [...DEVICE_ASSETS_QUERY_KEY, 'listings'],
    queryFn: () => client.listListings(),
    enabled: signedIn && thing.data?.ok === true,
    retry: 0,
    staleTime: 30_000,
  });
  const open = (path: string) => void Linking.openURL(joinWebUrl(APP_URL, path)).catch(() => undefined);
  const result = thing.data;
  const view = result?.ok === true ? result.value : null;
  // Selling closed on the server (404) or unreadable: no listing section at all.
  const listing = view && listings.data?.ok === true ? deviceAssetsListingFor(listings.data.value.items, view.assetRef) : null;
  const sellingOpen = listings.data?.ok === true;
  const line = (label: Copy, value: string | null, testID?: string) =>
    value ? (
      <Text style={styles.line} testID={testID}>
        <Text style={styles.label}>{`${t(label)}  `}</Text>
        {value}
      </Text>
    ) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="thing-detail-screen">
      {thing.isLoading ? <ActivityIndicator /> : null}
      {result?.ok === false ? (
        <View style={styles.notice} testID={`thing-detail-failure-${result.failure}`}>
          <Text style={styles.noticeText}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[result.failure])}</Text>
        </View>
      ) : null}
      {view ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {view.name}
          </Text>
          <View style={styles.block}>
            {line({ zh: '类别', en: 'Kind' }, t(RESALE_CATEGORY_COPY_V1[view.category]))}
            {line({ zh: '成色', en: 'Condition' }, t(DEVICE_ASSET_CONDITION_COPY_V1[view.condition]))}
            {line({ zh: '状态', en: 'Status' }, t(DEVICE_ASSETS_STATUS_COPY[view.status]))}
            {line({ zh: '品牌', en: 'Brand' }, view.brand)}
            {line({ zh: '型号', en: 'Model' }, view.model)}
            {line({ zh: '买的日子', en: 'Bought on' }, view.purchasedOn)}
            {line({ zh: '买的价钱', en: 'Paid' }, formatDeviceAssetsMoney(view.purchasePrice))}
            {line({ zh: '现在大概值', en: 'Worth now' }, formatDeviceAssetsMoney(view.estimate))}
            {line({ zh: '保修到', en: 'Warranty until' }, view.warrantyUntil)}
            {deviceAssetWarrantyEndsSoonV1(view.warrantyUntil) ? <Text style={styles.warn}>{t({ zh: '保修快到期', en: 'Warranty ends soon' })}</Text> : null}
            {line({ zh: '挂上的设备', en: 'Linked device' }, view.linkedDeviceRef)}
            {view.privateState === 'sealed' ? (
              <Text style={styles.muted} testID="thing-detail-private-sealed">
                {t({ zh: '序列号等私密信息已加密保存，只在网页上显示。', en: 'Serial number and other private details are kept encrypted and shown on the web only.' })}
              </Text>
            ) : null}
            {view.privateState === 'unreadable' ? (
              <Text style={styles.warn}>{t({ zh: '私密信息暂时读不出。', en: 'The private details cannot be read right now.' })}</Text>
            ) : null}
            {view.status === 'owned' && !view.sellable ? (
              <Text style={styles.warn}>{t({ zh: '挂上的设备报了丢失或被盗，不能卖。', en: 'The linked device is reported lost or stolen, so it cannot be sold.' })}</Text>
            ) : null}
          </View>

          {listing ? (
            <>
              <Text style={styles.section}>{t({ zh: '挂牌（只读）', en: 'Listing (read only)' })}</Text>
              <View style={styles.block} testID="thing-detail-listing">
                <Text style={styles.itemLabel}>{t(DEVICE_ASSETS_LISTING_STATUS_COPY[listing.status])}</Text>
                {line({ zh: '标题', en: 'Title' }, listing.title)}
                {line({ zh: '要价', en: 'Asking' }, formatDeviceAssetsMoney(listing.asking))}
                {line({ zh: '照片', en: 'Photos' }, String(listing.photos.length))}
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => open(`/console/assets/listings/${encodeURIComponent(listing.listingRef)}`)}
                  accessibilityRole="link"
                  testID="thing-detail-open-listing"
                >
                  <Text style={styles.linkText}>{t({ zh: '到网页上编辑、发布或看对话', en: 'Edit, publish or read the conversations on the web' })}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
          {!listing && sellingOpen && view.sellable ? (
            <Text style={styles.muted}>{t({ zh: '想卖这件：在「加一件」里拍照加，或者到网页上点「我想卖」。', en: 'To sell it, photograph it in "Add a thing", or press "I want to sell" on the web.' })}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.row}
            onPress={() => open(`/console/assets/${encodeURIComponent(view.assetRef)}`)}
            accessibilityRole="link"
            testID="thing-detail-open-web"
          >
            <Text style={styles.rowLabel}>{t({ zh: '在网页上编辑这件', en: 'Edit this thing on the web' })}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10, paddingBottom: 40 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 6 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 8 },
    notice: { backgroundColor: c.bgCard, borderColor: c.warning, borderWidth: 1, borderRadius: 14, padding: 14 },
    noticeText: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    block: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    line: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    itemLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    warn: { color: c.warning, fontSize: 13, fontWeight: '700' },
    linkButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
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
