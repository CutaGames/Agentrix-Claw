/**
 * TeamInviteScreen — Invite members to a workspace.
 * Backend: POST /api/workspaces/:id/members  |  DELETE /api/workspaces/:id/members/:userId
 *          GET  /api/workspaces/:id  (with members relation)
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
  Platform,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import type { AgentStackParamList } from '../../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceMember = {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: string;
  user?: { id: string; name: string; email: string; avatarUrl?: string };
};

type WorkspaceDetail = {
  id: string;
  name: string;
  members: WorkspaceMember[];
};

type Nav = NativeStackNavigationProp<AgentStackParamList, 'TeamInvite'>;
type Route = RouteProp<AgentStackParamList, 'TeamInvite'>;

const ROLE_ICON: Record<string, string> = {
  owner: '👑',
  admin: '🛡',
  editor: '✏️',
  viewer: '👁',
};

const ROLE_COLOR: Record<string, string> = {
  owner: '#f59e0b',
  admin: '#6366f1',
  editor: '#22c55e',
  viewer: colors.textMuted,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

const fetchWorkspace = (id: string) => apiFetch<WorkspaceDetail>(`/workspaces/${id}`);

const inviteMember = (workspaceId: string, body: { email: string; role: string }) =>
  apiFetch<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

const removeMember = (workspaceId: string, userId: string) =>
  apiFetch<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamInviteScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { workspaceId, workspaceName } = params;
  const qc = useQueryClient();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('editor');

  const { data: workspace, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; role: string }) => inviteMember(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      setEmail('');
      Alert.alert('Invited!', `Invitation sent to ${email}.`);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(workspaceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleInvite = () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    inviteMutation.mutate({ email: email.trim(), role });
  };

  const handleRemove = (member: WorkspaceMember) => {
    if (member.role === 'owner') {
      Alert.alert('Cannot Remove', 'The workspace owner cannot be removed.');
      return;
    }
    Alert.alert(
      'Remove Member',
      `Remove ${member.user?.name || member.userId} from this workspace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(member.userId) },
      ],
    );
  };

  const members = workspace?.members ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Invite Members</Text>
          <Text style={styles.subtitle}>{workspaceName}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {/* Invite form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite by Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="colleague@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Role</Text>
          <View style={styles.roleRow}>
            {(['admin', 'editor', 'viewer'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleChip, role === r && styles.roleChipActive]}
                onPress={() => setRole(r)}
              >
                <Text style={styles.roleChipIcon}>{ROLE_ICON[r]}</Text>
                <Text style={[styles.roleChipText, role === r && { color: ROLE_COLOR[r], fontWeight: '700' }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.roleDesc}>
            {role === 'admin'
              ? '🛡 Can manage members and settings'
              : role === 'editor'
              ? '✏️ Can view and edit agents, workflows'
              : '👁 Read-only access to workspace content'}
          </Text>

          <TouchableOpacity
            style={[styles.inviteBtn, (!email.trim() || inviteMutation.isPending) && styles.inviteBtnDisabled]}
            onPress={handleInvite}
            disabled={!email.trim() || inviteMutation.isPending}
          >
            {inviteMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.inviteBtnText}>Send Invitation</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Current members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Members ({members.length})
          </Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : members.length === 0 ? (
            <Text style={styles.emptyText}>No members yet.</Text>
          ) : (
            members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {(m.user?.name?.[0] ?? m.userId[0]).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.user?.name ?? m.userId}</Text>
                  <Text style={styles.memberEmail}>{m.user?.email ?? ''}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[m.role] + '25' }]}>
                  <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[m.role] }]}>
                    {ROLE_ICON[m.role]} {m.role}
                  </Text>
                </View>
                {m.role !== 'owner' && (
                  <TouchableOpacity
                    onPress={() => handleRemove(m)}
                    style={styles.removeBtn}
                    disabled={removeMutation.isPending}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
    gap: 12,
  },
  backBtn: {},
  backText: { color: colors.accent, fontSize: 16 },
  headerInfo: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted },
  content: { padding: 16, gap: 4, paddingBottom: 48 },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  input: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  roleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  roleChipActive: { borderColor: colors.accent },
  roleChipIcon: { fontSize: 14 },
  roleChipText: { fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize' },
  roleDesc: { fontSize: 12, color: colors.textMuted, marginBottom: 14 },
  inviteBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  memberEmail: { fontSize: 12, color: colors.textMuted },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  removeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#ef444415',
  },
  removeBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
});
