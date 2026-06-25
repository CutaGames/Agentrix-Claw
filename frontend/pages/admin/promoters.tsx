import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { API_BASE_URL } from '../../utils/api-config';

interface Promoter {
  id: string;
  email: string;
  agentrixId: string;
  nickname: string;
  createdAt: string;
  stats: {
    referralCount: number;
    totalCommission: number;
  };
}

export default function AdminPromoters() {
  const router = useRouter();
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');

  const fetchPromoters = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const url = new URL(`${API_BASE_URL}/api/admin/promoters`);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('limit', '20');
      if (search) {
        url.searchParams.set('search', search);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPromoters(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch promoters:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchPromoters();
  }, [fetchPromoters]);

  return (
    <>
      <Head>
        <title>Promoter Management - Agentrix Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-50">
        <div className="ml-64 p-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Promoter Management</h2>
              <p className="text-gray-600 mt-2">Manage platform promoters</p>
            </div>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Search promoters..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Promoter ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Referral Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Total Commission
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Registration Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {promoters.map((promoter) => (
                    <tr key={promoter.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {promoter.agentrixId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {promoter.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {promoter.stats?.referralCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${(promoter.stats?.totalCommission || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(promoter.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => router.push(`/admin/promoters/${promoter.id}`)}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > 0 && (
                <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Total {total} records, Page {page}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page * 20 >= total}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

