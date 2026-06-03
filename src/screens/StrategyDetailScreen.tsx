import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { personalApi } from '../services/api';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';

type RootStackParamList = {
  StrategyDetail: {
    strategyId: string;
    strategyName: string;
    apy: string;
    riskLevel: string;
    description?: string;
    minDeposit?: number;
    totalDeposited?: number;
  };
};

type Props = NativeStackScreenProps<RootStackParamList, 'StrategyDetail'>;

type ActionMode = 'deposit' | 'withdraw' | null;

export default function StrategyDetailScreen({ route, navigation }: Props) {
  const { 
    strategyId, 
    strategyName, 
    apy, 
    riskLevel, 
    description = '该策略通过智能合约自动执行投资操作，优化收益并控制风险。',
    minDeposit = 100,
    totalDeposited = 0,
  } = route.params;

  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [myDeposit, setMyDeposit] = useState(totalDeposited);
  const [isEnabled, setIsEnabled] = useState(true);

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low':
      case '低':
        return colors.success;
      case 'medium':
      case '中':
        return colors.warning;
      case 'high':
      case '高':
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      Alert.alert('错误', '请输入有效金额');
      return;
    }
    if (depositAmount < minDeposit) {
      Alert.alert('错误', `最低存入金额为 $${minDeposit}`);
      return;
    }

    setLoading(true);
    try {
      // 调用后端 API（模拟）
      await new Promise(resolve => setTimeout(resolve, 1500));
      setMyDeposit(prev => prev + depositAmount);
      setAmount('');
      setActionMode(null);
      Alert.alert('成功', `已存入 $${depositAmount.toFixed(2)} 到 ${strategyName}`);
    } catch (error) {
      Alert.alert('失败', '存入操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      Alert.alert('错误', '请输入有效金额');
      return;
    }
    if (withdrawAmount > myDeposit) {
      Alert.alert('错误', '提取金额不能超过已存入金额');
      return;
    }

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setMyDeposit(prev => prev - withdrawAmount);
      setAmount('');
      setActionMode(null);
      Alert.alert('成功', `已从 ${strategyName} 提取 $${withdrawAmount.toFixed(2)}`);
    } catch (error) {
      Alert.alert('失败', '提取操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStrategy = async () => {
    setLoading(true);
    try {
      await personalApi.toggleStrategy(strategyId, !isEnabled);
      setIsEnabled(!isEnabled);
      Alert.alert('成功', `策略已${!isEnabled ? '启用' : '暂停'}`);
    } catch (error) {
      // 模拟成功
      setIsEnabled(!isEnabled);
      Alert.alert('成功', `策略已${!isEnabled ? '启用' : '暂停'}`);
    } finally {
      setLoading(false);
    }
  };

  const estimatedDailyReturn = (myDeposit * parseFloat(apy.replace('%', '')) / 100 / 365).toFixed(2);
  const estimatedMonthlyReturn = (myDeposit * parseFloat(apy.replace('%', '')) / 100 / 12).toFixed(2);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 策略概览 */}
        <Card style={styles.overviewCard}>
          <View style={styles.headerRow}>
            <Text style={styles.strategyName}>{strategyName}</Text>
            <View style={[styles.riskBadge, { backgroundColor: getRiskColor(riskLevel) + '20' }]}>
              <Text style={[styles.riskText, { color: getRiskColor(riskLevel) }]}>
                {riskLevel} 风险
              </Text>
            </View>
          </View>
          <Text style={styles.description}>{description}</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>年化收益</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{apy}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>最低存入</Text>
              <Text style={styles.statValue}>${minDeposit}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>状态</Text>
              <Text style={[styles.statValue, { color: isEnabled ? colors.success : colors.textSecondary }]}>
                {isEnabled ? '运行中' : '已暂停'}
              </Text>
            </View>
          </View>
        </Card>

        {/* 我的持仓 */}
        <Card style={styles.positionCard}>
          <Text style={styles.cardTitle}>我的持仓</Text>
          <Text style={styles.depositAmount}>${myDeposit.toFixed(2)}</Text>
          
          {myDeposit > 0 && (
            <View style={styles.returnsRow}>
              <View style={styles.returnItem}>
                <Text style={styles.returnLabel}>预计日收益</Text>
                <Text style={styles.returnValue}>+${estimatedDailyReturn}</Text>
              </View>
              <View style={styles.returnItem}>
                <Text style={styles.returnLabel}>预计月收益</Text>
                <Text style={styles.returnValue}>+${estimatedMonthlyReturn}</Text>
              </View>
            </View>
          )}

          {!actionMode ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.depositBtn]}
                onPress={() => setActionMode('deposit')}
              >
                <Text style={styles.depositBtnText}>存入</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.withdrawBtn, myDeposit === 0 && styles.disabledBtn]}
                onPress={() => setActionMode('withdraw')}
                disabled={myDeposit === 0}
              >
                <Text style={[styles.withdrawBtnText, myDeposit === 0 && styles.disabledText]}>
                  提取
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>
                {actionMode === 'deposit' ? '存入金额' : '提取金额'}
              </Text>
              <View style={styles.inputRow}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  autoFocus
                />
                {actionMode === 'withdraw' && myDeposit > 0 && (
                  <TouchableOpacity onPress={() => setAmount(myDeposit.toString())}>
                    <Text style={styles.maxBtn}>全部</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setActionMode(null);
                    setAmount('');
                  }}
                >
                  <Text style={styles.cancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, loading && styles.disabledBtn]}
                  onPress={actionMode === 'deposit' ? handleDeposit : handleWithdraw}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmBtnText}>
                      确认{actionMode === 'deposit' ? '存入' : '提取'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Card>

        {/* 策略说明 */}
        <Card style={styles.infoCard}>
          <Text style={styles.cardTitle}>策略说明</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>收益来源</Text>
            <Text style={styles.infoValue}>DeFi 流动性挖矿 + 套利</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>结算周期</Text>
            <Text style={styles.infoValue}>每日 00:00 UTC</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>提取时间</Text>
            <Text style={styles.infoValue}>即时到账</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>平台费率</Text>
            <Text style={styles.infoValue}>收益的 10%</Text>
          </View>
        </Card>

        {/* 暂停/启用按钮 */}
        <TouchableOpacity
          style={[styles.toggleBtn, loading && styles.disabledBtn]}
          onPress={handleToggleStrategy}
          disabled={loading}
        >
          <Text style={styles.toggleBtnText}>
            {isEnabled ? '暂停策略' : '启用策略'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  overviewCard: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  strategyName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  riskText: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  positionCard: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  depositAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  returnsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  returnItem: {
    flex: 1,
  },
  returnLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  returnValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.success,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  depositBtn: {
    backgroundColor: colors.primary,
  },
  depositBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  withdrawBtn: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  withdrawBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  disabledText: {
    color: colors.textSecondary,
  },
  inputSection: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    padding: 0,
  },
  maxBtn: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
  },
  toggleBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  toggleBtnText: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: '600',
  },
});
