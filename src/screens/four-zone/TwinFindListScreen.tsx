/**
 * TwinFindListScreen — 分身 → 帮我找人 (twinFind.ts). Only in builds with `EXPO_PUBLIC_TWIN_FIND=1`. The questions you
 * started, the ones a friend asked you, and the ones where a friend would like to introduce you, newest first, each with
 * whose turn it is; a new question starts here.
 */
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_ASK_TOPIC_LABELS_V0 } from '../../../shared/types/twin-ask';
import type { TwinFindListItemV0 } from '../../../shared/types/twin-find';
import { mobileTwinFindClient } from '../../services/twinFindSession';
import { twinAskWhenWords } from '../../services/twinAskView';
import { TWIN_FIND_HOW_WORDS, twinFindFailureWords, twinFindOpenTarget, twinFindSideWords, twinFindStatusWords } from '../../services/twinFindView';

type FindNavigation = {
  navigate(name: 'TwinFindStart'): void;
  navigate(name: 'TwinFindDetail', params: { id: string }): void;
  navigate(name: 'TwinFindIntro', params: { bridgeId: string }): void;
};

export function TwinFindListScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<FindNavigation>();
  const finds = useInfiniteQuery({
    queryKey: ['twin-find', 'list'],
    queryFn: ({ pageParam }) => mobileTwinFindClient().list(pageParam),
    initialPageParam: undefined as string | undefined,
    // The server sends at most one page per call and an empty page once nothing older is left.
    getNextPageParam: (page: TwinFindListItemV0[]) => (page.length > 0 ? page[page.length - 1].createdAt : undefined),
  });
  const items = finds.data ? finds.data.pages.flat() : [];
  const now = new Date();

  const open = (item: TwinFindListItemV0): void => {
    const target = twinFindOpenTarget(item);
    if (target === null) return;
    if (target.screen === 'intro') navigation.navigate('TwinFindIntro', { bridgeId: target.bridgeId });
    else navigation.navigate('TwinFindDetail', { id: target.id });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-list-screen">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Find someone through friends', zh: '帮我找人' })}</Text>
      <Text style={styles.muted}>{t(TWIN_FIND_HOW_WORDS)}</Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('TwinFindStart')} accessibilityRole="button" testID="twin-find-new">
        <Text style={styles.buttonText}>{t({ en: 'Ask who knows someone', zh: '问问谁认识' })}</Text>
      </TouchableOpacity>
      {finds.isPending ? <ActivityIndicator /> : null}
      {finds.isError ? (
        <Text style={styles.muted} testID="twin-find-list-error">
          {t(twinFindFailureWords(finds.error))}
        </Text>
      ) : null}
      {finds.isSuccess && items.length === 0 ? (
        <Text style={styles.muted} testID="twin-find-list-empty">
          {t({ en: 'Nothing here yet.', zh: '还没有记录。' })}
        </Text>
      ) : null}
      {items.map((item) => {
        const topic = t(TWIN_ASK_TOPIC_LABELS_V0[item.topic]);
        const side = t(twinFindSideWords(item.role));
        // The same question can show twice for one person: asked as a friend, and introduced by another friend.
        const key = `${item.role}-${item.bridgeId ?? item.id}`;
        return (
          <TouchableOpacity key={key} style={styles.row} onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={`${topic} · ${side}`} testID={`twin-find-item-${key}`}>
            <Text style={styles.rowLabel}>
              {topic} · {side}
            </Text>
            <Text style={styles.rowQuestion} numberOfLines={2}>
              {item.question}
            </Text>
            <Text style={item.needsMe ? styles.rowAlert : styles.rowHint}>{t(twinFindStatusWords(item))}</Text>
            <Text style={styles.rowHint}>{t(twinAskWhenWords(new Date(item.createdAt), now))}</Text>
          </TouchableOpacity>
        );
      })}
      {finds.hasNextPage && items.length > 0 ? (
        <TouchableOpacity style={styles.secondary} onPress={() => void finds.fetchNextPage()} disabled={finds.isFetchingNextPage} accessibilityRole="button" testID="twin-find-more">
          <Text style={styles.secondaryText}>{t({ en: 'Older ones', zh: '更早的' })}</Text>
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
    button: { minHeight: 44, marginTop: 4, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    row: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 4 },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    rowQuestion: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    rowHint: { color: c.textMuted, fontSize: 13 },
    rowAlert: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
