/**
 * TwinAskListScreen — 分身 → 问遍身边人 (twinAsk.ts). Only in builds with `EXPO_PUBLIC_TWIN_ASK=1`. The questions you asked or
 * were asked, newest first, each with how far it has got; a new question starts here.
 */
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_ASK_TOPIC_LABELS_V0, type TwinAskListItemV0 } from '../../../shared/types/twin-ask';
import { mobileTwinAskClient } from '../../services/twinAskSession';
import { twinAskFailureWords, twinAskSideWords, twinAskStatusWords, twinAskWhenWords } from '../../services/twinAskView';

type AskNavigation = {
  navigate(name: 'TwinAskStart' | 'TwinAskSettings'): void;
  navigate(name: 'TwinAskDetail', params: { id: string }): void;
};

export function TwinAskListScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<AskNavigation>();
  const asks = useInfiniteQuery({
    queryKey: ['twin-ask', 'list'],
    queryFn: ({ pageParam }) => mobileTwinAskClient().list(pageParam),
    initialPageParam: undefined as string | undefined,
    // The server sends at most one page per call and an empty page once nothing older is left.
    getNextPageParam: (page: TwinAskListItemV0[]) => (page.length > 0 ? page[page.length - 1].createdAt : undefined),
  });
  const items = asks.data ? asks.data.pages.flat() : [];
  const now = new Date();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-ask-list-screen">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Ask around', zh: '问遍身边人' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: "Your twin asks your friends. Their twins only pass on what they wrote down to share, and leave the rest to them.",
          zh: '分身替你问朋友。朋友的分身只转述他写好、愿意告诉朋友的话，答不了就转给他本人。',
        })}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.grow]} onPress={() => navigation.navigate('TwinAskStart')} accessibilityRole="button" testID="twin-ask-new">
          <Text style={styles.buttonText}>{t({ en: 'Ask your friends', zh: '问朋友' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('TwinAskSettings')} accessibilityRole="button" testID="twin-ask-settings">
          <Text style={styles.secondaryText}>{t({ en: 'Settings', zh: '设置' })}</Text>
        </TouchableOpacity>
      </View>
      {asks.isPending ? <ActivityIndicator /> : null}
      {asks.isError ? (
        <Text style={styles.muted} testID="twin-ask-list-error">
          {t(twinAskFailureWords(asks.error))}
        </Text>
      ) : null}
      {asks.isSuccess && items.length === 0 ? (
        <Text style={styles.muted} testID="twin-ask-list-empty">
          {t({ en: 'No questions yet.', zh: '还没有问题。' })}
        </Text>
      ) : null}
      {items.map((item) => {
        const topic = t(TWIN_ASK_TOPIC_LABELS_V0[item.topic]);
        const side = t(twinAskSideWords(item.role));
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={() => navigation.navigate('TwinAskDetail', { id: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`${topic} · ${side}`}
            testID={`twin-ask-item-${item.id}`}
          >
            <Text style={styles.rowLabel}>
              {topic} · {side}
            </Text>
            <Text style={styles.rowQuestion} numberOfLines={2}>
              {item.question}
            </Text>
            <Text style={item.needsMe ? styles.rowAlert : styles.rowHint}>{t(twinAskStatusWords(item))}</Text>
            <Text style={styles.rowHint}>{t(twinAskWhenWords(new Date(item.createdAt), now))}</Text>
          </TouchableOpacity>
        );
      })}
      {asks.hasNextPage && items.length > 0 ? (
        <TouchableOpacity style={styles.secondary} onPress={() => void asks.fetchNextPage()} disabled={asks.isFetchingNextPage} accessibilityRole="button" testID="twin-ask-more">
          <Text style={styles.secondaryText}>{t({ en: 'Older questions', zh: '更早的问题' })}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, gap: 10 },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    grow: { flex: 1 },
    button: { minHeight: 44, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    row: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 4 },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    rowQuestion: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    rowHint: { color: c.textMuted, fontSize: 13 },
    rowAlert: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
