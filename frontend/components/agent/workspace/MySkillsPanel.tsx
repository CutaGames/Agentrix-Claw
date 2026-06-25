'use client';

import React, { useState, useEffect } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { apiClient } from '@/lib/api/client';
import { Plus, RefreshCw, AlertCircle, LayoutGrid, List, Search, Package } from 'lucide-react';
import { PortfolioSummary } from './PortfolioSummary';
import { SkillAssetCard, type SkillAsset, type SkillStatus, type SkillType, type PricingType } from './SkillAssetCard';
import { SkillDetailDrawer } from './SkillDetailDrawer';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'draft' | 'pending_review' | 'active' | 'rejected' | 'suspended';
  pricingType: 'free' | 'one_time' | 'subscription' | 'pay_per_use';
  price?: number;
  currency?: string;
  callCount?: number;
  rating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
  protocols?: {
    ucp?: { enabled: boolean; endpoint?: string };
    mcp?: { enabled: boolean; endpoint?: string };
    acp?: { enabled: boolean; endpoint?: string };
    x402?: { enabled: boolean; endpoint?: string };
  };
  coverImage?: string;
  calls7d?: number;
  revenue7d?: number;
  agentCount7d?: number;
  type?: string;
}

interface MySkillsPanelProps {
  onPublishNew?: () => void;
  onEditSkill?: (skillId: string) => void;
}

export function MySkillsPanel({ onPublishNew, onEditSkill }: MySkillsPanelProps) {
  const { t } = useLocalization();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'pending'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const fetchMySkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const response: any = await apiClient.get('/skills/my');
      if (response?.data) {
        const skills = response.data.items || response.data.skills || response.data || [];
        const skillsWithProtocols = skills.map((skill: Skill) => ({
          ...skill,
          protocols: skill.status === 'active' ? {
            ucp: { enabled: true, endpoint: `/api/ucp/skills/${skill.id}` },
            mcp: { enabled: true, endpoint: `/api/mcp/skills/${skill.id}` },
            acp: { enabled: true, endpoint: `/api/acp/skills/${skill.id}` },
            x402: { enabled: true, endpoint: `/api/x402/skills/${skill.id}` },
          } : undefined,
          calls7d: Math.floor(Math.random() * 1000),
          revenue7d: Math.random() * 100,
          agentCount7d: Math.floor(Math.random() * 20),
        }));
        setSkills(skillsWithProtocols);
      }
    } catch (err: any) {
      console.error('Failed to fetch my skills:', err);
      setError(err?.message || t({ zh: '加载失败', en: 'Failed to load' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMySkills();
  }, []);

  const portfolioStats = {
    totalSkills: skills.length,
    activeSkills: skills.filter(s => s.status === 'active').length,
    calls30d: skills.reduce((sum, s) => sum + (s.calls7d || 0) * 4, 0),
    callsTrend: 12.5,
    revenue30d: skills.reduce((sum, s) => sum + (s.revenue7d || 0) * 4, 0),
    revenueTrend: 8.3,
    agentsCoverage: Math.max(...skills.map(s => s.agentCount7d || 0), 0),
    platformsCoverage: 4,
  };

  const filteredSkills = skills.filter(skill => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'active' && skill.status === 'active') ||
      (filter === 'draft' && skill.status === 'draft') ||
      (filter === 'pending' && skill.status === 'pending_review');
    
    const matchesSearch = 
      !searchQuery ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const skillAssets: SkillAsset[] = filteredSkills.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    type: (skill.type || 'other') as SkillType,
    status: skill.status as SkillStatus,
    pricingType: (skill.pricingType === 'pay_per_use' ? 'per_call' : skill.pricingType) as PricingType,
    price: skill.price,
    currency: skill.currency,
    calls7d: skill.calls7d,
    revenue7d: skill.revenue7d,
    agentCount7d: skill.agentCount7d,
    platforms: skill.status === 'active' ? ['UCP', 'MCP', 'ACP', 'X402'] : [],
    coverImage: skill.coverImage,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  }));

  return (
    <div className="space-y-6">
      <PortfolioSummary stats={portfolioStats} loading={loading} />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {[
            { key: 'all', label: t({ zh: '全部', en: 'All' }) },
            { key: 'active', label: t({ zh: '已上线', en: 'Active' }) },
            { key: 'draft', label: t({ zh: '草稿', en: 'Draft' }) },
            { key: 'pending', label: t({ zh: '审核中', en: 'Pending' }) },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t({ zh: '搜索技能...', en: 'Search skills...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg">
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'card' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title={t({ zh: '卡片视图', en: 'Card view' })}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'table' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title={t({ zh: '表格视图', en: 'Table view' })}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={fetchMySkills}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title={t({ zh: '刷新', en: 'Refresh' })}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onPublishNew}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t({ zh: '发布新技能', en: 'Publish New' })}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : error && skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <p className="text-slate-400">{error}</p>
          <button
            onClick={fetchMySkills}
            className="mt-4 text-blue-400 hover:text-blue-300 text-sm"
          >
            {t({ zh: '重试', en: 'Retry' })}
          </button>
        </div>
      ) : skillAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {t({ zh: '暂无技能', en: 'No skills yet' })}
          </h3>
          <p className="text-slate-400 mb-6 max-w-md">
            {t({ 
              zh: '发布您的第一个技能，让 AI Agent 通过 UCP、MCP、ACP 和 X402 协议发现并调用它', 
              en: 'Publish your first skill and let AI agents discover and use it via UCP, MCP, ACP and X402' 
            })}
          </p>
          <button
            onClick={onPublishNew}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t({ zh: '发布第一个技能', en: 'Publish First Skill' })}
          </button>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {skillAssets.map(skill => (
            <SkillAssetCard
              key={skill.id}
              skill={skill}
              viewMode="card"
              onViewDetails={(id) => setSelectedSkillId(id)}
              onEdit={onEditSkill}
              onPromote={(id) => console.log('Promote', id)}
              onMoreActions={(id) => console.log('More', id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '技能', en: 'Skill' })}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '类型', en: 'Type' })}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '状态', en: 'Status' })}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '定价', en: 'Price' })}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '7天调用', en: '7d Calls' })}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '7天收入', en: '7d Revenue' })}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {t({ zh: '操作', en: 'Actions' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {skillAssets.map(skill => (
                <SkillAssetCard
                  key={skill.id}
                  skill={skill}
                  viewMode="table"
                  onViewDetails={(id) => setSelectedSkillId(id)}
                  onEdit={onEditSkill}
                  onMoreActions={(id) => console.log('More', id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      <SkillDetailDrawer
        skillId={selectedSkillId}
        isOpen={!!selectedSkillId}
        onClose={() => setSelectedSkillId(null)}
        onUpdate={fetchMySkills}
      />
    </div>
  );
}

export default MySkillsPanel;
