import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { 
  Store, 
  Search, 
  Filter, 
  MoreVertical, 
  ArrowLeft,
  Plus,
  RefreshCw,
  CheckCircle,
  Package,
  DollarSign,
  Eye
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

interface Merchant {
  id: string;
  agentrixId?: string;
  email?: string;
  nickname?: string;
  roles?: string[];
  kycStatus?: string;
  createdAt: string;
  merchantProfile?: {
    businessName?: string;
    status?: string;
  };
  stats?: {
    productCount: number;
    orderCount: number;
    totalGMV: number;
  };
  mpcWallets?: Array<{
    walletAddress: string;
    chain: string;
  }>;
}

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const router = useRouter();

  const fetchMerchants = useCallback(async (token: string) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(searchTerm && { search: searchTerm })
      });
      
      console.log('🔍 Fetching merchants from:', `${API_BASE_URL}/api/admin/merchants?${params}`);
      
      const response = await fetch(`${API_BASE_URL}/api/admin/merchants?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('📡 Response status:', response.status);
      
      if (response.status === 401) {
        localStorage.removeItem('admin_token');
        router.replace('/admin/login');
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', response.status, errorText);
        throw new Error(`获取商户列表失败 (${response.status}): ${errorText.slice(0, 100)}`);
      }
      
      const data = await response.json();
      console.log('✅ Merchants data:', data);
      setMerchants(data.data || data.merchants || data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('❌ Fetch error:', err);
      setError(err.message || '加载商户数据失败');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, router]);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }

    fetchMerchants(token);
  }, [router, page, fetchMerchants]);

  const handleSearch = () => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setPage(1);
      fetchMerchants(token);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>商户管理 - Agentrix Admin</title>
      </Head>

      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">商户管理</h2>
          <span className="text-sm text-gray-500">共 {total} 个商户</span>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" />
          添加商户
        </button>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索商户名称或ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-gray-200 rounded-lg flex items-center gap-2 text-gray-600 hover:bg-white transition-colors">
              <Filter className="w-4 h-4" />
              筛选
            </button>
            <button 
              onClick={() => fetchMerchants(localStorage.getItem('admin_token') || '')}
              className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">商户</th>
                <th className="px-6 py-4 font-medium">认证状态</th>
                <th className="px-6 py-4 font-medium">商品数</th>
                <th className="px-6 py-4 font-medium">总GMV</th>
                <th className="px-6 py-4 font-medium">加入时间</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                    <p className="text-gray-400">加载中...</p>
                  </td>
                </tr>
              ) : merchants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    暂无商户数据
                  </td>
                </tr>
              ) : (
                merchants.map((merchant) => (
                  <tr key={merchant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                          <Store className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {merchant.merchantProfile?.businessName || merchant.nickname || '未命名商户'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {merchant.agentrixId || merchant.email || `ID: ${merchant.id.slice(0, 8)}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${
                        merchant.kycStatus === 'approved' ? 'bg-green-100 text-green-700' : 
                        merchant.kycStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {merchant.kycStatus === 'approved' ? (
                          <><CheckCircle className="w-3 h-3" /> 已认证</>
                        ) : merchant.kycStatus === 'pending' ? '待审核' : (merchant.kycStatus || '未认证')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-gray-700">
                        <Package className="w-4 h-4 text-gray-400" />
                        {merchant.stats?.productCount || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-gray-700 font-medium">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        {(merchant.stats?.totalGMV || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(merchant.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => router.push(`/admin/merchants/${merchant.id}`)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreVertical className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              显示 {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} / 共 {total} 条
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 20 >= total}
                className="px-4 py-2 border rounded-lg disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

