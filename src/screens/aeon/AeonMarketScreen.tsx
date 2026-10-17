/**
 * AeonMarketScreen — 永曜城·市场街区(统一入口)。
 *
 * 把分散在各 tab 的市场聚到永曜城里:世界资产、技能、宠物皮肤、宠物繁育/领养、
 * AI 厂商订阅。点卡片跨 tab 跳到已有的市场屏(不重复实现),让"逛市场"成为城里的
 * 一个真实街区入口,而不只是任务。
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/useTheme';

interface MarketTile {
  emoji: string;
  title: string;
  subtitle: string;
  go: (nav: any) => void;
}

const TILES: MarketTile[] = [
  {
    emoji: '🧊', title: '世界资产市场', subtitle: '扫描生成的角色 / 武器,买卖交易',
    go: (nav) => nav.navigate('WorldAssetMarketplace'),
  },
  {
    emoji: '⚡', title: '技能市场', subtitle: 'OpenClaw Hub 5000+ 技能,装到你的 agent',
    go: (nav) => nav.navigate('Plaza', { screen: 'Skills' }),
  },
  {
    emoji: '🎨', title: '皮肤市场', subtitle: '给你的宠物换装、换形态',
    go: (nav) => nav.navigate('Me', { screen: 'PetSkinMarketplace' }),
  },
  {
    emoji: '🦊', title: '宠物 / 繁育', subtitle: '领养、繁育、组队你的 AI 宠物',
    go: (nav) => nav.navigate('Me', { screen: 'PetBreed' }),
  },
  {
    emoji: '🛒', title: '集市广场', subtitle: '完整集市:商品 / 资源 / 服务',
    go: (nav) => nav.navigate('Plaza', { screen: 'PlazaRoot' }),
  },
  {
    emoji: '🔑', title: 'AI 厂商与订阅', subtitle: '用自己的 API / 订阅驱动 agent',
    go: (nav) => nav.navigate('Me', { screen: 'ApiKeys' }),
  },
];

export default function AeonMarketScreen() {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>🏬 市场街区</Text>
        <View style={{ minWidth: 64 }} />
      </View>
      <Text style={styles.intro}>永曜城的市场街区 —— 逛资产、技能、皮肤、宠物、资源。点任意入口进入对应市场。</Text>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {TILES.map((tile) => (
          <TouchableOpacity key={tile.title} style={styles.tile} activeOpacity={0.8} onPress={() => tile.go(navigation)}>
            <Text style={styles.tileEmoji}>{tile.emoji}</Text>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileSub} numberOfLines={2}>{tile.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  back: { minWidth: 64 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  intro: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 16, marginBottom: 12, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 12, paddingBottom: 40 },
  tile: { width: '47%', backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, minHeight: 120 },
  tileEmoji: { fontSize: 30 },
  tileTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 8 },
  tileSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
}));
