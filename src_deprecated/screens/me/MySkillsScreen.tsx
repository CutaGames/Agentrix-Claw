import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

export function MySkillsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-skills'],
    queryFn: () => apiFetch<any>('/skills/installed'),
  });
  const skills = data?.items || data?.data || data || [];

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(s: any) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No skills yet. Browse the market!</Text>}
          renderItem={({ item: skill }: { item: any }) => (
            <View style={styles.row}>
              <Text style={styles.icon}>{skill.icon || '⚡'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{skill.name}</Text>
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
