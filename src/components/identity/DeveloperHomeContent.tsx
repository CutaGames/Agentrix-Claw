// 开发者身份首页内容
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../Card';
import { PrimaryButton } from '../PrimaryButton';
import { colors } from '../../theme/colors';

// Mock 数据
const mockDeveloperData = {
  pendingSettlement: 2500,
  availableBalance: 1800,
  weekEarned: 800,
};

const mockPendingTasks = [
  { id: '1', title: 'Milestone "API Integration"', type: 'milestone', status: 'To Submit', dueDate: 'Tomorrow' },
  { id: '2', title: 'Milestone "UI Design"', type: 'milestone', status: 'In Review', dueDate: null },
  { id: '3', title: 'New Order "Mini-App Dev"', type: 'order', status: 'Pending', dueDate: null },
];

const mockBudgetPools = [
  { id: '1', name: 'Agentrix SDK Dev', budget: 5000, status: 'active' },
  { id: '2', name: 'Commerce Mini-App', budget: 3000, status: 'active' },
];

const mockMarketOrders = 8;

export const DeveloperHomeContent: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      {/* 收益概览 */}
      <Card style={styles.overviewCard}>
        <View style={styles.overviewHeader}>
          <Text style={styles.overviewLabel}>💰 Developer Earnings</Text>
        </View>
        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Pending</Text>
            <Text style={styles.balanceValue}>${mockDeveloperData.pendingSettlement.toLocaleString()}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>${mockDeveloperData.availableBalance.toLocaleString()}</Text>
          </View>
        </View>
        <View style={styles.weekEarned}>
          <Text style={styles.weekEarnedText}>This Week +${mockDeveloperData.weekEarned}</Text>
        </View>
      </Card>

      {/* 待处理任务 */}
      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>⚡ Pending Tasks</Text>
          <Text style={styles.badge}>{mockPendingTasks.length} items</Text>
        </View>
        <View style={styles.taskList}>
          {mockPendingTasks.map((task) => (
            <View key={task.id} style={styles.taskItem}>
              <View style={styles.taskInfo}>
                <Text style={styles.taskIcon}>
                  {task.type === 'milestone' ? '📋' : '📦'}
                </Text>
                <View style={styles.taskDetails}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <View style={styles.taskMeta}>
                    <Text style={[
                      styles.taskStatus,
                      task.status === 'To Submit' && styles.statusWarning,
                      task.status === 'In Review' && styles.statusInfo,
                      task.status === 'Pending' && styles.statusPrimary,
                    ]}>
                      {task.status}
                    </Text>
                    {task.dueDate && (
                      <Text style={styles.taskDue}>({task.dueDate})</Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
      </Card>

      {/* 我的预算池 */}
      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📦 My Budget Pools</Text>
          <Text style={styles.badge}>{mockBudgetPools.length} active</Text>
        </View>
        <View style={styles.poolList}>
          {mockBudgetPools.map((pool) => (
            <TouchableOpacity 
              key={pool.id} 
              style={styles.poolItem}
              onPress={() => navigation.navigate('BudgetPools')}
            >
              <Text style={styles.poolName}>{pool.name}</Text>
              <Text style={styles.poolBudget}>${pool.budget.toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <PrimaryButton 
          title="View All" 
          onPress={() => navigation.navigate('BudgetPools')}
        />
      </Card>

      {/* 任务市场入口 */}
      <Card>
        <View style={styles.marketHeader}>
          <Text style={styles.sectionTitle}>🎯 Task Market</Text>
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>{mockMarketOrders} matches</Text>
          </View>
        </View>
        <Text style={styles.marketDesc}>
          Discover new opportunities matching your skills
        </Text>
        <PrimaryButton 
          title="Browse Market" 
          onPress={() => navigation.navigate('TaskMarket')}
        />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  // 概览卡片
  overviewCard: {
    backgroundColor: '#7c3aed', // violet
  },
  overviewHeader: {
    marginBottom: 12,
  },
  overviewLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  balanceRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 12,
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginBottom: 4,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  weekEarned: {
    marginTop: 12,
    alignItems: 'center',
  },
  weekEarnedText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
  // 通用
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: colors.primary,
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  // 任务列表
  taskList: {
    gap: 8,
  },
  taskItem: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  taskDetails: {
    flex: 1,
  },
  taskTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  taskStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusWarning: {
    color: '#f59e0b',
  },
  statusInfo: {
    color: '#3b82f6',
  },
  statusPrimary: {
    color: colors.primary,
  },
  taskDue: {
    color: colors.muted,
    fontSize: 12,
  },
  // 预算池列表
  poolList: {
    gap: 8,
    marginBottom: 12,
  },
  poolItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  poolName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  poolBudget: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  // 任务市场
  marketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchBadge: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  marketDesc: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 12,
  },
});
