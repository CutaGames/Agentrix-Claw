/**
 * TwinHuddleFillInvitesSection — 「有人带你去」 at the top of 约个时间 (TwinHuddleListScreen, twinHuddleFill.ts). Rendered only
 * in builds with `EXPO_PUBLIC_TWIN_HUDDLE_FILL=1`: where a friend would like to bring this person, each with what it is
 * waiting for. Shows nothing when there are none, or when the server has the feature off.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_HUDDLE_KIND_LABELS_V0 } from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_FILL_INVITE_COPY, twinHuddleFillStartWords } from '../../services/twinHuddleFill';
import { mobileTwinHuddleFillClient } from '../../services/twinHuddleFillSession';
import { TWIN_HUDDLE_FILL_INVITES_QUERY_KEY } from './TwinHuddleFillInviteScreen';

type InviteNavigation = { navigate(name: 'TwinHuddleFillInvite', params: { personId: string }): void };

export function TwinHuddleFillInvitesSection() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<InviteNavigation>();
  const invites = useQuery({ queryKey: TWIN_HUDDLE_FILL_INVITES_QUERY_KEY, queryFn: () => mobileTwinHuddleFillClient().invites(), retry: false });
  if (!invites.isSuccess || invites.data.length === 0) return null;
  const now = new Date();

  return (
    <View style={styles.section} testID="twin-huddle-fill-invites">
      <Text style={styles.heading}>{t({ en: 'Friends who would like to bring you', zh: '有人带你去' })}</Text>
      {invites.data.map((item) => {
        const kind = t(TWIN_HUDDLE_KIND_LABELS_V0[item.kind]);
        const when = t(twinHuddleFillStartWords(item.startAt, now));
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={() => navigation.navigate('TwinHuddleFillInvite', { personId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`${kind} · ${when}`}
            testID={`twin-huddle-fill-invite-${item.id}`}
          >
            <Text style={styles.rowLabel}>
              {kind} · {when}
            </Text>
            <Text style={item.needsMe ? styles.rowAlert : styles.rowHint}>{t(TWIN_HUDDLE_FILL_INVITE_COPY[item.state])}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { gap: 8 },
    heading: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    row: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 4 },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    rowHint: { color: c.textMuted, fontSize: 13 },
    rowAlert: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
