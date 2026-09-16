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
  ActionAuthorizationPreviewV1,
  ActionTaskListV1,
  ActionTaskV1,
} from '../../../shared/types/action-runtime';
import type { MobileReadState } from '../../services/mobileReadState';
import {
  actionDimensions,
  evaluateMobileActionReceiptAvailability,
  evaluateMobileHardwareRequirement,
  type MobileAgentOption,
} from '../../services/mobileAgentEconomyModel';
import { createMobileV6QueryFacade } from '../../services/mobileV6Runtime';
import { isMobileV6FeatureEnabled } from '../../services/mobileV6FeatureFlags';
import { useI18n } from '../../stores/i18nStore';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useMobileAgentDirectory } from './useMobileAgentDirectory';

function shortId(value?: string): string {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 9)}…${value.slice(-6)}` : value;
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
          <Text style={styles.heroTitle} testID="agent-selected-name" numberOfLines={1}>
            {selected?.displayName ?? t({ en: 'Choose an Agent', zh: '选择一个 Agent' })}
          </Text>
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
  const [goal, setGoal] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [deadline, setDeadline] = React.useState('');
  const [error, setError] = React.useState('');
  const economyEnabled = isMobileV6FeatureEnabled('mobile.agent_economy_v1');

  const proceed = () => {
    if (!goal.trim()) {
      setError(t({ en: 'Describe the result you want.', zh: '请描述你希望获得的结果。' }));
      return;
    }
    if (budget && (!Number.isFinite(Number(budget)) || Number(budget) <= 0)) {
      setError(t({ en: 'Budget must be a positive number.', zh: '预算必须是正数。' }));
      return;
    }
    const goalId = `draft_${Date.now()}`;
    navigation.navigate('CandidateCompare', {
      agentId: route.params.agentId,
      goalId,
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="goal-composer-screen">
      <Text style={styles.pageTitle}>{t({ en: 'What should your Agent do?', zh: '希望 Agent 完成什么？' })}</Text>
      <Text style={styles.pageLead}>{t({ en: 'Use one sentence. You will review candidates and authority before anything runs.', zh: '用一句话描述。执行前你会先查看候选和授权边界。' })}</Text>
      <Text style={styles.inputLabel}>{t({ en: 'Goal', zh: '目标' })}</Text>
      <TextInput value={goal} onChangeText={(value) => { setGoal(value); setError(''); }} style={[styles.input, styles.multiline]} multiline placeholder={t({ en: 'Translate my launch page into Japanese', zh: '把我的产品发布页翻译成日语' })} placeholderTextColor="#8c8279" testID="goal-input" />
      <Text style={styles.inputLabel}>{t({ en: 'Budget (USD)', zh: '预算（USD）' })}</Text>
      <TextInput value={budget} onChangeText={setBudget} style={styles.input} keyboardType="decimal-pad" placeholder={t({ en: 'Optional', zh: '可选' })} placeholderTextColor="#8c8279" />
      <Text style={styles.inputLabel}>{t({ en: 'Deadline', zh: '截止时间' })}</Text>
      <TextInput value={deadline} onChangeText={setDeadline} style={styles.input} placeholder={t({ en: 'e.g. Tomorrow 18:00', zh: '例如：明天 18:00' })} placeholderTextColor="#8c8279" />
      <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Supported first', zh: '首批支持范围' })}</Text><Text style={styles.muted}>{t({ en: 'Translation and other bounded digital Agent services. No payment or execution happens from this draft.', zh: '翻译及其他边界明确的数字 Agent 服务。此草稿不会触发付款或执行。' })}</Text></View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <TouchableOpacity style={styles.primaryButton} onPress={proceed} testID="goal-continue"><Text style={styles.primaryButtonText}>{t({ en: 'Review candidates', zh: '查看候选' })}</Text></TouchableOpacity>
      {!economyEnabled ? <Text style={styles.helper}>{t({ en: 'Live discovery is currently fail-closed. The next screen will not invent candidates.', zh: 'Live discovery 当前为 fail-closed；下一页不会伪造候选。' })}</Text> : null}
    </ScrollView>
  );
}

export function CandidateCompareScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="candidate-compare-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Candidate comparison', zh: '候选比较' })}</Text>
      <View style={styles.softCard}>
        <Text style={styles.eyebrow}>{t({ en: 'PRIVATE DRAFT', zh: '私密草稿' })}</Text>
        <Text style={styles.cardTitle}>{t({ en: 'Goal content stays on the previous screen', zh: '目标原文仅保留在上一页' })}</Text>
        <Text style={styles.muted}>{t({ en: `Draft ${shortId(route.params.goalId)} · navigation carries identifiers only`, zh: `草稿 ${shortId(route.params.goalId)} · 路由仅携带标识符` })}</Text>
      </View>
      <View style={styles.notice} testID="candidate-live-unavailable">
        <Text style={styles.noticeTitle}>{t({ en: 'Live candidates unavailable', zh: 'Live 候选当前不可用' })}</Text>
        <Text style={styles.noticeText}>{t({ en: 'No canonical Mobile discovery/quote client is available. Nothing was submitted, reserved, or paid.', zh: '移动端尚无 canonical discovery/quote client。本次未提交、未预留、未付款。' })}</Text>
      </View>
      <View style={styles.candidateSkeleton}><Text style={styles.cardTitle}>{t({ en: 'What will appear here', zh: '接通后将在这里展示' })}</Text><Text style={styles.muted}>{t({ en: 'Up to 3 live candidates · price · source · freshness · availability · folded evidence', zh: '最多 3 个实时候选 · 价格 · 来源 · freshness · 可用性 · 折叠证据' })}</Text></View>
      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}><Text style={styles.primaryButtonText}>{t({ en: 'Edit goal', zh: '返回修改目标' })}</Text></TouchableOpacity>
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
  const soulCoreId = directory.model.agents
    .find((agent) => agent.agentId === route.params.agentId)?.soulCoreId;
  const facade = React.useMemo(() => createMobileV6QueryFacade(), []);
  const enabled = isMobileV6FeatureEnabled('mobile.agent_economy_v1');
  const nfcEnabled = isMobileV6FeatureEnabled('mobile.soul_card_nfc');
  const query = useQuery({
    queryKey: ['mobile-v7', 'authority', soulCoreId ?? 'unresolved', route.params.actionId],
    queryFn: () => facade.getAuthorizationPreview(soulCoreId as string, route.params.actionId, { enabled }),
    enabled: !!soulCoreId && !!route.params.actionId,
    retry: 0,
  });
  const state: MobileReadState<ActionAuthorizationPreviewV1> = query.data ?? (!enabled ? { kind: 'unavailable', capability: 'authority.preview_v1', reason: 'feature_disabled' } : !soulCoreId ? { kind: 'unavailable', capability: 'authority.preview_v1', reason: 'soul_core_mapping_missing' } : { kind: 'unknown', reason: 'loading' });
  const preview = state.kind === 'ready' ? state.data : undefined;
  const hardware = evaluateMobileHardwareRequirement(
    preview?.requiredEnforcementLayers ?? [],
    { nfcEnabled, attested: false },
  );
  const hardwareRequired = hardware.required;
  const canContinue = preview?.decision === 'approved' && !hardware.blocked;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="authority-review-screen">
      <Text style={styles.pageTitle}>{t({ en: 'Review authority', zh: '确认授权边界' })}</Text>
      {state.kind !== 'ready' ? <StateNotice state={state} onRetry={() => query.refetch()} /> : (
        <>
          <SummaryRow label={t({ en: 'Scope', zh: '范围' })} value={preview!.scope} />
          <SummaryRow label={t({ en: 'Amount', zh: '金额' })} value={`${preview!.estimatedCost.amount} ${preview!.estimatedCost.asset}`} />
          <SummaryRow label={t({ en: 'Provider', zh: '服务方' })} value={t({ en: 'Unavailable in contract', zh: '当前 contract 未提供' })} warning />
          <SummaryRow label={t({ en: 'Valid until', zh: '有效期至' })} value={preview!.expiresAt} />
          <SummaryRow label={t({ en: 'Decision', zh: '授权状态' })} value={preview!.decision} />
          <View style={styles.softCard}><Text style={styles.cardTitle}>{t({ en: 'Required mechanisms', zh: '所需机制' })}</Text><Text style={styles.muted}>{preview!.requiredEnforcementLayers.join(' · ') || t({ en: 'None declared', zh: '未声明' })}</Text></View>
          {hardwareRequired ? <View style={styles.blockedCard}><Text style={styles.noticeTitle}>{t({ en: 'Hardware step-up required', zh: '此授权明确要求硬件 step-up' })}</Text><Text style={styles.noticeText}>{nfcEnabled ? t({ en: 'NFC flow is enabled, but no live hardware capability attestation is available. Continuing is blocked.', zh: 'NFC 流程已开启，但没有 live 硬件能力证明，因此阻断继续。' }) : t({ en: 'Soul Card NFC is not enabled. This requirement cannot be bypassed.', zh: 'Soul Card NFC 未开启；不能绕过此要求。' })}</Text></View> : null}
          {preview!.decision === 'pending' ? <View style={styles.notice}><Text style={styles.noticeTitle}>{t({ en: 'Approval write is not exposed here', zh: '此页面暂不开放审批写入' })}</Text><Text style={styles.noticeText}>{t({ en: 'The preview is live. Mobile will not imply approval without a canonical mutation receipt.', zh: '授权预览来自 live 数据；没有 canonical mutation receipt 时移动端不会暗示已批准。' })}</Text></View> : null}
        </>
      )}
      <TouchableOpacity style={[styles.primaryButton, !canContinue && styles.disabled]} disabled={!canContinue} onPress={() => navigation.navigate('ActionTracking', route.params)}><Text style={styles.primaryButtonText}>{canContinue ? t({ en: 'View execution', zh: '查看执行' }) : t({ en: 'Cannot continue', zh: '当前不可继续' })}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function SummaryRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.summaryRow}><Text style={styles.muted}>{label}</Text><Text style={[styles.summaryValue, warning && styles.warningText]}>{value}</Text></View>;
}

export function ActionTrackingScreen({ route }: any) {
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
