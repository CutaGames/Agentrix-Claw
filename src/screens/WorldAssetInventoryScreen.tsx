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

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

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

  // ─── Data fetching ───────────────────────────────────────────────────

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      // TODO: Call GET /api/v1/world-engine/assets with filters
      // const response = await api.get('/v1/world-engine/assets', {
      //   params: {
      //     category: filterCategory !== 'all' ? filterCategory : undefined,
      //     source: filterSource !== 'all' ? filterSource : undefined,
      //     sort: sortBy,
      //   },
      // });
      // setAssets(response.data.items);

      // Phase 1: Empty state (no assets yet)
      setAssets([]);
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sortBy, filterCategory, filterSource]);

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
    // TODO: Show rename dialog, call PATCH /api/v1/world-engine/assets/:id
    Alert.alert('重命名', '功能开发中');
  };

  const handleRegenerate = (asset: WorldAssetSummary) => {
    // TODO: Navigate to regeneration screen
    Alert.alert('重新生成', '功能开发中');
  };

  const handleBindAgent = (asset: WorldAssetSummary) => {
    // TODO: Call POST /api/v1/world-engine/assets/:id/bind-agent
    Alert.alert('绑定 Agent', '功能开发中');
  };

  const handleUnbindAgent = (asset: WorldAssetSummary) => {
    // TODO: Call DELETE /api/v1/world-engine/assets/:id/unbind-agent
    Alert.alert('解绑 Agent', '功能开发中');
  };

  const handleListForSale = (asset: WorldAssetSummary) => {
    // TODO: Navigate to listing creation screen
    Alert.alert('上架出售', '功能开发中');
  };

  const handleGift = (asset: WorldAssetSummary) => {
    // TODO: Navigate to gift flow
    Alert.alert('赠送', '功能开发中');
  };

  const handleDelete = (asset: WorldAssetSummary) => {
    Alert.alert(
      '确认删除',
      `确定要删除 "${asset.name}" 吗？此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            // TODO: Call DELETE /api/v1/world-engine/assets/:id
            Alert.alert('已删除', `${asset.name} 已被删除`);
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
    // TODO: Navigate to WorldAssetDetailScreen
    Alert.alert(asset.name, `Lv.${asset.level} | ${asset.category}`);
  }, []);

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
        {/* Thumbnail (Phase 1: pre-rendered PNG/GIF per design §8) */}
        <View style={styles.thumbnailContainer}>
          {item.styledMeshUrl ? (
            <Image
              source={{ uri: item.styledMeshUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.thumbnailPlaceholderText}>3D</Text>
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
        <TouchableOpacity style={styles.scanFab} onPress={handleOpenScanner}>
          <Text style={styles.scanFabText}>+</Text>
        </TouchableOpacity>
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
});
