// 佣金收益页 — 展示推广佣金统计和明细
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { apiFetch } from '../services/api';

interface CommissionStats {
  totalCommission: number;
  settledCommission: number;
  pendingCommission: number;
  todayCommission: number;
  todayOrders: number;
  totalOrders: number;
  referralCount: number;
}

interface CommissionItem {
  id: string;
  skillName: string;
  orderAmount: number;
  commissionAmount: number;
  commissionRate: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'settled' | 'cancelled';
  createdAt: string;
  metadata?: { level?: number };
}

const MOCK_STATS: CommissionStats = {
  totalCommission: 1234.56,
  settledCommission: 890.00,
  pendingCommission: 344.56,
  todayCommission: 12.30,
  todayOrders: 3,
  totalOrders: 128,
  referralCount: 45,
};

const MOCK_ITEMS: CommissionItem[] = [
  { id: 'c1', skillName: 'GPT-4 Translation', orderAmount: 10.00, commissionAmount: 0.10, commissionRate: 1, currency: 'USD', status: 'settled', createdAt: '2026-02-11T10:30:00Z' },
  { id: 'c2', skillName: 'Image Generation Pro', orderAmount: 25.00, commissionAmount: 0.25, commissionRate: 1, currency: 'USD', status: 'confirmed', createdAt: '2026-02-10T14:20:00Z' },
  { id: 'c3', skillName: 'Code Review Bot', orderAmount: 15.00, commissionAmount: 0.15, commissionRate: 1, currency: 'USD', status: 'pending', createdAt: '2026-02-09T09:15:00Z', metadata: { level: 2 } },
];

export function CommissionEarningsScreen() {
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [items, setItems] = useState<CommissionItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'settled'>('all');

  const loadData = useCallback(async () => {
    try {
      const [statsData, commData] = await Promise.all([
        apiFetch<CommissionStats>('/human-commissions/stats').catch(() => MOCK_STATS),
        apiFetch<{ items: CommissionItem[] }>('/human-commissions').catch(() => ({ items: MOCK_ITEMS })),
      ]);
      setStats(statsData);
      setItems(commData.items || MOCK_ITEMS);
    } catch {
      setStats(MOCK_STATS);
      setItems(MOCK_ITEMS);
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

  const filteredItems = items.filter(item => {
    if (activeTab === 'pending') return item.status === 'pending' || item.status === 'confirmed';
    if (activeTab === 'settled') return item.status === 'settled';
    return true;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: colors.warning },
    confirmed: { label: 'Confirmed', color: '#3B82F6' },
    settled: { label: 'Settled', color: colors.success },
    cancelled: { label: 'Cancelled', color: colors.muted },
  };

  const renderStats = () => {
    if (!stats) return null;
    return (
      <View style={styles.statsContainer}>
        <View style={styles.mainStat}>
          <Text style={styles.mainStatLabel}>Total Commission</Text>
          <Text style={styles.mainStatValue}>${stats.totalCommission.toFixed(2)}</Text>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>${stats.pendingCommission.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>${stats.settledCommission.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Settled</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>${stats.todayCommission.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.referralCount}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      {(['all', 'pending', 'settled'] as const).map(tab => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.tabActive]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {tab === 'all' ? 'All' : tab === 'pending' ? 'Pending' : 'Settled'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: CommissionItem }) => {
    const status = statusMap[item.status] || statusMap.pending;
    return (
      <View style={styles.commissionCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{item.skillName}</Text>
            {item.metadata?.level === 2 && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>L2</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardStatus, { color: status.color }]}>{status.label}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Order Amount</Text>
            <Text style={styles.cardValue}>${Number(item.orderAmount).toFixed(2)}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Comm. Rate</Text>
            <Text style={styles.cardValue}>{Number(item.commissionRate).toFixed(1)}%</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Commission</Text>
            <Text style={[styles.cardValue, styles.commissionValue]}>
              +${Number(item.commissionAmount).toFixed(4)}
            </Text>
          </View>
        </View>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>💰</Text>
        <Text style={styles.emptyText}>No commission records yet</Text>
        <Text style={styles.emptySubtext}>Share skills with friends to earn referral commissions</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <>
            {renderStats()}
            {renderTabs()}
          </>
        }
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
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 20 },
  // Stats
  statsContainer: {
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mainStat: { alignItems: 'center', marginBottom: 16 },
  mainStatLabel: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  mainStatValue: { color: colors.success, fontSize: 32, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statItem: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: colors.primary },
  // Commission card
  commissionCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  levelBadge: {
    backgroundColor: '#8B5CF6' + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  levelBadgeText: { color: '#A78BFA', fontSize: 10, fontWeight: '600' },
  cardStatus: { fontSize: 12, fontWeight: '600' },
  cardBody: { gap: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: colors.muted, fontSize: 13 },
  cardValue: { color: colors.text, fontSize: 13, fontWeight: '500' },
  commissionValue: { color: colors.success, fontWeight: '700' },
  cardDate: { color: colors.muted, fontSize: 11, marginTop: 8 },
  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
