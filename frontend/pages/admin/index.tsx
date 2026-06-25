import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Settings, 
  LogOut, 
  TrendingUp, 
  Activity,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Store,
  Code,
  Megaphone,
  Wallet,
  Ticket,
  Target,
  Shield,
  FileSearch,
  Package,
  Sparkles
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

// 完整的管理后台菜单项（中文）
const menuItems = [
  { name: '仪表盘', path: '/admin', icon: LayoutDashboard },
  { name: '用户管理', path: '/admin/users', icon: Users },
  { name: '商户管理', path: '/admin/merchants', icon: Store },
  { name: '开发者管理', path: '/admin/developers', icon: Code },
  { name: '推广者管理', path: '/admin/promoters', icon: Megaphone },
  { name: '商品管理', path: '/admin/products', icon: Package },
  { name: '商品审核', path: '/admin/product-review', icon: FileSearch },
  { name: 'Skill生态审批', path: '/admin/skill-ecosystem', icon: Sparkles },
  { name: '资金路径', path: '/admin/fund-paths', icon: Wallet },
  { name: '工单管理', path: '/admin/tickets', icon: Ticket },
  { name: '营销管理', path: '/admin/marketing', icon: Target },
  { name: '邀请码管理', path: '/admin/invitation', icon: Ticket },
  { name: '风控管理', path: '/admin/risk', icon: Shield },
  { name: '服务发现', path: '/admin/service-discovery', icon: Activity },
  { name: '系统管理', path: '/admin/system', icon: Settings },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (token: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('admin_token');
        router.replace('/admin/login');
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }

    fetchStats(token);
  }, [router, fetchStats]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    router.replace('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
          <p className="text-gray-500">正在加载仪表盘...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">Agentrix 管理</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = router.pathname === item.path;
            return (
              <button 
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-indigo-50 text-indigo-700 font-medium' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <h2 className="text-xl font-semibold text-gray-800">仪表盘概览</h2>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => fetchStats(localStorage.getItem('admin_token') || '')}
              className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard 
              title="总用户数" 
              value={stats?.totalUsers || 0} 
              icon={<Users className="w-6 h-6 text-blue-600" />}
              trend="+12% 较上月"
            />
            <StatCard 
              title="总收入" 
              value={`$${(stats?.totalRevenue || 0).toLocaleString()}`} 
              icon={<CreditCard className="w-6 h-6 text-green-600" />}
              trend="+8.4% 较上月"
            />
            <StatCard 
              title="活跃代理" 
              value={stats?.activeAgents || 0} 
              icon={<Activity className="w-6 h-6 text-purple-600" />}
              trend="+24 今日"
            />
            <StatCard 
              title="成功率" 
              value={`${stats?.successRate || 99.9}%`} 
              icon={<ShieldCheck className="w-6 h-6 text-indigo-600" />}
              trend="稳定"
            />
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">最近交易</h3>
              <button className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                查看全部 <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 font-medium">交易ID</th>
                    <th className="px-6 py-3 font-medium">用户</th>
                    <th className="px-6 py-3 font-medium">金额</th>
                    <th className="px-6 py-3 font-medium">状态</th>
                    <th className="px-6 py-3 font-medium">日期</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {stats?.recentTransactions?.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">{tx.id}</td>
                      <td className="px-6 py-4 text-gray-900">{tx.user}</td>
                      <td className="px-6 py-4 font-medium">${tx.amount}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          tx.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {tx.status === 'completed' ? '已完成' : '处理中'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{tx.date}</td>
                    </tr>
                  )) || (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                        暂无最近交易记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-gray-50 rounded-lg">
          {icon}
        </div>
        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
          {trend}
        </span>
      </div>
      <h4 className="text-gray-500 text-sm font-medium mb-1">{title}</h4>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
