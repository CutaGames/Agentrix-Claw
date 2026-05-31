import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { getMyInstances, batchCleanupInstances } from '../services/openclaw.service';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../components/Card';

interface Agent {
  id: string;         // openclaw instance id
  instanceId: string;
  name: string;
  description: string;
  avatar?: string;
  category: string;
  status: 'active' | 'idle' | 'offline' | 'error';
  lastActiveAt?: string;
  deployType?: string;
  version?: string;
}

export default function MyAgentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const persistedInstances = useAuthStore((s) => s.user?.openClawInstances ?? []);
  const userId = useAuthStore((s) => s.user?.id);
  const setActiveInstance = useAuthStore((s) => s.setActiveInstance);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mapInstance = (inst: any): Agent => ({
    id: inst.id,
    instanceId: inst.id,
    name: inst.name || 'My Agent',
    description: inst.instanceUrl
      ? `${inst.deployType ?? 'custom'} · ${inst.instanceUrl}`
      : (inst.deployType === 'cloud' ? 'Cloud-hosted OpenClaw agent' : 'OpenClaw Agent'),
    category: inst.deployType === 'cloud' ? 'cloud' : 'custom',
    status: inst.status === 'active' ? 'active' : inst.status === 'error' ? 'error' : inst.status === 'disconnected' ? 'offline' : 'idle',
    lastActiveAt: inst.lastSyncAt,
    deployType: inst.deployType,
    version: inst.version,
  });

  const fetchAgents = async () => {
    try {
      const result = await getMyInstances();
      if (result && result.length > 0) {
        setAgents(result.map(mapInstance));
        // Persist instances back to auth store so they survive logout/login
        const { updateUser, activeInstance: currentActive } = useAuthStore.getState();
        const storeInstances = result.map((inst: any) => ({
          id: inst.id,
          name: inst.name || 'My Agent',
          instanceUrl: inst.instanceUrl || '',
          status: inst.status as 'active' | 'disconnected' | 'error',
          deployType: inst.deployType || 'custom',
          version: inst.version,
          lastSyncAt: inst.lastSyncAt,
          metadata: inst.metadata,
        }));
        updateUser({ openClawInstances: storeInstances });
        if (!currentActive) {
          useAuthStore.setState({ activeInstance: storeInstances[0] ?? null });
        }
      } else if (persistedInstances.length > 0) {
        // Use persisted instances from auth store if server returns empty
        setAgents(persistedInstances.map(mapInstance));
      } else {
        setAgents([]);
      }
    } catch {
      // Fall back to persisted instances
      if (persistedInstances.length > 0) {
        setAgents(persistedInstances.map(mapInstance));
      } else {
        setAgents([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [userId]);   // re-fetch when user changes (login/logout/switch account)

  const onRefresh = () => {
    setRefreshing(true);
    fetchAgents();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return colors.success;
      case 'error':
        return colors.error ?? '#FF4444';
      case 'idle':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '运行中';
      case 'error':
        return '错误';
      case 'idle':
        return '空闲';
      default:
        return '离线';
    }
  };

  const handleCleanupErrors = () => {
    const errorCount = agents.filter(a => a.status === 'error').length;
    if (errorCount === 0) return;
    Alert.alert(
      '清理错误实例',
      `确认删除 ${errorCount} 个错误状态的 Agent 实例？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await batchCleanupInstances('error');
              Alert.alert('完成', `已删除 ${result.deleted} 个错误实例`);
              fetchAgents();
            } catch (err) {
              Alert.alert('失败', '清理失败，请稍后重试');
            }
          },
        },
      ],
    );
  };

  const getCategoryIcon = (category: string, deployType?: string) => {
    if (deployType === 'cloud') return '☁️';
    if (deployType === 'local') return '🖥️';
    if (deployType === 'server') return '🖧';
    switch (category) {
      case 'cloud': return '☁️';
      case 'custom': return '⚙️';
      default: return '🤖';
    }
  };

  const renderAgent = ({ item }: { item: Agent }) => (
    <TouchableOpacity
      style={styles.agentCard}
      onPress={() => {
        setActiveInstance(item.instanceId);
        navigation.navigate('AgentChat', {
          instanceId: item.instanceId,
          instanceName: item.name,
        });
      }}
    >
      <View style={styles.agentIcon}>
        <Text style={styles.agentIconText}>{getCategoryIcon(item.category, item.deployType)}</Text>
      </View>
      <View style={styles.agentInfo}>
        <View style={styles.agentHeader}>
          <Text style={styles.agentName}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.agentDescription} numberOfLines={2}>
          {item.description}
        </Text>
        {item.lastActiveAt && (
          <Text style={styles.lastActive}>
            最后活动: {new Date(item.lastActiveAt).toLocaleString()}
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={agents}
        renderItem={renderAgent}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>我的 Agent</Text>
            <View style={styles.summaryStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{agents.length}</Text>
                <Text style={styles.statLabel}>总数</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {agents.filter(a => a.status === 'active').length}
                </Text>
                <Text style={styles.statLabel}>运行中</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.warning }]}>
                  {agents.filter(a => a.status === 'idle').length}
                </Text>
                <Text style={styles.statLabel}>空闲</Text>
              </View>
              {agents.filter(a => a.status === 'error').length > 0 && (
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.error ?? '#FF4444' }]}>
                    {agents.filter(a => a.status === 'error').length}
                  </Text>
                  <Text style={styles.statLabel}>错误</Text>
                </View>
              )}
            </View>
            {agents.filter(a => a.status === 'error').length > 0 && (
              <TouchableOpacity style={styles.cleanupButton} onPress={handleCleanupErrors}>
                <Text style={styles.cleanupButtonText}>🗑️ 清理错误实例</Text>
              </TouchableOpacity>
            )}
          </Card>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>还没有 Agent</Text>
            <Text style={styles.emptyText}>
              绑定或部署一个 OpenClaw 实例，开始使用 AI Agent
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('AgentOnboarding')}
            >
              <Text style={styles.createButtonText}>绑定 / 新建 Agent</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  summaryCard: {
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  agentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  agentIconText: {
    fontSize: 24,
  },
  agentInfo: {
    flex: 1,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  agentDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  lastActive: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: 20,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  cleanupButton: {
    marginTop: 12,
    backgroundColor: (colors.error ?? '#FF4444') + '15',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: (colors.error ?? '#FF4444') + '40',
  },
  cleanupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error ?? '#FF4444',
  },
});
