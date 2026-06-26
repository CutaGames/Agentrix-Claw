/**
 * WorldHubScreen — 🌍 世界 Tab 首屏(World Creation & Feed,task 7.1)。
 *
 * spec: ui-design §1/§2;需求 10.1–10.5。
 *   - 围绕单一核心循环组织:**创作 / 浏览 / 我的世界**,收敛旧版约 14 个并列入口
 *     与 3 个重叠"世界"概念。
 *   - 新用户(无创作):单主线 —— 一句话创作 + 两个浏览入口。
 *   - 老用户(有创作):回我的世界 + 我的创作 + 创作流推荐。
 *   - 不再出现战斗/副本/决策对战/UGC 战斗规则/拍照→3D(需求 10.5,已退役)。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { discoverCreations, listMyCreations } from '../../services/creationApi';
import type { CreationDiscoveryItem, Creation } from '../../../shared/types/creation';

export function WorldHubScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);

  const [seed, setSeed] = useState('');
  const [mine, setMine] = useState<Creation[]>([]);
  const [hot, setHot] = useState<CreationDiscoveryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mineRes, feedRes] = await Promise.all([
        listMyCreations().catch(() => ({ items: [] as Creation[] })),
        discoverCreations({ mode: 'feed', sort: 'hot', limit: 6 }).catch(() => null),
      ]);
      setMine(mineRes.items ?? []);
      if (feedRes && feedRes.mode === 'feed') setHot(feedRes.items);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onCreate = useCallback(() => {
    navigation.navigate('CreationCreator');
  }, [navigation]);

  const hasCreations = mine.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="world-hub-scroll">
      <View style={styles.header}>
        <Text style={styles.title}>🌍 {t({ en: 'World', zh: '世界' })}</Text>
        <Text style={styles.subtitle}>{t({ en: 'A living world you build with your AI', zh: '和你的 AI 一起共建的活世界' })}</Text>
      </View>

      {/* 主线:老用户=回我的城;新用户=一句话创作 */}
      {hasCreations ? (
        <TouchableOpacity style={styles.hero} onPress={() => navigation.navigate('MyWorld')} testID="world-hub-myworld">
          <Text style={styles.heroEmoji}>🏙️</Text>
          <Text style={styles.heroTitle}>{t({ en: 'My World', zh: '回到我的世界' })}</Text>
          <Text style={styles.heroSub}>{t({ en: `${mine.length} creations · manage, earn, set Agent budget`, zh: `${mine.length} 个创作 · 管理 / 收益 / Agent 代付额度` })}</Text>
          <View style={styles.heroBtn}><Text style={styles.heroBtnText}>{t({ en: 'Enter', zh: '进入' })}</Text></View>
        </TouchableOpacity>
      ) : (
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>✨</Text>
          <Text style={styles.heroTitle}>{t({ en: 'Build something with AI', zh: '和 AI 一起造点什么' })}</Text>
          <Text style={styles.heroSub}>{t({ en: 'Describe a place / game / shop — AI builds it', zh: '描述一个场所 / 游戏 / 店铺,AI 帮你造出来' })}</Text>
          <TextInput
            style={styles.seedInput}
            placeholder={t({ en: 'e.g. a late-night pour-over cafe', zh: '例如:一家深夜手冲咖啡馆' })}
            placeholderTextColor={c.textMuted}
            value={seed}
            onChangeText={setSeed}
            onSubmitEditing={onCreate}
            returnKeyType="go"
          />
          <TouchableOpacity style={styles.heroBtn} onPress={onCreate} testID="world-hub-create">
            <Text style={styles.heroBtnText}>✨ {t({ en: 'Let AI generate', zh: '让 AI 生成' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 浏览入口:创作流 / 地图(+ 老用户的新建) */}
      <View style={styles.browseRow}>
        <TouchableOpacity style={styles.browseCard} onPress={() => navigation.navigate('CreationFeed')} testID="world-hub-feed">
          <Text style={styles.browseEmoji}>🎬</Text>
          <Text style={styles.browseLabel}>{t({ en: 'Feed', zh: '刷创作流' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.browseCard} onPress={() => navigation.navigate('UnifiedWorldMap')} testID="world-hub-map">
          <Text style={styles.browseEmoji}>🗺️</Text>
          <Text style={styles.browseLabel}>{t({ en: 'World Map', zh: '逛世界地图' })}</Text>
        </TouchableOpacity>
        {hasCreations ? (
          <TouchableOpacity style={styles.browseCard} onPress={onCreate} testID="world-hub-create2">
            <Text style={styles.browseEmoji}>✨</Text>
            <Text style={styles.browseLabel}>{t({ en: 'Create', zh: '新建创作' })}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.browseCard} onPress={() => navigation.navigate('MyWorld')} testID="world-hub-myworld2">
            <Text style={styles.browseEmoji}>🗂️</Text>
            <Text style={styles.browseLabel}>{t({ en: 'My World', zh: '我的世界' })}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 我的创作(老用户) */}
      {hasCreations ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🗂️ {t({ en: 'My Creations', zh: '我的创作' })}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyWorld')}><Text style={styles.seeAll}>{t({ en: 'All', zh: '全部' })} →</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rosterRow}>
            {mine.slice(0, 8).map((c) => (
              <TouchableOpacity key={c.id} style={styles.rosterCard} onPress={() => navigation.navigate('CreationDetail', { creationId: c.id, title: c.title })}>
                <View style={styles.rosterThumb}><Text style={styles.rosterEmoji}>{c.type === 'shop' ? '🛒' : c.type === 'game' ? '🎮' : '🏛️'}</Text></View>
                <Text style={styles.rosterName} numberOfLines={1}>{c.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* 热门创作推荐 */}
      {hot.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>🔥 {t({ en: 'Trending', zh: '此刻热门' })}</Text>
          {hot.map((item) => {
            const playable = item.type === 'game' || item.type === 'drama' || item.canEnter;
            const emoji = item.type === 'shop' ? '🛒' : item.type === 'game' ? '🎮' : item.type === 'drama' ? '🎭' : item.type === 'livestream' ? '🔴' : '🏛️';
            const go = () =>
              playable
                ? navigation.navigate('CreationExperience', { creationId: item.id, type: item.type, title: item.title })
                : navigation.navigate('CreationDetail', { creationId: item.id, title: item.title });
            return (
              <TouchableOpacity key={item.id} style={styles.hotRow} onPress={go}>
                <Text style={styles.hotEmoji}>{emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hotTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.hotMeta} numberOfLines={1}>{item.creator.name ?? t({ en: 'creator', zh: '创作者' })} · 🔥 {item.metrics?.sales ?? 0}</Text>
                </View>
                <Text style={styles.hotArrow}>{playable ? '▶' : '›'}</Text>
              </TouchableOpacity>
            );
          })}
        </>
      ) : loaded && !hasCreations ? (
        <Text style={styles.dim}>{t({ en: 'Be the first to create in this world.', zh: '来当这个世界的第一个创作者。' })}</Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(c: Palette) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bgPrimary },
  content: { padding: 16, paddingBottom: 80 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: c.textMuted },

  hero: { backgroundColor: 'rgba(99,102,241,0.14)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)', borderRadius: 20, padding: 22, alignItems: 'center', marginBottom: 16 },
  heroEmoji: { fontSize: 44, marginBottom: 8 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 6 },
  heroSub: { fontSize: 13, color: c.textSecondary, textAlign: 'center', marginBottom: 14, lineHeight: 19 },
  seedInput: { alignSelf: 'stretch', backgroundColor: c.bgPrimary, borderRadius: 12, borderWidth: 1, borderColor: c.border, color: c.textPrimary, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 12 },
  heroBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32 },
  heroBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  browseRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  browseCard: { flex: 1, backgroundColor: c.bgCard, borderRadius: 14, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: c.border },
  browseEmoji: { fontSize: 26, marginBottom: 6 },
  browseLabel: { fontSize: 13, fontWeight: '600', color: c.textPrimary },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 10, marginTop: 4 },
  seeAll: { fontSize: 13, color: c.accent, fontWeight: '600' },

  rosterRow: { marginBottom: 16 },
  rosterCard: { width: 96, marginRight: 10, alignItems: 'center' },
  rosterThumb: { width: 96, height: 96, borderRadius: 14, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  rosterEmoji: { fontSize: 40 },
  rosterName: { fontSize: 13, fontWeight: '600', color: c.textPrimary, maxWidth: 96 },

  hotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.bgCard, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: c.border },
  hotEmoji: { fontSize: 24 },
  hotTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
  hotMeta: { color: c.textMuted, fontSize: 12, marginTop: 4 },
  hotArrow: { color: c.textMuted, fontSize: 22 },
  dim: { color: c.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
}); }
