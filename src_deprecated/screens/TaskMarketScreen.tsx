// 任务集市（悬赏任务板）— 核心功能
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import {
  taskMarketplaceApi,
  TaskItem,
  TaskType,
  TASK_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
} from '../services/taskMarketplace.api';
import { referralApi } from '../services/referral.api';
import { ShareBottomSheet } from '../components/ShareComponents';

type SortMode = 'latest' | 'budget_high' | 'budget_low' | 'deadline';

// ========== 种子数据：Agentrix 官方悬赏任务 ==========
const SEED_TASKS: TaskItem[] = [
  {
    id: 'agx-bounty-1', userId: 'system', type: 'content', status: 'pending', visibility: 'public',
    title: '[Official] Agentrix Commerce Launch — Twitter Thread',
    description: 'Write a viral Twitter/X thread (8-12 tweets) introducing Agentrix Commerce: Smart Checkout, X402 Pay, Commission Split, and the referral system. Include visuals/memes. Must tag @AgentrixAI.',
    budget: 200, currency: 'USD', tags: ['twitter', 'content', 'marketing', 'official'],
    requirements: { deadline: new Date(Date.now() + 7 * 86400000).toISOString(), deliverables: ['Twitter thread URL', 'Engagement report'] },
    createdAt: new Date(Date.now() - 0.5 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-2', userId: 'system', type: 'development', status: 'pending', visibility: 'public',
    title: '[Official] Build MCP Skill — Weather + Crypto Price',
    description: 'Create an MCP-compatible skill that combines weather data and crypto prices. Must follow Agentrix Skill SDK spec, include inputSchema/outputSchema, and publish to Marketplace.',
    budget: 500, currency: 'USD', tags: ['MCP', 'skill', 'development', 'official'],
    requirements: { deadline: new Date(Date.now() + 14 * 86400000).toISOString(), deliverables: ['Source code', 'Published skill URL', 'README'] },
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-3', userId: 'system', type: 'content', status: 'pending', visibility: 'public',
    title: '[Official] Video Tutorial — How to Earn with Agentrix',
    description: 'Create a 3-5 min video tutorial showing: 1) Sign up, 2) Browse Marketplace, 3) Purchase a skill, 4) Share referral link, 5) Track commission earnings. YouTube or TikTok.',
    budget: 300, currency: 'USD', tags: ['video', 'tutorial', 'marketing', 'official'],
    requirements: { deadline: new Date(Date.now() + 10 * 86400000).toISOString(), deliverables: ['Video URL', 'Thumbnail'] },
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-4', userId: 'system', type: 'custom_service', status: 'pending', visibility: 'public',
    title: '[Official] Bug Bounty — Mobile App Testing',
    description: 'Test the Agentrix mobile app (Android APK provided). Report bugs with screenshots, steps to reproduce, and severity. $20-$100 per valid bug depending on severity.',
    budget: 500, currency: 'USD', tags: ['testing', 'QA', 'mobile', 'bug-bounty', 'official'],
    requirements: { deadline: new Date(Date.now() + 21 * 86400000).toISOString(), deliverables: ['Bug reports', 'Screenshots'] },
    createdAt: new Date(Date.now() - 0.2 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-5', userId: 'system', type: 'design', status: 'pending', visibility: 'public',
    title: '[Official] Agentrix Sticker Pack — Telegram & Discord',
    description: 'Design a set of 20 stickers for Telegram and Discord featuring the Agentrix mascot/brand. Themes: AI agents, crypto payments, referral earnings, marketplace. PNG + animated GIF.',
    budget: 400, currency: 'USD', tags: ['design', 'stickers', 'telegram', 'discord', 'official'],
    requirements: { deadline: new Date(Date.now() + 14 * 86400000).toISOString(), deliverables: ['PNG pack', 'GIF pack', 'Source files'] },
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-6', userId: 'system', type: 'content', status: 'pending', visibility: 'public',
    title: '[Official] Translate Agentrix Docs — Chinese ↔ English',
    description: 'Translate the Agentrix Commerce documentation (SDK guide, API reference, FAQ) between Chinese and English. ~30 pages total. Must maintain technical accuracy.',
    budget: 600, currency: 'USD', tags: ['translation', 'docs', 'i18n', 'official'],
    requirements: { deadline: new Date(Date.now() + 14 * 86400000).toISOString(), deliverables: ['Translated docs (Markdown)', 'Glossary'] },
    createdAt: new Date(Date.now() - 1.5 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-7', userId: 'system', type: 'development', status: 'pending', visibility: 'public',
    title: '[Official] Smart Contract Audit — Commission.sol',
    description: 'Security audit of Agentrix Commission.sol and CommissionV2.sol contracts. Identify vulnerabilities, gas optimization opportunities. Output: formal audit report with severity ratings.',
    budget: 2000, currency: 'USD', tags: ['solidity', 'audit', 'security', 'official'],
    requirements: { deadline: new Date(Date.now() + 21 * 86400000).toISOString(), deliverables: ['Audit report PDF', 'Fix recommendations'] },
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-8', userId: 'system', type: 'consultation', status: 'pending', visibility: 'public',
    title: '[Official] Growth Strategy — 1000 Users in 30 Days',
    description: 'Develop and execute a growth strategy to acquire 1000 active users within 30 days. Channels: Twitter, Telegram, Discord, Product Hunt, Hacker News. Weekly progress reports.',
    budget: 1500, currency: 'USD', tags: ['growth', 'marketing', 'strategy', 'official'],
    requirements: { deadline: new Date(Date.now() + 35 * 86400000).toISOString(), deliverables: ['Strategy doc', 'Weekly reports', 'Final metrics'] },
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-9', userId: 'system', type: 'development', status: 'pending', visibility: 'public',
    title: '[Community] Build AI Agent — Auto Social Media Manager',
    description: 'Build an AI agent using Agentrix SDK that auto-manages Twitter/Discord: scheduled posts, engagement replies, follower analytics. Must use Agentrix Skill marketplace for AI capabilities.',
    budget: 800, currency: 'USD', tags: ['AI', 'agent', 'social-media', 'automation'],
    requirements: { deadline: new Date(Date.now() + 21 * 86400000).toISOString(), deliverables: ['Source code', 'Demo video', 'Published agent'] },
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 'agx-bounty-10', userId: 'system', type: 'other', status: 'pending', visibility: 'public',
    title: '[Official] Discord Community Setup + 2-Week Management',
    description: 'Set up Agentrix Discord server: channel structure, roles, welcome bot, verification, FAQ bot. Manage for 2 weeks: moderate, host 2 AMAs, run 1 giveaway event.',
    budget: 500, currency: 'USD', tags: ['discord', 'community', 'moderation', 'official'],
    requirements: { deadline: new Date(Date.now() + 21 * 86400000).toISOString(), deliverables: ['Discord server', 'Moderation guide', 'Event reports'] },
    createdAt: new Date(Date.now() - 2.5 * 86400000).toISOString(), updatedAt: new Date().toISOString(),
  },
];

// Exported for TaskDetailScreen seed data fallback
export function getSeedTaskById(id: string): TaskItem | undefined {
  return SEED_TASKS.find(t => t.id === id);
}

const TYPE_FILTERS: { key: TaskType | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '🔥' },
  { key: 'development', label: 'Dev', icon: '💻' },
  { key: 'design', label: 'Design', icon: '🎨' },
  { key: 'content', label: 'Content', icon: '✍️' },
  { key: 'consultation', label: 'Consult', icon: '💡' },
  { key: 'custom_service', label: 'Custom', icon: '⚙️' },
];

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'latest', label: 'Latest' },
  { key: 'budget_high', label: 'Budget ↓' },
  { key: 'budget_low', label: 'Budget ↑' },
  { key: 'deadline', label: 'Urgent' },
];

export default function TaskMarketScreen() {
  const navigation = useNavigation<any>();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [shareContent, setShareContent] = useState<{ title: string; message: string; url: string }>({ title: '', message: '', url: '' });

  // 对种子数据做客户端过滤/排序
  const getFilteredSeedTasks = useCallback(() => {
    let filtered = [...SEED_TASKS];
    if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q))
      );
    }
    switch (sortMode) {
      case 'budget_high': filtered.sort((a, b) => b.budget - a.budget); break;
      case 'budget_low': filtered.sort((a, b) => a.budget - b.budget); break;
      case 'deadline': filtered.sort((a, b) => {
        const da = a.requirements?.deadline ? new Date(a.requirements.deadline).getTime() : Infinity;
        const db = b.requirements?.deadline ? new Date(b.requirements.deadline).getTime() : Infinity;
        return da - db;
      }); break;
      default: filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
    }
    return filtered;
  }, [typeFilter, sortMode, searchQuery]);

  const fetchTasks = useCallback(async (p: number = 1, append: boolean = false) => {
    try {
      const params: any = { page: p, limit: 15 };
      if (typeFilter !== 'all') params.type = [typeFilter];
      if (searchQuery.trim()) params.query = searchQuery.trim();

      switch (sortMode) {
        case 'budget_high': params.sortBy = 'budget'; params.sortOrder = 'DESC'; break;
        case 'budget_low': params.sortBy = 'budget'; params.sortOrder = 'ASC'; break;
        case 'deadline': params.sortBy = 'deadline'; params.sortOrder = 'ASC'; break;
        default: params.sortBy = 'createdAt'; params.sortOrder = 'DESC'; break;
      }

      const result = await taskMarketplaceApi.searchTasks(params);

      // 如果 API 返回空结果且是第一页，使用种子数据
      if (result.items.length === 0 && p === 1) {
        const seedFiltered = getFilteredSeedTasks();
        setTasks(seedFiltered);
        setTotal(seedFiltered.length);
      } else if (append) {
        setTasks(prev => [...prev, ...result.items]);
        setTotal(result.total);
      } else {
        setTasks(result.items);
        setTotal(result.total);
      }
      setPage(p);
    } catch (error) {
      console.warn('API unavailable, using seed tasks:', error);
      // API 失败时使用种子数据
      if (!append) {
        const seedFiltered = getFilteredSeedTasks();
        setTasks(seedFiltered);
        setTotal(seedFiltered.length);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [typeFilter, sortMode, searchQuery, getFilteredSeedTasks]);

  useEffect(() => {
    setLoading(true);
    fetchTasks(1);
  }, [typeFilter, sortMode]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTasks(1);
  };

  const onEndReached = () => {
    if (loadingMore || tasks.length >= total) return;
    setLoadingMore(true);
    fetchTasks(page + 1, true);
  };

  const handleSearch = () => {
    setLoading(true);
    fetchTasks(1);
  };

  const getDaysLeft = (deadline?: string) => {
    if (!deadline) return null;
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const formatBudget = (budget: number, currency: string) => {
    if (currency === 'CNY' || currency === 'RMB') return `¥${budget.toLocaleString()}`;
    return `$${budget.toLocaleString()}`;
  };

  const handleShareTask = async (task: TaskItem) => {
    try {
      const budget = formatBudget(task.budget, task.currency);
      const typeConf = TASK_TYPE_CONFIG[task.type] || TASK_TYPE_CONFIG.other;
      let url = `https://agentrix.top/marketplace?tab=tasks&taskId=${task.id}`;
      try {
        const link = await referralApi.createLink({
          name: task.title,
          targetType: 'product',
          targetId: task.id,
        });
        if (link?.shortUrl) url = link.shortUrl;
      } catch {
        // Use default URL if referral link creation fails
      }
      setShareContent({
        title: task.title,
        message: `${typeConf.icon} ${task.title}\n\n💰 Bounty: ${budget}\n📝 ${task.description.slice(0, 120)}...\n\n🔗 Apply now on Agentrix Bounty Board`,
        url,
      });
      setShareVisible(true);
    } catch {
      // silently ignore
    }
  };

  const renderTask = ({ item }: { item: TaskItem }) => {
    const typeConf = TASK_TYPE_CONFIG[item.type] || TASK_TYPE_CONFIG.other;
    const statusConf = TASK_STATUS_CONFIG[item.status] || TASK_STATUS_CONFIG.pending;
    const daysLeft = getDaysLeft(item.requirements?.deadline);
    const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
    const isExpired = daysLeft !== null && daysLeft <= 0;

    return (
      <TouchableOpacity
        style={styles.taskCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
      >
        {/* Type badge + Status */}
        <View style={styles.taskTopRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeConf.color + '20' }]}>
            <Text style={styles.typeBadgeIcon}>{typeConf.icon}</Text>
            <Text style={[styles.typeBadgeText, { color: typeConf.color }]}>{typeConf.label}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConf.color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: statusConf.color }]}>{statusConf.label}</Text>
          </View>
          {isUrgent && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentText}>🔥 Urgent</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => handleShareTask(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.shareBtnText}>📤</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>

        {/* Description */}
        <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.slice(0, 4).map((tag, i) => (
              <View key={i} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {item.tags.length > 4 && (
              <Text style={styles.moreTag}>+{item.tags.length - 4}</Text>
            )}
          </View>
        )}

        {/* Bottom: Budget + Deadline + Publisher */}
        <View style={styles.taskBottom}>
          <View style={styles.budgetBox}>
            <Text style={styles.budgetLabel}>Bounty</Text>
            <Text style={styles.budgetValue}>{formatBudget(item.budget, item.currency)}</Text>
          </View>
          {daysLeft !== null && (
            <View style={styles.deadlineBox}>
              <Text style={styles.deadlineLabel}>Due</Text>
              <Text style={[styles.deadlineValue, isUrgent && { color: colors.warning }, isExpired && { color: colors.error }]}>
                {isExpired ? 'Expired' : `${daysLeft}d`}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.publisherText}>
            {item.user?.nickname || item.user?.agentrixId?.slice(0, 10) || 'Anonymous'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* X402 Auto-settle Banner */}
      <View style={styles.x402Banner}>
        <View style={styles.x402Badge}>
          <Text style={styles.x402BadgeText}>X402</Text>
        </View>
        <Text style={styles.x402BannerText}>
          Task bids auto-settle via X402 protocol · Agent-to-Agent payments
        </Text>
        <View style={styles.liveDot} />
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); handleSearch(); }}>
            <Text style={styles.searchCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Type Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {TYPE_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, typeFilter === f.key && styles.filterTabActive]}
            onPress={() => setTypeFilter(f.key)}
          >
            <Text style={styles.filterIcon}>{f.icon}</Text>
            <Text style={[styles.filterText, typeFilter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort + Search Toggle */}
      <View style={styles.sortRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {SORT_OPTIONS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.sortChip, sortMode === s.key && styles.sortChipActive]}
              onPress={() => setSortMode(s.key)}
            >
              <Text style={[styles.sortChipText, sortMode === s.key && styles.sortChipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.searchToggle} onPress={() => setShowSearch(!showSearch)}>
          <Text style={styles.searchToggleIcon}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Task List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderTask}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <>
              {/* Viral Share Banner */}
              <TouchableOpacity
                style={styles.viralBanner}
                activeOpacity={0.8}
                onPress={async () => {
                  let url = 'https://agentrix.top/marketplace?tab=tasks';
                  try {
                    const link = await referralApi.createLink({
                      name: 'Agentrix Bounty Board',
                      targetType: 'product',
                      targetId: 'task-market',
                    });
                    if (link?.shortUrl) url = link.shortUrl;
                  } catch { /* use default */ }
                  setShareContent({
                    title: 'Agentrix Bounty Board',
                    message: '🎯 Agentrix Bounty Board — Earn crypto by completing tasks!\n\n💰 $200-$2000 bounties for content, dev, design & more',
                    url,
                  });
                  setShareVisible(true);
                }}
              >
                <View style={styles.viralBannerContent}>
                  <Text style={styles.viralBannerIcon}>💰</Text>
                  <View style={styles.viralBannerText}>
                    <Text style={styles.viralBannerTitle}>Share & Earn — Invite friends to bounties</Text>
                    <Text style={styles.viralBannerDesc}>Earn 10% referral reward when your friend completes a task</Text>
                  </View>
                  <Text style={styles.viralBannerArrow}>→</Text>
                </View>
              </TouchableOpacity>

              {/* Gameplay Guide */}
              <View style={styles.gameplayBanner}>
                <Text style={styles.gameplayTitle}>🎯 Bounty Board — How It Works</Text>
                <View style={styles.gameplaySteps}>
                  <View style={styles.gameplayStep}>
                    <Text style={styles.stepNum}>①</Text>
                    <Text style={styles.stepText}>Post Task{'\n'}Set Bounty</Text>
                  </View>
                  <Text style={styles.stepArrow}>→</Text>
                  <View style={styles.gameplayStep}>
                    <Text style={styles.stepNum}>②</Text>
                    <Text style={styles.stepText}>Devs Bid{'\n'}& Propose</Text>
                  </View>
                  <Text style={styles.stepArrow}>→</Text>
                  <View style={styles.gameplayStep}>
                    <Text style={styles.stepNum}>③</Text>
                    <Text style={styles.stepText}>Accept{'\n'}& Execute</Text>
                  </View>
                  <Text style={styles.stepArrow}>→</Text>
                  <View style={styles.gameplayStep}>
                    <Text style={styles.stepNum}>④</Text>
                    <Text style={styles.stepText}>Deliver{'\n'}& Get Paid</Text>
                  </View>
                </View>
                <Text style={styles.gameplayHint}>
                  💡 3% platform fee · On-chain settlement · Dispute protection
                </Text>
              </View>
            </>
          }
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />
          ) : tasks.length > 0 && tasks.length >= total ? (
            <Text style={styles.endText}>— All {total} tasks loaded —</Text>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No bounties yet</Text>
              <Text style={styles.emptyText}>Be the first to post a task!</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('PostTask')}
              >
                <Text style={styles.emptyBtnText}>+ Post Task</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB: Post Task */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PostTask')}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Post Task</Text>
      </TouchableOpacity>

      {/* Commission-tracked Share Bottom Sheet */}
      <ShareBottomSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        title="分享任务 · 赚取佣金"
        shareContent={shareContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // X402 Banner
  x402Banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#7c3aed18',
    borderBottomWidth: 1,
    borderBottomColor: '#7c3aed33',
    gap: 8,
  },
  x402Badge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
  },
  x402BadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  x402BannerText: { flex: 1, fontSize: 12, color: '#a78bfa', fontWeight: '500' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22c55e' },
  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  searchBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  searchBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  searchCancel: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  // Filters
  filterScroll: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  filterTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.bg, gap: 4, borderWidth: 1, borderColor: colors.border },
  filterTabActive: { backgroundColor: colors.primary + '20', borderColor: colors.primary },
  filterIcon: { fontSize: 14 },
  filterText: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
  // Sort
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sortChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
  sortChipText: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  sortChipTextActive: { color: colors.primary, fontWeight: '700' },
  searchToggle: { padding: 6 },
  searchToggleIcon: { fontSize: 18 },
  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: colors.muted, fontSize: 14 },
  // Share button on task card
  shareBtn: { padding: 4 },
  shareBtnText: { fontSize: 16 },
  // Viral share banner
  viralBanner: {
    backgroundColor: '#F59E0B' + '15',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B' + '40',
  },
  viralBannerContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  viralBannerIcon: { fontSize: 28 },
  viralBannerText: { flex: 1 },
  viralBannerTitle: { color: colors.text, fontSize: 13, fontWeight: '700' as const, marginBottom: 2 },
  viralBannerDesc: { color: colors.muted, fontSize: 11 },
  viralBannerArrow: { color: '#F59E0B', fontSize: 18, fontWeight: '700' as const },
  // List
  listContent: { padding: 12, paddingBottom: 100 },
  endText: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingVertical: 16 },
  // Task Card
  taskCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  typeBadgeIcon: { fontSize: 12 },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  urgentBadge: { backgroundColor: '#F59E0B20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  urgentText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  taskTitle: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22, marginBottom: 6 },
  taskDesc: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: 10 },
  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tagChip: { backgroundColor: colors.primary + '12', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  tagText: { fontSize: 11, color: colors.primary, fontWeight: '500' },
  moreTag: { fontSize: 11, color: colors.muted, alignSelf: 'center' },
  // Bottom
  taskBottom: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 16 },
  budgetBox: {},
  budgetLabel: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  budgetValue: { fontSize: 18, fontWeight: '800', color: colors.success },
  deadlineBox: {},
  deadlineLabel: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  deadlineValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  publisherText: { fontSize: 12, color: colors.muted },
  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.muted, marginBottom: 20 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // Gameplay banner
  gameplayBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  gameplayTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  gameplaySteps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  gameplayStep: { alignItems: 'center', width: 60 },
  stepNum: { fontSize: 18, color: colors.primary, fontWeight: '700', marginBottom: 2 },
  stepText: { fontSize: 10, color: colors.muted, textAlign: 'center', lineHeight: 14 },
  stepArrow: { color: colors.primary, fontSize: 16, fontWeight: '700', marginHorizontal: 4 },
  gameplayHint: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
