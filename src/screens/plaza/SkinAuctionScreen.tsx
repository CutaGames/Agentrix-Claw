/**
 * SkinAuctionScreen — Sprint 1 (跨端链路打通).
 *
 * Plaza · Pets · Skins. Lists skins from the new unified endpoint
 * `GET /api/v1/market/skins` with sort, clan filter, and cursor-based
 * pagination. Tap a skin → detail screen (future). Install button wires
 * to `POST /pet-skin/...install`.
 *
 * Spec: MOBILE_V4_COMPLETION_PLAN §Sprint 1 Task 1.4
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { installSkin } from '../../services/petSkinMarketplace.api';
import {
  fetchMarketSkins,
  SkinListItem,
  SkinSortV2,
  SkinClan,
} from '../../services/marketSkins.api';

const PAGE_SIZE = 20;

// ── Sort options ─────────────────────────────────────────────
const SORTS: SkinSortV2[] = ['featured', 'newest', 'popular'];
const SORT_LABEL_EN: Record<SkinSortV2, string> = {
  featured: 'Featured',
  newest: 'Newest',
  popular: 'Popular',
};
const SORT_LABEL_ZH: Record<SkinSortV2, string> = {
  featured: '推荐',
  newest: '最新',
  popular: '热门',
};

// ── Clan filter options ──────────────────────────────────────
const CLANS: (SkinClan | 'ALL')[] = ['ALL', 'A', 'B', 'C', 'D', 'E', 'F'];
const CLAN_COLORS: Record<SkinClan, string> = {
  A: '#FF6B6B',
  B: '#4ECDC4',
  C: '#45B7D1',
  D: '#96CEB4',
  E: '#FFEAA7',
  F: '#DDA0DD',
};

function formatPrice(usd: number | null | undefined): string {
  if (usd == null) return '—';
  if (usd === 0) return 'Free';
  return `$${usd.toFixed(2)}`;
}

function formatAxpPrice(item: SkinListItem): string | null {
  if (!item.axpAccepted || item.priceUsd == null) return null;
  // AXP price = USD price * 100 (1 AXP ≈ $0.01), minus discount
  const baseAxp = Math.round(item.priceUsd * 100);
  const discounted = Math.round(baseAxp * (1 - item.axpDiscountPercent / 100));
  return `${discounted} AXP`;
}

export function SkinAuctionScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<SkinSortV2>('featured');
  const [clan, setClan] = useState<SkinClan | 'ALL'>('ALL');

  const query = useInfiniteQuery({
    queryKey: ['market-skins', sort, clan],
    queryFn: ({ pageParam }) =>
      fetchMarketSkins({
        limit: PAGE_SIZE,
        sort,
        clan: clan === 'ALL' ? undefined : clan,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: 1,
    staleTime: 30_000,
  });

  const installMut = useMutation({
    mutationFn: (skin: SkinListItem) => installSkin(skin.id),
    onSuccess: (r, skin) => {
      if (r.ok === false) {
        Alert.alert(t({ en: 'Install failed', zh: '安装失败' }), r.error ?? 'unknown');
        return;
      }
      Alert.alert(
        t({ en: 'Installed', zh: '已安装' }),
        t({ en: `${skin.displayName} is now equipped on your pet.`, zh: `${skin.displayName} 已装配到主宠` }),
      );
      queryClient.invalidateQueries({ queryKey: ['me-quota'] });
      queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
    },
    onError: (e: any) => {
      Alert.alert(t({ en: 'Install failed', zh: '安装失败' }), e?.message ?? 'unknown');
    },
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎨 {t({ en: 'Skin Auction', zh: '皮肤市场' })}</Text>
        <Text style={styles.subtitle}>
          {t({
            en: `${total} skins available · equip, collect, or list your own for sale`,
            zh: `${total} 个皮肤可选 · 装配、收藏、或挂牌出售自己的设计`,
          })}
        </Text>
      </View>

      {/* Sort pills */}
      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable
            key={s}
            style={[styles.sortPill, sort === s && styles.sortPillActive]}
            onPress={() => setSort(s)}
          >
            <Text style={[styles.sortPillText, sort === s && styles.sortPillTextActive]}>
              {t({ en: SORT_LABEL_EN[s], zh: SORT_LABEL_ZH[s] })}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Clan filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.clanRow}
      >
        {CLANS.map((c) => (
          <Pressable
            key={c}
            style={[
              styles.clanPill,
              clan === c && styles.clanPillActive,
              c !== 'ALL' && clan === c && { backgroundColor: CLAN_COLORS[c as SkinClan] },
            ]}
            onPress={() => setClan(c)}
          >
            <Text
              style={[
                styles.clanPillText,
                clan === c && styles.clanPillTextActive,
              ]}
            >
              {c === 'ALL' ? t({ en: 'All', zh: '全部' }) : `Clan ${c}`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {query.isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} size="large" />
      ) : query.isError ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>🚫</Text>
          <Text style={styles.errorText}>
            {t({
              en: 'Failed to load marketplace. Pull to retry.',
              zh: '加载失败。下拉重试。',
            })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <SkinCard
              skin={item}
              onInstall={() => installMut.mutate(item)}
              installing={installMut.isPending && installMut.variables?.id === item.id}
              t={t}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          onEndReached={() => query.hasNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emoji}>🎨</Text>
              <Text style={styles.emptyText}>
                {t({
                  en: 'No skins on the market yet. Be the first to design and list one.',
                  zh: '市场暂无皮肤。来设计第一个吧。',
                })}
              </Text>
            </View>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}

function SkinCard({
  skin,
  onInstall,
  installing,
  t,
}: {
  skin: SkinListItem;
  onInstall: () => void;
  installing: boolean;
  t: any;
}) {
  const axpPrice = formatAxpPrice(skin);

  return (
    <View style={styles.card}>
      <View style={styles.thumbWrap}>
        {skin.thumbnailUrl ? (
          <Image source={{ uri: skin.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <Text style={styles.thumbPlaceholder}>
            {skin.format === 'vrm' ? '🧍' : skin.format === 'rive' ? '🎞' : '🎨'}
          </Text>
        )}
        {/* Source badge */}
        <View style={styles.sourcePill}>
          <Text style={styles.sourcePillText}>
            {skin.source === 'platform' ? '⭐' : skin.source === 'generated' ? '✨' : '🔄'}
          </Text>
        </View>
        {/* Clan badge */}
        <View style={[styles.clanBadge, { backgroundColor: CLAN_COLORS[skin.clan] || '#6B7280' }]}>
          <Text style={styles.clanBadgeText}>{skin.clan || '?'}</Text>
        </View>
        {/* Featured badge */}
        {skin.featured && (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>🔥</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {skin.displayName}
        </Text>
        {/* Social stats row (Sprint 3 Task 3.3) */}
        <View style={styles.socialStatsRow}>
          <Text style={styles.socialStat}>❤️ {skin.likeCount ?? 0}</Text>
          <Text style={styles.socialStat}>👁 {skin.viewCount ?? 0}</Text>
          <Text style={styles.socialStat}>🔀 {skin.remixCount ?? 0}</Text>
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {(skin.format || 'vrm').toUpperCase()} · {formatPrice(skin.priceUsd)}
        </Text>
        {/* AXP pricing display (Task 1.6) */}
        {axpPrice && (
          <View style={styles.axpRow}>
            <Text style={styles.axpPrice}>💎 {axpPrice}</Text>
            {(skin.axpDiscountPercent ?? 0) > 0 && (
              <View style={styles.axpDiscountBadge}>
                <Text style={styles.axpDiscountText}>-{skin.axpDiscountPercent}%</Text>
              </View>
            )}
          </View>
        )}
        <TouchableOpacity
          style={[styles.installBtn, installing && styles.installBtnDisabled]}
          onPress={onInstall}
          disabled={installing}
        >
          {installing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.installBtnText}>
              {skin.priceUsd === 0 || skin.priceUsd == null
                ? t({ en: 'Equip', zh: '装配' })
                : t({ en: 'Buy', zh: '购买' })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sortPillText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  sortPillTextActive: { color: '#fff' },
  clanRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  clanPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clanPillActive: { borderColor: 'transparent' },
  clanPillText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  clanPillTextActive: { color: '#fff', fontWeight: '700' },
  spinner: { marginTop: 60 },
  grid: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 4 },
  gridRow: { gap: 8, justifyContent: 'space-between', marginBottom: 8 },
  card: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '49%',
  },
  thumbWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { fontSize: 52, opacity: 0.7 },
  sourcePill: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sourcePillText: { fontSize: 10, color: '#fff' },
  clanBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clanBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  featuredBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,107,107,0.85)',
  },
  featuredBadgeText: { fontSize: 10 },
  cardBody: { padding: 10, gap: 4 },
  cardName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  socialStatsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  socialStat: { fontSize: 10, color: colors.textMuted },
  cardMeta: { fontSize: 11, color: colors.textMuted },
  axpRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  axpPrice: { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  axpDiscountBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#7C3AED',
  },
  axpDiscountText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  installBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  installBtnDisabled: { opacity: 0.6 },
  installBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  center: { padding: 24, alignItems: 'center', marginTop: 40 },
  emoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
