import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart, 
  Activity,
  DollarSign,
  CreditCard,
  ShieldCheck,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { skillApi } from '../../../lib/api/skill.api';

const AssetsOverview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. 搜索 asset_overview skill
      const skillRes = await skillApi.list({ search: 'asset_overview', status: 'published', limit: 1 });
      if (!skillRes.success || !skillRes.items || skillRes.items.length === 0) {
        throw new Error('Asset overview skill not found');
      }

      // 2. 执行 skill
      const execRes = await skillApi.execute(skillRes.items[0].id, {});
      if (!execRes.success) {
        throw new Error(execRes.error || 'Failed to fetch assets');
      }

      setData(execRes.data);
    } catch (err: any) {
      console.error('Error fetching assets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
        <p>Loading your assets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
        <p className="text-red-400 mb-4">Error: {error}</p>
        <button 
          onClick={fetchAssets}
          className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Use real data or fallback to mock if data is empty
  const totalBalance = data?.totalValueUsd || 0;
  const change24h = 0; // Backend doesn't provide this yet
  
  const assets = data?.chains?.map((c: any) => ({
    name: c.symbol || 'Unknown',
    balance: c.balance || '0',
    value: c.usdValue || 0,
    change: 0,
    color: c.symbol === 'ETH' ? 'bg-purple-500' : 'bg-blue-500'
  })) || [];

  const distribution = assets.map((a: any) => ({
    name: a.name,
    value: totalBalance > 0 ? (a.value / totalBalance) * 100 : 0,
    color: a.color.replace('bg-', 'text-')
  }));

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Wallet className="text-blue-400 w-5 h-5" />
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {change24h >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(change24h)}%
            </div>
          </div>
          <div className="text-sm text-slate-400 mb-1">Total Balance</div>
          <div className="text-3xl font-bold text-white">${totalBalance.toLocaleString()}</div>
        </div>

        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <TrendingUp className="text-purple-400 w-5 h-5" />
            </div>
            <button 
              onClick={fetchAssets}
              className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          <div className="text-sm text-slate-400 mb-1">24h Profit</div>
          <div className="text-3xl font-bold text-green-400">+$647.34</div>
        </div>

        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <ShieldCheck className="text-green-400 w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded uppercase">Secure</span>
          </div>
          <div className="text-sm text-slate-400 mb-1">Active Strategies</div>
          <div className="text-3xl font-bold text-white">4 <span className="text-sm font-normal text-slate-500">Running</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset List */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Activity size={18} className="text-blue-400" />
              Your Assets
            </h3>
            <button className="text-xs text-blue-400 font-bold hover:underline">View All</button>
          </div>
          <div className="divide-y divide-white/5">
            {assets.map((asset: any) => (
              <div key={asset.name} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${asset.color} rounded-full flex items-center justify-center text-white font-bold`}>
                    {asset.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-white">{asset.name}</div>
                    <div className="text-xs text-slate-500">{asset.balance} {asset.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-white">${asset.value.toLocaleString()}</div>
                  <div className={`text-xs ${asset.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {asset.change >= 0 ? '+' : ''}{asset.change}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribution Chart */}
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
          <h3 className="font-bold text-white mb-6 flex items-center gap-2">
            <PieChart size={18} className="text-purple-400" />
            Distribution
          </h3>
          
          <div className="relative w-48 h-48 mx-auto mb-8">
            {/* Simple SVG Donut Chart */}
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="3"></circle>
              {distribution.reduce((acc: any, item: any, i: number) => {
                const offset = acc.total;
                acc.total += item.value;
                acc.elements.push(
                  <circle
                    key={i}
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth="3"
                    strokeDasharray={`${item.value} ${100 - item.value}`}
                    strokeDashoffset={-offset}
                  ></circle>
                );
                return acc;
              }, { total: 0, elements: [] as any[] }).elements}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-xl font-bold text-white">100%</div>
            </div>
          </div>

          <div className="space-y-3">
            {distribution.map((item: any) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-sm text-slate-400">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-white">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Deposit', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-400/10' },
          { label: 'Withdraw', icon: CreditCard, color: 'text-blue-400', bg: 'bg-blue-400/10' },
          { label: 'Swap', icon: RefreshCw, color: 'text-purple-400', bg: 'bg-purple-400/10' },
          { label: 'Bridge', icon: ArrowUpRight, color: 'text-orange-400', bg: 'bg-orange-400/10' },
        ].map((action) => (
          <button key={action.label} className="bg-slate-900/50 border border-white/5 rounded-xl p-4 hover:bg-white/5 transition-all group">
            <div className={`w-10 h-10 ${action.bg} rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
              <action.icon className={`${action.color} w-5 h-5`} />
            </div>
            <div className="text-sm font-bold text-white">{action.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AssetsOverview;
