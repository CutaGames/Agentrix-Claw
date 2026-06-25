import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  TrendingUp, 
  ArrowLeft, 
  Plus, 
  Search, 
  Filter, 
  RefreshCw,
  DollarSign,
  ArrowRightLeft,
  Wallet
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

export default function FundPathsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [paths, setPaths] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    fetchPaths(token);
  }, [router]);

  const fetchPaths = async (token: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/admin/fund-paths`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch fund paths');
      const data = await response.json();
      // 后端返回 { items, total, page, ... } 结构，需要提取 items
      setPaths(Array.isArray(data) ? data : (data?.items || []));
    } catch (err: any) {
      setError(err.message);
      setPaths([]); // 确保 paths 是数组
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">Fund Path Management</h2>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" />
          Create New Path
        </button>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Volume</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">$1,284,500</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Active Paths</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">12</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Wallet className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Settled Amount</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">$942,000</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Configured Paths</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search paths..."
                  className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <button className="p-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">From</th>
                  <th className="px-6 py-4 font-medium">To</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">X402</th>
                  <th className="px-6 py-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                      Loading paths...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-red-500">
                      Error: {error}
                    </td>
                  </tr>
                ) : paths.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      No fund paths found
                    </td>
                  </tr>
                ) : paths.map((path) => (
                  <tr key={path.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        path.pathType === 'merchant_net' ? 'bg-green-100 text-green-700' :
                        path.pathType === 'platform_fee' ? 'bg-blue-100 text-blue-700' :
                        path.pathType === 'channel_fee' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {path.pathType || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="text-xs text-gray-400">{path.fromLabel || '-'}</div>
                      <div className="font-mono text-xs">{path.fromAddress ? `${path.fromAddress.slice(0,8)}...` : '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="text-xs text-gray-400">{path.toLabel || '-'}</div>
                      <div className="font-mono text-xs">{path.toAddress ? `${path.toAddress.slice(0,8)}...` : '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {parseFloat(path.amount || '0').toFixed(4)} {path.currency || 'USDT'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        path.isX402 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {path.isX402 ? 'X402' : 'Standard'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {path.createdAt ? new Date(path.createdAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
