/**
 * TeamSpaceScreen — Team / Organization workspace management.
 * Backend: /api/workspaces (workspace module — fully implemented)
 *
 * Features:
 * - List own & joined workspaces
 * - Create new workspace
 * - View members per workspace
 * - Navigate to TeamInviteScreen
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import type { AgentStackParamList } from '../../navigation/types';
import { useI18n } from '../../stores/i18nStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceMember = {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  user?: { name: string; email: string; avatarUrl?: string };
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: 'personal' | 'team' | 'organization';
  plan: string;
  memberCount?: number;
  members?: WorkspaceMember[];
  createdAt: string;
  ownerId: string;
};

type Nav = NativeStackNavigationProp<AgentStackParamList, 'TeamSpace'>;

// ─── API helpers ──────────────────────────────────────────────────────────────

const fetchWorkspaces = () => apiFetch<Workspace[]>('/workspaces');

const createWorkspace = (body: { name: string; description?: string; type: string }) =>
  apiFetch<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(body) });

const deleteWorkspace = (id: string) =>
  apiFetch<void>(`/workspaces/${id}`, { method: 'DELETE' });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  personal: '👤',
  team: '👥',
  organization: '🏢',
};

const ROLE_COLOR: Record<string, string> = {
  owner: '#f59e0b',
  admin: '#6366f1',
  editor: '#22c55e',
  viewer: colors.textMuted,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamSpaceScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState<'personal' | 'team' | 'organization'>('team');

  const {
    data: workspaces = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces });

  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewType('team');
    },
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message),
  });

  const handleDelete = (ws: Workspace) => {
    Alert.alert(
      t({ en: 'Delete Workspace', zh: '删除工作区' }),
      t({ en: `Are you sure you want to delete "${ws.name}"? This cannot be undone.`, zh: `确定要删除“${ws.name}”吗？此操作无法撤销。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Delete', zh: '删除' }), style: 'destructive', onPress: () => deleteMutation.mutate(ws.id) },
      ],
    );
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      Alert.alert(t({ en: 'Name required', zh: '需要名称' }), t({ en: 'Please enter a workspace name.', zh: '请输入工作区名称。' }));
      return;
    }
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined, type: newType });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← {t({ en: 'Back', zh: '返回' })}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t({ en: 'Team Spaces', zh: '团队空间' })}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.addText}>+ {t({ en: 'New', zh: '新建' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          🏢 {t({ en: 'Share agent instances, skills, and tasks with your team members.', zh: '与团队成员共享智能体实例、技能和任务。' })}
        </Text>
      </View>

      {/* Workspace list */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
        ) : workspaces.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>{t({ en: 'No workspaces yet', zh: '还没有工作区' })}</Text>
            <Text style={styles.emptySubtitle}>{t({ en: 'Create a team space to collaborate with others.', zh: '创建一个团队空间，与他人协作。' })}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={styles.emptyBtnText}>{t({ en: 'Create Workspace', zh: '创建工作区' })}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          workspaces.map((ws) => (
            <View key={ws.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardIcon}>{TYPE_ICON[ws.type] ?? '👥'}</Text>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{ws.name}</Text>
                  <Text style={styles.cardSlug}>@{ws.slug}</Text>
                </View>
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeText}>{t({ en: ws.type, zh: ws.type === 'personal' ? '个人' : ws.type === 'team' ? '团队' : '组织' })}</Text>
                </View>
              </View>

              {ws.description ? (
                <Text style={styles.cardDesc}>{ws.description}</Text>
              ) : null}

              <View style={styles.cardMeta}>
                <Text style={styles.cardMetaText}>
                  👤 {t({ en: `${ws.memberCount ?? (ws.members?.length ?? 1)} member${(ws.memberCount ?? 1) !== 1 ? 's' : ''}`, zh: `${ws.memberCount ?? (ws.members?.length ?? 1)} 名成员` })}
                </Text>
                <Text style={styles.cardMetaText}>
                  {ws.plan === 'free' ? '🆓' : '⭐'} {ws.plan === 'free' ? t({ en: 'free', zh: '免费' }) : ws.plan}
                </Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() =>
                    navigation.navigate('TeamInvite', {
                      workspaceId: ws.id,
                      workspaceName: ws.name,
                    })
                  }
                >
                  <Text style={styles.actionBtnText}>👋 {t({ en: 'Invite', zh: '邀请' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={() => handleDelete(ws)}
                >
                  <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>🗑 {t({ en: 'Delete', zh: '删除' })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create workspace modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t({ en: 'New Workspace', zh: '新建工作区' })}</Text>

            <Text style={styles.fieldLabel}>{t({ en: 'Name *', zh: '名称 *' })}</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder={t({ en: 'My Team', zh: '我的团队' })}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <Text style={styles.fieldLabel}>{t({ en: 'Description', zh: '描述' })}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder={t({ en: 'What does this workspace do?', zh: '这个工作区是做什么的？' })}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>{t({ en: 'Type', zh: '类型' })}</Text>
            <View style={styles.typeRow}>
              {(['personal', 'team', 'organization'] as const).map((typeKey) => (
                <TouchableOpacity
                  key={typeKey}
                  style={[styles.typeChip, newType === typeKey && styles.typeChipActive]}
                  onPress={() => setNewType(typeKey)}
                >
                  <Text style={[styles.typeChipText, newType === typeKey && styles.typeChipTextActive]}>
                    {TYPE_ICON[typeKey]} {t({ en: typeKey, zh: typeKey === 'personal' ? '个人' : typeKey === 'team' ? '团队' : '组织' })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}
              >
                <Text style={styles.cancelBtnText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, !newName.trim() && styles.createBtnDisabled]}
                onPress={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>{t({ en: 'Create', zh: '创建' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { marginRight: 12 },
  backText: { color: colors.accent, fontSize: 16 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  infoBanner: {
    margin: 16,
    padding: 12,
    backgroundColor: colors.accent + '15',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  infoText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 12, paddingBottom: 32 },
  loader: { marginTop: 60 },
  emptyState: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardIcon: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardSlug: { fontSize: 12, color: colors.textMuted },
  cardBadge: {
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cardBadgeText: { fontSize: 11, color: colors.textSecondary, textTransform: 'capitalize' },
  cardDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: 8, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  cardMetaText: { fontSize: 12, color: colors.textMuted },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnDanger: { backgroundColor: '#ef444415' },
  actionBtnText: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
  },
  typeChipActive: { borderColor: colors.accent, backgroundColor: colors.accent + '20' },
  typeChipText: { fontSize: 12, color: colors.textSecondary },
  typeChipTextActive: { color: colors.accent, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600' },
  createBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: '#fff', fontWeight: '700' },
});
