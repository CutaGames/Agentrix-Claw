/**
 * Intent-Based Navigation V2.0
 * 
 * 意图型分类导航：
 * - 从技术层级 (infra/resource/logic/composite) 
 * - 转换为用户意图 ("我要购物"/"我要办证"/"我要分析")
 */

import React, { useState } from 'react';
import {
  ShoppingBag,
  FileCheck,
  BarChart3,
  Briefcase,
  Rocket,
  Wrench,
  Sparkles,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Clock,
  Star,
  Zap,
  Package,
} from 'lucide-react';

export type IntentCategory = 
  | 'shopping'      // 我要购物 - 电商商品
  | 'services'      // 我要办事 - 各类服务  
  | 'analysis'      // 我要分析 - 数据/报告
  | 'development'   // 我要开发 - 开发者工具
  | 'automation'    // 我要自动化 - Agent 工作流
  | 'all';          // 全部

export interface IntentNavItem {
  id: IntentCategory;
  icon: React.ReactNode;
  label: string;
  labelZh: string;
  description: string;
  descriptionZh: string;
  // 映射到的技术层级
  layers: ('infra' | 'resource' | 'logic' | 'composite')[];
  // 映射到的 valueType
  valueTypes?: ('action' | 'deliverable' | 'decision' | 'data')[];
  // 子分类
  subcategories?: {
    id: string;
    label: string;
    labelZh: string;
    count?: number;
  }[];
}

export interface IntentNavProps {
  selectedIntent: IntentCategory;
  onIntentChange: (intent: IntentCategory) => void;
  selectedSubcategory?: string;
  onSubcategoryChange?: (subcategory: string | undefined) => void;
  counts?: Record<IntentCategory, number>;
  locale?: 'zh' | 'en';
}

// 意图导航配置
export const intentNavConfig: IntentNavItem[] = [
  {
    id: 'all',
    icon: <Sparkles className="w-5 h-5" />,
    label: 'Explore All',
    labelZh: '发现全部',
    description: 'Browse all available capabilities',
    descriptionZh: '浏览所有可用能力',
    layers: ['infra', 'resource', 'logic', 'composite'],
  },
  {
    id: 'shopping',
    icon: <ShoppingBag className="w-5 h-5" />,
    label: 'Shopping',
    labelZh: '我要购物',
    description: 'Products & physical goods',
    descriptionZh: '商品与实物',
    layers: ['resource'],
    valueTypes: ['action', 'deliverable'],
    subcategories: [
      { id: 'digital', label: 'Digital Goods', labelZh: '数字商品' },
      { id: 'physical', label: 'Physical Products', labelZh: '实物商品' },
      { id: 'gift-cards', label: 'Gift Cards', labelZh: '礼品卡' },
    ],
  },
  {
    id: 'services',
    icon: <FileCheck className="w-5 h-5" />,
    label: 'Get Things Done',
    labelZh: '我要办事',
    description: 'Professional services & tasks',
    descriptionZh: '专业服务与任务',
    layers: ['resource', 'logic'],
    valueTypes: ['action', 'deliverable', 'decision'],
    subcategories: [
      { id: 'legal', label: 'Legal Services', labelZh: '法律服务' },
      { id: 'finance', label: 'Financial Services', labelZh: '金融服务' },
      { id: 'translation', label: 'Translation', labelZh: '翻译服务' },
      { id: 'design', label: 'Design Services', labelZh: '设计服务' },
    ],
  },
  {
    id: 'analysis',
    icon: <BarChart3 className="w-5 h-5" />,
    label: 'Analyze & Research',
    labelZh: '我要分析',
    description: 'Data, reports & insights',
    descriptionZh: '数据、报告与洞察',
    layers: ['logic'],
    valueTypes: ['data', 'decision', 'deliverable'],
    subcategories: [
      { id: 'market-research', label: 'Market Research', labelZh: '市场调研' },
      { id: 'data-analysis', label: 'Data Analysis', labelZh: '数据分析' },
      { id: 'competitor', label: 'Competitor Analysis', labelZh: '竞品分析' },
    ],
  },
  {
    id: 'development',
    icon: <Wrench className="w-5 h-5" />,
    label: 'Developer Tools',
    labelZh: '开发者工具',
    description: 'APIs, SDKs & integrations',
    descriptionZh: 'API、SDK 与集成',
    layers: ['infra', 'logic'],
    subcategories: [
      { id: 'payment', label: 'Payment APIs', labelZh: '支付接口' },
      { id: 'ai-models', label: 'AI Models', labelZh: 'AI 模型' },
      { id: 'data-sources', label: 'Data Sources', labelZh: '数据源' },
    ],
  },
  {
    id: 'automation',
    icon: <Rocket className="w-5 h-5" />,
    label: 'Automation',
    labelZh: '自动化流程',
    description: 'Workflows & Agent orchestration',
    descriptionZh: '工作流与 Agent 编排',
    layers: ['composite'],
    subcategories: [
      { id: 'workflows', label: 'Ready Workflows', labelZh: '即用工作流' },
      { id: 'templates', label: 'Templates', labelZh: '模板' },
      { id: 'multi-agent', label: 'Multi-Agent', labelZh: '多 Agent 协作' },
    ],
  },
];

// 快捷筛选选项
export const quickFilters = [
  { id: 'trending', icon: <TrendingUp className="w-4 h-4" />, label: 'Trending', labelZh: '热门' },
  { id: 'new', icon: <Clock className="w-4 h-4" />, label: 'New', labelZh: '最新' },
  { id: 'top-rated', icon: <Star className="w-4 h-4" />, label: 'Top Rated', labelZh: '高评分' },
  { id: 'instant', icon: <Zap className="w-4 h-4" />, label: 'Instant', labelZh: '即时调用' },
  { id: 'delivery', icon: <Package className="w-4 h-4" />, label: 'Delivery', labelZh: '物流配送' },
];

export const IntentNavigation: React.FC<IntentNavProps> = ({
  selectedIntent,
  onIntentChange,
  selectedSubcategory,
  onSubcategoryChange,
  counts = {},
  locale = 'zh',
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set([selectedIntent]));

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const t = (item: { label: string; labelZh: string }) => 
    locale === 'zh' ? item.labelZh : item.label;

  const tDesc = (item: { description: string; descriptionZh: string }) => 
    locale === 'zh' ? item.descriptionZh : item.description;

  return (
    <nav className="space-y-1">
      {/* 意图分类 */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
          {locale === 'zh' ? '我想要...' : 'I want to...'}
        </h3>
        {intentNavConfig.map((item) => {
          const isSelected = selectedIntent === item.id;
          const isExpanded = expandedItems.has(item.id);
          const hasSubcategories = item.subcategories && item.subcategories.length > 0;
          const count = counts[item.id] || 0;

          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  onIntentChange(item.id);
                  if (hasSubcategories) {
                    toggleExpand(item.id);
                  }
                  // 清空子分类选择
                  onSubcategoryChange?.(undefined);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={isSelected ? 'text-blue-600' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left text-sm">{t(item)}</span>
                {count > 0 && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {count}
                  </span>
                )}
                {hasSubcategories && (
                  <span className="text-slate-400">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                )}
              </button>

              {/* 子分类 */}
              {hasSubcategories && isExpanded && (
                <div className="ml-8 mt-1 space-y-0.5">
                  {item.subcategories!.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => {
                        onIntentChange(item.id);
                        onSubcategoryChange?.(sub.id);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                        selectedSubcategory === sub.id
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }`}
                    >
                      <span className="flex-1 text-left">{t(sub as any)}</span>
                      {sub.count !== undefined && (
                        <span className="text-xs text-slate-400">{sub.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 快捷筛选 */}
      <div className="pt-4 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">
          {locale === 'zh' ? '快捷筛选' : 'Quick Filters'}
        </h3>
        <div className="flex flex-wrap gap-1.5 px-3">
          {quickFilters.map((filter) => (
            <button
              key={filter.id}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              {filter.icon}
              {locale === 'zh' ? filter.labelZh : filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* 协议说明 */}
      <div className="pt-4 mt-4 border-t border-slate-100 px-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {locale === 'zh' ? '图标说明' : 'Icons'}
        </h3>
        <div className="space-y-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>{locale === 'zh' ? '瞬时调用 · 按次计费' : 'Instant Call · Pay per Use'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span>{locale === 'zh' ? '物流配送 · 实物交付' : 'Delivery · Physical Goods'}</span>
          </div>
        </div>
      </div>
    </nav>
  );
};

// 辅助函数：将意图转换为层级筛选
export function intentToLayerFilter(intent: IntentCategory): ('infra' | 'resource' | 'logic' | 'composite')[] {
  const config = intentNavConfig.find(c => c.id === intent);
  return config?.layers || ['infra', 'resource', 'logic', 'composite'];
}

// 辅助函数：将意图转换为 valueType 筛选
export function intentToValueTypeFilter(intent: IntentCategory): ('action' | 'deliverable' | 'decision' | 'data')[] | undefined {
  const config = intentNavConfig.find(c => c.id === intent);
  return config?.valueTypes;
}

export default IntentNavigation;
