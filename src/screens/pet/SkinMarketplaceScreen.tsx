/**
 * SkinMarketplaceScreen — Mobile · V4 §3.2
 *
 *   GET  /v1/pet/skins/marketplace
 *   POST /v1/pet/skins/marketplace/:id/install
 *
 * Mirrors web /console/marketplace/skins.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import {
  type PetSkinSummary,
  listMarketplaceSkins,
  installMarketplaceSkin,
} from '../../services/mobilePetSdk';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/useTheme';

const PAGE_SIZE = 30;

type SourceFilter = 'all' | 'platform' | 'generated' | 'remixed';

const FILTERS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'platform', label: '官方' },
  { id: 'generated', label: '社区' },
  { id: 'remixed', label: '混合' },
];

export function SkinMarketplaceScreen() {
  const [items, setItems] = useState<PetSkinSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [source, setSource] = useState<SourceFilter>('all');
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMarketplaceSkins({
        limit: PAGE_SIZE,
        offset,
        source: source === 'all' ? undefined : source,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [offset, source]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onInstall = useCallback(
    async (skinId: string) => {
      if (installingId || installedIds.has(skinId)) return;
      const skin = items.find((s) => s.id === skinId);
      const priceCents = skin?.price_cents ?? 0;
      const proceed = async () => {
        setInstallingId(skinId);
        try {
          await installMarketplaceSkin(skinId, priceCents > 0 ? priceCents : undefined);
          setInstalledIds((prev) => {
            const next = new Set(prev);
            next.add(skinId);
            return next;
          });
        } catch (err: any) {
          const msg = err?.message || String(err);
          Alert.alert('安装失败', msg);
        } finally {
          setInstallingId(null);
        }
      };
      if (priceCents > 0) {
        Alert.alert(
          '确认购买',
          `该皮肤售价 $${(priceCents / 100).toFixed(2)}，是否继续？`,
          [
            { text: '取消', style: 'cancel' },
            { text: '购买', onPress: () => void proceed() },
          ],
        );
        return;
      }
      await proceed();
    },
    [installingId, installedIds, items],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="skin-marketplace-screen"
    >
      <Text style={styles.subtitle}>浏览社区与官方皮肤，一键安装到你的衣柜。</Text>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = source === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => {
                setSource(f.id);
                setOffset(0);
              }}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              testID={`market-filter-${f.id}`}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>暂无可安装的皮肤</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {items.map((skin) => {
            const installed = installedIds.has(skin.id);
            const busy = installingId === skin.id;
            return (
              <View key={skin.id} style={styles.card} testID={`market-skin-${skin.id}`}>
                <View style={styles.thumbBox}>
                  {skin.thumbnail_url ? (
                    <Image
                      source={{ uri: skin.thumbnail_url }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.thumbEmoji}>{skin.format === 'vrm' ? '🧸' : '🐾'}</Text>
                  )}
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {skin.display_name}
                </Text>
                <Text style={styles.cardMeta}>
                  {skin.format.toUpperCase()} · {skin.source}
                </Text>
                <Text
                  style={[
                    styles.cardPrice,
                    (skin.price_cents ?? 0) > 0 ? styles.cardPricePaid : styles.cardPriceFree,
                  ]}
                  testID={`market-price-${skin.id}`}
                >
                  {(skin.price_cents ?? 0) > 0
                    ? `$${((skin.price_cents ?? 0) / 100).toFixed(2)}`
                    : '免费'}
                </Text>
                <Pressable
                  disabled={installed || busy}
                  onPress={() => onInstall(skin.id)}
                  style={[styles.installBtn, installed && styles.installBtnDone]}
                  testID={`market-install-${skin.id}`}
                >
                  <Text style={styles.installBtnText}>
                    {installed ? '✓ 已安装' : busy ? '安装中…' : '安装到衣柜'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {total > PAGE_SIZE && (
        <View style={styles.pager}>
          <Pressable
            disabled={offset === 0}
            onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={[styles.pagerBtn, offset === 0 && styles.pagerBtnDisabled]}
            testID="market-prev"
          >
            <Text style={styles.pagerText}>← 上一页</Text>
          </Pressable>
          <Text style={styles.pagerInfo}>
            {currentPage} / {totalPages}
          </Text>
          <Pressable
            disabled={offset + PAGE_SIZE >= total}
            onPress={() => setOffset(offset + PAGE_SIZE)}
            style={[styles.pagerBtn, offset + PAGE_SIZE >= total && styles.pagerBtnDisabled]}
            testID="market-next"
          >
            <Text style={styles.pagerText}>下一页 →</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    borderColor: 'rgba(0,212,255,0.55)',
    backgroundColor: 'rgba(0,212,255,0.12)',
  },
  filterText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: colors.accent },
  errorBox: {
    backgroundColor: 'rgba(127,29,29,0.28)',
    borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: { color: '#fecaca', fontSize: 13 },
  emptyBox: { backgroundColor: colors.cardBackground, padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '48%',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  thumbBox: {
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 48 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 8 },
  cardPrice: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  cardPricePaid: { color: colors.accent },
  cardPriceFree: { color: '#86efac' },
  installBtn: { backgroundColor: colors.accent, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  installBtnDone: { opacity: 0.55 },
  installBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  pager: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 },
  pagerBtn: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  pagerInfo: { color: colors.textMuted, fontSize: 12 },
}));

export default SkinMarketplaceScreen;
