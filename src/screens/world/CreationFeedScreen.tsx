/**
 * CreationFeedScreen — 🎬 创作流(类抖音 · 全屏竖向分页流)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design,ui-design}.md
 *   - 对照 ui-design.md §3「创作流 Feed(类抖音 · 全屏竖滑)」。
 *   - task 3.3:全屏竖向分页流 + 预览物渲染(预览 vs 进入分离,滑动不实例化体验)。
 *   - _Requirements: 5.1(竖向无限流,持续加载更多)、5.2(滑动只渲染轻量预览物,
 *     仅在显式进入时才加载完整体验)。
 *
 * 本屏职责(刻意收窄,避免与后续任务重叠):
 *   ✅ 全屏竖向分页容器(pagingEnabled + snapToInterval=屏高 + 竖向 FlatList)。
 *   ✅ 仅渲染轻量预览物(封面图 / 短视频首帧 / 回放截图)—— 滑动期间**不实例化**
 *      完整体验(ECS_World/游戏/直播间)。预览与进入彻底分离(需求 5.2)。
 *   ✅ 游标分页:`onEndReached` → 用 `nextCursor` 拉下一页(需求 5.1)。
 *   ✅ 下拉刷新重置(回到首页)。
 *   ✅ 进入完整体验是**独立的显式动作**(点主行动按钮才导航进体验宿主)。
 *
 * 本屏分工:
 *   - task 3.4(已落地):「带类型卡片协议」组件 `components/CreationCard` —— 按 CreationType
 *     渲染主行动(▶️玩/🛒买/🔴看/🎤现场/🚪逛)+ 右侧互动条(赞/评/享/关注/举报),
 *     乐观更新计数。本屏把它作为 renderItem 卡体。
 *
 * 本屏**不做**(留给后续任务,CreationCard 已留出插槽):
 *   - task 3.5:shop 卡流内快捷下单 → `CreationCard.onShopOrder`。
 *   - task 3.6/3.7:进行中直播直接进入(`onLivestreamEnter`)、预加载/省流、空流冷启动占位、帧率优化。
 *   - task 8.3:创作详情/留言页 → `CreationCard.onOpenComments`(未接入时 CreationCard 用内置 composer)。
 *
 * 进入体验:体验宿主统一屏为 task 5.3(`CreationExperience`)的范畴;在其落地前,
 * 本屏以现有 `PlotExperience` 作为占位目的地(两者参数同形:plotId/title)。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  type ViewToken,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { discoverCreations, discoverCreationsPublic } from '../../services/creationApi';
import { useAuthStore } from '../../stores/authStore';
import {
  preloadPreviewUris,
  selectUrisToPrefetch,
  shouldRenderPreview,
  isColdStartEmpty,
  prioritizeRenderableCovers,
} from '../../services/creationFeed';
import { CreationCard } from './components/CreationCard';
import { ShopQuickOrder } from './components/ShopQuickOrder';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import type { CreationDiscoveryItem } from '../../../shared/types/creation';
import type {
  DiscoverFeedResponse,
  FeedSort,
} from '../../../shared/types/creation-api';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'CreationFeed'>;

/** 每页条数(需求 5.1 持续加载更多)。 */
const PAGE_LIMIT = 10;

/** 顶部排序口径(对照 ui-design §3 顶部 [最新|热门|关注|附近])。 */
const SORT_TABS: { key: FeedSort; label: { zh: string; en: string } }[] = [
  { key: 'newest', label: { zh: '最新', en: 'Newest' } },
  { key: 'hot', label: { zh: '热门', en: 'Hot' } },
  { key: 'following', label: { zh: '关注', en: 'Following' } },
  { key: 'following', label: { zh: '关注', en: 'Following' } },
  { key: 'nearby', label: { zh: '附近', en: 'Nearby' } },
];

export function CreationFeedScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // G1:游客态可刷;未登录走公开只读发现,写动作(下单)在动作处引导登录。
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [sort, setSort] = useState<FeedSort>('newest');
  /** 分页容器的精确像素高度(用 onLayout 测量,作为单卡高度,保证整屏吸附)。 */
  const [pageHeight, setPageHeight] = useState(0);
  /** 当前居中可见的卡片 id(供 task 3.4/3.6 决定哪张卡"激活";本屏仅做轻量标记)。 */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** task 3.6:省流模式 —— 抑制视频/下一屏自动预加载,预览取静态缩略图(需求 5.10)。 */
  const [dataSaver, setDataSaver] = useState(false);
  /** task 3.5:当前打开「流内快捷下单」弹层的 shop 创作(null = 关闭)。 */
  const [orderItem, setOrderItem] = useState<CreationDiscoveryItem | null>(null);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setPageHeight((prev) => (prev === h ? prev : h));
  }, []);

  // 游标分页无限流:queryFn 透传 cursor;getNextPageParam 取后端 nextCursor(需求 5.1)。
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['creation-feed', sort, isAuthenticated],
    queryFn: async ({ pageParam }) => {
      const params = {
        mode: 'feed' as const,
        cursor: pageParam ?? undefined,
        sort,
        limit: PAGE_LIMIT,
      };
      // 未登录 → 公开只读发现(G1);已登录 → 常规发现(未来含关注个性化)。
      const res = isAuthenticated
        ? await discoverCreations(params)
        : await discoverCreationsPublic(params);
      // discoverCreations 是判别联合;feed 形态必返回 DiscoverFeedResponse。
      return res as DiscoverFeedResponse;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: 1,
    staleTime: 30_000,
  });

  const items: CreationDiscoveryItem[] = useMemo(
    () => {
      // 后端 feed 仅返回已过 Quality_Gate(published/listed)的创作(R7.3)。
      // task 9.2:不硬过滤「无 https 封面」的项(否则 Cover_Backfill 跑完前会掏空 Feed),
      // 改用稳定优先级排序把 Real_Cover_Image 创作前置到首屏,其余仍保留可见
      // (CreationCard 三态兜底保证非 https 封面也绝不黑屏)。见 creationFeed.prioritizeRenderableCovers。
      const flat = data?.pages.flatMap((p) => p.items) ?? [];
      return prioritizeRenderableCovers(flat);
    },
    [data],
  );

  /** 当前居中卡的下标(由 activeId 派生);-1 表示尚无激活卡。 */
  const activeIndex = useMemo(
    () => (activeId ? items.findIndex((it) => it.id === activeId) : -1),
    [activeId, items],
  );

  /**
   * task 3.7:已预热的预览 URI 集合(跨渲染保留),用于**避免对同一 URI 重复 prefetch**。
   * 切换排序口径(sort)或下拉刷新时重置,避免集合无限增长。
   */
  const prefetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    prefetchedRef.current = new Set();
  }, [sort]);

  // task 3.6/3.7:沿滑动方向预热下一屏预览图(N+1/N+2),省流模式不预加载(需求 5.6/5.10)。
  // 当前卡变化时提前 prefetch,保证上滑即显、不闪白;已预热的 URI 不再重复请求。
  useEffect(() => {
    if (activeIndex < 0) return;
    const candidates = preloadPreviewUris(items, activeIndex, dataSaver);
    const toPrefetch = selectUrisToPrefetch(candidates, prefetchedRef.current);
    for (const uri of toPrefetch) {
      prefetchedRef.current.add(uri);
      // Image.prefetch 仅预热网络/磁盘缓存,不实例化体验(需求 5.2 预览 vs 进入分离)。
      Image.prefetch(uri).catch(() => {
        // 预加载失败无副作用:撤回标记,真正渲染时再走正常加载,允许后续重试。
        prefetchedRef.current.delete(uri);
      });
    }
  }, [activeIndex, items, dataSaver]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 只在 ≥60% 可见时判定为"当前卡",避免半屏抖动误判。
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0]?.item as CreationDiscoveryItem | undefined;
      if (first) setActiveId(first.id);
    },
  ).current;

  /**
   * 进入完整体验 —— 独立的显式动作(需求 5.2:仅在用户显式进入时才加载完整体验)。
   * 体验宿主统一屏为 task 5.3;此前以现有 PlotExperience 占位(参数同形)。
   */
  const onEnter = useCallback(
    (item: CreationDiscoveryItem) => {
      navigation.navigate('CreationExperience', {
        creationId: item.id,
        type: item.type,
        title: item.title,
      });
    },
    [navigation],
  );

  /**
   * world-growth-mobile-experience · task 6.1 · R4.1:Feed 卡片轻点 → 打开创作详情。
   * 轻点封面/卡体 与 shop/place 主行动均走此,导航到 `CreationDetail`,并把已持有的
   * 发现投影项(item)一并透传,供详情展示封面 + 标题 + 创作者 + offerings(可下单项)+
   * 「进入/进去逛逛」按钮(无 get-by-id 端点,避免二次请求)。
   */
  const onOpenDetail = useCallback(
    (item: CreationDiscoveryItem) => {
      navigation.navigate('CreationDetail', {
        creationId: item.id,
        title: item.title,
        item,
      });
    },
    [navigation],
  );

  /**
   * task 3.5:shop 卡「流内快捷下单」—— 打开底部弹层(数量 + 下单),走权威交易。
   * 不进入完整体验即可成交(需求 5.7),由 ShopQuickOrder 经 invoke(order) 权威结算。
   */
  const onShopOrder = useCallback((item: CreationDiscoveryItem) => {
    // G1 写动作门:游客下单前引导登录(动作处,非入口拦截)。
    if (!isAuthenticated) {
      Alert.alert(
        t({ en: 'Sign in to order', zh: '登录后即可下单' }),
        t({ en: 'Own your own agent to shop, order and let it pay for you.', zh: '拥有你自己的 agent,即可下单、让它替你付款。' }),
      );
      return;
    }
    setOrderItem(item);
  }, [isAuthenticated, t]);

  /**
   * task 3.6:livestream/stage「进行中直接进入」(需求 5.8)。
   * 进入既有 AeonLiveStage 直播厅作为实时房间占位(task 5.3 统一体验宿主落地前的桥接);
   * 透传 roomId(用创作 id)与标题。CreationCard 已保证仅在活动进行中才调用本回调。
   */
  const onLivestreamEnter = useCallback(
    (item: CreationDiscoveryItem) => {
      navigation.navigate('AeonLiveStage', { roomId: item.id, title: item.title });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<CreationDiscoveryItem>) => (
      <CreationCard
        item={item}
        height={pageHeight}
        topInset={insets.top}
        bottomInset={insets.bottom}
        isActive={item.id === activeId}
        // task 3.7:仅为近屏窗口(当前卡 ± 半径)渲染重型预览物,离屏卡回收为占位,
        // 释放图片/视频资源,保证滑动帧率(需求 5.2/5.6)。
        renderPreview={shouldRenderPreview(index, activeIndex)}
        dataSaver={dataSaver}
        onEnter={onEnter}
        onShopOrder={onShopOrder}
        onLivestreamEnter={onLivestreamEnter}
        // task 6.1 · R4.1:轻点卡体 + shop/place 主行动 → 创作详情(detail-first)。
        onOpenDetail={onOpenDetail}
        t={t}
        // 其余 slots 留给后续任务:onOpenComments(8.3)。
      />
    ),
    [pageHeight, insets.top, insets.bottom, activeId, activeIndex, dataSaver, onEnter, onShopOrder, onLivestreamEnter, onOpenDetail, t],
  );

  // 固定卡高 = 容器高,供 getItemLayout 精确计算偏移(分页吸附 + 滚动性能)。
  const getItemLayout = useCallback(
    (_: ArrayLike<CreationDiscoveryItem> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {/* 全屏分页流:仅在测得容器高度后挂载,确保 snapToInterval 与卡高一致 */}
      {pageHeight > 0 ? (
        <FlatList
          testID="creation-feed-list"
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          // ── 抖音式整屏竖向分页 ──
          pagingEnabled
          snapToInterval={pageHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          // ── 游标分页 ──
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          // ── 当前卡标记(供 3.4/3.6) ──
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          // ── 下拉刷新重置 ──
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          // ── 性能:回收离屏卡,避免预览物常驻内存 ──
          windowSize={3}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
          removeClippedSubviews
          ListEmptyComponent={
            isLoading ? (
              <FeedFullscreenMessage
                height={pageHeight}
                node={<ActivityIndicator color={colors.accent} />}
                text={t({ zh: '正在加载创作流…', en: 'Loading feed…' })}
              />
            ) : isError ? (
              <FeedFullscreenMessage
                height={pageHeight}
                text={t({ zh: '加载失败,下拉重试。', en: 'Failed to load. Pull to retry.' })}
              />
            ) : isColdStartEmpty({ isLoading, isError, itemCount: items.length }) ? (
              // R7.4:加载完成、无错误且无可展示创作 → 可读空态 + 引导(去一句话创作 / 刷新 / 逛地图),
              // 而非空白或加载卡死。isColdStartEmpty 为纯函数,判定可单测。
              <ColdStartPlaceholder
                height={pageHeight}
                t={t}
                onCreate={() => navigation.navigate('CreationCreator')}
                onRefresh={refetch}
                onExploreMap={() => navigation.navigate('UnifiedWorldMap')}
              />
            ) : null
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null
          }
        />
      ) : null}

      {/* 顶部排序口径(对照 ui-design §3);绝对定位浮在全屏预览之上 */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          testID="creation-feed-back"
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>🎬 {t({ zh: '创作流', en: 'Feed' })}</Text>
        <Pressable
          testID="creation-feed-data-saver"
          onPress={() => setDataSaver((v) => !v)}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityState={{ checked: dataSaver }}
          accessibilityLabel={t({ zh: '省流模式', en: 'Data saver' })}
          style={[styles.saverBtn, dataSaver && styles.saverBtnActive]}
        >
          <Text style={[styles.saverText, dataSaver && styles.saverTextActive]}>
            {dataSaver ? `🌙 ${t({ zh: '省流', en: 'Saver' })}` : `📶 ${t({ zh: '省流', en: 'Saver' })}`}
          </Text>
        </Pressable>
        <View style={styles.sortTabs}>
          {SORT_TABS.map((tab) => {
            const selected = tab.key === sort;
            return (
              <Pressable
                key={tab.key}
                testID={`creation-feed-sort-${tab.key}`}
                onPress={() => setSort(tab.key)}
                hitSlop={6}
                style={styles.sortTab}
              >
                <Text style={[styles.sortText, selected && styles.sortTextActive]}>
                  {t(tab.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* task 3.5:shop 卡「流内快捷下单」底部弹层(走权威 invoke(order) 交易) */}
      <ShopQuickOrder
        item={orderItem}
        visible={orderItem !== null}
        onClose={() => setOrderItem(null)}
        bottomInset={insets.bottom}
        t={t}
      />
    </View>
  );
}

/** 全屏居中的状态信息(空 / 加载 / 失败),占满一整屏高,保持分页节律一致。 */
function FeedFullscreenMessage({
  height,
  text,
  node,
}: {
  height: number;
  text: string;
  node?: React.ReactNode;
}) {
  return (
    <View style={[styles.fullscreenMsg, { height }]}>
      {node}
      <Text style={styles.fullscreenMsgText}>{text}</Text>
    </View>
  );
}

// ============================================================
// 卡体由 task 3.4「带类型卡片协议」组件 `components/CreationCard` 承担,
// 本屏只负责全屏分页容器 + 顶部排序条 + 状态信息(空/加载/失败)。
// ============================================================

/**
 * 冷启动空态占位(task 3.6,需求 5.9/5.10):
 * 加载完成但暂无可刷创作时,给出友好引导(去创作 / 逛地图 / 刷新),而非空白屏。
 * 注:后端 feed 已含种子填充策略(task 3.2),此占位是"种子也为空"的最终兜底。
 */
function ColdStartPlaceholder({
  height,
  t,
  onCreate,
  onRefresh,
  onExploreMap,
}: {
  height: number;
  t: (d: { zh: string; en: string }) => string;
  onCreate: () => void;
  onRefresh: () => void;
  onExploreMap: () => void;
}) {
  return (
    <View testID="creation-feed-coldstart" style={[styles.coldStart, { height }]}>
      <Text style={styles.coldStartEmoji}>🌱</Text>
      <Text style={styles.coldStartTitle}>
        {t({ zh: '这里还很安静', en: "It's quiet here" })}
      </Text>
      <Text style={styles.coldStartText}>
        {t({
          zh: '创作流暂时没有内容。用「一句话创作」开一个属于你的世界,或刷新看看新鲜创作。',
          en: 'No creations yet. Create your own world in one sentence, or refresh for fresh ones.',
        })}
      </Text>
      {/* R7.4 主引导:去「一句话创作」(navigate CreationCreator) */}
      <Pressable
        testID="creation-feed-coldstart-create"
        accessibilityRole="button"
        style={({ pressed }) => [styles.coldStartBtn, pressed && styles.coldStartBtnPressed]}
        onPress={onCreate}
      >
        <Text style={styles.coldStartBtnText}>✨ {t({ zh: '一句话创作', en: 'Create in one line' })}</Text>
      </Pressable>
      {/* R7.4 次引导:刷新创作流(refetch) */}
      <Pressable
        testID="creation-feed-coldstart-refresh"
        accessibilityRole="button"
        style={({ pressed }) => [styles.coldStartBtnGhost, pressed && styles.coldStartBtnPressed]}
        onPress={onRefresh}
      >
        <Text style={styles.coldStartBtnGhostText}>↻ {t({ zh: '刷新创作流', en: 'Refresh feed' })}</Text>
      </Pressable>
      {/* 附加引导:逛世界地图 */}
      <Pressable
        testID="creation-feed-coldstart-explore"
        accessibilityRole="button"
        style={({ pressed }) => [styles.coldStartBtnGhost, pressed && styles.coldStartBtnPressed]}
        onPress={onExploreMap}
      >
        <Text style={styles.coldStartBtnGhostText}>🗺️ {t({ zh: '逛世界地图', en: 'Explore map' })}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // 顶部排序条
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 32 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginRight: 'auto' },
  sortTabs: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sortTab: { paddingVertical: 2 },
  sortText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  sortTextActive: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // 省流模式开关
  saverBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  saverBtnActive: { backgroundColor: colors.accent },
  saverText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
  saverTextActive: { color: colors.textInverse },

  // 冷启动空态占位
  coldStart: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  coldStartEmoji: { fontSize: 64 },
  coldStartTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  coldStartText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  coldStartBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    alignItems: 'center',
    minWidth: 200,
  },
  coldStartBtnPressed: { opacity: 0.8 },
  coldStartBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },
  coldStartBtnGhost: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 28,
    alignItems: 'center',
    minWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  coldStartBtnGhostText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // 全屏状态信息
  fullscreenMsg: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  fullscreenMsgText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  footer: { paddingVertical: 24, alignItems: 'center' },
}));

export default CreationFeedScreen;
