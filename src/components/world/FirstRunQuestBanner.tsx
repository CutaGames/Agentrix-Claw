/**
 * FirstRunQuestBanner — 新手 90 秒任务进度条(把玩法串成一条引导线)。
 *
 * 放在 World tab 顶部:显示 4 步进度 + 当前下一步的一句话引导 + 一键 CTA。
 * 各步在真实完成点自动推进(firstRunStore),全部完成或用户关掉后不再显示。
 *
 * design: docs/business/FIRST_90S_WOW_FLOW.zh-CN.md
 */
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import {
  useFirstRunStore,
  nextFirstRunStep,
  FIRST_RUN_STEPS,
  FIRST_RUN_META,
  type FirstRunStep,
} from '../../stores/firstRunStore';

export function FirstRunQuestBanner() {
  const navigation = useNavigation<any>();
  const completed = useFirstRunStore((s) => s.completed);
  const dismissed = useFirstRunStore((s) => s.dismissed);
  const dismiss = useFirstRunStore((s) => s.dismiss);
  const isGuest = useAuthStore((s) => s.isGuest);

  const next = nextFirstRunStep(completed);
  const doneCount = FIRST_RUN_STEPS.filter((k) => completed[k]).length;

  const go = useCallback(
    (step: FirstRunStep) => {
      switch (step) {
        case 'create':
          navigation.navigate('WorldEngineScanner', { mode: 'quick' });
          break;
        case 'save':
          // 游客→登录;已登录但还没保存角色→去资产库
          if (isGuest) navigation.navigate('Auth', { screen: 'Login' });
          else navigation.navigate('WorldAssetInventory');
          break;
        case 'battle':
          navigation.navigate('WorldBattlePicker');
          break;
        case 'settle':
          navigation.navigate('AeonMap');
          break;
      }
    },
    [navigation, isGuest],
  );

  if (dismissed || next == null) return null;
  const meta = FIRST_RUN_META[next];

  return (
    <View style={styles.card} testID="first-run-quest-banner">
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>🎯 新手任务 · {doneCount}/{FIRST_RUN_STEPS.length}</Text>
        <TouchableOpacity onPress={dismiss} hitSlop={8}>
          <Text style={styles.dismiss}>跳过</Text>
        </TouchableOpacity>
      </View>

      {/* 步骤圆点进度 */}
      <View style={styles.dotsRow}>
        {FIRST_RUN_STEPS.map((k, i) => {
          const done = completed[k];
          const isNext = k === next;
          return (
            <React.Fragment key={k}>
              <View style={[styles.dot, done && styles.dotDone, isNext && styles.dotNext]}>
                <Text style={[styles.dotEmoji, !done && !isNext && styles.dotEmojiDim]}>
                  {done ? '✓' : FIRST_RUN_META[k].emoji}
                </Text>
              </View>
              {i < FIRST_RUN_STEPS.length - 1 ? (
                <View style={[styles.connector, done && styles.connectorDone]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>

      {/* 当前步骤引导 + CTA */}
      <Text style={styles.hint}>{meta.hint}</Text>
      <TouchableOpacity style={styles.cta} onPress={() => go(next)} activeOpacity={0.85}>
        <Text style={styles.ctaText}>{meta.emoji} {meta.cta} →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(0,212,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.35)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  dismiss: { color: colors.textMuted, fontSize: 12 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  dot: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  dotDone: { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: '#34D399' },
  dotNext: { borderColor: colors.accent, backgroundColor: 'rgba(0,212,255,0.18)' },
  dotEmoji: { fontSize: 14, color: colors.textPrimary, fontWeight: '700' },
  dotEmojiDim: { opacity: 0.5 },
  connector: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  connectorDone: { backgroundColor: '#34D399' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  cta: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#04222b', fontSize: 15, fontWeight: '800' },
});
