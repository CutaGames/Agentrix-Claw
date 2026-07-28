/**
 * OnchainAuthScreen — 萌宠链上授权（Agent Protocol Stack 需求 6.1 / 6.2）。
 *
 * 用户给萌宠（绑定的 AgentAccount）授权链上代付额度（AP2 mandate）、查看/撤销，
 * 并查看受 OnchainFenceGuard 守卫的链上动作记录（OnchainActionRecord）。
 *
 * 双围栏（需求 6.2）：AP2 mandate（maxAmount/allowedMerchants/allowedCategories）
 * + spendingLimits（singleTx/daily），两者同时约束自主代付。
 *
 * 入口：移动端「我的」→ 萌宠赚钱（PetEarnings）→「链上授权」卡 → 本屏。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { themedStyles } from '../../theme/useTheme';
import {
  fetchOnchainAuthOverview,
  fetchOnchainActions,
  createOnchainMandate,
  revokeOnchainMandate,
  OnchainMandate,
  OnchainActionRecordView,
} from '../../services/onchainAuth.api';

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  settled: '#22c55e',
  pending: '#eab308',
  failed: '#ef4444',
  expired: colors.textMuted,
  revoked: colors.textMuted,
  exhausted: '#f97316',
};

function formatTime(ts?: number | string): string {
  if (ts == null) return '';
  const ms = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(ms)) return String(ts);
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(ms).toISOString().slice(0, 10);
}

export function OnchainAuthScreen() {
  const { t } = useI18n();

  const overviewQ = useQuery({
    queryKey: ['onchain-auth-overview'],
    queryFn: fetchOnchainAuthOverview,
    staleTime: 30_000,
    retry: 1,
  });
  const actionsQ = useQuery({
    queryKey: ['onchain-actions'],
    queryFn: () => fetchOnchainActions(20),
    staleTime: 30_000,
    retry: 1,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [maxAmount, setMaxAmount] = useState('');
  const [merchants, setMerchants] = useState('');
  const [categories, setCategories] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    overviewQ.refetch();
    actionsQ.refetch();
  }, [overviewQ, actionsQ]);

  const onCreate = useCallback(async () => {
    const amount = Number(maxAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(
        t({ en: 'Invalid amount', zh: '金额无效' }),
        t({ en: 'Enter a spending cap greater than 0.', zh: '请输入大于 0 的授权额度。' }),
      );
      return;
    }
    setSubmitting(true);
    try {
      await createOnchainMandate({
        maxAmount: amount,
        allowedMerchants: merchants.split(',').map((s) => s.trim()).filter(Boolean),
        allowedCategories: categories.split(',').map((s) => s.trim()).filter(Boolean),
      });
      Alert.alert(
        t({ en: 'Authorized', zh: '已授权' }),
        t({ en: 'Your pet can now pay on-chain within this cap.', zh: '萌宠现在可在该额度内进行链上代付。' }),
      );
      setModalOpen(false);
      setMaxAmount('');
      setMerchants('');
      setCategories('');
      overviewQ.refetch();
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Failed', zh: '授权失败' }),
        e?.message || t({ en: 'On-chain authorization is not available yet.', zh: '链上授权暂不可用，请稍后再试。' }),
      );
    } finally {
      setSubmitting(false);
    }
  }, [maxAmount, merchants, categories, t, overviewQ]);

  const onRevoke = useCallback(
    (m: OnchainMandate) => {
      Alert.alert(
        t({ en: 'Revoke authorization?', zh: '撤销授权？' }),
        t({
          en: 'Your pet will no longer be able to pay on-chain with this mandate.',
          zh: '撤销后萌宠将无法再用该授权进行链上代付。',
        }),
        [
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
          {
            text: t({ en: 'Revoke', zh: '撤销' }),
            style: 'destructive',
            onPress: async () => {
              setRevokingId(m.id);
              try {
                await revokeOnchainMandate(m.id);
                overviewQ.refetch();
              } catch (e: any) {
                Alert.alert(
                  t({ en: 'Failed', zh: '撤销失败' }),
                  e?.message || t({ en: 'Please try again later.', zh: '请稍后再试。' }),
                );
              } finally {
                setRevokingId(null);
              }
            },
          },
        ],
      );
    },
    [t, overviewQ],
  );

  const overview = overviewQ.data;
  const mandates = overview?.mandates ?? [];
  const limits = overview?.spendingLimits;
  const actions = actionsQ.data ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={overviewQ.isRefetching || actionsQ.isRefetching}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>🔐 {t({ en: 'On-chain Authorization', zh: '链上授权' })}</Text>
      <Text style={styles.intro}>
        {t({
          en: 'Authorize a spending cap so your pet can pay on-chain on your behalf. Two fences protect you: this mandate cap plus your daily spend limits.',
          zh: '给萌宠授权一笔代付额度，它便可在链上替你付费。双重围栏为你兜底：授权额度 + 每日消费限额。',
        })}
      </Text>

      {/* spendingLimits 围栏（需求 6.2 双围栏之一）*/}
      <Text style={styles.sectionHeader}>{t({ en: 'Spending Limits', zh: '消费围栏' })}</Text>
      <View style={styles.card}>
        <View style={styles.limitsRow}>
          <LimitStat
            label={t({ en: 'Per Tx', zh: '单笔上限' })}
            value={limits?.singleTxLimit}
            currency={limits?.currency}
          />
          <LimitStat
            label={t({ en: 'Daily', zh: '每日上限' })}
            value={limits?.dailyLimit}
            currency={limits?.currency}
          />
          <LimitStat
            label={t({ en: 'Used Today', zh: '今日已用' })}
            value={limits?.usedTodayAmount}
            currency={limits?.currency}
          />
        </View>
      </View>

      {/* AP2 mandate 列表 */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>{t({ en: 'Authorized Mandates', zh: '已授权额度' })}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
          <Text style={styles.addBtnText}>＋ {t({ en: 'Authorize', zh: '新增授权' })}</Text>
        </TouchableOpacity>
      </View>

      {overviewQ.isLoading && mandates.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : mandates.length === 0 ? (
        <Text style={styles.empty}>
          {t({ en: 'No on-chain authorization yet. Tap "Authorize" to grant a spending cap.', zh: '还没有链上授权。点「新增授权」给萌宠一笔代付额度。' })}
        </Text>
      ) : (
        mandates.map((m) => (
          <MandateCard key={m.id} mandate={m} onRevoke={onRevoke} revoking={revokingId === m.id} t={t} />
        ))
      )}

      {/* 链上动作记录（OnchainActionRecord）*/}
      <Text style={styles.sectionHeader}>{t({ en: 'On-chain Activity', zh: '链上动作记录' })}</Text>
      {actionsQ.isLoading && actions.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.accent} />
      ) : actions.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No on-chain actions yet.', zh: '暂无链上动作记录。' })}</Text>
      ) : (
        actions.map((a) => <ActionRow key={a.id} action={a} t={t} />)
      )}

      <Text style={styles.disclaimer}>
        {t({
          en: 'On-chain credentials are held server-side and never leave the server. Every action is checked against your mandate and daily limits before it executes.',
          zh: '链上凭证由服务端托管，绝不下发设备。每次链上动作执行前都会校验授权额度与每日限额。',
        })}
      </Text>

      {/* 新增授权弹窗 */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t({ en: 'Authorize On-chain Payment', zh: '授权链上代付' })}</Text>

            <Text style={styles.fieldLabel}>{t({ en: 'Spending cap (USDT)', zh: '授权额度（USDT）' })}</Text>
            <TextInput
              style={styles.input}
              value={maxAmount}
              onChangeText={setMaxAmount}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>
              {t({ en: 'Allowed merchants (optional, comma-separated)', zh: '允许商户（可选，逗号分隔）' })}
            </Text>
            <TextInput
              style={styles.input}
              value={merchants}
              onChangeText={setMerchants}
              placeholder={t({ en: 'leave blank = all', zh: '留空 = 不限' })}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>
              {t({ en: 'Allowed categories (optional, comma-separated)', zh: '允许品类（可选，逗号分隔）' })}
            </Text>
            <TextInput
              style={styles.input}
              value={categories}
              onChangeText={setCategories}
              placeholder={t({ en: 'leave blank = all', zh: '留空 = 不限' })}
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setModalOpen(false)}
                disabled={submitting}
              >
                <Text style={styles.modalBtnGhostText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, submitting && { opacity: 0.6 }]}
                onPress={onCreate}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>{t({ en: 'Authorize', zh: '确认授权' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function LimitStat({ label, value, currency }: { label: string; value?: number; currency?: string }) {
  return (
    <View style={styles.limitStat}>
      <Text style={styles.limitValue}>
        {value == null ? '—' : `${value.toLocaleString()}${currency ? ` ${currency}` : ''}`}
      </Text>
      <Text style={styles.limitLabel}>{label}</Text>
    </View>
  );
}

function MandateCard({
  mandate,
  onRevoke,
  revoking,
  t,
}: {
  mandate: OnchainMandate;
  onRevoke: (m: OnchainMandate) => void;
  revoking: boolean;
  t: any;
}) {
  const remaining = Math.max(0, mandate.maxAmount - mandate.usedAmount);
  const pctUsed = mandate.maxAmount > 0 ? Math.min(100, (mandate.usedAmount / mandate.maxAmount) * 100) : 0;
  const canRevoke = mandate.status === 'active';
  return (
    <View style={styles.card}>
      <View style={styles.mandateHeader}>
        <Text style={styles.mandateAmount}>
          {mandate.maxAmount.toLocaleString()} {mandate.currency}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[mandate.status] || colors.textMuted) + '22' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[mandate.status] || colors.textMuted }]}>
            {mandate.status}
          </Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, pctUsed)}%` }]} />
      </View>
      <Text style={styles.mandateMeta}>
        {t({ en: 'Used', zh: '已用' })} {mandate.usedAmount.toLocaleString()} · {t({ en: 'Remaining', zh: '剩余' })}{' '}
        {remaining.toLocaleString()} {mandate.currency} · {mandate.transactionCount} {t({ en: 'tx', zh: '笔' })}
      </Text>
      <Text style={styles.mandateScope}>
        {t({ en: 'Merchants', zh: '商户' })}: {mandate.allowedMerchants.length ? mandate.allowedMerchants.join(', ') : t({ en: 'all', zh: '不限' })}
        {'  ·  '}
        {t({ en: 'Categories', zh: '品类' })}: {mandate.allowedCategories.length ? mandate.allowedCategories.join(', ') : t({ en: 'all', zh: '不限' })}
      </Text>

      {canRevoke && (
        <TouchableOpacity style={[styles.revokeBtn, revoking && { opacity: 0.6 }]} onPress={() => onRevoke(mandate)} disabled={revoking}>
          {revoking ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <Text style={styles.revokeBtnText}>{t({ en: 'Revoke', zh: '撤销授权' })}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function ActionRow({ action, t }: { action: OnchainActionRecordView; t: any }) {
  const color = STATUS_COLORS[action.status] || colors.textMuted;
  return (
    <View style={styles.actionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTool}>{action.toolName || t({ en: 'on-chain action', zh: '链上动作' })}</Text>
        <Text style={styles.actionMeta}>
          {action.chain ? `${action.chain} · ` : ''}
          {action.amount.toLocaleString()} {action.currency}
          {action.createdAt != null ? ` · ${formatTime(action.createdAt)}` : ''}
        </Text>
        {action.txHash ? (
          <Text style={styles.actionTx} numberOfLines={1}>
            {action.txHash}
          </Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: color + '22' }]}>
        <Text style={[styles.statusText, { color }]}>{action.status}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    content: { padding: 16, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
    intro: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: 8 },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 16,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginTop: 6 },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    limitsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    limitStat: { alignItems: 'center' },
    limitValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    limitLabel: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
    empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginVertical: 12, paddingHorizontal: 20 },
    mandateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    mandateAmount: { fontSize: 18, fontWeight: '800', color: colors.accent },
    statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 6 },
    barFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
    mandateMeta: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    mandateScope: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
    revokeBtn: {
      marginTop: 12,
      borderRadius: 10,
      paddingVertical: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#ef4444',
    },
    revokeBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionTool: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    actionMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    actionTx: { fontSize: 10, color: colors.textMuted, marginTop: 2, opacity: 0.7 },
    disclaimer: { textAlign: 'center', fontSize: 10, color: colors.textMuted, marginTop: 20, paddingHorizontal: 12, lineHeight: 14, opacity: 0.55 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
    fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input: {
      backgroundColor: colors.bgCard,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 14,
    },
    modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
    modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    modalBtnGhost: { borderWidth: 1, borderColor: colors.border },
    modalBtnGhostText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
    modalBtnPrimary: { backgroundColor: colors.accent },
    modalBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  }),
);
