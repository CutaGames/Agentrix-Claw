// 佣金规则页 — 双层佣金架构: 平台3% + 用户可配置额外分佣（Human + Agent）
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../theme/colors';

// 示例交易金额
const EXAMPLE_AMOUNT = 100;
const PLATFORM_FEE_RATE = 3; // 平台固定3%

export function CommissionRulesScreen() {
  // 用户可配置的额外分佣比例 (同时适用于 Human 和 Agent 推荐)
  const [extraSplitRate, setExtraSplitRate] = useState(5); // 默认5%

  const platformFee = EXAMPLE_AMOUNT * (PLATFORM_FEE_RATE / 100);
  const extraPool = EXAMPLE_AMOUNT * (extraSplitRate / 100);
  const humanReferralShare = extraPool * 0.5;  // 50% 给 Human 推荐人
  const agentReferralShare = extraPool * 0.3;  // 30% 给 Agent 推荐人
  const executorShare = extraPool * 0.2;       // 20% 给执行 Agent
  const sellerNet = EXAMPLE_AMOUNT - platformFee - extraPool;

  const handleSave = () => {
    Alert.alert('已保存', `额外分佣比例已设置为 ${extraSplitRate}%\n同时适用于 Human 和 Agent 推荐`);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 双层架构概览 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 双层佣金架构</Text>
        <View style={styles.layerCard}>
          <View style={styles.layerHeader}>
            <View style={[styles.layerBadge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.layerBadgeText, { color: colors.primary }]}>Layer 1</Text>
            </View>
            <Text style={styles.layerName}>平台基础费用</Text>
          </View>
          <Text style={styles.layerDesc}>固定 {PLATFORM_FEE_RATE}% · 不可调整 · 平台运营成本</Text>
          <View style={styles.layerBar}>
            <View style={[styles.layerBarFill, { width: `${PLATFORM_FEE_RATE}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>

        <View style={[styles.layerCard, { marginTop: 10 }]}>
          <View style={styles.layerHeader}>
            <View style={[styles.layerBadge, { backgroundColor: colors.success + '20' }]}>
              <Text style={[styles.layerBadgeText, { color: colors.success }]}>Layer 2</Text>
            </View>
            <Text style={styles.layerName}>推荐分佣池</Text>
          </View>
          <Text style={styles.layerDesc}>
            用户可配置 0~15% · 同时适用于 Human 和 Agent 推荐
          </Text>
          <View style={styles.layerBar}>
            <View style={[styles.layerBarFill, { width: `${Math.min(extraSplitRate, 15) / 15 * 100}%`, backgroundColor: colors.success }]} />
          </View>
        </View>
      </View>

      {/* 分佣比例配置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ 配置额外分佣比例</Text>
        <View style={styles.configCard}>
          <View style={styles.configHeader}>
            <Text style={styles.configLabel}>额外分佣比例</Text>
            <Text style={styles.configValue}>{extraSplitRate}%</Text>
          </View>
          <View style={styles.rateControl}>
            <TouchableOpacity
              style={styles.rateBtn}
              onPress={() => setExtraSplitRate(Math.max(0, extraSplitRate - 0.5))}
            >
              <Text style={styles.rateBtnText}>−</Text>
            </TouchableOpacity>
            <View style={styles.rateBarTrack}>
              <View style={[styles.rateBarFill, { width: `${(extraSplitRate / 15) * 100}%` }]} />
            </View>
            <TouchableOpacity
              style={styles.rateBtn}
              onPress={() => setExtraSplitRate(Math.min(15, extraSplitRate + 0.5))}
            >
              <Text style={styles.rateBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.presetRow}>
            {[0, 2, 5, 8, 10, 15].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.presetChip, extraSplitRate === v && styles.presetChipActive]}
                onPress={() => setExtraSplitRate(v)}
              >
                <Text style={[styles.presetText, extraSplitRate === v && styles.presetTextActive]}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.configHint}>
            💡 此比例同时适用于 Human（人类推荐人）和 Agent（AI代理推荐人）
          </Text>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>保存设置</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 分润示意图 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 分润示意 (${EXAMPLE_AMOUNT} 交易)</Text>
        <View style={styles.architectureCard}>
          <Text style={styles.archLine}>交易金额 ${EXAMPLE_AMOUNT}</Text>
          <Text style={styles.archLine}>│</Text>
          <Text style={styles.archLine}>├── 平台费用 ({PLATFORM_FEE_RATE}%): ${platformFee.toFixed(2)}</Text>
          <Text style={styles.archLine}>│</Text>
          <Text style={[styles.archLine, { color: colors.success }]}>├── 推荐分佣池 ({extraSplitRate}%): ${extraPool.toFixed(2)}</Text>
          <Text style={[styles.archLine, { color: colors.success }]}>│   ├── 👤 Human 推荐人 (50%): ${humanReferralShare.toFixed(2)}</Text>
          <Text style={[styles.archLine, { color: '#8B5CF6' }]}>│   ├── 🤖 Agent 推荐人 (30%): ${agentReferralShare.toFixed(2)}</Text>
          <Text style={[styles.archLine, { color: colors.primary }]}>│   └── ⚡ 执行 Agent (20%): ${executorShare.toFixed(2)}</Text>
          <Text style={styles.archLine}>│</Text>
          <Text style={[styles.archLine, { color: colors.text, fontWeight: '700' }]}>└── 卖家净收入: ${sellerNet.toFixed(2)}</Text>
        </View>
      </View>

      {/* 分佣池分配说明 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔄 分佣池分配规则</Text>
        <View style={styles.splitCard}>
          <View style={styles.splitRow}>
            <View style={[styles.splitDot, { backgroundColor: colors.success }]} />
            <View style={styles.splitInfo}>
              <Text style={styles.splitName}>👤 Human 推荐人</Text>
              <Text style={styles.splitDesc}>人类用户通过分享链接带来的新用户/订单</Text>
            </View>
            <Text style={[styles.splitPercent, { color: colors.success }]}>50%</Text>
          </View>
          <View style={styles.splitRow}>
            <View style={[styles.splitDot, { backgroundColor: '#8B5CF6' }]} />
            <View style={styles.splitInfo}>
              <Text style={styles.splitName}>🤖 Agent 推荐人</Text>
              <Text style={styles.splitDesc}>AI Agent 通过自动推荐带来的新用户/订单</Text>
            </View>
            <Text style={[styles.splitPercent, { color: '#8B5CF6' }]}>30%</Text>
          </View>
          <View style={styles.splitRow}>
            <View style={[styles.splitDot, { backgroundColor: colors.primary }]} />
            <View style={styles.splitInfo}>
              <Text style={styles.splitName}>⚡ 执行 Agent</Text>
              <Text style={styles.splitDesc}>实际执行任务/提供服务的 AI Agent</Text>
            </View>
            <Text style={[styles.splitPercent, { color: colors.primary }]}>20%</Text>
          </View>
        </View>
      </View>

      {/* 结算周期 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏱️ 结算周期</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 1.5 }]}>资产类型</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>平台费</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>结算</Text>
          </View>
          {[
            { type: '技能/服务', fee: '3%', settle: 'T+3' },
            { type: '虚拟商品', fee: '3%', settle: 'T+1' },
            { type: '实物商品', fee: '3%', settle: 'T+7' },
            { type: '开发工具', fee: '3%', settle: '即时' },
          ].map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1.5, color: colors.text }]}>{row.type}</Text>
              <Text style={styles.tableCell}>{row.fee}</Text>
              <Text style={[styles.tableCell, { color: colors.success }]}>{row.settle}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* FAQ */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>❓ 常见问题</Text>
        <View style={styles.faqCard}>
          <Text style={styles.faqQ}>Q: 平台费和分佣池有什么区别？</Text>
          <Text style={styles.faqA}>A: 平台费固定3%用于平台运营，分佣池由卖家自行设置（0~15%），用于激励推荐人和Agent。</Text>
        </View>
        <View style={styles.faqCard}>
          <Text style={styles.faqQ}>Q: Human 和 Agent 推荐人的分佣规则一样吗？</Text>
          <Text style={styles.faqA}>A: 是的！同一个分佣池同时适用于人类推荐人和AI Agent推荐人，确保公平激励。</Text>
        </View>
        <View style={styles.faqCard}>
          <Text style={styles.faqQ}>Q: 设置0%分佣会怎样？</Text>
          <Text style={styles.faqA}>A: 仅收取平台3%基础费用，无推荐奖励。但建议设置适当分佣以获得更多曝光和推荐。</Text>
        </View>
        <View style={styles.faqCard}>
          <Text style={styles.faqQ}>Q: 佣金通过什么方式结算？</Text>
          <Text style={styles.faqA}>A: 所有佣金通过智能合约自动结算，链上透明可查。支持 Commission.sol (Agent层) 和 CommissionV2.sol (Human层)。</Text>
        </View>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: { padding: 16 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  // Layer cards
  layerCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  layerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  layerBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  layerBadgeText: { fontSize: 11, fontWeight: '700' },
  layerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  layerDesc: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 8 },
  layerBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  layerBarFill: { height: 6, borderRadius: 3 },
  // Config
  configCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  configHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  configLabel: { fontSize: 14, color: colors.text, fontWeight: '600' },
  configValue: { fontSize: 22, fontWeight: '800', color: colors.success },
  rateControl: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  rateBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rateBtnText: { fontSize: 20, color: colors.text, fontWeight: '600' },
  rateBarTrack: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  rateBarFill: { height: 8, backgroundColor: colors.success, borderRadius: 4 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  presetChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  presetChipActive: { backgroundColor: colors.success + '20', borderColor: colors.success },
  presetText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  presetTextActive: { color: colors.success },
  configHint: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 12 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Architecture diagram
  architectureCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  archLine: { color: colors.muted, fontSize: 12, fontFamily: 'monospace', lineHeight: 20 },
  // Split rows
  splitCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 12 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitDot: { width: 10, height: 10, borderRadius: 5 },
  splitInfo: { flex: 1 },
  splitName: { fontSize: 14, fontWeight: '600', color: colors.text },
  splitDesc: { fontSize: 11, color: colors.muted, marginTop: 2 },
  splitPercent: { fontSize: 18, fontWeight: '800' },
  // Table
  table: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.cardAlt, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeaderText: { color: colors.text, fontWeight: '600' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableCell: { flex: 1, color: colors.muted, fontSize: 13 },
  // FAQ
  faqCard: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  faqQ: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  faqA: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
