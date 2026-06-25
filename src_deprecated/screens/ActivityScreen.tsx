// 活动页面（空投/AutoEarn 入口）
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';

export const ActivityScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 空投入口 */}
      <TouchableOpacity onPress={() => navigation.navigate('Airdrop')}>
        <Card style={styles.entryCard}>
          <View style={styles.entryIcon}>
            <Text style={styles.entryIconText}>🎁</Text>
          </View>
          <View style={styles.entryInfo}>
            <Text style={styles.entryTitle}>发现空投</Text>
            <Text style={styles.entryDesc}>发现并领取最新空投机会</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>3 新</Text>
          </View>
        </Card>
      </TouchableOpacity>

      {/* AutoEarn 入口 */}
      <TouchableOpacity onPress={() => navigation.navigate('AutoEarn')}>
        <Card style={styles.entryCard}>
          <View style={styles.entryIcon}>
            <Text style={styles.entryIconText}>⚡</Text>
          </View>
          <View style={styles.entryInfo}>
            <Text style={styles.entryTitle}>AutoEarn</Text>
            <Text style={styles.entryDesc}>智能收益策略，自动理财</Text>
          </View>
          <View style={[styles.badge, styles.greenBadge]}>
            <Text style={styles.badgeText}>+$12.5</Text>
          </View>
        </Card>
      </TouchableOpacity>

      {/* 最近活动 */}
      <Card>
        <Text style={styles.sectionTitle}>最近活动</Text>
        <View style={styles.activityList}>
          <View style={styles.activityItem}>
            <Text style={styles.activityIcon}>🎁</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>Jupiter 空投已领取</Text>
              <Text style={styles.activityTime}>2小时前</Text>
            </View>
            <Text style={[styles.activityAmount, styles.positive]}>+$120</Text>
          </View>
          <View style={styles.activityItem}>
            <Text style={styles.activityIcon}>⚡</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>AutoEarn 收益到账</Text>
              <Text style={styles.activityTime}>今天 08:00</Text>
            </View>
            <Text style={[styles.activityAmount, styles.positive]}>+$5.20</Text>
          </View>
          <View style={styles.activityItem}>
            <Text style={styles.activityIcon}>💰</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>存入 USDT</Text>
              <Text style={styles.activityTime}>昨天</Text>
            </View>
            <Text style={styles.activityAmount}>1,000 USDT</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  // 入口卡片
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  entryIconText: {
    fontSize: 24,
  },
  entryInfo: {
    flex: 1,
  },
  entryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  entryDesc: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  greenBadge: {
    backgroundColor: '#4ade80',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // 最近活动
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    color: colors.text,
    fontSize: 14,
  },
  activityTime: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  activityAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  positive: {
    color: '#4ade80',
  },
});
