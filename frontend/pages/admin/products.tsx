import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { 
  Package, 
  Search, 
  Filter, 
  MoreVertical, 
  ArrowLeft,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Trash2,
  DollarSign
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  status: string;
  type?: string;
  merchantId?: string;
  merchantName?: string;
  imageUrl?: string;
  createdAt: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchProducts = useCallback(async (token: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(searchTerm && { search: searchTerm })
      });
      
      const response = await fetch(`${API_BASE_URL}/api/admin/products?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.status === 401) {
        localStorage.removeItem('admin_token');
        router.replace('/admin/login');
        return;
      }
      
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data.data || data.products || data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchTerm, router]);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    fetchProducts(token);
  }, [router, page, statusFilter, fetchProducts]);

  const handleSearch = () => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setPage(1);
      fetchProducts(token);
    }
  };

  const handleStatusChange = async (productId: string, newStatus: string) => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchProducts(token);
      }
    } catch (err) {
      console.error('Failed to update product status:', err);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('确定要删除此商品吗？')) return;
    
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        fetchProducts(token);
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>商品管理 - Agentrix Admin</title>
      </Head>

      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">商品管理</h2>
          <span className="text-sm text-gray-500">共 {total} 个商品</span>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" />
          添加商品
        </button>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索商品名称或ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 bg-white"
            >
              <option value="all">全部状态</option>
              <option value="active">已上架</option>
              <option value="pending">待审核</option>
              <option value="rejected">已拒绝</option>
              <option value="inactive">已下架</option>
            </select>
            <button 
              onClick={() => fetchProducts(localStorage.getItem('admin_token') || '')}
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
                <th className="px-6 py-4 font-medium">商品</th>
                <th className="px-6 py-4 font-medium">价格</th>
                <th className="px-6 py-4 font-medium">类型</th>
                <th className="px-6 py-4 font-medium">状态</th>
                <th className="px-6 py-4 font-medium">商户</th>
                <th className="px-6 py-4 font-medium">创建时间</th>
                <th className="px-6 py-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                    <p className="text-gray-400">加载中...</p>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    暂无商品数据
                  </td>
                </tr>
              ) : products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden relative">
                        {product.imageUrl ? (
                          <Image 
                            src={product.imageUrl} 
                            alt={product.name} 
                            fill 
                            className="object-cover" 
                            unoptimized
                          />
                        ) : (
                          <Package className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-xs text-gray-500 max-w-xs truncate">
                          {product.description || 'ID: ' + product.id.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 font-medium text-gray-900">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      {product.price} {product.currency}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                      {product.type || '商品'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      product.status === 'active' ? 'bg-green-100 text-green-700' :
                      product.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      product.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {product.status === 'active' ? '已上架' :
                       product.status === 'pending' ? '待审核' :
                       product.status === 'rejected' ? '已拒绝' : '已下架'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {product.merchantName || product.merchantId?.slice(0, 8) || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(product.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button 
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
