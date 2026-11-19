/**
 * TwinFindDatingSwitch — 分身 → 帮我找人 → 「找对象：我也在找」 (twinFind.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_FIND_DATING=1`. The person's own switch, off until they turn it on. While it is on, a friend who picks
 * them for someone looking for a partner has the platform ask them in the app; while it is off the platform never contacts
 * them about dating. The friend who picked them can tell that it is on, so that sentence sits right under the switch.
 * Turning it off always works, also while the server has dating switched off.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_FIND_DATING_OPEN_NOTICE_V0 } from '../../../shared/types/twin-find';
import { mobileTwinFindClient } from '../../services/twinFindSession';
import { TWIN_FIND_DATING_SWITCH_WORDS, twinFindDatingSwitchFailureWords, twinFindFailureWords, type TwinFindWords } from '../../services/twinFindView';

const KEY = ['twin-find', 'profile'];

export function TwinFindDatingSwitch() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<TwinFindWords | null>(null);
  const profile = useQuery({ queryKey: KEY, queryFn: () => mobileTwinFindClient().profile() });
  const save = useMutation({
    mutationFn: (open: boolean) => mobileTwinFindClient().setDatingOpen(open),
    onSuccess: (saved) => {
      setProblem(null);
      queryClient.setQueryData(KEY, saved);
    },
    onError: (error) => setProblem(twinFindDatingSwitchFailureWords(error)),
  });
  const label = t(TWIN_FIND_DATING_SWITCH_WORDS);

  return (
    <View style={styles.card} testID="twin-find-dating-switch">
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        {profile.isPending ? (
          <ActivityIndicator />
        ) : (
          <Switch
            value={profile.data ? profile.data.datingOpen : false}
            onValueChange={(open) => save.mutate(open)}
            disabled={!profile.data || save.isPending}
            accessibilityLabel={label}
            testID="twin-find-dating-open"
          />
        )}
      </View>
      <Text style={styles.muted}>{t(TWIN_FIND_DATING_OPEN_NOTICE_V0)}</Text>
      {profile.isError ? (
        <Text style={styles.problem} testID="twin-find-dating-error">
          {t(twinFindFailureWords(profile.error))}
        </Text>
      ) : null}
      {problem ? (
        <Text style={styles.problem} testID="twin-find-dating-problem">
          {t(problem)}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 6 },
    head: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    label: { flex: 1, color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  });
