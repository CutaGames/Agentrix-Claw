/**
 * MarketplaceScreen — 🎪 集市 Tab root (单层 5 段交易市场切换器).
 *
 * Spec: agentrix-marketplace-tab-refactor — Task 6.
 *
 * 由 ClawMarketplaceScreen 升级而来：把原「teaser 过场层 + 真实交易层」
 * 双层结构塌平为单层 5 段，默认「赛事预测」：
 *   赛事预测(默认) · OpenClaw 技能 · 任务 · 宠物 · 资源与商品
 * 段切换为同屏 state，不走导航栈。顶栏 AXP pill / 搜索 / 通知 自
 * PlazaScreen 迁移而来。
 *
 * 各段具体内容由后续任务填充：
 *   - 赛事预测 Hero/列表/平仓/改名 → Task 7
 *   - 宠物段 / 资源段 → Task 8
 *   - BTC 预测改名 → Task 9
 * 本任务搭好 5 段骨架 + 切换 + 顶栏迁移，各段接已有屏的最小渲染。
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { fetchAxpBalance } from '../../services/axp.api';
import { PlazaSearchModal } from '../../components/plaza/PlazaSearchModal';
import { FeaturedSkinsCarousel } from '../../components/plaza/FeaturedSkinsCarousel';
import type { PlazaStackParamList } from '../../navigation/types';

import { OpenClawSkillsTab, ResourcesTab } from './ClawMarketplaceScreen';
import TaskMarketScreen from '../TaskMarketScreen';
import LeverageSportsMarketScreen from '../LeverageSportsMarketScreen';
import { SkinAuctionScreen } from '../plaza/SkinAuctionScreen';

type Nav = NativeStackNavigationProp<PlazaStackParamList, 'PlazaRoot'>;

// 5 段（默认「赛事预测」置首）
type Segment = 'predictions' | 'skills' | 'tasks' | 'pets' | 'resources';

const SEGMENTS: Array<{ key: Segment; label: { en: string; zh: string }; emoji: string }> = [
  { key: 'predictions', label: { en: 'Sports Predictions', zh: '赛事预测' }, emoji: '⚽' },
  { key: 'skills', label: { en: 'OpenClaw Skills', zh: 'OpenClaw 技能' }, emoji: '⚡' },
  { key: 'tasks', label: { en: 'Tasks', zh: '任务' }, emoji: '💼' },
  { key: 'pets', label: { en: 'Pets', zh: '宠物' }, emoji: '🐾' },
  { key: 'resources', label: { en: 'Resources & Goods', zh: '资源与商品' }, emoji: '📦' },
];

export function MarketplaceScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);
  const isAuthenticated = useAuthStore((s) => !!s.token);

  // 默认选中「赛事预测」段
  const [active, setActive] = useState<Segment>('predictions');
  const [searchVisible, setSearchVisible] = useState(false);

  // AXP balance (migrated from PlazaScreen top bar)
  const { data: axpData } = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const openInbox = useCallback(() => {
    (navigation as any).getParent?.()?.getParent?.()?.navigate('Inbox');
  }, [navigation]);

  const openSearch = useCallback(() => {
    setSearchVisible(true);
  }, []);

  const openAxpCenter = useCallback(() => {
    (navigation as any).getParent?.()?.getParent?.()?.navigate('Me', { screen: 'AxpCenter' });
  }, [navigation]);

  const combinedUnread = unreadCount + approvalCount;
  const showAxpBalance = isAuthenticated && axpData && axpData.balance > 0;

  return (
    <View style={styles.container}>
      {/* Unified Search Modal (migrated from PlazaScreen) */}
      <PlazaSearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />

      {/* Top bar — AXP pill / search / notification (migrated from PlazaScreen) */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>🎪 {t({ en: 'Marketplace', zh: '集市' })}</Text>
        <View style={styles.topBarActions}>
          {showAxpBalance && (
            <TouchableOpacity style={styles.axpPill} onPress={openAxpCenter}>
              <Text style={styles.axpPillText}>💎 {axpData.balance.toLocaleString()}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={openSearch} testID="marketplace-search">
            <Text style={styles.iconBtnText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={openInbox} testID="marketplace-inbox">
            <Text style={styles.iconBtnText}>🔔</Text>
            {combinedUnread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{combinedUnread > 99 ? '99+' : combinedUnread}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      {/* Segmented switcher — 5 段同屏切换 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentRow}
        style={styles.segmentScroll}
      >
        {SEGMENTS.map((seg) => {
          const isActive = seg.key === active;
          return (
            <TouchableOpacity
              key={seg.key}
              testID={`marketplace-seg-${seg.key}`}
              onPress={() => setActive(seg.key)}
              style={[styles.segment, isActive && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {seg.emoji} {t(seg.label)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Segment content — 同屏渲染，不新开栈屏 */}
      <View style={styles.content}>
        {active === 'predictions' && <LeverageSportsMarketScreen />}
        {active === 'skills' && <OpenClawSkillsTab />}
        {active === 'tasks' && <TaskMarketScreen />}
        {active === 'pets' && <PetsSegment />}
        {active === 'resources' && <ResourcesTab />}
      </View>
    </View>
  );
}

/**
 * PetsSegment — 宠物段：完整皮肤市场（Task 8）。
 *
 * 复用现有组件组织成一段完整内容：
 *   - 顶部 FeaturedSkinsCarousel（精选皮肤横向轮播，随列表一起滚动）
 *   - 下方 SkinAuctionScreen（皮肤拍卖列表：排序/阵营筛选 + 网格 +
 *     分页加载 + 装配/购买，点皮肤进入下单流程）
 * 把轮播作为皮肤网格的 ListHeaderComponent 注入，使整段同屏可滚动，
 * 而排序/筛选栏固定吸顶。
 */
function PetsSegment() {
  return (
    <SkinAuctionScreen
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <FeaturedSkinsCarousel />
        </View>
      }
    />
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    topBarTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    topBarActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    axpPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EAB30818',
      borderWidth: 1,
      borderColor: '#EAB30840',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      height: 32,
    },
    axpPillText: { fontSize: 12, fontWeight: '700', color: '#EAB308' },
    iconBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.bgCard,
      borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    iconBtnText: { fontSize: 18 },
    badge: {
      position: 'absolute', top: 4, right: 4,
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: '#ef4444',
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    segmentScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 56 },
    segmentRow: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 8,
      alignItems: 'center',
    },
    segment: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      alignSelf: 'flex-start',
    },
    segmentActive: { backgroundColor: c.accent, borderColor: c.accent },
    segmentText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    segmentTextActive: { color: '#fff' },
    content: { flex: 1 },
  });
}
