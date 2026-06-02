// AutoEarn 策略管理页面
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';

// Mock 数据
const mockStrategies = [
  {
    id: '1',
    name: 'USDT 稳健理财',
    apy: 8.5,
    risk: 'low',
    protocol: 'Aave',
    token: 'USDT',
    minDeposit: 100,
    deposited: 5000,
    earned: 125.5,
    status: 'active',
  },
  {
    id: '2',
    name: 'ETH 质押收益',
    apy: 4.2,
    risk: 'low',
    protocol: 'Lido',
    token: 'ETH',
    minDeposit: 0.01,
    deposited: 0.5,
    earned: 0.021,
    status: 'active',
  },
  {
    id: '3',
    name: 'SOL 高收益',
    apy: 12.5,
    risk: 'medium',
    protocol: 'Marinade',
    token: 'SOL',
    minDeposit: 1,
    deposited: 0,
    earned: 0,
    status: 'paused',
  },
  {
    id: '4',
    name: 'DeFi 组合策略',
    apy: 18.0,
    risk: 'high',
    protocol: 'Multi',
    token: 'USDC',
    minDeposit: 500,
    deposited: 0,
    earned: 0,
    status: 'paused',
  },
];

const mockSummary = {
  totalDeposited: 6350,
  totalEarned: 456.78,
  todayEarned: 12.5,
  activeStrategies: 2,
};

const riskColors = {
  low: '#4ade80',
  medium: '#f59e0b',
  high: '#f87171',
};

const riskLabels = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export const AutoEarnScreen: React.FC = () => {
  const [strategies, setStrategies] = useState(mockStrategies);

  const toggleStrategy = (id: string) => {
    setStrategies(prev => prev.map(s => 
      s.id === id ? { ...s, status: s.status === 'active' ? 'paused' : 'active' } : s
    ));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 收益总览 */}
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>⚡ AutoEarn 收益</Text>
        <View style={styles.summaryMain}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>今日收益</Text>
            <Text style={[styles.summaryValue, styles.positive]}>+${mockSummary.todayEarned}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>累计收益</Text>
            <Text style={[styles.summaryValue, styles.positive]}>+${mockSummary.totalEarned}</Text>
          </View>
        </View>
        <View style={styles.summaryStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>${mockSummary.totalDeposited.toLocaleString()}</Text>
            <Text style={styles.statLabel}>总投入</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{mockSummary.activeStrategies}</Text>
            <Text style={styles.statLabel}>运行中</Text>
          </View>
        </View>
      </Card>

      {/* 策略列表 */}
      <Text style={styles.sectionTitle}>收益策略</Text>
      {strategies.map((strategy) => (
        <Card key={strategy.id}>
          <View style={styles.strategyHeader}>
            <View style={styles.strategyInfo}>
              <Text style={styles.strategyName}>{strategy.name}</Text>
              <View style={styles.strategyMeta}>
                <Text style={styles.strategyProtocol}>{strategy.protocol}</Text>
                <View style={[styles.riskBadge, { backgroundColor: riskColors[strategy.risk as keyof typeof riskColors] }]}>
                  <Text style={styles.riskText}>{riskLabels[strategy.risk as keyof typeof riskLabels]}</Text>
                </View>
              </View>
            </View>
            <View style={styles.apyContainer}>
              <Text style={styles.apyValue}>{strategy.apy}%</Text>
              <Text style={styles.apyLabel}>APY</Text>
            </View>
          </View>

          <View style={styles.strategyStats}>
            <View style={styles.strategyStatItem}>
              <Text style={styles.strategyStatLabel}>已投入</Text>
              <Text style={styles.strategyStatValue}>
                {strategy.deposited > 0 ? `${strategy.deposited} ${strategy.token}` : '-'}
              </Text>
            </View>
            <View style={styles.strategyStatItem}>
              <Text style={styles.strategyStatLabel}>已赚取</Text>
              <Text style={[styles.strategyStatValue, styles.positive]}>
                {strategy.earned > 0 ? `+${strategy.earned} ${strategy.token}` : '-'}
              </Text>
            </View>
            <View style={styles.strategyStatItem}>
              <Text style={styles.strategyStatLabel}>最低投入</Text>
              <Text style={styles.strategyStatValue}>{strategy.minDeposit} {strategy.token}</Text>
            </View>
          </View>

          <View style={styles.strategyActions}>
            <View style={styles.strategyToggle}>
              <Text style={styles.toggleLabel}>
                {strategy.status === 'active' ? '运行中' : '已暂停'}
              </Text>
              <Switch
                value={strategy.status === 'active'}
                onValueChange={() => toggleStrategy(strategy.id)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            {strategy.deposited > 0 ? (
              <TouchableOpacity style={styles.manageBtn}>
                <Text style={styles.manageBtnText}>管理</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.joinBtn}>
                <Text style={styles.joinBtnText}>加入</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>
      ))}

      {/* 风险提示 */}
      <Card style={styles.warningCard}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.warningText}>
          DeFi 收益策略存在智能合约风险，请根据自身风险承受能力选择合适的策略。
        </Text>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  // 总览
  summaryCard: {
    backgroundColor: colors.primary,
  },
  summaryTitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 12,
  },
  summaryMain: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  positive: {
    color: '#4ade80',
  },
  summaryStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  // Section
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  // 策略卡片
  strategyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  strategyInfo: {
    flex: 1,
  },
  strategyName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  strategyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  strategyProtocol: {
    color: colors.muted,
    fontSize: 12,
  },
  riskBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  riskText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  apyContainer: {
    alignItems: 'flex-end',
  },
  apyValue: {
    color: '#4ade80',
    fontSize: 24,
    fontWeight: '700',
  },
  apyLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  // 策略数据
  strategyStats: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  strategyStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  strategyStatLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  strategyStatValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  // 操作
  strategyActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  strategyToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    color: colors.muted,
    fontSize: 12,
    marginRight: 8,
  },
  manageBtn: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  manageBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  joinBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // 警告
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    color: '#f59e0b',
    fontSize: 12,
    lineHeight: 18,
  },
});
