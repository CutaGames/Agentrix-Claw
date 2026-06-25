import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Share,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { getReferralStats, getMyLinks, createShareLink, buildShareText } from '../../services/sharing.service';
import * as Clipboard from 'expo-clipboard';

export function ReferralDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['referral-stats'],
    queryFn: getReferralStats,
  });

  const { data: links, isLoading: linksLoading } = useQuery({
    queryKey: ['my-links'],
    queryFn: getMyLinks,
  });

  const handleShare = async () => {
    const link = await createShareLink({ type: 'invite' });
    const text = buildShareText('invite', { url: link.url });
    await Share.share({ message: text, url: link.url });
  };

  const handleCopy = async () => {
    const link = `https://clawlink.app/i/${user?.agentrixId}`;
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Referrals & Earnings</Text>

      {/* Stats Row */}
      {statsLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{stats?.totalReferrals ?? 0}</Text>
            <Text style={styles.statLbl}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: colors.success }]}>
              ${(stats?.totalEarnings ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.statLbl}>Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: colors.warning }]}>
              ${(stats?.pendingEarnings ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.statLbl}>Pending</Text>
          </View>
        </View>
      )}

      {/* My Referral Link */}
      <View style={styles.linkSection}>
        <Text style={styles.sectionTitle}>Your Referral Link</Text>
        <View style={styles.linkBox}>
          <Text style={styles.linkText} numberOfLines={1}>
            https://clawlink.app/i/{user?.agentrixId}
          </Text>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
            <Text style={styles.copyBtnText}>{copied ? '✅ Copied' : '📋 Copy'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>🦀 Share ClawLink (Earn 30%)</Text>
        </TouchableOpacity>
      </View>

      {/* Commission Rules */}
      <View style={styles.rulesBox}>
        <Text style={styles.rulesTitle}>💰 Commission Structure</Text>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Skill Purchase</Text>
          <Text style={styles.ruleValue}>30% commission</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Cloud Subscription</Text>
          <Text style={styles.ruleValue}>20% recurring</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>New User Referral</Text>
          <Text style={styles.ruleValue}>$5 bonus</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.ruleLabel}>Level 2 Referral</Text>
          <Text style={styles.ruleValue}>10% commission</Text>
        </View>
      </View>

      {/* Link History */}
      <Text style={styles.sectionTitle}>Share Links</Text>
      {linksLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (!links?.length) ? (
        <Text style={styles.emptyText}>Share ClawLink to create your first link!</Text>
      ) : (
        links.map((link: any) => (
          <View key={link.id} style={styles.linkRow}>
            <View>
              <Text style={styles.linkRowName}>{link.type || 'referral'}</Text>
              <Text style={styles.linkRowUrl}>clawlink.app/i/{link.shortCode}</Text>
            </View>
            <View style={styles.linkRowStats}>
              <Text style={styles.clicksText}>{link.clickCount || 0} clicks</Text>
              <Text style={styles.conversionsText}>{link.conversionCount || 0} conversions</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border },
  statVal: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  statLbl: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  linkSection: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  linkBox: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  linkText: { flex: 1, padding: 12, color: colors.accent, fontSize: 13, fontFamily: 'monospace' },
  copyBtn: { backgroundColor: colors.bgSecondary, padding: 12, justifyContent: 'center' },
  copyBtnText: { fontSize: 12, color: colors.accent, fontWeight: '600' },
  shareBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rulesBox: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
  rulesTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ruleLabel: { fontSize: 13, color: colors.textSecondary },
  ruleValue: { fontSize: 13, fontWeight: '700', color: colors.success },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: 16 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  linkRowName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, textTransform: 'capitalize' },
  linkRowUrl: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
  linkRowStats: { alignItems: 'flex-end', gap: 2 },
  clicksText: { fontSize: 12, color: colors.textSecondary },
  conversionsText: { fontSize: 12, color: colors.success },
});
