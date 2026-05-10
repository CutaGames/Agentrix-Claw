/**
 * Agent Memory Browser Screen — 移动端记忆浏览器
 * 按 scope/type 浏览、搜索、编辑、删除 Agent 记忆
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import {
  recallMemories,
  deleteMemorySlot,
  type MemoryEntry,
  type MemoryScope,
} from '../../services/memorySlot.api';
import { useI18n } from '../../stores/i18nStore';

const SCOPES: { key: MemoryScope; label: string; emoji: string }[] = [
  { key: 'user', label: 'User', emoji: '👤' },
  { key: 'agent', label: 'Agent', emoji: '🤖' },
  { key: 'session', label: 'Session', emoji: '💬' },
  { key: 'shared', label: 'Shared', emoji: '🌐' },
];

export default function AgentMemoryScreen() {
  const { t } = useI18n();
  const [activeScope, setActiveScope] = useState<MemoryScope>('agent');
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recallMemories({
        scopes: [activeScope],
        limit: 50,
      });
      setEntries(data || []);
    } catch (err: any) {
      console.warn('Memory recall failed:', err.message);
      setEntries([]);
    }
    setLoading(false);
  }, [activeScope]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleDelete = useCallback((entry: MemoryEntry) => {
    Alert.alert(
      '删除记忆',
      `确认删除 "${entry.key}" ?`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemorySlot(entry.key, entry.scope);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
            } catch (err: any) {
              Alert.alert('删除失败', err.message);
            }
          },
        },
      ],
    );
  }, []);

  const filtered = searchText
    ? entries.filter(e =>
        e.key.toLowerCase().includes(searchText.toLowerCase()) ||
        JSON.stringify(e.value).toLowerCase().includes(searchText.toLowerCase()),
      )
    : entries;

  const renderItem = ({ item }: { item: MemoryEntry }) => {
    const importance = item.metadata?.importance ?? 0.5;
    const tags = item.metadata?.tags || [];
    const valueStr = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);

    return (
      <TouchableOpacity
        style={styles.card}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.key} numberOfLines={1}>{item.key}</Text>
          <View style={[styles.importanceBadge, { opacity: 0.4 + importance * 0.6 }]}>
            <Text style={styles.importanceText}>{(importance * 100).toFixed(0)}%</Text>
          </View>
        </View>
        <Text style={styles.value} numberOfLines={3}>{valueStr}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.meta}>{item.type}</Text>
          {tags.map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          <Text style={styles.meta}>
            {new Date(item.updatedAt).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Scope tabs */}
      <View style={styles.scopeBar}>
        {SCOPES.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.scopeTab, activeScope === s.key && styles.scopeTabActive]}
            onPress={() => setActiveScope(s.key)}
          >
            <Text style={styles.scopeEmoji}>{s.emoji}</Text>
            <Text style={[styles.scopeLabel, activeScope === s.key && styles.scopeLabelActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索记忆..."
          placeholderTextColor="#888"
          value={searchText}
          onChangeText={setSearchText}
        />
        <Text style={styles.count}>{filtered.length} 条</Text>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchMemories} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无 {activeScope} 记忆</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scopeBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    gap: 4,
  },
  scopeTabActive: { backgroundColor: '#7c3aed' },
  scopeEmoji: { fontSize: 14 },
  scopeLabel: { color: '#999', fontSize: 12 },
  scopeLabelActive: { color: '#fff', fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  count: { color: '#888', fontSize: 12 },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  key: { color: '#a78bfa', fontSize: 14, fontWeight: '600', flex: 1 },
  importanceBadge: {
    backgroundColor: '#7c3aed',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  importanceText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  value: { color: '#ccc', fontSize: 13, lineHeight: 18, marginBottom: 6 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  meta: { color: '#666', fontSize: 11 },
  tag: {
    backgroundColor: '#2d1b69',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tagText: { color: '#a78bfa', fontSize: 10 },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#666', fontSize: 14 },
});
