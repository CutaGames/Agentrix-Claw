// 空投发现页面
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';

// Mock 数据
const mockAirdrops = [
  { 
    id: '1', 
    name: 'Jupiter', 
    protocol: 'Solana DEX', 
    estimatedValue: 120, 
    status: 'available',
    requirements: ['持有 SOL', '交易过 10 次'],
    expiresAt: '2026-02-15',
  },
  { 
    id: '2', 
    name: 'LayerZero', 
    protocol: 'Cross-chain', 
    estimatedValue: 80, 
    status: 'available',
    requirements: ['跨链交易 5 次', '使用过 Stargate'],
    expiresAt: '2026-03-01',
  },
  { 
    id: '3', 
    name: 'zkSync', 
    protocol: 'Ethereum L2', 
    estimatedValue: 200, 
    status: 'available',
    requirements: ['部署过合约', '交易 > $500'],
    expiresAt: '2026-02-28',
  },
  { 
    id: '4', 
    name: 'Blur', 
    protocol: 'NFT Marketplace', 
    estimatedValue: 50, 
    status: 'claimed',
    requirements: ['交易过 NFT'],
  },
];

export const AirdropScreen: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    // TODO: 调用 API 刷新
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleClaim = async (airdropId: string) => {
    setClaiming(airdropId);
    // TODO: 调用领取 API
    setTimeout(() => setClaiming(null), 2000);
  };

  const availableAirdrops = mockAirdrops.filter(a => a.status === 'available');
  const claimedAirdrops = mockAirdrops.filter(a => a.status === 'claimed');

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* 统计 */}
      <Card style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{availableAirdrops.length}</Text>
          <Text style={styles.statLabel}>可领取</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            ${availableAirdrops.reduce((sum, a) => sum + a.estimatedValue, 0)}
          </Text>
          <Text style={styles.statLabel}>预估价值</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{claimedAirdrops.length}</Text>
          <Text style={styles.statLabel}>已领取</Text>
        </View>
      </Card>

      {/* 可领取空投 */}
      <Text style={styles.sectionTitle}>🎁 可领取</Text>
      {availableAirdrops.map((airdrop) => (
        <Card key={airdrop.id}>
          <View style={styles.airdropHeader}>
            <View style={styles.airdropIcon}>
              <Text style={styles.airdropIconText}>{airdrop.name.charAt(0)}</Text>
            </View>
            <View style={styles.airdropInfo}>
              <Text style={styles.airdropName}>{airdrop.name}</Text>
              <Text style={styles.airdropProtocol}>{airdrop.protocol}</Text>
            </View>
            <View style={styles.airdropValue}>
              <Text style={styles.valueLabel}>预估</Text>
              <Text style={styles.valueAmount}>${airdrop.estimatedValue}</Text>
            </View>
          </View>
          
          <View style={styles.requirements}>
            <Text style={styles.requirementsTitle}>领取条件：</Text>
            {airdrop.requirements?.map((req, i) => (
              <Text key={i} style={styles.requirement}>✓ {req}</Text>
            ))}
          </View>

          {airdrop.expiresAt && (
            <Text style={styles.expires}>截止日期: {airdrop.expiresAt}</Text>
          )}

          <PrimaryButton 
            title={claiming === airdrop.id ? '领取中...' : '一键领取'}
            onPress={() => handleClaim(airdrop.id)}
            disabled={claiming === airdrop.id}
          />
        </Card>
      ))}

      {/* 已领取 */}
      {claimedAirdrops.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>✅ 已领取</Text>
          {claimedAirdrops.map((airdrop) => (
            <Card key={airdrop.id} style={styles.claimedCard}>
              <View style={styles.airdropHeader}>
                <View style={[styles.airdropIcon, styles.claimedIcon]}>
                  <Text style={styles.airdropIconText}>{airdrop.name.charAt(0)}</Text>
                </View>
                <View style={styles.airdropInfo}>
                  <Text style={styles.airdropName}>{airdrop.name}</Text>
                  <Text style={styles.airdropProtocol}>{airdrop.protocol}</Text>
                </View>
                <Text style={styles.claimedBadge}>已领取</Text>
              </View>
            </Card>
          ))}
        </>
      )}
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
  // 统计
  statsCard: {
    flexDirection: 'row',
    paddingVertical: 20,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  // Section
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  // 空投卡片
  airdropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  airdropIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  claimedIcon: {
    backgroundColor: colors.muted,
  },
  airdropIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  airdropInfo: {
    flex: 1,
  },
  airdropName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  airdropProtocol: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  airdropValue: {
    alignItems: 'flex-end',
  },
  valueLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  valueAmount: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
  },
  // 条件
  requirements: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  requirementsTitle: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  requirement: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 4,
  },
  expires: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  // 已领取
  claimedCard: {
    opacity: 0.7,
  },
  claimedBadge: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
});
