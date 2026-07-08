/**
 * SovereigntyControlPlaneScreen — 授权中枢（Agent 主权 · S1 task 6.2）。
 *
 * 单屏聚合某 agent（主宠绑定的 AgentAccount）的全部授权：权限档 / 支付限额（单/日/月 + 今日剩余）/
 * 能力开关 / 模型 / 音色 / 审计历史。无死开关：`not_enabled` 项不可切换；`client_managed`（唤醒词/语音）
 * 深链设置页。整体受后端 env 门控 `SOVEREIGNTY_CONTROL_PLANE_ENABLED`；关闭时后端 404 → 本屏显示未启用。
 *
 * 入口：需带 route.params.agentAccountId（由持有该 id 的上游屏导航传入）。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { MeStackParamList } from '../../navigation/types';
import {
  getAuthorizations,
  applyTier,
  patchAuthorizations,
  getAuthorizationAudit,
  getRoutingResources,
  AuthorizationView,
  RoutingResourceView,
  RoutingTierKey,
  TierName,
} from '../../services/authorizationApi';
import { fetchOnchainAuthOverview } from '../../services/onchainAuth.api';

const TIER_LABELS: Record<Exclude<TierName, 'custom'>, { en: string; zh: string }> = {
  readonly: { en: 'Read-only', zh: '只读观察' },
  semi_auto: { en: 'Semi-auto', zh: '半自主一键确认' },
  full_auto: { en: 'Full-auto (capped)', zh: '全自主限额内' },
};

const CAP_LABELS: Record<string, { en: string; zh: string }> = {
  skillSearchEnabled: { en: 'Skill search', zh: '技能搜索' },
  skillExecuteEnabled: { en: 'Skill execute', zh: '技能执行' },
  commerceBrowseEnabled: { en: 'Browse market', zh: '浏览集市' },
  commercePurchaseEnabled: { en: 'Purchase', zh: '下单购买' },
  walletReadEnabled: { en: 'Read wallet', zh: '读取钱包' },
  quickpayEnabled: { en: 'QuickPay', zh: '快捷支付' },
  x402PayEnabled: { en: 'x402 micropay', zh: 'x402 微支付' },
  autonomousPaymentEnabled: { en: 'Autonomous pay', zh: '自主支付' },
  autoEarnEnabled: { en: 'Auto earn (accept)', zh: '自主接活' },
  autoEarnAutonomous: { en: 'Full-auto earn', zh: '全自主赚钱' },
  a2aDiscoverEnabled: { en: 'Discover agents', zh: '发现 Agent' },
  a2aInvokeEnabled: { en: 'Invoke agents', zh: '调用 Agent' },
};

const ROUTING_TIER_LABELS: Record<RoutingTierKey, { en: string; zh: string }> = {
  local: { en: 'On-device', zh: '端侧' },
  smart: { en: 'Smart', zh: '智能' },
  cloud: { en: 'Cloud', zh: '云端' },
  unknown: { en: 'Other', zh: '其他' },
};

type ScreenRoute = RouteProp<MeStackParamList, 'SovereigntyControlPlane'>;

export function SovereigntyControlPlaneScreen() {
  const { t } = useI18n();
  const route = useRoute<ScreenRoute>();
  const paramId = route.params?.agentAccountId;
  const qc = useQueryClient();
  const [busyCap, setBusyCap] = useState<string | null>(null);
  const [editingLimits, setEditingLimits] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [limitDraft, setLimitDraft] = useState<{ single: string; daily: string; monthly: string }>({
    single: '',
    daily: '',
    monthly: '',
  });

  // 未显式传入 agentAccountId 时，经链上授权总览（服务端按 JWT 解析主宠 AgentAccount）自动解析。
  const resolveQuery = useQuery({
    queryKey: ['cp-resolve-account'],
    queryFn: async () => (await fetchOnchainAuthOverview()).agentAccountId,
    enabled: !paramId,
    retry: false,
  });
  const agentAccountId = paramId ?? resolveQuery.data;

  const viewQuery = useQuery<AuthorizationView>({
    queryKey: ['authorizations', agentAccountId],
    queryFn: () => getAuthorizations(agentAccountId as string),
    enabled: !!agentAccountId,
    retry: false,
  });

  const auditQuery = useQuery({
    queryKey: ['authorizations-audit', agentAccountId],
    queryFn: () => getAuthorizationAudit(agentAccountId as string, 20),
    enabled: !!agentAccountId && viewQuery.isSuccess,
    retry: false,
  });

  // 资源与路由（只读 · task 8.2）：失败/404 → 优雅隐藏该段，不影响其余授权面。
  const routingQuery = useQuery<RoutingResourceView>({
    queryKey: ['routing-resources', agentAccountId],
    queryFn: () => getRoutingResources(agentAccountId as string, 30),
    enabled: !!agentAccountId && viewQuery.isSuccess,
    retry: false,
  });

  const tierMutation = useMutation({
    mutationFn: (tier: Exclude<TierName, 'custom'>) => applyTier(agentAccountId as string, tier),
    onSuccess: (v) => {
      qc.setQueryData(['authorizations', agentAccountId], v);
      qc.invalidateQueries({ queryKey: ['authorizations-audit', agentAccountId] });
    },
    onError: (e: any) => Alert.alert(t({ en: 'Failed', zh: '失败' }), e?.message || ''),
  });

  const toggleCap = useCallback(
    async (capKey: string, next: boolean) => {
      if (!agentAccountId) return;
      setBusyCap(capKey);
      try {
        const v = await patchAuthorizations(agentAccountId, { permissions: { [capKey]: next } });
        qc.setQueryData(['authorizations', agentAccountId], v);
        qc.invalidateQueries({ queryKey: ['authorizations-audit', agentAccountId] });
      } catch (e: any) {
        Alert.alert(t({ en: 'Failed', zh: '失败' }), e?.message || '');
      } finally {
        setBusyCap(null);
      }
    },
    [agentAccountId, qc, t],
  );

  const beginEditLimits = useCallback((v: AuthorizationView) => {
    setLimitDraft({
      single: String(v.spendingLimits?.singleTxLimit ?? 0),
      daily: String(v.spendingLimits?.dailyLimit ?? 0),
      monthly: String(v.spendingLimits?.monthlyLimit ?? 0),
    });
    setEditingLimits(true);
  }, []);

  const saveLimits = useCallback(
    async (currency?: string) => {
      if (!agentAccountId) return;
      const single = Number(limitDraft.single);
      const daily = Number(limitDraft.daily);
      const monthly = Number(limitDraft.monthly);
      if ([single, daily, monthly].some((n) => !Number.isFinite(n) || n < 0)) {
        Alert.alert(t({ en: 'Invalid', zh: '无效数值' }), t({ en: 'Limits must be non-negative numbers.', zh: '限额必须为非负数。' }));
        return;
      }
      setSavingLimits(true);
      try {
        const v = await patchAuthorizations(agentAccountId, {
          spendingLimits: { singleTxLimit: single, dailyLimit: daily, monthlyLimit: monthly, currency: currency || 'USDC' },
        });
        qc.setQueryData(['authorizations', agentAccountId], v);
        qc.invalidateQueries({ queryKey: ['authorizations-audit', agentAccountId] });
        setEditingLimits(false);
      } catch (e: any) {
        Alert.alert(t({ en: 'Failed', zh: '保存失败' }), e?.message || '');
      } finally {
        setSavingLimits(false);
      }
    },
    [agentAccountId, limitDraft, qc, t],
  );

  if (!agentAccountId) {
    if (!paramId && resolveQuery.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>
          {t({ en: 'No pet agent account found.', zh: '未找到主宠 agent 账户。' })}
        </Text>
      </View>
    );
  }

  if (viewQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (viewQuery.isError || !viewQuery.data) {
    // 后端 env 门控关闭（404）或其它错误 → 诚实显示未启用。
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>
          {t({ en: 'Control plane not enabled yet.', zh: '授权中枢尚未启用。' })}
        </Text>
      </View>
    );
  }

  const view = viewQuery.data;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={viewQuery.isFetching} onRefresh={() => viewQuery.refetch()} tintColor={colors.accent} />
      }
    >
      {/* 权限档 */}
      <Text style={styles.sectionTitle}>{t({ en: 'Permission Tier', zh: '权限档' })}</Text>
      <View style={styles.tierRow}>
        {(['readonly', 'semi_auto', 'full_auto'] as const).map((tier) => {
          const active = view.tier === tier;
          return (
            <TouchableOpacity
              key={tier}
              style={[styles.tierChip, active && styles.tierChipActive]}
              disabled={tierMutation.isPending}
              onPress={() => tierMutation.mutate(tier)}
            >
              <Text style={[styles.tierChipText, active && styles.tierChipTextActive]}>{t(TIER_LABELS[tier])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {view.tier === 'custom' && (
        <Text style={styles.customHint}>{t({ en: 'Custom (per-item overrides)', zh: '自定义（逐项覆盖）' })}</Text>
      )}

      {/* 支付限额（可编辑） */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{t({ en: 'Spending Limits', zh: '支付限额' })}</Text>
        {!editingLimits ? (
          <TouchableOpacity onPress={() => beginEditLimits(view)}>
            <Text style={styles.editLink}>✏️ {t({ en: 'Edit', zh: '编辑' })}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <TouchableOpacity onPress={() => setEditingLimits(false)} disabled={savingLimits}>
              <Text style={styles.cancelLink}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => saveLimits(view.spendingLimits?.currency)} disabled={savingLimits}>
              <Text style={styles.editLink}>{savingLimits ? t({ en: 'Saving…', zh: '保存中…' }) : t({ en: 'Save', zh: '保存' })}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.limitsCard}>
        {editingLimits ? (
          <>
            <LimitEditRow label={t({ en: 'Single', zh: '单笔' })} value={limitDraft.single} currency={view.spendingLimits?.currency} onChange={(v) => setLimitDraft((d) => ({ ...d, single: v }))} />
            <LimitEditRow label={t({ en: 'Daily', zh: '每日' })} value={limitDraft.daily} currency={view.spendingLimits?.currency} onChange={(v) => setLimitDraft((d) => ({ ...d, daily: v }))} />
            <LimitEditRow label={t({ en: 'Monthly', zh: '每月' })} value={limitDraft.monthly} currency={view.spendingLimits?.currency} onChange={(v) => setLimitDraft((d) => ({ ...d, monthly: v }))} />
            <Text style={styles.clientManagedHint}>
              {t({ en: 'Limits are enforced by the on-chain settlement fence.', zh: '限额由链上结算围栏强制执行；测试网稳定币计价，非投资建议。' })}
            </Text>
          </>
        ) : (
          <>
            <LimitRow label={t({ en: 'Single', zh: '单笔' })} value={view.spendingLimits?.singleTxLimit} currency={view.spendingLimits?.currency} />
            <LimitRow label={t({ en: 'Daily', zh: '每日' })} value={view.spendingLimits?.dailyLimit} currency={view.spendingLimits?.currency} />
            <LimitRow label={t({ en: 'Monthly', zh: '每月' })} value={view.spendingLimits?.monthlyLimit} currency={view.spendingLimits?.currency} />
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'Remaining today', zh: '今日剩余' })}</Text>
              <Text style={styles.limitValue}>
                {view.usage.remainingDaily == null ? '—' : `${view.usage.remainingDaily} ${view.spendingLimits?.currency || ''}`}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* 能力开关 */}
      <Text style={styles.sectionTitle}>{t({ en: 'Capabilities', zh: '能力开关' })}</Text>
      <View style={styles.capsCard}>
        {Object.entries(view.capabilities).map(([capKey, state]) => {
          const label = CAP_LABELS[capKey] || { en: capKey, zh: capKey };
          const on = state === 'enabled';
          const disabledSwitch = state === 'not_enabled' || busyCap === capKey;
          return (
            <View key={capKey} style={styles.capRow}>
              <Text style={styles.capLabel}>{t(label)}</Text>
              {state === 'not_enabled' ? (
                <Text style={styles.notEnabled}>{t({ en: 'Roadmap', zh: '未启用' })}</Text>
              ) : (
                <Switch value={on} disabled={disabledSwitch} onValueChange={(v) => toggleCap(capKey, v)} />
              )}
            </View>
          );
        })}
      </View>

      {/* 模型 / 音色 */}
      <Text style={styles.sectionTitle}>{t({ en: 'Model & Voice', zh: '模型与音色' })}</Text>
      <View style={styles.limitsCard}>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>{t({ en: 'Model', zh: '模型' })}</Text>
          <Text style={styles.limitValue}>{view.model.preferredModel || t({ en: 'Default', zh: '默认' })}</Text>
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>{t({ en: 'Voice', zh: '音色' })}</Text>
          <Text style={styles.limitValue}>{view.voiceId || t({ en: 'Default', zh: '默认' })}</Text>
        </View>
        <Text style={styles.clientManagedHint}>
          {t({ en: 'Wake word / voice managed in Settings.', zh: '唤醒词 / 语音在「设置」中管理。' })}
        </Text>
      </View>

      {/* 资源与路由（只读）：后端未启用/失败时整段隐藏 */}
      {routingQuery.isSuccess && routingQuery.data && (
        <>
          <Text style={styles.sectionTitle}>{t({ en: 'Resources & Routing', zh: '资源与路由' })}</Text>
          <View style={styles.limitsCard}>
            {/* 大脑 */}
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'Provider (BYOK)', zh: '厂商 (自带 key)' })}</Text>
              <Text style={styles.limitValue}>
                {routingQuery.data.brain.byok
                  ? `${routingQuery.data.brain.byokProvider || ''} ✓`
                  : t({ en: 'Platform', zh: '平台托管' })}
              </Text>
            </View>
            {/* 省钱估算 */}
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'Saved this window', zh: '本周期已省' })}</Text>
              <Text style={styles.limitValue}>
                {routingQuery.data.savings.savedUsd == null
                  ? '—'
                  : `≈ $${routingQuery.data.savings.savedUsd}`}
              </Text>
            </View>
            {/* 隐私分布 */}
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t({ en: 'On-device / Cloud calls', zh: '端侧 / 上云次数' })}</Text>
              <Text style={styles.limitValue}>
                {routingQuery.data.privacy.onDeviceCalls} / {routingQuery.data.privacy.networkCalls}
              </Text>
            </View>
            {/* 按档花费 */}
            {routingQuery.data.tierUsage.map((u) => (
              <View key={u.tier} style={styles.limitRow}>
                <Text style={styles.limitLabel}>{t(ROUTING_TIER_LABELS[u.tier])}</Text>
                <Text style={styles.limitValue}>
                  {u.calls} · ${Number(u.costUsd).toFixed(2)}
                </Text>
              </View>
            ))}
            <Text style={styles.clientManagedHint}>
              {t({
                en: 'Estimate over last 30 days · not a bill · not a return commitment.',
                zh: '近 30 天估算 · 非账单 · 非收益承诺。',
              })}
            </Text>
          </View>
        </>
      )}

      {/* 审计历史 */}
      <Text style={styles.sectionTitle}>{t({ en: 'Recent Changes', zh: '授权历史' })}</Text>
      <View style={styles.limitsCard}>
        {(auditQuery.data || []).length === 0 ? (
          <Text style={styles.hint}>{t({ en: 'No changes yet.', zh: '暂无记录。' })}</Text>
        ) : (
          (auditQuery.data || []).map((a) => (
            <View key={a.id} style={styles.auditRow}>
              <Text style={styles.auditAction}>
                {a.action}
                {a.capKey ? ` · ${a.capKey}` : ''}
                {a.decisionResult ? ` · ${a.decisionResult}` : ''}
              </Text>
              <Text style={styles.auditTime}>{new Date(a.createdAt).toISOString().slice(0, 16).replace('T', ' ')}</Text>
            </View>
          ))
        )}
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function LimitRow({ label, value, currency }: { label: string; value?: number; currency?: string }) {
  return (
    <View style={styles.limitRow}>
      <Text style={styles.limitLabel}>{label}</Text>
      <Text style={styles.limitValue}>{value == null ? '—' : `${value} ${currency || ''}`}</Text>
    </View>
  );
}

function LimitEditRow({
  label,
  value,
  currency,
  onChange,
}: {
  label: string;
  value: string;
  currency?: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.limitRow}>
      <Text style={styles.limitLabel}>{label}</Text>
      <View style={styles.limitInputWrap}>
        <TextInput
          style={styles.limitInput}
          value={value}
          onChangeText={(txt) => onChange(txt.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.limitCurrency}>{currency || 'USDC'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary, padding: 24 },
  hint: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
  editLink: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  cancelLink: { color: colors.textMuted, fontSize: 14 },
  limitInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  limitInput: { minWidth: 80, textAlign: 'right', color: colors.textPrimary, fontSize: 14, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 2 },
  limitCurrency: { color: colors.textMuted, fontSize: 12 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierChip: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.bgSecondary, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  tierChipActive: { borderColor: colors.accent, backgroundColor: colors.bgSecondary },
  tierChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tierChipTextActive: { color: colors.accent },
  customHint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  limitsCard: { backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 14 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  limitLabel: { color: colors.textSecondary, fontSize: 14 },
  limitValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  capsCard: { backgroundColor: colors.bgSecondary, borderRadius: 12, paddingHorizontal: 14 },
  capRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.bgPrimary },
  capLabel: { color: colors.textPrimary, fontSize: 14 },
  notEnabled: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  clientManagedHint: { color: colors.textMuted, fontSize: 12, marginTop: 8 },
  auditRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  auditAction: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  auditTime: { color: colors.textMuted, fontSize: 12 },
});
