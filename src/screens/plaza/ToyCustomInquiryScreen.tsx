/**
 * ToyCustomInquiryScreen — Sprint J #26
 *
 * L2 partner inquiry form for turning a pet into a physical toy.
 * Per toy-prd-v4 §4.1:
 *   - User selects a pet/skin to physicalize
 *   - Chooses toy type (plush / figurine / desk ornament)
 *   - Submits inquiry to partner-inquiry backend module
 *   - Backend routes to hardware team for L2 evaluation
 *
 * Backend: POST /api/v1/partner-inquiry
 */
import React, { useState, useCallback } from 'react';
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
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';
import { listSkins, type PetSkinSummary } from '../../services/mobilePetSdk';

// ── Types ────────────────────────────────────────────────────

type ToyType = 'plush' | 'figurine' | 'desk_ornament' | 'blind_box' | 'other';

interface InquiryRequest {
  skin_id: string;
  toy_type: ToyType;
  quantity_estimate: string;
  budget_range: string;
  notes: string;
  contact_method: string;
}

interface InquiryResponse {
  inquiry_id: string;
  status: 'submitted' | 'reviewing';
  message: string;
}

// ── API ──────────────────────────────────────────────────────

async function submitInquiry(request: InquiryRequest): Promise<InquiryResponse> {
  return apiFetch('/v1/partner-inquiry', {
    method: 'POST',
    body: JSON.stringify({
      type: 'toy_custom',
      ...request,
    }),
  });
}

// ── Constants ────────────────────────────────────────────────

const TOY_TYPES: Array<{ id: ToyType; emoji: string; label: { en: string; zh: string }; desc: { en: string; zh: string } }> = [
  { id: 'plush', emoji: '🧸', label: { en: 'Plush Toy', zh: '毛绒玩具' }, desc: { en: '15-30cm soft plush with NFC tag', zh: '15-30cm 软毛绒 + NFC 标签' } },
  { id: 'figurine', emoji: '🗿', label: { en: 'Figurine', zh: '潮玩手办' }, desc: { en: '8-15cm PVC/resin collectible', zh: '8-15cm PVC/树脂收藏品' } },
  { id: 'desk_ornament', emoji: '🖥️', label: { en: 'Desk Ornament', zh: '桌面摆件' }, desc: { en: 'Smart desk companion with LED + BLE', zh: '智能桌摆 LED + BLE 联动' } },
  { id: 'blind_box', emoji: '📦', label: { en: 'Blind Box Series', zh: '盲盒系列' }, desc: { en: '6-12 designs per series, NFC cards', zh: '每系列 6-12 款 + NFC 卡' } },
  { id: 'other', emoji: '💡', label: { en: 'Other / Custom', zh: '其他 / 定制' }, desc: { en: 'Describe your idea below', zh: '在下方描述你的想法' } },
];

const QUANTITY_OPTIONS = ['1-10 (prototype)', '10-100 (small batch)', '100-1000 (medium)', '1000+ (mass production)'];
const BUDGET_OPTIONS = ['< $1,000', '$1,000 - $5,000', '$5,000 - $10,000', '$10,000+'];

// ── Component ────────────────────────────────────────────────

export function ToyCustomInquiryScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  const [selectedSkin, setSelectedSkin] = useState<string>('');
  const [toyType, setToyType] = useState<ToyType | null>(null);
  const [quantity, setQuantity] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [contact, setContact] = useState('');

  const skinsQ = useQuery({
    queryKey: ['my-skins-for-toy'],
    queryFn: listSkins,
    staleTime: 60_000,
  });

  const submitMut = useMutation({
    mutationFn: submitInquiry,
    onSuccess: (result) => {
      Alert.alert(
        t({ en: '✅ Inquiry Submitted', zh: '✅ 咨询已提交' }),
        t({
          en: `ID: ${result.inquiry_id}. Our hardware team will review within 48h.`,
          zh: `编号：${result.inquiry_id}。硬件团队将在 48 小时内回复。`,
        }),
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Failed', zh: '提交失败' }), err?.message ?? 'Unknown error');
    },
  });

  const handleSubmit = useCallback(() => {
    if (!selectedSkin) {
      Alert.alert(t({ en: 'Select a skin', zh: '请选择皮肤' }));
      return;
    }
    if (!toyType) {
      Alert.alert(t({ en: 'Select toy type', zh: '请选择玩偶类型' }));
      return;
    }
    submitMut.mutate({
      skin_id: selectedSkin,
      toy_type: toyType,
      quantity_estimate: quantity || 'not specified',
      budget_range: budget || 'not specified',
      notes,
      contact_method: contact || 'in-app message',
    });
  }, [selectedSkin, toyType, quantity, budget, notes, contact, submitMut, t]);

  const skins = skinsQ.data ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🧸 {t({ en: 'Custom Toy Inquiry', zh: '定制实体玩偶' })}</Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'Turn your pet skin into a physical toy through our L2 partner program. NFC-bound, Agentrix-certified.',
          zh: '通过 L2 联名计划将你的皮肤变成实体玩偶。NFC 绑定，Agentrix 认证。',
        })}
      </Text>

      {/* Step 1: Select skin */}
      <Text style={styles.stepLabel}>1. {t({ en: 'Select Skin', zh: '选择皮肤' })}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skinScroll}>
        {skins.map((skin) => (
          <TouchableOpacity
            key={skin.id}
            style={[styles.skinCard, selectedSkin === skin.id && styles.skinCardActive]}
            onPress={() => setSelectedSkin(skin.id)}
          >
            <Text style={styles.skinEmoji}>{skin.format === 'vrm' ? '🧸' : '🐾'}</Text>
            <Text style={styles.skinName} numberOfLines={1}>{skin.display_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Step 2: Toy type */}
      <Text style={styles.stepLabel}>2. {t({ en: 'Toy Type', zh: '玩偶类型' })}</Text>
      {TOY_TYPES.map((tt) => (
        <TouchableOpacity
          key={tt.id}
          style={[styles.typeCard, toyType === tt.id && styles.typeCardActive]}
          onPress={() => setToyType(tt.id)}
        >
          <Text style={styles.typeEmoji}>{tt.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.typeLabel}>{t(tt.label)}</Text>
            <Text style={styles.typeDesc}>{t(tt.desc)}</Text>
          </View>
          {toyType === tt.id && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      ))}

      {/* Step 3: Quantity */}
      <Text style={styles.stepLabel}>3. {t({ en: 'Estimated Quantity', zh: '预估数量' })}</Text>
      <View style={styles.optionRow}>
        {QUANTITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionChip, quantity === opt && styles.optionChipActive]}
            onPress={() => setQuantity(opt)}
          >
            <Text style={[styles.optionChipText, quantity === opt && styles.optionChipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Step 4: Budget */}
      <Text style={styles.stepLabel}>4. {t({ en: 'Budget Range', zh: '预算范围' })}</Text>
      <View style={styles.optionRow}>
        {BUDGET_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionChip, budget === opt && styles.optionChipActive]}
            onPress={() => setBudget(opt)}
          >
            <Text style={[styles.optionChipText, budget === opt && styles.optionChipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Step 5: Notes */}
      <Text style={styles.stepLabel}>5. {t({ en: 'Additional Notes', zh: '补充说明' })}</Text>
      <TextInput
        style={styles.textArea}
        value={notes}
        onChangeText={setNotes}
        placeholder={t({ en: 'Any special requirements...', zh: '特殊需求...' })}
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={500}
      />

      {/* Contact */}
      <Text style={styles.stepLabel}>6. {t({ en: 'Contact Method', zh: '联系方式' })}</Text>
      <TextInput
        style={styles.input}
        value={contact}
        onChangeText={setContact}
        placeholder={t({ en: 'Email / WeChat / Telegram', zh: '邮箱 / 微信 / Telegram' })}
        placeholderTextColor={colors.textMuted}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitMut.isPending && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitMut.isPending}
      >
        {submitMut.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>
            {t({ en: 'Submit Inquiry', zh: '提交咨询' })}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>
        {t({
          en: 'L2 partner program: $5k-$10k entry fee · 15-25% GMV share · 50/50 co-branding.',
          zh: 'L2 联名计划：$5k-$10k 入场费 · 15-25% GMV 分成 · 50/50 联名。',
        })}
      </Text>
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 20 },
  stepLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginTop: 16, marginBottom: 8 },
  // Skin selection
  skinScroll: { marginBottom: 8 },
  skinCard: {
    width: 80,
    marginRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    alignItems: 'center',
  },
  skinCardActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  skinEmoji: { fontSize: 28, marginBottom: 4 },
  skinName: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  // Type cards
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  typeCardActive: { borderColor: colors.accent, backgroundColor: colors.accent + '10' },
  typeEmoji: { fontSize: 28 },
  typeLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  typeDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  checkmark: { fontSize: 18, color: colors.accent, fontWeight: '700' },
  // Options
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  optionChipText: { fontSize: 12, color: colors.textMuted },
  optionChipTextActive: { color: colors.accent, fontWeight: '600' },
  // Inputs
  textArea: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Submit
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: 12, lineHeight: 16 },
});
