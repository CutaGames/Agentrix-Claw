/**
 * PlazaPlaceholderScreens — Sprint A placeholders.
 *
 * Each of these screens exists to satisfy `PlazaStackParamList` so the new
 * 4-tab routing compiles and the deep-link `resolveLegacyRoute` mapping
 * targets something real. Real implementations land in Sprint B/C:
 *
 *   Sprint B2  - Feed (full)            : replaces `FeedStub`
 *   Sprint B4  - Tasks (full)           : replaces `TasksStub`
 *   Sprint B5  - Pets (Skin auction)    : replaces `PetsSkinsStub`, `PetsStub`
 *   Sprint B6  - Play (Predict + entries): replaces `PlayStub`
 *   Sprint B7  - Messaging (real DM)    : replaces `MessagingStub`
 *   Sprint C2  - Greeting cards (real)  : replaces `GreetingCardComposeStub`, `GreetingCardInboxStub`
 *   Sprint B/C - Toy custom             : real partner-inquiry form
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

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

export function PlazaMessagingStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="💬"
      title={t({ en: 'Messaging', zh: '私信与群聊' })}
      body={t({ en: 'Unified DM + group chat. Currently the four legacy DM screens are being consolidated.', zh: '统一私信与群聊中心。目前正在合并 4 个旧 DM 屏。' })}
      sprint="Sprint B7"
    />
  );
}

export function PlazaGreetingCardComposeStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="🎁"
      title={t({ en: 'Greeting Card Composer', zh: '宠物贺卡创作' })}
      body={t({ en: 'Pick a scene, a pet, a message. Your pet delivers the card via universal link.', zh: '选场景 · 选主宠 · 选文案，让主宠替你送达。' })}
      sprint="Sprint C2"
    />
  );
}

export function PlazaGreetingCardInboxStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="📬"
      title={t({ en: 'Greeting Card Inbox', zh: '贺卡收件箱' })}
      body={t({ en: "Cards your friends' pets have sent to you.", zh: '好友主宠寄来的贺卡。' })}
      sprint="Sprint C2"
    />
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

export function PlazaPetsSkinsStub() {
  const { t } = useI18n();
  return (
    <StubScreen
      emoji="🎨"
      title={t({ en: 'Skin Auction', zh: '皮肤拍卖' })}
      body={t({ en: 'Browse, bid, and list pet skins. Phase 1 MVP.', zh: '浏览 / 出价 / 挂牌主宠皮肤。Phase 1 首发。' })}
      sprint="Sprint B5"
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, alignItems: 'center' },
  emoji: { fontSize: 64, marginTop: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  sprint: { fontSize: 11, color: colors.textMuted, fontWeight: '600', opacity: 0.6 },
});
