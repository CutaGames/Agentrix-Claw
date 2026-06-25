// 技能市场首页
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { colors } from '../theme/colors';
import { marketplaceApi, SkillItem } from '../services/marketplace.api';
import { searchOpenClawHub } from '../services/openclawHub.service';
import { SkillCard } from '../components/market/SkillCard';
import { CategoryTabs } from '../components/market/CategoryTabs';

type MarketCategory = 'resources' | 'skills' | 'tasks' | 'openclaw';

// Banner data
const BANNERS = [
  { id: '1', emoji: '🤖', title: 'OpenClaw Skills', sub: '5200+ skills — 1-click install to your agent', bg: '#2563eb', action: 'openclaw' },
  { id: '2', emoji: '⚡', title: 'Top Weekly Skills', sub: 'Best rated tools of the week', bg: '#7c3aed', action: 'skills' },
  { id: '3', emoji: '🏆', title: 'Task Bounties', sub: 'Earn by completing AI tasks', bg: '#059669', action: 'tasks' },
];

interface Props {
  navigation: any;
}

export function MarketplaceScreen({ navigation }: Props) {
  const [category, setCategory] = useState<MarketCategory>('skills');
  const [subCategory, setSubCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeBanner, setActiveBanner] = useState(0);

  const subCategories = category === 'openclaw'
    ? ['All', 'Automation', 'AI Tools', 'Data', 'Web', 'Files', 'Social', 'Dev', 'Finance']
    : marketplaceApi.getSubCategories(category as any);

  const loadData = useCallback(async (reset: boolean = false) => {
    const currentPage = reset ? 1 : page;
    if (reset) {
      setLoading(true);
    }

    try {
      let result;
      if (category === 'openclaw') {
        // Use dedicated OpenClaw skill hub (5200+ real skills)
        result = await searchOpenClawHub({
          q: search || undefined,
          category: subCategory === 'All' ? undefined : subCategory,
          page: currentPage,
          limit: 20,
        });
      } else {
        result = await marketplaceApi.search({
          category: category as any,
          subCategory: subCategory === 'All' ? undefined : subCategory,
          q: search || undefined,
          page: currentPage,
          limit: 20,
        });
      }

      if (reset) {
        setItems(result.items);
      } else {
        setItems(prev => [...prev, ...result.items]);
      }
      setHasMore(currentPage < result.totalPages);
      setPage(currentPage + 1);
    } catch (e) {
      console.error('Failed to load marketplace:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, subCategory, search, page]);

  useEffect(() => {
    setPage(1);
    setItems([]);
    loadData(true);
  }, [category, subCategory]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setItems([]);
      loadData(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    loadData(true);
  }, [category, subCategory, search]);

  const onEndReached = useCallback(() => {
    if (!loading && hasMore) {
      loadData(false);
    }
  }, [loading, hasMore, page]);

  const handleSkillPress = useCallback((skill: SkillItem) => {
    navigation.navigate('SkillDetail', { skillId: skill.id, skillName: skill.name });
  }, [navigation]);

  const handlePromote = useCallback((skill: SkillItem) => {
    navigation.navigate('CreateLink', {
      skillId: skill.id,
      skillName: skill.name,
      skillPrice: skill.price,
      skillPriceUnit: skill.priceUnit,
    });
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: SkillItem }) => (
    <SkillCard
      skill={item}
      onPress={() => handleSkillPress(item)}
      onPromote={() => handlePromote(item)}
      showInstallBtn={category === 'openclaw'}
      onInstallToAgent={() => navigation.navigate('SkillInstall', { skillId: item.id, skillName: item.name })}
    />
  ), [handleSkillPress, handlePromote, category]);

  const renderHeader = () => (
    <View>
      {/* Animated Banner Carousel */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.bannerScroll}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / 320);
          setActiveBanner(idx);
        }}
      >
        {BANNERS.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.bannerCard, { backgroundColor: b.bg }]}
            onPress={() => {
              if (b.action === 'tasks') { navigation.navigate('TaskMarket'); return; }
              setCategory(b.action as MarketCategory);
              setSubCategory('All');
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.bannerEmoji}>{b.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>{b.title}</Text>
              <Text style={styles.bannerSub}>{b.sub}</Text>
            </View>
            <Text style={styles.bannerArrow}>→</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Pagination dots */}
      <View style={styles.bannerDots}>
        {BANNERS.map((_, i) => (
          <View key={i} style={[styles.bannerDot, i === activeBanner && styles.bannerDotActive]} />
        ))}
      </View>

      {/* 搜索栏 */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search skills, resources or tasks..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 四分类 Tab — Resources / Skills / OpenClaw Skills / Tasks */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabsRow}>
        {([
          { id: 'resources', label: '📦 Resources' },
          { id: 'skills', label: '⚡ Skills' },
          { id: 'openclaw', label: '🤖 OpenClaw' },
          { id: 'tasks', label: '🎯 Tasks' },
        ] as { id: MarketCategory; label: string }[]).map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.categoryTab, category === tab.id && styles.categoryTabActive]}
            onPress={() => {
              if (tab.id === 'tasks') { navigation.navigate('TaskMarket'); return; }
              setCategory(tab.id);
              setSubCategory('All');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryTabText, category === tab.id && styles.categoryTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* OpenClaw category description */}
      {category === 'openclaw' && (
        <View style={styles.openclawBanner}>
          <Text style={styles.openclawBannerText}>🤖 Install directly to your OpenClaw agent — 1-click compatible</Text>
        </View>
      )}

      {/* 子筛选 */}
      <View style={styles.subFilterRow}>
        {subCategories.map(sub => (
          <TouchableOpacity
            key={sub}
            style={[
              styles.subFilterChip,
              subCategory === sub && styles.subFilterChipActive,
            ]}
            onPress={() => setSubCategory(sub)}
          >
            <Text style={[
              styles.subFilterText,
              subCategory === sub && styles.subFilterTextActive,
            ]}>
              {sub}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔍</Text>
        <Text style={styles.emptyText}>No results</Text>
        <Text style={styles.emptySubtext}>Try different keywords or categories</Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!hasMore && items.length > 0) {
      return (
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>— All loaded —</Text>
        </View>
      );
    }
    if (loading && items.length > 0) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingBottom: 20,
  },
  // Banner Carousel
  bannerScroll: { marginTop: 12 },
  bannerCard: {
    width: 320, marginHorizontal: 16, borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 12, height: 90,
  },
  bannerEmoji: { fontSize: 34 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  bannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  bannerArrow: { fontSize: 22, color: 'rgba(255,255,255,0.8)' },
  bannerDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8, marginBottom: 4 },
  bannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.2)' },
  bannerDotActive: { backgroundColor: colors.primary, width: 16 },
  // Category tabs
  categoryTabsRow: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, gap: 8 },
  categoryTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  categoryTabActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  categoryTabText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  categoryTabTextActive: { color: colors.primary },
  openclawBanner: {
    marginHorizontal: 16, marginBottom: 8, backgroundColor: '#2563eb15',
    borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#2563eb33',
  },
  openclawBannerText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    padding: 0,
  },
  clearBtn: {
    color: colors.muted,
    fontSize: 16,
    paddingLeft: 8,
  },
  // Sub filters
  subFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  subFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subFilterChipActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  subFilterText: {
    color: colors.muted,
    fontSize: 13,
  },
  subFilterTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  // Footer
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    color: colors.muted,
    fontSize: 13,
  },
});
