// 我的收藏页
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import { SkillItem } from '../services/marketplace.api';
import { apiFetch } from '../services/api';

const MOCK_FAVORITES: SkillItem[] = [
  {
    id: 'skill-4',
    name: 'Smart Contract Audit',
    description: '自动化智能合约安全审计',
    author: '@sec_team',
    authorId: 'user-4',
    category: 'skills',
    subCategory: 'Web3',
    price: 2.00,
    priceUnit: '次审计',
    rating: 4.7,
    reviewCount: 89,
    likeCount: 45,
    usageCount: 320,
    callCount: 1500,
    agentCompatible: false,
    tags: ['Web3', '安全'],
    isLiked: false,
    isFavorited: true,
    createdAt: '2025-12-10T00:00:00Z',
    updatedAt: '2026-02-09T00:00:00Z',
  },
];

interface Props {
  navigation: any;
}

export function MyFavoritesScreen({ navigation }: Props) {
  const [favorites, setFavorites] = useState<SkillItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await apiFetch<any[]>('/user/favorites');
      const mapped: SkillItem[] = (data || []).map((s: any) => ({
        id: s.id || s.skillId,
        name: s.displayName || s.name || 'Unknown',
        description: s.description || '',
        author: s.authorInfo?.name || s.author || 'Unknown',
        authorId: s.authorInfo?.id || '',
        category: s.layer === 'resource' ? 'resources' as const : 'skills' as const,
        subCategory: s.category || '',
        price: s.pricing?.pricePerCall || s.price || 0,
        priceUnit: s.pricing?.currency || s.priceUnit || 'USD',
        rating: s.rating || 0,
        reviewCount: s.reviewCount || 0,
        likeCount: s.likeCount || 0,
        usageCount: s.callCount || s.usageCount || 0,
        callCount: s.callCount || 0,
        agentCompatible: true,
        tags: s.tags || [],
        isLiked: false,
        isFavorited: true,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      }));
      setFavorites(mapped.length > 0 ? mapped : MOCK_FAVORITES);
    } catch {
      setFavorites(MOCK_FAVORITES);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const formatCount = (n: number | string): string => {
    const v = Number(n) || 0;
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  };

  const renderItem = ({ item }: { item: SkillItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('SkillDetail', { skillId: item.id, skillName: item.name })}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {item.agentCompatible && (
          <View style={styles.agentBadge}>
            <Text style={styles.agentBadgeText}>🤖</Text>
          </View>
        )}
      </View>
      <View style={styles.cardStats}>
        <Text style={styles.cardRating}>⭐ {Number(item.rating || 0).toFixed(1)}</Text>
        <Text style={styles.cardSep}>·</Text>
        <Text style={styles.cardMuted}>{formatCount(item.usageCount)} 人在用</Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.cardPrice}>
          ${Number(item.price) < 1 ? Number(item.price || 0).toFixed(4) : Number(item.price || 0).toFixed(2)}/{item.priceUnit}
        </Text>
        <Text style={styles.cardHeart}>❤️</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>❤️</Text>
        <Text style={styles.emptyText}>暂无收藏</Text>
        <Text style={styles.emptySubtext}>浏览市场，收藏喜欢的技能</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={favorites}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 16, paddingBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardName: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  agentBadge: {
    backgroundColor: '#8B5CF6' + '25',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  agentBadgeText: { fontSize: 12 },
  cardStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardRating: { color: '#FBBF24', fontSize: 13, fontWeight: '600' },
  cardSep: { color: colors.muted, fontSize: 12, marginHorizontal: 6 },
  cardMuted: { color: colors.muted, fontSize: 12 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { color: colors.success, fontSize: 15, fontWeight: '700' },
  cardHeart: { fontSize: 16 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
