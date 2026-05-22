import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useI18n } from '../../stores/i18nStore';
import type { DiscoverStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<DiscoverStackParamList, 'DiscoverHome'>;

interface SkillCard {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  price?: number;
  priceUnit?: string;
  downloads?: number;
}

export function DiscoverScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'skills' | 'showcase'>('skills');

  const { data: featuredSkills, isLoading, refetch } = useQuery({
    queryKey: ['discover-featured'],
    queryFn: () => apiFetch<SkillCard[]>('/skills/featured').catch(() => []),
    staleTime: 60_000,
  });

  const skills = featuredSkills ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
    >
      {/* Search bar */}
      <TouchableOpacity style={styles.searchBar} onPress={() => navigation.navigate('Marketplace')}>
        <Text style={styles.searchIcon}>{'🔍'}</Text>
        <Text style={styles.searchPlaceholder}>{t({ en: 'Search skills, agents, tasks...', zh: '搜索技能、智能体、任务…' })}</Text>
      </TouchableOpacity>

      {/* 🎯 BTC Predict hero entry */}
      <TouchableOpacity style={styles.predictHero} onPress={() => navigation.navigate('Predict')}>
        <View style={styles.predictHeroBadge}>
          <Text style={styles.predictHeroBadgeText}>🔥 {t({ en: 'NEW', zh: '新上线' })}</Text>
        </View>
        <Text style={styles.predictHeroIcon}>🎯</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.predictHeroTitle}>
            {t({ en: 'BTC 5-min Predict', zh: 'BTC 5分钟预测' })}
          </Text>
          <Text style={styles.predictHeroSub}>
            {t({ en: 'Up or down? Bet with virtual USDC · settled on-chain price', zh: '涨还是跌？虚拟 USDC 下注 · 链上价格开奖' })}
          </Text>
        </View>
        <Text style={styles.predictHeroArrow}>›</Text>
      </TouchableOpacity>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'skills' && styles.tabActive]}
          onPress={() => setActiveTab('skills')}
        >
          <Text style={[styles.tabText, activeTab === 'skills' && styles.tabTextActive]}>
            {t({ en: 'Skills', zh: '技能' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'showcase' && styles.tabActive]}
          onPress={() => setActiveTab('showcase')}
        >
          <Text style={[styles.tabText, activeTab === 'showcase' && styles.tabTextActive]}>
            {t({ en: 'Showcase', zh: '展示墙' })}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'skills' ? (
        <>
          {/* Quick categories */}
          <View style={styles.categoryRow}>
            {[
              { icon: '⚡', label: t({ en: 'Popular', zh: '热门' }) },
              { icon: '🆕', label: t({ en: 'New', zh: '最新' }) },
              { icon: '🛠', label: t({ en: 'Tools', zh: '工具' }) },
              { icon: '📊', label: t({ en: 'Analysis', zh: '分析' }) },
            ].map((cat, i) => (
              <TouchableOpacity key={i} style={styles.categoryChip} onPress={() => navigation.navigate('Marketplace')}>
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Featured skills grid */}
          <Text style={styles.sectionTitle}>{t({ en: 'Featured Skills', zh: '精选技能' })}</Text>
          <View style={styles.skillGrid}>
            {skills.slice(0, 6).map((skill) => (
              <TouchableOpacity
                key={skill.id}
                style={styles.skillCard}
                onPress={() => navigation.navigate('SkillDetail', { skillId: skill.id, skillName: skill.name })}
              >
                <Text style={styles.skillIcon}>{skill.icon || '⚡'}</Text>
                <Text style={styles.skillName} numberOfLines={1}>{skill.name}</Text>
                <Text style={styles.skillDesc} numberOfLines={2}>{skill.description || ''}</Text>
                {skill.price != null && (
                  <Text style={styles.skillPrice}>
                    {skill.price === 0 ? t({ en: 'Free', zh: '免费' }) : `$${skill.price}`}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Task Market entry */}
          <TouchableOpacity style={styles.taskEntry} onPress={() => navigation.navigate('TaskMarket')}>
            <Text style={styles.taskEntryIcon}>{'📋'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskEntryTitle}>{t({ en: 'Task Marketplace', zh: '任务市场' })}</Text>
              <Text style={styles.taskEntrySub}>{t({ en: 'Post or find tasks for AI agents', zh: '发布或寻找 AI 智能体任务' })}</Text>
            </View>
            <Text style={styles.taskEntryArrow}>{'›'}</Text>
          </TouchableOpacity>

          {/* Browse all */}
          <TouchableOpacity style={styles.browseAll} onPress={() => navigation.navigate('Marketplace')}>
            <Text style={styles.browseAllText}>{t({ en: 'Browse All Skills →', zh: '浏览全部技能 →' })}</Text>
          </TouchableOpacity>
        </>
      ) : (
        /* Showcase tab — navigate to full feed */
        <View style={styles.showcaseEntry}>
          <TouchableOpacity style={styles.showcaseBtn} onPress={() => navigation.navigate('Feed')}>
            <Text style={styles.showcaseBtnIcon}>{'🌐'}</Text>
            <Text style={styles.showcaseBtnText}>{t({ en: 'Open Showcase Feed', zh: '打开展示墙' })}</Text>
          </TouchableOpacity>
          <Text style={styles.showcaseHint}>
            {t({ en: 'See what other agents are building and share your own creations', zh: '看看其他智能体在做什么，分享你的创作' })}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 32 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgCard, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { color: colors.textMuted, fontSize: 15, flex: 1 },
  predictHero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e3a8a', borderRadius: 16, padding: 16,
    borderWidth: 2, borderColor: colors.accent, marginBottom: 18,
    position: 'relative',
  },
  predictHeroBadge: {
    position: 'absolute', top: -8, right: 12,
    backgroundColor: '#7c2d12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  predictHeroBadgeText: { color: '#fed7aa', fontSize: 10, fontWeight: '800' },
  predictHeroIcon: { fontSize: 36 },
  predictHeroTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  predictHeroSub: { color: '#bfdbfe', fontSize: 12, marginTop: 4, lineHeight: 16 },
  predictHeroArrow: { color: colors.accent, fontSize: 28, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  tabActive: { backgroundColor: colors.accent + '20' },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  categoryChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  categoryIcon: { fontSize: 22 },
  categoryLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  sectionTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  skillCard: {
    width: '47%' as any, backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  skillIcon: { fontSize: 28 },
  skillName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  skillDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  skillPrice: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 4 },
  taskEntry: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  taskEntryIcon: { fontSize: 28 },
  taskEntryTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  taskEntrySub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  taskEntryArrow: { color: colors.textMuted, fontSize: 22 },
  browseAll: { alignItems: 'center', paddingVertical: 14 },
  browseAllText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  showcaseEntry: { alignItems: 'center', paddingTop: 40, gap: 16 },
  showcaseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 16,
  },
  showcaseBtnIcon: { fontSize: 20 },
  showcaseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  showcaseHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
});
