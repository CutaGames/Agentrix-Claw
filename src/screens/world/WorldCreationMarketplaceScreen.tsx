/** WorldCreationMarketplaceScreen — Plot 体验市场 (v6 R11) */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  browsePlotListings,
  purchasePlotListing,
  discoverPlots,
} from '../../services/worldCreationApi';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import type {
  PlotListingDto,
  BrowsePlotListingsQuery,
} from '../../../shared/types/world-creation-api';
import type { SubstrateTier } from '../../../shared/types/world-creation';
import { themedStyles } from '../../theme/useTheme';

type TierFilter = 'all' | SubstrateTier;
type SortOpt = NonNullable<BrowsePlotListingsQuery['sort']>;

const TIER_FILTERS: TierFilter[] = ['all', 'A', 'B', 'C'];
const SORT_OPTS: SortOpt[] = ['newest', 'price_asc', 'price_desc', 'popularity'];

export default function WorldCreationMarketplaceScreen() {
  const navigation = useNavigation();
  const { t } = useI18n();

  const [tier, setTier] = useState<TierFilter>('all');
  const [sort, setSort] = useState<SortOpt>('newest');
  const [confirmItem, setConfirmItem] = useState<PlotListingDto | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  // Build the browse query from local filter state.
  const query = useMemo<BrowsePlotListingsQuery>(() => {
    const q: BrowsePlotListingsQuery = { sort };
    if (tier !== 'all') q.substrateTier = tier;
    return q;
  }, [tier, sort]);

  const listingsQ = useQuery({
    queryKey: ['plot-listings', query],
    queryFn: () => browsePlotListings(query),
  });

  // Lightweight discovery context — how many published Plots are explorable.
  const discoverQ = useQuery({
    queryKey: ['plot-discover-count'],
    queryFn: () => discoverPlots({ sort: 'popularity', limit: 1 }),
  });

  const listings = listingsQ.data?.items ?? [];
  const discoverTotal = discoverQ.data?.total;

  const priceLabel = useCallback(
    (item: PlotListingDto) =>
      item.priceAxp != null
        ? `${item.priceAxp} AXP`
        : item.priceUsd != null
          ? `$${item.priceUsd}`
          : t({ en: 'Free', zh: '免费' }),
    [t],
  );

  const tierLabel = useCallback(
    (f: TierFilter) =>
      f === 'all' ? t({ en: 'All', zh: '全部' }) : f,
    [t],
  );

  const sortLabel = useCallback(
    (s: SortOpt) => {
      switch (s) {
        case 'newest':
          return t({ en: 'Newest', zh: '最新' });
        case 'price_asc':
          return t({ en: 'Price ↑', zh: '价格↑' });
        case 'price_desc':
          return t({ en: 'Price ↓', zh: '价格↓' });
        case 'popularity':
          return t({ en: 'Popular', zh: '热门' });
      }
    },
    [t],
  );

  const runPurchase = useCallback(async () => {
    if (!confirmItem) return;
    const item = confirmItem;
    setPurchasing(true);
    try {
      const r = await purchasePlotListing(item.listingId, {
        signedConfirmation: 'mobile-stub-trust3',
      });
      setConfirmItem(null);
      if (r.status === 'completed') {
        const cut =
          r.platformCut != null
            ? t({
                en: `\nPlatform cut: ${r.platformCut} AXP`,
                zh: `\n平台抽成:${r.platformCut} AXP`,
              })
            : '';
        Alert.alert(
          t({ en: 'Purchased', zh: '购买成功' }),
          t({
            en: `"${item.title}" is now yours.`,
            zh: `「${item.title}」已归你所有。`,
          }) + cut,
        );
        await listingsQ.refetch();
      } else if (r.status === 'reserved') {
        Alert.alert(
          t({ en: 'Reserved', zh: '预留中' }),
          t({
            en: 'This listing is being reserved. Try again shortly.',
            zh: '该上架正在预留中,请稍后再试。',
          }),
        );
        await listingsQ.refetch();
      } else {
        // failed
        Alert.alert(
          t({ en: 'Purchase failed', zh: '购买失败' }),
          r.error?.detail ||
            t({ en: 'Please try again later.', zh: '请稍后再试。' }),
        );
      }
    } catch (e: any) {
      setConfirmItem(null);
      Alert.alert(
        t({ en: 'Purchase failed', zh: '购买失败' }),
        e?.message || '',
      );
    } finally {
      setPurchasing(false);
    }
  }, [confirmItem, listingsQ, t]);

  const renderItem = useCallback(
    ({ item }: { item: PlotListingDto }) => (
      <TouchableOpacity
        testID={`plot-listing-${item.listingId}`}
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setConfirmItem(item)}
      >
        {item.previewUrl ? (
          <Image source={{ uri: item.previewUrl }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>🌍</Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>
                {t({ en: 'Tier', zh: '层级' })} {item.substrateTier}
              </Text>
            </View>
            <Text style={styles.saleType}>
              {item.saleType === 'first'
                ? t({ en: 'First sale', zh: '首发' })
                : t({ en: 'Resale', zh: '二手' })}
            </Text>
          </View>
          <Text style={styles.cardPrice}>{priceLabel(item)}</Text>
        </View>
      </TouchableOpacity>
    ),
    [priceLabel, t],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏝️ {t({ en: 'Plot Market', zh: 'Plot 体验市场' })}</Text>
        <View style={styles.backBtn} />
      </View>

      {discoverTotal != null && (
        <Text style={styles.subtitle}>
          {t({
            en: `${discoverTotal} worlds to explore`,
            zh: `${discoverTotal} 个世界可探索`,
          })}
        </Text>
      )}

      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.filterRow}>
          {TIER_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              testID={`market-filter-tier-${f}`}
              style={[styles.chip, tier === f && styles.chipActive]}
              onPress={() => setTier(f)}
            >
              <Text style={[styles.chipText, tier === f && styles.chipTextActive]}>
                {tierLabel(f)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterRow}>
          {SORT_OPTS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, sort === s && styles.chipActive]}
              onPress={() => setSort(s)}
            >
              <Text style={[styles.chipText, sort === s && styles.chipTextActive]}>
                {sortLabel(s)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {listingsQ.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🏝️</Text>
          <Text style={styles.emptyTitle}>
            {t({ en: 'No Plot experiences on sale', zh: '暂无在售 Plot 体验' })}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="plot-marketplace-scroll"
          data={listings}
          renderItem={renderItem}
          keyExtractor={(item) => item.listingId}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={listingsQ.isRefetching}
              onRefresh={() => listingsQ.refetch()}
              tintColor={colors.accent}
            />
          }
        />
      )}

      {/* Purchase confirmation */}
      <Modal
        visible={confirmItem != null}
        transparent
        animationType="fade"
        onRequestClose={() => !purchasing && setConfirmItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t({ en: 'Confirm purchase', zh: '确认购买' })}
            </Text>
            {confirmItem && (
              <Text style={styles.modalBody}>
                {t({
                  en: `Buy "${confirmItem.title}" for ${priceLabel(confirmItem)}?`,
                  zh: `用 ${priceLabel(confirmItem)} 购买「${confirmItem.title}」?`,
                })}
              </Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setConfirmItem(null)}
                disabled={purchasing}
              >
                <Text style={styles.modalCancelText}>
                  {t({ en: 'Cancel', zh: '取消' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="plot-purchase-confirm"
                style={[styles.modalBtn, styles.modalConfirm, purchasing && { opacity: 0.5 }]}
                onPress={runPurchase}
                disabled={purchasing}
              >
                {purchasing ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {t({ en: 'Buy', zh: '购买' })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backBtn: { paddingVertical: 6, paddingRight: 8, minWidth: 64 },
  backBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  filters: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bgSecondary,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: colors.textInverse, fontWeight: '700' },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    gap: 12,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.bgCard },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { fontSize: 28 },
  cardInfo: { flex: 1 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tierBadge: {
    backgroundColor: colors.bgCard,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tierBadgeText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  saleType: { color: colors.textMuted, fontSize: 11 },
  cardPrice: { color: colors.accent, fontSize: 15, fontWeight: '800', marginTop: 4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  modalBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancel: { backgroundColor: colors.bgSecondary },
  modalCancelText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  modalConfirm: { backgroundColor: colors.accent },
  modalConfirmText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },
}));
