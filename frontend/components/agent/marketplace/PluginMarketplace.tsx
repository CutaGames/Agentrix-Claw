import { useState, useEffect, useMemo } from 'react';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useToast } from '../../../contexts/ToastContext';

export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: 'payment' | 'analytics' | 'marketing' | 'integration' | 'custom';
  price: number;
  currency: string;
  isFree: boolean;
  isInstalled: boolean;
  rating: number;
  downloadCount: number;
  icon?: string;
  screenshots?: string[];
  capabilities?: string[];
  metadata?: Record<string, any>;
}

interface PluginMarketplaceProps {
  role: 'user' | 'merchant' | 'developer';
  installedPlugins?: string[];
  onInstall?: (pluginId: string) => Promise<void>;
  onUninstall?: (pluginId: string) => Promise<void>;
  onPurchase?: (pluginId: string) => Promise<void>;
}

/**
 * 插件市场组件
 * 提供插件浏览、安装、购买、管理功能
 */
export function PluginMarketplace({
  role,
  installedPlugins = [],
  onInstall,
  onUninstall,
  onPurchase,
}: PluginMarketplaceProps) {
  const { t } = useLocalization();
  const { success, error } = useToast();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'newest' | 'price'>('popular');
  const [showInstalledOnly, setShowInstalledOnly] = useState(false);

  // 加载插件列表
  useEffect(() => {
    loadPlugins();
  }, [role]);

  const loadPlugins = async () => {
    setLoading(true);
    try {
      // 调用后端 API 获取插件列表
      const { pluginApi } = await import('../../../lib/api/plugin.api');
      try {
        const data = await pluginApi.getPlugins({ 
          role: role === 'user' ? undefined : role,
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
        });
        setPlugins(data.map((p: any) => ({
          ...p,
          isInstalled: installedPlugins.includes(p.id),
        })));
      } catch (apiError: any) {
        // 如果 API 调用失败，使用模拟数据作为后备
        console.warn('插件 API 调用失败，使用模拟数据:', apiError);
        const mockPlugins = getMockPluginsByRole(role, t);
        setPlugins(mockPlugins.map((p) => ({
          ...p,
          isInstalled: installedPlugins.includes(p.id),
        })));
      }
    } catch (err: any) {
      error(err.message || t({ zh: '加载插件失败', en: 'Failed to load plugins' }));
    } finally {
      setLoading(false);
    }
  };

  // 过滤和排序插件
  const filteredPlugins = useMemo(() => {
    let filtered = plugins;

    // 搜索过滤
    if (searchQuery) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 分类过滤
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // 已安装过滤
    if (showInstalledOnly) {
      filtered = filtered.filter((p) => p.isInstalled);
    }

    // 排序
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.downloadCount - a.downloadCount;
        case 'rating':
          return b.rating - a.rating;
        case 'newest':
          return new Date(b.metadata?.createdAt || 0).getTime() - new Date(a.metadata?.createdAt || 0).getTime();
        case 'price':
          return a.price - b.price;
        default:
          return 0;
      }
    });

    return filtered;
  }, [plugins, searchQuery, selectedCategory, sortBy, showInstalledOnly]);

  const handleInstall = async (plugin: Plugin) => {
    if (plugin.isInstalled) {
      // 卸载
      if (onUninstall) {
        try {
          await onUninstall(plugin.id);
          setPlugins((prev) =>
            prev.map((p) => (p.id === plugin.id ? { ...p, isInstalled: false } : p))
          );
          success(t({ zh: '插件已卸载', en: 'Plugin uninstalled' }));
        } catch (err: any) {
          error(err.message || t({ zh: '卸载失败', en: 'Uninstall failed' }));
        }
      }
    } else {
      // 安装
      if (plugin.isFree) {
        // 免费插件直接安装
        if (onInstall) {
          try {
            await onInstall(plugin.id);
            setPlugins((prev) =>
              prev.map((p) => (p.id === plugin.id ? { ...p, isInstalled: true } : p))
            );
            success(t({ zh: '插件已安装', en: 'Plugin installed' }));
          } catch (err: any) {
            error(err.message || t({ zh: '安装失败', en: 'Install failed' }));
          }
        }
      } else {
        // 付费插件需要购买
        if (onPurchase) {
          try {
            await onPurchase(plugin.id);
            success(t({ zh: '购买成功，正在安装...', en: 'Purchase successful, installing...' }));
            // 购买后自动安装
            if (onInstall) {
              await onInstall(plugin.id);
              setPlugins((prev) =>
                prev.map((p) => (p.id === plugin.id ? { ...p, isInstalled: true } : p))
              );
            }
          } catch (err: any) {
            error(err.message || t({ zh: '购买失败', en: 'Purchase failed' }));
          }
        }
      }
    }
  };

  const categories = [
    { id: 'all', label: t({ zh: '全部', en: 'All' }) },
    { id: 'payment', label: t({ zh: '支付', en: 'Payment' }) },
    { id: 'analytics', label: t({ zh: '分析', en: 'Analytics' }) },
    { id: 'marketing', label: t({ zh: '营销', en: 'Marketing' }) },
    { id: 'integration', label: t({ zh: '集成', en: 'Integration' }) },
    { id: 'custom', label: t({ zh: '自定义', en: 'Custom' }) },
  ];

  return (
    <div className="space-y-6">
      {/* 搜索和筛选 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* 搜索框 */}
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t({ zh: '搜索插件...', en: 'Search plugins...' })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 分类筛选 */}
          <div className="flex gap-2 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 排序 */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="popular">{t({ zh: '最受欢迎', en: 'Most Popular' })}</option>
            <option value="rating">{t({ zh: '最高评分', en: 'Highest Rating' })}</option>
            <option value="newest">{t({ zh: '最新', en: 'Newest' })}</option>
            <option value="price">{t({ zh: '价格', en: 'Price' })}</option>
          </select>

          {/* 已安装筛选 */}
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showInstalledOnly}
              onChange={(e) => setShowInstalledOnly(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">{t({ zh: '仅显示已安装', en: 'Installed Only' })}</span>
          </label>
        </div>
      </div>

      {/* 插件列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-gray-600">{t({ zh: '加载中...', en: 'Loading...' })}</p>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">{t({ zh: '没有找到插件', en: 'No plugins found' })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              onInstall={() => handleInstall(plugin)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 插件卡片组件
 */
interface PluginCardProps {
  plugin: Plugin;
  onInstall: () => void;
}

function PluginCard({ plugin, onInstall }: PluginCardProps) {
  const { t } = useLocalization();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* 插件头部 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {plugin.icon ? (
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-xl">
              {plugin.icon}
            </div>
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded-lg" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900">{plugin.name}</h3>
            <p className="text-xs text-gray-500">v{plugin.version}</p>
          </div>
        </div>
        {plugin.isInstalled && (
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
            {t({ zh: '已安装', en: 'Installed' })}
          </span>
        )}
      </div>

      {/* 描述 */}
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{plugin.description}</p>

      {/* 评分和下载量 */}
      <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
        <div className="flex items-center gap-1">
          <span>⭐</span>
          <span>{plugin.rating.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>📥</span>
          <span>{plugin.downloadCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>👤</span>
          <span>{plugin.author}</span>
        </div>
      </div>

      {/* 能力标签 */}
      {plugin.capabilities && plugin.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {plugin.capabilities.slice(0, 3).map((cap) => (
            <span
              key={cap}
              className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* 价格和操作 */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="font-semibold text-gray-900">
          {plugin.isFree ? (
            <span className="text-green-600">{t({ zh: '免费', en: 'Free' })}</span>
          ) : (
            <span>
              {plugin.price} {plugin.currency}
            </span>
          )}
        </div>
        <button
          onClick={onInstall}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            plugin.isInstalled
              ? 'bg-red-600 text-white hover:bg-red-700'
              : plugin.isFree
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {plugin.isInstalled
            ? t({ zh: '卸载', en: 'Uninstall' })
            : plugin.isFree
            ? t({ zh: '安装', en: 'Install' })
            : t({ zh: '购买', en: 'Purchase' })}
        </button>
      </div>
    </div>
  );
}

/**
 * 根据角色获取模拟插件数据
 */
function getMockPluginsByRole(
  role: 'user' | 'merchant' | 'developer',
  t: (msg: any) => string
): Plugin[] {
  const commonPlugins: Plugin[] = [
    {
      id: 'plugin_analytics',
      name: t({ zh: '数据分析增强', en: 'Analytics Pro' }),
      description: t({
        zh: '提供高级数据分析和可视化功能',
        en: 'Provides advanced analytics and visualization features',
      }),
      version: '1.2.0',
      author: 'Agentrix Team',
      category: 'analytics',
      price: 0,
      currency: 'USD',
      isFree: true,
      isInstalled: false,
      rating: 4.8,
      downloadCount: 1234,
      icon: '📊',
      capabilities: ['analytics', 'visualization'],
    },
  ];

  if (role === 'merchant') {
    return [
      ...commonPlugins,
      {
        id: 'plugin_payment_optimizer',
        name: t({ zh: '支付优化器', en: 'Payment Optimizer' }),
        description: t({
          zh: '自动选择最优支付方式，降低手续费',
          en: 'Automatically select optimal payment method, reduce fees',
        }),
        version: '2.0.0',
        author: 'Agentrix Team',
        category: 'payment',
        price: 29.99,
        currency: 'USD',
        isFree: false,
        isInstalled: false,
        rating: 4.9,
        downloadCount: 567,
        icon: '💳',
        capabilities: ['payment', 'optimization'],
      },
      {
        id: 'plugin_marketing_automation',
        name: t({ zh: '营销自动化', en: 'Marketing Automation' }),
        description: t({
          zh: '自动发送营销邮件、优惠券、推送通知',
          en: 'Automatically send marketing emails, coupons, push notifications',
        }),
        version: '1.5.0',
        author: 'Third Party',
        category: 'marketing',
        price: 49.99,
        currency: 'USD',
        isFree: false,
        isInstalled: false,
        rating: 4.6,
        downloadCount: 890,
        icon: '📢',
        capabilities: ['marketing', 'automation'],
      },
    ];
  } else if (role === 'developer') {
    return [
      ...commonPlugins,
      {
        id: 'plugin_api_monitor',
        name: t({ zh: 'API 监控', en: 'API Monitor' }),
        description: t({
          zh: '实时监控 API 调用、性能、错误率',
          en: 'Real-time monitoring of API calls, performance, error rates',
        }),
        version: '1.0.0',
        author: 'Agentrix Team',
        category: 'analytics',
        price: 0,
        currency: 'USD',
        isFree: true,
        isInstalled: false,
        rating: 4.7,
        downloadCount: 2345,
        icon: '🔍',
        capabilities: ['monitoring', 'api'],
      },
    ];
  }

  return commonPlugins;
}

