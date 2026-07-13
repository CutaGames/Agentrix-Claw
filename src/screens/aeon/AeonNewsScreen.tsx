/**
 * AeonNewsScreen — 永曜城世界动态:新闻流 + AXP 收入排行榜。
 * 复用已有 /v1/aeon/news + /v1/aeon/news/leaderboard。给玩家"世界在运转 + 有人在赚"的体感。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { listWorldNews, getLeaderboard } from '../../services/aeon/aeonApi';
import type { AeonNewsItem, AeonLeaderboardEntry } from '../../../shared/types/aeon-world';
import { themedStyles } from '../../theme/useTheme';

export default function AeonNewsScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<'news' | 'rank'>('news');
  const [news, setNews] = useState<AeonNewsItem[]>([]);
  const [rank, setRank] = useState<AeonLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([listWorldNews().catch(() => []), getLeaderboard().catch(() => [])]);
      setNews(n); setRank(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>📰 世界动态</Text>
        <View style={{ minWidth: 64 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'news' && styles.tabActive]} onPress={() => setTab('news')}>
          <Text style={[styles.tabText, tab === 'news' && styles.tabTextActive]}>新闻</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'rank' && styles.tabActive]} onPress={() => setTab('rank')}>
          <Text style={[styles.tabText, tab === 'rank' && styles.tabTextActive]}>AXP 排行</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : tab === 'news' ? (
        <FlatList
          data={news}
          keyExtractor={(n, i) => n.id ?? String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.empty}>世界刚刚苏醒,还没有大事发生。去任务广场制造第一条新闻吧。</Text>}
          renderItem={({ item }) => (
            <View style={styles.newsRow}>
              <Text style={styles.newsIcon}>{(item as any).icon || '•'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.newsText}>{(item as any).headline || (item as any).summary || (item as any).text || '世界动态'}</Text>
                {!!(item as any).createdAt && <Text style={styles.newsTime}>{new Date((item as any).createdAt).toLocaleString()}</Text>}
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={rank}
          keyExtractor={(r, i) => (r as any).userId ?? (r as any).id ?? String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.empty}>排行榜还空着。完成任务赚 AXP,争当永曜城首富。</Text>}
          renderItem={({ item, index }) => (
            <View style={styles.rankRow}>
              <Text style={styles.rankNum}>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</Text>
              <Text style={styles.rankName} numberOfLines={1}>{(item as any).displayName || (item as any).name || '匿名居民'}</Text>
              <Text style={styles.rankAxp}>{(item as any).axp ?? (item as any).totalAxp ?? 0} AXP</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  back: { minWidth: 64 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.bgCard, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40, lineHeight: 19, paddingHorizontal: 24 },
  newsRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: colors.bgCard, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  newsIcon: { fontSize: 18 },
  newsText: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  newsTime: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: colors.bgCard, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  rankNum: { fontSize: 16, fontWeight: '800', width: 40, color: colors.textPrimary },
  rankName: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  rankAxp: { color: colors.accent, fontSize: 14, fontWeight: '800' },
}));
