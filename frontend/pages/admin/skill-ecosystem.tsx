/**
 * Skill 生态管理页面
 * 
 * 功能：
 * 1. 触发生态扫描导入
 * 2. 查看待审批列表
 * 3. 批量审批/拒绝
 * 4. 管理定价
 */

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { 
  RefreshCw, 
  Check, 
  X, 
  Package, 
  DollarSign,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Zap,
  Globe,
  Bot,
} from 'lucide-react';

interface PendingSkill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  source: string;
  category: string;
  layer: string;
  authorInfo: any;
  pricing: any;
  createdAt: string;
  status: string;
}

interface ImportStats {
  total: number;
  pending: number;
  published: number;
  bySource: Record<string, number>;
  byPlatform: Record<string, number>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// Helper to get auth token from localStorage
const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('access_token') || localStorage.getItem('token');
  }
  return null;
};

// Helper to create auth headers
const getAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function SkillEcosystemAdmin() {
  const [skills, setSkills] = useState<PendingSkill[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPendingSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/pending?page=${page}&limit=20`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setSkills(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch pending skills:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/stats`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchPendingSkills();
    fetchStats();
  }, [fetchPendingSkills, fetchStats]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/scan`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      const newCount = result.newSkills ?? 0;
      const details = [];
      if (result.sources?.mcp > 0) details.push(`MCP: ${result.sources.mcp}`);
      if (result.sources?.chatgpt > 0) details.push(`ChatGPT: ${result.sources.chatgpt}`);
      if (result.sources?.x402 > 0) details.push(`X402: ${result.sources.x402}`);
      if (result.sources?.ucp > 0) details.push(`UCP: ${result.sources.ucp}`);
      const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
      alert(`扫描完成！新导入 ${newCount} 个 Skill${detailStr}`);
      fetchPendingSkills();
      fetchStats();
    } catch (error) {
      console.error('Scan failed:', error);
      alert('扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const handleScanX402 = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/scan/x402`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const result = await res.json();
      const newCount = result.newSkills ?? 0;
      alert(`X402 扫描完成！新导入 ${newCount} 个服务`);
      fetchPendingSkills();
      fetchStats();
    } catch (error) {
      console.error('X402 scan failed:', error);
      alert('X402 扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const handleScanUCP = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/scan/ucp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const result = await res.json();
      const newCount = result.newSkills ?? 0;
      alert(`UCP 扫描完成！新导入 ${newCount} 个商品`);
      fetchPendingSkills();
      fetchStats();
    } catch (error) {
      console.error('UCP scan failed:', error);
      alert('UCP 扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const handleApprove = async (publishImmediately = true) => {
    if (selectedIds.size === 0) {
      alert('请先选择要审批的 Skill');
      return;
    }
    
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          skillIds: Array.from(selectedIds),
          publishImmediately,
        }),
      });
      const result = await res.json();
      alert(`成功审批 ${result.approved?.length || 0} 个 Skill`);
      setSelectedIds(new Set());
      fetchPendingSkills();
      fetchStats();
    } catch (error) {
      console.error('Approve failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要拒绝的 Skill');
      return;
    }
    
    const reason = prompt('请输入拒绝原因（可选）');
    
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/skills/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          skillIds: Array.from(selectedIds),
          reason,
        }),
      });
      const result = await res.json();
      alert(`已拒绝 ${result.rejected?.length || 0} 个 Skill`);
      setSelectedIds(new Set());
      fetchPendingSkills();
      fetchStats();
    } catch (error) {
      console.error('Reject failed:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === skills.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(skills.map(s => s.id)));
    }
  };

  const getSourceIcon = (source: string) => {
    if (source?.includes('claude') || source?.includes('mcp')) {
      return <Bot className="text-orange-400" size={16} />;
    }
    if (source?.includes('openai') || source?.includes('gpt')) {
      return <Zap className="text-green-400" size={16} />;
    }
    return <Globe className="text-blue-400" size={16} />;
  };

  return (
    <>
      <Head>
        <title>Skill 生态管理 | Agentrix Admin</title>
      </Head>

      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">Skill 生态管理</h1>
              <p className="text-slate-400 mt-1">导入、审批和管理外部 Skill (Claude MCP / ChatGPT / X402 / UCP)</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleScanX402}
                disabled={scanning}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 rounded-lg flex items-center gap-2 transition-colors text-sm"
              >
                <Zap size={16} />
                X402 扫描
              </button>
              <button
                onClick={handleScanUCP}
                disabled={scanning}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg flex items-center gap-2 transition-colors text-sm"
              >
                <Globe size={16} />
                UCP 扫描
              </button>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={scanning ? 'animate-spin' : ''} size={18} />
                {scanning ? '扫描中...' : '全部扫描'}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <p className="text-slate-400 text-sm">总导入数</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <p className="text-slate-400 text-sm">待审批</p>
                <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <p className="text-slate-400 text-sm">已上架</p>
                <p className="text-2xl font-bold text-green-400">{stats.published}</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <p className="text-slate-400 text-sm">来源分布</p>
                <div className="flex gap-2 mt-1">
                  {Object.entries(stats.byPlatform || {}).map(([k, v]) => (
                    <span key={k} className="text-xs bg-slate-700 px-2 py-1 rounded">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Actions Bar */}
          <div className="flex items-center justify-between mb-4 bg-slate-800/30 p-3 rounded-lg">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === skills.length && skills.length > 0}
                  onChange={selectAll}
                  className="w-4 h-4 rounded border-slate-600"
                />
                <span className="text-sm text-slate-400">全选</span>
              </label>
              <span className="text-sm text-slate-500">
                已选 {selectedIds.size} 项
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleApprove(true)}
                disabled={selectedIds.size === 0 || actionLoading}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm flex items-center gap-1 transition-colors"
              >
                <Check size={16} />
                批量通过并上架
              </button>
              <button
                onClick={handleReject}
                disabled={selectedIds.size === 0 || actionLoading}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm flex items-center gap-1 transition-colors"
              >
                <X size={16} />
                批量拒绝
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700/50">
                  <th className="px-4 py-3 text-left w-12"></th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">名称</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">来源</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">分类</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">层级</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">作者</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">定价</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      加载中...
                    </td>
                  </tr>
                ) : skills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      暂无待审批的 Skill
                    </td>
                  </tr>
                ) : (
                  skills.map((skill) => (
                    <tr 
                      key={skill.id} 
                      className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${
                        selectedIds.has(skill.id) ? 'bg-blue-500/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(skill.id)}
                          onChange={() => toggleSelect(skill.id)}
                          className="w-4 h-4 rounded border-slate-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-white">{skill.displayName || skill.name}</p>
                          <p className="text-xs text-slate-500 truncate max-w-xs">{skill.description}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {getSourceIcon(skill.source)}
                          <span className="text-sm text-slate-400">{skill.source}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">
                          {skill.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-400">{skill.layer}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-400">
                          {skill.authorInfo?.name || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-green-400">
                          {skill.pricing?.type === 'free' ? '免费' : 
                           skill.pricing?.pricePerCall ? `$${skill.pricing.pricePerCall}/次` : '免费'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500">
                          {new Date(skill.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-slate-500">
                共 {total} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg bg-slate-800 disabled:opacity-50"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm text-slate-400">第 {page} 页</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 20 >= total}
                  className="p-2 rounded-lg bg-slate-800 disabled:opacity-50"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
