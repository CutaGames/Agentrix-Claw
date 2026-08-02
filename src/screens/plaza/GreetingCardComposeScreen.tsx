/**
 * GreetingCardComposeScreen — real implementation (Sprint C2).
 *
 * Pick a template, write a short message, send to a friend (by receiver
 * id or hint). Premium templates deduct AXP.
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
  Share,
  Pressable,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchGreetingCatalog,
  sendGreetingCard,
  GreetingTemplate,
} from '../../services/greeting.api';
import { themedStyles } from '../../theme/useTheme';

export function GreetingCardComposeScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((s) => s.activeInstance);

  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [receiverHint, setReceiverHint] = useState('');

  const catalogQ = useQuery({
    queryKey: ['greeting-catalog'],
    queryFn: fetchGreetingCatalog,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const sendMut = useMutation({
    mutationFn: sendGreetingCard,
    onSuccess: async (card) => {
      queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
      queryClient.invalidateQueries({ queryKey: ['greeting-outbox'] });
      const tmplLabel = catalogQ.data?.templates.find((x) => x.key === card.template);
      const cta = tmplLabel ? t({ en: tmplLabel.label_en, zh: tmplLabel.label_zh }) : card.template;
      try {
        await Share.share({
          message: t({
            en: `${cta} — from my Agentrix pet 🐾 ${card.share_url}`,
            zh: `${cta} —— 我的 Agentrix 主宠送你 🐾 ${card.share_url}`,
          }),
          url: card.share_url,
        });
      } catch {}
      Alert.alert(
        t({ en: 'Sent', zh: '已发送' }),
        t({
          en: `Card sent. Receiver will get ${card.axp_reward} AXP on open.`,
          zh: `贺卡已发送，对方打开后可得 ${card.axp_reward} AXP。`,
        }),
      );
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Failed', zh: '失败' }), err?.message ?? 'unknown');
    },
  });

  const onSend = useCallback(() => {
    if (!selected) return;
    if (!activeInstance?.id) {
      Alert.alert(
        t({ en: 'No pet selected', zh: '未选择主宠' }),
        t({ en: 'Activate a pet first.', zh: '请先激活主宠' }),
      );
      return;
    }
    sendMut.mutate({
      sender_pet_id: activeInstance.id,
      receiver_hint: receiverHint || undefined,
      template: selected,
      message: message || undefined,
    });
  }, [sendMut, selected, activeInstance?.id, receiverHint, message, t]);

  const templates = catalogQ.data?.templates ?? [];
  const currentTemplate = templates.find((t) => t.key === selected);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🎁 {t({ en: 'Greeting Card', zh: '宠物贺卡' })}</Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'Pick a scene, add a message. Your pet delivers it with a universal link.',
          zh: '选场景 · 写一句话 · 让主宠送达',
        })}
      </Text>

      <Text style={styles.sectionHeader}>
        {t({ en: 'Choose template', zh: '选择模板' })}
      </Text>
      {catalogQ.isLoading && templates.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : (
        <View style={styles.grid}>
          {templates.map((tmpl) => (
            <TemplateTile
              key={tmpl.key}
              template={tmpl}
              selected={selected === tmpl.key}
              onSelect={() => setSelected(tmpl.key)}
              t={t}
            />
          ))}
        </View>
      )}

      <Text style={styles.sectionHeader}>
        {t({ en: 'Your message (optional)', zh: '附带祝福（可选）' })}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={t({ en: 'Type a short message…', zh: '写一句话…' })}
        placeholderTextColor={colors.textMuted}
        value={message}
        onChangeText={setMessage}
        maxLength={200}
        multiline
      />

      <Text style={styles.sectionHeader}>
        {t({ en: 'Receiver hint (optional)', zh: '收件人提示（可选）' })}
      </Text>
      <TextInput
        style={[styles.input, { minHeight: 40 }]}
        placeholder={t({ en: 'Name or handle (just for your records)', zh: '名字或昵称（仅记录用）' })}
        placeholderTextColor={colors.textMuted}
        value={receiverHint}
        onChangeText={setReceiverHint}
        maxLength={64}
      />

      <TouchableOpacity
        style={[styles.sendBtn, !selected && styles.sendBtnDisabled]}
        onPress={onSend}
        disabled={!selected || sendMut.isPending}
      >
        {sendMut.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.sendBtnText}>
            {currentTemplate?.premium
              ? t({
                  en: `Send · -${currentTemplate.axp_cost} AXP`,
                  zh: `发送 · -${currentTemplate.axp_cost} AXP`,
                })
              : t({ en: 'Send card', zh: '发送贺卡' })}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>
        {t({
          en: 'Recipient earns AXP on open. Premium templates deduct AXP from sender.',
          zh: '收件人打开得 AXP，高级模板发送时扣 AXP。',
        })}
      </Text>
    </ScrollView>
  );
}

function TemplateTile({
  template,
  selected,
  onSelect,
  t,
}: {
  template: GreetingTemplate;
  selected: boolean;
  onSelect: () => void;
  t: any;
}) {
  return (
    <Pressable
      style={[styles.tile, selected && styles.tileSelected]}
      onPress={onSelect}
    >
      <Text style={styles.tileTitle}>
        {t({ en: template.label_en, zh: template.label_zh })}
      </Text>
      <Text style={styles.tileCategory}>{template.category}</Text>
      {template.premium ? (
        <Text style={styles.tileAxpCost}>-{template.axp_cost} AXP</Text>
      ) : (
        <Text style={styles.tileFree}>{t({ en: 'Free', zh: '免费' })}</Text>
      )}
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '47%',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  tileTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  tileCategory: { fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  tileFree: { fontSize: 11, fontWeight: '600', color: '#22c55e' },
  tileAxpCost: { fontSize: 11, fontWeight: '600', color: colors.accent },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  footer: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: 12, opacity: 0.7 },
}));
