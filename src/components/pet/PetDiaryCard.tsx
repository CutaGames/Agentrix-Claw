/**
 * PetDiaryCard — Phase C / C-7
 *
 * Renders today's "one-sentence diary" from `GET /v1/pet/diary`. Tapping the
 * card flips between the latest 7 days. Shows a graceful skeleton while
 * loading and a quiet placeholder if the user has not yet earned an entry.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';
import { getRecentDiary, type PetDiaryEntry } from '../../services/petDiarySdk';
import { themedStyles } from '../../theme/useTheme';

interface Props {
  /** Optional refresh trigger — bump this when emotion changes a lot. */
  refreshKey?: number;
}

export function PetDiaryCard({ refreshKey }: Props) {
  const [items, setItems] = useState<PetDiaryEntry[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getRecentDiary(7)
      .then((entries) => {
        if (!cancelled) {
          setItems(entries);
          setIdx(0);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error)?.message || 'load failed');
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>📔 宠物日记</Text>
        <Text style={styles.muted}>暂时无法加载日记 · {error}</Text>
      </View>
    );
  }

  if (items == null) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>📔 宠物日记</Text>
        <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>📔 宠物日记</Text>
        <Text style={styles.muted}>多陪陪它，明天就会有今天的小记。</Text>
      </View>
    );
  }

  const cur = items[Math.min(idx, items.length - 1)];
  const isToday = idx === 0;
  return (
    <Pressable
      onPress={() => setIdx((v) => (v + 1) % items.length)}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel="切换查看其他日期的日记"
    >
      <View style={styles.row}>
        <Text style={styles.title}>📔 宠物日记 · {isToday ? '今天' : cur.date}</Text>
        {items.length > 1 && (
          <Text style={styles.swipeHint}>{idx + 1}/{items.length} 点击查看下一篇</Text>
        )}
      </View>
      <Text style={styles.body}>{cur.text_zh}</Text>
      <Text style={styles.meta}>
        情绪 {cur.emotion} · 亲密度 Lv {cur.intimacy_level}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: { color: '#a78bfa', fontSize: 13, fontWeight: '700' },
  swipeHint: { color: colors.textSecondary, fontSize: 11 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  meta: { color: colors.textSecondary, fontSize: 11 },
  muted: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
}));
