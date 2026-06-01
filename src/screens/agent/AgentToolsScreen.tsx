import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, FlatList, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';

type ToolTab = 'terminal' | 'files' | 'system';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error';
  text: string;
}

interface SystemInfo {
  hostname?: string;
  platform?: string;
  arch?: string;
  uptime?: string;
  memory?: string;
  cpu?: string;
  agentVersion?: string;
}

export function AgentToolsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useI18n();
  const { token, user, activeInstance } = useAuthStore();
  const instanceId = route.params?.instanceId || activeInstance?.id || user?.activeInstanceId;

  const [tab, setTab] = useState<ToolTab>('terminal');

  return (
    <View style={styles.container}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'terminal' as const, icon: '⌨️', label: t({ en: 'Terminal', zh: '终端' }) },
          { key: 'files' as const, icon: '📁', label: t({ en: 'Files', zh: '文件' }) },
          { key: 'system' as const, icon: 'ℹ️', label: t({ en: 'System', zh: '系统' }) },
        ]).map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tabItem, tab === item.key && styles.tabItemActive]}
            onPress={() => setTab(item.key)}
          >
            <Text style={styles.tabIcon}>{item.icon}</Text>
            <Text style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'terminal' && (
        <TerminalTab instanceId={instanceId} token={token} />
      )}
      {tab === 'files' && (
        <FileBrowserTab instanceId={instanceId} token={token} />
      )}
      {tab === 'system' && (
        <SystemInfoTab instanceId={instanceId} token={token} />
      )}
    </View>
  );
}

// ─── Terminal Tab ────────────────────────────────────────────────────
function TerminalTab({ instanceId, token }: { instanceId: string | null; token: string | null }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: '0', type: 'output', text: t({ en: '# Connected to agent terminal', zh: '# 已连接到智能体终端' }) },
    { id: '1', type: 'output', text: t({ en: '# Type a command and press send', zh: '# 输入命令后按发送' }) },
  ]);
  const [cmd, setCmd] = useState('');
  const [running, setRunning] = useState(false);
  const listRef = React.useRef<FlatList>(null);

  const runCommand = useCallback(async () => {
    const trimmed = cmd.trim();
    if (!trimmed || running) return;

    const inputLine: TerminalLine = { id: `in-${Date.now()}`, type: 'input', text: `$ ${trimmed}` };
    setLines(prev => [...prev, inputLine]);
    setCmd('');
    setRunning(true);

    try {
      const res = await apiFetch<{ output?: string; error?: string; exitCode?: number }>(
        `/openclaw/proxy/${instanceId}/exec`,
        {
          method: 'POST',
          body: JSON.stringify({ command: trimmed }),
        }
      );

      const output = res.output || res.error || '(no output)';
      const outputLine: TerminalLine = {
        id: `out-${Date.now()}`,
        type: res.error ? 'error' : 'output',
        text: output,
      };
      setLines(prev => [...prev, outputLine]);
    } catch (err: any) {
      setLines(prev => [...prev, {
        id: `err-${Date.now()}`,
        type: 'error',
        text: err.message || 'Command execution failed',
      }]);
    }
    setRunning(false);
    setTimeout(() => listRef.current?.scrollToEnd(), 100);
  }, [cmd, running, instanceId]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={lines}
        keyExtractor={item => item.id}
        style={styles.terminalOutput}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <Text style={[
            styles.termLine,
            item.type === 'input' && styles.termInput,
            item.type === 'error' && styles.termError,
          ]}>
            {item.text}
          </Text>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd()}
      />
      <View style={styles.termInputBar}>
        <TextInput
          style={styles.termTextInput}
          value={cmd}
          onChangeText={setCmd}
          placeholder={t({ en: 'Enter command...', zh: '输入命令…' })}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={runCommand}
        />
        <TouchableOpacity
          style={[styles.sendBtn, running && { opacity: 0.5 }]}
          onPress={runCommand}
          disabled={running}
        >
          {running ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>▶</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── File Browser Tab ────────────────────────────────────────────────
function FileBrowserTab({ instanceId, token }: { instanceId: string | null; token: string | null }) {
  const { t } = useI18n();
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ entries: FileEntry[]; path: string }>(
        `/openclaw/proxy/${instanceId}/files?path=${encodeURIComponent(path)}`,
      );
      setEntries(res.entries || []);
      setCurrentPath(res.path || path);
    } catch (err: any) {
      setError(err.message || 'Failed to load directory');
      setEntries([]);
    }
    setLoading(false);
  }, [instanceId]);

  useEffect(() => {
    loadDir('/');
  }, [loadDir]);

  const navigateTo = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      const newPath = currentPath === '/'
        ? `/${entry.name}`
        : `${currentPath}/${entry.name}`;
      loadDir(newPath);
    } else {
      Alert.alert(entry.name, `${t({ en: 'Size', zh: '大小' })}: ${formatSize(entry.size)}`);
    }
  };

  const goUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDir(parent);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Breadcrumb */}
      <View style={styles.breadcrumb}>
        <TouchableOpacity onPress={() => loadDir('/')} style={styles.breadcrumbItem}>
          <Text style={styles.breadcrumbText}>🏠</Text>
        </TouchableOpacity>
        {currentPath !== '/' && (
          <>
            <Text style={styles.breadcrumbSep}>/</Text>
            <Text style={styles.breadcrumbCurrent} numberOfLines={1}>{currentPath}</Text>
          </>
        )}
        {currentPath !== '/' && (
          <TouchableOpacity onPress={goUp} style={styles.upBtn}>
            <Text style={styles.upBtnText}>⬆ {t({ en: 'Up', zh: '上级' })}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadDir(currentPath)} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t({ en: 'Retry', zh: '重试' })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.name}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.fileRow} onPress={() => navigateTo(item)}>
              <Text style={styles.fileIcon}>
                {item.type === 'directory' ? '📁' : getFileIcon(item.name)}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                {item.type === 'file' && (
                  <Text style={styles.fileMeta}>{formatSize(item.size)}</Text>
                )}
              </View>
              {item.type === 'directory' && <Text style={styles.fileArrow}>›</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t({ en: 'Empty directory', zh: '空目录' })}</Text>
          }
        />
      )}
    </View>
  );
}

// ─── System Info Tab ─────────────────────────────────────────────────
function SystemInfoTab({ instanceId, token }: { instanceId: string | null; token: string | null }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<SystemInfo>(
          `/openclaw/proxy/${instanceId}/system-info`,
        );
        setInfo(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load system info');
      }
      setLoading(false);
    })();
  }, [instanceId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const rows = [
    { label: t({ en: 'Hostname', zh: '主机名' }), value: info?.hostname || '—' },
    { label: t({ en: 'Platform', zh: '平台' }), value: info?.platform || '—' },
    { label: t({ en: 'Architecture', zh: '架构' }), value: info?.arch || '—' },
    { label: t({ en: 'Uptime', zh: '运行时间' }), value: info?.uptime || '—' },
    { label: t({ en: 'Memory', zh: '内存' }), value: info?.memory || '—' },
    { label: t({ en: 'CPU', zh: 'CPU' }), value: info?.cpu || '—' },
    { label: t({ en: 'Agent Version', zh: '智能体版本' }), value: info?.agentVersion || '—' },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      {rows.map((row) => (
        <View key={row.label} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{row.label}</Text>
          <Text style={styles.infoValue}>{row.value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    ts: '📘', tsx: '📘', js: '📒', jsx: '📒', py: '🐍',
    json: '📋', md: '📝', txt: '📄', log: '📜',
    png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️',
    sh: '🔧', yml: '⚙️', yaml: '⚙️', env: '🔒',
    zip: '📦', tar: '📦', gz: '📦',
  };
  return iconMap[ext || ''] || '📄';
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabIcon: { fontSize: 16 },
  tabLabel: { fontSize: 13, color: colors.textSecondary },
  tabLabelActive: { color: colors.accent, fontWeight: '600' },

  // Terminal
  terminalOutput: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  termLine: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#c9d1d9',
    lineHeight: 18,
    marginBottom: 2,
  },
  termInput: { color: '#58a6ff' },
  termError: { color: '#f85149' },
  termInputBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 8,
    gap: 8,
  },
  termTextInput: {
    flex: 1,
    backgroundColor: '#0d1117',
    color: '#c9d1d9',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // File Browser
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 6,
  },
  breadcrumbItem: {},
  breadcrumbText: { fontSize: 16 },
  breadcrumbSep: { color: colors.textTertiary, fontSize: 13 },
  breadcrumbCurrent: { color: colors.textPrimary, fontSize: 13, flex: 1 },
  upBtn: {
    backgroundColor: colors.accent + '22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  upBtnText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  fileIcon: { fontSize: 20 },
  fileName: { color: colors.textPrimary, fontSize: 14 },
  fileMeta: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  fileArrow: { color: colors.textTertiary, fontSize: 18 },
  emptyText: { color: colors.textTertiary, textAlign: 'center', marginTop: 40, fontSize: 14 },

  // System Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textSecondary, fontSize: 14 },
  infoValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '500' },

  // Shared
  errorText: { color: '#f85149', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    backgroundColor: colors.accent + '22',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: { color: colors.accent, fontWeight: '600' },
});
