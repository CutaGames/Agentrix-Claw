/**
 * SkinAuctionScreen — Sprint E5 Phase 1 MVP.
 *
 * Plaza · Pets · Skins. Lists platform + generated + remixed skins from
 * `/pet-skin/marketplace` with sort/filter. Tap a skin → detail screen
 * (future: Sprint E5b). Install button wires to `POST /pet-skin/...install`.
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §5.3 Loop 3 + §6.
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
} from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchSkinMarketplace,
  installSkin,
  SkinDto,
  SkinSort,
} from '../../services/petSkinMarketplace.api';

const PAGE_SIZE = 20;
const SORTS: SkinSort[] = ['newest', 'price_asc', 'price_desc', 'name_asc'];
const SORT_LABEL_EN: Record<SkinSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  price_asc: 'Price ↑',
  price_desc: 'Price ↓',
  name_asc: 'Name',
};
const SORT_LABEL_ZH: Record<SkinSort, string> = {
  newest: '最新',
  oldest: '最早',
  price_asc: '价 ↑',
  price_desc: '价 ↓',
  name_asc: '名字',
};

function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return '—';
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(cents < 100 ? 2 : 0)}`;
}

export function SkinAuctionScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<SkinSort>('newest');

  const query = useInfiniteQuery({
    queryKey: ['skin-marketplace', sort],
    queryFn: ({ pageParam = 0 }) =>
      fetchSkinMarketplace({ limit: PAGE_SIZE, offset: pageParam, sort }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((s, p) => s + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    retry: 1,
    staleTime: 30_000,
  });

  const installMut = useMutation({
    mutationFn: (skin: SkinDto) => installSkin(skin.id),
    onSuccess: (r, skin) => {
      if (r.ok === false) {
        Alert.alert(t({ en: 'Install failed', zh: '安装失败' }), r.error ?? 'unknown');
        return;
      }
      Alert.alert(
        t({ en: 'Installed', zh: '已安装' }),
        t({ en: `${skin.name} is now equipped on your pet.`, zh: `${skin.name} 已装配到主宠` }),
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
  skin: SkinDto;
  onInstall: () => void;
  installing: boolean;
  t: any;
}) {
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
        <View style={styles.sourcePill}>
          <Text style={styles.sourcePillText}>
            {skin.source === 'platform' ? '⭐' : skin.source === 'generated' ? '✨' : '🔄'}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {skin.name}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {skin.format.toUpperCase()} · {formatPrice(skin.priceCents)}
        </Text>
        <TouchableOpacity
          style={[styles.installBtn, installing && styles.installBtnDisabled]}
          onPress={onInstall}
          disabled={installing}
        >
          {installing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.installBtnText}>
              {skin.priceCents === 0
                ? t({ en: 'Equip', zh: '装配' })
                : t({ en: 'Install', zh: '安装' })}
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
  cardBody: { padding: 10, gap: 6 },
  cardName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  cardMeta: { fontSize: 11, color: colors.textMuted },
  installBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  installBtnDisabled: { opacity: 0.6 },
  installBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  center: { padding: 24, alignItems: 'center', marginTop: 40 },
  emoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 13, color: colors.error, textAlign: 'center' },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
