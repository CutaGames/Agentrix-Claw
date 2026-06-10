/** PlotExperienceScreen — Plot 内层体验宿主 (v6 R1.4/R1.7/R9/R15) */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { enterPlot, requestCharge } from '../../services/worldCreationApi';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import type {
  EnterPlotResponse,
  ReadonlyAssetHandle,
} from '../../../shared/types/world-creation-api';
import type { EcsEntity } from '../../../shared/types/world-creation';

/** Local Plot load timeout (R1.7) — fall back to the map view after 10s. */
const LOAD_TIMEOUT_MS = 10_000;

/** A purchasable good = an ECS entity that carries a `price` component (B-tier supermarket). */
interface PlotGood {
  entity: EcsEntity;
  axp?: number;
}

export default function PlotExperienceScreen() {
  const route = useRoute<any>();
  const { plotId, title } = route.params ?? {};
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [session, setSession] = useState<EnterPlotResponse | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  // Enter the Plot on focus, racing a 10s timeout, guarded against re-focus races (R1.4/R1.7).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      setLoading(true);
      setFailReason(null);
      setSession(null);

      if (!plotId) {
        setFailReason(t({ en: 'Missing plot id.', zh: '缺少 Plot 标识。' }));
        setLoading(false);
        return () => {
          cancelled = true;
        };
      }

      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LOAD_TIMEOUT')), LOAD_TIMEOUT_MS);
      });

      Promise.race([enterPlot(plotId), timeout])
        .then((res) => {
          if (cancelled) return;
          setSession(res as EnterPlotResponse);
          setLoading(false);
        })
        .catch((e: any) => {
          if (cancelled) return;
          const isTimeout = e?.message === 'LOAD_TIMEOUT';
          setFailReason(
            isTimeout
              ? t({ en: 'LOAD_TIMEOUT — failed to enter within 10s.', zh: 'LOAD_TIMEOUT —— 10 秒内未能进入。' })
              : e?.message || t({ en: 'Failed to enter this plot.', zh: '进入该 Plot 失败。' }),
          );
          setLoading(false);
        });

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }, [plotId, t]),
  );

  const onBuy = useCallback(
    async (good: PlotGood) => {
      if (!plotId) return;
      const entityId = good.entity.id;
      try {
        setBuyingId(entityId);
        const res = await requestCharge({
          plotId,
          visitorAccountId: 'self',
          amountRef: entityId,
          displayHintAmount: good.entity.components.price?.axp,
        });
        if (res.ok === true) {
          Alert.alert(
            t({ en: 'Purchase complete', zh: '购买成功' }),
            t({
              en: `Server-authoritative amount charged: ${res.authoritativeAmount ?? 0} AXP. (The sandbox display price is only a hint.)`,
              zh: `服务端权威金额已扣除:${res.authoritativeAmount ?? 0} AXP。(沙箱显示价仅为提示。)`,
            }),
          );
        } else {
          Alert.alert(
            t({ en: 'Purchase rejected', zh: '购买被拒绝' }),
            t({
              en: `${res.error?.detail ?? 'ECONOMY_REJECTED'} — your balance is unchanged.`,
              zh: `${res.error?.detail ?? 'ECONOMY_REJECTED'} —— 余额未变动。`,
            }),
          );
        }
      } catch (e: any) {
        Alert.alert(
          t({ en: 'Purchase failed', zh: '购买失败' }),
          (e?.message || '') + t({ en: ' — your balance is unchanged.', zh: ' —— 余额未变动。' }),
        );
      } finally {
        setBuyingId(null);
      }
    },
    [plotId, t],
  );

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.centeredText}>{t({ en: 'Entering plot…', zh: '正在进入 Plot…' })}</Text>
        </View>
      </View>
    );
  }

  // ── Enter failed / timed out → reason + back to map (R1.7) ──
  if (failReason || !session) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.failIcon}>⚠️</Text>
          <Text style={styles.failTitle}>{t({ en: 'Could not enter', zh: '无法进入' })}</Text>
          <Text style={styles.failReason}>
            {failReason || t({ en: 'No session was returned.', zh: '未返回会话。' })}
          </Text>
          <TouchableOpacity
            testID="plot-back-to-map"
            style={styles.backToMapBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backToMapText}>{t({ en: 'Back to map', zh: '返回地图' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Success ────────────────────────────────────────────────
  const ecsWorld = session.ecsWorld;
  const entities: EcsEntity[] = ecsWorld?.entities ?? [];
  const handles: ReadonlyAssetHandle[] = session.readonlyAssetHandles ?? [];
  const goods: PlotGood[] = entities
    .filter((e) => e.components?.price)
    .map((e) => ({ entity: e, axp: e.components.price?.axp }));

  const kindLabel = (kind: ReadonlyAssetHandle['kind']) => {
    switch (kind) {
      case 'soul':
        return t({ en: 'Soul', zh: '灵魂' });
      case 'pet':
        return t({ en: 'Pet', zh: '宠物' });
      default:
        return t({ en: 'World asset', zh: '世界资产' });
    }
  };

  return (
    <View style={styles.container}>
      {/* Top back button */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView testID="plot-experience-scroll" contentContainerStyle={styles.scrollContent}>
        {/* Header: title + isolation badge + substrate tier */}
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {title || ecsWorld?.meta?.title || t({ en: 'Plot experience', zh: 'Plot 体验' })}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{session.isolationLevel}</Text>
            </View>
            <View style={[styles.badge, styles.tierBadge]}>
              <Text style={styles.badgeText}>
                {t({ en: 'Tier', zh: '基底' })} {ecsWorld?.substrateTier}
              </Text>
            </View>
          </View>
        </View>

        {/* Goods / checkout (B-tier supermarket) */}
        {goods.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              🛒 {t({ en: 'Goods & checkout', zh: '商品 / 结账' })}
            </Text>
            {goods.map((good) => {
              const e = good.entity;
              const name = e.components.ui?.text || e.id;
              const busy = buyingId === e.id;
              return (
                <View key={e.id} style={styles.goodRow}>
                  <View style={styles.goodInfo}>
                    <Text style={styles.goodName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.goodPrice}>
                      {good.axp != null ? `${good.axp} AXP` : t({ en: 'No price', zh: '无价格' })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`plot-buy-${e.id}`}
                    style={[styles.buyBtn, busy && styles.buyBtnDisabled]}
                    disabled={busy}
                    onPress={() => onBuy(good)}
                  >
                    <Text style={styles.buyBtnText}>
                      {busy ? '…' : t({ en: 'Buy', zh: '购买' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <Text style={styles.note}>
              {t({
                en: 'Prices shown are sandbox hints; the server computes the authoritative amount.',
                zh: '显示价为沙箱提示;服务端计算权威金额。',
              })}
            </Text>
          </View>
        )}

        {/* Read-only asset handles (R9.1) */}
        {handles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              🎒 {t({ en: 'Carried assets (read-only)', zh: '携带资产(只读)' })}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.handleScroll}>
              {handles.map((h) => (
                <View key={h.assetId} style={styles.handleCard}>
                  <Text style={styles.handleName} numberOfLines={1}>{h.name}</Text>
                  <Text style={styles.handleKind}>{kindLabel(h.kind)}</Text>
                  <Text style={styles.handleReadonly}>{t({ en: 'read-only', zh: '只读' })}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ECS_World entity list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            🧱 {t({ en: 'ECS_World entities', zh: 'ECS_World 实体' })} ({entities.length})
          </Text>
          {entities.length === 0 ? (
            <Text style={styles.note}>{t({ en: 'This world has no entities.', zh: '该世界没有实体。' })}</Text>
          ) : (
            entities.map((e) => {
              const compNames = Object.keys(e.components ?? {});
              const preset = e.components.mesh?.preset;
              const uiText = e.components.ui?.text;
              const priceAxp = e.components.price?.axp;
              return (
                <View key={e.id} style={styles.entityRow}>
                  <Text style={styles.entityId}>{e.id}</Text>
                  <Text style={styles.entityComps} numberOfLines={2}>
                    {compNames.join(', ') || t({ en: '(no components)', zh: '(无组件)' })}
                  </Text>
                  {(preset || uiText || priceAxp != null) && (
                    <Text style={styles.entityExtra} numberOfLines={2}>
                      {[
                        preset ? `mesh.preset=${preset}` : null,
                        uiText ? `ui.text=${uiText}` : null,
                        priceAxp != null ? `price.axp=${priceAxp}` : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  centeredText: { color: colors.textSecondary, fontSize: 14 },

  failIcon: { fontSize: 48 },
  failTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  failReason: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  backToMapBtn: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  backToMapText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  backBtn: { paddingVertical: 6, paddingRight: 8 },
  backBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

  headerRow: { marginBottom: 16 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { backgroundColor: colors.bgSecondary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  tierBadge: { backgroundColor: colors.cardAlt },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '700' },

  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 },

  goodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 12, marginBottom: 10 },
  goodInfo: { flex: 1 },
  goodName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  goodPrice: { color: colors.accent, fontSize: 14, fontWeight: '800', marginTop: 4 },
  buyBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginLeft: 8 },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },

  handleScroll: { flexDirection: 'row' },
  handleCard: { backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 12, marginRight: 10, minWidth: 120, borderWidth: 1, borderColor: colors.border },
  handleName: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  handleKind: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  handleReadonly: { color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: 'italic' },

  entityRow: { backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 12, marginBottom: 10 },
  entityId: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  entityComps: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  entityExtra: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
});
