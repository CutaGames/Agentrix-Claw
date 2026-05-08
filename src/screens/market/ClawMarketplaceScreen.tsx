import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { searchOpenClawHub, invalidateHubCache } from '../../services/openclawHub.service';
import { useI18n } from '../../stores/i18nStore';
import type { MarketStackParamList } from '../../navigation/types';
import TaskMarketScreen from '../TaskMarketScreen';

type Nav = NativeStackNavigationProp<MarketStackParamList, 'Marketplace'>;

const SKILL_CATEGORIES = ['All', 'Dev Tools', 'AI Tools', 'Data', 'Integration', 'Commerce', 'Creative', 'Automation', 'Finance'];
const RESOURCE_CATEGORIES = ['All', 'Productivity', 'Code', 'Research', 'Creative', 'Business', 'Finance'];

// Built-in fallback skills shown while backend catalog is loading / empty
const FALLBACK_SKILLS = [
  { id: 'fb-web-search', name: 'Web Search', description: 'Search the web and summarize results with AI.', icon: '🔍', category: 'AI Tools', rating: 4.8, installCount: 12400, tokenCost: 0 },
  { id: 'fb-code-exec', name: 'Code Executor', description: 'Run Python / JS snippets securely in sandbox.', icon: '💻', category: 'Dev Tools', rating: 4.7, installCount: 9800, tokenCost: 0 },
  { id: 'fb-img-gen', name: 'Image Generator', description: 'Generate images from text via Stable Diffusion.', icon: '🎨', category: 'Creative', rating: 4.6, installCount: 8200, tokenCost: 0 },
  { id: 'fb-summarize', name: 'Text Summarizer', description: 'Condense long articles into key bullet points.', icon: '📝', category: 'AI Tools', rating: 4.7, installCount: 7600, tokenCost: 0 },
  { id: 'fb-translate', name: 'Translator', description: 'Translate text between 100+ languages instantly.', icon: '🌐', category: 'AI Tools', rating: 4.9, installCount: 15000, tokenCost: 0 },
  { id: 'fb-csv-parse', name: 'CSV Analyzer', description: 'Parse and analyze CSV files, generate charts.', icon: '📊', category: 'Data', rating: 4.5, installCount: 5400, tokenCost: 0 },
  { id: 'fb-github-pr', name: 'GitHub PR Review', description: 'Auto-review pull requests and suggest improvements.', icon: '🐙', category: 'Dev Tools', rating: 4.6, installCount: 6700, tokenCost: 0 },
  { id: 'fb-weather', name: 'Weather API', description: 'Get real-time and forecast weather worldwide.', icon: '⛅', category: 'Data', rating: 4.8, installCount: 11000, tokenCost: 0 },
  { id: 'fb-send-email', name: 'Email Sender', description: 'Compose and send emails to contacts programmatically.', icon: '📧', category: 'Integration', rating: 4.4, installCount: 4900, tokenCost: 0 },
  { id: 'fb-crypto', name: 'Crypto Price Feed', description: 'Live prices, charts and market caps for 500+ coins.', icon: '₿', category: 'Finance', rating: 4.7, installCount: 9200, tokenCost: 0 },
  { id: 'fb-notion', name: 'Notion Connector', description: 'Read and write Notion pages and databases.', icon: '📓', category: 'Integration', rating: 4.5, installCount: 5800, tokenCost: 0 },
  { id: 'fb-slack', name: 'Slack Bot', description: 'Post messages and manage Slack channels via API.', icon: '💬', category: 'Integration', rating: 4.6, installCount: 7100, tokenCost: 0 },
];

// Built-in fallback resources shown when DB has no resource-layer items
const FALLBACK_RESOURCES = [
  { id: 'fr-gpt4', name: 'GPT-4o API Access', description: 'Premium OpenAI GPT-4o access via Agentrix gateway.', icon: '🤖', price: 0.002, tokenCost: 0, rating: 4.9 },
  { id: 'fr-claude', name: 'Claude 3.5 Sonnet', description: 'Anthropic Claude 3.5 Sonnet — reasoning & coding.', icon: '🧠', price: 0.003, tokenCost: 0, rating: 4.8 },
  { id: 'fr-sd3', name: 'Stable Diffusion 3', description: 'High-quality image generation at scale.', icon: '🖼️', price: 0.01, tokenCost: 0, rating: 4.7 },
  { id: 'fr-gpu', name: 'GPU Compute (H100)', description: 'On-demand H100 GPU for AI model training & inference.', icon: '⚡', price: 2.5, tokenCost: 0, rating: 4.8 },
  { id: 'fr-vector-db', name: 'Vector DB Storage', description: '1GB vector DB hosted — Pinecone-compatible.', icon: '🗄️', price: 0.05, tokenCost: 0, rating: 4.6 },
  { id: 'fr-tts', name: 'Voice Synthesis (ElevenLabs)', description: 'Ultra-realistic TTS in 30+ languages.', icon: '🎙️', price: 0.005, tokenCost: 0, rating: 4.7 },
];

// OpenClaw Hub skills tab — uses the OpenClaw Hub search service
function OpenClawSkillsTab() {
  const navigation = useNavigation<Nav>();
  const { t, language } = useI18n();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['openclawSkills', category, search],
    queryFn: async () => {
      try {
        const result = await searchOpenClawHub({
          q: search || undefined,
          category: category !== 'All' ? category : undefined,
          limit: 30,
        });
        const items = result?.items;
        return Array.isArray(items) && items.length > 0 ? items : null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  // Use fallback skills when backend catalog is not yet populated
  const skills: any[] = data ?? FALLBACK_SKILLS;

  return (
    <View style={styles.tabContainer}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={t({ en: 'Search OpenClaw skills...', zh: '搜索 OpenClaw 技能...' })}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>
      <View>
        <FlatList
          data={SKILL_CATEGORIES}
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
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={skills}
          keyExtractor={(s: any) => String(s.id ?? s._id ?? s.name)}
          numColumns={2}
          style={{ flex: 1 }}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accent} />}
          renderItem={({ item: skill }: { item: any }) => (
            <TouchableOpacity
              style={styles.skillCard}
              activeOpacity={0.8}
              onPress={() => {
                const id = skill.id ?? skill._id;
                if (!id) return;
                navigation.navigate('SkillDetail', { skillId: String(id), skillName: skill.name ?? '' });
              }}
            >
              <Text style={styles.skillIcon}>{skill.icon || '⚡'}</Text>
              <Text style={styles.skillName} numberOfLines={2}>{skill.name}</Text>
              <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
              <View style={styles.skillFooter}>
                <Text style={styles.skillPrice}>
                  {skill.tokenCost != null && skill.tokenCost > 0 ? `${skill.tokenCost} tokens` : 'Free'}
                </Text>
                <Text style={styles.ratingText}>
                  {skill.installCount > 0 ? `${skill.installCount > 999 ? `${(skill.installCount/1000).toFixed(1)}k` : skill.installCount} ↓  ` : ''}
                  ⭐ {skill.rating ? Number(skill.rating).toFixed(1) : '—'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// Resources & Goods tab — paid APIs/compute, falls back to mock data
function ResourcesTab() {
  const navigation = useNavigation<Nav>();
  const { t, language } = useI18n();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['resources', category, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('layer', 'resource');
      if (category !== 'All') params.set('resourceType', category.toLowerCase());
      if (search) params.set('q', search);
      params.set('limit', '20');
      try {
        const raw = await apiFetch<any>(`/unified-marketplace/search?${params.toString()}`);
        const items = raw?.items ?? raw?.data ?? raw;
        const arr: any[] = Array.isArray(items) ? items : [];
        const mapped = arr.map(s => ({
          id: s.id,
          name: s.displayName || s.name,
          description: s.description,
          icon: s.layer === 'resource' ? '📦' : '⚡',
          price: s.pricing?.pricePerCall ?? 0,
          tokenCost: 0,
          rating: s.rating ?? 0,
        }));
        return mapped.length > 0 ? mapped : null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  const resources: any[] = data ?? FALLBACK_RESOURCES;

  return (
    <View style={styles.tabContainer}>
      {/* TEST zone banner for Resources */}
      <View style={{ backgroundColor: '#ef444418', borderBottomWidth: 1, borderBottomColor: '#ef444433', paddingVertical: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <View style={{ backgroundColor: '#ef4444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>TEST</Text>
        </View>
        <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Resource marketplace is under development</Text>
      </View>
      <View style={styles.searchRow}>
          <TextInput
          style={styles.searchInput}
          placeholder={t({ en: 'Search resources & goods...', zh: '搜索资源和商品...' })}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>
      <View>
        <FlatList
          data={RESOURCE_CATEGORIES}
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
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={resources}
          keyExtractor={(s: any) => String(s.id ?? s._id ?? s.name)}
          numColumns={2}
          style={{ flex: 1 }}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accent} />}
          renderItem={({ item: res }: { item: any }) => (
            <TouchableOpacity
              style={styles.skillCard}
              activeOpacity={0.8}
              onPress={() => {
                const id = res.id ?? res._id;
                if (!id) return;
                navigation.navigate('SkillDetail', { skillId: String(id), skillName: res.name ?? '' });
              }}
            >
              <Text style={styles.skillIcon}>{res.icon || '📦'}</Text>
              <Text style={styles.skillName} numberOfLines={2}>{res.name}</Text>
              <Text style={styles.skillDesc} numberOfLines={2}>{res.description}</Text>
              <View style={styles.skillFooter}>
                <Text style={styles.skillPrice}>
                  {res.price != null && res.price > 0 ? `$${res.price}` : `${res.tokenCost ?? 0} tokens`}
                </Text>
                <Text style={styles.ratingText}>⭐ {res.rating ? Number(res.rating).toFixed(1) : '—'}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

export function ClawMarketplaceScreen() {
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<'skills' | 'tasks' | 'resources'>('skills');

  return (
    <View style={styles.container}>
      {/* Custom Top Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'skills' && styles.tabItemActive]}
          onPress={() => setActiveTab('skills')}
        >
          <Text style={[styles.tabText, activeTab === 'skills' && styles.tabTextActive]}>{t({ en: 'OpenClaw Skills', zh: 'OpenClaw 技能' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'tasks' && styles.tabItemActive]}
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.tabTextActive]}>{t({ en: 'Task Market', zh: '任务市场' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'resources' && styles.tabItemActive]}
          onPress={() => setActiveTab('resources')}
        >
          <Text style={[styles.tabText, activeTab === 'resources' && styles.tabTextActive]}>{t({ en: 'Resources & Goods', zh: '资源与商品' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'skills' && <OpenClawSkillsTab />}
        {activeTab === 'tasks' && <TaskMarketScreen />}
        {activeTab === 'resources' && <ResourcesTab />}
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
  ratingText: { fontSize: 12, color: colors.textMuted },
});
