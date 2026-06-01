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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../stores/i18nStore';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  outgoingLinks: string[];
  tags: string[];
  viewCount: number;
  updatedAt: string;
}

interface GraphNode {
  slug: string;
  title: string;
  linksTo: string[];
  linkedFrom: string[];
  tags: string[];
}

type ViewMode = 'list' | 'editor' | 'graph';

export function MemoryWikiScreen() {
  const { t } = useI18n();
  const token = useAuthStore((s) => s.token);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [graph, setGraph] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchText, setSearchText] = useState('');

  // Editor state
  const [editingPage, setEditingPage] = useState<WikiPage | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorTags, setEditorTags] = useState('');
  const [saving, setSaving] = useState(false);

  const apiBase = process.env.EXPO_PUBLIC_API_URL || 'https://agentrix.top';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const params = searchText ? `?search=${encodeURIComponent(searchText)}` : '';
      const res = await fetch(`${apiBase}/memory-wiki/pages${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPages(await res.json());
    } catch (err: any) {
      console.warn('Wiki fetch failed:', err.message);
    }
    setLoading(false);
  }, [token, searchText]);

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/memory-wiki/graph`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setGraph(await res.json());
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    if (viewMode === 'graph') fetchGraph();
  }, [viewMode, fetchGraph]);

  const openEditor = (page?: WikiPage) => {
    setEditingPage(page ?? null);
    setEditorTitle(page?.title ?? '');
    setEditorContent(page?.content ?? '');
    setEditorTags(page?.tags?.join(', ') ?? '');
    setViewMode('editor');
  };

  const savePage = async () => {
    if (!editorTitle.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: editorTitle,
        content: editorContent,
        tags: editorTags.split(',').map((t) => t.trim()).filter(Boolean),
      };

      if (editingPage) {
        await fetch(`${apiBase}/memory-wiki/pages/${editingPage.slug}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        });
      } else {
        await fetch(`${apiBase}/memory-wiki/pages`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      }
      setViewMode('list');
      await fetchPages();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setSaving(false);
  };

  const deletePage = (slug: string) => {
    Alert.alert(
      t({ en: 'Delete Page', zh: '删除页面' }),
      t({ en: 'Are you sure?', zh: '确定删除？' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Delete', zh: '删除' }),
          style: 'destructive',
          onPress: async () => {
            await fetch(`${apiBase}/memory-wiki/pages/${slug}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            fetchPages();
          },
        },
      ],
    );
  };

  const renderWikilinkHighlight = (content: string) => {
    const parts = content.split(/(\[\[[^\]]+\]\])/g);
    return (
      <Text style={styles.pageContent} numberOfLines={3}>
        {parts.map((part, i) =>
          part.startsWith('[[') ? (
            <Text key={i} style={styles.wikilink}>{part}</Text>
          ) : (
            <Text key={i}>{part}</Text>
          ),
        )}
      </Text>
    );
  };

  const renderPage = ({ item }: { item: WikiPage }) => (
    <TouchableOpacity style={styles.pageCard} onPress={() => openEditor(item)} onLongPress={() => deletePage(item.slug)}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>📄 {item.title}</Text>
        <Text style={styles.pageViews}>👁 {item.viewCount}</Text>
      </View>
      {renderWikilinkHighlight(item.content)}
      {item.outgoingLinks.length > 0 && (
        <View style={styles.linksRow}>
          {item.outgoingLinks.slice(0, 4).map((link, i) => (
            <View key={i} style={styles.linkBadge}>
              <Text style={styles.linkText}>🔗 {link}</Text>
            </View>
          ))}
        </View>
      )}
      {item.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {item.tags.map((tag, i) => (
            <Text key={i} style={styles.tag}>#{tag}</Text>
          ))}
        </View>
      )}
      <Text style={styles.pageTime}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
    </TouchableOpacity>
  );

  const renderGraphNode = ({ item }: { item: GraphNode }) => (
    <View style={styles.graphNode}>
      <Text style={styles.graphNodeTitle}>📄 {item.title}</Text>
      <View style={styles.graphLinks}>
        <Text style={styles.graphLinkLabel}>
          → {item.linksTo.length} | ← {item.linkedFrom.length}
        </Text>
      </View>
    </View>
  );

  // Editor view
  if (viewMode === 'editor') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={() => setViewMode('list')}>
              <Text style={styles.editorBack}>← {t({ en: 'Back', zh: '返回' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={savePage} disabled={saving}>
              <Text style={styles.saveBtnText}>
                {saving ? '...' : t({ en: 'Save', zh: '保存' })}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.editorBody}>
            <TextInput
              style={styles.editorTitleInput}
              value={editorTitle}
              onChangeText={setEditorTitle}
              placeholder={t({ en: 'Page title...', zh: '页面标题...' })}
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.editorContentInput}
              value={editorContent}
              onChangeText={setEditorContent}
              placeholder={t({ en: 'Write with [[wikilinks]]...', zh: '用 [[维基链接]] 写作...' })}
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <TextInput
              style={styles.editorTagsInput}
              value={editorTags}
              onChangeText={setEditorTags}
              placeholder={t({ en: 'Tags (comma separated)', zh: '标签（逗号分隔）' })}
              placeholderTextColor={colors.textMuted}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Mode tabs */}
      <View style={styles.modeBar}>
        {(['list', 'graph'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeTab, viewMode === mode && styles.modeTabActive]}
            onPress={() => setViewMode(mode)}>
            <Text style={styles.modeLabel}>
              {mode === 'list' ? `📝 ${t({ en: 'Pages', zh: '页面' })}` : `🕸 ${t({ en: 'Graph', zh: '图谱' })}`}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.newBtn} onPress={() => openEditor()}>
          <Text style={styles.newBtnText}>+ {t({ en: 'New', zh: '新建' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      {viewMode === 'list' && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t({ en: 'Search pages...', zh: '搜索页面...' })}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={fetchPages}
          />
        </View>
      )}

      {/* Content */}
      {viewMode === 'list' ? (
        <FlatList
          data={pages}
          keyExtractor={(item) => item.id}
          renderItem={renderPage}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPages} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {t({ en: 'No wiki pages yet. Create your first page!', zh: '暂无维基页面，创建第一个吧！' })}
            </Text>
          }
        />
      ) : (
        <FlatList
          data={graph}
          keyExtractor={(item) => item.slug}
          renderItem={renderGraphNode}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {t({ en: 'No graph data', zh: '暂无图谱数据' })}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  modeBar: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, paddingVertical: 8, alignItems: 'center' },
  modeTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.bgCard },
  modeTabActive: { backgroundColor: 'rgba(0,212,255,0.12)', borderWidth: 1, borderColor: colors.accent },
  modeLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  newBtn: { marginLeft: 'auto', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  searchRow: { paddingHorizontal: 12, paddingBottom: 6 },
  searchInput: {
    backgroundColor: colors.input,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  pageCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  pageTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pageViews: { color: colors.textMuted, fontSize: 11 },
  pageContent: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  wikilink: { color: colors.accent, fontWeight: '600' },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  linkBadge: { backgroundColor: 'rgba(0,212,255,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  linkText: { color: colors.accent, fontSize: 10 },
  tagsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  tag: { color: colors.textMuted, fontSize: 11 },
  pageTime: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
  graphNode: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  graphNodeTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  graphLinks: {},
  graphLinkLabel: { color: colors.accent, fontSize: 12 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  // Editor styles
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editorBack: { color: colors.accent, fontSize: 14 },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  editorBody: { flex: 1, padding: 14 },
  editorTitleInput: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 12,
  },
  editorContentInput: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 200,
    backgroundColor: colors.input,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  editorTagsInput: {
    color: colors.text,
    fontSize: 13,
    backgroundColor: colors.input,
    borderRadius: 8,
    padding: 10,
  },
});
