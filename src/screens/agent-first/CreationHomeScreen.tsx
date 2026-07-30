import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';

export function CreationHomeScreen({ navigation }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="creation-home-screen">
      <Text style={styles.eyebrow}>{t({ en: 'CREATION', zh: '创作' })}</Text>
      <Text style={styles.title}>{t({ en: 'Build a world with your Agent', zh: '和 Agent 一起创造世界' })}</Text>
      <Text style={styles.lead}>{t({ en: 'Creation stays available without replacing the Agent-first journey.', zh: '保留现有创作能力，但不取代 Agent-first 主旅程。' })}</Text>
      <View style={styles.gate} testID="creation-economy-supply-loop-gated">
        <Text style={styles.gateTitle}>{t({ en: 'Owner operator surface ready for validation', zh: 'Owner 操作面已可验证' })}</Text>
        <Text style={styles.gateBody}>{t({
          en: 'Owner-scoped edit, quality, publish/unpublish, fulfilment views and operator status now use Creation-domain authorities. Production declaration still requires real-owner JWT, manual/agent payout idempotency, fulfilment-matrix and receipt-evidence gates.',
          zh: '编辑、质量门、发布/撤下、履约视图与 operator status 已接入 Creation-domain 的 owner-scoped 权威。正式生产宣告仍须通过真实 owner JWT、manual/agent 放款幂等、履约矩阵和 receipt 证据门禁。',
        })}</Text>
      </View>
      <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('CreationCreator')} testID="creation-primary-create">
        <Text style={styles.primaryText}>{t({ en: 'Start creating', zh: '开始创作' })}</Text>
      </TouchableOpacity>
      <View style={styles.grid}>
        <Card emoji="✨" title={t({ en: 'Creation feed', zh: '创作流' })} body={t({ en: 'Discover playable work', zh: '发现可体验作品' })} onPress={() => navigation.navigate('CreationFeed')} />
        <Card emoji="🏡" title={t({ en: 'My world', zh: '我的世界' })} body={t({ en: 'Your creations and orders', zh: '你的创作与订单' })} onPress={() => navigation.navigate('MyWorld')} />
        <Card emoji="🗺️" title={t({ en: 'World map', zh: '世界地图' })} body={t({ en: 'Explore by place', zh: '按地点探索' })} onPress={() => navigation.navigate('UnifiedWorldMap')} />
        <Card emoji="🛍️" title={t({ en: 'Plot market', zh: 'Plot 市场' })} body={t({ en: 'Existing marketplace', zh: '现有市场能力' })} onPress={() => navigation.navigate('WorldCreationMarketplace')} />
      </View>
    </ScrollView>
  );
}

function Card({ emoji, title, body, onPress }: { emoji: string; title: string; body: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return <TouchableOpacity style={styles.card} onPress={onPress}><Text style={styles.emoji}>{emoji}</Text><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardBody}>{body}</Text></TouchableOpacity>;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    eyebrow: { color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    title: { color: c.textPrimary, fontSize: 28, fontWeight: '800', lineHeight: 35 },
    lead: { color: c.textSecondary, fontSize: 15, lineHeight: 22 },
    gate: { backgroundColor: c.bgCard, borderRadius: 16, borderWidth: 1, borderColor: '#2f855a', padding: 14, gap: 6 },
    gateTitle: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    gateBody: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    primary: { backgroundColor: '#df744f', borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    card: { width: '48%', minHeight: 135, backgroundColor: c.bgCard, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 15 },
    emoji: { fontSize: 27, marginBottom: 10 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '800' },
    cardBody: { color: c.textMuted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  });
}
