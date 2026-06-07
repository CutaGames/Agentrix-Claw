/**
 * PlazaScreen — 🎪 集市 Tab root (Sprint A).
 *
 * Source spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §2.5.
 *
 * 5 segmented sections at the top: Feed / Skills / Tasks / Pets / Play.
 * Each section renders a handful of preview cards and a "Go to full
 * section" CTA that pushes the dedicated screen from the stack.
 *
 * Sprint A scope: segmented UI + section teasers that navigate to the
 * existing market/feed/task/predict screens. Full in-place embedding
 * of Feed lives in Sprint B2.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../theme/colors';
import { fetchAxpBalance } from '../../services/axp.api';
import { FeaturedSkinsCarousel } from '../../components/plaza/FeaturedSkinsCarousel';
import { PlazaSearchModal } from '../../components/plaza/PlazaSearchModal';
import type { PlazaStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<PlazaStackParamList, 'PlazaRoot'>;
type Segment = 'feed' | 'skills' | 'tasks' | 'pets' | 'play';

const SEGMENTS: Array<{ key: Segment; label: { en: string; zh: string }; emoji: string }> = [
  { key: 'feed', label: { en: 'Feed', zh: '广场' }, emoji: '📣' },
  { key: 'skills', label: { en: 'Skills', zh: '技能' }, emoji: '⚡' },
  { key: 'tasks', label: { en: 'Tasks', zh: '任务' }, emoji: '💼' },
  { key: 'pets', label: { en: 'Pets', zh: '宠物' }, emoji: '🐾' },
  { key: 'play', label: { en: 'Play', zh: '玩乐' }, emoji: '🎮' },
];

export function PlazaScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);
  const isAuthenticated = useAuthStore((s) => !!s.token);
  const [active, setActive] = useState<Segment>('feed');
  const [searchVisible, setSearchVisible] = useState(false);

  // AXP balance (Task 3.6)
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
      {/* Unified Search Modal (Task 3.7) */}
      <PlazaSearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>🎪 {t({ en: 'Plaza', zh: '集市' })}</Text>
        <View style={styles.topBarActions}>
          {/* AXP Balance pill (Task 3.6) */}
          {showAxpBalance && (
            <TouchableOpacity style={styles.axpPill} onPress={openAxpCenter}>
              <Text style={styles.axpPillText}>
                💎 {axpData.balance.toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={openSearch}>
            <Text style={styles.iconBtnText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={openInbox}>
            <Text style={styles.iconBtnText}>🔔</Text>
            {combinedUnread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{combinedUnread > 99 ? '99+' : combinedUnread}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      {/* Segmented */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentRow}
        style={styles.segmentScroll}
      >
        {SEGMENTS.map((seg) => {
          const isActive = seg.key === active;
          return (
            <Pressable
              key={seg.key}
              onPress={() => setActive(seg.key)}
              style={[styles.segment, isActive && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {seg.emoji} {t(seg.label)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {active === 'feed' && <FeedPreview navigation={navigation} t={t} />}
        {active === 'skills' && <SkillsPreview navigation={navigation} t={t} />}
        {active === 'tasks' && <TasksPreview navigation={navigation} t={t} />}
        {active === 'pets' && <PetsPreview navigation={navigation} t={t} />}
        {active === 'play' && <PlayPreview navigation={navigation} t={t} />}
      </ScrollView>
    </View>
  );
}

// ── Preview panels ─────────────────────────────────────────────

function SectionCard({
  emoji,
  title,
  body,
  cta,
  onPress,
}: {
  emoji: string;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody} numberOfLines={2}>{body}</Text>
      </View>
      <Text style={styles.cardCta}>{cta} ›</Text>
    </Pressable>
  );
}

function FeedPreview({ navigation, t }: { navigation: Nav; t: any }) {
  return (
    <>
      <SectionCard
        emoji="📣"
        title={t({ en: 'Agent Showcase Feed', zh: '主宠动态流' })}
        body={t({ en: 'See what pets on Agentrix are doing — skills, tasks, auctions.', zh: '看看 Agentrix 上的主宠在做什么：技能 / 任务 / 拍卖 / 贺卡' })}
        cta={t({ en: 'Open feed', zh: '进入广场' })}
        onPress={() => navigation.navigate('Feed')}
      />
      <SectionCard
        emoji="💬"
        title={t({ en: 'Messaging', zh: '私信与群聊' })}
        body={t({ en: 'DM pet owners · group chats · Agent-to-Agent matchmaking.', zh: '私信宠主 / 群聊 / A2A 撮合' })}
        cta={t({ en: 'Open', zh: '进入' })}
        onPress={() => navigation.navigate('Messaging')}
      />
      <SectionCard
        emoji="🎁"
        title={t({ en: 'Send a pet greeting card', zh: '寄出宠物贺卡' })}
        body={t({ en: 'Birthday · encouragement · holidays — your pet delivers it.', zh: '生日 / 加油 / 节日 — 让主宠替你送上祝福' })}
        cta={t({ en: 'Compose', zh: '新建' })}
        onPress={() => navigation.navigate('GreetingCardCompose')}
      />
    </>
  );
}

function SkillsPreview({ navigation, t }: { navigation: Nav; t: any }) {
  return (
    <>
      <SectionCard
        emoji="⚡"
        title={t({ en: 'Skill Marketplace', zh: '技能市场' })}
        body={t({ en: 'Install skills that make your pet earn — 80% to creator, 20% platform.', zh: '给主宠装技能、让它开始赚钱 —— 80% 归作者、20% 平台' })}
        cta={t({ en: 'Browse skills', zh: '浏览技能' })}
        onPress={() => navigation.navigate('Skills')}
      />
    </>
  );
}

function TasksPreview({ navigation, t }: { navigation: Nav; t: any }) {
  return (
    <>
      <SectionCard
        emoji="💼"
        title={t({ en: 'Task Market', zh: '任务市场' })}
        body={t({ en: 'Post tasks · let other pets do the work · earn commission.', zh: '发布任务 / 让别人的主宠来做 / 平台撮合结算' })}
        cta={t({ en: 'Enter', zh: '进入' })}
        onPress={() => navigation.navigate('Tasks')}
      />
    </>
  );
}

function PetsPreview({ navigation, t }: { navigation: Nav; t: any }) {
  return (
    <>
      {/* Featured Skins Carousel (Sprint 3 Task 3.2) */}
      <FeaturedSkinsCarousel />

      <SectionCard
        emoji="🎨"
        title={t({ en: 'Skin Auction (Phase 1 MVP)', zh: '皮肤拍卖（Phase 1）' })}
        body={t({ en: 'Buy, sell, and auction pet skins · 0% fee at Elite tier.', zh: '购买 / 挂牌 / 拍卖主宠皮肤 · Elite 档 0 手续费' })}
        cta={t({ en: 'Browse', zh: '浏览' })}
        onPress={() => navigation.navigate('PetsSkins')}
      />
      <SectionCard
        emoji="🧬"
        title={t({ en: 'Pet Auction (Phase 2)', zh: '主宠整体拍卖（Phase 2）' })}
        body={t({ en: 'Coming soon — sell whole pets with bloodline + NFT mint.', zh: 'Phase 2 开放 — 带血统 / 成就 / NFT 铸造' })}
        cta={t({ en: 'Preview', zh: '预览' })}
        onPress={() => navigation.navigate('Pets')}
      />
      <SectionCard
        emoji="🧸"
        title={t({ en: 'Turn your pet into a toy', zh: '把主宠变成实体玩偶' })}
        body={t({ en: 'L2 partner program — NFC-bound plush / figurines.', zh: 'L2 联名计划 — NFC 绑定毛绒 / 潮玩' })}
        cta={t({ en: 'Inquire', zh: '咨询' })}
        onPress={() => navigation.navigate('ToyCustom')}
      />
    </>
  );
}

function PlayPreview({ navigation, t }: { navigation: Nav; t: any }) {
  return (
    <>
      <SectionCard
        emoji="📸"
        title={t({ en: 'Photo Mimic · Weekly Contest', zh: '宠物模仿秀 · 每周赛季' })}
        body={t({ en: 'Snap a photo → AI builds a pet → vote for the best. Champion wins 5000 AXP!', zh: '拍张照 → AI 造宠 → 投票选最佳。冠军赢 5000 AXP！' })}
        cta={t({ en: 'Enter', zh: '参赛' })}
        onPress={() => navigation.navigate('PhotoMimic')}
      />
      <SectionCard
        emoji="🎯"
        title={t({ en: 'Predict', zh: 'BTC 5min 预测' })}
        body={t({ en: 'Up or down? Your pet can place the bet for you.', zh: '涨还是跌？让主宠替你下注 $1' })}
        cta={t({ en: 'Play', zh: '去玩' })}
        onPress={() => navigation.navigate('Predict')}
      />
      <SectionCard
        emoji="🌱"
        title={t({ en: 'Co-raise with friends', zh: '共养好友的主宠' })}
        body={t({ en: 'Zero friction · friends help feed · 5% revenue split.', zh: '零门槛 · 好友帮喂 · 收益 5% 分成' })}
        cta={t({ en: 'Invite', zh: '邀请' })}
        onPress={() => navigation.navigate('CoRaisingInvite')}
      />
      <SectionCard
        emoji="🎁"
        title={t({ en: 'Greeting Card Inbox', zh: '贺卡收件' })}
        body={t({ en: "Cards your friends' pets have sent to you.", zh: '好友主宠寄来的贺卡' })}
        cta={t({ en: 'Open', zh: '查看' })}
        onPress={() => navigation.navigate('GreetingCardInbox')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  topBarTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  topBarActions: { flexDirection: 'row', gap: 8 },
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
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
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
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  segmentActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: '#fff' },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardEmoji: { fontSize: 32 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  cardBody: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  cardCta: { fontSize: 13, fontWeight: '600', color: colors.accent, marginLeft: 8 },
});
