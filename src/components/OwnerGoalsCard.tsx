/**
 * OwnerGoalsCard — 进行中 on the passport screen (L6-3, ownerGoals.ts). Rendered only behind EXPO_PUBLIC_OWNER_GOALS=1;
 * renders nothing while the server switch is off. Follow-up cards (v1, EXPO_PUBLIC_OWNER_FOLLOW_UPS=1) and due check-in
 * cards first, then active goals, then a short add form. A follow-up is only ever copied by the owner, never sent.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import {
  OWNER_FOLLOW_UPS_ENABLED,
  OWNER_GOALS_FAILURE_COPY,
  OwnerGoalsError,
  createMobileOwnerGoalsClient,
  ownerFollowUpCopy,
  ownerGoalCheckInAt,
  type MobileOwnerGoalsClientV0,
} from '../services/ownerGoals';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

type Preset = 'none' | 'tomorrow' | 'next_week';
const PRESETS: ReadonlyArray<{ id: Preset; zh: string; en: string }> = [
  { id: 'none', zh: '不设复盘', en: 'No check-in' },
  { id: 'tomorrow', zh: '明天这时', en: 'Tomorrow' },
  { id: 'next_week', zh: '一周后', en: 'In a week' },
];

function mobileOwnerGoalsClient(): MobileOwnerGoalsClientV0 {
  return createMobileOwnerGoalsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function OwnerGoalsCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'owner-goals'];
  const query = useQuery({ queryKey: key, queryFn: () => mobileOwnerGoalsClient().list(), retry: 0 });
  // A failed or closed follow-up read shows nothing extra; the goals stay as they are.
  const followUps = useQuery({
    queryKey: ['four-zone', 'owner-follow-ups'],
    queryFn: () => mobileOwnerGoalsClient().followUps(),
    enabled: OWNER_FOLLOW_UPS_ENABLED,
    retry: 0,
  });
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState<Preset>('tomorrow');
  const [notice, setNotice] = useState('');

  const failure = query.error instanceof OwnerGoalsError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const run = async (action: () => Promise<unknown>, done = '') => {
    try {
      await action();
      setNotice(done);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      setNotice(OWNER_GOALS_FAILURE_COPY[error instanceof OwnerGoalsError ? error.failure : 'unavailable'][lang]);
    }
  };

  const add = () =>
    run(async () => {
      await mobileOwnerGoalsClient().create({ title, ...(preset === 'none' ? {} : { checkInAt: ownerGoalCheckInAt(preset, new Date()) }) });
      setTitle('');
    });

  const data = query.data;
  return (
    <View style={styles.card} testID="owner-goals-card">
      <Text style={styles.title}>{lang === 'zh' ? '进行中' : 'In progress'}</Text>
      {failure ? <Text style={styles.muted}>{OWNER_GOALS_FAILURE_COPY[failure][lang]}</Text> : null}
      {followUps.data?.cards.map((card) => (
        <View key={card.cardId} style={styles.row} testID="owner-follow-up-card">
          <Text style={styles.text}>{ownerFollowUpCopy(card, (iso) => new Date(iso).toLocaleString())[lang]}</Text>
          {card.draft ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void Clipboard.setStringAsync(card.draft![lang]).then(() => setNotice(lang === 'zh' ? '已复制跟进草稿。' : 'Follow-up copied.'))}
            >
              <Text style={styles.link}>{lang === 'zh' ? '复制跟进草稿' : 'Copy follow-up'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {data?.cards.map((card) => (
        <View key={card.cardId} style={styles.row}>
          <Text style={styles.text}>{lang === 'zh' ? `⏰ 该复盘了：${card.title}` : `⏰ Time to check in: ${card.title}`}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void run(() => mobileOwnerGoalsClient().update(card.goalId, { status: 'done' }))}>
            <Text style={styles.link}>{lang === 'zh' ? '标为完成' : 'Mark done'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {data?.goals
        .filter((goal) => goal.status === 'active')
        .map((goal) => (
          <View key={goal.goalId} style={styles.row}>
            <Text style={styles.text}>
              {goal.title}
              {goal.checkInAt ? ` · ${new Date(goal.checkInAt).toLocaleString()}` : ''}
            </Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => void run(() => mobileOwnerGoalsClient().update(goal.goalId, { status: 'archived' }))}>
              <Text style={styles.muted}>{lang === 'zh' ? '归档' : 'Archive'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        placeholder={lang === 'zh' ? '新目标' : 'New goal'}
        style={styles.input}
        accessibilityLabel={lang === 'zh' ? '新目标' : 'New goal'}
      />
      <View style={styles.presets}>
        {PRESETS.map((option) => (
          <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityState={{ selected: preset === option.id }} onPress={() => setPreset(option.id)}>
            <Text style={preset === option.id ? styles.presetOn : styles.preset}>{option[lang]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={!title.trim()} onPress={() => void add()}>
        <Text style={[styles.link, !title.trim() ? styles.disabled : null]}>{lang === 'zh' ? '添加' : 'Add'}</Text>
      </TouchableOpacity>
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    text: { flex: 1, color: p.text, fontSize: 13 },
    input: { color: p.text, borderWidth: 1, borderColor: p.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    presets: { flexDirection: 'row', gap: 12 },
    preset: { color: p.textMuted, fontSize: 13 },
    presetOn: { color: p.accent, fontSize: 13, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
    link: { color: p.accent, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.4 },
  });
