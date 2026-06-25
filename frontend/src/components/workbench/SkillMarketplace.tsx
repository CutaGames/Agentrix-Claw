import React, { useState, useEffect, useCallback } from 'react';
import { skillApi, Skill, SkillCategory } from '../../../lib/api/skill.api';
import { 
  Package, 
  Zap, 
  Search, 
  Filter, 
  Plus, 
  Star, 
  Download, 
  ShoppingCart, 
  Wallet, 
  TrendingUp, 
  Shield, 
  MessageSquare,
  ChevronRight,
  ExternalLink,
  Activity,
  Loader2,
  GitFork,
  Globe,
  DollarSign,
  Layers,
  Code,
} from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';
import SkillPublishModal from './SkillPublishModal';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

const CATEGORIES = [
  { id: 'all', label: { zh: '全部', en: 'All' }, icon: Package },
  { id: 'payment', label: { zh: '支付', en: 'Payment' }, icon: Wallet },
  { id: 'commerce', label: { zh: '电商', en: 'Commerce' }, icon: ShoppingCart },
  { id: 'data', label: { zh: '数据', en: 'Data' }, icon: Activity },
  { id: 'utility', label: { zh: '工具', en: 'Utility' }, icon: Zap },
  { id: 'integration', label: { zh: '集成', en: 'Integration' }, icon: ExternalLink },
];

const LAYER_ICONS: Record<string, React.ReactNode> = {
  infra: <Zap size={16} className="text-amber-400" />,
  resource: <Package size={16} className="text-blue-400" />,
  logic: <Code size={16} className="text-green-400" />,
  composite: <Layers size={16} className="text-purple-400" />,
};

interface MarketplaceSkill {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  category: string;
  layer?: string;
  callCount: number;
  rating: number;
  pricing?: { type: string; pricePerCall?: number; currency?: string };
  ucpEnabled?: boolean;
  x402Enabled?: boolean;
  humanAccessible?: boolean;
  metadata?: { splitPlanId?: string; budgetPoolId?: string; marketplace?: any };
  tags?: string[];
  source?: string;
}

export const SkillMarketplace: React.FC = () => {
  const { t } = useLocalization();
  const [skills, setSkills] = useState<MarketplaceSkill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (activeCategory !== 'all') params.set('category', activeCategory);
      params.set('sortBy', 'callCount');
      params.set('sortOrder', 'DESC');
      params.set('page', String(page));
      params.set('limit', '18');

      const res = await fetch(`${API_BASE}/api/unified-marketplace/search?${params}`);
      const data = await res.json();
      setSkills(Array.isArray(data?.items) ? data.items : []);
      setTotal(data?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load skills');
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeCategory, page]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const popularSkills = [...skills].sort((a, b) => (b.callCount || 0) - (a.callCount || 0)).slice(0, 3);

  const handlePublish = async (skillData: any) => {
    try {
      await skillApi.create(skillData);
      loadSkills();
    } catch (err: any) {
      console.error('Failed to publish skill:', err);
      alert('Failed to publish skill: ' + err.message);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };

  const isCommerceSkill = (skill: MarketplaceSkill) => 
    skill.ucpEnabled || skill.x402Enabled || skill.metadata?.splitPlanId;

  const getPriceLabel = (skill: MarketplaceSkill) => {
    if (!skill.pricing || skill.pricing.type === 'free') return t({ zh: '免费', en: 'Free' });
    if (skill.pricing.pricePerCall) return `$${skill.pricing.pricePerCall}/${t({ zh: '次', en: 'call' })}`;
    return t({ zh: '付费', en: 'Paid' });
  };

  return (
    <div className="space-y-8">
      {/* Header with Publish Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{t({ zh: 'Skill 市场', en: 'Skill Marketplace' })}</h2>
          <p className="text-slate-400">
            {t({ zh: `${total} 个 Skill 可用 · 统一市场`, en: `${total} Skills available · Unified Marketplace` })}
          </p>
        </div>
        <button 
          onClick={() => setIsPublishModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={20} />
          {t({ zh: '发布 Skill', en: 'Publish Skill' })}
        </button>
      </div>

      {/* 热门 Skill 栏 */}
      {popularSkills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {popularSkills.map((skill, idx) => (
            <div key={skill.id} className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden group hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all">
              <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-110 transition-transform">
                <Zap size={100} />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded uppercase tracking-wider">
                  <TrendingUp size={10} className="inline mr-1" />Popular #{idx + 1}
                </span>
                {isCommerceSkill(skill) && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded border border-emerald-500/30">
                    Commerce
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{skill.displayName || skill.name}</h3>
              <p className="text-sm text-slate-400 line-clamp-2 mb-4">{skill.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Download size={14} /> {skill.callCount || 0}</span>
                  <span className="flex items-center gap-1"><Star size={14} className="text-yellow-500" /> {skill.rating || 0}</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <DollarSign size={12} /> {getPriceLabel(skill)}
                  </span>
                </div>
                <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分类与搜索 */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-white/5">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setPage(1); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                <Icon size={16} />
                {t(cat.label)}
              </button>
            );
          })}
        </div>
        <form onSubmit={handleSearch} className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder={t({ zh: '搜索技能...', en: 'Search skills...' })}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </form>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Skill 列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-52 bg-slate-800/50 rounded-xl animate-pulse border border-white/5" />
          ))
        ) : skills.length > 0 ? (
          skills.map(skill => (
            <div key={skill.id} className="bg-slate-900 border border-white/5 rounded-xl p-5 hover:border-blue-500/50 transition-all group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-blue-500/20 transition-all">
                    {LAYER_ICONS[skill.layer || ''] || <Zap size={16} className="text-blue-400" />}
                  </div>
                  {skill.layer && (
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{skill.layer}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {skill.ucpEnabled && (
                    <span title="UCP Protocol" className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-bold rounded border border-blue-500/20">UCP</span>
                  )}
                  {skill.x402Enabled && (
                    <span title="X402 Protocol" className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[9px] font-bold rounded border border-purple-500/20">X402</span>
                  )}
                  {skill.metadata?.splitPlanId && (
                    <span title={t({ zh: '分佣计划', en: 'Split Plan' })} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold rounded border border-emerald-500/20">
                      <GitFork size={9} className="inline mr-0.5" />Split
                    </span>
                  )}
                </div>
              </div>
              <h4 className="font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                {skill.displayName || skill.name}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-2 mb-3 h-8">{skill.description}</p>
              
              {/* Pricing & Stats */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  !skill.pricing || skill.pricing.type === 'free' 
                    ? 'bg-green-500/10 text-green-400' 
                    : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {getPriceLabel(skill)}
                </span>
                {skill.humanAccessible && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    <Globe size={10} /> {t({ zh: '人类可用', en: 'Human' })}
                  </span>
                )}
                {skill.source && skill.source !== 'native' && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    <ExternalLink size={10} /> {skill.source}
                  </span>
                )}
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Download size={12} /> {skill.callCount || 0}</span>
                  <span className="flex items-center gap-1"><Star size={12} className="text-yellow-500 fill-yellow-500" /> {skill.rating || 0}</span>
                </div>
                <button className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  {t({ zh: '详情', en: 'Details' })}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center">
            <Package size={48} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-500">{t({ zh: '未找到相关技能', en: 'No skills found' })}</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 18 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {t({ zh: '上一页', en: 'Previous' })}
          </button>
          <span className="text-sm text-slate-500">{page} / {Math.ceil(total / 18)}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 18)}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          >
            {t({ zh: '下一页', en: 'Next' })}
          </button>
        </div>
      )}

      <SkillPublishModal 
        isOpen={isPublishModalOpen} 
        onClose={() => setIsPublishModalOpen(false)} 
        onPublish={handlePublish} 
      />
    </div>
  );
};
