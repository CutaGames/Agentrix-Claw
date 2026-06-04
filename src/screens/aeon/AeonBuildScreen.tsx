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
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../theme/colors';
import { buildImage, AEON_PLOT_GROUND } from '../../components/aeon/aeonAssets';
import { uploadChatAttachment } from '../../services/api';
import {
  getBuildCatalog,
  listBuildItems,
  placeBuildItem,
  removeBuildItem,
  listMyBuildableAssets,
  createBuildMaterialFromPhoto,
  type AeonBuildableAsset,
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
  const navigation = useNavigation<any>();
  const plotId: string = route.params?.plotId;
  const displayName: string = route.params?.displayName ?? '我的领地';

  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<AeonBuildCatalogItem[]>([]);
  const [myAssets, setMyAssets] = useState<AeonBuildableAsset[]>([]);
  const [items, setItems] = useState<AeonBuildItemDto[]>([]);
  const [selected, setSelected] = useState<AeonBuildCatalogItem | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AeonBuildableAsset | null>(null);
  const [panelTab, setPanelTab] = useState<'catalog' | 'assets'>('catalog');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const list = await listBuildItems(plotId);
    setItems(list);
  }, [plotId]);

  /** 把选中的图片(相机/相册)上传 → 创建建材 → 刷新「我的素材」。 */
  const ingestPickedImage = useCallback(async (a: ImagePicker.ImagePickerAsset) => {
    try {
      setBusy(true);
      const up = await uploadChatAttachment({
        uri: a.uri,
        name: a.fileName || `material-${Date.now()}.jpg`,
        type: a.mimeType || 'image/jpeg',
      });
      const created = await createBuildMaterialFromPhoto({ name: '我的素材', imageUrl: up.publicUrl });
      setMyAssets((prev) => [created, ...prev]);
      setSelectedAsset(created);
      setSelected(null);
      setPanelTab('assets');
      Alert.alert('素材已就绪', '已加入「我的素材」并选中。点网格空格把它摆进领地。');
    } catch (e: any) {
      Alert.alert('创建素材失败', e?.message ?? '请重试');
    } finally {
      setBusy(false);
    }
  }, []);

  /** 现场拍一张 → 做素材。 */
  const pickFromCamera = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相机权限', '请在系统设置里允许 Agentrix 使用相机,即可现场拍素材。');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (shot.canceled || !shot.assets?.[0]) return;
      await ingestPickedImage(shot.assets[0]);
    } catch (e: any) {
      Alert.alert('拍照失败', e?.message ?? '请重试');
    }
  }, [ingestPickedImage]);

  /** 从相册选一张现成照片 → 做素材。 */
  const pickFromGallery = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      await ingestPickedImage(picked.assets[0]);
    } catch (e: any) {
      Alert.alert('选图失败', e?.message ?? '请重试');
    }
  }, [ingestPickedImage]);

  /** 入口:让用户选「现拍」或「相册选现成照片」(#2 自己准备素材建造)。 */
  const onAddPhotoMaterial = useCallback(() => {
    Alert.alert('做一个素材', '拍一张照片,或从相册选现成的照片,做成可摆放的建材。', [
      { text: '📷 拍一张', onPress: () => void pickFromCamera() },
      { text: '🖼️ 相册选', onPress: () => void pickFromGallery() },
      { text: '取消', style: 'cancel' },
    ]);
  }, [pickFromCamera, pickFromGallery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, list, assets] = await Promise.all([
          getBuildCatalog(),
          listBuildItems(plotId),
          listMyBuildableAssets(true).catch(() => []),
        ]);
        if (cancelled) return;
        setCatalog(cat);
        setItems(list);
        setMyAssets(assets);
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

  /** 已放置的用户素材项 → 缩略图 URL(渲染贴图而非 📦)。 */
  const assetThumbOf = useCallback(
    (it: AeonBuildItemDto): string | null => {
      if (!it.sourceAssetId) return null;
      return myAssets.find((a) => a.id === it.sourceAssetId)?.thumbnailUrl ?? null;
    },
    [myAssets],
  );

  const onCellPress = useCallback(
    async (gx: number, gy: number) => {
      if (busy) return;
      const existing = itemAt(gx, gy);
      if (existing) {
        const enterable = existing.linksToKind === 'room' && !!existing.linksToId;
        const buttons: any[] = [{ text: '取消', style: 'cancel' }];
        if (enterable) {
          buttons.push({
            text: '进入',
            onPress: () =>
              navigation.navigate('AeonScene', { plotId, displayName: existing.label, roomId: existing.linksToId! }),
          });
        }
        buttons.push({
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
        });
        Alert.alert(existing.label, enterable ? '进入这栋建筑,或移除它?' : '移除这个建筑?', buttons);
        return;
      }
      if (!selected && !selectedAsset) {
        Alert.alert('先选一个建筑', '从下方目录或「我的素材」里选一个,再点空格子放置。');
        return;
      }
      setBusy(true);
      try {
        if (selectedAsset) {
          await placeBuildItem(plotId, {
            sourceAssetId: selectedAsset.id,
            x: gx,
            y: gy,
            label: selectedAsset.name,
          });
        } else if (selected) {
          await placeBuildItem(plotId, { catalogId: selected.catalogId, x: gx, y: gy, label: selected.label });
        }
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
    [busy, itemAt, selected, selectedAsset, plotId, reload, navigation],
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
          {selectedAsset
            ? `已选我的素材「${selectedAsset.name}」· 点空格放置`
            : selected
            ? `已选「${selected.label}」· 点空格放置`
            : '选一个建筑/素材,点空格放置 · 点已有建筑移除'}
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
                const assetThumb = isAnchor ? assetThumbOf(it!) : null;
                return (
                  <TouchableOpacity
                    key={gx}
                    style={[styles.cell, it ? styles.cellFilled : null]}
                    onPress={() => onCellPress(gx, gy)}
                    activeOpacity={0.6}
                  >
                    {isAnchor && assetThumb ? (
                      <Image source={{ uri: assetThumb }} style={styles.cellImg} resizeMode="cover" />
                    ) : isAnchor && anchorImg ? (
                      <Image source={anchorImg} style={styles.cellImg} resizeMode="contain" />
                    ) : (
                      <Text style={styles.cellIcon}>{isAnchor ? (it!.sourceAssetId ? '🧩' : iconOf(it!)) : ''}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ImageBackground>
      </ScrollView>

      {/* 面板:建筑目录 / 我的素材(#2 共建) */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, panelTab === 'catalog' && styles.tabActive]}
          onPress={() => setPanelTab('catalog')}
        >
          <Text style={[styles.tabText, panelTab === 'catalog' && styles.tabTextActive]}>建筑目录</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, panelTab === 'assets' && styles.tabActive]}
          onPress={() => setPanelTab('assets')}
        >
          <Text style={[styles.tabText, panelTab === 'assets' && styles.tabTextActive]}>我的素材{myAssets.length ? ` (${myAssets.length})` : ''}</Text>
        </TouchableOpacity>
      </View>

      {panelTab === 'catalog' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {catalog.map((c) => {
            const img = buildImage(c.catalogId);
            return (
              <TouchableOpacity
                key={c.catalogId}
                style={[styles.catItem, !selectedAsset && selected?.catalogId === c.catalogId ? styles.catItemActive : null]}
                onPress={() => {
                  setSelectedAsset(null);
                  setSelected(selected?.catalogId === c.catalogId ? null : c);
                }}
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
      ) : myAssets.length === 0 ? (
        <View style={styles.assetsEmpty}>
          <Text style={styles.assetsEmptyText}>
            还没有任何资产。点下方「📷 拍照/选图做素材」拍下(或从相册选)你想摆进领地的东西(招牌、桌椅、摆件…),
            就能在这里把它摆进你的领地 —— 这才是真·共建。
          </Text>
          <TouchableOpacity style={styles.photoMatBtn} onPress={onAddPhotoMaterial} disabled={busy}>
            <Text style={styles.photoMatBtnText}>📷 拍照/选图做素材</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          <TouchableOpacity style={styles.photoMatCard} onPress={onAddPhotoMaterial} disabled={busy} activeOpacity={0.7}>
            <Text style={styles.photoMatIcon}>📷</Text>
            <Text style={styles.photoMatLabel}>拍照/选图</Text>
          </TouchableOpacity>
          {myAssets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.catItem, selectedAsset?.id === a.id ? styles.catItemActive : null]}
              onPress={() => {
                setSelected(null);
                setSelectedAsset(selectedAsset?.id === a.id ? null : a);
              }}
              activeOpacity={0.7}
            >
              {a.thumbnailUrl ? (
                <Image source={{ uri: a.thumbnailUrl }} style={styles.catImg} resizeMode="cover" />
              ) : (
                <Text style={styles.catIcon}>🧩</Text>
              )}
              <Text style={styles.catLabel} numberOfLines={1}>{a.name}</Text>
              <Text style={styles.catMeta}>{a.usageKind === 'decor' ? '装饰' : a.usageKind === 'build_material' ? '建材' : '资产'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
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
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 8, marginBottom: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  assetsEmpty: { paddingHorizontal: 24, paddingVertical: 20 },
  assetsEmptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  photoMatBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  photoMatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  photoMatCard: { width: 88, backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 12, borderWidth: 1, borderColor: colors.accent, borderStyle: 'dashed', padding: 10, alignItems: 'center', justifyContent: 'center' },
  photoMatIcon: { fontSize: 26, marginBottom: 4 },
  photoMatLabel: { color: colors.accent, fontSize: 11, fontWeight: '700', textAlign: 'center' },
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
