/**
 * TwinHuddleListScreen — 分身 → 约个时间 (twinHuddle.ts). Only in builds with `EXPO_PUBLIC_TWIN_HUDDLE=1`. The plans you
 * started or were invited to, newest first, each with what it is waiting for; a new plan and the settings start here.
 */
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_HUDDLE_KIND_LABELS_V0, type TwinHuddleListItemV0 } from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_SERIES_ENABLED } from '../../services/twinHuddleSeries';
import { mobileTwinHuddleClient } from '../../services/twinHuddleSession';
import { twinHuddleDayWords, twinHuddleFailureWords, twinHuddleStatusWords } from '../../services/twinHuddleView';
import { TwinHuddleSeriesSection } from './TwinHuddleSeriesSection';

type HuddleNavigation = {
  navigate(name: 'TwinHuddleStart' | 'TwinHuddleSettings'): void;
  navigate(name: 'TwinHuddleDetail', params: { id: string }): void;
};

export function TwinHuddleListScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<HuddleNavigation>();
  const plans = useInfiniteQuery({
    queryKey: ['twin-huddle', 'list'],
    queryFn: ({ pageParam }) => mobileTwinHuddleClient().list(pageParam),
    initialPageParam: undefined as string | undefined,
    // The server sends at most one page per call and an empty page once nothing older is left.
    getNextPageParam: (page: TwinHuddleListItemV0[]) => (page.length > 0 ? page[page.length - 1].createdAt : undefined),
  });
  const items = plans.data ? plans.data.pages.flat() : [];
  const now = new Date();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-list-screen">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Plan a time together', zh: '约个时间' })}</Text>
      <Text style={styles.muted}>{t({ en: "Your twin works it out with your friends' twins. You have the final say.", zh: '分身替你商量，最后你点头。' })}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.grow]} onPress={() => navigation.navigate('TwinHuddleStart')} accessibilityRole="button" testID="twin-huddle-new">
          <Text style={styles.buttonText}>{t({ en: 'Start a plan', zh: '发起商量' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('TwinHuddleSettings')} accessibilityRole="button" testID="twin-huddle-settings">
          <Text style={styles.secondaryText}>{t({ en: 'Settings', zh: '设置' })}</Text>
        </TouchableOpacity>
      </View>
      {TWIN_HUDDLE_SERIES_ENABLED ? <TwinHuddleSeriesSection /> : null}
      {plans.isPending ? <ActivityIndicator /> : null}
      {plans.isError ? (
        <Text style={styles.muted} testID="twin-huddle-list-error">
          {t(twinHuddleFailureWords(plans.error))}
        </Text>
      ) : null}
      {plans.isSuccess && items.length === 0 ? (
        <Text style={styles.muted} testID="twin-huddle-list-empty">
          {t({ en: 'No plans yet.', zh: '还没有商量。' })}
        </Text>
      ) : null}
      {items.map((item) => {
        const day = twinHuddleDayWords(new Date(item.createdAt), now);
        const kind = t(TWIN_HUDDLE_KIND_LABELS_V0[item.kind]);
        const side = t(item.role === 'initiator' ? { en: 'You started it', zh: '我发起的' } : { en: 'You were invited', zh: '约我的' });
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={() => navigation.navigate('TwinHuddleDetail', { id: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`${kind} · ${side}`}
            testID={`twin-huddle-item-${item.id}`}
          >
            <Text style={styles.rowLabel}>
              {kind} · {side}
            </Text>
            <Text style={item.needsMe ? styles.rowAlert : styles.rowHint}>{t(twinHuddleStatusWords(item))}</Text>
            <Text style={styles.rowHint}>{t({ en: `Started ${day.en}`, zh: `${day.zh}发起` })}</Text>
          </TouchableOpacity>
        );
      })}
      {plans.hasNextPage && items.length > 0 ? (
        <TouchableOpacity style={styles.secondary} onPress={() => void plans.fetchNextPage()} disabled={plans.isFetchingNextPage} accessibilityRole="button" testID="twin-huddle-more">
          <Text style={styles.secondaryText}>{t({ en: 'Older plans', zh: '更早的商量' })}</Text>
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
    rowHint: { color: c.textMuted, fontSize: 13 },
    rowAlert: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
