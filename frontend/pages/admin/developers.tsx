import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  Mail, 
  Shield, 
  ArrowLeft,
  Plus,
  RefreshCw
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

export default function DevelopersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [developers, setDevelopers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    fetchDevelopers(token);
  }, [router]);

  const fetchDevelopers = async (token: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/admin/developers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch developers');
      const data = await response.json();
      setDevelopers(data.data || data.developers || []);
    } catch (err: any) {
      setError(err.message);
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
          <h2 className="text-xl font-semibold text-gray-800">Developer Management</h2>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" />
          Add Developer
        </button>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by name, email or ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-gray-200 rounded-lg flex items-center gap-2 text-gray-600 hover:bg-white transition-colors">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button 
              onClick={() => fetchDevelopers(localStorage.getItem('admin_token') || '')}
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
                <th className="px-6 py-4 font-medium">Developer</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">API Usage</th>
                <th className="px-6 py-4 font-medium">Joined Date</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                    <p className="text-gray-400">Loading developers...</p>
                  </td>
                </tr>
              ) : developers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    No developers found
                  </td>
                </tr>
              ) : developers.map((dev) => (
                <tr key={dev.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
                        {dev.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{dev.name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {dev.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      dev.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {dev.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{dev.apiCalls.toLocaleString()} calls</div>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500" 
                        style={{ width: `${Math.min(100, (dev.apiCalls / 10000) * 100)}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(dev.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
