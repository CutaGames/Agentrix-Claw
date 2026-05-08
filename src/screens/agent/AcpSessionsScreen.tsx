/**
 * ACP Sessions Screen — 移动端 ACP 会话管理
 * 列出活跃的 ACP Sessions，支持 pause/resume/kill 操作
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import {
  listAcpSessions,
  steerAcpSession,
  killAcpSession,
  type AcpSession,
  type AcpSessionStatus,
} from '../../services/acpBridge.api';

const STATUS_META: Record<AcpSessionStatus, { color: string; label: string }> = {
  active: { color: '#22c55e', label: '运行中' },
  paused: { color: '#f59e0b', label: '已暂停' },
  completed: { color: '#6b7280', label: '已完成' },
  error: { color: '#ef4444', label: '错误' },
  killed: { color: '#dc2626', label: '已终止' },
};

export default function AcpSessionsScreen() {
  const [sessions, setSessions] = useState<AcpSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAcpSessions();
      setSessions(data || []);
    } catch (err: any) {
      console.warn('ACP sessions fetch failed:', err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handlePause = useCallback(async (sessionId: string) => {
    try {
      await steerAcpSession(sessionId, { type: 'pause' });
      fetchSessions();
    } catch (err: any) {
      Alert.alert('暂停失败', err.message);
    }
  }, [fetchSessions]);

  const handleResume = useCallback(async (sessionId: string) => {
    try {
      await steerAcpSession(sessionId, { type: 'resume' });
      fetchSessions();
    } catch (err: any) {
      Alert.alert('恢复失败', err.message);
    }
  }, [fetchSessions]);

  const handleKill = useCallback((sessionId: string) => {
    Alert.alert('终止会话', '确认终止此 ACP 会话？', [
      { text: '取消', style: 'cancel' },
      {
        text: '终止',
        style: 'destructive',
        onPress: async () => {
          try {
            await killAcpSession(sessionId, '用户手动终止');
            fetchSessions();
          } catch (err: any) {
            Alert.alert('终止失败', err.message);
          }
        },
      },
    ]);
  }, [fetchSessions]);

  const renderItem = ({ item }: { item: AcpSession }) => {
    const meta = STATUS_META[item.status] || STATUS_META.active;
    const isActive = item.status === 'active';
    const isPaused = item.status === 'paused';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={styles.sessionId} numberOfLines={1}>{item.sessionId}</Text>
          <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>

        {item.agentId && (
          <Text style={styles.agentId}>Agent: {item.agentId}</Text>
        )}

        <Text style={styles.time}>
          最后活跃: {new Date(item.lastActivityAt).toLocaleString()}
        </Text>

        <View style={styles.actions}>
          {isActive && (
            <TouchableOpacity style={styles.btnPause} onPress={() => handlePause(item.sessionId)}>
              <Text style={styles.btnText}>⏸ 暂停</Text>
            </TouchableOpacity>
          )}
          {isPaused && (
            <TouchableOpacity style={styles.btnResume} onPress={() => handleResume(item.sessionId)}>
              <Text style={styles.btnText}>▶ 恢复</Text>
            </TouchableOpacity>
          )}
          {(isActive || isPaused) && (
            <TouchableOpacity style={styles.btnKill} onPress={() => handleKill(item.sessionId)}>
              <Text style={styles.btnText}>✕ 终止</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>ACP Sessions</Text>
        <Text style={styles.subtitle}>{sessions.length} 个会话</Text>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={item => item.sessionId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchSessions} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无 ACP 会话</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 2 },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sessionId: { flex: 1, color: '#ccc', fontSize: 13, fontFamily: 'monospace' },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  agentId: { color: '#888', fontSize: 12, marginBottom: 2 },
  time: { color: '#666', fontSize: 11, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  btnPause: {
    backgroundColor: '#78350f',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnResume: {
    backgroundColor: '#14532d',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnKill: {
    backgroundColor: '#7f1d1d',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: '#666', fontSize: 14 },
});
