/**
 * DueDiligenceScreen — submit a research target → POST /agent-ops/due-diligence/run
 * → render the structured report (sections + source links + qualified badge +
 * 「未获取」markers). Degraded / not-fetched states are surfaced honestly — the
 * agent never fabricates data (design Property 7).
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  runDueDiligence,
  type DueDiligenceInput,
  type DueDiligenceReport,
  type DueDiligenceTargetType,
  type DeliverableSection,
} from '../../services/agentOpsApi';

const TARGET_TYPES: Array<{ key: DueDiligenceTargetType; en: string; zh: string }> = [
  { key: 'token', en: 'Token', zh: '代币' },
  { key: 'wallet', en: 'Wallet', zh: '钱包' },
  { key: 'contract', en: 'Contract', zh: '合约' },
  { key: 'project', en: 'Project', zh: '项目' },
];

export function DueDiligenceScreen() {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const [targetType, setTargetType] = useState<DueDiligenceTargetType>('token');
  const [chain, setChain] = useState('');
  const [addressOrName, setAddressOrName] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DueDiligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usesName = targetType === 'project';

  const handleRun = useCallback(async () => {
    if (!addressOrName.trim()) {
      Alert.alert(
        t({ en: 'Missing input', zh: '缺少输入' }),
        usesName
          ? t({ en: 'Enter a project name.', zh: '请输入项目名称。' })
          : t({ en: 'Enter an address.', zh: '请输入地址。' }),
      );
      return;
    }
    const input: DueDiligenceInput = {
      targetType,
      chain: chain.trim() || undefined,
      address: usesName ? undefined : addressOrName.trim(),
      name: usesName ? addressOrName.trim() : undefined,
    };
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await runDueDiligence(input);
      setReport(res);
    } catch (e: any) {
      setError(e?.message || t({ en: 'Research failed.', zh: '调研失败。' }));
    } finally {
      setLoading(false);
    }
  }, [addressOrName, chain, targetType, usesName, t]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="ao-due-diligence-screen">
      {/* ── Form ── */}
      <Text style={styles.label}>{t({ en: 'Target type', zh: '目标类型' })}</Text>
      <View style={styles.segment}>
        {TARGET_TYPES.map((tt) => {
          const active = tt.key === targetType;
          return (
            <TouchableOpacity
              key={tt.key}
              style={[styles.segBtn, active && styles.segBtnActive]}
              onPress={() => setTargetType(tt.key)}
              testID={`ao-dd-type-${tt.key}`}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{t(tt)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>{t({ en: 'Chain', zh: '链' })}</Text>
      <TextInput
        style={styles.input}
        value={chain}
        onChangeText={setChain}
        placeholder={t({ en: 'e.g. ethereum, bsc, solana (optional)', zh: '如 ethereum / bsc / solana（可选）' })}
        placeholderTextColor={c.textMuted}
        autoCapitalize="none"
        testID="ao-dd-chain"
      />

      <Text style={styles.label}>{usesName ? t({ en: 'Project name', zh: '项目名称' }) : t({ en: 'Address', zh: '地址' })}</Text>
      <TextInput
        style={styles.input}
        value={addressOrName}
        onChangeText={setAddressOrName}
        placeholder={usesName ? t({ en: 'Project name', zh: '项目名称' }) : '0x… / address'}
        placeholderTextColor={c.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        testID="ao-dd-target"
      />

      <TouchableOpacity
        style={[styles.runBtn, loading && styles.runBtnDisabled]}
        onPress={handleRun}
        disabled={loading}
        testID="ao-dd-run"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.runBtnText}>🔍 {t({ en: 'Run Due Diligence', zh: '运行尽调' })}</Text>
        )}
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorBox} testID="ao-dd-error">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ── Report ── */}
      {report ? <ReportView report={report} styles={styles} t={t} /> : null}
    </ScrollView>
  );
}

function ReportView({
  report,
  styles,
  t,
}: {
  report: DueDiligenceReport;
  styles: ReturnType<typeof makeStyles>;
  t: (d: { en: string; zh: string }) => string;
}) {
  return (
    <View style={styles.report} testID="ao-dd-report">
      <View style={styles.reportHead}>
        <Text style={styles.reportTitle}>
          {report.title || t({ en: 'Due Diligence Report', zh: '尽调报告' })}
        </Text>
        <View style={[styles.badge, report.qualified ? styles.badgeOk : styles.badgeBad]}>
          <Text style={[styles.badgeText, report.qualified ? styles.badgeTextOk : styles.badgeTextBad]}>
            {report.qualified
              ? t({ en: '✓ Qualified', zh: '✓ 合格' })
              : t({ en: '✕ Not qualified', zh: '✕ 不合格' })}
          </Text>
        </View>
      </View>

      {report.degraded ? (
        <View style={styles.degradedBox} testID="ao-dd-degraded">
          <Text style={styles.degradedText}>
            ⚠️ {t({
              en: 'Some sources were unavailable. Missing data is marked 「未获取」 — nothing is fabricated.',
              zh: '部分数据源不可达。缺失项已标记「未获取」，不会编造数据。',
            })}
          </Text>
        </View>
      ) : null}

      {report.summary ? <Text style={styles.reportSummary}>{report.summary}</Text> : null}

      {(report.sections ?? []).map((section, i) => (
        <SectionView key={i} section={section} styles={styles} t={t} />
      ))}

      {report.sourceLinks?.length ? (
        <View style={styles.sources}>
          <Text style={styles.sourcesTitle}>{t({ en: 'Sources', zh: '来源' })}</Text>
          {report.sourceLinks.map((s, i) => (
            <TouchableOpacity key={i} onPress={() => Linking.openURL(s.url)} testID={`ao-dd-source-${i}`}>
              <Text style={styles.sourceLink} numberOfLines={1}>
                🔗 {s.label || s.url}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {report.generatedAt ? (
        <Text style={styles.generatedAt}>
          {t({ en: 'Generated', zh: '生成时间' })}: {new Date(report.generatedAt).toLocaleString()}
        </Text>
      ) : null}
    </View>
  );
}

function SectionView({
  section,
  styles,
  t,
}: {
  section: DeliverableSection;
  styles: ReturnType<typeof makeStyles>;
  t: (d: { en: string; zh: string }) => string;
}) {
  const NOT_FETCHED = '「未获取」';
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.notFetched ? <Text style={styles.notFetched}>{NOT_FETCHED}</Text> : null}
      </View>
      {section.notFetched ? (
        <Text style={styles.sectionMuted}>
          {t({ en: 'Source unavailable — not fetched.', zh: '数据源不可达，未获取。' })}
        </Text>
      ) : (
        <>
          {section.body ? <Text style={styles.sectionBody}>{section.body}</Text> : null}
          {section.rows?.map((row, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.value == null && styles.rowValueMissing]}>
                {row.value == null ? NOT_FETCHED : row.value}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, paddingBottom: 40, gap: 10 },
    label: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6 },
    segment: { flexDirection: 'row', gap: 8 },
    segBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
      backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border,
    },
    segBtnActive: { backgroundColor: c.accent + '22', borderColor: c.accent },
    segText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    segTextActive: { color: c.accent },
    input: {
      backgroundColor: c.input, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
    },
    runBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
    runBtnDisabled: { opacity: 0.6 },
    runBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    errorBox: { backgroundColor: c.error + '18', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: c.error + '55' },
    errorText: { color: c.error, fontSize: 13 },
    // Report
    report: { backgroundColor: c.bgCard, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border, marginTop: 8 },
    reportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    reportTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: c.textPrimary },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    badgeOk: { backgroundColor: c.success + '22', borderColor: c.success + '66' },
    badgeBad: { backgroundColor: c.error + '22', borderColor: c.error + '66' },
    badgeText: { fontSize: 11, fontWeight: '800' },
    badgeTextOk: { color: c.success },
    badgeTextBad: { color: c.error },
    degradedBox: { backgroundColor: c.warning + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.warning + '55' },
    degradedText: { color: c.warning, fontSize: 12, lineHeight: 17 },
    reportSummary: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    section: { backgroundColor: c.bgPrimary, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: c.border },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    notFetched: { fontSize: 11, fontWeight: '700', color: c.warning },
    sectionMuted: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    sectionBody: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 3 },
    rowLabel: { fontSize: 13, color: c.textMuted, flex: 1 },
    rowValue: { fontSize: 13, color: c.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
    rowValueMissing: { color: c.warning, fontWeight: '700' },
    sources: { gap: 6, marginTop: 4 },
    sourcesTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    sourceLink: { fontSize: 12, color: c.accent, paddingVertical: 2 },
    generatedAt: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  });
}
