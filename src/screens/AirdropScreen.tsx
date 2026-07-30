// 空投发现页面
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Linking, Modal } from 'react-native';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { themedStyles } from '../theme/useTheme';
import { useI18n } from '../stores/i18nStore';
import {
  discoverAirdrops, claimAssist, setClaimWindowReminder,
  type AirdropOpportunity, type ClaimAssistPlan,
} from '../services/agentOpsApi';

// Mock 数据
const mockAirdrops = [
  { 
    id: '1', 
    name: 'Jupiter', 
    protocol: 'Solana DEX', 
    estimatedValue: 120, 
    status: 'available',
    requirements: ['持有 SOL', '交易过 10 次'],
    expiresAt: '2026-02-15',
  },
  { 
    id: '2', 
    name: 'LayerZero', 
    protocol: 'Cross-chain', 
    estimatedValue: 80, 
    status: 'available',
    requirements: ['跨链交易 5 次', '使用过 Stargate'],
    expiresAt: '2026-03-01',
  },
  { 
    id: '3', 
    name: 'zkSync', 
    protocol: 'Ethereum L2', 
    estimatedValue: 200, 
    status: 'available',
    requirements: ['部署过合约', '交易 > $500'],
    expiresAt: '2026-02-28',
  },
  { 
    id: '4', 
    name: 'Blur', 
    protocol: 'NFT Marketplace', 
    estimatedValue: 50, 
    status: 'claimed',
    requirements: ['交易过 NFT'],
  },
];

export const AirdropScreen: React.FC = () => {
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  // ── Agent-ops-backed discovery (eligibility + claim windows) ──
  const [discovering, setDiscovering] = useState(false);
  const [opportunities, setOpportunities] = useState<AirdropOpportunity[] | null>(null);
  const [discoverDegraded, setDiscoverDegraded] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [assistPlan, setAssistPlan] = useState<ClaimAssistPlan | null>(null);
  const [assistLoading, setAssistLoading] = useState<string | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const res = await discoverAirdrops();
      setOpportunities(res.opportunities ?? []);
      setDiscoverDegraded(!!res.degraded);
    } catch (e: any) {
      setDiscoverError(e?.message || t({ en: 'Discovery failed.', zh: '发现失败。' }));
    } finally {
      setDiscovering(false);
    }
  }, [t]);

  const handleClaimAssist = useCallback(async (opp: AirdropOpportunity) => {
    setAssistLoading(opp.id);
    try {
      const plan = await claimAssist({ airdropId: opp.id });
      setAssistPlan(plan);
    } catch (e: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || t({ en: 'Could not build claim plan.', zh: '无法生成领取计划。' }));
    } finally {
      setAssistLoading(null);
    }
  }, [t]);

  const handleReminder = useCallback(async (opp: AirdropOpportunity) => {
    setReminding(opp.id);
    try {
      await setClaimWindowReminder({ airdropId: opp.id, remindAt: opp.claimWindowStart ?? undefined });
      Alert.alert(
        t({ en: 'Reminder set', zh: '已设置提醒' }),
        t({ en: 'We will remind you before the claim window.', zh: '我们会在领取窗口前提醒你。' }),
      );
    } catch (e: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || t({ en: 'Could not set reminder.', zh: '无法设置提醒。' }));
    } finally {
      setReminding(null);
    }
  }, [t]);

  const onRefresh = async () => {
    setRefreshing(true);
    await handleDiscover();
    setRefreshing(false);
  };

  const handleClaim = async (airdropId: string) => {
    setClaiming(airdropId);
    // TODO: 调用领取 API
    setTimeout(() => setClaiming(null), 2000);
  };

  const availableAirdrops = mockAirdrops.filter(a => a.status === 'available');
  const claimedAirdrops = mockAirdrops.filter(a => a.status === 'claimed');

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      testID="airdrop-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* ── Agent-discovered opportunities (eligibility + claim windows) ── */}
      <View style={styles.agentSection} testID="airdrop-agent-section">
        <Text style={styles.sectionTitle}>🤖 {t({ en: 'Agent Discovery', zh: 'Agent 发现' })}</Text>
        <Text style={styles.agentHint}>
          {t({
            en: 'Your agent scans eligibility and claim windows. The claim transaction always needs your signature — the agent never auto-claims.',
            zh: 'Agent 扫描资格与领取窗口。领取交易始终需要你签名——Agent 绝不自动领取。',
          })}
        </Text>
        <TouchableOpacity
          style={[styles.discoverBtn, discovering && { opacity: 0.6 }]}
          onPress={handleDiscover}
          disabled={discovering}
          testID="airdrop-discover-btn"
        >
          {discovering ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.discoverBtnText}>🔍 {t({ en: 'Discover airdrops', zh: '发现空投' })}</Text>
          )}
        </TouchableOpacity>

        {discoverError ? <Text style={styles.discoverError}>{discoverError}</Text> : null}

        {discoverDegraded ? (
          <Text style={styles.degradedText}>
            ⚠️ {t({ en: 'Some checks unavailable — results marked 「未获取」, nothing fabricated.', zh: '部分检查不可用——结果标记「未获取」，不会编造。' })}
          </Text>
        ) : null}

        {opportunities?.length === 0 ? (
          <Text style={styles.agentEmpty}>{t({ en: 'No opportunities found.', zh: '未发现机会。' })}</Text>
        ) : null}

        {opportunities?.map((opp) => (
          <View key={opp.id} style={styles.oppCard} testID={`airdrop-opp-${opp.id}`}>
            <View style={styles.oppHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.oppName}>{opp.projectName} {opp.tokenSymbol ? `· ${opp.tokenSymbol}` : ''}</Text>
                {opp.chain ? <Text style={styles.oppChain}>{opp.chain}</Text> : null}
              </View>
              <View style={[styles.eligPill, { backgroundColor: (opp.eligible ? colors.success : colors.muted) + '22', borderColor: (opp.eligible ? colors.success : colors.muted) + '66' }]}>
                <Text style={[styles.eligText, { color: opp.eligible ? colors.success : colors.muted }]}>
                  {opp.notFetched
                    ? '「未获取」'
                    : opp.eligible
                      ? t({ en: 'Eligible', zh: '符合资格' })
                      : t({ en: 'Not eligible', zh: '不符合' })}
                </Text>
              </View>
            </View>
            {opp.eligibilityReason ? <Text style={styles.oppReason}>{opp.eligibilityReason}</Text> : null}
            {opp.estimatedValueUsd != null ? (
              <Text style={styles.oppValue}>{t({ en: 'Est. value', zh: '预估价值' })}: ${opp.estimatedValueUsd}</Text>
            ) : null}
            {(opp.claimWindowStart || opp.claimWindowEnd) ? (
              <Text style={styles.oppWindow}>
                🗓 {t({ en: 'Claim window', zh: '领取窗口' })}:{' '}
                {opp.claimWindowStart ? new Date(opp.claimWindowStart).toLocaleDateString() : '—'}
                {' → '}
                {opp.claimWindowEnd ? new Date(opp.claimWindowEnd).toLocaleDateString() : '—'}
              </Text>
            ) : null}
            {opp.sourceLinks?.length ? (
              opp.sourceLinks.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(s.url)}>
                  <Text style={styles.oppSource} numberOfLines={1}>🔗 {s.label || s.url}</Text>
                </TouchableOpacity>
              ))
            ) : null}
            <View style={styles.oppActions}>
              <TouchableOpacity
                style={[styles.oppBtn, styles.oppAssistBtn]}
                onPress={() => handleClaimAssist(opp)}
                disabled={assistLoading === opp.id || !opp.eligible}
                testID={`airdrop-claim-assist-${opp.id}`}
              >
                {assistLoading === opp.id ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Text style={[styles.oppBtnText, { color: colors.accent }]}>🪙 {t({ en: 'Claim assist', zh: '领取协助' })}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.oppBtn, styles.oppRemindBtn]}
                onPress={() => handleReminder(opp)}
                disabled={reminding === opp.id}
                testID={`airdrop-remind-${opp.id}`}
              >
                {reminding === opp.id ? (
                  <ActivityIndicator color={colors.warning} size="small" />
                ) : (
                  <Text style={[styles.oppBtnText, { color: colors.warning }]}>⏰ {t({ en: 'Remind me', zh: '提醒我' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* 统计 */}
      <Card style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{availableAirdrops.length}</Text>
          <Text style={styles.statLabel}>可领取</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            ${availableAirdrops.reduce((sum, a) => sum + a.estimatedValue, 0)}
          </Text>
          <Text style={styles.statLabel}>预估价值</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{claimedAirdrops.length}</Text>
          <Text style={styles.statLabel}>已领取</Text>
        </View>
      </Card>

      {/* 可领取空投 */}
      <Text style={styles.sectionTitle}>🎁 可领取</Text>
      {availableAirdrops.map((airdrop) => (
        <Card key={airdrop.id}>
          <View style={styles.airdropHeader}>
            <View style={styles.airdropIcon}>
              <Text style={styles.airdropIconText}>{airdrop.name.charAt(0)}</Text>
            </View>
            <View style={styles.airdropInfo}>
              <Text style={styles.airdropName}>{airdrop.name}</Text>
              <Text style={styles.airdropProtocol}>{airdrop.protocol}</Text>
            </View>
            <View style={styles.airdropValue}>
              <Text style={styles.valueLabel}>预估</Text>
              <Text style={styles.valueAmount}>${airdrop.estimatedValue}</Text>
            </View>
          </View>
          
          <View style={styles.requirements}>
            <Text style={styles.requirementsTitle}>领取条件：</Text>
            {airdrop.requirements?.map((req, i) => (
              <Text key={i} style={styles.requirement}>✓ {req}</Text>
            ))}
          </View>

          {airdrop.expiresAt && (
            <Text style={styles.expires}>截止日期: {airdrop.expiresAt}</Text>
          )}

          <PrimaryButton 
            title={claiming === airdrop.id ? '领取中...' : '一键领取'}
            onPress={() => handleClaim(airdrop.id)}
            disabled={claiming === airdrop.id}
          />
        </Card>
      ))}

      {/* 已领取 */}
      {claimedAirdrops.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>✅ 已领取</Text>
          {claimedAirdrops.map((airdrop) => (
            <Card key={airdrop.id} style={styles.claimedCard}>
              <View style={styles.airdropHeader}>
                <View style={[styles.airdropIcon, styles.claimedIcon]}>
                  <Text style={styles.airdropIconText}>{airdrop.name.charAt(0)}</Text>
                </View>
                <View style={styles.airdropInfo}>
                  <Text style={styles.airdropName}>{airdrop.name}</Text>
                  <Text style={styles.airdropProtocol}>{airdrop.protocol}</Text>
                </View>
                <Text style={styles.claimedBadge}>已领取</Text>
              </View>
            </Card>
          ))}
        </>
      )}

      {/* ── Claim-assist plan modal (unsigned — requires user signature) ── */}
      <Modal
        visible={!!assistPlan}
        animationType="slide"
        transparent
        onRequestClose={() => setAssistPlan(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="airdrop-claim-plan">
            <Text style={styles.modalTitle}>🪙 {t({ en: 'Claim plan', zh: '领取计划' })}</Text>
            <View style={styles.signBanner} testID="airdrop-sign-required">
              <Text style={styles.signBannerText}>
                🔐 {t({
                  en: 'This is an UNSIGNED plan. The claim transaction must be signed by you in your wallet. The agent never auto-claims.',
                  zh: '这是未签名的计划。领取交易必须由你在钱包中签名。Agent 绝不自动领取。',
                })}
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {assistPlan?.steps?.map((step) => (
                <View key={step.order} style={styles.stepRow}>
                  <Text style={styles.stepOrder}>{step.order}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepDesc}>{step.description}</Text>
                    <Text style={styles.stepMeta}>
                      {step.chain ? `${step.chain}` : ''}
                      {step.estimatedGasUsd != null ? ` · ${t({ en: 'gas', zh: '手续费' })} ~$${step.estimatedGasUsd}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
              {assistPlan?.warnings?.map((w, i) => (
                <Text key={i} style={styles.warnText}>⚠️ {w}</Text>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setAssistPlan(null)}>
                <Text style={styles.modalCancelText}>{t({ en: 'Close', zh: '关闭' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSign]}
                onPress={() => {
                  Alert.alert(
                    t({ en: 'Sign in wallet', zh: '在钱包中签名' }),
                    t({
                      en: 'Open your wallet to review and sign the claim transaction. Agentrix never signs on your behalf.',
                      zh: '请打开钱包审阅并签署领取交易。Agentrix 绝不会代你签名。',
                    }),
                  );
                }}
                testID="airdrop-sign-confirm"
              >
                <Text style={styles.modalSignText}>{t({ en: 'Sign in wallet', zh: '钱包签名' })}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  // 统计
  statsCard: {
    flexDirection: 'row',
    paddingVertical: 20,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  // Section
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  // 空投卡片
  airdropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  airdropIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  claimedIcon: {
    backgroundColor: colors.muted,
  },
  airdropIconText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  airdropInfo: {
    flex: 1,
  },
  airdropName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  airdropProtocol: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  airdropValue: {
    alignItems: 'flex-end',
  },
  valueLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  valueAmount: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
  },
  // 条件
  requirements: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  requirementsTitle: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  requirement: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 4,
  },
  expires: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  // 已领取
  claimedCard: {
    opacity: 0.7,
  },
  claimedBadge: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
  // ── Agent-ops discovery section ──
  agentSection: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.accent + '33',
  },
  agentHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  discoverBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  discoverBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  discoverError: { color: colors.danger, fontSize: 13 },
  degradedText: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  agentEmpty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  oppCard: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
  oppHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  oppName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  oppChain: { color: colors.muted, fontSize: 11, marginTop: 2 },
  eligPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  eligText: { fontSize: 11, fontWeight: '800' },
  oppReason: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  oppValue: { color: '#4ade80', fontSize: 13, fontWeight: '700' },
  oppWindow: { color: colors.textSecondary, fontSize: 12 },
  oppSource: { color: colors.accent, fontSize: 12, paddingVertical: 2 },
  oppActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  oppBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', borderWidth: 1 },
  oppAssistBtn: { backgroundColor: colors.accent + '12', borderColor: colors.accent + '44' },
  oppRemindBtn: { backgroundColor: colors.warning + '12', borderColor: colors.warning + '44' },
  oppBtnText: { fontSize: 12, fontWeight: '700' },
  // ── Claim-plan modal ──
  modalOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  signBanner: { backgroundColor: colors.warning + '18', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.warning + '55' },
  signBannerText: { color: colors.warning, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  stepRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  stepOrder: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, color: '#fff', textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  stepDesc: { color: colors.text, fontSize: 13, lineHeight: 18 },
  stepMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  warnText: { color: colors.warning, fontSize: 12, marginTop: 8, lineHeight: 17 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  modalCancel: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  modalSign: { backgroundColor: colors.primary },
  modalSignText: { color: '#fff', fontSize: 15, fontWeight: '700' },
}));
