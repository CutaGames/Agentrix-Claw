import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { ArrowLeft, Plus, RefreshCw, Download, Ban, BarChart3 } from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

interface InvitationCode {
  id: string;
  code: string;
  batch: string;
  status: 'available' | 'used' | 'expired' | 'disabled';
  maxUses: number;
  usedCount: number;
  usedByUserId?: string;
  usedAt?: string;
  channel?: string;
  expiresAt?: string;
  createdAt: string;
}

interface Stats {
  total: number;
  available: number;
  used: number;
  expired: number;
  disabled: number;
  redemptionRate: string;
  byBatch: Array<{ batch: string; total: number; used: number }>;
  byChannel: Array<{ channel: string; total: number; used: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  used: 'bg-blue-100 text-blue-800',
  expired: 'bg-yellow-100 text-yellow-800',
  disabled: 'bg-red-100 text-red-800',
};

export default function InvitationPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [filterBatch, setFilterBatch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // Generate form
  const [genBatch, setGenBatch] = useState('batch_1_200');
  const [genCount, setGenCount] = useState(200);
  const [genChannel, setGenChannel] = useState('official');
  const [genExpiry, setGenExpiry] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('admin_token');
    if (!t) {
      router.replace('/admin/login');
      return;
    }
    setToken(t);
  }, [router]);

  const fetchCodes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filterBatch) params.set('batch', filterBatch);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`${API_BASE_URL}/api/admin/invitation/list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.replace('/admin/login'); return; }
      const data = await res.json();
      setCodes(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, page, filterBatch, filterStatus, router]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/invitation/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchCodes();
      fetchStats();
    }
  }, [token, fetchCodes, fetchStats]);

  const handleGenerate = async () => {
    if (!token) return;
    setGenerating(true);
    try {
      const body: any = { batch: genBatch, count: genCount, channel: genChannel };
      if (genExpiry) body.expiresAt = new Date(genExpiry).toISOString();
      const res = await fetch(`${API_BASE_URL}/api/admin/invitation/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Generation failed');
      const result = await res.json();
      alert(`Generated ${result.count} codes for batch "${result.batch}"`);
      setShowGenerate(false);
      fetchCodes();
      fetchStats();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDisable = async (ids: string[]) => {
    if (!token || !confirm(`Disable ${ids.length} code(s)?`)) return;
    await fetch(`${API_BASE_URL}/api/admin/invitation/disable`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeIds: ids }),
    });
    fetchCodes();
    fetchStats();
  };

  const handleExportCsv = () => {
    const csv = ['Code,Batch,Status,Channel,Used By,Used At,Created At'];
    codes.forEach((c) => {
      csv.push(`${c.code},${c.batch},${c.status},${c.channel || ''},${c.usedByUserId || ''},${c.usedAt || ''},${c.createdAt}`);
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invitation-codes-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Invitation Codes | Agentrix Admin</title>
      </Head>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">Invitation Codes</h2>
          {stats && (
            <span className="text-sm text-gray-500">
              {stats.available} available / {stats.total} total
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCsv} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-white transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => { fetchCodes(); fetchStats(); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-white transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setShowGenerate(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" /> Generate Codes
          </button>
        </div>
      </header>

      <div className="p-8 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total', value: stats.total, color: 'text-gray-800' },
              { label: 'Available', value: stats.available, color: 'text-green-600' },
              { label: 'Used', value: stats.used, color: 'text-blue-600' },
              { label: 'Expired', value: stats.expired, color: 'text-yellow-600' },
              { label: 'Redemption Rate', value: stats.redemptionRate, color: 'text-indigo-600' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-sm text-gray-500">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Batch breakdown */}
        {stats && stats.byBatch.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> By Batch
            </h3>
            <div className="flex flex-wrap gap-3">
              {stats.byBatch.map((b: any) => (
                <button
                  key={b.batch}
                  onClick={() => setFilterBatch(filterBatch === b.batch ? '' : b.batch)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    filterBatch === b.batch ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {b.batch}: {b.used}/{b.total} used
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="used">Used</option>
            <option value="expired">Expired</option>
            <option value="disabled">Disabled</option>
          </select>
          {(filterBatch || filterStatus) && (
            <button onClick={() => { setFilterBatch(''); setFilterStatus(''); setPage(1); }} className="text-sm text-indigo-600 hover:underline">
              Clear filters
            </button>
          )}
          <span className="text-sm text-gray-500 ml-auto">{total} result(s)</span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Code</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Batch</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Channel</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Used At</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : codes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No invitation codes found</td></tr>
              ) : codes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-gray-800">{c.code}</td>
                  <td className="px-4 py-3 text-gray-600">{c.batch}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.channel || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.usedAt ? new Date(c.usedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'available' && (
                      <button
                        onClick={() => handleDisable([c.id])}
                        className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1"
                      >
                        <Ban className="w-3 h-3" /> Disable
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="flex justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Prev
            </button>
            <span className="px-3 py-1 text-sm text-gray-600">
              Page {page} of {Math.ceil(total / 50)}
            </span>
            <button
              disabled={page >= Math.ceil(total / 50)}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-[420px] space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Generate Invitation Codes</h3>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Batch Name</label>
              <input
                value={genBatch}
                onChange={(e) => setGenBatch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="batch_1_200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Count</label>
              <input
                type="number"
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                min={1}
                max={5000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Channel</label>
              <select
                value={genChannel}
                onChange={(e) => setGenChannel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="official">Official</option>
                <option value="kol">KOL</option>
                <option value="twitter">Twitter/X</option>
                <option value="discord">Discord</option>
                <option value="friend">Friend Referral</option>
                <option value="team">Internal Team</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Expiry (optional)</label>
              <input
                type="datetime-local"
                value={genExpiry}
                onChange={(e) => setGenExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowGenerate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating || !genBatch || genCount < 1}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {generating ? 'Generating...' : `Generate ${genCount} Codes`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
