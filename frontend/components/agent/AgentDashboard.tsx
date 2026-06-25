import React, { useState, useEffect } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';

interface DashboardStats {
  totalAssets: number;
  currency: string;
  dailySpent: number;
  dailyLimit: number;
  activePolicies: number;
  pendingAirdrops: number;
}

export function AgentDashboard() {
  const { t } = useLocalization();
  const [stats, setStats] = useState<DashboardStats>({
    totalAssets: 0,
    currency: 'USDC',
    dailySpent: 0,
    dailyLimit: 100,
    activePolicies: 0,
    pendingAirdrops: 0,
  });
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // 1. Fetch Wallet
      const walletRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/mpc-wallet/my-wallet`, { headers });
      let address = null;
      if (walletRes.ok) {
        const wallet = await walletRes.json();
        address = wallet.walletAddress;
        setWalletAddress(address);
      }

      // 2. Fetch Policies
      const policiesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/user-agent/policies`, { headers });
      let activePolicies = 0;
      let dailyLimit = 100;
      if (policiesRes.ok) {
        const policies = await policiesRes.json();
        activePolicies = policies.filter((p: any) => p.enabled).length;
        const limitPolicy = policies.find((p: any) => p.type === 'daily_limit');
        if (limitPolicy) dailyLimit = limitPolicy.value;
      }

      // 3. Fetch Airdrops
      const airdropsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auto-earn/airdrops`, { headers });
      let pendingAirdrops = 0;
      if (airdropsRes.ok) {
        const airdrops = await airdropsRes.json();
        pendingAirdrops = airdrops.filter((a: any) => a.status === 'monitoring' || a.status === 'eligible').length;
      }

      // 4. Fetch Transactions
      const txRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/user-agent/transactions/classified`, { headers });
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }

      setStats({
        totalAssets: 0, // In a real app, fetch from chain using address
        currency: 'USDC',
        dailySpent: 0,
        dailyLimit,
        activePolicies,
        pendingAirdrops,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-neutral-400">{t({ zh: '加载中...', en: 'Loading...' })}</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white">{t({ zh: '资产概览', en: 'Asset Overview' })}</h2>
          <p className="text-neutral-400 mt-1">{walletAddress ? `${t({ zh: '钱包地址', en: 'Wallet' })}: ${walletAddress}` : t({ zh: '未创建钱包', en: 'No wallet created' })}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-neutral-500 uppercase tracking-wider">{t({ zh: '总资产', en: 'Total Balance' })}</p>
          <p className="text-4xl font-mono font-bold text-blue-400">${stats.totalAssets.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center text-xl text-purple-400">⚖️</div>
            <h3 className="font-semibold text-neutral-200">{t({ zh: '今日支出', en: 'Daily Spending' })}</h3>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-mono font-bold">${stats.dailySpent}</p>
              <p className="text-xs text-neutral-500 mt-1">{t({ zh: '限额', en: 'Limit' })}: ${stats.dailyLimit}</p>
            </div>
            <div className="w-24 h-2 bg-neutral-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500" 
                style={{ width: `${Math.min((stats.dailySpent / stats.dailyLimit) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center text-xl text-green-400">🛡️</div>
            <h3 className="font-semibold text-neutral-200">{t({ zh: '活跃策略', en: 'Active Policies' })}</h3>
          </div>
          <p className="text-2xl font-mono font-bold">{stats.activePolicies}</p>
          <p className="text-xs text-neutral-500 mt-1">{t({ zh: '实时防护中', en: 'Real-time protection active' })}</p>
        </div>

        <div className="bg-neutral-800/50 border border-neutral-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center text-xl text-orange-400">🎁</div>
            <h3 className="font-semibold text-neutral-200">{t({ zh: '待领空投', en: 'Pending Airdrops' })}</h3>
          </div>
          <p className="text-2xl font-mono font-bold">{stats.pendingAirdrops}</p>
          <p className="text-xs text-neutral-500 mt-1">{t({ zh: '发现新机会', en: 'New opportunities found' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center">
            <h3 className="font-bold">{t({ zh: '最近活动', en: 'Recent Activity' })}</h3>
            <button className="text-xs text-blue-400 hover:underline">{t({ zh: '查看全部', en: 'View All' })}</button>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              {transactions.length === 0 ? (
                <p className="text-center text-neutral-500 py-4">{t({ zh: '暂无交易记录', en: 'No transactions yet' })}</p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center">
                      {tx.classification?.category === '购物' ? '🛒' : 
                       tx.classification?.category === '餐饮' ? '🍔' : 
                       tx.classification?.category === '交通' ? '🚗' : '💰'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{tx.description || tx.classification?.category || 'Transaction'}</p>
                      <p className="text-xs text-neutral-500">{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                    <p className={`font-mono font-bold ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {tx.amount < 0 ? '' : '+'}${tx.amount}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl p-6">
          <h3 className="font-bold mb-6">{t({ zh: '快捷操作', en: 'Quick Actions' })}</h3>
          <div className="grid grid-cols-2 gap-4">
            <button className="p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors text-left">
              <span className="text-2xl block mb-2">📤</span>
              <p className="text-sm font-semibold">{t({ zh: '发送资产', en: 'Send' })}</p>
            </button>
            <button className="p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors text-left">
              <span className="text-2xl block mb-2">📥</span>
              <p className="text-sm font-semibold">{t({ zh: '接收资产', en: 'Receive' })}</p>
            </button>
            <button className="p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors text-left">
              <span className="text-2xl block mb-2">🔄</span>
              <p className="text-sm font-semibold">{t({ zh: '兑换', en: 'Swap' })}</p>
            </button>
            <button className="p-4 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors text-left">
              <span className="text-2xl block mb-2">📊</span>
              <p className="text-sm font-semibold">{t({ zh: '账单分析', en: 'Analysis' })}</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
