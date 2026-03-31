import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { SUPPORTED_MODELS, ModelId, ModelOption } from '../stores/settingsStore';
import { useI18n } from '../stores/i18nStore';
import { apiFetch } from '../services/api';

const { width } = Dimensions.get('window');

interface SelectEngineModalProps {
  visible: boolean;
  onClose: () => void;
  selectedModelId: ModelId;
  onSelect: (modelId: ModelId) => void;
}

interface DynamicModel extends ModelOption {
  billingType?: 'platform' | 'subscription' | 'api-key';
  providerName?: string;
}

const BILLING_BADGE: Record<string, { label: string; color: string }> = {
  platform: { label: '🆓 平台', color: '#22c55e' },
  subscription: { label: '🔄 订阅', color: '#6366f1' },
  'api-key': { label: '🔑 API', color: '#f59e0b' },
};

export function SelectEngineModal({ visible, onClose, selectedModelId, onSelect }: SelectEngineModalProps) {
  const { t } = useI18n();
  const [dynamicModels, setDynamicModels] = useState<DynamicModel[]>([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const models = await apiFetch<Array<{ id: string; label: string; provider: string; providerId: string; costTier: string; billingType?: string; positioning?: string; isDefault?: boolean }>>('/ai-providers/available-models');
        if (Array.isArray(models) && models.length > 0) {
          setDynamicModels(models.map((m) => ({
            id: m.id,
            label: m.label,
            provider: m.provider,
            icon: m.billingType === 'platform' ? '🤖' : m.billingType === 'subscription' ? '🔄' : '🔑',
            availability: 'available' as const,
            costTier: m.costTier,
            billingType: (m.billingType as DynamicModel['billingType']) || 'platform',
            providerName: m.provider,
          })));
        }
      } catch {
        // Fallback to static models
      }
    })();
  }, [visible]);

  const availableModels: DynamicModel[] = dynamicModels.length > 0
    ? dynamicModels.filter(m => m.availability === 'available')
    : SUPPORTED_MODELS.filter(m => m.availability === 'available');

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{t({ en: 'Select Engine', zh: '选择引擎' })}</Text>
          <Text style={styles.subtitle}>{t({ en: 'Choose the AI model for your agent', zh: '为您的智能体选择 AI 模型' })}</Text>

          <ScrollView style={styles.modelList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {availableModels.map((m) => {
              const isSelected = selectedModelId === m.id;
              const billing = BILLING_BADGE[m.billingType || ''] || BILLING_BADGE.platform;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modelItem, isSelected && styles.modelItemActive, { marginBottom: 12 }]}
                  onPress={() => {
                    onSelect(m.id);
                    onClose();
                  }}
                >
                  <Text style={styles.modelIcon}>{m.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.modelTextContainer}>
                      <Text style={[styles.modelLabel, isSelected && styles.modelLabelActive]} numberOfLines={1}>
                        {m.label}
                      </Text>
                      {isSelected && (
                        <Text style={styles.checkIcon}>✓</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                      <Text style={[styles.sourceBadge, { color: billing.color, borderColor: billing.color + '44' }]}>
                        {billing.label}
                      </Text>
                      {m.providerName && (
                        <Text style={styles.providerName} numberOfLines={1}>{m.providerName}</Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  content: { backgroundColor: colors.bgSecondary, width: '100%', borderRadius: 24, padding: 24, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  modelList: { maxHeight: 400, gap: 12 },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelItemActive: { borderColor: colors.accent, backgroundColor: colors.accent + '11' },
  modelIcon: { fontSize: 24, marginRight: 12 },
  modelTextContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modelLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  modelLabelActive: { color: colors.accent },
  sourceBadge: { fontSize: 10, fontWeight: '700', borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  providerName: { fontSize: 11, color: colors.textMuted },
  badge: { fontSize: 10, fontWeight: '700', color: colors.textMuted, backgroundColor: colors.bgPrimary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeActive: { color: colors.accent, backgroundColor: colors.accent + '22' },
  checkIcon: { fontSize: 18, color: colors.accent, fontWeight: 'bold' }
});