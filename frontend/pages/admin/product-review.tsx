import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { 
  Package, 
  Search, 
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Eye,
  DollarSign,
  Clock,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

interface PendingProduct {
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

export default function ProductReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<PendingProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchProducts = useCallback(async (token: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        status: 'pending',
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
      
      if (!response.ok) throw new Error('获取待审核商品列表失败');
      const data = await response.json();
      setProducts(data.products || data.items || []);
      setTotal(data.total || data.products?.length || 0);
    } catch (err: any) {
      setError(err.message);
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
    fetchProducts(token);
  }, [router, page, fetchProducts]);

  const handleApprove = async (productId: string) => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'active' })
      });

      if (response.ok) {
        fetchProducts(token);
      }
    } catch (err) {
      console.error('审核失败:', err);
    }
  };

  const handleReject = async (productId: string) => {
    const reason = prompt('请输入拒绝原因:');
    if (!reason) return;

    const token = localStorage.getItem('admin_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/products/${productId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'rejected', reason })
      });

      if (response.ok) {
        fetchProducts(token);
      }
    } catch (err) {
      console.error('拒绝失败:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>商品审核 - Agentrix Admin</title>
      </Head>

      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">商品审核</h2>
          <span className="text-sm text-gray-500">共 {total} 个待审核商品</span>
        </div>
        <button 
          onClick={() => fetchProducts(localStorage.getItem('admin_token') || '')}
          className="p-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索商品名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchProducts(localStorage.getItem('admin_token') || '')}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mr-2" />
            <span className="text-gray-500">加载中...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无待审核商品</h3>
            <p className="text-gray-500">所有商品都已审核完毕</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex">
                  <div className="w-48 h-full bg-gray-100 flex items-center justify-center relative min-h-[12rem]">
                    {product.imageUrl ? (
                      <Image 
                        src={product.imageUrl} 
                        alt={product.name} 
                        fill 
                        className="object-cover" 
                        unoptimized
                      />
                    ) : (
                      <Package className="w-16 h-16 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                        <p className="text-sm text-gray-500 mt-1 max-w-lg">
                          {product.description || '暂无描述'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full text-sm">
                        <Clock className="w-4 h-4" />
                        待审核
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        <span className="font-medium">{product.price} {product.currency}</span>
                      </div>
                      <div className="text-gray-500">
                        类型: <span className="text-gray-700">{product.type || '商品'}</span>
                      </div>
                      <div className="text-gray-500">
                        商户: <span className="text-gray-700">{product.merchantName || product.merchantId?.slice(0, 8) || '-'}</span>
                      </div>
                      <div className="text-gray-500">
                        提交时间: {new Date(product.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>

                    <div className="mt-6 flex items-center gap-3">
                      <button
                        onClick={() => handleApprove(product.id)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-700 transition-colors"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        通过
                      </button>
                      <button
                        onClick={() => handleReject(product.id)}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-red-700 transition-colors"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        拒绝
                      </button>
                      <button
                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        详情
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="mt-6 flex justify-between items-center">
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
