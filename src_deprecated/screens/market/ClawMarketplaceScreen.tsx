import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import type { MarketStackParamList } from '../../navigation/types';
import TaskMarketScreen from '../TaskMarketScreen';

type Nav = NativeStackNavigationProp<MarketStackParamList, 'Marketplace'>;

const CATEGORIES = ['All', 'Productivity', 'Code', 'Research', 'Creative', 'Business', 'Finance'];

async function fetchSkills(category: string, search: string) {
  const params = new URLSearchParams();
  if (category !== 'All') params.set('category', category);
  if (search) params.set('search', search);
  params.set('limit', '20');
  try {
    return await apiFetch<any>(`/skills?${params.toString()}`);
  } catch (e) {
    return [];   // graceful fallback
  }
}

function SkillsTab({ isResource = false }: { isResource?: boolean }) {
  const navigation = useNavigation<Nav>();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['skills', category, search],
    queryFn: () => fetchSkills(category, search),
  });

  const rawSkills = data?.items ?? data?.data ?? data;
  let skills: any[] = Array.isArray(rawSkills) ? rawSkills : [];

  if (isResource) {
    // Filter for paid items for Resources & Goods tab
    skills = skills.filter(s => (s.price != null && s.price > 0) || (s.tokenCost != null && s.tokenCost > 0));
  }

  return (
    <View style={styles.tabContainer}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={isResource ? "Search resources & goods..." : "Search skills..."}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {/* Categories */}
      <View>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(c) => c}
          style={styles.catList}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.catChip, category === item && styles.catChipActive]}
              onPress={() => setCategory(item)}
            >
              <Text style={[styles.catText, category === item && styles.catTextActive]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Skills Grid */}
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(s: any) => String(s.id ?? s._id ?? Math.random())}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{isResource ? "No paid resources found" : "No skills found"}</Text>
            </View>
          }
          renderItem={({ item: skill }: { item: any }) => (
            <TouchableOpacity
              style={styles.skillCard}
              activeOpacity={0.8}
              onPress={() => {
                if (!skill.id && !skill._id) return;
                navigation.navigate('SkillDetail', { skillId: String(skill.id ?? skill._id), skillName: skill.name ?? '' });
              }}
            >
              <Text style={styles.skillIcon}>{skill.icon || '⚡'}</Text>
              <Text style={styles.skillName} numberOfLines={2}>{skill.name}</Text>
              <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
              <View style={styles.skillFooter}>
                <Text style={styles.skillPrice}>
                  {skill.price == null
                    ? skill.tokenCost == null
                      ? 'Free'
                      : skill.tokenCost === 0 ? 'Free' : `${skill.tokenCost} tokens`
                    : skill.price === 0 ? 'Free' : `$${skill.price}`}
                </Text>
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingText}>⭐ {skill.rating ? Number(skill.rating).toFixed(1) : '—'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

export function ClawMarketplaceScreen() {
  const [activeTab, setActiveTab] = useState<'skills' | 'tasks' | 'resources'>('skills');

  return (
    <View style={styles.container}>
      {/* Custom Top Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'skills' && styles.tabItemActive]}
          onPress={() => setActiveTab('skills')}
        >
          <Text style={[styles.tabText, activeTab === 'skills' && styles.tabTextActive]}>OpenClaw Skills</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'tasks' && styles.tabItemActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>Task Market</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'resources' && styles.tabItemActive]}
          onPress={() => setActiveTab('resources')}
        >
          <Text style={[styles.tabText, activeTab === 'resources' && styles.tabTextActive]}>Resources & Goods</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'skills' && <SkillsTab />}
        {activeTab === 'tasks' && <TaskMarketScreen />}
        {activeTab === 'resources' && <SkillsTab isResource={true} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.accent,
  },
  content: {
    flex: 1,
  },
  tabContainer: { flex: 1 },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchInput: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catList: { maxHeight: 44, marginBottom: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  catChipActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  catText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  catTextActive: { color: colors.accent },
  grid: { padding: 16, paddingTop: 8, gap: 12 },
  skillCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillIcon: { fontSize: 28 },
  skillName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  skillDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  skillFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  skillPrice: { fontSize: 13, fontWeight: '700', color: colors.accent },
  ratingRow: {},
  ratingText: { fontSize: 12, color: colors.textMuted },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.textMuted, fontSize: 15 },
});
