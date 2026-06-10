/** LandPlotsScreen — 地块经济:获取/上架地块 (v6 R2) */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getMapViewport, acquirePlot, listPlotForSale } from '../../services/worldCreationApi';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { PLOT_PRICE_AXP_MIN, PLOT_PRICE_AXP_MAX } from '../../../shared/types/world-creation';
import type { SubstrateTier, PlotSaleType } from '../../../shared/types/world-creation';
import type { MapPlotSummary } from '../../../shared/types/world-creation-api';

// Viewport window pulled on focus (R1.1) — a centered 17×17 grid around origin.
const VIEWPORT = { minX: -8, minY: -8, maxX: 8, maxY: 8 };

// Tiers a creator may declare when acquiring an empty Plot (R2.7).
const TIERS: SubstrateTier[] = ['A', 'B', 'C'];

export default function LandPlotsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  const [plots, setPlots] = useState<MapPlotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlotId, setBusyPlotId] = useState<string | null>(null);

  // Sale-listing modal state (R2.4).
  const [listTarget, setListTarget] = useState<MapPlotSummary | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [saleType, setSaleType] = useState<PlotSaleType>('first');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const res = await getMapViewport(VIEWPORT);
          if (!cancelled) setPlots(res.plots ?? []);
        } catch (e: any) {
          if (!cancelled) {
            setPlots([]);
            Alert.alert(
              t({ en: 'Failed to load map', zh: '地图加载失败' }),
              e?.message || t({ en: 'Please try again later.', zh: '请稍后再试。' }),
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [t]),
  );

  // Acquire an empty/draft Plot with a chosen Tier (R2.2 / R2.3).
  const doAcquire = useCallback(
    async (plot: MapPlotSummary, substrateTier: SubstrateTier) => {
      setBusyPlotId(plot.plotId);
      try {
        const res = await acquirePlot({
          plotId: plot.plotId,
          substrateTier,
          // MapPlotSummary carries no version field; send 0 — the backend
          // validates the optimistic-lock version on acquire (PLOT_TAKEN on race).
          expectedVersion: 0,
        });
        if (res.acquired) {
          Alert.alert(
            t({ en: 'Plot acquired', zh: '地块获取成功' }),
            t({
              en: `You now own ${plot.title}. Start creating?`,
              zh: `你已拥有「${plot.title}」。开始创作?`,
            }),
            [
              { text: t({ en: 'Later', zh: '稍后' }), style: 'cancel' },
              {
                text: t({ en: 'Go create', zh: '去创作' }),
                onPress: () => navigation.navigate('PlotCreator', { plotId: plot.plotId, substrateTier }),
              },
            ],
          );
        } else {
          Alert.alert(
            t({ en: 'Could not acquire', zh: '获取失败' }),
            res.error?.detail || t({ en: 'This plot is no longer available.', zh: '该地块已不可用。' }),
          );
        }
      } catch (e: any) {
        Alert.alert(t({ en: 'Acquire failed', zh: '获取失败' }), e?.message || '');
      } finally {
        setBusyPlotId(null);
      }
    },
    [navigation, t],
  );

  // Prompt the Tier picker (A/B/C) before acquiring.
  const onAcquire = useCallback(
    (plot: MapPlotSummary) => {
      Alert.alert(
        t({ en: 'Choose substrate tier', zh: '选择世界层级' }),
        t({
          en: 'A: declarative · B: rules · C: sandboxed logic',
          zh: 'A:声明式 · B:规则 · C:沙盒逻辑',
        }),
        [
          ...TIERS.map((tier) => ({
            text: t({ en: `Tier ${tier}`, zh: `层级 ${tier}` }),
            onPress: () => doAcquire(plot, tier),
          })),
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' as const },
        ],
      );
    },
    [doAcquire, t],
  );

  // Confirm a sale listing from the modal (R2.4).
  const submitListing = useCallback(async () => {
    if (!listTarget) return;
    const price = Number(priceInput);
    if (!Number.isFinite(price) || price < PLOT_PRICE_AXP_MIN || price > PLOT_PRICE_AXP_MAX) {
      Alert.alert(
        t({ en: 'Invalid price', zh: '价格无效' }),
        t({
          en: `Enter an AXP price between ${PLOT_PRICE_AXP_MIN} and ${PLOT_PRICE_AXP_MAX}.`,
          zh: `请输入 ${PLOT_PRICE_AXP_MIN} 到 ${PLOT_PRICE_AXP_MAX} 之间的 AXP 价格。`,
        }),
      );
      return;
    }
    const plotId = listTarget.plotId;
    setBusyPlotId(plotId);
    try {
      const res = await listPlotForSale(plotId, { price, currency: 'AXP', saleType });
      setListTarget(null);
      setPriceInput('');
      Alert.alert(
        t({ en: 'Listed for sale', zh: '已上架出售' }),
        t({
          en: `Listing ${res.listingId} · status ${res.status}`,
          zh: `挂单 ${res.listingId} · 状态 ${res.status}`,
        }),
      );
    } catch (e: any) {
      Alert.alert(t({ en: 'Listing failed', zh: '上架失败' }), e?.message || '');
    } finally {
      setBusyPlotId(null);
    }
  }, [listTarget, priceInput, saleType, t]);

  const renderPlot = (plot: MapPlotSummary) => {
    const isDraft = plot.status === 'draft';
    const busy = busyPlotId === plot.plotId;
    return (
      <View key={plot.plotId} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {plot.title || plot.plotId}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{plot.status}</Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>
          {plot.plotId} · Tier {plot.substrateTier} · ({plot.mapX}, {plot.mapY})
        </Text>
        <View style={styles.cardActions}>
          {/* Empty/draft plots can be acquired to begin creating (R2.2). */}
          {isDraft ? (
            <TouchableOpacity
              testID={`land-acquire-${plot.plotId}`}
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              onPress={() => onAcquire(plot)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.actionBtnText}>{t({ en: 'Acquire this plot', zh: '获取此地块' })}</Text>
              )}
            </TouchableOpacity>
          ) : (
            // MapPlotSummary exposes no owner id; simplify by offering "list for
            // sale" on all non-draft plots — the backend enforces ownership (R2.4).
            <TouchableOpacity
              testID={`land-list-${plot.plotId}`}
              style={[styles.actionBtn, styles.actionBtnAlt, busy && styles.actionBtnDisabled]}
              onPress={() => {
                setListTarget(plot);
                setPriceInput('');
                setSaleType('first');
              }}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.actionBtnAltText}>{t({ en: 'List for sale', zh: '上架出售' })}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t({ en: 'Plots', zh: '地块' })}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          testID="land-plots-scroll"
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {plots.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>{t({ en: 'No plots in view', zh: '视口内暂无地块' })}</Text>
              <Text style={styles.emptySub}>
                {t({ en: 'Move around the map to find empty land.', zh: '在地图上移动以寻找空地块。' })}
              </Text>
            </View>
          ) : (
            plots.map(renderPlot)
          )}
        </ScrollView>
      )}

      {/* Sale-listing modal: AXP price + sale type (R2.4). */}
      <Modal visible={listTarget !== null} transparent animationType="fade" onRequestClose={() => setListTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t({ en: 'List plot for sale', zh: '上架地块出售' })}</Text>
            <Text style={styles.modalMeta} numberOfLines={1}>
              {listTarget?.title || listTarget?.plotId}
            </Text>

            <Text style={styles.fieldLabel}>{t({ en: 'Price (AXP)', zh: '价格(AXP)' })}</Text>
            <TextInput
              style={styles.input}
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="numeric"
              placeholder={`${PLOT_PRICE_AXP_MIN} – ${PLOT_PRICE_AXP_MAX}`}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>{t({ en: 'Sale type', zh: '出售类型' })}</Text>
            <View style={styles.segment}>
              {(['first', 'secondary'] as PlotSaleType[]).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.segmentItem, saleType === st && styles.segmentItemActive]}
                  onPress={() => setSaleType(st)}
                >
                  <Text style={[styles.segmentText, saleType === st && styles.segmentTextActive]}>
                    {st === 'first' ? t({ en: 'First sale', zh: '首次出售' }) : t({ en: 'Secondary', zh: '二次出售' })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setListTarget(null)}>
                <Text style={styles.modalCancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, busyPlotId === listTarget?.plotId && styles.actionBtnDisabled]}
                onPress={submitListing}
                disabled={busyPlotId === listTarget?.plotId}
              >
                {busyPlotId === listTarget?.plotId ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.modalConfirmText}>{t({ en: 'List', zh: '上架' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 60, gap: 10 },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: colors.bgSecondary, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  badge: { backgroundColor: colors.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  cardActions: { marginTop: 12 },
  actionBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  actionBtnText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },
  actionBtnAlt: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.accent },
  actionBtnAltText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  actionBtnDisabled: { opacity: 0.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { width: '100%', backgroundColor: colors.bgCard, borderRadius: 16, padding: 20 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  modalMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.input, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: colors.textInverse, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.cardAlt, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center' },
  modalConfirmText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },
});
