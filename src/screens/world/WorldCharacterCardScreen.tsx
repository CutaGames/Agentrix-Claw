/**
 * WorldCharacterCardScreen — 方案 B "card-before-mesh" 的核心 wow 屏。
 *
 * 扫描提交后立即跳到这里:
 *   - 立刻展示 AI 角色卡(名字/属性/技能/性格/背景), 无需等 3D —— 这是 <60s wow。
 *   - 同时后台轮询 asset.generationStatus:
 *       card_ready / mesh_pending → 顶部显示"3D 模型孵化中…"
 *       complete                  → 显示"3D 已就绪", 提供查看按钮
 *       mesh_failed               → 显示"3D 生成失败, 可稍后重试"(卡片仍在)
 *   - 底部 CTA: 进入战斗 / 查看资产库 / 分享角色卡。
 *
 * 关键: 即使 3D 永远不来, 用户已经拥有一个有名字有属性的角色 —— 资产不丢, wow 已达成。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { getWorldAsset, type CharacterCard, type GenerationStatus } from '../../services/worldEngineApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WorldCharacterCard'>;
type Rt = RouteProp<WorldStackParamList, 'WorldCharacterCard'>;

const STAT_META: { key: string; label: { en: string; zh: string }; emoji: string; color: string }[] = [
  { key: 'hp', label: { en: 'HP', zh: '生命' }, emoji: '❤️', color: '#ef4444' },
  { key: 'atk', label: { en: 'ATK', zh: '攻击' }, emoji: '⚔️', color: '#f59e0b' },
  { key: 'def', label: { en: 'DEF', zh: '防御' }, emoji: '🛡️', color: '#3b82f6' },
  { key: 'spd', label: { en: 'SPD', zh: '速度' }, emoji: '💨', color: '#10b981' },
  { key: 'int', label: { en: 'INT', zh: '智力' }, emoji: '🧠', color: '#a855f7' },
];

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 5 * 60 * 1000; // 轮询最多 5 分钟(3D 完成通常 90-180s)

export function WorldCharacterCardScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { t } = useI18n();

  const { assetId, card: initialCard } = route.params;
  const [card] = useState<CharacterCard | undefined>(initialCard);
  const [genStatus, setGenStatus] = useState<GenerationStatus>(
    route.params.generationStatus || 'card_ready',
  );
  const [meshUrl, setMeshUrl] = useState<string | null>(null);
  const pollStartRef = useRef<number>(Date.now());
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 入场翻牌动画
    Animated.spring(flipAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [flipAnim]);

  // 轮询 3D 状态
  const poll = useCallback(async () => {
    if (!assetId) return;
    if (Date.now() - pollStartRef.current > POLL_MAX_MS) return; // 停止轮询
    try {
      const asset = await getWorldAsset(assetId);
      const status = (asset.generationStatus || 'complete') as GenerationStatus;
      setGenStatus(status);
      if (asset.meshUrl || asset.styledMeshUrl) {
        setMeshUrl(asset.styledMeshUrl || asset.meshUrl || null);
      }
      if (status === 'complete' || status === 'mesh_failed') {
        return; // 终态, 停止轮询
      }
    } catch {
      // 忽略单次轮询错误
    }
    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
  }, [assetId]);

  useEffect(() => {
    if (genStatus !== 'complete' && genStatus !== 'mesh_failed' && genStatus !== 'card_only') {
      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll]);

  // 战斗子系统已退役(world-creation-feed 需求 11.1):原"去战斗"改为进资产库,
  // 后续把角色带进统一创作/体验。保留方法签名避免改动调用点。
  const onBattle = useCallback(() => {
    navigation.navigate('WorldAssetInventory');
  }, [navigation]);

  const onInventory = useCallback(() => {
    navigation.navigate('WorldAssetInventory');
  }, [navigation]);

  const onShare = useCallback(() => {
    if (!assetId) return;
    navigation.navigate('WorldAssetListing', { assetId, assetName: card?.name });
  }, [assetId, card?.name, navigation]);

  // 游客态: 没有 assetId(本地试用未落库)。保存/战斗/分享都需先登录。
  const isGuest = useAuthStore((s) => s.isGuest);
  const markGuestTrialUsed = useAuthStore((s) => s.markGuestTrialUsed);
  const isGuestPreview = isGuest || !assetId;

  useEffect(() => {
    // 游客看到角色卡即视为消耗了一次免费试用(用于落地页文案 + 后续引导)。
    if (isGuestPreview) markGuestTrialUsed();
  }, [isGuestPreview, markGuestTrialUsed]);

  const onSaveLogin = useCallback(() => {
    // 用户可在资产库重新生成并永久保存(游客预览不落库)。
    (navigation as any).navigate('Auth', { screen: 'Login' });
  }, [navigation]);

  // card_only 引导: 平台 3D 未开放, 跳到"我的 → AI 厂商与订阅"绑定自己的 3D provider。
  const onUseOwnProvider = useCallback(() => {
    (navigation as any).navigate('Me', { screen: 'ApiKeys' });
  }, [navigation]);

  if (!card) {
    // 没有角色卡数据(异常情况) — 回退到资产库
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t({ en: 'No character data', zh: '暂无角色数据' })}</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onInventory}>
          <Text style={styles.secondaryBtnText}>{t({ en: 'Go to Inventory', zh: '去资产库' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statSum = STAT_META.reduce((sum, m) => sum + (card.stats?.[m.key] || 0), 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 3D 状态条 */}
      <MeshStatusBanner status={genStatus} t={t} onUseOwnProvider={onUseOwnProvider} />

      {/* 角色卡 */}
      <Animated.View
        style={[
          styles.card,
          {
            opacity: flipAnim,
            transform: [
              { perspective: 1000 },
              {
                rotateY: flipAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['90deg', '0deg'],
                }),
              },
            ],
          },
        ]}
      >
        {/* 头图: 3D 好了用缩略, 否则用占位 */}
        <View style={styles.heroBox}>
          {meshUrl || card.thumbnailUrl ? (
            <Image source={{ uri: card.thumbnailUrl || undefined }} style={styles.heroImg} resizeMode="contain" />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroEmoji}>✨</Text>
              <Text style={styles.heroPlaceholderText}>
                {t({ en: 'Character born!', zh: '角色已诞生！' })}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.name}>{card.name}</Text>
        <Text style={styles.category}>{card.category}</Text>

        {/* 属性条 */}
        <View style={styles.statsBlock}>
          {STAT_META.map((m) => {
            const val = card.stats?.[m.key] || 0;
            const pct = Math.max(4, Math.min(100, val));
            return (
              <View key={m.key} style={styles.statRow}>
                <Text style={styles.statLabel}>{m.emoji} {t(m.label)}</Text>
                <View style={styles.statBarTrack}>
                  <View style={[styles.statBarFill, { width: `${pct}%`, backgroundColor: m.color }]} />
                </View>
                <Text style={styles.statVal}>{val}</Text>
              </View>
            );
          })}
          <Text style={styles.statSum}>{t({ en: 'Total', zh: '属性总和' })}: {statSum}</Text>
        </View>

        {/* 技能 */}
        {card.skills?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t({ en: 'Skills', zh: '技能' })}</Text>
            {card.skills.map((s, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillName}>· {s.name}</Text>
                {s.description ? <Text style={styles.skillDesc}>{s.description}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* 性格 */}
        {card.personalityTraits?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t({ en: 'Personality', zh: '性格' })}</Text>
            <View style={styles.traitWrap}>
              {card.personalityTraits.map((tr, i) => (
                <View key={i} style={styles.traitChip}>
                  <Text style={styles.traitText}>{tr}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 背景故事 */}
        {card.backstory ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t({ en: 'Backstory', zh: '背景故事' })}</Text>
            <Text style={styles.backstory}>{card.backstory}</Text>
          </View>
        ) : null}
      </Animated.View>

      {/* CTA */}
      {isGuestPreview ? (
        <>
          <View style={styles.guestSaveBox}>
            <Text style={styles.guestSaveHint}>
              {t({
                en: 'This is a free preview. Sign in to save this character, get its 3D model, and battle with it.',
                zh: '这是免费试用预览。登录即可保存这个角色、生成它的 3D 模型并带它去战斗。',
              })}
            </Text>
            <TouchableOpacity style={styles.primaryBtnFull} onPress={onSaveLogin} testID="card-save-login">
              <Text style={styles.primaryBtnText}>💾 {t({ en: 'Save this character', zh: '保存这个角色' })}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('WorldEngineScanner', { mode: 'quick' })}>
            <Text style={styles.linkText}>{t({ en: 'Scan another →', zh: '再扫一个 →' })}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.ctaRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={onBattle}>
              <Text style={styles.primaryBtnText}>🎒 {t({ en: 'My Assets', zh: '查看资产' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onShare}>
              <Text style={styles.secondaryBtnText}>🔗 {t({ en: 'Share', zh: '分享' })}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.linkBtn} onPress={onInventory}>
            <Text style={styles.linkText}>{t({ en: 'View all my assets →', zh: '查看我的全部资产 →' })}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function MeshStatusBanner({
  status,
  t,
  onUseOwnProvider,
}: {
  status: GenerationStatus;
  t: (x: { en: string; zh: string }) => string;
  onUseOwnProvider?: () => void;
}) {
  if (status === 'complete') {
    return (
      <View style={[styles.banner, styles.bannerOk]}>
        <Text style={styles.bannerText}>✅ {t({ en: '3D model ready', zh: '3D 模型已就绪' })}</Text>
      </View>
    );
  }
  if (status === 'mesh_failed') {
    return (
      <View style={[styles.banner, styles.bannerWarn]}>
        <Text style={styles.bannerText}>
          ⚠️ {t({ en: '3D model failed — your character is saved, retry 3D later', zh: '3D 生成失败 — 角色已保存，可稍后重试 3D' })}
        </Text>
      </View>
    );
  }
  if (status === 'card_only') {
    // 平台 3D 暂未开放, 但用户可绑定自己的 3D provider(腾讯混元 / Meshy)用自己额度生成。
    return (
      <View style={[styles.banner, styles.bannerInfo]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerText}>
            🎴 {t({
              en: 'Character card is ready and fully playable in 2D. Platform 3D is not open yet.',
              zh: '角色卡已生成，2D 即可直接游玩。平台 3D 暂未开放。',
            })}
          </Text>
          <Text style={styles.bannerSubText}>
            {t({
              en: 'Want a 3D model? Connect your own provider (Tencent Hunyuan3D / Meshy) and generate on your own quota.',
              zh: '想要 3D 模型？绑定你自己的 provider（腾讯混元 / Meshy），用自己的额度即可生成。',
            })}
          </Text>
        </View>
        {onUseOwnProvider && (
          <TouchableOpacity style={styles.bannerCta} onPress={onUseOwnProvider}>
            <Text style={styles.bannerCtaText}>{t({ en: 'Set up', zh: '去设置' })}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  // card_ready / mesh_pending
  return (
    <View style={[styles.banner, styles.bannerPending]}>
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={styles.bannerText}>
        {t({ en: '3D model hatching in background…', zh: '3D 模型正在后台孵化…' })}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary, padding: 24 },
  emptyText: { color: colors.textMuted, fontSize: 15, marginBottom: 16 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginBottom: 16 },
  bannerPending: { backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  bannerOk: { backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  bannerInfo: { backgroundColor: 'rgba(56,189,248,0.10)', borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', alignItems: 'flex-start' },
  bannerSubText: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  bannerCta: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'center' },
  bannerCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bannerWarn: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  bannerText: { color: colors.textPrimary, fontSize: 13, flex: 1 },

  card: { backgroundColor: colors.bgCard, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border },
  heroBox: { height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroImg: { width: '100%', height: 180 },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 64 },
  heroPlaceholderText: { color: colors.textMuted, fontSize: 13, marginTop: 8 },

  name: { color: colors.textPrimary, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  category: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 2, marginBottom: 16 },

  statsBlock: { gap: 8, marginBottom: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabel: { color: colors.textSecondary, fontSize: 13, width: 64 },
  statBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  statBarFill: { height: 8, borderRadius: 4 },
  statVal: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', width: 32, textAlign: 'right' },
  statSum: { color: colors.textMuted, fontSize: 12, textAlign: 'right', marginTop: 4 },

  section: { marginTop: 16 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  skillRow: { marginBottom: 6 },
  skillName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  skillDesc: { color: colors.textMuted, fontSize: 12, marginLeft: 12 },
  traitWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  traitChip: { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  traitText: { color: '#c084fc', fontSize: 12, fontWeight: '600' },
  backstory: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },

  ctaRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  primaryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 16, padding: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  linkBtn: { alignItems: 'center', marginTop: 16, padding: 8 },
  linkText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  guestSaveBox: {
    marginTop: 20,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  guestSaveHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 14, textAlign: 'center' },
  primaryBtnFull: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
}));

export default WorldCharacterCardScreen;
