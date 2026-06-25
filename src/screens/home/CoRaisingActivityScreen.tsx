/**
 * CoRaisingActivityScreen — real implementation (Sprint C1).
 *
 * Shows all active + historical invites the user has created, plus each
 * invite's current feed counts.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { listMyCoRaisingInvites, CoRaisingInviteView } from '../../services/coraising.api';
import { themedStyles } from '../../theme/useTheme';

export function CoRaisingActivityScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const invitesQ = useQuery({
    queryKey: ['coraising-invites'],
    queryFn: () => listMyCoRaisingInvites(50),
    staleTime: 30_000,
    retry: 1,
  });
  const items = invitesQ.data?.items ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={invitesQ.isRefetching}
          onRefresh={() => invitesQ.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.title}>📖 {t({ en: 'Co-Raising Activity', zh: '共养活动' })}</Text>
      {invitesQ.isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>
            {t({
              en: 'No activity yet',
              zh: '暂无活动',
            })}
          </Text>
          <Text style={styles.emptyBody}>
            {t({
              en: 'Once friends start feeding your pet through co-raising invites, their activity will appear here.',
              zh: '当朋友通过共养邀请开始喂养你的宠物后，活动记录会显示在这里。',
            })}
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('CoRaisingInvite')}
          >
            <Text style={styles.emptyCtaText}>
              {t({ en: 'Create an invite', zh: '创建邀请' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        items.map((inv) => <Row key={inv.id} invite={inv} t={t} />)
      )}
    </ScrollView>
  );
}

function Row({ invite, t }: { invite: CoRaisingInviteView; t: any }) {
  const splitPct = (invite.split_bps / 100).toFixed(invite.split_bps % 100 === 0 ? 0 : 2);
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowToken}>{invite.token.slice(0, 10)}…</Text>
        <Text style={styles.rowStatus}>{invite.status}</Text>
      </View>
      <View style={styles.statsRow}>
        <Stat label={t({ en: 'Feeders', zh: '喂养者' })} value={invite.feeders_count} />
        <Stat label={t({ en: 'Feeds', zh: '喂养次数' })} value={invite.total_feeds} />
        <Stat label={t({ en: 'Split', zh: '分成' })} value={`${splitPct}%`} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyCta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowToken: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, fontFamily: 'monospace' },
  rowStatus: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.accent },
  statLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
}));
