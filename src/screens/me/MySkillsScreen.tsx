import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

export function MySkillsScreen() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-skills'],
    queryFn: () => apiFetch<any>('/skills/installed'),
    // 安装技能后各安装入口 invalidate 的是 ['my-skills', instanceId](带 id),
    // 与本屏的裸 key 不匹配 → 列表不会自动刷新。改为每次聚焦强制 refetch,
    // 保证从集市/Hub 安装后回到"我的技能"一定能看到。(2026-06-01 修复)
    staleTime: 0,
  });
  const skills = data?.items || data?.data || data || [];

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(s: any) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.empty}>No skills yet. Browse the market!</Text>}
          renderItem={({ item: skill }: { item: any }) => (
            <View style={styles.row}>
              <Text style={styles.icon}>{skill.icon || '⚡'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{skill.name || skill.displayName}</Text>
                <Text style={styles.meta}>{skill.category}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  icon: { fontSize: 24 },
  name: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 14, marginTop: 40 },
});
