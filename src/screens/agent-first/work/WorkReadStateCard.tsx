/**
 * WorkReadStateCard — the themed read-state card for the Work tab
 * (M1.2.1 / M1.2.2, MTR-R07.1–R07.3).
 *
 * Layout only. The decision of what may be shown comes from the pure
 * `reduceWorkReadState` (src/services/workReadStateDisplay.ts) and the copy
 * from `workReadStateCopy.ts`; both are covered by jest. Payload children are
 * rendered only when the reducer says `showsData`, so a screen cannot leak
 * cached data under `unknown` / `unavailable` by accident.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../../../stores/i18nStore';
import { type Palette, useThemedStyles } from '../../../theme/useTheme';
import {
  reduceWorkReadState,
  type WorkReadStateInput,
  type WorkReadStateTone,
} from '../../../services/workReadStateDisplay';
import {
  WORK_READ_STATE_NEXT_ACTION_COPY,
  workReadStateCopyFor,
} from '../../../services/workReadStateCopy';

export interface WorkReadStateCardProps {
  readonly title: string;
  readonly state: WorkReadStateInput;
  /** Rendered only when the reduced state allows payload. */
  readonly children?: React.ReactNode;
  readonly testID?: string;
  /** testID of the machine-readable state line (`state · capability · reason`). */
  readonly stateTestID?: string;
}

function toneColor(c: Palette, tone: WorkReadStateTone): string {
  switch (tone) {
    case 'ready': return c.accent;
    case 'caution': return c.warning;
    case 'blocked': return c.danger;
    case 'neutral':
    default: return c.border;
  }
}

export function WorkReadStateCard({ title, state, children, testID, stateTestID }: WorkReadStateCardProps) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const display = reduceWorkReadState(state);
  const copy = workReadStateCopyFor(display.messageKey);
  const nextAction = WORK_READ_STATE_NEXT_ACTION_COPY[display.nextAction];
  const machineLine = [display.state, display.capability, display.reason].filter(Boolean).join(' · ');

  return (
    <View style={styles.card} testID={testID} accessibilityRole="summary">
      <View style={styles.head}>
        <View style={[styles.toneDot, { backgroundColor: toneColor(styles.palette, display.tone) }]} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      {display.showsData ? children : null}

      {display.state !== 'ready' ? (
        <View style={styles.stateBlock} testID={testID ? `${testID}-state` : undefined}>
          <Text style={styles.stateTitle}>{t(copy.title)}</Text>
          <Text style={styles.cardBody}>{t(copy.body)}</Text>
          {display.showsStaleness && display.capturedAt ? (
            <Text style={styles.staleness}>
              {t({ en: 'Captured', zh: '采集于' })} {display.capturedAt}
            </Text>
          ) : null}
          {nextAction ? <Text style={styles.nextAction}>→ {t(nextAction)}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.machine} testID={stateTestID}>
        {machineLine}
      </Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return {
    palette: c,
    ...StyleSheet.create({
      card: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 15,
        borderWidth: 1,
        borderColor: c.border,
        gap: 8,
      },
      head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      toneDot: { width: 8, height: 8, borderRadius: 4 },
      cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
      stateBlock: { gap: 4 },
      stateTitle: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
      cardBody: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
      staleness: { color: c.textMuted, fontSize: 12 },
      nextAction: { color: c.accent, fontSize: 13, fontWeight: '600', marginTop: 2 },
      machine: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    }),
  };
}
