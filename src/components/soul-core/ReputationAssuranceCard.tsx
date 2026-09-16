/**
 * ReputationAssuranceCard — TL-04.4 (A 线) 移动端只读情境信誉/保障卡片。
 *
 * 消费后端 canonical ReputationCardV1 / AssuranceProfileV1（同 shared 契约与 Web 一致）。
 * 由 `TRUST_LOOP_MOBILE_ENABLED` 门控。诚实规则：无卡/不足样本 → insufficient/limited/unknown
 * （绝不以默认值制造高信誉）；硬件保障与经济保障各自独立呈现，不并入行为信誉。只读。
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchReputationCard,
  fetchAssuranceProfile,
  TRUST_LOOP_MOBILE_ENABLED,
} from '../../services/trustLoopApi';
import type { ReputationContext } from '../../../shared/types/trust-loop-contracts';

interface ReputationAssuranceCardProps {
  soulCoreId?: string;
  subjectKind?: string;
  subjectId?: string;
  context?: ReputationContext;
}

export function ReputationAssuranceCard({ soulCoreId, subjectKind = 'agent', subjectId, context }: ReputationAssuranceCardProps) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const enabled = TRUST_LOOP_MOBILE_ENABLED && !!soulCoreId && !!subjectId;

  const repQ = useQuery({
    queryKey: ['trust-reputation-mobile', soulCoreId, subjectKind, subjectId, context],
    queryFn: () => fetchReputationCard(soulCoreId as string, subjectKind, subjectId as string, context),
    enabled,
    retry: 0,
  });
  const asrQ = useQuery({
    queryKey: ['trust-assurance-mobile', soulCoreId, subjectKind, subjectId],
    queryFn: () => fetchAssuranceProfile(soulCoreId as string, subjectKind, subjectId as string),
    enabled,
    retry: 0,
  });

  if (!enabled) return null;

  const card = repQ.isError ? null : repQ.data ?? null;
  const assurance = asrQ.isError ? null : asrQ.data ?? null;

  return (
    <View style={styles.wrap} testID="trust-reputation-mobile">
      {card ? (
        <View style={styles.card} testID="trust-reputation-mobile-card">
          <Text style={styles.title}>{t({ en: 'Contextual reputation', zh: '情境信誉（无全局分）' })}</Text>
          <Text style={styles.chipMuted}>{card.uncertainty.status}</Text>
          <Text style={styles.muted}>
            {t({ en: 'Sample', zh: '样本' })}: {card.sample.total} · v{card.sample.verified} · d{card.sample.disputed} · r{card.sample.remedied}
          </Text>
          {card.dimensions.map((d) => (
            <Text key={d.dimension} style={styles.row}>
              {d.dimension}: {d.value === null ? t({ en: 'insufficient', zh: '样本不足' }) : `${d.value} (n=${d.sampleSize})`}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.card} testID="trust-reputation-mobile-empty">
          <Text style={styles.title}>{t({ en: 'Contextual reputation', zh: '情境信誉' })}</Text>
          <Text style={styles.chipMuted}>insufficient_evidence</Text>
          <Text style={styles.muted}>
            {t({ en: 'Not enough evidence. Absence is not high reputation.', zh: '暂无足够证据。空白不代表高信誉。' })}
          </Text>
        </View>
      )}

      {assurance ? (
        <View style={styles.card} testID="trust-assurance-mobile">
          <Text style={styles.title}>{t({ en: 'Assurance (not reputation)', zh: '保障画像（非行为信誉）' })}</Text>
          {assurance.profile.enforcementLayers.map((l, i) => (
            <Text key={`${l.layer}-${i}`} style={styles.row}>
              {l.layer}: {l.state}
            </Text>
          ))}
          <Text style={styles.muted}>
            {t({ en: 'Economic assurance (separate)', zh: '经济保障（独立）' })}: escrow {assurance.economicAssurance.escrowRefs.length} · insurance {assurance.economicAssurance.insuranceRefs.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    card: { backgroundColor: c.card, borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 4 },
    title: { color: c.text, fontWeight: '700', fontSize: 14 },
    row: { color: c.text, fontSize: 12 },
    muted: { color: c.textSecondary, fontSize: 12 },
    chipMuted: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
  });
}
