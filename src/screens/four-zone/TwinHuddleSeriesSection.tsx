/**
 * TwinHuddleSeriesSection — the 「每周固定」 block on the plans list (TwinHuddleListScreen). Rendered only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE_SERIES=1`: the weekly plans that are still mine, and where a new one starts. Invitations to
 * a weekly plan arrive here, marked as waiting for me.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_HUDDLE_KIND_LABELS_V0 } from '../../../shared/types/twin-huddle';
import { mobileTwinHuddleSeriesClient } from '../../services/twinHuddleSeriesSession';
import { twinHuddleSeriesFailureWords, twinHuddleSeriesStatusWords, twinHuddleSeriesWeeklyWords } from '../../services/twinHuddleSeriesView';

type SeriesNavigation = {
  navigate(name: 'TwinHuddleSeriesStart'): void;
  navigate(name: 'TwinHuddleSeriesDetail', params: { id: string }): void;
};

export function TwinHuddleSeriesSection() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<SeriesNavigation>();
  const series = useQuery({ queryKey: ['twin-huddle-series', 'list'], queryFn: () => mobileTwinHuddleSeriesClient().list() });
  const now = new Date();

  return (
    <View style={styles.section} testID="twin-huddle-series-section">
      <View style={styles.head}>
        <Text style={styles.heading}>{t({ en: 'Every week', zh: '每周固定' })}</Text>
        <TouchableOpacity style={styles.add} onPress={() => navigation.navigate('TwinHuddleSeriesStart')} accessibilityRole="button" testID="twin-huddle-series-new">
          <Text style={styles.addText}>{t({ en: 'Set one up', zh: '发起一个' })}</Text>
        </TouchableOpacity>
      </View>
      {series.isError ? (
        <Text style={styles.muted} testID="twin-huddle-series-error">
          {t(twinHuddleSeriesFailureWords(series.error))}
        </Text>
      ) : null}
      {series.isSuccess && series.data.length === 0 ? (
        <Text style={styles.muted} testID="twin-huddle-series-empty">
          {t({ en: 'Nothing weekly yet.', zh: '还没有每周固定的事。' })}
        </Text>
      ) : null}
      {(series.data ?? []).map((item) => {
        const kind = t(TWIN_HUDDLE_KIND_LABELS_V0[item.kind]);
        const side = t(item.role === 'initiator' ? { en: 'You started it', zh: '我发起的' } : { en: 'You were invited', zh: '约我的' });
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={() => navigation.navigate('TwinHuddleSeriesDetail', { id: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`${kind} · ${side}`}
            testID={`twin-huddle-series-item-${item.id}`}
          >
            <Text style={styles.rowLabel}>
              {kind} · {t(twinHuddleSeriesWeeklyWords(item.first))} · {side}
            </Text>
            <Text style={item.needsMe ? styles.rowAlert : styles.rowHint}>{t(twinHuddleSeriesStatusWords(item, now))}</Text>
            {item.joined !== null ? <Text style={styles.rowHint}>{t({ en: `${item.joined} joined`, zh: `已加入 ${item.joined} 位` })}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { gap: 8, marginTop: 4 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heading: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    add: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    addText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    row: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 4 },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    rowHint: { color: c.textMuted, fontSize: 13 },
    rowAlert: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
