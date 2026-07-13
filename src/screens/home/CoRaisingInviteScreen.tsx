/**
 * CoRaisingInviteScreen — real implementation (Sprint C1).
 *
 * Pet owner generates an invite link tied to a specific pet (agent
 * account). Share url pattern: `agentrix://home/co-raising/:token`.
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §6.1.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  createCoRaisingInvite,
  listMyCoRaisingInvites,
  cancelCoRaisingInvite,
  CoRaisingInviteView,
} from '../../services/coraising.api';
import { themedStyles } from '../../theme/useTheme';

export function CoRaisingInviteScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((s) => s.activeInstance);

  const [splitBps, setSplitBps] = useState('500'); // 5% default
  const [maxFeeders, setMaxFeeders] = useState('0'); // 0 = unlimited

  const invitesQ = useQuery({
    queryKey: ['coraising-invites'],
    queryFn: () => listMyCoRaisingInvites(20),
    staleTime: 30_000,
    retry: 1,
  });

  const createMut = useMutation({
    mutationFn: createCoRaisingInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coraising-invites'] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: cancelCoRaisingInvite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coraising-invites'] });
    },
  });

  const onCreate = useCallback(async () => {
    // In the Agentrix model, each pet == one AgentAccount. The instance
    // id on authStore is the current active pet agent for this user.
    const agentId = activeInstance?.id;
    if (!agentId) {
      Alert.alert(
        t({ en: 'No pet selected', zh: '尚未选择主宠' }),
        t({
          en: 'Activate a pet first to create a co-raising invite.',
          zh: '请先激活或切换一只主宠再创建共养邀请。',
        }),
      );
      return;
    }
    const split = Number(splitBps) || 500;
    const max = Number(maxFeeders) || 0;
    try {
      await createMut.mutateAsync({
        agent_account_id: agentId,
        split_bps: split,
        max_feeders: max,
      });
    } catch (e: any) {
      Alert.alert(t({ en: 'Failed', zh: '失败' }), e?.message ?? 'unknown');
    }
  }, [activeInstance?.id, splitBps, maxFeeders, createMut, t]);

  const onShare = useCallback(async (invite: CoRaisingInviteView) => {
    try {
      await Share.share({
        message: t({
          en: `Help raise my pet 🐾 ${invite.share_url}`,
          zh: `来帮我一起养宠物 🐾 ${invite.share_url}`,
        }),
        url: invite.share_url,
      });
    } catch {}
  }, [t]);

  const onCopy = useCallback(async (invite: CoRaisingInviteView) => {
    await Clipboard.setStringAsync(invite.share_url);
    Alert.alert(
      t({ en: 'Copied', zh: '已复制' }),
      t({ en: 'Share link copied to clipboard.', zh: '分享链接已复制到剪贴板' }),
    );
  }, [t]);

  const onCancel = useCallback(
    (invite: CoRaisingInviteView) => {
      Alert.alert(
        t({ en: 'Cancel invite?', zh: '取消邀请？' }),
        t({ en: 'Link will stop accepting new feeders.', zh: '链接将停止接受新喂养者。' }),
        [
          { text: t({ en: 'Keep', zh: '保留' }), style: 'cancel' },
          {
            text: t({ en: 'Cancel', zh: '取消' }),
            style: 'destructive',
            onPress: () => cancelMut.mutate(invite.id),
          },
        ],
      );
    },
    [cancelMut, t],
  );

  const invites = invitesQ.data?.items ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🌱 {t({ en: 'Co-Raising', zh: '共养邀请' })}</Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'Friends feed your pet → it levels up faster → they share future earnings.',
          zh: '邀请好友帮喂主宠 → 成长更快 → 未来收益按比例分给好友',
        })}
      </Text>

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>
          {t({ en: 'New invite', zh: '新建邀请' })}
        </Text>
        <LabeledInput
          label={t({ en: 'Split (basis points, 500 = 5%)', zh: '分成比例（基点，500 = 5%）' })}
          value={splitBps}
          onChangeText={setSplitBps}
          placeholder="500"
          keyboardType="numeric"
        />
        <LabeledInput
          label={t({ en: 'Max feeders (0 = unlimited)', zh: '最大喂养者数（0 = 不限）' })}
          value={maxFeeders}
          onChangeText={setMaxFeeders}
          placeholder="0"
          keyboardType="numeric"
        />
        <TouchableOpacity
          style={styles.createBtn}
          onPress={onCreate}
          disabled={createMut.isPending}
        >
          {createMut.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>
              {t({ en: 'Create invite link', zh: '生成邀请链接' })}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeader}>
        {t({ en: 'My invites', zh: '我的邀请' })}
      </Text>

      {invitesQ.isLoading && invites.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : invites.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyTitle}>
            {t({
              en: 'No invites yet',
              zh: '还没有邀请',
            })}
          </Text>
          <Text style={styles.emptyBody}>
            {t({
              en: 'Create your first invite above and share it on socials or with friends. They feed your pet, you both earn AXP!',
              zh: '在上方创建你的第一个邀请，分享给朋友。他们帮你喂宠，双方都能赚 AXP！',
            })}
          </Text>
        </View>
      ) : (
        invites.map((invite) => (
          <InviteRow
            key={invite.id}
            invite={invite}
            onShare={() => onShare(invite)}
            onCopy={() => onCopy(invite)}
            onCancel={() => onCancel(invite)}
            t={t}
          />
        ))
      )}
    </ScrollView>
  );
}

function InviteRow({
  invite,
  onShare,
  onCopy,
  onCancel,
  t,
}: {
  invite: CoRaisingInviteView;
  onShare: () => void;
  onCopy: () => void;
  onCancel: () => void;
  t: any;
}) {
  const splitPct = (invite.split_bps / 100).toFixed(invite.split_bps % 100 === 0 ? 0 : 2);
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowToken}>
          {invite.token.slice(0, 8)}…
        </Text>
        <View
          style={[
            styles.rowStatusPill,
            invite.status === 'active' ? styles.statusActive : styles.statusInactive,
          ]}
        >
          <Text style={styles.rowStatusText}>{invite.status}</Text>
        </View>
      </View>
      <Text style={styles.rowMeta}>
        {t({ en: 'Feeders', zh: '喂养者' })}: {invite.feeders_count}
        {invite.max_feeders > 0 ? ` / ${invite.max_feeders}` : ''} ·{' '}
        {t({ en: 'Feeds', zh: '喂养次数' })}: {invite.total_feeds} ·{' '}
        {t({ en: 'Split', zh: '分成' })}: {splitPct}%
      </Text>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.rowBtn} onPress={onShare}>
          <Text style={styles.rowBtnText}>📤 {t({ en: 'Share', zh: '分享' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rowBtn} onPress={onCopy}>
          <Text style={styles.rowBtnText}>📋 {t({ en: 'Copy', zh: '复制' })}</Text>
        </TouchableOpacity>
        {invite.status === 'active' ? (
          <TouchableOpacity style={[styles.rowBtn, styles.rowBtnDanger]} onPress={onCancel}>
            <Text style={[styles.rowBtnText, { color: '#ef4444' }]}>🚫 {t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function LabeledInput({
  label,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        {...rest}
      />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  formCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  inputLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  rowToken: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, fontFamily: 'monospace' },
  rowStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusActive: { backgroundColor: '#22c55e33' },
  statusInactive: { backgroundColor: colors.border },
  rowStatusText: { fontSize: 10, fontWeight: '600', color: colors.textPrimary, textTransform: 'uppercase' },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 10 },
  rowActions: { flexDirection: 'row', gap: 8 },
  rowBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
  },
  rowBtnDanger: {},
  rowBtnText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
}));
