/**
 * TwinOrderTimeline — one order's escrow path, drawn from `orderEscrowTimeline` (showcase A;
 * I-046 item 3). Read-only. A step that became done since the last read of this order fades and
 * grows in over 250 ms; nothing moves otherwise, and nothing moves when the system asks for
 * reduced motion.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { TimelineStep, TimelineStepId } from '../../services/twinOrderTimeline';

function StepRow({ item, last, animate, reduceMotion, styles }: { item: TimelineStep; last: boolean; animate: boolean; reduceMotion: boolean; styles: ReturnType<typeof makeStyles> }) {
  const { t } = useI18n();
  const progress = useRef(new Animated.Value(animate && !reduceMotion ? 0 : 1)).current;
  useEffect(() => {
    if (!animate || reduceMotion) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [animate, reduceMotion, progress]);
  const dotStyle =
    item.state === 'done'
      ? styles.dotDone
      : item.state === 'current'
        ? styles.dotCurrent
        : item.state === 'attention' || item.state === 'stopped'
          ? styles.dotAttention
          : styles.dotTodo;
  const stateText =
    item.state === 'done'
      ? t({ en: 'done', zh: '已完成' })
      : item.state === 'current'
        ? t({ en: 'in progress', zh: '进行中' })
        : item.state === 'attention'
          ? t({ en: 'needs attention', zh: '需要关注' })
          : item.state === 'stopped'
            ? t({ en: 'stopped', zh: '已停止' })
            : t({ en: 'not yet', zh: '还没到' });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <View style={styles.row} accessible accessibilityLabel={`${t(item.label)}, ${stateText}${item.note ? `, ${t(item.note)}` : ''}`} testID={`twin-order-step-${item.id}`}>
      <View style={styles.rail}>
        <Animated.View style={[styles.dot, dotStyle, { opacity: progress, transform: [{ scale }] }]}>
          {item.state === 'done' ? <Text style={styles.check}>✓</Text> : null}
        </Animated.View>
        {!last ? <View style={[styles.line, item.state === 'done' ? styles.lineDone : null]} /> : null}
      </View>
      <Animated.View style={[styles.textBlock, { opacity: progress }]}>
        <Text style={item.state === 'todo' ? styles.labelTodo : styles.label}>{t(item.label)}</Text>
        {item.at ? <Text style={styles.time}>{new Date(item.at).toLocaleString()}</Text> : null}
        {item.note ? <Text style={item.state === 'attention' || item.state === 'stopped' ? styles.noteAttention : styles.note}>{t(item.note)}</Text> : null}
      </Animated.View>
    </View>
  );
}

export function TwinOrderTimeline({ steps, justDone }: { steps: readonly TimelineStep[]; justDone: readonly TimelineStepId[] }) {
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReduceMotion();
  return (
    <View style={styles.wrap} testID="twin-order-timeline">
      {steps.map((item, index) => (
        <StepRow key={item.id} item={item} last={index === steps.length - 1} animate={justDone.includes(item.id)} reduceMotion={reduceMotion} styles={styles} />
      ))}
    </View>
  );
}

/** A thin bar for the list card: how far along the path the order is. */
export function TwinOrderProgress({ steps }: { steps: readonly TimelineStep[] }) {
  const styles = useThemedStyles(makeStyles);
  const done = steps.filter((item) => item.state === 'done').length;
  const attention = steps.some((item) => item.state === 'attention' || item.state === 'stopped');
  return (
    <View style={styles.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {steps.map((item) => (
        <View
          key={item.id}
          style={[styles.progressSegment, item.state === 'done' ? styles.segmentDone : item.state === 'current' ? styles.segmentCurrent : attention && item.state !== 'todo' ? styles.segmentAttention : null]}
        />
      ))}
      <Text style={styles.progressText}>{`${done}/${steps.length}`}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { marginTop: 4 },
    row: { flexDirection: 'row', gap: 10, minHeight: 44 },
    rail: { width: 22, alignItems: 'center' },
    dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    dotDone: { backgroundColor: c.success, borderColor: c.success },
    dotCurrent: { backgroundColor: c.bgCard, borderColor: c.accent, borderWidth: 3 },
    dotAttention: { backgroundColor: c.bgCard, borderColor: c.danger, borderWidth: 3 },
    dotTodo: { backgroundColor: c.bgCard, borderColor: c.border },
    check: { color: c.onSuccess, fontSize: 12, fontWeight: '900', lineHeight: 14 },
    line: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 2 },
    lineDone: { backgroundColor: c.success },
    textBlock: { flex: 1, paddingBottom: 12, gap: 2 },
    label: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    labelTodo: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    time: { color: c.textMuted, fontSize: 12 },
    note: { color: c.textSecondary, fontSize: 12, lineHeight: 17 },
    noteAttention: { color: c.danger, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    progressTrack: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border },
    segmentDone: { backgroundColor: c.success },
    segmentCurrent: { backgroundColor: c.accent },
    segmentAttention: { backgroundColor: c.danger },
    progressText: { color: c.textMuted, fontSize: 11, fontWeight: '700', marginLeft: 4 },
  });
