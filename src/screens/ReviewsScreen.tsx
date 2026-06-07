// 全部评价页
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
import { marketplaceApi, ReviewItem } from '../services/marketplace.api';

interface Props {
  route: { params: { skillId: string } };
  navigation: any;
}

export function ReviewsScreen({ route, navigation }: Props) {
  const { skillId } = route.params;
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (reset: boolean = false) => {
    const p = reset ? 1 : page;
    try {
      const result = await marketplaceApi.getReviews(skillId, p);
      if (reset) {
        setReviews(result.reviews);
      } else {
        setReviews(prev => [...prev, ...result.reviews]);
      }
      setTotal(result.total);
      setPage(p + 1);
    } catch (e) {
      console.error('Failed to load reviews:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [skillId, page]);

  useEffect(() => {
    loadData(true);
  }, [skillId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    loadData(true);
  }, [skillId]);

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(i < rating ? '⭐' : '☆');
    }
    return stars.join('');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff < 7) return `${diff}天前`;
    if (diff < 30) return `${Math.floor(diff / 7)}周前`;
    return `${Math.floor(diff / 30)}月前`;
  };

  const renderItem = ({ item }: { item: ReviewItem }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.userName[0]}</Text>
        </View>
        <View style={styles.reviewMeta}>
          <Text style={styles.reviewUser}>{item.userName}</Text>
          <View style={styles.ratingRow}>
            <Text style={styles.reviewStars}>{renderStars(item.rating)}</Text>
            <Text style={styles.reviewDate}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.reviewComment}>{item.comment}</Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.headerText}>共 {total} 条评价</Text>
      <TouchableOpacity
        style={styles.writeBtn}
        onPress={() => navigation.navigate('WriteReview', { skillId })}
      >
        <Text style={styles.writeBtnText}>✏️ 写评价</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>💬</Text>
        <Text style={styles.emptyText}>暂无评价</Text>
        <Text style={styles.emptySubtext}>成为第一个评价的人吧</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={reviews}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={renderHeader}
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
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingBottom: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerText: {
    color: colors.muted,
    fontSize: 14,
  },
  writeBtn: {
    backgroundColor: colors.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  writeBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  reviewCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  reviewMeta: {
    flex: 1,
  },
  reviewUser: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewStars: {
    fontSize: 10,
    marginRight: 8,
  },
  reviewDate: {
    color: colors.muted,
    fontSize: 11,
  },
  reviewComment: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
});
