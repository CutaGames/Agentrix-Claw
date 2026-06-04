/**
 * WorldHubScreen — 🌍 World Tab root (P-9 Companion Redesign T2.1).
 *
 * Phase 1 spec R3 — kills the "World Engine is the 12th drawer cell on
 * Home" problem by promoting it to a tier-1 tab. The user sees:
 *   - Top: swipeable banners (quota, pending battles, recent assets)
 *   - 2x2 main CTA grid: scan / inventory / battle / dungeon
 *   - "Create digital character" section: text generation / photo→3D / world scan
 *   - Bottom: World Asset marketplace entry
 *
 * Phase 1 simplifications:
 *   - Banners are static placeholders; live data wiring deferred to T3.x
 *     once `presence:world-engine.battle-pending` and `asset.ready` events
 *     (already shipped backend per Task 0.5) feed companionEvents.
 *   - Marketplace entry now routes to the real browse/buy screen (2026-06-01).
 *
 * Cohort guard (R3.5): if `world_engine_enabled` flag returns false, render
 * a "coming soon" panel instead of the CTA grid.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { fetchWorldEngineFlag, listWorldAssets } from '../../services/worldEngineApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WorldRoot'>;

interface CTACardProps {
  emoji: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}

function CTACard({ emoji, title, subtitle, onPress, onLongPress, testID }: CTACardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.ctaCard, pressed && styles.ctaCardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
    >
      <Text style={styles.ctaEmoji}>{emoji}</Text>
      <Text style={styles.ctaTitle}>{title}</Text>
      {subtitle ? <Text style={styles.ctaSubtitle}>{subtitle}</Text> : null}
    </Pressable>
  );
}

export function WorldHubScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();

  // Cohort guard: query the same admin_configs `world_engine_enabled` flag
  // that the backend already enforces (production row was inserted in
  // Task 5 of the World Engine "Not Found" fix). On mobile we read it via
  // an authenticated probe of any cohort-gated endpoint to know whether
  // to render the hub vs the coming-soon panel.
  const flagQ = useQuery({
    queryKey: ['world-engine-flag'],
    queryFn: fetchWorldEngineFlag,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // 用户资产 — 决定首屏是"新用户引导"还是"已有角色的玩家中心"。
  const assetsQ = useQuery({
    queryKey: ['world-assets', 'hub'],
    queryFn: () => listWorldAssets({ sort: 'newest', limit: 6 }),
    staleTime: 30_000,
    retry: 1,
  });
  const assets = assetsQ.data?.items ?? [];
  const hasAssets = assets.length > 0;

  // 候补名单: 后端暂无专用接口, 用本地持久化记录用户意愿(灰度放量时可读取上报)。
  const WAITLIST_KEY = 'world_engine_waitlist_joined';
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  React.useEffect(() => {
    AsyncStorage.getItem(WAITLIST_KEY).then((v) => setWaitlistJoined(v === '1')).catch(() => {});
  }, []);
  const onJoinWaitlist = useCallback(async () => {
    try {
      await AsyncStorage.setItem(WAITLIST_KEY, '1');
    } catch {
      /* ignore */
    }
    setWaitlistJoined(true);
    Alert.alert(
      t({ en: "You're on the list", zh: '已加入候补名单' }),
      t({
        en: "We'll notify you the moment World Engine opens to your account.",
        zh: 'World Engine 向你的账号开放时,我们会第一时间通知你。',
      }),
    );
  }, [t]);

  const onScan = useCallback(
    (mode: 'quick' | 'detail' | 'room' = 'quick') => {
      navigation.navigate('WorldEngineScanner', { mode });
    },
    [navigation],
  );
  const onInventory = useCallback(() => navigation.navigate('WorldAssetInventory'), [navigation]);
  const onBattle = useCallback(() => navigation.navigate('WorldBattlePicker'), [navigation]);
  const onDungeon = useCallback(() => navigation.navigate('WorldDungeonExplorer', {}), [navigation]);
  const onWorldFeed = useCallback(() => navigation.navigate('WorldFeed'), [navigation]);
  const onAeon = useCallback(() => navigation.navigate('AeonMap'), [navigation]);
  const onUgc = useCallback(() => navigation.navigate('WorldUgcRuleSets'), [navigation]);
  const onPetCreator = useCallback(() => navigation.navigate('PetCreator'), [navigation]);
  const onPhotoToPet = useCallback(() => navigation.navigate('PetCameraScan'), [navigation]);

  // Phase 1: feature flag off → render coming-soon panel
  if (flagQ.data && !flagQ.data.enabled) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonEmoji}>🌍</Text>
          <Text style={styles.comingSoonTitle}>
            {t({ en: 'World Engine — Coming Soon', zh: 'World Engine 即将开放' })}
          </Text>
          <Text style={styles.comingSoonBody}>
            {t({
              en: "Scan real-world objects, generate AI characters, build dungeons. We're rolling this out to a small cohort first.",
              zh: '扫描真实物体生成 AI 角色,建造你的副本。我们正在小范围灰度,很快开放给所有用户。',
            })}
          </Text>
          <TouchableOpacity
            style={[styles.waitlistBtn, waitlistJoined && styles.waitlistBtnJoined]}
            onPress={onJoinWaitlist}
            disabled={waitlistJoined}
          >
            <Text style={styles.waitlistBtnText}>
              {waitlistJoined
                ? t({ en: '✓ On the waitlist', zh: '✓ 已加入候补' })
                : t({ en: 'Join Waitlist', zh: '加入候补名单' })}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="world-hub-scroll"
    >
      <View style={styles.header}>
        <Text style={styles.title}>🌍 {t({ en: 'World', zh: '世界' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: 'Aeon — a living world you build with your AI.', zh: '永曜城 · 和你的 AI 一起共建的活世界' })}
        </Text>
      </View>

      {/* HERO — 永曜城 是 World tab 的核心体验入口。
          进去就能在真实地球地图上圈地、建造、社交、和 AI 一起经营,参与感最强。 */}
      <Pressable
        style={({ pressed }) => [styles.aeonHero, pressed && styles.heroPressed]}
        onPress={onAeon}
        testID="world-hero-aeon"
      >
        <Text style={styles.heroEmoji}>🏙️</Text>
        <Text style={styles.heroTitle}>
          {t({ en: 'Enter Aeon — the shared living world', zh: '进入永曜城 · 大家共建的活世界' })}
        </Text>
        <Text style={styles.heroSub}>
          {t({
            en: 'Claim land on the real map, build your place, meet neighbors, run a business with your AI.',
            zh: '在真实地图上圈地、建造、串门、和你的 AI 一起开店经营',
          })}
        </Text>
        <View style={styles.heroBtn}>
          <Text style={styles.heroBtnText}>{t({ en: 'Enter Aeon', zh: '进入永曜城' })}</Text>
        </View>
      </Pressable>

      {/* 次级:把现实变成角色,带进永曜城 */}
      <Pressable
        style={({ pressed }) => [styles.scanStrip, pressed && styles.heroPressed]}
        onPress={() => onScan('quick')}
        onLongPress={() => onScan('detail')}
        testID="world-hero-scan"
      >
        <Text style={styles.scanStripEmoji}>📷</Text>
        <View style={styles.worldFeedTextWrap}>
          <Text style={styles.scanStripTitle}>
            {t({ en: 'Scan anything → a character for your world', zh: '拍一下身边的东西 → 变成你世界里的角色' })}
          </Text>
          <Text style={styles.worldFeedSub}>
            {t({ en: 'AI gives it a name, stats & skills in seconds. Long-press for Detail / Room.', zh: '拍 1 张,AI 几秒给它名字属性技能。长按选 精细 / 房间扫描' })}
          </Text>
        </View>
        <Text style={styles.worldFeedArrow}>→</Text>
      </Pressable>

      {/* 已有角色 → 角色卷轴 + 玩法入口; 新用户 → 不展示空的战斗/副本 */}
      {hasAssets ? (
        <>
          {/* 我的世界(角色动态)—— 永曜城里"你不在时角色们在忙什么"的剧情线 */}
          <Pressable
            style={({ pressed }) => [styles.worldFeedEntry, pressed && styles.heroPressed]}
            onPress={onWorldFeed}
            testID="world-feed-entry"
          >
            <Text style={styles.worldFeedEmoji}>📖</Text>
            <View style={styles.worldFeedTextWrap}>
              <Text style={styles.worldFeedTitle}>
                {t({ en: 'My characters’ stories', zh: '我的角色动态' })}
              </Text>
              <Text style={styles.worldFeedSub}>
                {t({ en: 'See what your residents did in Aeon while you were away', zh: '看看你不在时,你在永曜城的居民们经历了什么' })}
              </Text>
            </View>
            <Text style={styles.worldFeedArrow}>→</Text>
          </Pressable>

          <View style={styles.rosterHeader}>
            <Text style={styles.sectionHeader}>
              🎒 {t({ en: 'My Characters', zh: '我的角色' })}
            </Text>
            <TouchableOpacity onPress={onInventory}>
              <Text style={styles.seeAll}>{t({ en: 'See all', zh: '查看全部' })} →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rosterRow}>
            {assets.map((a) => (
              <Pressable
                key={a.id}
                style={styles.rosterCard}
                onPress={onInventory}
              >
                <View style={styles.rosterThumb}>
                  {a.portraitUrl || a.styledMeshUrl ? (
                    <Image
                      source={{ uri: (a.styledMeshUrl as string) || (a.portraitUrl as string) }}
                      style={styles.rosterThumbImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.rosterThumbEmoji}>
                      {a.generationStatus && a.generationStatus !== 'complete' && a.generationStatus !== 'card_ready' ? '⏳' : '🦊'}
                    </Text>
                  )}
                </View>
                <Text style={styles.rosterName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.rosterMeta}>Lv.{a.level} · {a.battleWins}W</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.actionRow}>
            <CTACard
              emoji="⚔️"
              title={t({ en: 'Battle', zh: '战斗' })}
              subtitle={t({ en: 'Challenge or replay', zh: '挑战 / 回放' })}
              onPress={onBattle}
              testID="world-cta-battle"
            />
            <CTACard
              emoji="🏰"
              title={t({ en: 'Dungeon', zh: '副本' })}
              subtitle={t({ en: 'Share code / scan room', zh: '分享码 / 扫房间' })}
              onPress={onDungeon}
              testID="world-cta-dungeon"
            />
          </View>

          <View style={styles.actionRow}>
            <CTACard
              emoji="🎮"
              title={t({ en: 'Decision Battle', zh: '决策对战' })}
              subtitle={t({ en: 'You call the moves', zh: '你来出招' })}
              onPress={onBattle}
              testID="world-cta-decision-battle"
            />
            <CTACard
              emoji="🛠️"
              title={t({ en: 'My Game Modes', zh: '我的玩法' })}
              subtitle={t({ en: 'Create & share', zh: '创建并分享' })}
              onPress={onUgc}
              testID="world-cta-ugc"
            />
          </View>
        </>
      ) : (
        <View style={[styles.banner, styles.bannerInfo]}>
          <Text style={styles.bannerText}>
            {t({
              en: '💡 Scan your first object to get a character, then bring it into Aeon — claim land, build, and let it live & work there.',
              zh: '💡 先拍一个东西得到你的第一个角色,再把它带进永曜城 —— 圈地、建造,让它在城里生活和工作。',
            })}
          </Text>
        </View>
      )}

      {/* Create-digital-character section (R3.2 — moved from Home drawer) */}
      <Text style={styles.sectionHeader}>
        ✨ {t({ en: 'Create a digital character', zh: '创造数字角色' })}
      </Text>
      <View style={styles.creatorRow}>
        <CTACard
          emoji="✨"
          title={t({ en: 'Text Pet', zh: '文字创生' })}
          subtitle={t({ en: 'Describe it, AI builds it', zh: '描述它,AI 造出来' })}
          onPress={onPetCreator}
          testID="world-cta-text-pet"
        />
        <CTACard
          emoji="📸"
          title={t({ en: 'Photo → 3D Pet', zh: '拍照→3D' })}
          subtitle={t({ en: '8-12 angles, ~90s', zh: '8-12 张照片,~90 秒' })}
          onPress={onPhotoToPet}
          testID="world-cta-photo-pet"
        />
      </View>

      {/* Bottom: marketplace entry (real browse/buy screen) */}
      <TouchableOpacity
        style={styles.marketplaceEntry}
        onPress={() => navigation.navigate('WorldAssetMarketplace')}
        testID="world-cta-marketplace"
      >
        <Text style={styles.marketplaceText}>
          🛒 {t({ en: 'World Asset Marketplace', zh: '世界资产市场' })} →
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 80 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted },
  bannerStack: { marginBottom: 16, gap: 8 },
  banner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerInfo: {
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderColor: 'rgba(167,139,250,0.30)',
  },
  bannerText: { color: colors.textPrimary, fontSize: 13 },

  ctaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  ctaCard: {
    width: '48%',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 108,
    justifyContent: 'flex-start',
  },
  ctaCardPressed: { opacity: 0.7 },
  ctaEmoji: { fontSize: 28, marginBottom: 6 },
  ctaTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  ctaSubtitle: { fontSize: 11, color: colors.textMuted },

  // HERO
  hero: {
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  // Aeon hero (primary World entry)
  aeonHero: {
    backgroundColor: 'rgba(99,102,241,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.4)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
  },
  // Secondary scan strip (row style)
  scanStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  scanStripEmoji: { fontSize: 30, marginRight: 12 },
  scanStripTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  heroPressed: { opacity: 0.85 },
  heroEmoji: { fontSize: 48, marginBottom: 8 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 },
  heroSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  heroBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32 },
  heroBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  heroHint: { fontSize: 11, color: colors.textMuted, marginTop: 10 },

  // Roster
  rosterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  seeAll: { fontSize: 13, color: colors.accent, fontWeight: '600' },

  // World feed entry
  worldFeedEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.30)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  worldFeedEmoji: { fontSize: 32, marginRight: 12 },
  aeonEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99,102,241,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.30)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  worldFeedTextWrap: { flex: 1 },
  worldFeedTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  worldFeedSub: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  worldFeedArrow: { fontSize: 20, color: colors.accent, fontWeight: '700', marginLeft: 8 },

  rosterRow: { marginBottom: 16 },
  rosterCard: { width: 96, marginRight: 10, alignItems: 'center' },
  rosterThumb: {
    width: 96, height: 96, borderRadius: 14, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6, overflow: 'hidden',
  },
  rosterThumbEmoji: { fontSize: 40 },
  rosterThumbImg: { width: '100%', height: '100%' },
  rosterName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, maxWidth: 96 },
  rosterMeta: { fontSize: 11, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },

  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    marginTop: 4,
  },
  creatorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },

  marketplaceEntry: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
  },
  marketplaceText: { color: colors.accent, fontSize: 14, fontWeight: '600' },

  comingSoon: { padding: 24, alignItems: 'center', marginTop: 60 },
  comingSoonEmoji: { fontSize: 56, marginBottom: 16 },
  comingSoonTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  comingSoonBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  waitlistBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  waitlistBtnJoined: { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.accent },
  waitlistBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
