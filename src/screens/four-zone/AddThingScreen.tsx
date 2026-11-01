/**
 * AddThingScreen — 我的东西 → 加一件 (L9 S16, `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED=1`; deviceAssets.ts).
 *
 * Name, kind and condition record the thing. "I want to sell it" adds up to four photos (camera or library, the existing
 * `expo-image-picker`) and the price: the thing is recorded, then — while selling is open on the server — a draft listing
 * gets the photos and the price (`addThingWithPhotos`). Nothing is published from the phone; the result links to the
 * web listing page to add the title, area and handover and publish. No private field (serial number, IMEI, receipt,
 * notes) is asked for here.
 */
import React from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { APP_URL } from '../../config/env';
import { joinWebUrl } from '../../services/webHandoff';
import {
  DEVICE_ASSETS_LISTING_STATUS_COPY,
  DEVICE_ASSETS_MOBILE_FAILURE_COPY,
  DEVICE_ASSETS_SELL_COPY,
  addThingWithPhotos,
  formatDeviceAssetsMoney,
  parseDeviceAssetsSgd,
  type DeviceAssetsAddWithPhotosOutcome,
  type DeviceAssetsMobilePhoto,
} from '../../services/deviceAssets';
import { DEVICE_ASSETS_QUERY_KEY, mobileDeviceAssetsClient } from '../../services/deviceAssetsRuntime';
import {
  DEVICE_ASSET_CONDITIONS_V1,
  DEVICE_ASSET_CONDITION_COPY_V1,
  DEVICE_ASSET_LIMITS_V1,
  RESALE_CATEGORIES_V1,
  RESALE_CATEGORY_COPY_V1,
  type DeviceAssetConditionV1,
  type ResaleCategoryV1,
} from '../../../shared/types/device-assets';
import { RESALE_LISTING_LIMITS_V1 } from '../../../shared/types/resale';

type Copy = { zh: string; en: string };

function pickedPhotos(result: ImagePicker.ImagePickerResult): DeviceAssetsMobilePhoto[] {
  if (result.canceled || !result.assets) return [];
  return result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType ?? null, fileName: asset.fileName ?? null, fileSize: asset.fileSize ?? null }));
}

export function AddThingScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const client = React.useMemo(() => mobileDeviceAssetsClient(), []);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState<ResaleCategoryV1>('phone');
  const [condition, setCondition] = React.useState<DeviceAssetConditionV1>('good');
  const [sell, setSell] = React.useState(false);
  const [photos, setPhotos] = React.useState<DeviceAssetsMobilePhoto[]>([]);
  const [asking, setAsking] = React.useState('');
  const [floor, setFloor] = React.useState('');
  const [problem, setProblem] = React.useState<Copy | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<DeviceAssetsAddWithPhotosOutcome | null>(null);
  const room = RESALE_LISTING_LIMITS_V1.photosMax - photos.length;

  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setProblem({ zh: '没有相机权限。可以从相册选。', en: 'No camera permission. You can pick from the library.' });
        return;
      }
      const shot = pickedPhotos(await ImagePicker.launchCameraAsync({ quality: 0.8 }));
      setPhotos((current) => [...current, ...shot].slice(0, RESALE_LISTING_LIMITS_V1.photosMax));
    } catch {
      setProblem({ zh: '没有拍成，请重试。', en: 'The photo was not taken. Try again.' });
    }
  };
  const pickPhotos = async () => {
    try {
      const picked = pickedPhotos(await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsMultipleSelection: true, selectionLimit: Math.max(1, room) }));
      setPhotos((current) => [...current, ...picked].slice(0, RESALE_LISTING_LIMITS_V1.photosMax));
    } catch {
      setProblem({ zh: '没有选成，请重试。', en: 'Nothing was picked. Try again.' });
    }
  };

  const save = async () => {
    setProblem(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setProblem({ zh: '先写上这是什么。', en: 'Say what it is first.' });
      return;
    }
    let price: { askingMinor: number; floorMinor: number | null } | null = null;
    if (sell && asking.trim()) {
      const askingMinor = parseDeviceAssetsSgd(asking);
      const floorMinor = floor.trim() ? parseDeviceAssetsSgd(floor) : null;
      if (askingMinor === null || (floor.trim() && floorMinor === null)) {
        setProblem({ zh: '价格请填数字，例如 650 或 650.50。', en: 'Write the price as a number, for example 650 or 650.50.' });
        return;
      }
      if (floorMinor !== null && floorMinor > askingMinor) {
        setProblem({ zh: '最低价不能高于要价。', en: 'The lowest price cannot be above the asking price.' });
        return;
      }
      price = { askingMinor, floorMinor };
    }
    setBusy(true);
    try {
      const result = await addThingWithPhotos(client, {
        thing: { name: trimmed, category, condition },
        sell: sell ? { photos, price } : null,
      });
      setOutcome(result);
      if (result.ok === true) void queryClient.invalidateQueries({ queryKey: [...DEVICE_ASSETS_QUERY_KEY] });
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setName('');
    setSell(false);
    setPhotos([]);
    setAsking('');
    setFloor('');
    setProblem(null);
    setOutcome(null);
  };

  if (outcome?.ok === true) {
    const listing = outcome.listing;
    const asked = listing ? formatDeviceAssetsMoney(listing.asking) : null;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="add-thing-done">
        <Text style={styles.title} accessibilityRole="header">
          {t({ en: 'Saved', zh: '记下了' })}
        </Text>
        <Text style={styles.body}>{outcome.asset.name}</Text>
        {outcome.draftFailure === 'closed' ? <Text style={styles.muted}>{t(DEVICE_ASSETS_SELL_COPY.notOpen)}</Text> : null}
        {outcome.draftFailure && outcome.draftFailure !== 'closed' ? (
          <Text style={styles.warn}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[outcome.draftFailure])}</Text>
        ) : null}
        {listing ? (
          <View style={styles.block} testID="add-thing-draft">
            <Text style={styles.itemLabel}>{t(DEVICE_ASSETS_LISTING_STATUS_COPY[listing.status])}</Text>
            <Text style={styles.muted}>
              {`${t({ zh: '照片', en: 'Photos' })} ${listing.photos.length}`}
              {asked ? ` · ${t({ zh: '要价', en: 'Asking' })} ${asked}` : ''}
            </Text>
            {outcome.photosFailed > 0 ? (
              <Text style={styles.warn}>
                {t({ zh: `有 ${outcome.photosFailed} 张照片没传上去，可以到网页上补。`, en: `${outcome.photosFailed} photo(s) did not upload. You can add them on the web.` })}
              </Text>
            ) : null}
            {outcome.priceFailure ? <Text style={styles.warn}>{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[outcome.priceFailure])}</Text> : null}
            <Text style={styles.muted}>{t(DEVICE_ASSETS_SELL_COPY.explain)}</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => void Linking.openURL(joinWebUrl(APP_URL, `/console/assets/listings/${encodeURIComponent(listing.listingRef)}`)).catch(() => undefined)}
              accessibilityRole="link"
              testID="add-thing-open-web"
            >
              <Text style={styles.linkText}>{t({ en: 'Finish and publish on the web', zh: '到网页上补齐并发布' })}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('ThingDetail', { assetRef: outcome.asset.assetRef })}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>{t({ en: 'See this thing', zh: '看这件' })}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={restart} accessibilityRole="button" testID="add-thing-again">
          <Text style={styles.rowLabel}>{t({ en: 'Add another', zh: '再加一件' })}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const chip = (selected: boolean, label: string, onPress: () => void, key: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, selected ? styles.chipOn : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={selected ? styles.chipTextOn : styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="add-thing-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Add a thing', zh: '加一件' })}
      </Text>
      <Text style={styles.section}>{t({ en: 'What is it', zh: '这是什么' })}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={DEVICE_ASSET_LIMITS_V1.nameMax}
        placeholder={t({ en: 'For example: MacBook Air M1', zh: '例如：MacBook Air M1' })}
        accessibilityLabel={t({ en: 'Name', zh: '名称' })}
        testID="add-thing-name"
      />
      <Text style={styles.section}>{t({ en: 'Kind', zh: '类别' })}</Text>
      <View style={styles.chips}>
        {RESALE_CATEGORIES_V1.map((value) => chip(category === value, t(RESALE_CATEGORY_COPY_V1[value]), () => setCategory(value), value))}
      </View>
      <Text style={styles.section}>{t({ en: 'Condition', zh: '成色' })}</Text>
      <View style={styles.chips}>
        {DEVICE_ASSET_CONDITIONS_V1.map((value) => chip(condition === value, t(DEVICE_ASSET_CONDITION_COPY_V1[value]), () => setCondition(value), value))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.rowLabel}>{t({ en: 'I want to sell it', zh: '我想卖' })}</Text>
        <Switch value={sell} onValueChange={setSell} accessibilityLabel={t({ en: 'I want to sell it', zh: '我想卖' })} testID="add-thing-sell" />
      </View>

      {sell ? (
        <View style={styles.block} testID="add-thing-sell-block">
          <Text style={styles.section}>{t({ en: `Photos (up to ${RESALE_LISTING_LIMITS_V1.photosMax})`, zh: `照片（最多 ${RESALE_LISTING_LIMITS_V1.photosMax} 张）` })}</Text>
          <View style={styles.photos}>
            {photos.map((photo, index) => (
              <TouchableOpacity
                key={`${photo.uri}-${index}`}
                onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Remove this photo', zh: '去掉这张照片' })}
              >
                <Image source={{ uri: photo.uri }} style={styles.photo} />
              </TouchableOpacity>
            ))}
          </View>
          {room > 0 ? (
            <View style={styles.chips}>
              {chip(false, t({ en: 'Take a photo', zh: '拍一张' }), () => void takePhoto(), 'camera')}
              {chip(false, t({ en: 'Pick from library', zh: '从相册选' }), () => void pickPhotos(), 'library')}
            </View>
          ) : null}
          <Text style={styles.section}>{t({ en: 'Asking price (S$)', zh: '要价（新元）' })}</Text>
          <TextInput
            style={styles.input}
            value={asking}
            onChangeText={setAsking}
            keyboardType="decimal-pad"
            placeholder="650"
            accessibilityLabel={t({ en: 'Asking price', zh: '要价' })}
            testID="add-thing-asking"
          />
          <Text style={styles.section}>{t({ en: 'Lowest price you accept (S$, optional)', zh: '最低能接受的价（新元，可不填）' })}</Text>
          <TextInput
            style={styles.input}
            value={floor}
            onChangeText={setFloor}
            keyboardType="decimal-pad"
            placeholder="480"
            accessibilityLabel={t({ en: 'Lowest price', zh: '最低价' })}
            testID="add-thing-floor"
          />
          <Text style={styles.muted}>{t(DEVICE_ASSETS_SELL_COPY.floor)}</Text>
          <Text style={styles.muted}>{t(DEVICE_ASSETS_SELL_COPY.explain)}</Text>
        </View>
      ) : null}

      {problem ? <Text style={styles.warn}>{t(problem)}</Text> : null}
      {outcome?.ok === false ? <Text style={styles.warn} testID="add-thing-failure">{t(DEVICE_ASSETS_MOBILE_FAILURE_COPY[outcome.failure])}</Text> : null}
      <TouchableOpacity style={styles.primary} onPress={() => void save()} disabled={busy} accessibilityRole="button" testID="add-thing-save">
        {busy ? <ActivityIndicator /> : <Text style={styles.primaryText}>{t({ en: 'Save', zh: '保存' })}</Text>}
      </TouchableOpacity>
      <Text style={styles.muted}>
        {t({
          en: 'Serial number, IMEI, receipt number and notes are added on the web, encrypted.',
          zh: '序列号、IMEI、收据号和备注在网页上填，加密保存。',
        })}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10, paddingBottom: 48 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800', marginBottom: 6 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 6 },
    body: { color: c.textPrimary, fontSize: 15, lineHeight: 21 },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    warn: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, color: c.textPrimary, paddingHorizontal: 12, fontSize: 15 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    chipOn: { borderColor: c.accent, backgroundColor: c.cardAlt },
    chipText: { color: c.textSecondary, fontSize: 13 },
    chipTextOn: { color: c.textPrimary, fontSize: 13, fontWeight: '800' },
    switchRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    block: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photo: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.cardAlt },
    itemLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    primary: { minHeight: 50, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    primaryText: { color: c.onAccent, fontSize: 16, fontWeight: '800' },
    linkButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 14, fontWeight: '800' },
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
