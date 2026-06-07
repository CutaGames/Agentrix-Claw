// 卖家看板 — 我的技能
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Share,
  Linking,
} from 'react-native';
import { colors } from '../theme/colors';
import { sellerApi, SellerDashboard, SellerSkill } from '../services/seller.api';
import { referralApi } from '../services/referral.api';

interface Props {
  navigation: any;
}

export function MySkillsScreen({ navigation }: Props) {
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  const [skills, setSkills] = useState<SellerSkill[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [dashData, skillsData] = await Promise.all([
        sellerApi.getDashboard(),
        sellerApi.getMySkills(),
      ]);
      setDashboard(dashData);
      setSkills(skillsData);
    } catch (e) {
      console.error('Failed to load seller data:', e);
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

  const handlePromoteSkill = async (skill: SellerSkill) => {
    try {
      const link = await referralApi.createLink({
        name: skill.name,
        targetType: 'skill',
        targetId: skill.id,
      });
      await Share.share({
        message: `🔥 推荐我的技能「${skill.name}」⭐${skill.rating}\n👉 ${link.shortUrl}`,
      });
    } catch {
      // User cancelled
    }
  };

  const handleViewDetail = (skill: SellerSkill) => {
    navigation.navigate('SkillDetail', { skillId: skill.id, skillName: skill.name });
  };

  const handleOpenDesktop = () => {
    Linking.openURL('https://www.agentrix.top');
  };

  const formatCount = (n: number | string): string => {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1) + 'W';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* 总览统计 */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{dashboard?.totalSkills ?? '-'}</Text>
          <Text style={styles.statLabel}>已发布</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            ${dashboard ? Number(dashboard.monthlyRevenue || 0).toFixed(2) : '-'}
          </Text>
          <Text style={styles.statLabel}>本月收入</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {dashboard ? formatCount(dashboard.monthlyCallCount) : '-'}
          </Text>
          <Text style={styles.statLabel}>本月调用</Text>
        </View>
      </View>

      {/* 技能列表 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>我的技能列表</Text>
        {skills.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyText}>还没有发布技能</Text>
            <Text style={styles.emptySubtext}>去电脑端发布你的第一个技能吧</Text>
          </View>
        )}
        {skills.map(skill => (
          <View key={skill.id} style={styles.skillCard}>
            <View style={styles.skillHeader}>
              <Text style={styles.skillName}>{skill.name}</Text>
              <View style={[
                styles.statusBadge,
                skill.status === 'active' && styles.statusActive,
                skill.status === 'paused' && styles.statusPaused,
              ]}>
                <Text style={[
                  styles.statusText,
                  skill.status === 'active' && styles.statusTextActive,
                  skill.status === 'paused' && styles.statusTextPaused,
                ]}>
                  {skill.status === 'active' ? '运行中' : skill.status === 'paused' ? '已暂停' : '草稿'}
                </Text>
              </View>
            </View>

            <View style={styles.skillStats}>
              <Text style={styles.skillStat}>⭐ {Number(skill.rating || 0).toFixed(1)}</Text>
              <Text style={styles.skillStatSep}>·</Text>
              <Text style={styles.skillStat}>本月 {formatCount(skill.monthlyCallCount)} 次调用</Text>
            </View>

            <View style={styles.skillStats}>
              <Text style={[styles.skillStat, { color: colors.success }]}>
                本月收入 ${Number(skill.monthlyRevenue || 0).toFixed(2)}
              </Text>
              <Text style={styles.skillStatSep}>·</Text>
              <Text style={[
                styles.skillStat,
                { color: skill.revenueChange >= 0 ? colors.success : colors.danger },
              ]}>
                {skill.revenueChange >= 0 ? '↑' : '↓'} {Math.abs(skill.revenueChange)}%
              </Text>
            </View>

            <View style={styles.skillStats}>
              <Text style={styles.skillStat}>评价 {skill.totalReviews}</Text>
              <Text style={styles.skillStatSep}>·</Text>
              <Text style={[styles.skillStat, skill.newReviews > 0 && { color: colors.primary }]}>
                新评价 +{skill.newReviews}
              </Text>
            </View>

            <View style={styles.skillActions}>
              <TouchableOpacity
                style={styles.promoteBtn}
                onPress={() => handlePromoteSkill(skill)}
              >
                <Text style={styles.promoteBtnText}>📢 推广</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.detailBtn}
                onPress={() => handleViewDetail(skill)}
              >
                <Text style={styles.detailBtnText}>详情</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* 发布引导 */}
      <TouchableOpacity style={styles.publishGuide} onPress={handleOpenDesktop}>
        <Text style={styles.publishIcon}>💻</Text>
        <View style={styles.publishContent}>
          <Text style={styles.publishTitle}>发布新技能？请使用电脑端</Text>
          <Text style={styles.publishSubtitle}>
            打开 agentrix.top 发布技能{'\n'}支持 Markdown 描述、API 配置、定价策略等完整功能
          </Text>
        </View>
        <Text style={styles.publishArrow}>→</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
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
  // Section
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  // Skill card
  skillCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  skillName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.muted + '20',
  },
  statusActive: {
    backgroundColor: colors.success + '20',
  },
  statusPaused: {
    backgroundColor: colors.warning + '20',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  statusTextActive: {
    color: colors.success,
  },
  statusTextPaused: {
    color: colors.warning,
  },
  skillStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  skillStat: {
    color: colors.muted,
    fontSize: 13,
  },
  skillStatSep: {
    color: colors.muted,
    fontSize: 13,
    marginHorizontal: 6,
  },
  skillActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  promoteBtn: {
    flex: 1,
    backgroundColor: '#F97316' + '20',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F97316' + '50',
  },
  promoteBtnText: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '600',
  },
  detailBtn: {
    flex: 1,
    backgroundColor: colors.primary + '15',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  detailBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  // Publish guide
  publishGuide: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  publishIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  publishContent: {
    flex: 1,
  },
  publishTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  publishSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  publishArrow: {
    color: colors.muted,
    fontSize: 18,
    marginLeft: 8,
  },
});
