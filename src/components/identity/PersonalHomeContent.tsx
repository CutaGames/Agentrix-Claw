// 个人身份首页内容
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../Card';
import { PrimaryButton } from '../PrimaryButton';
import { colors } from '../../theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_W = SCREEN_W - 32; // 16px padding each side

// Mock 数据 - 后续替换为 API
const mockAssets = {
  totalUsdValue: 12345.67,
  change24h: 234.56,
  change24hPercent: 1.9,
  topAssets: [
    { symbol: 'USDT', value: 8000 },
    { symbol: 'ETH', value: 3200 },
    { symbol: 'SOL', value: 1145 },
  ],
};

const mockAirdrops = [
  { id: '1', name: 'Jupiter', protocol: 'Solana', estimatedValue: 120 },
  { id: '2', name: 'LayerZero', protocol: 'Multi-chain', estimatedValue: 80 },
  { id: '3', name: 'zkSync', protocol: 'Ethereum L2', estimatedValue: 200 },
];

const mockAutoEarn = {
  todayEarned: 12.5,
  totalEarned: 456.78,
  activeStrategies: 3,
};

// ========== Launch Activity Banners ==========
const LAUNCH_BANNERS = [
  {
    id: 'launch',
    emoji: '🎉',
    title: 'Agentrix Commerce Live!',
    subtitle: '8 official skills now available — Smart Checkout, X402 Pay & more',
    cta: 'Explore',
    target: 'Marketplace',
    gradient: ['#3B82F6', '#8B5CF6'],
  },
  {
    id: 'free-trial',
    emoji: '🎁',
    title: 'Free Trial for Early Users',
    subtitle: 'Try Smart Checkout free — first 100 calls on us',
    cta: 'Claim Now',
    target: 'Marketplace',
    gradient: ['#10B981', '#059669'],
  },
  {
    id: 'referral',
    emoji: '💰',
    title: 'Refer & Earn Commission',
    subtitle: '10% L1 + 3% L2 referral rewards — share skills, earn crypto',
    cta: 'Start Earning',
    target: 'Promote',
    gradient: ['#F97316', '#DC2626'],
  },
  {
    id: 'bounty',
    emoji: '🎯',
    title: 'Bounty Board Open',
    subtitle: 'Post tasks or bid on bounties — dev, design, content & more',
    cta: 'View Tasks',
    target: 'TaskMarket',
    gradient: ['#8B5CF6', '#EC4899'],
  },
];

const LaunchBannerCarousel: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = (activeIdx + 1) % LAUNCH_BANNERS.length;
      scrollRef.current?.scrollTo({ x: next * BANNER_W, animated: true });
      setActiveIdx(next);
    }, 4000);
    return () => clearInterval(timer);
  }, [activeIdx]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / BANNER_W);
    if (idx !== activeIdx && idx >= 0 && idx < LAUNCH_BANNERS.length) setActiveIdx(idx);
  };

  return (
    <View style={styles.bannerContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        decelerationRate="fast"
        snapToInterval={BANNER_W}
        contentContainerStyle={{ gap: 0 }}
      >
        {LAUNCH_BANNERS.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.bannerCard, { width: BANNER_W }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(b.target)}
          >
            <View style={[styles.bannerGradientBg, { backgroundColor: b.gradient[0] }]}>
              <View style={styles.bannerContent}>
                <Text style={styles.bannerEmoji}>{b.emoji}</Text>
                <View style={styles.bannerTextCol}>
                  <Text style={styles.bannerTitle}>{b.title}</Text>
                  <Text style={styles.bannerSubtitle} numberOfLines={2}>{b.subtitle}</Text>
                </View>
              </View>
              <View style={styles.bannerCtaBtn}>
                <Text style={styles.bannerCtaText}>{b.cta} →</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.bannerDots}>
        {LAUNCH_BANNERS.map((b, i) => (
          <View key={b.id} style={[styles.bannerDot, i === activeIdx && styles.bannerDotActive]} />
        ))}
      </View>
    </View>
  );
};

export const PersonalHomeContent: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      {/* 🎉 Launch Activity Banners */}
      <LaunchBannerCarousel navigation={navigation} />

      {/* 资产总览卡片 */}
      <Card style={styles.assetCard}>
        <View style={styles.assetHeader}>
          <Text style={styles.assetLabel}>💰 Total Assets</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Assets')}>
            <Text style={styles.viewAll}>View All →</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.assetValue}>
          ${mockAssets.totalUsdValue.toLocaleString()}
        </Text>
        <Text style={[
          styles.assetChange,
          mockAssets.change24h >= 0 ? styles.positive : styles.negative
        ]}>
          {mockAssets.change24h >= 0 ? '+' : ''}${mockAssets.change24h.toFixed(2)} 
          ({mockAssets.change24hPercent.toFixed(1)}%) Today
        </Text>
        <View style={styles.assetList}>
          {mockAssets.topAssets.map((asset) => (
            <View key={asset.symbol} style={styles.assetItem}>
              <Text style={styles.assetSymbol}>{asset.symbol}</Text>
              <Text style={styles.assetItemValue}>${asset.value.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 空投发现 */}
      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🎁 Airdrops</Text>
          <Text style={styles.badge}>{mockAirdrops.length} available</Text>
        </View>
        <View style={styles.airdropList}>
          {mockAirdrops.slice(0, 2).map((airdrop) => (
            <TouchableOpacity 
              key={airdrop.id} 
              style={styles.airdropCard}
              onPress={() => navigation.navigate('Airdrop')}
            >
              <Text style={styles.airdropName}>{airdrop.name}</Text>
              <Text style={styles.airdropProtocol}>{airdrop.protocol}</Text>
              <Text style={styles.airdropValue}>Est. ${airdrop.estimatedValue}</Text>
              <TouchableOpacity style={styles.claimButton}>
                <Text style={styles.claimButtonText}>Claim</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
        <PrimaryButton 
          title="View All Airdrops" 
          onPress={() => navigation.navigate('Airdrop')} 
        />
      </Card>

      {/* AutoEarn 收益 */}
      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>⚡ AutoEarn</Text>
        </View>
        <View style={styles.earnStats}>
          <View style={styles.earnStat}>
            <Text style={styles.earnValue}>+${mockAutoEarn.todayEarned.toFixed(2)}</Text>
            <Text style={styles.earnLabel}>Today</Text>
          </View>
          <View style={styles.earnDivider} />
          <View style={styles.earnStat}>
            <Text style={styles.earnValue}>+${mockAutoEarn.totalEarned.toFixed(2)}</Text>
            <Text style={styles.earnLabel}>Total</Text>
          </View>
          <View style={styles.earnDivider} />
          <View style={styles.earnStat}>
            <Text style={styles.earnValue}>{mockAutoEarn.activeStrategies}</Text>
            <Text style={styles.earnLabel}>Active</Text>
          </View>
        </View>
        <PrimaryButton 
          title="Manage Strategies" 
          onPress={() => navigation.navigate('AutoEarn')} 
        />
      </Card>

      {/* 我的 Agent 快速入口 */}
      <Card>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🤖 My Agent</Text>
        </View>
        <Text style={styles.agentDesc}>
          Your AI assistant, always ready
        </Text>
        <View style={styles.agentActions}>
          <TouchableOpacity style={styles.agentAction}>
            <Text style={styles.agentActionIcon}>💬</Text>
            <Text style={styles.agentActionLabel}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.agentAction}>
            <Text style={styles.agentActionIcon}>📋</Text>
            <Text style={styles.agentActionLabel}>Tasks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.agentAction}>
            <Text style={styles.agentActionIcon}>⚙️</Text>
            <Text style={styles.agentActionLabel}>Settings</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  // Launch Banner Carousel
  bannerContainer: {
    marginBottom: 0,
  },
  bannerCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  bannerGradientBg: {
    borderRadius: 16,
    padding: 16,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bannerEmoji: {
    fontSize: 32,
    marginTop: 2,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 18,
  },
  bannerCtaBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
  },
  bannerCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  bannerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  bannerDotActive: {
    width: 18,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  // 资产卡片
  assetCard: {
    backgroundColor: colors.primary,
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assetLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  viewAll: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  assetValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
  },
  assetChange: {
    fontSize: 14,
    marginTop: 4,
  },
  positive: {
    color: '#4ade80',
  },
  negative: {
    color: '#f87171',
  },
  assetList: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  assetItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  assetSymbol: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginBottom: 4,
  },
  assetItemValue: {
    color: '#fff',
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
  // 空投
  airdropList: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  airdropCard: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  claimButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // AutoEarn
  earnStats: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  earnStat: {
    flex: 1,
    alignItems: 'center',
  },
  earnDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  earnValue: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
  },
  earnLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  // Agent
  agentDesc: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 16,
  },
  agentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  agentAction: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentActionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  agentActionLabel: {
    color: colors.text,
    fontSize: 14,
  },
});
