/**
 * AeonBuildScreen — Aeon 共建建造 UI(Task 4.2 / R10.1/10.2)。
 *
 * 轻量"选目录 → 点格子放置"建造(移动+桌面通用,不依赖原生拖拽手势库)。选中一个
 * 目录项后点网格空位放置;点已有建筑可移除。无效放置(越界/重叠)由后端校验并清晰
 * 提示(R10.2)。布局持久化由后端,重进还原(R10.5)。
 *
 * 美术量产前用 emoji 占位(见 Phase 5.1 概念图);通过后替换为贴图。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { buildImage, AEON_PLOT_GROUND } from '../../components/aeon/aeonAssets';
import {
  getBuildCatalog,
  listBuildItems,
  placeBuildItem,
  removeBuildItem,
} from '../../services/aeon/aeonApi';
import type {
  AeonBuildItemDto,
  AeonBuildCatalogItem,
} from '../../../shared/types/aeon-world';

/** 与后端 AEON_BUILD 对齐(展示用小网格,放置坐标按比例映射)。 */
const GRID_W = 12;
const GRID_H = 12;
const CELL = 26;

export default function AeonBuildScreen() {
  const route = useRoute<any>();
  const plotId: string = route.params?.plotId;
  const displayName: string = route.params?.displayName ?? '我的领地';

  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<AeonBuildCatalogItem[]>([]);
  const [items, setItems] = useState<AeonBuildItemDto[]>([]);
  const [selected, setSelected] = useState<AeonBuildCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const list = await listBuildItems(plotId);
    setItems(list);
  }, [plotId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, list] = await Promise.all([getBuildCatalog(), listBuildItems(plotId)]);
        if (cancelled) return;
        setCatalog(cat);
        setItems(list);
      } catch {
        /* transient */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plotId]);

  /** 某格是否已被占用(用占地矩形判断)。 */
  const itemAt = useCallback(
    (gx: number, gy: number): AeonBuildItemDto | undefined => {
      return items.find((it) => {
        const f = catalog.find((c) => c.catalogId === it.catalogId)?.footprint ?? { w: 1, h: 1 };
        return gx >= it.x && gx < it.x + f.w && gy >= it.y && gy < it.y + f.h;
      });
    },
    [items, catalog],
  );

  const iconOf = useCallback(
    (it: AeonBuildItemDto): string =>
      catalog.find((c) => c.catalogId === it.catalogId)?.icon ?? '📦',
    [catalog],
  );

  const onCellPress = useCallback(
    async (gx: number, gy: number) => {
      if (busy) return;
      const existing = itemAt(gx, gy);
      if (existing) {
        Alert.alert(existing.label, '移除这个建筑?', [
          { text: '取消', style: 'cancel' },
          {
            text: '移除',
            style: 'destructive',
            onPress: async () => {
              setBusy(true);
              try {
                await removeBuildItem(plotId, existing.id);
                await reload();
              } catch (e: any) {
                Alert.alert('移除失败', e?.message ?? '请重试');
              } finally {
                setBusy(false);
              }
            },
          },
        ]);
        return;
      }
      if (!selected) {
        Alert.alert('先选一个建筑', '从下方目录里选一个,再点空格子放置。');
        return;
      }
      setBusy(true);
      try {
        await placeBuildItem(plotId, { catalogId: selected.catalogId, x: gx, y: gy, label: selected.label });
        await reload();
      } catch (e: any) {
        const msg: string = e?.message ?? '';
        if (/权限|permission|forbidden/i.test(msg)) {
          // 不在自己的地块 → 明确告知并引导去自己的领地建造,而不是死在这。
          Alert.alert(
            '这块地不是你的',
            '你只能在自己的领地上建造。回到地图,圈一块属于你的地,再来建造吧。',
          );
        } else {
          Alert.alert('放置失败', msg || '该位置无效(越界或重叠),换个地方试试');
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, itemAt, selected, plotId, reload],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>载入建造数据…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏗️ 建造 · {displayName}</Text>
        <Text style={styles.sub}>
          {selected ? `已选「${selected.label}」· 点空格放置` : '选一个建筑,点空格放置 · 点已有建筑移除'}
        </Text>
      </View>

      {/* 建造网格(铺在 CA-1 晨昏暖光地块底图上) */}
      <ScrollView contentContainerStyle={styles.gridWrap} horizontal showsHorizontalScrollIndicator={false}>
        <ImageBackground source={AEON_PLOT_GROUND} style={styles.gridBg} imageStyle={styles.gridBgImg} resizeMode="cover">
          {Array.from({ length: GRID_H }).map((_, gy) => (
            <View key={gy} style={styles.gridRow}>
              {Array.from({ length: GRID_W }).map((__, gx) => {
                const it = itemAt(gx, gy);
                const isAnchor = it && it.x === gx && it.y === gy;
                const anchorImg = isAnchor ? buildImage(it!.catalogId) : undefined;
                return (
                  <TouchableOpacity
                    key={gx}
                    style={[styles.cell, it ? styles.cellFilled : null]}
                    onPress={() => onCellPress(gx, gy)}
                    activeOpacity={0.6}
                  >
                    {isAnchor && anchorImg ? (
                      <Image source={anchorImg} style={styles.cellImg} resizeMode="contain" />
                    ) : (
                      <Text style={styles.cellIcon}>{isAnchor ? iconOf(it!) : ''}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ImageBackground>
      </ScrollView>

      {/* 目录面板 */}
      <Text style={styles.catHeader}>建筑目录</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {catalog.map((c) => {
          const img = buildImage(c.catalogId);
          return (
            <TouchableOpacity
              key={c.catalogId}
              style={[styles.catItem, selected?.catalogId === c.catalogId ? styles.catItemActive : null]}
              onPress={() => setSelected(selected?.catalogId === c.catalogId ? null : c)}
              activeOpacity={0.7}
            >
              {img ? (
                <Image source={img} style={styles.catImg} resizeMode="contain" />
              ) : (
                <Text style={styles.catIcon}>{c.icon}</Text>
              )}
              <Text style={styles.catLabel} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.catMeta}>
                {c.footprint.w}×{c.footprint.h}{c.functional ? ' · 功能' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 16, paddingBottom: 8 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  gridWrap: { padding: 16 },
  gridBg: { padding: 6, borderRadius: 12, overflow: 'hidden' },
  gridBgImg: { borderRadius: 12, opacity: 0.85 },
  gridRow: { flexDirection: 'row' },
  cell: {
    width: CELL,
    height: CELL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d1326',
  },
  cellFilled: { backgroundColor: '#16213f' },
  cellIcon: { fontSize: 14 },
  cellImg: { width: CELL - 2, height: CELL - 2 },
  dim: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 24, textAlign: 'center', marginTop: 8 },
  catHeader: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 16, marginTop: 8 },
  catRow: { paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  catItem: {
    width: 88,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    alignItems: 'center',
  },
  catItemActive: { borderColor: colors.accent, borderWidth: 2 },
  catIcon: { fontSize: 26, marginBottom: 4 },
  catImg: { width: 48, height: 48, marginBottom: 4 },
  catLabel: { color: colors.textPrimary, fontSize: 11, textAlign: 'center' },
  catMeta: { color: colors.textMuted, fontSize: 9, marginTop: 2 },
});
