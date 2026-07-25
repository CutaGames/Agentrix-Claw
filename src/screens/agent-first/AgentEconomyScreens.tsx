import React from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type {
  ActionTaskListV1,
  ActionTaskV1,
} from '../../../shared/types/action-runtime';
import type {
  DiscoveryCandidateV1,
  GoalConstraintsV1,
} from '../../../shared/types/agent-economy';
import type { MobileReadState } from '../../services/mobileReadState';
import {
  actionDimensions,
  evaluateMobileActionReceiptAvailability,
  type MobileAgentOption,
} from '../../services/mobileAgentEconomyModel';
import {
  createMobileAgentEconomyClient,
  createMobileEconomyIdempotencyKey,
  describeEconomyClientError,
  isMobileAgentEconomyEnabled,
  isMobileEconomyMandateActive,
  isMobileZeroUsdQuote,
  runMobileEconomyMutation,
  type AgentEconomyWorkflowView,
} from '../../services/mobileAgentEconomyApi';
import { createMobileV6QueryFacade } from '../../services/mobileV6Runtime';
import { isMobileV6FeatureEnabled } from '../../services/mobileV6FeatureFlags';
import { useI18n } from '../../stores/i18nStore';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useMobileAgentDirectory } from './useMobileAgentDirectory';

type EconomyUiError = ReturnType<typeof describeEconomyClientError>;

function shortId(value?: string): string {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-6)}` : value;
}

function usdAmountMinor(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return amount > 0n ? amount.toString() : null;
}

function formatMoney(money?: { amountMinor: string; currency: string; decimals: number }): string {
  if (!money) return '—';
  const digits = money.amountMinor.padStart(money.decimals + 1, '0');
  const whole = money.decimals > 0 ? digits.slice(0, -money.decimals) : digits;
  const fraction = money.decimals > 0 ? digits.slice(-money.decimals).replace(/0+$/, '') : '';
  return `${whole}${fraction ? `.${fraction}` : ''} ${money.currency.toUpperCase()}`;
}

function isZeroMoney(money?: { amountMinor: string }): boolean {
  return !!money && /^0+$/.test(money.amountMinor);
}

function selectedCandidate(workflow?: AgentEconomyWorkflowView): DiscoveryCandidateV1 | undefined {
  const selectedId = workflow?.plan.selectedCandidateRef?.id;
  return workflow?.candidates.find((candidate) => candidate.candidateId === selectedId);
}

function EconomyErrorNotice({
  error,
  onRetry,
}: {
  error: EconomyUiError;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.notice} testID={`economy-error-${error.kind}`}>
      <Text style={styles.noticeTitle}>{error.uncertain
        ? t({ en: 'Outcome needs reconciliation', zh: '结果需要先对账' })
        : t({ en: 'Canonical workflow unavailable', zh: 'Canonical 工作流当前不可用' })}</Text>
      <Text style={styles.noticeText}>{error.uncertain
        ? t({ en: 'No verified response arrived. No new idempotency key will be generated; reload canonical state before any retry.', zh: '尚未收到可验证响应。不会生成新的幂等键；任何重试前必须先读取 canonical 状态。' })
        : t({ en: 'No success state was inferred. Retry only after the canonical service is available.', zh: '当前不会推断成功状态；仅在 canonical 服务恢复后重试。' })}</Text>
      <Text style={styles.helper}>{error.kind}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} disabled={false}>
          <Text style={styles.textLink}>{error.uncertain
            ? t({ en: 'Reconcile canonical state', zh: '对账 canonical 状态' })
            : t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function stateCopy(state: MobileReadState<unknown>, zh: boolean): { title: string; detail: string } {
  switch (state.kind) {
    case 'unknown': return { title: zh ? '状态尚未确认' : 'Status not confirmed', detail: state.reason };
    case 'unavailable': return { title: zh ? '此能力当前不可用' : 'Capability unavailable', detail: state.reason };
    case 'offline_stale': return { title: zh ? '离线 · 显示旧数据' : 'Offline · showing stale data', detail: state.reason };
    case 'unauthorized': return { title: zh ? '需要登录或重新授权' : 'Authorization required', detail: state.reason };
    case 'forbidden': return { title: zh ? '当前账号无权查看' : 'Access denied', detail: state.reason };
    case 'redacted': return { title: zh ? '部分内容已隐藏' : 'Some data is redacted', detail: state.reason };
    case 'revoked': return { title: zh ? '授权已撤销' : 'Authorization revoked', detail: state.reason };
    case 'unsupported_schema': return { title: zh ? '版本暂不兼容' : 'Version not supported', detail: state.reason };
    case 'legacy': return { title: zh ? '旧版数据 · 不作为实时真相' : 'Legacy data · not live truth', detail: state.reason };
    case 'partial': return { title: zh ? '部分数据可用' : 'Partial data', detail: state.missing.join(', ') };
    case 'error': return { title: zh ? '读取失败' : 'Read failed', detail: state.reason };
    default: return { title: '', detail: '' };
  }
}

function StateNotice({ state, onRetry }: { state: MobileReadState<unknown>; onRetry?: () => void }) {
  const { language } = useI18n();
  const styles = useThemedStyles(makeStyles);
  if (state.kind === 'ready') return null;
  const copy = stateCopy(state, language === 'zh');
  return (
    <View style={styles.notice} testID={`read-state-${state.kind}`}>
      <Text style={styles.noticeTitle}>{copy.title}</Text>
      <Text style={styles.noticeText}>{copy.detail}</Text>
      {onRetry && (state.kind === 'error' || state.kind === 'offline_stale') ? (
        <TouchableOpacity onPress={onRetry}><Text style={styles.textLink}>{language === 'zh' ? '重新对账' : 'Reconcile'}</Text></TouchableOpacity>
      ) : null}
    </View>
  );
}

function AgentSelector({
  visible,
  agents,
  selectedAgentId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  agents: MobileAgentOption[];
  selectedAgentId?: string;
  onSelect: (agentId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t({ en: 'Choose an Agent', zh: '选择 Agent' })}</Text>
          <Text style={styles.sheetHint}>{t({ en: 'Switching changes only this mobile session. It never changes canonical Primary ownership.', zh: '切换仅影响本次移动端会话，不会修改 canonical Primary 或所有权。' })}</Text>
          {agents.length === 0 ? <Text style={styles.muted}>{t({ en: 'No owned Agent mapping is available.', zh: '暂无可用的已归属 Agent 映射。' })}</Text> : null}
          {agents.map((agent) => (
            <TouchableOpacity
              key={agent.agentId}
              style={[styles.agentRow, selectedAgentId === agent.agentId && styles.agentRowActive]}
              onPress={() => onSelect(agent.agentId)}
              testID={`agent-option-${agent.agentId}`}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>✦</Text></View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{agent.displayName}</Text>
                <Text style={styles.muted}>{shortId(agent.agentId)} · {agent.runtimeStatus}</Text>
                {agent.canonicalMapping !== 'ready' ? <Text style={styles.warningText}>{t({ en: 'Soul Core mapping unavailable', zh: 'Soul Core 映射不可用' })}</Text> : null}
              </View>
              <Text style={styles.chevron}>{selectedAgentId === agent.agentId ? '✓' : '›'}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}><Text style={styles.secondaryButtonText}>{t({ en: 'Close', zh: '关闭' })}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ActionMiniCard({ task, onPress }: { task: ActionTaskV1; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{task.toolName}</Text>
        <Text style={styles.muted}>{task.lifecycle.execution} · {task.lifecycle.settlement}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export function AgentHomeScreen({ navigation }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const directory = useMobileAgentDirectory();
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const context = directory.model.context;
  const selected = directory.model.agents.find((agent) => agent.agentId === directory.model.selectedAgentId);
  const economyEnabled = isMobileV6FeatureEnabled('mobile.agent_economy_v1');
  const soulCoreId = context.kind === 'ready' ? context.context.soulCoreId : undefined;

  const actionsQ = useQuery({
    queryKey: context.kind === 'ready' ? [...context.context.scope.queryKey, 'recent-actions'] : ['mobile-v7', 'recent-actions', 'unresolved'],
    queryFn: () => directory.facade.listActions(soulCoreId as string, { enabled: economyEnabled }),
    enabled: !!soulCoreId,
    retry: 0,
  });
  const actionsState: MobileReadState<ActionTaskListV1> = actionsQ.data ?? (
    !economyEnabled
      ? { kind: 'unavailable', capability: 'action.list_v1', reason: 'feature_disabled' }
      : !soulCoreId
        ? { kind: 'unavailable', capability: 'action.list_v1', reason: 'agent_context_unresolved' }
        : { kind: 'unknown', reason: 'loading' }
  );

  const openPrimary = () => {
    if (context.kind !== 'ready') {
      setSelectorOpen(true);
      return;
    }
    navigation.navigate('GoalComposer', {
      agentId: context.context.agentId,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={directory.loading || actionsQ.isFetching} onRefresh={() => { directory.refetch(); actionsQ.refetch(); }} tintColor={c.accent} />}
      testID="agent-home-screen"
    >
      <Text style={styles.eyebrow}>{t({ en: 'YOUR AGENT', zh: '你的 AGENT' })}</Text>
      <TouchableOpacity style={styles.heroCard} onPress={() => setSelectorOpen(true)} testID="agent-switcher">
        <View style={styles.heroAvatar}><Text style={styles.heroAvatarText}>✦</Text></View>
        <View style={styles.flex}>
          <Text style={styles.heroTitle}>{selected?.displayName ?? t({ en: 'Choose an Agent', zh: '选择一个 Agent' })}</Text>
          <Text style={styles.heroSubtitle}>
            {selected ? `${shortId(selected.agentId)} · ${selected.runtimeStatus}` : t({ en: 'Multiple Agents are supported', zh: '支持拥有和切换多个 Agent' })}
          </Text>
        </View>
        <Text style={styles.chevron}>⌄</Text>
      </TouchableOpacity>

      {directory.state.kind !== 'ready' ? <StateNotice state={directory.state} onRetry={() => directory.refetch()} /> : null}
      {context.kind !== 'ready' && directory.state.kind === 'ready' ? (
        <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Agent context is not ready', zh: 'Agent 上下文尚未就绪' })}</Text><Text style={styles.noticeText}>{context.reason}</Text></View>
      ) : null}

      <TouchableOpacity style={styles.primaryButton} onPress={openPrimary} testID="agent-primary-goal">
        <Text style={styles.primaryButtonText}>{context.kind === 'ready' ? t({ en: 'Give Agent a goal', zh: '交给 Agent 一个目标' }) : t({ en: 'Choose an Agent', zh: '选择 Agent' })}</Text>
      </TouchableOpacity>
      {!economyEnabled ? <Text style={styles.helper}>{t({ en: 'Agent Economy live submission is not enabled in this build. Drafting remains available.', zh: '此构建未开启 Agent Economy live 提交；仍可查看并编辑目标草稿。' })}</Text> : null}

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t({ en: 'Recent actions', zh: '最近行动' })}</Text><TouchableOpacity onPress={() => navigation.getParent()?.navigate('Actions')}><Text style={styles.textLink}>{t({ en: 'All', zh: '全部' })}</Text></TouchableOpacity></View>
      {actionsState.kind === 'ready' ? (
        actionsState.data.items.length > 0
          ? actionsState.data.items.slice(0, 2).map((task) => <ActionMiniCard key={task.lifecycle.taskId} task={task} onPress={() => navigation.navigate('ActionTracking', { agentId: context.kind === 'ready' ? context.context.agentId : '', actionId: task.lifecycle.taskId })} />)
          : <View style={styles.emptyCard}><Text style={styles.muted}>{t({ en: 'No actions yet.', zh: '还没有行动。' })}</Text></View>
      ) : <StateNotice state={actionsState} onRetry={() => actionsQ.refetch()} />}

      <Text style={styles.sectionTitle}>{t({ en: 'Agent surfaces', zh: 'Agent 能力入口' })}</Text>
      <View style={styles.grid}>
        <FeatureCard emoji="🐾" title={t({ en: 'Companion', zh: '伙伴' })} subtitle={t({ en: 'Talk and hand off', zh: '对话与接力' })} onPress={() => navigation.navigate('Companion')} />
        <FeatureCard emoji="🔐" title="Soul Core" subtitle={t({ en: 'Identity & optional hardware', zh: '身份与可选硬件' })} onPress={() => selected && navigation.navigate('HardwareAssurance', { agentId: selected.agentId })} disabled={!selected} />
        <FeatureCard emoji="🔮" title={t({ en: 'Prediction', zh: '预测' })} subtitle={t({ en: 'Secondary journey', zh: '次级功能入口' })} onPress={() => navigation.navigate('Prediction')} />
        <FeatureCard emoji="◈" title="LSM" subtitle={t({ en: 'Secondary journey', zh: '次级功能入口' })} onPress={() => navigation.navigate('Lsm')} />
      </View>

      <AgentSelector
        visible={selectorOpen}
        agents={directory.model.agents}
        selectedAgentId={directory.model.selectedAgentId}
        onSelect={(agentId) => { directory.selectAgent(agentId); setSelectorOpen(false); }}
        onClose={() => setSelectorOpen(false)}
      />
    </ScrollView>
  );
}

function FeatureCard({ emoji, title, subtitle, onPress, disabled }: { emoji: string; title: string; subtitle: string; onPress: () => void; disabled?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={[styles.featureCard, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.featureEmoji}>{emoji}</Text><Text style={styles.cardTitle}>{title}</Text><Text style={styles.muted}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

export function GoalComposerScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory(route.params.agentId);
  const client = React.useMemo(() => createMobileAgentEconomyClient(), []);
  const [goal, setGoal] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [deadline, setDeadline] = React.useState('');
  const [error, setError] = React.useState('');
  const [submissionError, setSubmissionError] = React.useState<EconomyUiError>();
  const [submitting, setSubmitting] = React.useState(false);
  const pendingRef = React.useRef(false);
  const idempotencyKeyRef = React.useRef<string | undefined>(undefined);
  const requestRef = React.useRef<{ intent: string; constraints?: GoalConstraintsV1 } | undefined>(undefined);
  const economyEnabled = isMobileAgentEconomyEnabled();
  const soulCoreId = directory.model.agents
    .find((agent) => agent.agentId === route.params.agentId)?.soulCoreId;

  const resetDraftMutation = () => {
    if (submissionError?.uncertain) return;
    idempotencyKeyRef.current = undefined;
    requestRef.current = undefined;
    setSubmissionError(undefined);
    setError('');
  };

  const proceed = async () => {
    if (pendingRef.current || !economyEnabled || !soulCoreId) return;

    let request = requestRef.current;
    if (!submissionError?.uncertain) {
      if (!goal.trim()) {
        setError(t({ en: 'Describe the result you want.', zh: '请描述你希望获得的结果。' }));
        return;
      }
      const amountMinor = budget.trim() ? usdAmountMinor(budget) : undefined;
      if (budget.trim() && !amountMinor) {
        setError(t({ en: 'Use a positive USD amount with at most 2 decimals.', zh: '请输入正数 USD 金额，最多保留 2 位小数。' }));
        return;
      }
      const deadlineMs = deadline.trim() ? Date.parse(deadline.trim()) : undefined;
      if (deadline.trim() && (!Number.isFinite(deadlineMs) || (deadlineMs as number) <= Date.now())) {
        setError(t({ en: 'Deadline must be a valid future date/time.', zh: '截止时间必须是有效的未来日期时间。' }));
        return;
      }
      const constraints: GoalConstraintsV1 = {
        allowedKinds: ['skill', 'task', 'service'],
        ...(amountMinor ? {
          budgetCeiling: { amountMinor, currency: 'USD', decimals: 2 },
        } : {}),
        ...(deadlineMs ? { deadline: new Date(deadlineMs).toISOString() } : {}),
      };
      request = { intent: goal.trim(), constraints };
      requestRef.current = request;
      idempotencyKeyRef.current = createMobileEconomyIdempotencyKey('goal-create');
    }
    if (!request || !idempotencyKeyRef.current) return;

    pendingRef.current = true;
    setSubmitting(true);
    setError('');
    const outcome = await runMobileEconomyMutation(() => client.createGoal(
      soulCoreId,
      request!,
      idempotencyKeyRef.current!,
    ));
    pendingRef.current = false;
    setSubmitting(false);

    if (outcome.ok === false) {
      setSubmissionError(outcome.error);
      return;
    }
    setSubmissionError(undefined);
    navigation.replace('CandidateCompare', {
      agentId: route.params.agentId,
      goalId: outcome.result.workflow.goal.goalId,
      actionId: outcome.result.workflow.actionId,
    });
  };

  const immutableUnknownDraft = submissionError?.uncertain === true;
  const canSubmit = economyEnabled && !!soulCoreId && !submitting;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="goal-composer-screen">
      <Text style={styles.pageTitle}>{t({ en: 'What should your Agent do?', zh: '希望 Agent 完成什么？' })}</Text>
      <Text style={styles.pageLead}>{t({ en: 'Use one sentence. You will review candidates and authority before anything runs.', zh: '用一句话描述。执行前你会先查看候选和授权边界。' })}</Text>
      <Text style={styles.inputLabel}>{t({ en: 'Goal', zh: '目标' })}</Text>
      <TextInput value={goal} editable={!submitting && !immutableUnknownDraft} onChangeText={(value) => { setGoal(value); resetDraftMutation(); }} style={[styles.input, styles.multiline]} multiline placeholder={t({ en: 'Translate my launch page into Japanese', zh: '把我的产品发布页翻译成日语' })} placeholderTextColor="#8c8279" testID="goal-input" />
      <Text style={styles.inputLabel}>{t({ en: 'Budget ceiling (USD)', zh: '预算上限（USD）' })}</Text>
      <TextInput value={budget} editable={!submitting && !immutableUnknownDraft} onChangeText={(value) => { setBudget(value); resetDraftMutation(); }} style={styles.input} keyboardType="decimal-pad" placeholder={t({ en: 'Optional · no charge in this release', zh: '可选 · 此版本不会收费' })} placeholderTextColor="#8c8279" testID="goal-budget" />
      <Text style={styles.inputLabel}>{t({ en: 'Deadline', zh: '截止时间' })}</Text>
      <TextInput value={deadline} editable={!submitting && !immutableUnknownDraft} onChangeText={(value) => { setDeadline(value); resetDraftMutation(); }} style={styles.input} placeholder={t({ en: 'e.g. 2026-07-27 18:00', zh: '例如：2026-07-27 18:00' })} placeholderTextColor="#8c8279" testID="goal-deadline" />
      <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'First release boundary', zh: '首版边界' })}</Text><Text style={styles.muted}>{t({ en: 'Live skill, task and service candidates; only canonical 0 USD quotes can be authorized. Paid execution stays disabled.', zh: '实时发现技能、任务和服务候选；仅允许授权 canonical 0 USD 报价，付费执行保持关闭。' })}</Text></View>
      {!soulCoreId ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Soul Core mapping unavailable', zh: 'Soul Core 映射不可用' })}</Text><Text style={styles.noticeText}>{t({ en: 'Choose an owned Agent with a canonical mapping before live submission.', zh: '实时提交前，请选择具有 canonical 映射的已归属 Agent。' })}</Text></View> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {submissionError ? <EconomyErrorNotice error={submissionError} onRetry={proceed} /> : null}
      <TouchableOpacity style={[styles.primaryButton, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={proceed} testID="goal-continue">
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{immutableUnknownDraft ? t({ en: 'Check same submission', zh: '核验同一次提交' }) : t({ en: 'Create goal & find candidates', zh: '创建目标并发现候选' })}</Text>}
      </TouchableOpacity>
      {!economyEnabled ? <Text style={styles.helper}>{t({ en: 'Live workflow is fail-closed in this build; no draft is submitted.', zh: '此构建的实时工作流为 fail-closed；不会提交草稿。' })}</Text> : null}
      {immutableUnknownDraft ? <Text style={styles.helper}>{t({ en: 'The draft is locked so a changed payload cannot reuse the uncertain idempotency key.', zh: '草稿已锁定，避免变更后的 payload 复用结果未知的幂等键。' })}</Text> : null}
    </ScrollView>
  );
}

export function CandidateCompareScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory(route.params.agentId);
  const client = React.useMemo(() => createMobileAgentEconomyClient(), []);
  const [workflow, setWorkflow] = React.useState<AgentEconomyWorkflowView>();
  const [error, setError] = React.useState<EconomyUiError>();
  const [loading, setLoading] = React.useState(false);
  const [pendingCandidateId, setPendingCandidateId] = React.useState<string>();
  const [expandedCandidateId, setExpandedCandidateId] = React.useState<string>();
  const pendingRef = React.useRef(false);
  const startedRef = React.useRef('');
  const discoverKeyRef = React.useRef<string | undefined>(undefined);
  const selectKeyRef = React.useRef<Record<string, string>>({});
  const quoteKeyRef = React.useRef<Record<string, string>>({});
  const economyEnabled = isMobileAgentEconomyEnabled();
  const soulCoreId = directory.model.agents
    .find((agent) => agent.agentId === route.params.agentId)?.soulCoreId;

  const lineageError = React.useCallback((): EconomyUiError => ({
    kind: 'lineage_mismatch',
    title: 'Workflow lineage mismatch',
    detail: 'The Action does not belong to this Goal route.',
    uncertain: false,
  }), []);

  const loadCandidates = React.useCallback(async (reconcileOnly = false) => {
    if (pendingRef.current || !economyEnabled || !soulCoreId || !route.params.actionId) return;
    pendingRef.current = true;
    setLoading(true);
    setError(undefined);
    try {
      let latest = await client.getWorkflow(soulCoreId, route.params.actionId);
      if (latest.goal.goalId !== route.params.goalId) {
        setError(lineageError());
        return;
      }
      if (!reconcileOnly && latest.candidates.length === 0) {
        discoverKeyRef.current ??= createMobileEconomyIdempotencyKey(`discover-${latest.actionId}`);
        const outcome = await runMobileEconomyMutation(() => client.discoverCandidates(
          soulCoreId,
          latest,
          { kinds: ['skill', 'task', 'service'], limit: 3 },
          discoverKeyRef.current!,
        ));
        if (outcome.ok === false) {
          try {
            latest = await client.getWorkflow(soulCoreId, route.params.actionId);
          } catch {
            setError(outcome.error);
            return;
          }
          if (latest.candidates.length === 0) {
            setWorkflow(latest);
            setError(outcome.error);
            return;
          }
        } else {
          latest = outcome.result.workflow;
        }
      }
      setWorkflow(latest);
    } catch (loadError) {
      setError(describeEconomyClientError(loadError, false));
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  }, [client, economyEnabled, lineageError, route.params.actionId, route.params.goalId, soulCoreId]);

  React.useEffect(() => {
    const key = `${soulCoreId ?? 'unresolved'}:${route.params.actionId ?? 'missing'}`;
    if (!economyEnabled || !soulCoreId || !route.params.actionId || startedRef.current === key) return;
    startedRef.current = key;
    void loadCandidates(false);
  }, [economyEnabled, loadCandidates, route.params.actionId, soulCoreId]);

  const chooseCandidate = async (candidate: DiscoveryCandidateV1) => {
    if (pendingRef.current || !soulCoreId || !['eligible', 'selected'].includes(candidate.status)) return;
    pendingRef.current = true;
    setPendingCandidateId(candidate.candidateId);
    setError(undefined);
    try {
      let latest = await client.getWorkflow(soulCoreId, route.params.actionId);
      const selectedId = latest.plan.selectedCandidateRef?.id;
      if (selectedId && selectedId !== candidate.candidateId) {
        setWorkflow(latest);
        setError({ kind: 'candidate_locked', title: 'Candidate already selected', detail: 'Reload the Action before changing provider.', uncertain: false });
        return;
      }
      if (!selectedId) {
        selectKeyRef.current[candidate.candidateId] ??= createMobileEconomyIdempotencyKey(`select-${candidate.candidateId}`);
        const selection = await runMobileEconomyMutation(() => client.selectCandidate(
          soulCoreId,
          latest,
          candidate.candidateId,
          selectKeyRef.current[candidate.candidateId],
        ));
        if (selection.ok === false) {
          try {
            latest = await client.getWorkflow(soulCoreId, route.params.actionId);
          } catch {
            setError(selection.error);
            return;
          }
          if (latest.plan.selectedCandidateRef?.id !== candidate.candidateId) {
            setWorkflow(latest);
            setError(selection.error);
            return;
          }
        } else {
          latest = selection.result.workflow;
        }
      }

      const quoteUsable = latest.quote?.status === 'offered'
        && Date.parse(latest.quote.expiresAt) > Date.now()
        && latest.quote.candidateRef.id === candidate.candidateId;
      if (!quoteUsable && !latest.mandate) {
        quoteKeyRef.current[candidate.candidateId] ??= createMobileEconomyIdempotencyKey(`quote-${candidate.candidateId}`);
        const quote = await runMobileEconomyMutation(() => client.issueQuote(
          soulCoreId,
          latest,
          quoteKeyRef.current[candidate.candidateId],
        ));
        if (quote.ok === false) {
          try {
            latest = await client.getWorkflow(soulCoreId, route.params.actionId);
          } catch {
            setError(quote.error);
            return;
          }
          if (!latest.quote) {
            setWorkflow(latest);
            setError(quote.error);
            return;
          }
        } else {
          latest = quote.result.workflow;
        }
      }

      setWorkflow(latest);
      if (!isMobileZeroUsdQuote(latest.quote)) {
        setError({ kind: 'paid_execution_disabled', title: 'Paid execution disabled', detail: 'This release authorizes only canonical 0 USD quotes.', uncertain: false });
        return;
      }
      navigation.navigate('AuthorityReview', {
        agentId: route.params.agentId,
        actionId: latest.actionId,
      });
    } catch (mutationError) {
      setError(describeEconomyClientError(mutationError, false));
    } finally {
      pendingRef.current = false;
      setPendingCandidateId(undefined);
    }
  };

  const candidates = workflow?.candidates ?? [];
  const eligible = candidates.filter((candidate) => ['eligible', 'selected'].includes(candidate.status));
  const partial = candidates.length > 0 && eligible.length > 0 && eligible.length < candidates.length;
  const hasStale = candidates.some((candidate) => candidate.status === 'stale' || candidate.freshness?.state === 'stale');
  const hasRegulated = candidates.some((candidate) => candidate.executionState === 'regulated');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="candidate-compare-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Candidate comparison', zh: '候选比较' })}</Text>
      <View style={styles.softCard}>
        <Text style={styles.eyebrow}>{t({ en: 'CANONICAL GOAL', zh: 'CANONICAL 目标' })}</Text>
        <Text style={styles.cardTitle}>{shortId(route.params.goalId)}</Text>
        <Text style={styles.muted}>{t({ en: `Action ${shortId(route.params.actionId)} · routes carry identifiers only`, zh: `行动 ${shortId(route.params.actionId)} · 路由仅携带标识符` })}</Text>
      </View>
      {loading ? <View style={styles.loadingCard}><ActivityIndicator /><Text style={styles.muted}>{t({ en: 'Reading canonical workflow and live discovery…', zh: '正在读取 canonical 工作流与实时发现结果…' })}</Text></View> : null}
      {!economyEnabled ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Live discovery disabled', zh: '实时发现已关闭' })}</Text><Text style={styles.noticeText}>{t({ en: 'No candidates will be invented or cached as live.', zh: '不会伪造候选，也不会把缓存数据描述为实时结果。' })}</Text></View> : null}
      {!soulCoreId ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Agent mapping unavailable', zh: 'Agent 映射不可用' })}</Text><Text style={styles.noticeText}>{t({ en: 'Canonical Soul Core scope could not be resolved.', zh: '无法解析 canonical Soul Core 范围。' })}</Text></View> : null}
      {error ? <EconomyErrorNotice error={error} onRetry={() => loadCandidates(error.uncertain)} /> : null}
      {partial ? <View style={styles.notice} testID="candidate-partial"><Text style={styles.noticeTitle}>{t({ en: 'Partial results', zh: '部分结果可用' })}</Text><Text style={styles.noticeText}>{t({ en: 'Only eligible, fresh and non-regulated candidates can continue.', zh: '仅 eligible、fresh 且非受监管候选可以继续。' })}</Text></View> : null}
      {hasStale ? <View style={styles.notice} testID="candidate-stale"><Text style={styles.noticeTitle}>{t({ en: 'Stale candidates blocked', zh: '旧候选已阻断' })}</Text><Text style={styles.noticeText}>{t({ en: 'Stale projections remain visible for explanation but cannot be selected.', zh: '旧投影仅用于解释，不能被选择。' })}</Text></View> : null}
      {hasRegulated ? <View style={styles.blockedCard} testID="candidate-regulated"><Text style={styles.noticeTitle}>{t({ en: 'Regulated lane unavailable', zh: '受监管通道不可用' })}</Text><Text style={styles.noticeText}>{t({ en: 'Regulated discovery cannot enter this non-paid Mobile release.', zh: '受监管发现项不能进入本次非付费移动端发布。' })}</Text></View> : null}
      {!loading && workflow && candidates.length === 0 ? <View style={styles.emptyCard} testID="candidate-empty"><Text style={styles.cardTitle}>{t({ en: 'No live candidates', zh: '暂无实时候选' })}</Text><Text style={styles.muted}>{t({ en: 'Nothing was selected, quoted, reserved or paid.', zh: '本次没有选择、报价、预留或付款。' })}</Text></View> : null}
      {candidates.map((candidate) => {
        const candidateEligible = ['eligible', 'selected'].includes(candidate.status);
        const evidence = candidate.trustSummaryRefs ?? [];
        const freshness = candidate.freshness?.state ?? (candidate.status === 'stale' ? 'stale' : 'unknown');
        const expanded = expandedCandidateId === candidate.candidateId;
        return (
          <View key={candidate.candidateId} style={[styles.candidateCard, !candidateEligible && styles.candidateCardDisabled]} testID={`candidate-${candidate.candidateId}`}>
            <View style={styles.candidateHeader}>
              <View style={styles.flex}><Text style={styles.cardTitle}>{candidate.title ?? `${candidate.kind} · ${shortId(candidate.providerRef.id)}`}</Text><Text style={styles.muted}>{(candidate.description ?? candidate.capabilities.join(' · ')) || t({ en: 'No safe summary supplied', zh: '未提供安全摘要' })}</Text></View>
              <Text style={[styles.statusBadge, candidateEligible ? styles.statusBadgeReady : styles.statusBadgeBlocked]}>{candidate.status.toUpperCase()}</Text>
            </View>
            <View style={styles.badgeRow}>
              <Text style={styles.metaBadge}>{formatMoney(candidate.priceTerms.displayPrice)}</Text>
              <Text style={styles.metaBadge}>{candidate.source.source}</Text>
              <Text style={styles.metaBadge}>{freshness}</Text>
              <Text style={styles.metaBadge}>{candidate.availability}</Text>
            </View>
            <TouchableOpacity onPress={() => setExpandedCandidateId(expanded ? undefined : candidate.candidateId)}><Text style={styles.textLink}>{t({ en: `${expanded ? 'Hide' : 'Show'} evidence (${evidence.length})`, zh: `${expanded ? '收起' : '展开'}证据（${evidence.length}）` })}</Text></TouchableOpacity>
            {expanded ? <View style={styles.evidenceBox}><Text style={styles.evidenceText}>{t({ en: `Source captured ${candidate.source.capturedAt}`, zh: `来源采集于 ${candidate.source.capturedAt}` })}</Text>{evidence.length ? evidence.map((ref) => <Text key={`${ref.type}:${ref.id}`} style={styles.evidenceText}>{ref.type}:{shortId(ref.id)}</Text>) : <Text style={styles.evidenceText}>{t({ en: 'No trust-summary refs supplied.', zh: '未提供 trust-summary 引用。' })}</Text>}</View> : null}
            <TouchableOpacity style={[styles.primaryButton, !candidateEligible && styles.disabled]} disabled={!candidateEligible || pendingRef.current} onPress={() => chooseCandidate(candidate)} testID={`candidate-select-${candidate.candidateId}`}>
              {pendingCandidateId === candidate.candidateId ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t({ en: 'Select & request 0 USD quote', zh: '选择并请求 0 USD 报价' })}</Text>}
            </TouchableOpacity>
          </View>
        );
      })}
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()} disabled={pendingRef.current}><Text style={styles.secondaryButtonText}>{t({ en: 'Back', zh: '返回' })}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function useActionRead(soulCoreId: string | undefined, actionId: string) {
  const facade = React.useMemo(() => createMobileV6QueryFacade(), []);
  const enabled = isMobileV6FeatureEnabled('mobile.agent_economy_v1');
  const query = useQuery({
    queryKey: ['mobile-v7', 'action', soulCoreId ?? 'unresolved', actionId],
    queryFn: () => facade.getAction(soulCoreId as string, actionId, { enabled }),
    enabled: !!soulCoreId && !!actionId,
    retry: 0,
  });
  const state: MobileReadState<ActionTaskV1> = query.data ?? (
    !enabled
      ? { kind: 'unavailable', capability: 'action.detail_v1', reason: 'feature_disabled' }
      : !soulCoreId
        ? { kind: 'unavailable', capability: 'action.detail_v1', reason: 'soul_core_mapping_missing' }
        : { kind: 'unknown', reason: 'loading' }
  );
  return { state, query, facade, enabled };
}

export function AuthorityReviewScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory(route.params.agentId);
  const client = React.useMemo(() => createMobileAgentEconomyClient(), []);
  const [workflow, setWorkflow] = React.useState<AgentEconomyWorkflowView>();
  const [error, setError] = React.useState<EconomyUiError>();
  const [loading, setLoading] = React.useState(false);
  const pendingRef = React.useRef(false);
  const startedRef = React.useRef('');
  const authorizeKeyRef = React.useRef<string | undefined>(undefined);
  const enabled = isMobileAgentEconomyEnabled();
  const soulCoreId = directory.model.agents
    .find((agent) => agent.agentId === route.params.agentId)?.soulCoreId;

  const loadWorkflow = React.useCallback(async () => {
    if (!enabled || !soulCoreId || !route.params.actionId || pendingRef.current) return;
    pendingRef.current = true;
    setLoading(true);
    setError(undefined);
    try {
      setWorkflow(await client.getWorkflow(soulCoreId, route.params.actionId));
    } catch (loadError) {
      setError(describeEconomyClientError(loadError, false));
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  }, [client, enabled, route.params.actionId, soulCoreId]);

  React.useEffect(() => {
    const key = `${soulCoreId ?? 'unresolved'}:${route.params.actionId}`;
    if (!enabled || !soulCoreId || startedRef.current === key) return;
    startedRef.current = key;
    void loadWorkflow();
  }, [enabled, loadWorkflow, route.params.actionId, soulCoreId]);

  const openTracking = (actionId: string) => navigation.replace('ActionTracking', {
    agentId: route.params.agentId,
    actionId,
    view: 'tracking',
    origin: 'economy',
  });

  const authorize = async () => {
    if (pendingRef.current || !soulCoreId) return;
    pendingRef.current = true;
    setLoading(true);
    setError(undefined);
    try {
      let latest = await client.getWorkflow(soulCoreId, route.params.actionId);
      if (isMobileEconomyMandateActive(latest.mandate)) {
        setWorkflow(latest);
        openTracking(latest.actionId);
        return;
      }
      if (
        !latest.quote
        || latest.quote.status !== 'offered'
        || Date.parse(latest.quote.expiresAt) <= Date.now()
      ) {
        setWorkflow(latest);
        setError({ kind: 'stale', title: 'Quote expired', detail: 'Return to candidates and request a fresh quote.', uncertain: false });
        return;
      }
      if (!isMobileZeroUsdQuote(latest.quote)) {
        setWorkflow(latest);
        setError({ kind: 'paid_execution_disabled', title: 'Paid execution disabled', detail: 'This release authorizes only canonical 0 USD quotes.', uncertain: false });
        return;
      }
      authorizeKeyRef.current ??= createMobileEconomyIdempotencyKey(`authorize-${latest.actionId}`);
      const outcome = await runMobileEconomyMutation(() => client.authorize(
        soulCoreId,
        latest,
        authorizeKeyRef.current!,
      ));
      if (outcome.ok === false) {
        try {
          latest = await client.getWorkflow(soulCoreId, route.params.actionId);
        } catch {
          setError(outcome.error);
          return;
        }
        setWorkflow(latest);
        if (!isMobileEconomyMandateActive(latest.mandate)) {
          setError(outcome.error);
          return;
        }
      } else {
        latest = outcome.result.workflow;
        setWorkflow(latest);
      }
      openTracking(latest.actionId);
    } catch (authorizeError) {
      setError(describeEconomyClientError(authorizeError, false));
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  };

  const quote = workflow?.quote;
  const candidate = selectedCandidate(workflow);
  const quoteExpired = !!quote && Date.parse(quote.expiresAt) <= Date.now();
  const paidQuote = !!quote && !isMobileZeroUsdQuote(quote);
  const activeMandate = isMobileEconomyMandateActive(workflow?.mandate);
  const canAuthorize = activeMandate || (enabled
    && !!soulCoreId
    && !!quote
    && quote.status === 'offered'
    && !quoteExpired
    && !paidQuote
    && !loading);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="authority-review-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Review authority', zh: '确认授权边界' })}</Text>
      <Text style={styles.pageLead}>{t({ en: 'Authorization is not payment or execution. The server rechecks owner policy before issuing a mandate.', zh: '授权不等于付款或执行。服务端会在签发 Mandate 前重新检查 owner policy。' })}</Text>
      {loading && !workflow ? <View style={styles.loadingCard}><ActivityIndicator /><Text style={styles.muted}>{t({ en: 'Loading canonical quote…', zh: '正在加载 canonical 报价…' })}</Text></View> : null}
      {!enabled ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Authorization disabled', zh: '授权已关闭' })}</Text><Text style={styles.noticeText}>{t({ en: 'No mutation is available in this build.', zh: '此构建不开放授权写入。' })}</Text></View> : null}
      {!soulCoreId ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Agent mapping unavailable', zh: 'Agent 映射不可用' })}</Text></View> : null}
      {error ? <EconomyErrorNotice error={error} onRetry={error.uncertain ? loadWorkflow : undefined} /> : null}
      {workflow && !quote ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Canonical quote unavailable', zh: 'Canonical 报价不可用' })}</Text><Text style={styles.noticeText}>{t({ en: 'Return to candidate selection. Nothing can be authorized without a quote.', zh: '请返回候选选择；没有报价就不能授权。' })}</Text></View> : null}
      {quote ? (
        <>
          <View style={styles.softCard}>
            <Text style={styles.eyebrow}>{t({ en: '0 USD RELEASE GATE', zh: '0 USD 发布门' })}</Text>
            <Text style={styles.cardTitle}>{candidate?.title ?? `${candidate?.kind ?? 'candidate'} · ${shortId(candidate?.providerRef.id)}`}</Text>
            <Text style={styles.muted}>{shortId(quote.quoteId)} · {quote.status}</Text>
          </View>
          <SummaryRow label={t({ en: 'Amount ceiling', zh: '金额上限' })} value={formatMoney(quote.maximumAmount ?? quote.amount)} warning={paidQuote} />
          <SummaryRow label={t({ en: 'Provider', zh: '服务方' })} value={shortId(quote.providerRef.id)} />
          <SummaryRow label={t({ en: 'Valid until', zh: '有效期至' })} value={quote.expiresAt} warning={quoteExpired} />
          <SummaryRow label={t({ en: 'Action', zh: '行动' })} value={shortId(quote.actionId)} />
          <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Canonical terms', zh: 'Canonical 条款' })}</Text>{quote.termsRefs.map((ref) => <Text key={`${ref.type}:${ref.id}`} style={styles.muted}>{ref.type}:{shortId(ref.id)}</Text>)}</View>
          <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Authority boundary', zh: '授权边界' })}</Text><Text style={styles.muted}>{t({ en: 'The backend derives mechanisms and scope. Mobile cannot request weaker enforcement. A 0 USD reservation is a policy allocation lock, not a ledger debit.', zh: '机制与范围由后端推导，移动端不能请求更弱的执行约束。0 USD reservation 是策略分配锁，不是账本扣款。' })}</Text></View>
          {quoteExpired ? <View style={styles.blockedCard} testID="quote-expired"><Text style={styles.noticeTitle}>{t({ en: 'Quote expired', zh: '报价已过期' })}</Text><Text style={styles.noticeText}>{t({ en: 'Authorization is blocked. Return to candidates for a fresh quote.', zh: '授权已阻断；请返回候选页获取新报价。' })}</Text></View> : null}
          {paidQuote ? <View style={styles.blockedCard} testID="paid-quote-blocked"><Text style={styles.noticeTitle}>{t({ en: 'Paid quote blocked', zh: '付费报价已阻断' })}</Text><Text style={styles.noticeText}>{t({ en: 'Paid execution remains server-disabled for the first Mobile release.', zh: '首版移动端的付费执行仍由服务端关闭。' })}</Text></View> : null}
          {workflow.mandate ? <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Existing mandate', zh: '已有 Mandate' })}</Text><Text style={styles.muted}>{workflow.mandate.status} · {workflow.mandate.requiredMechanisms.join(' · ')}</Text></View> : null}
        </>
      ) : null}
      <TouchableOpacity style={[styles.primaryButton, !canAuthorize && styles.disabled]} disabled={!canAuthorize || pendingRef.current} onPress={authorize} testID="authority-authorize">
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{activeMandate ? t({ en: 'View authorized Action', zh: '查看已授权行动' }) : t({ en: 'Authorize 0 USD Action', zh: '授权 0 USD 行动' })}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} disabled={pendingRef.current} onPress={() => navigation.goBack()}><Text style={styles.secondaryButtonText}>{t({ en: 'Back to candidates', zh: '返回候选' })}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function SummaryRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.summaryRow}><Text style={styles.muted}>{label}</Text><Text style={[styles.summaryValue, warning && styles.warningText]}>{value}</Text></View>;
}

function EconomyActionTrackingScreen({ route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory(route.params.agentId);
  const client = React.useMemo(() => createMobileAgentEconomyClient(), []);
  const [override, setOverride] = React.useState<AgentEconomyWorkflowView>();
  const [error, setError] = React.useState<EconomyUiError>();
  const [mutating, setMutating] = React.useState<'revoke' | 'release'>();
  const pendingRef = React.useRef(false);
  const revokeKeyRef = React.useRef<string | undefined>(undefined);
  const releaseKeyRef = React.useRef<string | undefined>(undefined);
  const soulCoreId = directory.model.agents
    .find((agent) => agent.agentId === route.params.agentId)?.soulCoreId;
  const enabled = isMobileAgentEconomyEnabled();
  const query = useQuery({
    queryKey: ['mobile-v7', 'economy-workflow', soulCoreId ?? 'unresolved', route.params.actionId],
    queryFn: () => client.getWorkflow(soulCoreId as string, route.params.actionId),
    enabled: enabled && !!soulCoreId && !!route.params.actionId,
    retry: 0,
  });
  const workflow = override ?? query.data;
  const queryError = query.error ? describeEconomyClientError(query.error, false) : undefined;
  const mandateExpired = !!workflow?.mandate && Date.parse(workflow.mandate.expiresAt) <= Date.now();
  const reservationExpired = !!workflow?.reservation && Date.parse(workflow.reservation.expiresAt) <= Date.now();
  const zeroAmount = isZeroMoney(workflow?.reservation?.amount ?? workflow?.quote?.amount);

  const refresh = async () => {
    setError(undefined);
    const result = await query.refetch();
    if (result.data) setOverride(result.data);
  };

  const mutateAuthority = async (operation: 'revoke' | 'release') => {
    if (pendingRef.current || !soulCoreId) return;
    pendingRef.current = true;
    setMutating(operation);
    setError(undefined);
    try {
      let latest = await client.getWorkflow(soulCoreId, route.params.actionId);
      if (operation === 'revoke') {
        if (latest.mandate?.status !== 'active') {
          setOverride(latest);
          return;
        }
        revokeKeyRef.current ??= createMobileEconomyIdempotencyKey(`revoke-${latest.actionId}`);
        const outcome = await runMobileEconomyMutation(() => client.revoke(
          soulCoreId,
          latest,
          revokeKeyRef.current!,
          'mobile_owner_revoked',
        ));
        if ('result' in outcome) latest = outcome.result.workflow;
        else {
          const mutationError = outcome.error;
          try { latest = await client.getWorkflow(soulCoreId, route.params.actionId); }
          catch { setError(mutationError); return; }
          if (latest.mandate?.status === 'active') setError(mutationError);
        }
      } else {
        if (!latest.reservation || latest.reservation.status !== 'reserved' || Date.parse(latest.reservation.expiresAt) > Date.now()) {
          setOverride(latest);
          return;
        }
        releaseKeyRef.current ??= createMobileEconomyIdempotencyKey(`timeout-release-${latest.actionId}`);
        const outcome = await runMobileEconomyMutation(() => client.reconcile(
          soulCoreId,
          latest,
          releaseKeyRef.current!,
          'timeout_release',
        ));
        if ('result' in outcome) latest = outcome.result.workflow;
        else {
          const mutationError = outcome.error;
          try { latest = await client.getWorkflow(soulCoreId, route.params.actionId); }
          catch { setError(mutationError); return; }
          if (latest.reservation?.status === 'reserved') setError(mutationError);
        }
      }
      setOverride(latest);
    } catch (mutationError) {
      setError(describeEconomyClientError(mutationError, false));
    } finally {
      pendingRef.current = false;
      setMutating(undefined);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={refresh} />} testID="economy-action-tracking-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Non-paid Action', zh: '非付费行动' })}</Text>
      <Text style={styles.pageLead}>{shortId(route.params.actionId)}</Text>
      {!enabled ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Workflow disabled', zh: '工作流已关闭' })}</Text></View> : null}
      {!soulCoreId ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Agent mapping unavailable', zh: 'Agent 映射不可用' })}</Text></View> : null}
      {query.isLoading ? <View style={styles.loadingCard}><ActivityIndicator /><Text style={styles.muted}>{t({ en: 'Reconciling canonical workflow…', zh: '正在对账 canonical 工作流…' })}</Text></View> : null}
      {error || queryError ? <EconomyErrorNotice error={(error ?? queryError)!} onRetry={refresh} /> : null}
      {workflow ? (
        <>
          <SummaryRow label={t({ en: 'Workflow', zh: '工作流' })} value={`${workflow.workflowStatus} · v${workflow.workflowVersion}`} />
          <SummaryRow label={t({ en: 'Plan', zh: '计划' })} value={workflow.plan.status} />
          <SummaryRow label={t({ en: 'Candidate', zh: '候选' })} value={selectedCandidate(workflow)?.status ?? t({ en: 'Not selected', zh: '未选择' })} />
          <SummaryRow label={t({ en: 'Quote', zh: '报价' })} value={workflow.quote ? `${workflow.quote.status} · ${formatMoney(workflow.quote.amount)}` : t({ en: 'Unavailable', zh: '不可用' })} />
          <SummaryRow label={t({ en: 'Mandate', zh: 'Mandate' })} value={workflow.mandate ? `${workflow.mandate.status}${mandateExpired ? ' · expired' : ''}` : t({ en: 'Unavailable', zh: '不可用' })} warning={mandateExpired} />
          <SummaryRow label={t({ en: 'Reservation', zh: 'Reservation' })} value={workflow.reservation ? `${workflow.reservation.status} · ${formatMoney(workflow.reservation.amount)}` : t({ en: 'Unavailable', zh: '不可用' })} warning={reservationExpired && workflow.reservation?.status === 'reserved'} />
          <SummaryRow label={t({ en: 'Payment', zh: '付款' })} value={zeroAmount ? t({ en: 'Not required (0 USD)', zh: '无需付款（0 USD）' }) : t({ en: 'Blocked in this release', zh: '此版本已阻断' })} warning={!zeroAmount} />
          {workflow.mandate ? <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Enforcement mechanisms', zh: '执行约束机制' })}</Text><Text style={styles.muted}>{workflow.mandate.requiredMechanisms.join(' · ')}</Text><Text style={styles.helper}>{t({ en: 'Reservation is not a debit. Authorization is not proof of provider execution.', zh: 'Reservation 不是扣款；授权也不是服务方已执行的证明。' })}</Text></View> : null}
          {workflow.workflowStatus === 'reserved' ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Authorized for provider handoff', zh: '已授权，可交给服务方' })}</Text><Text style={styles.noticeText}>{t({ en: 'The 0 USD authority loop is complete. A canonical execution receipt is still required before claiming execution success.', zh: '0 USD 授权闭环已完成；在声明执行成功前，仍需要 canonical execution receipt。' })}</Text></View> : null}
          {reservationExpired && workflow.reservation?.status === 'reserved' ? <View style={styles.blockedCard}><Text style={styles.noticeTitle}>{t({ en: 'Reservation expired', zh: 'Reservation 已过期' })}</Text><Text style={styles.noticeText}>{t({ en: 'Release it through the canonical timeout reconciliation endpoint.', zh: '请通过 canonical timeout reconciliation 端点释放。' })}</Text></View> : null}
          {workflow.mandate?.status === 'active' ? <TouchableOpacity style={styles.dangerButton} disabled={!!mutating} onPress={() => mutateAuthority('revoke')} testID="economy-revoke"><Text style={styles.dangerButtonText}>{mutating === 'revoke' ? t({ en: 'Revoking…', zh: '正在撤销…' }) : t({ en: 'Revoke authority', zh: '撤销授权' })}</Text></TouchableOpacity> : null}
          {reservationExpired && workflow.reservation?.status === 'reserved' ? <TouchableOpacity style={styles.secondaryButton} disabled={!!mutating} onPress={() => mutateAuthority('release')} testID="economy-timeout-release"><Text style={styles.secondaryButtonText}>{mutating === 'release' ? t({ en: 'Releasing…', zh: '正在释放…' }) : t({ en: 'Release expired reservation', zh: '释放过期 Reservation' })}</Text></TouchableOpacity> : null}
        </>
      ) : null}
      <TouchableOpacity style={styles.primaryButton} disabled={!!mutating} onPress={refresh}><Text style={styles.primaryButtonText}>{t({ en: 'Reconcile canonical state', zh: '重新对账 canonical 状态' })}</Text></TouchableOpacity>
      <Text style={styles.helper}>{t({ en: 'Duplicate taps are blocked. Unknown outcomes reconcile before any mutation is considered again.', zh: '重复点击会被阻断；结果未知时必须先对账，再考虑任何 mutation。' })}</Text>
    </ScrollView>
  );
}

function ActionRuntimeTrackingScreen({ route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory(route.params.agentId);
  const soulCoreId = directory.model.agents
    .find((agent) => agent.agentId === route.params.agentId)?.soulCoreId;
  const { state, query } = useActionRead(soulCoreId, route.params.actionId);
  const task = state.kind === 'ready' ? state.data : undefined;
  const receipt = evaluateMobileActionReceiptAvailability(task);
  const terminalExecution = !!task && ['succeeded', 'failed', 'cancelled'].includes(task.lifecycle.execution);
  const receiptRequested = route.params.view === 'receipt';
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} />} testID="action-tracking-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Action tracking', zh: '行动跟踪' })}</Text>
      <Text style={styles.pageLead}>{shortId(route.params.actionId)}</Text>
      {state.kind !== 'ready' ? <StateNotice state={state} onRetry={() => query.refetch()} /> : (
        <>
          {actionDimensions(task!).map((dimension) => (
            <View key={dimension.key} style={styles.dimensionRow} testID={`dimension-${dimension.key}`}>
              <View style={[styles.statusDot, { backgroundColor: toneColor(dimension.tone) }]} />
              <View style={styles.flex}><Text style={styles.cardTitle}>{dimension.label}</Text><Text style={styles.muted}>{dimension.state}</Text></View>
              {!dimension.canonical ? <Text style={styles.unknownBadge}>{t({ en: 'UNAVAILABLE', zh: '不可用' })}</Text> : null}
            </View>
          ))}
          <Text style={styles.helper}>{t({ en: `Canonical version ${task!.lifecycle.version} · updated ${task!.lifecycle.updatedAt}`, zh: `Canonical 版本 ${task!.lifecycle.version} · 更新于 ${task!.lifecycle.updatedAt}` })}</Text>
        </>
      )}
      {(receiptRequested || terminalExecution) && !receipt.available ? (
        <View style={styles.notice} testID="canonical-receipt-unavailable">
          <Text style={styles.noticeTitle}>{t({ en: 'Canonical ActionReceipt unavailable', zh: 'Canonical ActionReceipt 当前不可用' })}</Text>
          <Text style={styles.noticeText}>{t({ en: 'Execution terminality is not a receipt. Outcome, fulfilment, settlement and proof remain separate until the authority service returns one canonical receipt.', zh: '执行终态不等于凭证。在权威服务返回统一 canonical receipt 前，结果、履约、结算与证明保持分离。' })}</Text>
        </View>
      ) : null}
      <TouchableOpacity style={styles.primaryButton} onPress={() => query.refetch()}><Text style={styles.primaryButtonText}>{t({ en: 'Reconcile canonical state', zh: '重新对账 canonical 状态' })}</Text></TouchableOpacity>
      <Text style={styles.helper}>{t({ en: 'Unknown outcomes never offer another payment. Reconcile first.', zh: '结果未知时不会提供再次付款；必须先对账。' })}</Text>
    </ScrollView>
  );
}

export function ActionTrackingScreen(props: any) {
  return props.route.params?.origin === 'economy'
    ? <EconomyActionTrackingScreen {...props} />
    : <ActionRuntimeTrackingScreen {...props} />;
}

function toneColor(tone: string): string {
  if (tone === 'success') return '#38a169';
  if (tone === 'progress') return '#d69e2e';
  if (tone === 'danger') return '#e05252';
  if (tone === 'warning') return '#dd6b20';
  if (tone === 'unknown') return '#8b837b';
  return '#b8afa7';
}

export function ActionsHomeScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const directory = useMobileAgentDirectory(route?.params?.agentId);
  const context = directory.model.context;
  const enabled = isMobileV6FeatureEnabled('mobile.agent_economy_v1');
  const soulCoreId = context.kind === 'ready' ? context.context.soulCoreId : undefined;
  const query = useQuery({
    queryKey: context.kind === 'ready' ? [...context.context.scope.queryKey, 'actions'] : ['mobile-v7', 'actions', 'unresolved'],
    queryFn: () => directory.facade.listActions(soulCoreId as string, { enabled }),
    enabled: !!soulCoreId,
    retry: 0,
  });
  const state: MobileReadState<ActionTaskListV1> = query.data ?? (!enabled ? { kind: 'unavailable', capability: 'action.list_v1', reason: 'feature_disabled' } : !soulCoreId ? { kind: 'unavailable', capability: 'action.list_v1', reason: 'agent_context_unresolved' } : { kind: 'unknown', reason: 'loading' });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} />} testID="actions-home-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Actions', zh: '行动' })}</Text>
      <Text style={styles.pageLead}>{t({ en: 'Authorization, execution, settlement, verification and remedy stay separate.', zh: '授权、执行、结算、验证、补救保持独立。' })}</Text>
      {state.kind !== 'ready' ? <StateNotice state={state} onRetry={() => query.refetch()} /> : state.data.items.length === 0 ? <View style={styles.emptyCard}><Text style={styles.muted}>{t({ en: 'No canonical actions for this Agent.', zh: '此 Agent 暂无 canonical 行动。' })}</Text></View> : state.data.items.map((task) => (
        <ActionMiniCard key={task.lifecycle.taskId} task={task} onPress={() => navigation.navigate('ActionTracking', { agentId: context.kind === 'ready' ? context.context.agentId : '', actionId: task.lifecycle.taskId })} />
      ))}
      {context.kind !== 'ready' ? <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.getParent()?.navigate('Agent')}><Text style={styles.primaryButtonText}>{t({ en: 'Choose Agent', zh: '前往选择 Agent' })}</Text></TouchableOpacity> : null}
    </ScrollView>
  );
}

export function LsmUnavailableScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return <View style={[styles.screen, styles.centerContent]} testID="lsm-unavailable-screen"><Text style={styles.featureEmoji}>◈</Text><Text style={styles.pageTitle}>LSM</Text><Text style={styles.pageLead}>{t({ en: 'The feature is retained as a secondary journey, but this build has no canonical Mobile LSM client. No balance, position or settlement is inferred.', zh: '该功能作为次级旅程保留，但此构建没有 canonical Mobile LSM client；不会推断余额、仓位或结算。' })}</Text></View>;
}

export function DestinationErrorScreen({ route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.screen, styles.centerContent]} testID="destination-error-screen">
      <Text style={styles.featureEmoji}>!</Text>
      <Text style={styles.pageTitle}>{t({ en: 'Link not opened', zh: '链接未打开' })}</Text>
      <Text style={styles.pageLead}>{t({ en: 'This destination failed strict validation. No action, execution or payment was started.', zh: '该目标未通过严格校验；没有启动行动、执行或付款。' })}</Text>
      <Text style={styles.helper}>{route.params?.reason ?? 'invalid_route'}</Text>
    </View>
  );
}

export function AgentSoulCoreRedirectScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  React.useEffect(() => {
    navigation.getParent()?.navigate('My', {
      screen: 'SoulCoreView',
      params: { agentId: route.params.agentId },
    });
  }, [navigation, route.params.agentId]);
  return <View style={[styles.screen, styles.centerContent]}><ActivityIndicator /><Text style={styles.pageLead}>{t({ en: 'Opening Soul Core…', zh: '正在打开 Soul Core…' })}</Text></View>;
}

export function HardwareAssuranceScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const nfcEnabled = isMobileV6FeatureEnabled('mobile.soul_card_nfc');
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="hardware-assurance-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Soul Core assurance', zh: 'Soul Core 保障机制' })}</Text>
      <Text style={styles.pageLead}>{shortId(route.params.agentId)}</Text>
      <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Software baseline', zh: '软件基线' })}</Text><Text style={styles.muted}>{t({ en: 'The normal Agent journey does not require hardware.', zh: '正常 Agent 旅程不依赖硬件。' })}</Text></View>
      <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Optional Soul Core hardware', zh: '可选 Soul Core 硬件' })}</Text><Text style={styles.muted}>{nfcEnabled ? t({ en: 'NFC feature flag is enabled. Live card presence and attestation remain unverified until the capability API confirms them.', zh: 'NFC feature flag 已开启；在 capability API 确认前，真卡存在性和 attestation 仍为未验证。' }) : t({ en: 'Not enabled in this build. Protocol, Simulator and test artifacts are not presented as a real card.', zh: '此构建未开启。Protocol、Simulator 和测试产物不会被描述为真卡。' })}</Text></View>
      <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Fail-closed rule', zh: 'Fail-closed 规则' })}</Text><Text style={styles.noticeText}>{t({ en: 'If a Mandate explicitly requires hardware, the action is blocked unless live capability and attestation are available. Otherwise the software path continues.', zh: 'Mandate 明确要求硬件时，必须有 live capability 与 attestation 才能继续；不要求硬件时继续软件路径。' })}</Text></View>
      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('AgentSoulCore', { agentId: route.params.agentId })}><Text style={styles.primaryButtonText}>{t({ en: 'Open Soul Core', zh: '打开 Soul Core' })}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    centerContent: { alignItems: 'center', justifyContent: 'center', padding: 28 },
    flex: { flex: 1 },
    eyebrow: { color: c.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    pageTitle: { color: c.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    pageLead: { color: c.textSecondary, fontSize: 15, lineHeight: 22 },
    heroCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff4e8', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#f2d6bc' },
    heroAvatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e98b5f' },
    heroAvatarText: { color: '#fff', fontSize: 25, fontWeight: '800' },
    heroTitle: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    heroSubtitle: { color: c.textSecondary, fontSize: 12, marginTop: 3 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    sectionTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 8 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    warningText: { color: '#b75d20', fontSize: 12, fontWeight: '700' },
    errorText: { color: '#d64545', fontSize: 13 },
    helper: { color: c.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    primaryButton: { backgroundColor: '#df744f', minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    secondaryButton: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, marginTop: 8 },
    secondaryButtonText: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    textLink: { color: c.accent, fontSize: 13, fontWeight: '700', marginTop: 6 },
    disabled: { opacity: 0.45 },
    notice: { backgroundColor: '#fff7dd', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#ead8a2' },
    noticeTitle: { color: '#5f4b22', fontSize: 14, fontWeight: '800' },
    noticeText: { color: '#75633c', fontSize: 12, lineHeight: 18, marginTop: 4 },
    softCard: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 5 },
    blockedCard: { backgroundColor: '#fff0ee', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f0bbb3' },
    emptyCard: { backgroundColor: c.bgCard, borderRadius: 16, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: c.border },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    featureCard: { width: '48%', minHeight: 122, backgroundColor: c.bgCard, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border },
    featureEmoji: { fontSize: 27, marginBottom: 8 },
    actionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border },
    chevron: { color: c.textMuted, fontSize: 20, marginLeft: 8 },
    backdrop: { flex: 1, backgroundColor: 'rgba(45,36,31,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, gap: 10, maxHeight: '80%' },
    sheetTitle: { color: c.textPrimary, fontSize: 22, fontWeight: '800' },
    sheetHint: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    agentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: c.border, backgroundColor: c.bgCard },
    agentRowActive: { borderColor: '#df744f', backgroundColor: '#fff4e8' },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1ddd0' },
    avatarText: { color: '#b85e3f', fontWeight: '800' },
    inputLabel: { color: c.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    input: { backgroundColor: c.bgCard, color: c.textPrimary, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
    multiline: { minHeight: 110, textAlignVertical: 'top' },
    candidateSkeleton: { minHeight: 140, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 18, padding: 18, justifyContent: 'center', gap: 8 },
    loadingCard: { minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: c.bgCard, borderRadius: 16, borderWidth: 1, borderColor: c.border },
    candidateCard: { backgroundColor: c.bgCard, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: c.border, gap: 11 },
    candidateCardDisabled: { opacity: 0.72, backgroundColor: c.bgSecondary },
    candidateHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaBadge: { color: c.textSecondary, backgroundColor: c.bgSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', fontSize: 10, fontWeight: '700' },
    statusBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', fontSize: 9, fontWeight: '800' },
    statusBadgeReady: { color: '#22633b', backgroundColor: '#dff3e5' },
    statusBadgeBlocked: { color: '#8a3e34', backgroundColor: '#f8dfdc' },
    dangerButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#dc6b61', backgroundColor: '#fff0ee' },
    dangerButtonText: { color: '#a43d35', fontSize: 15, fontWeight: '800' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    summaryValue: { color: c.textPrimary, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
    dimensionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border },
    statusDot: { width: 11, height: 11, borderRadius: 6 },
    unknownBadge: { color: '#756c64', backgroundColor: '#e9e3dd', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', fontSize: 9, fontWeight: '800' },
    receiptHero: { alignItems: 'center', gap: 7, backgroundColor: '#fff4e8', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#f2d6bc' },
    receiptIcon: { width: 44, height: 44, borderRadius: 22, textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#df744f', color: '#fff', fontSize: 25, fontWeight: '800' },
    evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    evidenceBox: { backgroundColor: c.bgSecondary, borderRadius: 14, padding: 13, gap: 7 },
    evidenceText: { color: c.textSecondary, fontSize: 11, fontFamily: 'monospace' },
  });
}
