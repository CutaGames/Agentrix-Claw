/**
 * StandingGoalsCard — the goals the Agent works on in the background, on the passport screen (L8 C1, standingGoals.ts).
 * Rendered only behind EXPO_PUBLIC_STANDING_GOALS=1; renders nothing while the server switch is off.
 * Shows progress in the same words as the web and the desktop, and pause / continue / end / emergency stop.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STANDING_GOAL_NOTES_V1, describeStandingGoalV1, standingGoalActionsV1, type StandingGoalViewV1 } from '../../shared/types/standing-goal';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { STANDING_GOALS_FAILURE_COPY, StandingGoalsError, createMobileStandingGoalsClient, type MobileStandingGoalsClientV1 } from '../services/standingGoals';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';

function mobileStandingGoalsClient(): MobileStandingGoalsClientV1 {
  return createMobileStandingGoalsClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function StandingGoalsCard() {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'standing-goals'];
  const query = useQuery({ queryKey: key, queryFn: () => mobileStandingGoalsClient().list(), retry: 0 });
  const [notice, setNotice] = useState('');
  const failure = query.error instanceof StandingGoalsError ? query.error.failure : query.error ? 'unavailable' : null;
  if (failure === 'closed') return null;

  const run = async (work: (client: MobileStandingGoalsClientV1) => Promise<unknown>) => {
    try {
      await work(mobileStandingGoalsClient());
      setNotice('');
    } catch (error) {
      setNotice(STANDING_GOALS_FAILURE_COPY[error instanceof StandingGoalsError ? error.failure : 'unavailable'][lang]);
    }
    await queryClient.invalidateQueries({ queryKey: key });
  };

  return (
    <View style={styles.card} testID="standing-goals-card">
      <Text style={styles.title}>{lang === 'zh' ? '后台目标' : 'Background goals'}</Text>
      <Text style={styles.muted}>
        {lang === 'zh'
          ? '你的 Agent 隔一段时间替你推进一步。超出你设的边界、预算不够或需要你判断时，它会停下来问你。'
          : 'Your Agent moves these forward in the background. It stops and asks you when something is beyond your limits, the budget is short, or it needs your call.'}
      </Text>
      {/* L8-8 UI-3 and L7: the same three notes as the web and the desktop. */}
      {(STANDING_GOAL_NOTES_V1[lang] as readonly string[]).map((note) => (
        <Text key={note} style={styles.text}>{`· ${note}`}</Text>
      ))}
      {failure ? <Text style={styles.muted}>{STANDING_GOALS_FAILURE_COPY[failure][lang]}</Text> : null}
      {query.data && query.data.length === 0 ? <Text style={styles.muted}>{lang === 'zh' ? '还没有后台目标。' : 'No background goals yet.'}</Text> : null}
      {query.data
        ? query.data.map((goal: StandingGoalViewV1) => {
            const actions = standingGoalActionsV1(goal);
            return (
              <View key={goal.goalRef} style={styles.item}>
                <Text style={styles.strong}>{goal.title}</Text>
                <Text style={styles.text}>{describeStandingGoalV1(goal, lang)}</Text>
                {goal.lastSummary ? <Text style={styles.muted}>{goal.lastSummary}</Text> : null}
                {/* L8-8 UI-3: buttons with a 44pt touch height, not small text links. */}
                <View style={styles.actions}>
                  {actions.pause ? (
                    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void run((c) => c.pause(goal.goalRef))}>
                      <Text style={styles.link}>{lang === 'zh' ? '暂停' : 'Pause'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {actions.resume ? (
                    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void run((c) => c.resume(goal.goalRef))}>
                      <Text style={styles.link}>{lang === 'zh' ? '继续' : 'Continue'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {actions.end ? (
                    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void run((c) => c.end(goal.goalRef))}>
                      <Text style={styles.link}>{lang === 'zh' ? '结束' : 'End'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        : null}
      {query.data && query.data.length > 0 ? (
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => void run((c) => c.emergencyStop())}>
          <Text style={styles.danger}>{lang === 'zh' ? '全部紧急停止' : 'Emergency stop all'}</Text>
        </TouchableOpacity>
      ) : null}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    item: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border, paddingTop: 8, gap: 4 },
    text: { color: p.text, fontSize: 13 },
    strong: { color: p.text, fontSize: 14, fontWeight: '700' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    button: {
      minHeight: 44,
      minWidth: 64,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    link: { color: p.accent, fontSize: 14, fontWeight: '600' },
    danger: { color: p.accent, fontSize: 13, fontWeight: '700' },
    muted: { color: p.textMuted, fontSize: 13 },
  });
