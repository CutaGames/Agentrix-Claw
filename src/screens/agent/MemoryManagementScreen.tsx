/**
 * MemoryManagementScreen — Layer 1: Long-term Memory / RAG Hub
 * Lists, uploads, and deletes knowledge files in the ai-rag module.
 * Backend: GET/POST/DELETE /api/ai-rag/knowledge
 */
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, memoryApi } from '../../services/api';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

// ─── Types ────────────────────────────────────────────────────
interface KnowledgeFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  chunks: number;
  createdAt: string;
}

interface MemoryPreference {
  id: string;
  content: string;
  createdAt: string;
}

// ─── API helpers ──────────────────────────────────────────────
const fetchKnowledge = () => apiFetch<KnowledgeFile[]>('/ai-rag/knowledge');
const deleteKnowledge = (id: string) =>
  apiFetch<void>(`/ai-rag/knowledge/${id}`, { method: 'DELETE' });
const createKnowledge = (fileName: string, content: string) =>
  apiFetch<KnowledgeFile>('/ai-rag/knowledge', {
    method: 'POST',
    body: JSON.stringify({ fileName, content }),
  });

// ─── Helpers ──────────────────────────────────────────────────
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  return 'just now';
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tabsRow: { flexDirection: 'row', backgroundColor: colors.bgCard, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { paddingVertical: 12, marginRight: 24, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  infoBanner: {
    backgroundColor: '#7c3aed11', borderBottomWidth: 1, borderBottomColor: '#7c3aed22',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  infoBannerText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  fileIcon: { fontSize: 24 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 22, color: '#ef4444' },
});

const sheet = StyleSheet.create({
  container: {
    backgroundColor: colors.bgCard, margin: 16, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  close: { fontSize: 18, color: colors.textMuted, padding: 4 },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgSecondary, color: colors.textPrimary,
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 13,
  },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── Add Knowledge Modal ───────────────────────────────────────
function AddKnowledgeSheet({
  onSubmit,
  onClose,
  loading,
  isPref = false,
}: {
  onSubmit: (name: string, content: string) => void;
  onClose: () => void;
  loading: boolean;
  isPref?: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const valid = isPref ? content.trim().length > 0 : (name.trim().length > 0 && content.trim().length > 0);

  return (
    <View style={sheet.container}>
      <View style={sheet.header}>
        <Text style={sheet.title}>{isPref ? t({ en: 'Add Memory Preference', zh: '添加记忆偏好' }) : t({ en: 'Add Knowledge', zh: '添加知识' })}</Text>
        <TouchableOpacity onPress={onClose}><Text style={sheet.close}>✕</Text></TouchableOpacity>
      </View>
      {!isPref && (
        <>
          <Text style={sheet.label}>{t({ en: 'File name (e.g. product-docs.md)', zh: '文件名（例如 product-docs.md）' })}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="knowledge-file.md"
            placeholderTextColor={colors.textMuted}
            style={sheet.input}
          />
        </>
      )}
      <Text style={sheet.label}>{isPref ? t({ en: 'Preference Content', zh: '偏好内容' }) : t({ en: 'Content (Markdown / plain text)', zh: '内容（Markdown / 纯文本）' })}</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={8}
        placeholder={isPref ? t({ en: 'I always prefer code in TypeScript...', zh: '我总是更偏好 TypeScript 代码…' }) : t({ en: 'Paste or type the knowledge content your agent should remember...', zh: '粘贴或输入希望智能体记住的知识内容…' })}
        placeholderTextColor={colors.textMuted}
        style={[sheet.input, { height: 160, textAlignVertical: 'top' }]}
      />
      <TouchableOpacity
        style={[sheet.submitBtn, !valid && { opacity: 0.5 }]}
        onPress={() => valid && onSubmit(name.trim(), content.trim())}
        disabled={!valid || loading}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={sheet.submitText}>{t({ en: 'Save to Memory', zh: '保存到记忆' })}</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
export function MemoryManagementScreen() {
  const { t, language } = useI18n();
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<'knowledge' | 'preferences'>('knowledge');
  const queryClient = useQueryClient();

  const formatTimeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return language === 'zh' ? `${days} 天前` : `${days}d ago`;
    if (hrs > 0) return language === 'zh' ? `${hrs} 小时前` : `${hrs}h ago`;
    return t({ en: 'just now', zh: '刚刚' });
  };

  const { data: knowledgeFiles, isLoading: knowledgeLoading, refetch: refetchKnowledge, isRefetching: isRefetchingKnowledge } = useQuery({
    queryKey: ['knowledge-files'],
    queryFn: fetchKnowledge,
    retry: 1,
  });

  const { data: preferences, isLoading: prefsLoading, refetch: refetchPrefs, isRefetching: isRefetchingPrefs } = useQuery({
    queryKey: ['memory-preferences'],
    queryFn: memoryApi.getPreferences,
    retry: 1,
  });

  const deleteKnowledgeMut = useMutation({
    mutationFn: deleteKnowledge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-files'] }),
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message || t({ en: 'Delete failed', zh: '删除失败' })),
  });

  const createKnowledgeMut = useMutation({
    mutationFn: ({ fileName, content }: { fileName: string; content: string }) =>
      createKnowledge(fileName, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-files'] });
      setShowAdd(false);
    },
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message || t({ en: 'Upload failed', zh: '上传失败' })),
  });

  const deletePrefMut = useMutation({
    mutationFn: memoryApi.deletePreference,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memory-preferences'] }),
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message || t({ en: 'Delete failed', zh: '删除失败' })),
  });

  const createPrefMut = useMutation({
    mutationFn: (content: string) => memoryApi.addPreference(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-preferences'] });
      setShowAdd(false);
    },
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message || t({ en: 'Add preference failed', zh: '添加偏好失败' })),
  });

  const confirmDeleteKnowledge = (file: KnowledgeFile) => {
    Alert.alert(t({ en: 'Delete Knowledge', zh: '删除知识' }), t({ en: `Remove "${file.fileName}" from memory?`, zh: `要从记忆中移除“${file.fileName}”吗？` }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Delete', zh: '删除' }), style: 'destructive', onPress: () => deleteKnowledgeMut.mutate(file.id) },
    ]);
  };

  const confirmDeletePref = (pref: MemoryPreference) => {
    Alert.alert(t({ en: 'Delete Preference', zh: '删除偏好' }), t({ en: 'Remove this memory preference?', zh: '要移除此条记忆偏好吗？' }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Delete', zh: '删除' }), style: 'destructive', onPress: () => deletePrefMut.mutate(pref.id) },
    ]);
  };

  const files = knowledgeFiles ?? [];
  const prefs = preferences ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🧠 {t({ en: 'Memory Hub', zh: '记忆中心' })}</Text>
          <Text style={styles.headerSub}>
            {tab === 'knowledge'
              ? t({ en: `${files.length} files · ${files.reduce((a, f) => a + f.chunks, 0)} chunks indexed`, zh: `${files.length} 个文件 · 已索引 ${files.reduce((a, f) => a + f.chunks, 0)} 个分块` })
              : t({ en: `${prefs.length} memory preferences`, zh: `${prefs.length} 条记忆偏好` })}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ {t({ en: 'Add', zh: '添加' })}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'knowledge' && styles.tabBtnActive]} onPress={() => setTab('knowledge')}>
          <Text style={[styles.tabText, tab === 'knowledge' && styles.tabTextActive]}>{t({ en: 'Knowledge Base', zh: '知识库' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'preferences' && styles.tabBtnActive]} onPress={() => setTab('preferences')}>
          <Text style={[styles.tabText, tab === 'preferences' && styles.tabTextActive]}>{t({ en: 'Preferences', zh: '偏好' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          {tab === 'knowledge' 
            ? t({ en: '🔍 Knowledge files are chunked and vectorised. Your agent searches them automatically during conversations.', zh: '🔍 知识文件会被切分并向量化，智能体会在对话中自动检索它们。' })
            : t({ en: '💡 Memory preferences tell your agent how to behave and what to remember about you.', zh: '💡 记忆偏好会告诉智能体该如何行动，以及需要记住你的哪些信息。' })}
        </Text>
      </View>

      {/* Add Sheet */}
      {showAdd && tab === 'knowledge' && (
        <AddKnowledgeSheet
          onSubmit={(n, c) => createKnowledgeMut.mutate({ fileName: n, content: c })}
          onClose={() => setShowAdd(false)}
          loading={createKnowledgeMut.isPending}
        />
      )}
      
      {showAdd && tab === 'preferences' && (
        <AddKnowledgeSheet
          onSubmit={(_, c) => createPrefMut.mutate(c)}
          onClose={() => setShowAdd(false)}
          loading={createPrefMut.isPending}
          isPref={true}
        />
      )}

      {tab === 'knowledge' && (
        <>
          {knowledgeLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>{t({ en: 'Loading memory...', zh: '正在加载记忆…' })}</Text>
            </View>
          ) : files.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🧠</Text>
              <Text style={styles.emptyTitle}>{t({ en: 'No knowledge files', zh: '暂无知识文件' })}</Text>
              <Text style={styles.emptySub}>
                {t({ en: 'Add documents, FAQs, or context files. Your agent will reference them automatically.', zh: '添加文档、FAQ 或上下文文件后，智能体会自动引用它们。' })}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.primaryBtnText}>{t({ en: 'Add First Knowledge File', zh: '添加第一个知识文件' })}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={(f) => f.id}
              renderItem={({ item }) => (
                <View style={styles.fileRow}>
                  <Text style={styles.fileIcon}>📄</Text>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{item.fileName}</Text>
                    <Text style={styles.fileMeta}>
                      {formatBytes(item.sizeBytes)} · {t({ en: `${item.chunks} chunks`, zh: `${item.chunks} 个分块` })} · {formatTimeAgo(item.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => confirmDeleteKnowledge(item)} style={styles.deleteBtn}>
                    {deleteKnowledgeMut.isPending && deleteKnowledgeMut.variables === item.id
                      ? <ActivityIndicator size="small" color="#ef4444" />
                      : <Text style={styles.deleteBtnText}>×</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
              refreshControl={<RefreshControl refreshing={isRefetchingKnowledge} onRefresh={refetchKnowledge} tintColor={colors.accent} />}
              contentContainerStyle={{ paddingBottom: 32 }}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 56 }} />}
            />
          )}
        </>
      )}

      {tab === 'preferences' && (
        <>
          {prefsLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>{t({ en: 'Loading preferences...', zh: '正在加载偏好…' })}</Text>
            </View>
          ) : prefs.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>💭</Text>
              <Text style={styles.emptyTitle}>{t({ en: 'No preferences', zh: '暂无偏好' })}</Text>
              <Text style={styles.emptySub}>
                {t({ en: 'Add preferences for your agent to remember about you or your tasks.', zh: '添加偏好，让智能体记住关于你或任务的信息。' })}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAdd(true)}>
                <Text style={styles.primaryBtnText}>{t({ en: 'Add Preference', zh: '添加偏好' })}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={prefs}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View style={styles.fileRow}>
                  <Text style={styles.fileIcon}>💭</Text>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={3}>{item.content}</Text>
                    <Text style={styles.fileMeta}>{formatTimeAgo(item.createdAt)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => confirmDeletePref(item)} style={styles.deleteBtn}>
                    {deletePrefMut.isPending && deletePrefMut.variables === item.id
                      ? <ActivityIndicator size="small" color="#ef4444" />
                      : <Text style={styles.deleteBtnText}>×</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
              refreshControl={<RefreshControl refreshing={isRefetchingPrefs} onRefresh={refetchPrefs} tintColor={colors.accent} />}
              contentContainerStyle={{ paddingBottom: 32 }}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 56 }} />}
            />
          )}
        </>
      )}
    </View>
  );
}

