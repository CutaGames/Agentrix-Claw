/**
 * PetTeamScreen — Phase 6 M2 · Lv5+ multi-pet team UI.
 *
 * 后端契约：
 *   GET    /v1/pet/team/roles
 *   GET    /v1/pet/team/:parentLivingPetId
 *   POST   /v1/pet/team/:parentLivingPetId/members
 *   PUT    /v1/pet/team/:parentLivingPetId/members/:memberId/pause
 *   PUT    /v1/pet/team/:parentLivingPetId/members/:memberId/resume
 *   DELETE /v1/pet/team/:parentLivingPetId/members/:memberId
 *
 * Gating: only displayed when 主宠 intimacy_level >= 5（在 PetHubScreen tile 上做引导即可，
 * 此屏不强阻塞——后端 grant 会做 ownership 校验）。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import {
  getPetState,
  listTeamRoles,
  listTeamMembers,
  grantTeamMember,
  pauseTeamMember,
  resumeTeamMember,
  revokeTeamMember,
  type PetTeamMemberDto,
  type PetTeamRole,
} from '../../services/mobilePetSdk';
import { themedStyles } from '../../theme/useTheme';

const ROLE_LABELS: Record<PetTeamRole, { emoji: string; cn: string; desc: string }> = {
  finance:    { emoji: '💰', cn: '财务管家',  desc: '预算 / 报销 / 复盘' },
  concierge:  { emoji: '🎩', cn: '生活管家',  desc: '日程 / 提醒 / 订票' },
  researcher: { emoji: '🔬', cn: '研究员',    desc: '资料调研 / 总结' },
  creative:   { emoji: '🎨', cn: '创意助理',  desc: '文案 / 配图 / 视频' },
  guardian:   { emoji: '🛡', cn: '守护者',    desc: '审批 / 风控 / 监控' },
  tutor:      { emoji: '📚', cn: '导师',      desc: '学习计划 / 进度跟踪' },
};

export function PetTeamScreen() {
  const [parentPetId, setParentPetId] = useState<string | null>(null);
  const [intimacy, setIntimacy] = useState<number>(0);
  const [members, setMembers] = useState<PetTeamMemberDto[]>([]);
  const [roles, setRoles] = useState<PetTeamRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draftRole, setDraftRole] = useState<PetTeamRole>('concierge');
  const [draftMemberUserId, setDraftMemberUserId] = useState('');
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [draftBudget, setDraftBudget] = useState('5');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const state = await getPetState();
      setParentPetId(state.pet_id);
      setIntimacy(state.intimacy_level ?? 0);
      const [list, r] = await Promise.all([
        listTeamMembers(state.pet_id),
        listTeamRoles().catch(() => Object.keys(ROLE_LABELS) as PetTeamRole[]),
      ]);
      setMembers(list);
      setRoles(r.length ? r : (Object.keys(ROLE_LABELS) as PetTeamRole[]));
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const locked = intimacy < 5;

  const onAdd = async () => {
    if (!parentPetId) return;
    if (!draftMemberUserId.trim() || !draftDisplayName.trim()) {
      Alert.alert('请填写完整', '成员 user id 与显示名都不能为空');
      return;
    }
    const budget = Number(draftBudget) || 0;
    setBusyId('__add__');
    try {
      await grantTeamMember(parentPetId, {
        member_user_id: draftMemberUserId.trim(),
        display_name: draftDisplayName.trim(),
        role: draftRole,
        daily_budget_usd: budget,
      });
      setDraftMemberUserId('');
      setDraftDisplayName('');
      setShowAdd(false);
      await refresh();
    } catch (e: any) {
      Alert.alert('授权失败', e?.message || '请重试');
    } finally {
      setBusyId(null);
    }
  };

  const onPauseToggle = async (m: PetTeamMemberDto) => {
    if (!parentPetId) return;
    setBusyId(m.id);
    try {
      if (m.status === 'active') {
        await pauseTeamMember(parentPetId, m.id);
      } else {
        await resumeTeamMember(parentPetId, m.id);
      }
      await refresh();
    } catch (e: any) {
      Alert.alert('操作失败', e?.message || '请重试');
    } finally {
      setBusyId(null);
    }
  };

  const onRevoke = (m: PetTeamMemberDto) => {
    if (!parentPetId) return;
    Alert.alert('撤销成员', `确定要撤销 ${m.display_name} 的全部权限吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '撤销',
        style: 'destructive',
        onPress: async () => {
          setBusyId(m.id);
          try {
            await revokeTeamMember(parentPetId, m.id);
            await refresh();
          } catch (e: any) {
            Alert.alert('失败', e?.message || '请重试');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const totalActive = useMemo(
    () => members.filter((m) => m.status === 'active').length,
    [members],
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>萌宠团队</Text>
        <Text style={styles.subtitle}>
          Lv.{intimacy} · 已激活 {totalActive}/{members.length} 名成员
        </Text>
      </View>

      {locked && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockTitle}>🔒 Lv.5 解锁</Text>
          <Text style={styles.lockDesc}>
            提升主宠亲密度到 Lv.5 后可创建多宠团队，让不同角色为你分担任务。
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => setShowAdd((v) => !v)}
          disabled={locked || !parentPetId}
          style={({ pressed }) => [
            styles.primaryBtn,
            (locked || !parentPetId) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryBtnText}>{showAdd ? '收起' : '+ 添加成员'}</Text>
        </Pressable>
      </View>

      {showAdd && (
        <View style={styles.addCard}>
          <Text style={styles.formLabel}>角色</Text>
          <View style={styles.roleChips}>
            {roles.map((r) => {
              const meta = ROLE_LABELS[r] ?? { emoji: '🐾', cn: r, desc: '' };
              const active = draftRole === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setDraftRole(r)}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                >
                  <Text style={styles.roleChipText}>
                    {meta.emoji} {meta.cn}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.formLabel}>成员 user id</Text>
          <TextInput
            value={draftMemberUserId}
            onChangeText={setDraftMemberUserId}
            placeholder="uuid 或邀请码"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Text style={styles.formLabel}>显示名</Text>
          <TextInput
            value={draftDisplayName}
            onChangeText={setDraftDisplayName}
            placeholder="比如：财务小猪"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.formLabel}>每日预算（USD）</Text>
          <TextInput
            value={draftBudget}
            onChangeText={setDraftBudget}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={onAdd}
            disabled={busyId === '__add__'}
            style={({ pressed }) => [
              styles.primaryBtn,
              { marginTop: 12 },
              busyId === '__add__' && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {busyId === '__add__' ? '授权中…' : '✨ 创建成员'}
            </Text>
          </Pressable>
        </View>
      )}

      {members.length === 0 && !locked && (
        <Text style={styles.emptyHint}>
          还没有团队成员。点击上方「+ 添加成员」邀请第二只宠物加入团队。
        </Text>
      )}

      {members.map((m) => {
        const meta = ROLE_LABELS[m.role] ?? { emoji: '🐾', cn: m.role, desc: '' };
        return (
          <View key={m.id} style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <Text style={styles.memberEmoji}>{meta.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.display_name}</Text>
                <Text style={styles.memberRole}>
                  {meta.cn} · 预算 ${m.daily_budget_usd}/日
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  m.status === 'active'
                    ? styles.statusActive
                    : m.status === 'paused'
                    ? styles.statusPaused
                    : styles.statusRevoked,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {m.status === 'active' ? '在岗' : m.status === 'paused' ? '已暂停' : '已撤销'}
                </Text>
              </View>
            </View>
            {m.status !== 'revoked' && (
              <View style={styles.memberActions}>
                <Pressable
                  onPress={() => onPauseToggle(m)}
                  disabled={busyId === m.id}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && { opacity: 0.7 },
                    busyId === m.id && { opacity: 0.4 },
                  ]}
                >
                  <Text style={styles.secondaryBtnText}>
                    {m.status === 'active' ? '暂停' : '恢复'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onRevoke(m)}
                  disabled={busyId === m.id}
                  style={({ pressed }) => [
                    styles.dangerBtn,
                    pressed && { opacity: 0.7 },
                    busyId === m.id && { opacity: 0.4 },
                  ]}
                >
                  <Text style={styles.dangerBtnText}>撤销</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  lockBanner: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockTitle: { color: colors.warning, fontWeight: '700', marginBottom: 4 },
  lockDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  errorBanner: {
    backgroundColor: '#3a1a1a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { color: colors.danger, fontSize: 13 },
  actionsRow: { flexDirection: 'row', marginBottom: 12 },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  addCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
    marginBottom: 6,
  },
  roleChipActive: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  roleChipText: { color: colors.text, fontSize: 12 },
  emptyHint: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
    marginTop: 24,
    lineHeight: 19,
  },
  memberCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberEmoji: { fontSize: 28 },
  memberName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  memberRole: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusActive: { backgroundColor: '#0d4f3a' },
  statusPaused: { backgroundColor: '#4f3a0d' },
  statusRevoked: { backgroundColor: '#4f1a1a' },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  memberActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.text, fontSize: 13, fontWeight: '500' },
  dangerBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  dangerBtnText: { color: colors.danger, fontSize: 13, fontWeight: '500' },
}));

export default PetTeamScreen;
