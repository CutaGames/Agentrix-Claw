// 快速收款页面（商户）
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Share } from 'react-native';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';

const mockPlans = [
  { id: '1', name: '标准 10%', rate: 10 },
  { id: '2', name: '高级 15%', rate: 15 },
  { id: '3', name: 'VIP 20%', rate: 20 },
];

export const QuickPayScreen: React.FC = () => {
  const [amount, setAmount] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(mockPlans[0]);
  const [generated, setGenerated] = useState(false);

  // 计算分佣
  const numAmount = parseFloat(amount) || 0;
  const commission = numAmount * (selectedPlan.rate / 100);
  const netAmount = numAmount - commission;

  const handleGenerate = () => {
    if (numAmount > 0) {
      setGenerated(true);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `请支付 $${numAmount.toFixed(2)} - Agentrix 收款链接: https://pay.agentrix.io/xxx`,
        title: 'Agentrix 收款',
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = () => {
    setAmount('');
    setGenerated(false);
  };

  if (generated) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.successCard}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>收款码已生成</Text>
          <Text style={styles.successAmount}>${numAmount.toFixed(2)}</Text>
        </Card>

        <Card>
          {/* 模拟二维码 */}
          <View style={styles.qrContainer}>
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrText}>📱</Text>
              <Text style={styles.qrLabel}>扫码支付</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>分佣计划</Text>
            <Text style={styles.infoValue}>{selectedPlan.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>手续费</Text>
            <Text style={styles.infoValue}>${commission.toFixed(2)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>实收金额</Text>
            <Text style={[styles.infoValue, styles.netAmount]}>${netAmount.toFixed(2)}</Text>
          </View>
        </Card>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>分享链接</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>复制链接</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>重新生成</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.sectionTitle}>收款金额</Text>
        <View style={styles.amountInputContainer}>
          <Text style={styles.currencyPrefix}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>选择分佣计划</Text>
        <View style={styles.planList}>
          {mockPlans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planItem,
                selectedPlan.id === plan.id && styles.planItemSelected,
              ]}
              onPress={() => setSelectedPlan(plan)}
            >
              <View style={styles.planRadio}>
                {selectedPlan.id === plan.id && <View style={styles.planRadioInner} />}
              </View>
              <View style={styles.planInfo}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planRate}>{plan.rate}% 分佣给推广员</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {numAmount > 0 && (
        <Card>
          <Text style={styles.sectionTitle}>分佣预览</Text>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>收款金额</Text>
            <Text style={styles.previewValue}>${numAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>分佣 ({selectedPlan.rate}%)</Text>
            <Text style={[styles.previewValue, styles.negative]}>-${commission.toFixed(2)}</Text>
          </View>
          <View style={[styles.previewRow, styles.previewTotal]}>
            <Text style={styles.previewTotalLabel}>实收金额</Text>
            <Text style={styles.previewTotalValue}>${netAmount.toFixed(2)}</Text>
          </View>
        </Card>
      )}

      <PrimaryButton 
        title="生成收款码" 
        onPress={handleGenerate}
        disabled={numAmount <= 0}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  // 金额输入
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: colors.text,
    fontSize: 48,
    fontWeight: '700',
  },
  // 计划选择
  planList: {
    gap: 8,
  },
  planItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planItemSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  planRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  planRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  planRate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  // 预览
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  previewValue: {
    color: colors.text,
    fontSize: 14,
  },
  negative: {
    color: '#f87171',
  },
  previewTotal: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewTotalLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  previewTotalValue: {
    color: '#4ade80',
    fontSize: 20,
    fontWeight: '700',
  },
  // 成功页面
  successCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  successTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  successAmount: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 8,
  },
  // 二维码
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  qrText: {
    fontSize: 64,
  },
  qrLabel: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  infoValue: {
    color: colors.text,
    fontSize: 14,
  },
  netAmount: {
    color: '#4ade80',
    fontWeight: '600',
  },
  // 操作按钮
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  copyBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  copyBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  resetBtn: {
    alignItems: 'center',
    padding: 12,
  },
  resetBtnText: {
    color: colors.muted,
    fontSize: 14,
  },
});
