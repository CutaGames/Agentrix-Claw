// 我的推广链接列表
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { colors } from '../theme/colors';
import { referralApi, ReferralLink } from '../services/referral.api';

interface Props {
  navigation: any;
}

export function MyLinksScreen({ navigation }: Props) {
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await referralApi.getMyLinks();
      setLinks(data);
    } catch (e) {
      console.error('Failed to load links:', e);
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

  const handleCopy = (url: string) => {
    Alert.alert('已复制', url);
  };

  const handleShare = async (link: ReferralLink) => {
    try {
      await Share.share({ message: `${link.name}\n👉 ${link.shortUrl}` });
    } catch {
      // cancelled
    }
  };

  const handleToggleStatus = async (link: ReferralLink) => {
    const newStatus = link.status === 'active' ? 'paused' : 'active';
    try {
      await referralApi.toggleLinkStatus(link.id, newStatus);
      setLinks(prev => prev.map(l =>
        l.id === link.id ? { ...l, status: newStatus } : l
      ));
    } catch {
      Alert.alert('操作失败');
    }
  };

  const renderItem = ({ item }: { item: ReferralLink }) => (
    <View style={styles.linkCard}>
      <View style={styles.linkHeader}>
        <Text style={styles.linkIcon}>
          {item.targetType === 'skill' ? '🤖' : item.targetType === 'general' ? '🎯' : '🛒'}
        </Text>
        <View style={styles.linkInfo}>
          <Text style={styles.linkName}>{item.name}</Text>
          <Text style={styles.linkUrl} numberOfLines={1}>{item.shortUrl}</Text>
        </View>
        <View style={[
          styles.statusDot,
          item.status === 'active' ? styles.statusActive : styles.statusPaused,
        ]} />
      </View>

      <View style={styles.linkStats}>
        <View style={styles.linkStat}>
          <Text style={styles.linkStatValue}>{item.clicks}</Text>
          <Text style={styles.linkStatLabel}>点击</Text>
        </View>
        <View style={styles.linkStat}>
          <Text style={styles.linkStatValue}>{item.conversions}</Text>
          <Text style={styles.linkStatLabel}>转化</Text>
        </View>
        <View style={styles.linkStat}>
          <Text style={[styles.linkStatValue, { color: colors.success }]}>
            ${item.commission.toFixed(2)}
          </Text>
          <Text style={styles.linkStatLabel}>佣金</Text>
        </View>
      </View>

      <View style={styles.linkActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleCopy(item.shortUrl)}>
          <Text style={styles.actionText}>📋 复制</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(item)}>
          <Text style={styles.actionText}>📱 分享</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleStatus(item)}>
          <Text style={styles.actionText}>
            {item.status === 'active' ? '⏸ 暂停' : '▶️ 恢复'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔗</Text>
        <Text style={styles.emptyText}>暂无推广链接</Text>
        <Text style={styles.emptySubtext}>去市场找到喜欢的技能，一键推广</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={links}
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
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  linkCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  linkIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  linkInfo: {
    flex: 1,
  },
  linkName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  linkUrl: {
    color: colors.muted,
    fontSize: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusActive: {
    backgroundColor: colors.success,
  },
  statusPaused: {
    backgroundColor: colors.warning,
  },
  linkStats: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  linkStat: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  linkStatValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  linkStatLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  linkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
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
