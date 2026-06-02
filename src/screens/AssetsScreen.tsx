// 资产页面
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';

// Mock 数据
const mockAssets = [
  { symbol: 'USDT', name: 'Tether USD', balance: 8000, usdValue: 8000, change24h: 0, chain: 'Ethereum' },
  { symbol: 'ETH', name: 'Ethereum', balance: 1.2, usdValue: 3200, change24h: 2.5, chain: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana', balance: 12, usdValue: 1145, change24h: -1.2, chain: 'Solana' },
  { symbol: 'BTC', name: 'Bitcoin', balance: 0.015, usdValue: 750, change24h: 1.8, chain: 'Bitcoin' },
];

const totalValue = mockAssets.reduce((sum, a) => sum + a.usdValue, 0);
const totalChange = mockAssets.reduce((sum, a) => sum + (a.usdValue * a.change24h / 100), 0);
const changePercent = (totalChange / (totalValue - totalChange)) * 100;

export const AssetsScreen: React.FC = () => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 总资产卡片 */}
      <Card style={styles.totalCard}>
        <Text style={styles.totalLabel}>总资产</Text>
        <Text style={styles.totalValue}>${totalValue.toLocaleString()}</Text>
        <Text style={[styles.totalChange, totalChange >= 0 ? styles.positive : styles.negative]}>
          {totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)} ({changePercent.toFixed(2)}%) 24h
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionIcon}>📥</Text>
            <Text style={styles.actionLabel}>充值</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionIcon}>📤</Text>
            <Text style={styles.actionLabel}>提现</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionIcon}>🔄</Text>
            <Text style={styles.actionLabel}>兑换</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* 资产列表 */}
      <Card>
        <Text style={styles.sectionTitle}>资产列表</Text>
        <View style={styles.assetList}>
          {mockAssets.map((asset) => (
            <TouchableOpacity key={asset.symbol} style={styles.assetItem}>
              <View style={styles.assetIcon}>
                <Text style={styles.assetSymbolIcon}>{asset.symbol.charAt(0)}</Text>
              </View>
              <View style={styles.assetInfo}>
                <Text style={styles.assetName}>{asset.name}</Text>
                <Text style={styles.assetChain}>{asset.chain}</Text>
              </View>
              <View style={styles.assetValue}>
                <Text style={styles.assetBalance}>{asset.balance} {asset.symbol}</Text>
                <View style={styles.assetMeta}>
                  <Text style={styles.assetUsd}>${asset.usdValue.toLocaleString()}</Text>
                  <Text style={[
                    styles.assetChange,
                    asset.change24h >= 0 ? styles.positive : styles.negative
                  ]}>
                    {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
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
  // 总资产卡片
  totalCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  totalValue: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    marginTop: 4,
  },
  totalChange: {
    fontSize: 14,
    marginTop: 4,
  },
  positive: {
    color: '#4ade80',
  },
  negative: {
    color: '#f87171',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 24,
  },
  actionBtn: {
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionLabel: {
    color: colors.text,
    fontSize: 12,
  },
  // 资产列表
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  assetList: {
    gap: 12,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  assetSymbolIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  assetChain: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  assetValue: {
    alignItems: 'flex-end',
  },
  assetBalance: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  assetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 8,
  },
  assetUsd: {
    color: colors.muted,
    fontSize: 12,
  },
  assetChange: {
    fontSize: 12,
    fontWeight: '500',
  },
});
