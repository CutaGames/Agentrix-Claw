/**
 * PlazaPlaceholderScreens — Sprint A placeholders.
 *
 * Each of these screens exists to satisfy `PlazaStackParamList` so the new
 * 4-tab routing compiles and the deep-link `resolveLegacyRoute` mapping
 * targets something real. Real implementations land in Sprint B/C:
 *
 *   Sprint B2  - Feed (full)            : replaces `FeedStub`
 *   Sprint B4  - Tasks (full)           : replaces `TasksStub`
 *   Sprint B5  - Pets (Skin auction)    : ✅ replaced 2026-05-10 by SkinAuctionScreen
 *   Sprint B6  - Play (Predict + entries): replaces `PlayStub`
 *   Sprint B7  - Messaging (real DM)    : ✅ replaced 2026-05-10 by MessagingScreen
 *   Sprint B/C - Toy custom             : real partner-inquiry form
 *
 * (PlazaGreetingCardComposeStub / PlazaGreetingCardInboxStub removed
 *  2026-05-10 — replaced by real `GreetingCardComposeScreen` /
 *  `GreetingCardInboxScreen`. PlazaPetsSkinsStub removed 2026-05-10 —
 *  replaced by real SkinAuctionScreen wired to /pet-skin/marketplace.)
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { themedStyles } from '../../theme/useTheme';

function StubScreen({ emoji, title, body, sprint }: { emoji: string; title: string; body: string; sprint: string }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Text style={styles.sprint}>{sprint}</Text>
    </ScrollView>
  );
}

export function PlazaToyCustomStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="🧸"
      title={t({ en: 'Turn pet into a physical toy', zh: '定制实体玩偶' })}
      body={t({ en: 'L2 partner program — submit a brief to our hardware team.', zh: 'L2 联名计划 — 提交定制需求给硬件团队。' })}
      sprint="Sprint B/C"
    />
  );
}

export function PlazaPetsStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="🧬"
      title={t({ en: 'Pet Marketplace', zh: '主宠市场' })}
      body={t({ en: 'Whole-pet auction with bloodline + NFT mint. Phase 2.', zh: '主宠整体拍卖 + 血统 + NFT。Phase 2。' })}
      sprint="Sprint B5 (Phase 2)"
    />
  );
}

export function PlazaPlayStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="🎮"
      title={t({ en: 'Play', zh: '玩乐' })}
      body={t({ en: 'Predict, co-raising, greeting cards, mini-games.', zh: '预测 / 共养 / 贺卡 / 小游戏。' })}
      sprint="Sprint B6"
    />
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, alignItems: 'center' },
  emoji: { fontSize: 64, marginTop: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  sprint: { fontSize: 11, color: colors.textMuted, fontWeight: '600', opacity: 0.6 },
}));
