/**
 * PetHubScreen — V4 mobile Pet tab landing (PRD mobile-prd-v4 §2.1 / §4).
 *
 * Single-screen launcher for all V4 pet capabilities:
 *   - Companion (主宠 status / 灵魂 × 皮肤)
 *   - Creator (text/image → 3D pet)
 *   - Wardrobe (我的皮肤)
 *   - Soul Picker (6 族群灵魂切换)
 *   - Skin Marketplace (浏览 / 购买 / 上架)
 *   - Breed (双图融合)
 */
import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';

interface Tile {
  key: string;
  emoji: string;
  title: string;
  desc: string;
  route: string;
  accent: string;
}

const TILES: Tile[] = [
  { key: 'companion', emoji: '🐾', title: '我的萌宠', desc: '灵魂 × 皮肤 · 实时情绪', route: 'PetCompanion', accent: '#a78bfa' },
  { key: 'creator',   emoji: '✨', title: '生成新萌宠', desc: '文字 / 图片 → 3D 模型', route: 'PetCreator',   accent: '#34d399' },
  { key: 'wardrobe',  emoji: '👗', title: '我的衣柜', desc: '已拥有的皮肤 / 切换装备', route: 'Wardrobe',     accent: '#22d3ee' },
  { key: 'soul',      emoji: '💫', title: '灵魂切换', desc: '6 族群灵魂模板',         route: 'SoulPicker',   accent: '#e879f9' },
  { key: 'breed',     emoji: '🧬', title: '双图繁殖', desc: '两只皮肤融合出新形态',     route: 'Breed',         accent: '#f472b6' },
  { key: 'market',    emoji: '🛒', title: '萌宠市场', desc: '浏览 / 购买 / 上架皮肤',   route: 'SkinMarketplace', accent: '#fbbf24' },
  { key: 'team',      emoji: '👥', title: '萌宠团队', desc: 'Lv.5+ 多宠协作分担任务',  route: 'PetTeam',       accent: '#60a5fa' },
  { key: 'worldscan', emoji: '🌍', title: '世界扫描', desc: '扫描真实物体 → 游戏角色',  route: 'WorldEngineScanner', accent: '#10b981' },
  { key: 'worldassets', emoji: '🎒', title: '世界资产', desc: '我的角色 / 战斗 / 副本',  route: 'WorldAssetInventory', accent: '#06b6d4' },
  { key: 'playground', emoji: '🎮', title: '成长 · 游戏 · 繁育', desc: '亲密度 / 成就 / 相册 / 迷你游戏 / 社交繁育', route: 'PetPlayground', accent: '#f97316' },
  { key: 'nfc',       emoji: '📱', title: 'NFC 盲盒', desc: '碰触 NFC 卡牌解锁限定皮肤', route: 'NfcRedeem',    accent: '#06b6d4' },
];

export function PetHubScreen() {
  const navigation = useNavigation<any>();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>萌宠中心</Text>
        <Text style={styles.subtitle}>V4 · 灵魂 × 皮肤 × 摄像头工坊</Text>
      </View>
      <View style={styles.grid}>
        {TILES.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => navigation.navigate(t.route)}
            style={({ pressed }) => [
              styles.tile,
              { borderColor: t.accent + '55', backgroundColor: t.accent + '10' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.tileEmoji}>{t.emoji}</Text>
            <Text style={styles.tileTitle}>{t.title}</Text>
            <Text style={styles.tileDesc} numberOfLines={2}>{t.desc}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>📱 即将上线</Text>
        <Text style={styles.noticeText}>
          · 摄像头扫描真实物体 → 3D 萌宠（V5）
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47.5%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minHeight: 110,
  },
  tileEmoji: { fontSize: 28 },
  tileTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 6 },
  tileDesc: { color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 },
  notice: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  noticeTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  noticeText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
