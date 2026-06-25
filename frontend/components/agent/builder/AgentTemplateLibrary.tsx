import { useEffect, useMemo, useState } from 'react';
import {
  AgentTemplate,
  agentTemplateApi,
} from '../../../lib/api/agent-template.api';
import { useToast } from '../../../contexts/ToastContext';
import { useLocalization } from '../../../contexts/LocalizationContext';

interface AgentTemplateLibraryProps {
  onSelect: (template: AgentTemplate) => void;
  selectedTemplateId?: string;
  showMarketplace?: boolean; // 是否显示模板市场
}

// Pre-defined UUIDs matching backend seed data
const DEFAULT_TEMPLATE_IDS = {
  SHOPPING: '11111111-1111-1111-1111-111111111101',
  MERCHANT: '11111111-1111-1111-1111-111111111102',
  DEVELOPER: '11111111-1111-1111-1111-111111111103',
  PROMOTION: '11111111-1111-1111-1111-111111111104',
  AIRDROP: '11111111-1111-1111-1111-111111111105',
  FINANCE: '11111111-1111-1111-1111-111111111106',
};

const FALLBACK_TEMPLATES: AgentTemplate[] = [
  {
    id: DEFAULT_TEMPLATE_IDS.SHOPPING,
    name: '购物+比价个人助手',
    description: '聚合商品搜索、自动比价、QuickPay 支付、订单跟踪的一站式个人Agent。支持多平台比价、智能推荐、自动下单和物流追踪。',
    category: 'shopping',
    persona: '善于比价的消费达人',
    tags: ['shopping', 'comparison', 'quickpay', 'order-tracking'],
    visibility: 'public',
    isFeatured: true,
    usageCount: 1200,
    config: {
      capabilities: ['search', 'auto_pay', 'cart', 'order_tracking', 'price_comparison'],
    },
    prompts: {},
  },
  {
    id: DEFAULT_TEMPLATE_IDS.MERCHANT,
    name: '商家收款&营销助手',
    description: '面向中小商家的多渠道收款、订单分析、自动营销、清结算Agent。支持法币/加密货币收款、智能营销和数据分析。',
    category: 'merchant',
    persona: '跨境电商运营专家',
    tags: ['merchant', 'marketing', 'analytics', 'payment-collection'],
    visibility: 'public',
    isFeatured: true,
    usageCount: 980,
    config: {
      capabilities: [
        'payment_collection',
        'order_analysis',
        'risk_center',
        'marketing_assistant',
        'settlement',
        'multi_currency',
      ],
    },
    prompts: {},
  },
  {
    id: DEFAULT_TEMPLATE_IDS.DEVELOPER,
    name: '开发者SDK/沙盒助手',
    description: '自动生成SDK、API调用代码、接入沙盒调试与DevOps自动化的开发者Agent。支持多语言SDK生成和API文档查询。',
    category: 'developer',
    persona: '全栈开发工程师',
    tags: ['developer', 'sdk', 'sandbox', 'api', 'devops'],
    visibility: 'public',
    isFeatured: true,
    usageCount: 650,
    config: {
      capabilities: ['sdk_generator', 'api_assistant', 'sandbox', 'devops', 'code_gen', 'documentation'],
    },
    prompts: {},
  },
  {
    id: DEFAULT_TEMPLATE_IDS.PROMOTION,
    name: '推广Agent / 联盟收益助手',
    description: '推广商户、推荐Agent、推广Marketplace和插件，获得永久分佣和持续收益的推广Agent。支持多级分销和佣金追踪。',
    category: 'promotion',
    persona: '推广达人/KOL',
    tags: ['promotion', 'alliance', 'commission', 'affiliate'],
    visibility: 'public',
    isFeatured: true,
    usageCount: 850,
    config: {
      capabilities: ['promotion', 'search', 'auto_pay', 'referral_tracking', 'commission_management'],
    },
    prompts: {},
  },
  {
    id: DEFAULT_TEMPLATE_IDS.AIRDROP,
    name: '空投捕获 / Auto-Earn 助手',
    description: '自动发现和参与空投活动、监控收益机会、管理多钱包资产的收益优化Agent。',
    category: 'airdrop',
    persona: '加密货币投资者',
    tags: ['airdrop', 'auto-earn', 'defi', 'yield'],
    visibility: 'public',
    isFeatured: true,
    usageCount: 720,
    config: {
      capabilities: ['airdrop_monitor', 'auto_claim', 'wallet_management', 'yield_optimization'],
    },
    prompts: {},
  },
  {
    id: DEFAULT_TEMPLATE_IDS.FINANCE,
    name: '个人财务管理助手',
    description: '管理个人财务、追踪支出、设置预算和投资建议的智能财务Agent。支持多币种资产管理和智能分析。',
    category: 'finance',
    persona: '理财顾问',
    tags: ['finance', 'budget', 'investment', 'expense-tracking'],
    visibility: 'public',
    isFeatured: true,
    usageCount: 560,
    config: {
      capabilities: ['expense_tracking', 'budget_management', 'investment_advice', 'asset_overview'],
    },
    prompts: {},
  },
];

export function AgentTemplateLibrary({
  onSelect,
  selectedTemplateId,
  showMarketplace = true,
}: AgentTemplateLibraryProps) {
  const { t } = useLocalization();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>();
  const [search, setSearch] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<AgentTemplate | null>(null);

  const categories = [
    { id: 'all', label: t({ zh: '全部', en: 'All' }) },
    { id: 'shopping', label: t({ zh: '自动购物 / 比价', en: 'Shopping / Price Comparison' }), type: 'user' as const },
    { id: 'airdrop', label: t({ zh: '空投捕获 / Auto-Earn', en: 'Airdrop / Auto-Earn' }), type: 'user' as const },
    { id: 'promotion', label: t({ zh: '推广Agent / 联盟收益', en: 'Promotion / Alliance' }), type: 'user' as const },
    { id: 'finance', label: t({ zh: '财务管理', en: 'Finance Management' }), type: 'user' as const },
    { id: 'merchant', label: t({ zh: '商户小二 / 销售', en: 'Merchant / Sales' }), type: 'merchant' as const },
    { id: 'developer', label: t({ zh: '开发者 SDK / API', en: 'Developer SDK / API' }), type: 'developer' as const },
  ];

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await agentTemplateApi.getTemplates({
          category: activeCategory,
          search,
        });
        if (!data || data.length === 0) {
          setTemplates(FALLBACK_TEMPLATES);
        } else {
          setTemplates(data);
        }
      } catch (err: any) {
        setError(err.message || '加载模板失败');
        setTemplates(FALLBACK_TEMPLATES);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, [activeCategory, search]);

  const grouped = useMemo(() => {
    if (!activeCategory) return templates;
    return templates.filter((tpl) => tpl.category === activeCategory);
  }, [templates, activeCategory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder={t({ zh: '搜索模板 / 功能 / Persona', en: 'Search templates / features / Persona' })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <span className="absolute right-3 top-2.5 text-gray-400 text-sm">⌘K</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(undefined)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              !activeCategory
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {t({ zh: '全部', en: 'All' })}
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                activeCategory === category.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center text-gray-500 py-8">
          {t({ zh: '加载模板中...', en: 'Loading templates...' })}
        </div>
      )}
      {error && (
        <div className="text-center text-red-500 py-8 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.map((template) => (
            <div
              key={template.id}
              className={`text-left p-5 rounded-2xl border transition-all hover:shadow-lg ${
                selectedTemplateId === template.id
                  ? 'border-blue-500 bg-blue-50/60'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {template.category}
                </span>
                <div className="flex items-center gap-2">
                  {template.isFeatured && (
                    <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full font-semibold">
                      {t({ zh: '推荐', en: 'Featured' })}
                    </span>
                  )}
                  {template.metadata?.isPremium && (
                    <span className="px-2 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded-full font-semibold">
                      {t({ zh: '高级', en: 'Premium' })}
                    </span>
                  )}
                  <button
                    onClick={() => setPreviewTemplate(template)}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    {t({ zh: '预览', en: 'Preview' })}
                  </button>
                </div>
              </div>
              <button onClick={() => onSelect(template)} className="w-full text-left">
                <h4 className="text-lg font-semibold text-gray-900 mb-2">{template.name}</h4>
                <p className="text-sm text-gray-600 line-clamp-3">{template.description}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {template.tags?.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                    >
                      #{tag}
                    </span>
                  ))}
                  <div className="flex items-center gap-2 ml-auto">
                    {template.metadata?.price ? (
                      <span className="text-xs font-semibold text-purple-600">
                        ${template.metadata.price}
                      </span>
                    ) : (
                      <span className="text-xs text-green-600 font-semibold">
                        {t({ zh: '免费', en: 'Free' })}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      💹 {template.usageCount} {t({ zh: '个 Agent 正在使用', en: 'agents using' })}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400">
                  {t({ zh: '模板详情', en: 'Template Details' })}
                </p>
                <h3 className="text-lg font-semibold text-gray-900">{previewTemplate.name}</h3>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
                ×
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-sm text-gray-600">{previewTemplate.description}</p>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <p className="text-xs text-gray-400">{t({ zh: '分类', en: 'Category' })}</p>
                  <p>{previewTemplate.category}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Persona</p>
                  <p>{previewTemplate.persona || t({ zh: '未设置', en: 'Not set' })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t({ zh: '可见性', en: 'Visibility' })}</p>
                  <p>{previewTemplate.visibility}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t({ zh: '使用数', en: 'Usage Count' })}</p>
                  <p>{previewTemplate.usageCount}</p>
                </div>
              </div>
              {previewTemplate.config && (
                <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600">
                  <p className="font-semibold mb-2">{t({ zh: '配置', en: 'Configuration' })}</p>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(previewTemplate.config, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

