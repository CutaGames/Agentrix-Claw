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
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

// ─── Types ────────────────────────────────────────────────────
interface KnowledgeFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  chunks: number;
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

// ─── Add Knowledge Modal ───────────────────────────────────────
function AddKnowledgeSheet({
  onSubmit,
  onClose,
  loading,
}: {
  onSubmit: (name: string, content: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const valid = name.trim().length > 0 && content.trim().length > 0;

  return (
    <View style={sheet.container}>
      <View style={sheet.header}>
        <Text style={sheet.title}>Add Knowledge</Text>
        <TouchableOpacity onPress={onClose}><Text style={sheet.close}>✕</Text></TouchableOpacity>
      </View>
      <Text style={sheet.label}>File name (e.g. product-docs.md)</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="knowledge-file.md"
        placeholderTextColor={colors.textMuted}
        style={sheet.input}
      />
      <Text style={sheet.label}>Content (Markdown / plain text)</Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={8}
        placeholder="Paste or type the knowledge content your agent should remember..."
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
          : <Text style={sheet.submitText}>Save to Memory</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
export function MemoryManagementScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['knowledge-files'],
    queryFn: fetchKnowledge,
    retry: 1,
  });

  const deleteMut = useMutation({
    mutationFn: deleteKnowledge,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge-files'] }),
    onError: (e: any) => Alert.alert('Error', e.message || 'Delete failed'),
  });

  const createMut = useMutation({
    mutationFn: ({ fileName, content }: { fileName: string; content: string }) =>
      createKnowledge(fileName, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-files'] });
      setShowAdd(false);
    },
    onError: (e: any) => Alert.alert('Error', e.message || 'Upload failed'),
  });

  const confirmDelete = (file: KnowledgeFile) => {
    Alert.alert('Delete Knowledge', `Remove "${file.fileName}" from memory?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(file.id) },
    ]);
  };

  const files = data ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🧠 Memory Hub</Text>
          <Text style={styles.headerSub}>
            {files.length} file{files.length !== 1 ? 's' : ''} · {files.reduce((a, f) => a + f.chunks, 0)} chunks indexed
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          🔍 Knowledge files are chunked and vectorised. Your agent searches them automatically during conversations.
        </Text>
      </View>

      {/* Add Sheet */}
      {showAdd && (
        <AddKnowledgeSheet
          onSubmit={(n, c) => createMut.mutate({ fileName: n, content: c })}
          onClose={() => setShowAdd(false)}
          loading={createMut.isPending}
        />
      )}

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading memory...</Text>
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🧠</Text>
          <Text style={styles.emptyTitle}>No knowledge files</Text>
          <Text style={styles.emptySub}>
            Add documents, FAQs, or context files. Your agent will reference them automatically.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.primaryBtnText}>Add First Knowledge File</Text>
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
                  {formatBytes(item.sizeBytes)} · {item.chunks} chunks · {timeAgo(item.createdAt)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteBtn}>
                {deleteMut.isPending && deleteMut.variables === item.id
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Text style={styles.deleteBtnText}>×</Text>
                }
              </TouchableOpacity>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          contentContainerStyle={{ paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 56 }} />}
        />
      )}
    </View>
  );
}

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
