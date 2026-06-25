'use client';

import React from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  Package, 
  Activity, 
  DollarSign, 
  Globe,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';

interface PortfolioStats {
  totalSkills: number;
  activeSkills: number;
  calls30d: number;
  callsTrend: number; // percentage change
  revenue30d: number;
  revenueTrend: number;
  agentsCoverage: number;
  platformsCoverage: number;
}

interface PortfolioSummaryProps {
  stats: PortfolioStats;
  loading?: boolean;
}

export function PortfolioSummary({ stats, loading = false }: PortfolioSummaryProps) {
  const { t } = useLocalization();

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-500';
    if (trend < 0) return 'text-red-500';
    return 'text-gray-400';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const cards = [
    {
      id: 'skills',
      title: t({ zh: '已发布技能', en: 'Published Skills' }),
      value: `${stats.activeSkills}/${stats.totalSkills}`,
      subtitle: t({ zh: '已上线 / 总计', en: 'Active / Total' }),
      icon: Package,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
    },
    {
      id: 'calls',
      title: t({ zh: '近30天调用', en: '30-Day Calls' }),
      value: formatNumber(stats.calls30d),
      subtitle: t({ zh: '所有 Agent 累计调用', en: 'Total agent calls' }),
      icon: Activity,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-500',
      trend: stats.callsTrend,
    },
    {
      id: 'revenue',
      title: t({ zh: '近30天收入', en: '30-Day Revenue' }),
      value: formatCurrency(stats.revenue30d),
      subtitle: t({ zh: '已结算收益（含分佣后）', en: 'Settled earnings (after commission)' }),
      icon: DollarSign,
      iconBg: 'bg-green-500/10',
      iconColor: 'text-green-500',
      trend: stats.revenueTrend,
    },
    {
      id: 'coverage',
      title: t({ zh: '覆盖范围', en: 'Coverage' }),
      value: `${stats.agentsCoverage} Agents`,
      subtitle: t({ zh: `跨 ${stats.platformsCoverage} 个平台`, en: `Across ${stats.platformsCoverage} platforms` }),
      icon: Globe,
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-500',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 bg-slate-800/50 border border-slate-700/50 rounded-xl animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-24 mb-3"></div>
            <div className="h-8 bg-slate-700 rounded w-32 mb-2"></div>
            <div className="h-3 bg-slate-700 rounded w-40"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">
          {t({ zh: '我的技能', en: 'My Skills' })}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {t({ zh: '你已发布的所有可交易能力资产', en: 'All your published tradeable capability assets' })}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className="p-5 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg ${card.iconBg}`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              {card.trend !== undefined && (
                <div className={`flex items-center gap-1 text-xs ${getTrendColor(card.trend)}`}>
                  {getTrendIcon(card.trend)}
                  <span>{Math.abs(card.trend)}%</span>
                </div>
              )}
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {card.value}
            </div>
            <div className="text-xs text-slate-400">
              {card.subtitle}
            </div>
            <div className="text-[10px] text-slate-500 mt-2 uppercase tracking-wider">
              {card.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PortfolioSummary;
