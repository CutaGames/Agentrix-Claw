// 身份激活申请页面
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useIdentityStore } from '../stores/identityStore';

type Props = NativeStackScreenProps<any, any>;

const identityConfig = {
  merchant: {
    icon: '🏪',
    title: '商户身份',
    subtitle: '开通收款和分佣功能',
    fields: [
      { key: 'businessName', label: '商户名称', placeholder: '输入商户/店铺名称', required: true },
      { key: 'businessType', label: '业务类型', placeholder: '如：电商、餐饮、服务等', required: true },
      { key: 'contactName', label: '联系人姓名', placeholder: '输入联系人姓名', required: true },
      { key: 'contactPhone', label: '联系电话', placeholder: '输入手机号', required: true },
    ],
  },
  developer: {
    icon: '💻',
    title: '开发者身份',
    subtitle: '开通接单和发布 Skill 功能',
    fields: [
      { key: 'developerName', label: '开发者/团队名称', placeholder: '输入名称', required: true },
      { key: 'skills', label: '技能领域', placeholder: '如：前端开发、智能合约、设计等', required: true },
      { key: 'portfolio', label: '作品集链接', placeholder: 'GitHub / 个人网站（可选）', required: false },
      { key: 'experience', label: '工作经验', placeholder: '简要描述开发经验', required: true },
    ],
  },
};

export const IdentityActivationScreen: React.FC<Props> = ({ route, navigation }) => {
  const params = (route.params as any) || {};
  const identity = params.identity || 'merchant';
  const config = identityConfig[identity as keyof typeof identityConfig];
  const updateIdentityStatus = useIdentityStore((s) => s.updateIdentityStatus);
  
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    // 验证必填字段
    const missingFields = config.fields
      .filter((f: any) => f.required && !formData[f.key]?.trim())
      .map((f: any) => f.label);

    if (missingFields.length > 0) {
      Alert.alert('请填写必填项', missingFields.join('、'));
      return;
    }

    setSubmitting(true);
    
    // TODO: 调用 API 提交申请
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 更新状态为审核中
    updateIdentityStatus(identity, false, true);
    
    setSubmitting(false);

    Alert.alert(
      '申请已提交',
      '您的申请正在审核中，预计 1-2 个工作日内完成。审核通过后将同步到 App 和 Web 端。',
      [{ text: '好的', onPress: () => navigation.goBack() }]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 标题 */}
      <View style={styles.header}>
        <Text style={styles.icon}>{config.icon}</Text>
        <Text style={styles.title}>激活{config.title}</Text>
        <Text style={styles.subtitle}>{config.subtitle}</Text>
      </View>

      {/* 表单 */}
      <Card>
        <Text style={styles.formTitle}>填写资料</Text>
        {config.fields.map((field: any) => (
          <View key={field.key} style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {field.label}
              {field.required && <Text style={styles.required}> *</Text>}
            </Text>
            <TextInput
              style={styles.fieldInput}
              placeholder={field.placeholder}
              placeholderTextColor={colors.muted}
              value={formData[field.key] || ''}
              onChangeText={(text) => setFormData(prev => ({ ...prev, [field.key]: text }))}
            />
          </View>
        ))}
      </Card>

      {/* 说明 */}
      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>📋 审核说明</Text>
        <Text style={styles.infoText}>
          • 审核时间：1-2 个工作日{'\n'}
          • 审核通过后，App 和 Web 端将同步激活{'\n'}
          • 如有问题，可联系客服咨询
        </Text>
      </Card>

      {/* 提交按钮 */}
      <PrimaryButton
        title={submitting ? '提交中...' : '提交申请'}
        onPress={handleSubmit}
        disabled={submitting}
      />

      {/* 取消 */}
      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>取消</Text>
      </TouchableOpacity>
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
  // 头部
  header: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  // 表单
  formTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 8,
  },
  required: {
    color: '#f87171',
  },
  fieldInput: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.text,
    fontSize: 14,
  },
  // 说明
  infoCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  infoTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 22,
  },
  // 取消
  cancelBtn: {
    alignItems: 'center',
    padding: 12,
  },
  cancelText: {
    color: colors.muted,
    fontSize: 14,
  },
});
