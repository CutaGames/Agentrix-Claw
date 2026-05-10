import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../stores/i18nStore';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

interface McpServer {
  id: string;
  name: string;
  description?: string;
  transport: 'stdio' | 'sse' | 'http';
  url?: string;
  command?: string;
  isActive: boolean;
  createdAt: string;
}

type ViewMode = 'servers' | 'add' | 'oauth';

export function McpManagerScreen() {
  const { t } = useI18n();
  const token = useAuthStore((s) => s.token);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('servers');

  // Add server form
  const [formName, setFormName] = useState('');
  const [formTransport, setFormTransport] = useState<'stdio' | 'sse' | 'http'>('stdio');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const apiBase = process.env.EXPO_PUBLIC_API_URL || 'https://agentrix.top';

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/mcp-servers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setServers(await res.json());
    } catch (err: any) {
      console.warn('MCP servers fetch failed:', err.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const addServer = async () => {
    if (!formName.trim() || !formEndpoint.trim()) return;
    setSubmitting(true);
    try {
      const body: any = {
        name: formName,
        description: formDesc,
        transport: formTransport,
      };
      if (formTransport === 'stdio') {
        body.command = formEndpoint;
      } else {
        body.url = formEndpoint;
      }
      const res = await fetch(`${apiBase}/mcp-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setViewMode('servers');
        setFormName('');
        setFormEndpoint('');
        setFormDesc('');
        await fetchServers();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setSubmitting(false);
  };

  const toggleServer = async (id: string) => {
    try {
      await fetch(`${apiBase}/mcp-servers/${id}/toggle`, {
        method: 'Post',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchServers();
    } catch {}
  };

  const deleteServer = (id: string) => {
    Alert.alert(
      t({ en: 'Delete Server', zh: '删除服务器' }),
      t({ en: 'Are you sure?', zh: '确定删除？' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Delete', zh: '删除' }),
          style: 'destructive',
          onPress: async () => {
            await fetch(`${apiBase}/mcp-servers/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            fetchServers();
          },
        },
      ],
    );
  };

  const TRANSPORT_EMOJI: Record<string, string> = { stdio: '⌨️', sse: '📡', http: '🌐' };

  const renderServer = ({ item }: { item: McpServer }) => (
    <View style={styles.serverCard}>
      <View style={styles.serverHeader}>
        <Text style={styles.serverName}>
          {TRANSPORT_EMOJI[item.transport]} {item.name}
        </Text>
        <TouchableOpacity
          style={[styles.statusBadge, item.isActive ? styles.statusActive : styles.statusInactive]}
          onPress={() => toggleServer(item.id)}>
          <Text style={styles.statusText}>
            {item.isActive ? t({ en: 'Active', zh: '启用' }) : t({ en: 'Off', zh: '关闭' })}
          </Text>
        </TouchableOpacity>
      </View>
      {item.description && (
        <Text style={styles.serverDesc}>{item.description}</Text>
      )}
      <View style={styles.serverMeta}>
        <Text style={styles.metaText}>{item.transport.toUpperCase()}</Text>
        <Text style={styles.metaText}>{item.url || item.command || '—'}</Text>
      </View>
      <TouchableOpacity onPress={() => deleteServer(item.id)}>
        <Text style={styles.deleteBtn}>🗑 {t({ en: 'Delete', zh: '删除' })}</Text>
      </TouchableOpacity>
    </View>
  );

  // Add server form view
  if (viewMode === 'add') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.formHeader}>
          <TouchableOpacity onPress={() => setViewMode('servers')}>
            <Text style={styles.backBtn}>← {t({ en: 'Back', zh: '返回' })}</Text>
          </TouchableOpacity>
          <Text style={styles.formTitle}>{t({ en: 'Add MCP Server', zh: '添加 MCP 服务器' })}</Text>
        </View>
        <ScrollView style={styles.formBody}>
          <Text style={styles.fieldLabel}>{t({ en: 'Name', zh: '名称' })}</Text>
          <TextInput
            style={styles.fieldInput}
            value={formName}
            onChangeText={setFormName}
            placeholder="github-mcp"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.fieldLabel}>{t({ en: 'Transport', zh: '传输方式' })}</Text>
          <View style={styles.transportRow}>
            {(['stdio', 'sse', 'http'] as const).map((tr) => (
              <TouchableOpacity
                key={tr}
                style={[styles.transportBtn, formTransport === tr && styles.transportBtnActive]}
                onPress={() => setFormTransport(tr)}>
                <Text style={styles.transportBtnText}>
                  {TRANSPORT_EMOJI[tr]} {tr.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>
            {formTransport === 'stdio'
              ? t({ en: 'Command', zh: '命令' })
              : t({ en: 'Endpoint URL', zh: '端点 URL' })}
          </Text>
          <TextInput
            style={styles.fieldInput}
            value={formEndpoint}
            onChangeText={setFormEndpoint}
            placeholder={formTransport === 'stdio' ? 'npx -y @modelcontextprotocol/server-github' : 'https://mcp.example.com/sse'}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.fieldLabel}>{t({ en: 'Description', zh: '描述' })}</Text>
          <TextInput
            style={styles.fieldInput}
            value={formDesc}
            onChangeText={setFormDesc}
            placeholder={t({ en: 'Optional description', zh: '可选描述' })}
            placeholderTextColor={colors.textMuted}
          />

          <TouchableOpacity style={styles.submitBtn} onPress={addServer} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>{t({ en: 'Register Server', zh: '注册服务器' })}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>
          {t({ en: 'MCP Servers', zh: 'MCP 服务器' })} ({servers.length})
        </Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setViewMode('add')}>
          <Text style={styles.addBtnText}>+ {t({ en: 'Add', zh: '添加' })}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={servers}
        keyExtractor={(item) => item.id}
        renderItem={renderServer}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServers} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {t({ en: 'No MCP servers registered. Add your first server!', zh: '暂无 MCP 服务器，添加第一个吧！' })}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolbarTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: 20, paddingTop: 8 },
  serverCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  serverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serverName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusActive: { backgroundColor: 'rgba(16,185,129,0.15)' },
  statusInactive: { backgroundColor: 'rgba(255,100,100,0.1)' },
  statusText: { fontSize: 11, fontWeight: '600', color: colors.success },
  serverDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  serverMeta: { flexDirection: 'row', gap: 12, marginTop: 6 },
  metaText: { color: colors.textMuted, fontSize: 11 },
  deleteBtn: { color: '#f87171', fontSize: 12, marginTop: 6 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  // Form styles
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { color: colors.accent, fontSize: 14 },
  formTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  formBody: { padding: 14 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 12, marginBottom: 4 },
  fieldInput: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transportRow: { flexDirection: 'row', gap: 8 },
  transportBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  transportBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(0,212,255,0.1)' },
  transportBtnText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
