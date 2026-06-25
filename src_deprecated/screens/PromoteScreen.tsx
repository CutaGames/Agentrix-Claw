// 推广总览页 — V2: QR码 + ShareSheet + 今日数据 + Clipboard
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { colors } from '../theme/colors';
import { referralApi, ReferralStats, ReferralLink } from '../services/referral.api';
import { marketplaceApi, SkillItem } from '../services/marketplace.api';
import { QrCode } from '../components/common/QrCode';
import { ShareSheet } from '../components/promote/ShareSheet';

// Clipboard — graceful fallback
let Clipboard: any = null;
try { Clipboard = require('expo-clipboard'); } catch { /* not installed */ }

interface Props {
  navigation: any;
}

export function PromoteScreen({ navigation }: Props) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [myLink, setMyLink] = useState('');
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [hotSkills, setHotSkills] = useState<SkillItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ name: string; shortUrl: string; price?: number; priceUnit?: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [statsData, linkData, linksData, trending] = await Promise.all([
        referralApi.getStats(),
        referralApi.getMyLink(),
        referralApi.getMyLinks(),
        marketplaceApi.getTrending(3),
      ]);
      setStats(statsData);
      setMyLink(linkData);
      setLinks(linksData);
      setHotSkills(trending);
    } catch (e) {
      console.error('Failed to load promote data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleCopyLink = async () => {
    try {
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(myLink);
        Alert.alert('Copied', 'Referral link copied to clipboard');
      } else {
        Alert.alert('Referral Link', myLink);
      }
    } catch {
      Alert.alert('Copy Failed');
    }
  };

  const handleOpenShare = () => {
    setShareTarget({ name: 'Agentrix Marketplace', shortUrl: myLink });
    setShowShare(true);
  };

  const handleShareSkill = async (skill: SkillItem) => {
    try {
      const link = await referralApi.createLink({
        name: skill.name,
        targetType: 'skill',
        targetId: skill.id,
      });
      setShareTarget({
        name: skill.name,
        shortUrl: link.shortUrl,
        price: skill.price,
        priceUnit: skill.priceUnit,
      });
      setShowShare(true);
    } catch {
      // Fallback to native share
      const text = referralApi.generateShareText();
      await Share.share({ message: text });
    }
  };

  const formatMoney = (n: number | string) => {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(2) + 'W';
    return v.toFixed(2);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 今日数据高亮 */}
        <View style={styles.todayBanner}>
          <Text style={styles.todayLabel}>Today</Text>
          <View style={styles.todayStats}>
            <View style={styles.todayStat}>
              <Text style={styles.todayValue}>{stats?.todayClicks ?? 0}</Text>
              <Text style={styles.todayStatLabel}>Clicks</Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayStat}>
              <Text style={styles.todayValue}>{stats?.todayConversions ?? 0}</Text>
              <Text style={styles.todayStatLabel}>Conversions</Text>
            </View>
          </View>
        </View>

        {/* 统计卡片 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats?.totalInvites ?? '-'}</Text>
            <Text style={styles.statLabel}>Invites</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats ? formatMoney(stats.totalClicks).replace('.00', '') : '-'}</Text>
            <Text style={styles.statLabel}>Clicks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats ? stats.conversionRate + '%' : '-'}</Text>
            <Text style={styles.statLabel}>Conv. Rate</Text>
          </View>
        </View>

        {/* 累计佣金 */}
        <View style={styles.commissionCard}>
          <View style={styles.commissionRow}>
            <View>
              <Text style={styles.commissionLabel}>Total Commission</Text>
              <Text style={styles.commissionValue}>
                $ {stats ? formatMoney(stats.totalCommission) : '0.00'}
              </Text>
            </View>
            <View style={styles.commissionPendingBox}>
              <Text style={styles.commissionPendingLabel}>Pending</Text>
              <Text style={styles.commissionPendingValue}>
                $ {stats ? formatMoney(stats.pendingCommission) : '0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* 专属推广链接 + QR码 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Referral Link</Text>
          <View style={styles.linkCard}>
            <TouchableOpacity onPress={handleCopyLink} activeOpacity={0.7}>
              <Text style={styles.linkUrl} numberOfLines={1}>{myLink}</Text>
            </TouchableOpacity>

            {/* QR 码 */}
            <View style={styles.qrContainer}>
              <QrCode value={myLink || 'https://agentrix.top'} size={140} />
              <Text style={styles.qrLabel}>Scan to promote</Text>
            </View>

            {/* 操作按钮 */}
            <View style={styles.linkActions}>
              <TouchableOpacity style={styles.linkActionBtn} onPress={handleCopyLink}>
                <Text style={styles.linkActionIcon}>📋</Text>
                <Text style={styles.linkActionText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkActionBtn} onPress={handleOpenShare}>
                <Text style={styles.linkActionIcon}>📱</Text>
                <Text style={styles.linkActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkActionBtn} onPress={handleOpenShare}>
                <Text style={styles.linkActionIcon}>💬</Text>
                <Text style={styles.linkActionText}>Social</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkActionBtn}
                onPress={() => navigation.navigate('MyLinks')}
              >
                <Text style={styles.linkActionIcon}>🔗</Text>
                <Text style={styles.linkActionText}>Links</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 快速推广热门技能 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promote Trending Skills</Text>
          <View style={styles.hotSkillsRow}>
            {hotSkills.map(skill => (
              <TouchableOpacity
                key={skill.id}
                style={styles.hotSkillCard}
                onPress={() => handleShareSkill(skill)}
              >
                <Text style={styles.hotSkillName} numberOfLines={1}>{skill.name}</Text>
                <Text style={styles.hotSkillStats}>
                  {Number(skill.usageCount) > 1000 ? (Number(skill.usageCount) / 1000).toFixed(1) + 'K' : skill.usageCount} users
                </Text>
                <Text style={styles.hotSkillCommission}>
                  Commission ${(Number(skill.price || 0) * 0.01).toFixed(4)}/call
                </Text>
                <View style={styles.hotSkillActionBtn}>
                  <Text style={styles.hotSkillAction}>Promote</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 我的链接 (前3条) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Referral Links</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyLinks')}>
              <Text style={styles.seeAll}>See All ›</Text>
            </TouchableOpacity>
          </View>
          {links.slice(0, 3).map(link => (
            <View key={link.id} style={styles.linkItem}>
              <View style={styles.linkItemLeft}>
                <Text style={styles.linkItemName}>{link.name}</Text>
                <Text style={styles.linkItemUrl} numberOfLines={1}>{link.shortUrl}</Text>
              </View>
              <View style={styles.linkItemRight}>
                <Text style={styles.linkItemStat}>{link.clicks} clicks</Text>
                <Text style={styles.linkItemCommission}>${Number(link.commission || 0).toFixed(2)}</Text>
              </View>
            </View>
          ))}
          {links.length === 0 && !loading && (
            <View style={styles.emptyLinks}>
              <Text style={styles.emptyLinksText}>No referral links yet — find skills to promote in the marketplace</Text>
            </View>
          )}
        </View>

        {/* 佣金规则入口 */}
        <TouchableOpacity
          style={styles.rulesBtn}
          onPress={() => navigation.navigate('CommissionRules')}
        >
          <Text style={styles.rulesBtnText}>Commission Rules</Text>
          <Text style={styles.rulesBtnArrow}>›</Text>
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ShareSheet Modal */}
      {shareTarget && (
        <ShareSheet
          visible={showShare}
          onClose={() => setShowShare(false)}
          target={shareTarget}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Today banner
  todayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary + '15',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  todayLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayStat: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  todayValue: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  todayStatLabel: {
    color: colors.primary,
    fontSize: 11,
    opacity: 0.7,
    marginTop: 2,
  },
  todayDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.primary + '30',
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  // Commission
  commissionCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commissionLabel: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  commissionValue: {
    color: colors.success,
    fontSize: 28,
    fontWeight: '800',
  },
  commissionPendingBox: {
    backgroundColor: colors.warning + '15',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  commissionPendingLabel: {
    color: colors.warning,
    fontSize: 11,
    marginBottom: 2,
  },
  commissionPendingValue: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: '700',
  },
  // Section
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  seeAll: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
  },
  // Link card
  linkCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkUrl: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 14,
    textDecorationLine: 'underline',
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 14,
  },
  qrLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  linkActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  linkActionBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  linkActionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  linkActionText: {
    color: colors.muted,
    fontSize: 11,
  },
  // Hot skills
  hotSkillsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  hotSkillCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  hotSkillName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  hotSkillStats: {
    color: colors.muted,
    fontSize: 10,
    marginBottom: 2,
  },
  hotSkillCommission: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  hotSkillActionBtn: {
    backgroundColor: '#F97316' + '20',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F97316' + '40',
  },
  hotSkillAction: {
    color: '#FB923C',
    fontSize: 11,
    fontWeight: '600',
  },
  // Link items
  linkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkItemLeft: {
    flex: 1,
    marginRight: 12,
  },
  linkItemName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  linkItemUrl: {
    color: colors.muted,
    fontSize: 12,
  },
  linkItemRight: {
    alignItems: 'flex-end',
  },
  linkItemStat: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  linkItemCommission: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyLinks: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyLinksText: {
    color: colors.muted,
    fontSize: 13,
  },
  // Rules
  rulesBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rulesBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  rulesBtnArrow: {
    color: colors.muted,
    fontSize: 18,
  },
});
