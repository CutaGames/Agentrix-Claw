/**
 * TrustActionTimelineCard — TL-01.4 (A 线) 移动端只读信任闭环卡片。
 *
 * 消费后端 canonical ActionContext/Outcome（同 shared 契约与 Web 一致），由
 * `mobile.trust_loop` feature flag 门控。无记录、读取失败和未验证严格区分；
 * 任何局部读取失败都显示 unavailable，不伪造验证、争议、风险或补救状态。
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchTrustTimeline,
  fetchVerificationsBySubject,
  fetchDisputesByContested,
  fetchDisputeRemedies,
  fetchRiskDecisions,
} from '../../services/trustLoopApi';
import { isMobileV6FeatureEnabled } from '../../services/mobileV6FeatureFlags';
import type { Money } from '../../../shared/types/trust-loop-primitives';
import type { RemedyOutcome } from '../../../shared/types/trust-loop-contracts';

interface TrustActionTimelineCardProps {
  soulCoreId?: string;
  actionId?: string;
}

interface OwnerScopedOutcomeProps {
  ownerScope: string;
  soulCoreId: string;
  outcomeId: string;
}

function formatMoney(money?: Money): string {
  if (!money) return '—';
  const amount = Number(money.amountMinor) / 10 ** money.decimals;
  const human = Number.isFinite(amount) ? String(amount) : money.amountMinor;
  return `${human} ${money.currency}`;
}

function OutcomeVerificationRow({ ownerScope, soulCoreId, outcomeId }: OwnerScopedOutcomeProps) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['trust-verif-mobile', ownerScope, soulCoreId, outcomeId],
    queryFn: () => fetchVerificationsBySubject(soulCoreId, outcomeId),
    retry: 0,
  });
  if (query.isLoading) return null;
  if (query.isError) {
    return (
      <Text style={styles.muted}>
        {t({ en: 'Verification unavailable; no verdict is inferred.', zh: '验证数据不可用；不会推断任何结论。' })}
      </Text>
    );
  }
  const list = query.data ?? [];
  if (list.length === 0) {
    return (
      <Text style={styles.muted}>
        {t({ en: 'No verification yet (a producer assertion is not verified).', zh: '暂无独立验证（producer 断言 ≠ 已验证）。' })}
      </Text>
    );
  }
  const latest = list[list.length - 1];
  const external = latest.independenceClass === 'independent_external';
  return (
    <Text style={styles.row}>
      {t({ en: 'Verification', zh: '验证' })}: {latest.verdict} · {latest.independenceClass}
      {external ? '' : t({ en: ' (platform, not external)', zh: '（平台验证，非独立外部）' })}
    </Text>
  );
}

const UNDER_DISPUTE_STATES = ['opened', 'evidence_collection', 'under_review', 'escalated'];

function remedyLabel(remedy: RemedyOutcome): { en: string; zh: string } {
  // `confirmed` is a Remedy-domain claim, not proof that the owning settlement
  // record was resolved and digest-verified by this client. Never call it settled.
  if (remedy.status === 'confirmed') {
    const digestBound = Boolean(
      remedy.confirmedBy?.kind === 'payment_authority'
      && remedy.settlementRef?.digest,
    );
    return digestBound
      ? { en: 'confirmed; settlement evidence unresolved', zh: '已确认；结算证据尚未解析' }
      : { en: 'confirmed; settlement unverifiable', zh: '已确认；结算状态不可核验' };
  }
  if (remedy.status === 'in_progress') return { en: 'executing', zh: '执行中' };
  if (remedy.status === 'failed') return { en: 'failed', zh: '失败' };
  if (remedy.status === 'not_required') return { en: 'no monetary remedy', zh: '无需资金补救' };
  return { en: 'owed, not executed', zh: '已裁决待执行' };
}

function OutcomeDisputeRow({ ownerScope, soulCoreId, outcomeId }: OwnerScopedOutcomeProps) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['trust-dispute-mobile', ownerScope, soulCoreId, outcomeId],
    queryFn: () => fetchDisputesByContested(soulCoreId, outcomeId),
    retry: 0,
  });
  const latestDispute = query.data?.[0];
  const remediesQuery = useQuery({
    queryKey: ['trust-dispute-remedies-mobile', ownerScope, soulCoreId, latestDispute?.disputeId],
    queryFn: () => fetchDisputeRemedies(soulCoreId, latestDispute!.disputeId),
    enabled: !!latestDispute && latestDispute.state === 'resolved',
    retry: 0,
  });
  if (query.isLoading) return null;
  if (query.isError) {
    return (
      <Text style={styles.muted}>
        {t({ en: 'Dispute state unavailable; not_disputed is not inferred.', zh: '争议状态不可用；不会推断为 not_disputed。' })}
      </Text>
    );
  }
  const disputes = query.data ?? [];
  if (disputes.length === 0) {
    return (
      <Text style={styles.muted}>
        {t({ en: 'not_disputed (no dispute raised; not verification).', zh: 'not_disputed：未提出争议（≠ 已验证）。' })}
      </Text>
    );
  }
  const latest = disputes[0];
  const underDispute = UNDER_DISPUTE_STATES.includes(latest.state);
  const remedies = remediesQuery.data ?? [];
  return (
    <View>
      <Text style={styles.row}>
        {t({ en: 'Dispute', zh: '争议' })}: {latest.state}
        {underDispute ? t({ en: ' (under dispute, not verified)', zh: '（争议中，≠ 已验证）' }) : ''}
      </Text>
      {latest.state === 'resolved' ? (
        remediesQuery.isError ? (
          <Text style={styles.muted}>
            {t({ en: 'Remedy execution unavailable; no settlement is inferred.', zh: '补救执行数据不可用；不会推断已结算。' })}
          </Text>
        ) : remediesQuery.isLoading ? (
          <Text style={styles.muted}>{t({ en: 'Reading remedy execution…', zh: '正在读取补救执行…' })}</Text>
        ) : remedies.map((remedy) => (
          <Text key={remedy.remedyId} style={styles.muted}>
            {remedy.type}: {t(remedyLabel(remedy))}
          </Text>
        ))
      ) : null}
    </View>
  );
}

function RiskShadowRow({ ownerScope, soulCoreId, actionId }: { ownerScope: string; soulCoreId: string; actionId: string }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['trust-risk-mobile', ownerScope, soulCoreId, actionId],
    queryFn: () => fetchRiskDecisions(soulCoreId, actionId),
    retry: 0,
  });
  if (query.isLoading) return null;
  if (query.isError) {
    return (
      <View style={styles.card} testID="trust-risk-mobile-error">
        <Text style={styles.title}>{t({ en: 'Risk (shadow)', zh: '风险（Shadow）' })}</Text>
        <Text style={styles.muted}>{t({ en: 'Risk data unavailable; no recommendation is inferred.', zh: '风险数据不可用；不会推断任何建议。' })}</Text>
      </View>
    );
  }
  const decisions = query.data ?? [];
  if (decisions.length === 0) return null;
  const latest = decisions[decisions.length - 1];
  return (
    <View style={styles.card} testID="trust-risk-mobile">
      <Text style={styles.title}>{t({ en: 'Risk (shadow)', zh: '风险（Shadow）' })}</Text>
      <Text style={styles.row}>
        {latest.decision.recommendation} · {t({ en: 'advisory, does not execute', zh: '仅建议，不会执行（非 Authority）' })}
      </Text>
      {latest.actualDecision ? (
        <Text style={styles.muted}>
          {t({ en: 'Actual', zh: '实际' })}: {latest.actualDecision} · {latest.disagreement === null
            ? t({ en: 'comparison unavailable', zh: '比较结果不可用' })
            : latest.disagreement
              ? t({ en: 'disagrees', zh: '不一致' })
              : t({ en: 'agrees', zh: '一致' })}
        </Text>
      ) : null}
    </View>
  );
}

export function TrustActionTimelineCard({ soulCoreId, actionId }: TrustActionTimelineCardProps) {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const ownerScope = useAuthStore((state) => state.user?.id ?? null);

  const enabled = isMobileV6FeatureEnabled('mobile.trust_loop')
    && !!ownerScope
    && !!soulCoreId
    && !!actionId;
  const query = useQuery({
    queryKey: ['trust-timeline-mobile', ownerScope ?? 'no-owner', soulCoreId, actionId],
    queryFn: () => fetchTrustTimeline(soulCoreId as string, actionId as string),
    enabled,
    retry: 0,
  });

  if (!enabled) return null;

  if (query.isLoading) {
    return (
      <View style={styles.card} testID="trust-timeline-mobile-loading">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={styles.card} testID="trust-timeline-mobile-error">
        <Text style={styles.muted}>
          {t({ en: 'Trust Loop view unavailable (disabled, unauthorized or invalid).', zh: '信任闭环视图不可用（未启用、无权或响应无效）。' })}
        </Text>
      </View>
    );
  }

  const timeline = query.data;
  if (!timeline || timeline.legacy) {
    return (
      <View style={styles.card} testID="trust-timeline-mobile-legacy">
        <Text style={styles.title}>{t({ en: 'Trust Loop', zh: '信任闭环' })}</Text>
        <Text style={styles.chipMuted}>self_asserted / unknown</Text>
        <Text style={styles.muted}>
          {t({
            en: 'No Trust Loop record for this action — no fabricated verifier, status or dispute.',
            zh: '该动作暂无信任闭环记录；不伪造验证方、凭证状态或争议。',
          })}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="trust-timeline-mobile">
      <Text style={styles.sectionLabel}>{t({ en: 'Read-only · Trust Loop v1.1', zh: '只读 · 信任闭环 v1.1' })}</Text>

      {timeline.context ? (
        <View style={styles.card} testID="trust-timeline-mobile-context">
          <Text style={styles.title}>{t({ en: 'Authorization', zh: '授权预览' })}</Text>
          <Text style={styles.row}>
            {t({ en: 'State', zh: '状态' })}: {timeline.context.lifecycleState} · risk={timeline.context.riskMode}
          </Text>
          <Text style={styles.row}>
            {t({ en: 'Owner ceiling', zh: 'owner 上限' })}: {formatMoney(timeline.context.policy.ownerCeiling?.maxCost)}
          </Text>
          <Text style={styles.mono}>digest {String(timeline.context.canonicalDigest?.value ?? '').slice(0, 12)}…</Text>
        </View>
      ) : null}

      <RiskShadowRow ownerScope={ownerScope as string} soulCoreId={soulCoreId as string} actionId={actionId as string} />

      {timeline.outcomes.map((outcome) => (
        <View key={outcome.outcomeId} style={styles.card} testID="trust-timeline-mobile-outcome">
          <Text style={styles.title}>{t({ en: 'Cost & settlement', zh: '成本与结算' })}</Text>
          <Text style={styles.row}>
            {outcome.executionStatus} · {outcome.assertionClass}
          </Text>
          <Text style={styles.row}>
            {t({ en: 'Expected/actual', zh: '预期/实际' })}: {formatMoney(outcome.expected?.maxCost)} → {formatMoney(outcome.actual?.actualCost)}
          </Text>
          <Text style={styles.row}>
            {t({ en: 'Settlement', zh: '结算' })}: {outcome.settlement.status} · {formatMoney(outcome.settlement.net)}
          </Text>
          <OutcomeVerificationRow ownerScope={ownerScope as string} soulCoreId={soulCoreId as string} outcomeId={outcome.outcomeId} />
          <OutcomeDisputeRow ownerScope={ownerScope as string} soulCoreId={soulCoreId as string} outcomeId={outcome.outcomeId} />
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    sectionLabel: { color: c.textSecondary, fontSize: 12 },
    card: { backgroundColor: c.card, borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 4 },
    title: { color: c.text, fontWeight: '700', fontSize: 14 },
    row: { color: c.text, fontSize: 12 },
    mono: { color: c.textSecondary, fontSize: 11, fontFamily: 'monospace' },
    muted: { color: c.textSecondary, fontSize: 12 },
    chipMuted: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
  });
}
