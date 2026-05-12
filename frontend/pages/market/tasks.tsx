/**
 * /market/tasks — 任务市场页面 (Task Marketplace)
 *
 * 展示宠物可接受的任务列表，支持任务类型过滤、排序选择器、
 * 详情面板展开 + MobileDeepLink、JSON-LD 结构化数据、
 * skeleton loading、错误处理。
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.4, 10.3
 */

import { useState, useMemo, useCallback } from 'react';
import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import { X, RefreshCw, AlertCircle } from 'lucide-react';
import { MarketplaceLayout } from '../../components/marketplace/MarketplaceLayout';
import { TaskCard } from '../../components/marketplace/TaskCard';
import { TaskBidModal } from '../../components/marketplace/TaskBidModal';
import { MobileDeepLink } from '../../components/marketplace/MobileDeepLink';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  fetchMarketTasks,
  MarketTasksResponse,
  TaskListItem,
} from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TasksPageProps {
  initialData: MarketTasksResponse;
  error: boolean;
}

type SortOption = 'newest' | 'highest_reward' | 'deadline_soonest';

interface SortConfig {
  sortBy: 'createdAt' | 'budget' | 'deadline';
  sortOrder: 'ASC' | 'DESC';
}

const SORT_MAP: Record<SortOption, SortConfig> = {
  newest: { sortBy: 'createdAt', sortOrder: 'DESC' },
  highest_reward: { sortBy: 'budget', sortOrder: 'DESC' },
  deadline_soonest: { sortBy: 'deadline', sortOrder: 'ASC' },
};

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<TasksPageProps> = async () => {
  let initialData: MarketTasksResponse = { items: [], total: 0, page: 1, totalPages: 0 };
  let error = false;

  try {
    initialData = await fetchMarketTasks({ sortBy: 'createdAt', sortOrder: 'DESC' });
  } catch {
    error = true;
  }

  return {
    props: {
      initialData,
      error,
    },
  };
};

// ---------------------------------------------------------------------------
// JSON-LD Generator
// ---------------------------------------------------------------------------

export function generateTaskJsonLd(task: TaskListItem) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: task.title,
    description: task.description,
    price: task.rewardAmount,
    priceCurrency: task.currency || 'USD',
  };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TaskCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-700 bg-gray-800/50 p-4 animate-pulse">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="h-5 w-20 rounded-full bg-gray-700" />
        <div className="h-4 w-16 rounded bg-gray-700" />
      </div>
      {/* Title */}
      <div className="mb-1.5 h-4 w-3/4 rounded bg-gray-700" />
      {/* Description */}
      <div className="mb-1 h-3 w-full rounded bg-gray-700" />
      <div className="mb-3 h-3 w-2/3 rounded bg-gray-700" />
      {/* Skills tags */}
      <div className="mb-3 flex gap-1.5">
        <div className="h-4 w-14 rounded-md bg-gray-700" />
        <div className="h-4 w-12 rounded-md bg-gray-700" />
        <div className="h-4 w-16 rounded-md bg-gray-700" />
      </div>
      {/* Footer */}
      <div className="border-t border-gray-700/50 pt-3">
        <div className="flex gap-3">
          <div className="h-3 w-20 rounded bg-gray-700" />
          <div className="h-3 w-14 rounded bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksMarketplacePage({
  initialData,
  error: initialError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useLocalization();

  const [items, setItems] = useState<TaskListItem[]>(initialData.items);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(initialError);
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedSort, setSelectedSort] = useState<SortOption>('newest');
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);
  const [bidModalTask, setBidModalTask] = useState<TaskListItem | null>(null);

  // -------------------------------------------------------------------------
  // Derived: unique task types from data
  // -------------------------------------------------------------------------

  const taskTypes = useMemo(() => {
    const types = new Set<string>();
    items.forEach((item) => {
      if (item.taskType) types.add(item.taskType);
    });
    return ['All', ...Array.from(types).sort()];
  }, [items]);

  // -------------------------------------------------------------------------
  // Filtered items (client-side type filter)
  // -------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    if (selectedType === 'All') return items;
    return items.filter((item) => item.taskType === selectedType);
  }, [items, selectedType]);

  // -------------------------------------------------------------------------
  // Fetch with sort params
  // -------------------------------------------------------------------------

  const fetchWithSort = useCallback(async (sort: SortOption, type?: string) => {
    setIsLoading(true);
    setHasError(false);
    const config = SORT_MAP[sort];
    try {
      const res = await fetchMarketTasks({
        sortBy: config.sortBy,
        sortOrder: config.sortOrder,
        ...(type && type !== 'All' ? { type } : {}),
      });
      setItems(res.items);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Sort change handler
  // -------------------------------------------------------------------------

  const handleSortChange = useCallback(
    (sort: SortOption) => {
      setSelectedSort(sort);
      fetchWithSort(sort, selectedType);
    },
    [fetchWithSort, selectedType],
  );

  // -------------------------------------------------------------------------
  // Retry handler
  // -------------------------------------------------------------------------

  const handleRetry = useCallback(() => {
    fetchWithSort(selectedSort, selectedType);
  }, [fetchWithSort, selectedSort, selectedType]);

  // -------------------------------------------------------------------------
  // Task selection
  // -------------------------------------------------------------------------

  const handleSelectTask = useCallback((task: TaskListItem) => {
    setSelectedTask((prev) => (prev?.id === task.id ? null : task));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTask(null);
  }, []);

  // -------------------------------------------------------------------------
  // SEO
  // -------------------------------------------------------------------------

  const seo = buildSeo({
    title: 'Agentrix Task Marketplace',
    description: t({
      zh: '浏览和发现宠物可接受的任务，赚取奖励和 AXP。在 Agentrix 移动端接受任务。',
      en: 'Browse and discover tasks for your pet to earn rewards and AXP. Accept tasks on the Agentrix mobile app.',
    }),
    path: '/market/tasks',
  });

  // -------------------------------------------------------------------------
  // Sort options config
  // -------------------------------------------------------------------------

  const sortOptions: { key: SortOption; labelZh: string; labelEn: string }[] = [
    { key: 'newest', labelZh: '最新', labelEn: 'Newest' },
    { key: 'highest_reward', labelZh: '最高奖励', labelEn: 'Highest Reward' },
    { key: 'deadline_soonest', labelZh: '截止最近', labelEn: 'Deadline Soonest' },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <MarketplaceLayout seo={seo} activeSection="tasks">
      {/* JSON-LD structured data for each task */}
      <Head>
        {filteredItems.map((task) => (
          <script
            key={task.id}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(generateTaskJsonLd(task)),
            }}
          />
        ))}
      </Head>

      <div className="container mx-auto px-4 py-6 md:px-6">
        {/* ─── Page Header ─── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {t({ zh: '任务市场', en: 'Task Marketplace' })}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {t({
              zh: '发现任务，让你的宠物赚取奖励和 AXP',
              en: 'Discover tasks for your pet to earn rewards and AXP',
            })}
          </p>
        </div>

        {/* ─── Task Type Filter (horizontal pill buttons) ─── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {taskTypes.map((type) => {
            const isActive = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {type === 'All' ? t({ zh: '全部', en: 'All' }) : type}
              </button>
            );
          })}
        </div>

        {/* ─── Sort Selector (pill buttons) ─── */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 mr-1">
            {t({ zh: '排序:', en: 'Sort:' })}
          </span>
          {sortOptions.map((opt) => {
            const isActive = selectedSort === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSortChange(opt.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {t({ zh: opt.labelZh, en: opt.labelEn })}
              </button>
            );
          })}
        </div>

        {/* ─── Content ─── */}
        {isLoading ? (
          // Skeleton loading
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <TaskCardSkeleton key={i} />
            ))}
          </div>
        ) : hasError ? (
          // Error state
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle size={40} className="mb-3 text-red-400" />
            <p className="mb-4 text-gray-400">
              {t({
                zh: '加载任务列表失败，请重试',
                en: 'Failed to load tasks. Please try again.',
              })}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-gray-600 hover:bg-gray-700"
            >
              <RefreshCw size={14} />
              {t({ zh: '重试', en: 'Retry' })}
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-gray-400">
              {t({
                zh: '暂无可用任务',
                en: 'No tasks available',
              })}
            </p>
          </div>
        ) : (
          // Tasks grid + detail panel
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Grid */}
            <div className={`flex-1 ${selectedTask ? 'lg:max-w-[60%]' : ''}`}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onSelect={handleSelectTask}
                    isSelected={selectedTask?.id === task.id}
                  />
                ))}
              </div>
            </div>

            {/* Detail Panel */}
            {selectedTask && (
              <aside className="w-full shrink-0 lg:w-[380px]">
                <div className="sticky top-20 rounded-xl border border-gray-700 bg-gray-800/80 p-5">
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                    aria-label={t({ zh: '关闭详情', en: 'Close details' })}
                  >
                    <X size={16} />
                  </button>

                  {/* Task title */}
                  <h2 className="mb-2 pr-8 text-lg font-bold text-white">
                    {selectedTask.title}
                  </h2>

                  {/* Task type badge */}
                  <span className="mb-3 inline-block rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">
                    {selectedTask.taskType}
                  </span>

                  {/* Full description */}
                  <p className="mb-4 text-sm leading-relaxed text-gray-300">
                    {selectedTask.description}
                  </p>

                  {/* Reward */}
                  <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t({ zh: '奖励', en: 'Reward' })}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-green-400">
                        ${selectedTask.rewardAmount.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {selectedTask.currency || 'USD'}
                      </span>
                    </div>
                  </div>

                  {/* AXP Bonus */}
                  {selectedTask.axpBonus > 0 && (
                    <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-yellow-500">
                        {t({ zh: 'AXP 奖励', en: 'AXP Bonus' })}
                      </h3>
                      <p className="text-sm font-semibold text-yellow-400">
                        +{selectedTask.axpBonus} AXP
                      </p>
                    </div>
                  )}

                  {/* Required Skills */}
                  {selectedTask.requiredSkills.length > 0 && (
                    <div className="mb-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {t({ zh: '所需技能', en: 'Required Skills' })}
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.requiredSkills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-md bg-gray-700/60 px-2 py-0.5 text-[11px] font-medium text-gray-300"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deadline */}
                  {selectedTask.deadline && (
                    <div className="mb-4">
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {t({ zh: '截止日期', en: 'Deadline' })}
                      </h3>
                      <p className="text-sm text-gray-300">
                        {new Date(selectedTask.deadline).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  )}

                  {/* Primary CTA: Accept Task */}
                  <button
                    type="button"
                    onClick={() => setBidModalTask(selectedTask)}
                    className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-green-500"
                  >
                    {t({ zh: '接受任务', en: 'Accept Task' })}
                  </button>

                  {/* Secondary: Mobile Deep Link */}
                  <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">
                      {t({ zh: '也可在 App 中接受', en: 'Also available on mobile' })}
                    </p>
                    <MobileDeepLink
                      action="accept_task"
                      resourceId={selectedTask.id}
                      showQR={false}
                    />
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* ─── Total count ─── */}
        {!isLoading && !hasError && filteredItems.length > 0 && (
          <p className="mt-6 text-center text-xs text-gray-500">
            {t({
              zh: `共 ${filteredItems.length} 个任务`,
              en: `${filteredItems.length} tasks total`,
            })}
          </p>
        )}
      </div>

      {/* Task Bid Modal */}
      <TaskBidModal
        task={bidModalTask}
        open={!!bidModalTask}
        onClose={() => setBidModalTask(null)}
      />
    </MarketplaceLayout>
  );
}
