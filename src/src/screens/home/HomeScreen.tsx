/**
 * HomeScreen — 🏠 家 Tab root (Sprint A).
 *
 * Source spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §2.3.
 *
 * Sprint A scope (骨架):
 *   - Pet status bar (active pet + Lv + mood + energy)  — real data stub
 *   - Main CTA "💬 召唤 Alfred 对话" → jumps to Summon tab
 *   - Pet wallet glance (reads activeInstance / agent account if present)
 *   - Today progress stub (tasks)
 *   - Drawer grid of 10 pet entries (navigate into HomeStack sub-screens)
 *   - Co-Raising + check-in teasers
 *
 * Sprint B/C will wire real data (Living Pet state, token quota, activity
 * feed) + Co-Raising real API. Identity tabs (personal/merchant/dev) and
 * the three original home contents are intentionally dropped; identity
 * switching now lives in Me per §2.6.
 */
import React, { useCallback, useMemo } from 'react';
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
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useI18n } from '../../stores/i18nStore';
import { colors } from '../../theme/colors';
import { fetchAxpBalance } from '../../services/axp.api';
import { fetchMyQuota } from '../../services/subscription.api';
import { getPetState } from '../../services/mobilePetSdk';
import { CheckinCard } from './CheckinCard';
import { PetRenderer, type PetClan } from '../../components/pet/PetRiveRenderer';
import type { HomeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'HomeRoot'>;

interface DrawerTile {
  key: keyof HomeStackParamList | 'Skills' | 'PetCameraScan';
  emoji: string;
  label: { en: string; zh: string };
  route: keyof HomeStackParamList;
  accent: string;
}

const PET_DRAWER_TILES: DrawerTile[] = [
  { key: 'PetSkills', emoji: '🎒', label: { en: 'Skills', zh: '技能栏' }, route: 'PetSkills', accent: '#60a5fa' },
  { key: 'PetTasks', emoji: '💼', label: { en: 'Tasks', zh: '接单' }, route: 'PetTasks', accent: '#34d399' },
  { key: 'PetWallet', emoji: '💰', label: { en: 'Wallet', zh: '钱包' }, route: 'PetWallet', accent: '#fbbf24' },
  { key: 'PetMemory', emoji: '🧠', label: { en: 'Memory', zh: '记忆' }, route: 'PetMemory', accent: '#a78bfa' },
  { key: 'PetPlay', emoji: '🎮', label: { en: 'Play', zh: '玩乐' }, route: 'PetPlay', accent: '#f472b6' },
  { key: 'PetWardrobe', emoji: '👕', label: { en: 'Wardrobe', zh: '衣柜' }, route: 'PetWardrobe', accent: '#22d3ee' },
  { key: 'PetSoul', emoji: '💫', label: { en: 'Soul', zh: '灵魂' }, route: 'PetSoul', accent: '#e879f9' },
  { key: 'PetBreed', emoji: '🧬', label: { en: 'Breed', zh: '繁育' }, route: 'PetBreed', accent: '#fb7185' },
  { key: 'PetIdentity', emoji: '🆔', label: { en: 'Identity', zh: '身份' }, route: 'PetIdentity', accent: '#facc15' },
  { key: 'PetCreator', emoji: '✨', label: { en: 'Create', zh: '文字创生' }, route: 'PetCreator', accent: '#f97316' },
  { key: 'PetCameraScan', emoji: '📷', label: { en: 'Photo→3D', zh: '拍照创生' }, route: 'PetCameraScan', accent: '#06b6d4' },
];

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);

  // Sprint C wire-up: real Living Pet state from backend (replaces Sprint A stub).
  const petStateQ = useQuery({
    queryKey: ['pet-state'],
    queryFn: getPetState,
    staleTime: 30_000,
    refetchInterval: 30_000, // poll every 30s for emotion/XP updates
    retry: 1,
  });
  const petState = petStateQ.data;
  const petName = petState?.name || activeInstance?.name || t({ en: 'Your Pet', zh: '你的主宠' });
  const petLevel = petState?.intimacy_level ?? 1;
  const petXp = petState?.intimacy_xp ?? 0;
  // Exponential XP curve: each level needs 100 * (1.5 ^ level) XP
  const petXpNext = Math.round(100 * Math.pow(1.5, petLevel));
  const petEmotion = (petState?.emotion as string) || 'calm';
  const petEnergy = petState?.energy ?? 50;
  const petClan: PetClan = (petState?.clan as PetClan) || (activeInstance as any)?.clan || 'A';

  // Sprint C: live AXP balance glance
  const axpBalanceQ = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    staleTime: 30_000,
    retry: 1,
  });
  const quotaQ = useQuery({
    queryKey: ['me-quota'],
    queryFn: fetchMyQuota,
    staleTime: 60_000,
    retry: 1,
  });

  const openSummon = useCallback(() => {
    (navigation as any).getParent?.()?.navigate('Summon');
  }, [navigation]);

  const openInbox = useCallback(() => {
    (navigation as any).getParent?.()?.getParent?.()?.navigate('Inbox');
  }, [navigation]);

  const openScan = useCallback(() => {
    (navigation as any).getParent?.()?.getParent?.()?.navigate('Scan');
  }, [navigation]);

  const switchPet = useCallback(() => {
    // Multi-pet switcher — wired to Buddy picker in Sprint B
    navigation.navigate('PetCompanion');
  }, [navigation]);

  const combinedUnread = unreadCount + approvalCount;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Top bar ────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Pressable style={styles.petSwitcher} onPress={switchPet}>
          <Text style={styles.petSwitcherEmoji}>🐾</Text>
          <Text style={styles.petSwitcherName} numberOfLines={1}>
            {petName}
          </Text>
          <Text style={styles.petSwitcherCaret}>▾</Text>
        </Pressable>
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={openScan}>
            <Text style={styles.iconBtnText}>📷</Text>
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

      {/* ── Pet hero (status + Rive renderer) ─────────────────── */}
      <Pressable style={styles.hero} onPress={() => navigation.navigate('PetCompanion')}>
        <View style={styles.petVisual}>
          <PetRenderer
            clan={petClan}
            emotion={petEmotion}
            width={120}
            height={120}
          />
        </View>
        <View style={styles.petStatusRow}>
          <Text style={styles.petMoodBadge}>😊 {petEmotion}</Text>
          <Text style={styles.petLvBadge}>Lv.{petLevel}</Text>
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${Math.round((petXp / petXpNext) * 100)}%` }]} />
        </View>
        <Text style={styles.xpText}>
          XP {petXp} / {petXpNext} · ⚡{petEnergy}%
        </Text>
      </Pressable>

      {/* ── Main CTA: Summon ───────────────────────────────────── */}
      <TouchableOpacity style={styles.summonCta} onPress={openSummon} activeOpacity={0.8}>
        <Text style={styles.summonCtaEmoji}>💬</Text>
        <Text style={styles.summonCtaText}>
          {t({ en: `Summon ${petName}`, zh: `召唤 ${petName}` })}
        </Text>
        <Text style={styles.summonCtaArrow}>›</Text>
      </TouchableOpacity>

      {/* ── Create Pet CTA (P0-5: was buried in drawer) ─────── */}
      <TouchableOpacity
        style={styles.createPetCta}
        onPress={() => navigation.navigate('PetCameraScan')}
        activeOpacity={0.85}
      >
        <Text style={styles.createPetEmoji}>📷</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.createPetTitle}>
            {t({ en: 'Photo → 3D Pet', zh: '拍照生成专属萌宠' })}
          </Text>
          <Text style={styles.createPetSub}>
            {t({
              en: 'Snap 8-12 angles · AI builds your pet in ~90s',
              zh: '环绕拍 8-12 张 · AI 约 90 秒造出你的专属 3D 宠物',
            })}
          </Text>
        </View>
        <Text style={styles.createPetArrow}>›</Text>
      </TouchableOpacity>

      {/* ── Daily check-in (P0-2: first AXP earn hook) ──────── */}
      <CheckinCard />

      {/* ── Pet wallet glance ─────────────────────────────────── */}
      <Pressable style={styles.walletCard} onPress={() => navigation.navigate('PetWallet')}>
        <View style={styles.walletHeaderRow}>
          <Text style={styles.walletTitle}>
            💰 {t({ en: `${petName}'s Wallet`, zh: `${petName} 的钱包` })}
          </Text>
          <Text style={styles.walletArrow}>›</Text>
        </View>
        <Text style={styles.walletBalance}>$0.00</Text>
        <Text style={styles.walletSub}>
          {t({ en: 'Auto-Earn: setup needed', zh: '开启 Auto-Earn · 让主宠替你赚' })}
        </Text>
      </Pressable>

      {/* ── AXP balance glance (Sprint C) ───────────────────── */}
      <Pressable
        style={styles.axpCard}
        onPress={() => (navigation as any).getParent?.()?.navigate('Me', { screen: 'AxpCenter' })}
      >
        <View style={styles.walletHeaderRow}>
          <Text style={styles.walletTitle}>
            💎 {t({ en: 'AXP Balance', zh: 'AXP 余额' })}
          </Text>
          <Text style={styles.walletArrow}>›</Text>
        </View>
        <Text style={styles.walletBalance}>
          {axpBalanceQ.data?.balance?.toLocaleString() ?? '—'}
        </Text>
        <Text style={styles.walletSub}>
          {quotaQ.data
            ? t({
                en: `${quotaQ.data.effective_tier.toUpperCase()} · ${quotaQ.data.axp_cashback_bps / 100}% cashback`,
                zh: `${quotaQ.data.effective_tier.toUpperCase()} 档 · 消费返 ${quotaQ.data.axp_cashback_bps / 100}% AXP`,
              })
            : t({ en: 'Tap to open AXP center', zh: '点击进入 AXP 中心' })}
        </Text>
      </Pressable>

      {/* ── Today progress stub ───────────────────────────────── */}
      <View style={styles.progressCard}>
        <Text style={styles.cardTitle}>
          🎯 {t({ en: "Today's Progress", zh: '今日进度' })}
        </Text>
        <Text style={styles.cardMuted}>
          {t({
            en: 'No active tasks. Give your pet a skill to start earning.',
            zh: '暂无任务 · 装一个技能让主宠开始工作',
          })}
        </Text>
      </View>

      {/* ── Pet drawer grid (10 entries) ──────────────────────── */}
      <Text style={styles.sectionHeader}>{t({ en: 'Pet Hub', zh: '主宠' })}</Text>
      <View style={styles.drawerGrid}>
        {PET_DRAWER_TILES.map((tile) => (
          <Pressable
            key={String(tile.key)}
            style={({ pressed }) => [
              styles.drawerTile,
              { borderColor: tile.accent + '55', backgroundColor: tile.accent + '10' },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => navigation.navigate(tile.route as any)}
          >
            <Text style={styles.drawerEmoji}>{tile.emoji}</Text>
            <Text style={styles.drawerLabel}>{t(tile.label)}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Co-Raising teaser (Phase 1 α) ─────────────────────── */}
      <Pressable
        style={styles.coRaisingCard}
        onPress={() => navigation.navigate('CoRaisingInvite')}
      >
        <Text style={styles.coRaisingEmoji}>🌱</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {t({ en: 'Invite friends to co-raise', zh: '邀请朋友一起养宠' })}
          </Text>
          <Text style={styles.cardMuted}>
            {t({
              en: 'Friends help feed your pet · earn 5% split + AXP',
              zh: '好友帮你喂宠 · 5% 收益分成 + AXP 奖励',
            })}
          </Text>
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </Pressable>

      {/* ── Greeting card teaser (Phase 1 δ) ──────────────────── */}
      <Pressable
        style={styles.greetingCard}
        onPress={() => (navigation as any).getParent?.()?.navigate('Plaza', { screen: 'GreetingCardCompose' })}
      >
        <Text style={styles.coRaisingEmoji}>🎁</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {t({ en: 'Send a pet greeting card', zh: '给朋友发张宠物贺卡' })}
          </Text>
          <Text style={styles.cardMuted}>
            {t({
              en: 'Pick a moment · your pet delivers it',
              zh: '选一个场景 · 主宠替你送上祝福',
            })}
          </Text>
        </View>
        <Text style={styles.cardArrow}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  petSwitcher: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgCard,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  petSwitcherEmoji: { fontSize: 18 },
  petSwitcherName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  petSwitcherCaret: { fontSize: 12, color: colors.textMuted },
  topBarActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40, height: 40,
    borderRadius: 20,
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
  // Hero
  hero: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  petVisual: {
    width: 180, height: 180,
    borderRadius: 90,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  petStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  petMoodBadge: {
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accent + '20',
    color: colors.accent,
    fontWeight: '600',
  },
  petLvBadge: {
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  xpBar: {
    height: 6,
    width: '100%',
    borderRadius: 3,
    backgroundColor: colors.bgSecondary,
    overflow: 'hidden',
    marginBottom: 6,
  },
  xpFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  xpText: { fontSize: 11, color: colors.textMuted },
  // Summon CTA
  summonCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  summonCtaEmoji: { fontSize: 22 },
  summonCtaText: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  summonCtaArrow: { fontSize: 24, color: '#fff', opacity: 0.8 },
  // Create Pet CTA (P0-5)
  createPetCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(249,115,22,0.14)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.5)',
  },
  createPetEmoji: { fontSize: 30 },
  createPetTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 2 },
  createPetSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  createPetArrow: { fontSize: 22, color: colors.textMuted, marginLeft: 4 },
  // Wallet
  walletCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  axpCard: {
    backgroundColor: colors.accent + '12',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    marginBottom: 12,
  },
  walletHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  walletTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  walletArrow: { fontSize: 16, color: colors.textMuted },
  walletBalance: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  walletSub: { fontSize: 12, color: colors.textMuted },
  // Progress
  progressCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  cardMuted: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  cardArrow: { fontSize: 20, color: colors.textMuted, marginLeft: 8 },
  // Section
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  // Drawer grid
  drawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  drawerTile: {
    width: '30.7%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  drawerEmoji: { fontSize: 28 },
  drawerLabel: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  // Co-raising / greeting
  coRaisingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  greetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coRaisingEmoji: { fontSize: 32 },
});
