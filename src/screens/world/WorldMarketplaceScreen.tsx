/**
 * WorldMarketplaceScreen — 世界资产市场 (P0 #3, 2026-06-01).
 *
 * 替换之前的 "Phase 2 — coming soon" 空壳。接已有后端:
 *   - browseMarketplaceListings(category/sort/price) → 在售列表
 *   - purchaseMarketplaceListing(listingId)          → 购买
 * 点条目可看资产详情(复用 WorldAssetDetail)。下拉刷新、分类/排序筛选。
 *
 * 诚实降级: 后端无在售时显示空态并引导去资产库上架自己的角色。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  browseMarketplaceListings,
  purchaseMarketplaceListing,
  type MarketplaceListing,
  type BrowseListingsQuery,
} from '../../services/worldEngineApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WorldAssetMarketplace'>;

type CatFilter = 'all' | 'character' | 'dungeon' | 'weapon';
type SortOpt = 'newest' | 'price_asc' | 'price_desc';

export function WorldMarketplaceScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<CatFilter>('all');
  const [sort, setSort] = useState<SortOpt>('newest');
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q: BrowseListingsQuery = { sort };
      if (cat !== 'all') q.category = cat;
      const r = await browseMarketplaceListings(q);
      setListings(r.items ?? []);
    } catch (e: any) {
      // 后端未就绪/网络错误 → 空列表 + 空态, 不弹错误打断。
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [cat, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onBuy = useCallback(
    (item: MarketplaceListing) => {
      const priceLabel = `${item.price} ${item.currency}`;
      Alert.alert(
        t({ en: 'Confirm purchase', zh: '确认购买' }),
        t({
          en: `Buy "${item.asset?.name ?? 'asset'}" for ${priceLabel}?`,
          zh: `用 ${priceLabel} 购买「${item.asset?.name ?? '该资产'}」?`,
        }),
        [
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
          {
            text: t({ en: 'Buy', zh: '购买' }),
            onPress: async () => {
              try {
                setBuyingId(item.id);
                const r = await purchaseMarketplaceListing(item.id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (r.status === 'completed') {
                  Alert.alert(
                    t({ en: 'Purchased', zh: '购买成功' }),
                    t({ en: 'The asset is now in your inventory.', zh: '该资产已进入你的资产库。' }),
                  );
                  await load();
                } else {
                  Alert.alert(t({ en: 'Purchase failed', zh: '购买失败' }), t({ en: 'Please try again.', zh: '请稍后再试。' }));
                }
              } catch (e: any) {
                Alert.alert(t({ en: 'Purchase failed', zh: '购买失败' }), e?.message || '');
              } finally {
                setBuyingId(null);
              }
            },
          },
        ],
      );
    },
    [load, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: MarketplaceListing }) => {
      const a = item.asset;
      const uri = a?.styledMeshUrl || a?.meshUrl || a?.portraitUrl || null;
      return (
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardTop}
            activeOpacity={0.8}
            onPress={() => {
              if (a?.id) (navigation as any).navigate('WorldAssetDetail', { assetId: a.id, assetName: a.name });
            }}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={styles.thumbPlaceholderText}>🦊</Text>
              </View>
            )}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>{a?.name ?? t({ en: 'Unknown asset', zh: '未知资产' })}</Text>
              {!!a && (
                <Text style={styles.cardMeta} numberOfLines={1}>
                  Lv.{a.level} · {a.battleWins}W/{a.battleLosses}L
                </Text>
              )}
              <Text style={styles.cardPrice}>{item.price} {item.currency}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.buyBtn, buyingId === item.id && { opacity: 0.5 }]}
            onPress={() => onBuy(item)}
            disabled={buyingId === item.id}
          >
            <Text style={styles.buyBtnText}>{buyingId === item.id ? '…' : t({ en: 'Buy', zh: '购买' })}</Text>
          </TouchableOpacity>
        </View>
      );
    },
    [navigation, onBuy, buyingId, t],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛒 {t({ en: 'Marketplace', zh: '资产市场' })}</Text>
        <TouchableOpacity onPress={() => (navigation as any).navigate('WorldAssetInventory')} style={styles.sellBtn}>
          <Text style={styles.sellBtnText}>{t({ en: 'Sell', zh: '去上架' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.filterRow}>
          {(['all', 'character', 'weapon', 'dungeon'] as CatFilter[]).map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, cat === c && styles.chipActive]} onPress={() => setCat(c)}>
              <Text style={[styles.chipText, cat === c && styles.chipTextActive]}>
                {c === 'all' ? t({ en: 'All', zh: '全部' }) : c === 'character' ? t({ en: 'Char', zh: '角色' }) : c === 'weapon' ? t({ en: 'Weapon', zh: '武器' }) : t({ en: 'Dungeon', zh: '副本' })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterRow}>
          {(['newest', 'price_asc', 'price_desc'] as SortOpt[]).map((s) => (
            <TouchableOpacity key={s} style={[styles.chip, sort === s && styles.chipActive]} onPress={() => setSort(s)}>
              <Text style={[styles.chipText, sort === s && styles.chipTextActive]}>
                {s === 'newest' ? t({ en: 'Newest', zh: '最新' }) : s === 'price_asc' ? t({ en: 'Price ↑', zh: '价格↑' }) : t({ en: 'Price ↓', zh: '价格↓' })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>{t({ en: 'No listings yet', zh: '暂无在售资产' })}</Text>
          <Text style={styles.emptySub}>
            {t({ en: 'Be the first — list one of your characters for sale.', zh: '成为第一个 —— 把你的角色上架出售吧。' })}
          </Text>
          <TouchableOpacity style={styles.emptyCta} onPress={() => (navigation as any).navigate('WorldAssetInventory')}>
            <Text style={styles.emptyCtaText}>{t({ en: 'Go to my assets', zh: '去我的资产库' })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn: { paddingVertical: 6, paddingRight: 8, minWidth: 64 },
  backBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sellBtn: { paddingVertical: 6, paddingLeft: 8, minWidth: 64, alignItems: 'flex-end' },
  sellBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },

  filters: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bgSecondary },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: '#04222b', fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyCta: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  emptyCtaText: { color: '#04222b', fontSize: 14, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 10, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#0d0d1a' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { fontSize: 28 },
  cardInfo: { flex: 1 },
  cardName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cardPrice: { color: colors.accent, fontSize: 15, fontWeight: '800', marginTop: 4 },
  buyBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginLeft: 8 },
  buyBtnText: { color: '#04222b', fontSize: 14, fontWeight: '700' },
}));

export default WorldMarketplaceScreen;
