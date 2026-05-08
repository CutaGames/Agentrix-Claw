// 任务集市（悬赏任务板）— 核心功能
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import {
  taskMarketplaceApi,
  TaskItem,
  TaskType,
  TASK_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
} from '../services/taskMarketplace.api';
import { referralApi } from '../services/referral.api';
import { ShareBottomSheet } from '../components/ShareComponents';

const { width: SCREEN_W } = Dimensions.get('window');

type SortMode = 'latest' | 'budget_high' | 'budget_low' | 'deadline';

const TYPE_LABEL_ZH: Record<string, string> = {
  development: '开发',
  design: '设计',
  content: '内容',
  consultation: '咨询',
  custom_service: '定制',
  other: '其他',
};

const STATUS_LABEL_ZH: Record<string, string> = {
  pending: '待处理',
  active: '进行中',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已过期',
  draft: '草稿',
};

// Compact banner carousel slides
const BANNER_SLIDES = [
  {
    id: 'x402',
    icon: '⚡',
    color: '#a78bfa',
    bg: '#7c3aed18',
    borderColor: '#7c3aed33',
    badge: 'X402',
    title: { en: 'On-chain Auto-settle', zh: '链上自动结算' },
    sub: { en: 'Escrowed bounties · Agent-to-agent payments · BSC', zh: '托管悬赏 · 智能体间支付 · BSC' },
  },
  {
    id: 'share',
    icon: '💰',
    color: '#F59E0B',
    bg: '#F59E0B12',
    borderColor: '#F59E0B33',
    badge: null,
    title: { en: 'Share & Earn 10%', zh: '分享赚 10%' },
    sub: { en: 'Invite friends → they complete tasks → you earn referral reward', zh: '邀请好友 → 完成任务 → 你赚推荐奖励' },
  },
  {
    id: 'how',
    icon: '🎯',
    color: '#6366f1',
    bg: '#6366f118',
    borderColor: '#6366f133',
    badge: null,
    title: { en: 'Post → Bid → Accept → Pay', zh: '发布 → 投标 → 接单 → 支付' },
    sub: { en: '3% fee · Dispute protection · Escrow release on delivery', zh: '3% 费率 · 争议保护 · 交付后放款' },
  },
] as const;

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

const TYPE_FILTERS: { key: TaskType | 'all'; label: { en: string; zh: string }; icon: string }[] = [
  { key: 'all', label: { en: 'All', zh: '全部' }, icon: '🔥' },
  { key: 'development', label: { en: 'Dev', zh: '开发' }, icon: '💻' },
  { key: 'design', label: { en: 'Design', zh: '设计' }, icon: '🎨' },
  { key: 'content', label: { en: 'Content', zh: '内容' }, icon: '✍️' },
  { key: 'consultation', label: { en: 'Consult', zh: '咨询' }, icon: '💡' },
  { key: 'custom_service', label: { en: 'Custom', zh: '定制' }, icon: '⚙️' },
];

const SORT_OPTIONS: { key: SortMode; label: { en: string; zh: string } }[] = [
  { key: 'latest', label: { en: 'Latest', zh: '最新' } },
  { key: 'budget_high', label: { en: 'Budget ↓', zh: '预算↓' } },
  { key: 'budget_low', label: { en: 'Budget ↑', zh: '预算↑' } },
  { key: 'deadline', label: { en: 'Urgent', zh: '紧急' } },
];

export default function TaskMarketScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
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
  const tr = (en: string, zh: string) => t({ en, zh });

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
        message: t({
          en: `${typeConf.icon} ${task.title}\n\n💰 Bounty: ${budget}\n📝 ${task.description.slice(0, 120)}...\n\n🔗 Apply now on Agentrix Bounty Board`,
          zh: `${typeConf.icon} ${task.title}\n\n💰 悬赏：${budget}\n📝 ${task.description.slice(0, 120)}...\n\n🔗 立即前往 Agentrix 悬赏板申请`,
        }),
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
    // 模拟 Milestone 数据，如果后端没有传，则默认显示启用托管
    const hasMilestones = true; 

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
            <Text style={[styles.typeBadgeText, { color: typeConf.color }]}>{t({ en: typeConf.label, zh: TYPE_LABEL_ZH[item.type] || typeConf.label })}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConf.color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: statusConf.color }]}>{t({ en: statusConf.label, zh: STATUS_LABEL_ZH[item.status] || statusConf.label })}</Text>
          </View>
          {isUrgent && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentText}>🔥 {tr('Urgent', '紧急')}</Text>
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

        {/* Tags & Milestone Badge */}
        <View style={styles.tagsRow}>
          {hasMilestones && (
            <View style={styles.milestoneBadge}>
              <Text style={styles.milestoneIcon}>🔒</Text>
              <Text style={styles.milestoneText}>{tr('Escrowed in Budget Pool', '已托管至预算池')}</Text>
            </View>
          )}
          {item.tags && item.tags.slice(0, 3).map((tag, i) => (
            <View key={i} style={styles.tagChip}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Bottom: Budget + Deadline + Publisher */}
        <View style={styles.taskBottom}>
          <View style={styles.budgetBox}>
            <Text style={styles.budgetLabel}>{tr('Bounty', '悬赏')}</Text>
            <Text style={styles.budgetValue}>{formatBudget(item.budget, item.currency)}</Text>
          </View>
          {daysLeft !== null && (
            <View style={styles.deadlineBox}>
              <Text style={styles.deadlineLabel}>{tr('Due', '截止')}</Text>
              <Text style={[styles.deadlineValue, isUrgent && { color: colors.warning }, isExpired && { color: colors.error }]}>
                {isExpired ? tr('Expired', '已过期') : t({ en: `${daysLeft}d`, zh: `${daysLeft}天` })}
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

  const bannerScrollRef = useRef<ScrollView>(null);
  const [bannerPage, setBannerPage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setBannerPage(prev => {
        const next = (prev + 1) % BANNER_SLIDES.length;
        bannerScrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
        return next;
      });
    }, 3600);
    return () => clearInterval(timer);
  }, []);

  const handleBannerPress = useCallback(async (id: string) => {
    if (id !== 'share') return;
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
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* TEST zone banner */}
      <View style={{ backgroundColor: '#ef444418', borderBottomWidth: 1, borderBottomColor: '#ef444433', paddingVertical: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ backgroundColor: '#ef4444', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>TEST</Text>
        </View>
        <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>{tr('This is a test area — task features are under development', '这是测试区域——任务功能仍在开发中')}</Text>
      </View>
      {/* Compact Banner Carousel (X402 / Share & Earn / How It Works) */}
      <View style={styles.bannerCarousel}>
        <ScrollView
          ref={bannerScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={ev => {
            const idx = Math.round(ev.nativeEvent.contentOffset.x / SCREEN_W);
            setBannerPage(idx);
          }}
        >
          {BANNER_SLIDES.map(b => (
            <TouchableOpacity
              key={b.id}
              activeOpacity={b.id === 'share' ? 0.75 : 1}
              onPress={() => handleBannerPress(b.id)}
              style={[styles.bannerSlide, { backgroundColor: b.bg, borderBottomColor: b.borderColor }]}
            >
              <Text style={styles.bannerSlideIcon}>{b.icon}</Text>
              {b.badge ? (
                <View style={[styles.bannerBadge, { borderColor: b.color }]}>
                  <Text style={[styles.bannerBadgeText, { color: b.color }]}>{b.badge}</Text>
                </View>
              ) : null}
              <View style={styles.bannerSlideTexts}>
                <Text style={[styles.bannerSlideTitle, { color: b.color }]}>{t(b.title)}</Text>
                <Text style={styles.bannerSlideSub} numberOfLines={1}>{t(b.sub)}</Text>
              </View>
              {b.id === 'x402' && <View style={styles.liveDot} />}
              {b.id === 'share' && <Text style={[styles.bannerArrow, { color: b.color }]}>›</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.bannerDots}>
          {BANNER_SLIDES.map((_, i) => (
            <View key={i} style={[styles.bannerDot, i === bannerPage && styles.bannerDotActive]} />
          ))}
        </View>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={tr('Search tasks...', '搜索任务…')}
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>{tr('Search', '搜索')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); handleSearch(); }}>
            <Text style={styles.searchCancel}>{tr('Cancel', '取消')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Type Filter Tabs */}
      <View style={styles.filterScrollWrapper}>
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
                {t(f.label)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
                {t(s.label)}
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
          <Text style={styles.loadingText}>{tr('Loading tasks...', '正在加载任务…')}</Text>
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
          ListHeaderComponent={<View style={{ height: 8 }} />}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} />
          ) : tasks.length > 0 && tasks.length >= total ? (
            <Text style={styles.endText}>{t({ en: `— All ${total} tasks loaded —`, zh: `— 已加载全部 ${total} 个任务 —` })}</Text>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{tr('No bounties yet', '暂无悬赏任务')}</Text>
              <Text style={styles.emptyText}>{tr('Be the first to post a task!', '来发布第一个任务吧！')}</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('PostTask')}
              >
                <Text style={styles.emptyBtnText}>+ {tr('Post Task', '发布任务')}</Text>
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
        <Text style={styles.fabText}>{tr('Post Task', '发布任务')}</Text>
      </TouchableOpacity>

      {/* Commission-tracked Share Bottom Sheet */}
      <ShareBottomSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        title={tr('Share task · Earn commission', '分享任务 · 赚取佣金')}
        shareContent={shareContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // Compact Banner Carousel
  bannerCarousel: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  bannerSlide: {
    width: SCREEN_W,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  bannerSlideIcon: { fontSize: 20 },
  bannerBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  bannerBadgeText: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.5 },
  bannerSlideTexts: { flex: 1 },
  bannerSlideTitle: { fontSize: 12, fontWeight: '700' as const, marginBottom: 1 },
  bannerSlideSub: { fontSize: 11, color: colors.muted },
  bannerArrow: { fontSize: 20, fontWeight: '700' as const },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22c55e' },
  bannerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 5,
  },
  bannerDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.muted + '50' },
  bannerDotActive: { width: 14, height: 5, borderRadius: 2.5, backgroundColor: colors.primary },
  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  searchBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  searchBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  searchCancel: { color: colors.muted, fontSize: 14, paddingHorizontal: 4 },
  // Filters
  filterScrollWrapper: { height: 48, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterScroll: { flexGrow: 0 },
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
  milestoneBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4, borderWidth: 1, borderColor: '#10B98130' },
  milestoneIcon: { fontSize: 10 },
  milestoneText: { fontSize: 10, color: '#10B981', fontWeight: '600' },
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
});
