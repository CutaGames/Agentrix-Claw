/**
 * TwinPassportVisitors — who opened one passport share link (M4-f, D21,
 * `shared/types/agent-passport-visitors.ts`). Read-only, loaded only when the
 * owner opens it under a share receipt.
 *
 * Same reading as the Web share panel (REQ-mobile-044.re-web):
 * - each Agent that proved who it was (signed request): its own passport name,
 *   or its ref when there is no name; the ref is always shown too, so a copied
 *   name cannot pass for someone else;
 * - "N more not listed" when the list was cut;
 * - every other read (humans included) is only a count;
 * - a read or decode failure says so, never "no visitors".
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readPassportShareVisitors } from '../../services/passportShares';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';

export function TwinPassportVisitors({ agentAccountId, shareId }: { agentAccountId: string; shareId: string }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const query = useQuery({
    queryKey: ['four-zone', 'passport-share-visitors', agentAccountId, shareId],
    queryFn: () => readPassportShareVisitors(agentAccountId, shareId),
    enabled: Boolean(agentAccountId && shareId),
    retry: 0,
    staleTime: 30_000,
  });
  const read = query.data;

  if (query.isLoading) return <ActivityIndicator />;
  if (!read || read.kind !== 'ready') {
    return (
      <View style={styles.box} testID={`twin-passport-visitors-unavailable-${shareId}`}>
        <Text style={styles.muted}>{t({ en: 'Visitor records cannot be read right now.', zh: '暂时读不到来访记录。' })}</Text>
        <TouchableOpacity onPress={() => void query.refetch()} accessibilityRole="button" style={styles.linkButton}>
          <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const { visitors } = read;
  const notListed = visitors.verifiedAgents - visitors.verified.length;
  const nothing = visitors.verified.length === 0 && visitors.unverifiedVisits === 0;
  return (
    <View style={styles.box} testID={`twin-passport-visitors-${shareId}`}>
      <Text style={styles.heading}>{t({ en: 'Visiting Agents', zh: '来访的 Agent' })}</Text>
      {nothing ? <Text style={styles.muted}>{t({ en: 'Nobody has opened this link in the window below.', zh: '在下面的统计期内，还没有人打开过这条链接。' })}</Text> : null}
      {visitors.verified.map((visitor) => (
        <View
          key={visitor.agentRef}
          style={styles.row}
          accessible
          accessibilityLabel={`${visitor.name ?? visitor.agentRef}, ${visitor.agentRef}, ${visitor.visits}`}
          testID={`twin-passport-visitor-${visitor.agentRef}`}
        >
          <Text style={styles.name}>
            {visitor.name ?? visitor.agentRef}
            <Text style={styles.badge}>{`  ${t({ en: 'signature verified', zh: '签名核验' })}`}</Text>
          </Text>
          <Text style={styles.muted}>
            {`${visitor.agentRef} · ${t({ en: 'first', zh: '第一次' })} ${visitor.firstSeenAt.slice(0, 10)} · ${t({ en: 'last', zh: '最近' })} ${visitor.lastSeenAt.slice(0, 10)} · ${t({ en: 'visits', zh: '次数' })} ${visitor.visits}`}
          </Text>
        </View>
      ))}
      {notListed > 0 ? (
        <Text style={styles.muted}>{t({ en: `${notListed} more not listed`, zh: `另有 ${notListed} 个没有列出` })}</Text>
      ) : null}
      {visitors.unverifiedVisits > 0 ? (
        <Text style={styles.muted} testID={`twin-passport-visitors-unverified-${shareId}`}>
          {t({ en: `${visitors.unverifiedVisits} more reads could not be tied to anyone`, zh: `另有 ${visitors.unverifiedVisits} 次读取没法确认是谁` })}
        </Text>
      ) : null}
      <Text style={styles.footer}>
        {t({
          en: `Kept ${visitors.retentionDays} days, counted from ${visitors.since.slice(0, 10)}. Human visitors are only counted; nothing that identifies them is kept.`,
          zh: `只保留 ${visitors.retentionDays} 天，从 ${visitors.since.slice(0, 10)} 起算。人类访客只计次数，不记任何能认出是谁的信息。`,
        })}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: { gap: 6, paddingTop: 4 },
    heading: { color: c.textSecondary, fontSize: 12, fontWeight: '800' },
    row: { gap: 2 },
    name: { color: c.textPrimary, fontSize: 13, fontWeight: '800' },
    badge: { color: c.success, fontSize: 11, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    footer: { color: c.textMuted, fontSize: 11, lineHeight: 16 },
    linkButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  });
