/**
 * TrustActionTimelineCard — TL-01.4 (A 线) 移动端只读信任闭环卡片。
 *
 * 消费后端 canonical ActionContext/Outcome（同 shared 契约与 Web 一致）。默认由
 * `TRUST_LOOP_MOBILE_ENABLED` 门控（关 → 返回 null，零影响现有屏幕）。无记录/legacy
 * 时诚实显示 self_asserted/unknown，不伪造验证方/凭证状态/争议；出错（flag 关/无权）
 * 时显示不可用提示。只读，不改任何现有屏幕。
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchTrustTimeline,
  fetchVerificationsBySubject,
  fetchDisputesByContested,
  fetchDisputeRemedies,
  fetchRiskDecisions,
  TRUST_LOOP_MOBILE_ENABLED,
} from '../../services/trustLoopApi';
import type { Money } from '../../../shared/types/trust-loop-primitives';
import type { RemedyOutcome } from '../../../shared/types/trust-loop-contracts';

interface TrustActionTimelineCardProps {
  soulCoreId?: string;
  actionId?: string;
}

function formatMoney(money?: Money): string {
  if (!money) return '—';
  const n = Number(money.amountMinor) / 10 ** money.decimals;
  const human = Number.isFinite(n) ? String(n) : money.amountMinor;
  return `${human} ${money.currency}`;
}

function OutcomeVerificationRow({ soulCoreId, outcomeId }: { soulCoreId: string; outcomeId: string }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ['trust-verif-mobile', soulCoreId, outcomeId],
    queryFn: () => fetchVerificationsBySubject(soulCoreId, outcomeId),
    retry: 0,
  });
  if (q.isLoading || q.isError) return null;
  const list = q.data ?? [];
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

function remedyLabel(r: RemedyOutcome): { en: string; zh: string } {
  // Honesty: "settled" ONLY when confirmed AND a settlement ref exists (money moved).
  if (r.status === 'confirmed' && r.settlementRef) return { en: 'settled', zh: '已结算' };
  if (r.status === 'in_progress') return { en: 'executing', zh: '执行中' };
  if (r.status === 'failed') return { en: 'failed', zh: '失败' };
  if (r.status === 'not_required') return { en: 'no monetary remedy', zh: '无需资金补救' };
  return { en: 'owed, not executed', zh: '已裁决待执行' };
}

function OutcomeDisputeRow({ soulCoreId, outcomeId }: { soulCoreId: string; outcomeId: string }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ['trust-dispute-mobile', soulCoreId, outcomeId],
    queryFn: () => fetchDisputesByContested(soulCoreId, outcomeId),
    retry: 0,
  });
  const remediesQ = useQuery({
    queryKey: ['trust-dispute-remedies-mobile', soulCoreId, q.data?.[0]?.disputeId],
    queryFn: () => fetchDisputeRemedies(soulCoreId, q.data![0].disputeId),
    enabled: !!q.data?.[0] && q.data[0].state === 'resolved',
    retry: 0,
  });
  if (q.isLoading || q.isError) return null;
  const disputes = q.data ?? [];
  if (disputes.length === 0) {
    return (
      <Text style={styles.muted}>
        {t({ en: 'not_disputed (no dispute raised; not verification).', zh: 'not_disputed：未提出争议（≠ 已验证）。' })}
      </Text>
    );
  }
  const latest = disputes[0];
  const underDispute = UNDER_DISPUTE_STATES.includes(latest.state);
  const remedies = remediesQ.data ?? [];
  return (
    <View>
      <Text style={styles.row}>
        {t({ en: 'Dispute', zh: '争议' })}: {latest.state}
        {underDispute ? t({ en: ' (under dispute, not verified)', zh: '（争议中，≠ 已验证）' }) : ''}
      </Text>
      {remedies.map((r) => (
        <Text key={r.remedyId} style={styles.muted}>
          {r.type}: {t(remedyLabel(r))}
        </Text>
      ))}
    </View>
  );
}

function RiskShadowRow({ soulCoreId, actionId }: { soulCoreId: string; actionId: string }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ['trust-risk-mobile', soulCoreId, actionId],
    queryFn: () => fetchRiskDecisions(soulCoreId, actionId),
    retry: 0,
  });
  if (q.isLoading || q.isError) return null;
  const decisions = q.data ?? [];
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
          {t({ en: 'Actual', zh: '实际' })}: {latest.actualDecision} · {latest.disagreement ? t({ en: 'disagrees', zh: '不一致' }) : t({ en: 'agrees', zh: '一致' })}
        </Text>
      ) : null}
    </View>
  );
}

export function TrustActionTimelineCard({ soulCoreId, actionId }: TrustActionTimelineCardProps) {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const enabled = TRUST_LOOP_MOBILE_ENABLED && !!soulCoreId && !!actionId;
  const q = useQuery({
    queryKey: ['trust-timeline-mobile', soulCoreId, actionId],
    queryFn: () => fetchTrustTimeline(soulCoreId as string, actionId as string),
    enabled,
    retry: 0, // 404（flag 关）不重试
  });

  if (!enabled) return null;

  if (q.isLoading) {
    return (
      <View style={styles.card} testID="trust-timeline-mobile-loading">
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (q.isError) {
    return (
      <View style={styles.card} testID="trust-timeline-mobile-error">
        <Text style={styles.muted}>
          {t({ en: 'Trust Loop view unavailable (disabled or unauthorized).', zh: '信任闭环视图不可用（未启用或无权）。' })}
        </Text>
      </View>
    );
  }

  const timeline = q.data;
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

      <RiskShadowRow soulCoreId={soulCoreId as string} actionId={actionId as string} />

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
          <OutcomeVerificationRow soulCoreId={soulCoreId as string} outcomeId={outcome.outcomeId} />
          <OutcomeDisputeRow soulCoreId={soulCoreId as string} outcomeId={outcome.outcomeId} />
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
