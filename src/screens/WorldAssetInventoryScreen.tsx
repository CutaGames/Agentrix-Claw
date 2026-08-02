/**
 * WorldAssetInventoryScreen — World Asset collection management.
 *
 * Task 15.1: Implement World Asset Inventory screen
 *
 * Features:
 * - Grid view with 3D thumbnails, name, level, battle record
 * - Filtering (category, source) and sorting (newest, level, battles)
 * - Detail view with rotatable 3D model, stats, skills, battle history, Agent activity log
 * - Long-press context menu: rename, regenerate, bind/unbind Agent, list for sale, gift, delete
 * - Empty state with prompt to Reality Scanner
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  Platform,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  listWorldAssets,
  deleteWorldAsset,
  updateWorldAsset,
  bindAgentToAsset,
  unbindAgentFromAsset,
  regenerateWorldAssetAttribute,
  incarnateAsset,
  type WorldAssetSummary as ApiWorldAssetSummary,
} from '../services/worldEngineApi';

// ============================================================
// Types
// ============================================================

interface WorldAssetSummary {
  id: string;
  name: string;
  category: 'character' | 'dungeon' | 'weapon';
  level: number;
  battleWins: number;
  battleLosses: number;
  styledMeshUrl: string;
  portraitUrl?: string | null;
  styleType: string;
  boundAgentId: string | null;
  source: 'scanned' | 'purchased' | 'gifted';
  createdAt: string;
}

type SortOption = 'newest' | 'level' | 'battles';
type FilterCategory = 'all' | 'character' | 'dungeon' | 'weapon';
type FilterSource = 'all' | 'scanned' | 'purchased' | 'gifted';

// ============================================================
// Constants
// ============================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLUMNS = 2;
const GRID_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - GRID_GAP) / GRID_COLUMNS;

// ============================================================
// Component
// ============================================================

export default function WorldAssetInventoryScreen() {
  const navigation = useNavigation<any>();

  // State
  const [assets, setAssets] = useState<WorldAssetSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterSource, setFilterSource] = useState<FilterSource>('all');

  // Sprint P-8: rename modal state
  const [renameAsset, setRenameAsset] = useState<WorldAssetSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // ─── Data fetching ───────────────────────────────────────────────────

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      // Sprint P-8 (2026-05-22): real backend call replaces the
      // empty-state stub. The backend handles filtering and sorting
      // server-side; we still apply local sort for instant feedback
      // when the chip changes between fetches.
      const response = await listWorldAssets({
        category: filterCategory !== 'all' ? filterCategory : undefined,
        source: filterSource !== 'all' ? filterSource : undefined,
        sort: sortBy,
        limit: 100,
      });
      const items = (response.items ?? []) as unknown as WorldAssetSummary[];
      setAssets(items);
    } catch (error: any) {
      console.error('Failed to fetch assets:', error);
      // Don't blow up the UI; just show empty state.
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [sortBy, filterCategory, filterSource]);

  // Refetch on focus + when filters change.
  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  useFocusEffect(
    useCallback(() => {
      void fetchAssets();
    }, [fetchAssets]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchAssets();
    setIsRefreshing(false);
  }, [fetchAssets]);

  // ─── Filtered & sorted assets ────────────────────────────────────────

  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (filterCategory !== 'all') {
      result = result.filter((a) => a.category === filterCategory);
    }
    if (filterSource !== 'all') {
      result = result.filter((a) => a.source === filterSource);
    }

    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'level':
        result.sort((a, b) => b.level - a.level);
        break;
      case 'battles':
        result.sort((a, b) => (b.battleWins + b.battleLosses) - (a.battleWins + a.battleLosses));
        break;
    }

    return result;
  }, [assets, filterCategory, filterSource, sortBy]);

  // ─── Long-press context menu ─────────────────────────────────────────

  const handleLongPress = useCallback((asset: WorldAssetSummary) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const options = [
      { text: '重命名', action: () => handleRename(asset) },
      { text: '重新生成', action: () => handleRegenerate(asset) },
      asset.boundAgentId
        ? { text: '解绑 Agent', action: () => handleUnbindAgent(asset) }
        : { text: '绑定 Agent', action: () => handleBindAgent(asset) },
      { text: '🦊 化身主宠', action: () => handleIncarnate(asset) },
      { text: '上架出售', action: () => handleListForSale(asset) },
      { text: '赠送', action: () => handleGift(asset) },
      { text: '删除', action: () => handleDelete(asset), destructive: true },
    ];

    Alert.alert(
      asset.name,
      `Lv.${asset.level} | ${asset.battleWins}W/${asset.battleLosses}L`,
      [
        ...options.map((opt) => ({
          text: opt.text,
          onPress: opt.action,
          style: (opt as any).destructive ? ('destructive' as const) : ('default' as const),
        })),
        { text: '取消', style: 'cancel' },
      ],
    );
  }, []);

  // ─── Action handlers ─────────────────────────────────────────────────

  const handleRename = (asset: WorldAssetSummary) => {
    // Sprint P-8: open the rename modal (defined below in the render tree).
    setRenameAsset(asset);
    setRenameDraft(asset.name);
  };

  const handleIncarnate = useCallback((asset: WorldAssetSummary) => {
    Alert.alert(
      '🦊 化身主宠',
      `把「${asset.name}」化身为你主宠的世界形态?灵魂(亲密度/情绪/记忆)会延续到这个角色上。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '化身',
          onPress: async () => {
            try {
              const r = await incarnateAsset(asset.id);
              Alert.alert(
                '化身成功',
                `你的主宠「${r.petName}」(亲密度 Lv.${r.intimacyLevel})现在以「${asset.name}」的形态活在世界里。`,
              );
            } catch (e: any) {
              Alert.alert('化身失败', e?.message || '请稍后再试');
            }
          },
        },
      ],
    );
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameAsset) return;
    const trimmed = renameDraft.trim();
    if (trimmed.length === 0) {
      Alert.alert('请输入名称', '名称不能为空');
      return;
    }
    if (trimmed.length > 30) {
      Alert.alert('名称过长', '名称不能超过 30 个字符');
      return;
    }
    try {
      await updateWorldAsset(renameAsset.id, { name: trimmed });
      setRenameAsset(null);
      setRenameDraft('');
      void fetchAssets();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('重命名失败', e?.message || '请稍后再试');
    }
  }, [renameAsset, renameDraft, fetchAssets]);

  const handleRegenerate = (asset: WorldAssetSummary) => {
    Alert.alert(
      '重新生成',
      '选择要重新生成的部分:',
      [
        { text: '名称', onPress: () => doRegenerate(asset, 'name') },
        { text: '属性', onPress: () => doRegenerate(asset, 'stats') },
        { text: '技能', onPress: () => doRegenerate(asset, 'skills') },
        { text: '性格', onPress: () => doRegenerate(asset, 'personality') },
        { text: '背景', onPress: () => doRegenerate(asset, 'backstory') },
        { text: '取消', style: 'cancel' },
      ],
    );
  };

  const doRegenerate = useCallback(
    async (
      asset: WorldAssetSummary,
      target: 'stats' | 'skills' | 'personality' | 'backstory' | 'name',
    ) => {
      try {
        await regenerateWorldAssetAttribute(asset.id, target);
        void fetchAssets();
        Alert.alert('已重新生成', '请稍后刷新查看效果');
      } catch (e: any) {
        Alert.alert('重新生成失败', e?.message || '请稍后再试');
      }
    },
    [fetchAssets],
  );

  const handleBindAgent = useCallback(
    async (asset: WorldAssetSummary) => {
      try {
        await bindAgentToAsset(asset.id);
        void fetchAssets();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('已绑定 Agent', `${asset.name} 现在由 Agent 驱动`);
      } catch (e: any) {
        Alert.alert('绑定失败', e?.message || '请稍后再试');
      }
    },
    [fetchAssets],
  );

  const handleUnbindAgent = useCallback(
    async (asset: WorldAssetSummary) => {
      try {
        await unbindAgentFromAsset(asset.id);
        void fetchAssets();
        Alert.alert('已解绑 Agent', `${asset.name} 解除 Agent 绑定`);
      } catch (e: any) {
        Alert.alert('解绑失败', e?.message || '请稍后再试');
      }
    },
    [fetchAssets],
  );

  const handleListForSale = (asset: WorldAssetSummary) => {
    // Sprint P-8 P2 (2026-05-22): real listing flow.
    (navigation as any).navigate('WorldAssetListing', {
      assetId: asset.id,
      assetName: asset.name,
    });
  };

  const handleGift = (asset: WorldAssetSummary) => {
    // Backend has no dedicated `/gift` endpoint yet. We keep the
    // entry visible with honest copy until backend ships transfer
    // routes — avoids the false-positive "功能开发中" pattern.
    Alert.alert(
      '赠送',
      '赠送功能后端尚未开放。如果想转手,可以先「上架出售」并把链接给好友。',
    );
  };

  const handleDelete = (asset: WorldAssetSummary) => {
    Alert.alert(
      '确认删除',
      `确定要删除 "${asset.name}" 吗?此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorldAsset(asset.id);
              void fetchAssets();
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            } catch (e: any) {
              Alert.alert('删除失败', e?.message || '请稍后再试');
            }
          },
        },
      ],
    );
  };

  // ─── Navigate to scanner ─────────────────────────────────────────────

  const handleOpenScanner = useCallback(() => {
    navigation.navigate('WorldEngineScanner');
  }, [navigation]);

  // ─── Navigate to detail ──────────────────────────────────────────────

  const handleOpenDetail = useCallback((asset: WorldAssetSummary) => {
    (navigation as any).navigate('WorldAssetDetail', { assetId: asset.id, assetName: asset.name });
  }, [navigation]);

  // ─── Render ──────────────────────────────────────────────────────────

  const renderAssetCard = useCallback(
    ({ item }: { item: WorldAssetSummary }) => (
      <TouchableOpacity
        style={styles.assetCard}
        onPress={() => handleOpenDetail(item)}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {/* Thumbnail — prefer 3D styled mesh, fall back to 2D portrait (扫描照片) */}
        <View style={styles.thumbnailContainer}>
          {item.styledMeshUrl || item.portraitUrl ? (
            <Image
              source={{ uri: item.styledMeshUrl || (item.portraitUrl as string) }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.thumbnailPlaceholderText}>🦊</Text>
            </View>
          )}

          {/* Agent bound indicator */}
          {item.boundAgentId && (
            <View style={styles.agentBadge}>
              <Text style={styles.agentBadgeText}>🤖</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardLevel}>Lv.{item.level}</Text>
            <Text style={styles.cardBattles}>
              {item.battleWins}W/{item.battleLosses}L
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    ),
    [handleOpenDetail, handleLongPress],
  );

  // ─── Empty state ─────────────────────────────────────────────────────

  if (!isLoading && filteredAssets.length === 0) {
    return (
      <View style={styles.container}>
        {/* Header with filters */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>世界资产</Text>
        </View>

        {/* Empty state */}
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🌍</Text>
          <Text style={styles.emptyTitle}>还没有世界资产</Text>
          <Text style={styles.emptySubtitle}>
            扫描现实世界的物品，将它们变成游戏角色！
          </Text>
          <TouchableOpacity style={styles.scanButton} onPress={handleOpenScanner}>
            <Text style={styles.scanButtonText}>📷 开始扫描</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>世界资产</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* 战斗子系统已退役(需求 11.1):移除"对战"入口。 */}
          <TouchableOpacity
            style={styles.scanFab}
            onPress={handleOpenScanner}
            testID="world-asset-inventory-scan"
          >
            <Text style={styles.scanFabText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {/* Sort */}
        <View style={styles.filterRow}>
          {(['newest', 'level', 'battles'] as SortOption[]).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.filterChip, sortBy === opt && styles.filterChipActive]}
              onPress={() => setSortBy(opt)}
            >
              <Text style={[styles.filterChipText, sortBy === opt && styles.filterChipTextActive]}>
                {opt === 'newest' ? '最新' : opt === 'level' ? '等级' : '战斗'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Category filter */}
        <View style={styles.filterRow}>
          {(['all', 'character', 'dungeon', 'weapon'] as FilterCategory[]).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, filterCategory === cat && styles.filterChipActive]}
              onPress={() => setFilterCategory(cat)}
            >
              <Text style={[styles.filterChipText, filterCategory === cat && styles.filterChipTextActive]}>
                {cat === 'all' ? '全部' : cat === 'character' ? '角色' : cat === 'dungeon' ? '副本' : '武器'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Grid */}
      <FlatList
        data={filteredAssets}
        renderItem={renderAssetCard}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#6c5ce7" />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Sprint P-8: rename modal */}
      <Modal
        visible={renameAsset !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameAsset(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>重命名</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="新名称(最多 30 字符)"
              placeholderTextColor="#666"
              maxLength={30}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRenameAsset(null)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={submitRename}
              >
                <Text style={styles.modalConfirmText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  scanFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6c5ce7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  battleFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFabText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: -2,
  },
  // Filters
  filters: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
  },
  filterChipActive: {
    backgroundColor: '#6c5ce7',
  },
  filterChipText: {
    color: '#888',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  // Grid
  gridContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  // Asset card
  assetCard: {
    width: CARD_WIDTH,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: '100%',
    height: CARD_WIDTH,
    backgroundColor: '#0d0d1a',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    color: '#444',
    fontSize: 24,
    fontWeight: '700',
  },
  agentBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentBadgeText: {
    fontSize: 10,
  },
  cardInfo: {
    padding: 10,
  },
  cardName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLevel: {
    color: '#6c5ce7',
    fontSize: 11,
    fontWeight: '600',
  },
  cardBattles: {
    color: '#888',
    fontSize: 11,
  },
  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Sprint P-8: rename modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#aaa',
    fontSize: 14,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
