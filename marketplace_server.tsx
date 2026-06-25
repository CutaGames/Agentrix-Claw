/**
 * Marketplace Page - 统一市场入口 (Optimized)
 * 三视图 + 增长优化：Trending、佣金醒目、推广Banner、搜索防抖、分页
 */
import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { SkillLayer, SkillSource, SkillResourceType } from '../types/skill';
import { useLocalization } from '../contexts/LocalizationContext';
import { useUser } from '../contexts/UserContext';
import {
  ShoppingBag, Search, TrendingUp, Star, Package, Code, Zap,
  Layers, Loader2, Briefcase, Share2, Copy, X, CheckCircle, ChevronRight,
  Users, DollarSign, Flame, ArrowRight, ChevronLeft,
} from 'lucide-react';
import { TaskMarketplace } from '../components/marketplace/TaskMarketplace';
import { SkillCardNew } from '../components/marketplace/SkillCardNew';
import { referralApi, type ReferralLinkResponse } from '../lib/api/referral.api';

interface Skill {
  id: string; name: string; displayName?: string; description: string;
  layer: SkillLayer; category: string; resourceType?: SkillResourceType; source: SkillSource;
  rating?: number; callCount?: number;
  pricing?: { type: string; pricePerCall?: number; currency?: string; commissionRate?: number };
  tags?: string[]; authorInfo?: { id: string; name: string; type: string };
  humanAccessible?: boolean; imageUrl?: string; thumbnailUrl?: string;
  ucpEnabled?: boolean; x402Enabled?: boolean;
  metadata?: { performanceMetric?: string; persona?: string; image?: string };
}
type ViewMode = 'resources' | 'tasks' | 'openclaw';

const HOT_TAGS = [
  { label: { zh: 'AI 翻译', en: 'AI Translation' }, q: 'translation' },
  { label: { zh: 'GPT', en: 'GPT' }, q: 'gpt' },
  { label: { zh: '数据分析', en: 'Data Analysis' }, q: 'analysis' },
  { label: { zh: '图像生成', en: 'Image Gen' }, q: 'image' },
  { label: { zh: '支付', en: 'Payment' }, q: 'payment' },
  { label: { zh: 'Web3', en: 'Web3' }, q: 'web3' },
  { label: { zh: '自动化', en: 'Automation' }, q: 'automation' },
];
const CATS: Record<ViewMode, { id: string; label: { zh: string; en: string }; icon?: string }[]> = {
  resources: [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'physical', label: { zh: '实物商品', en: 'Physical' }, icon: '📦' },
    { id: 'digital', label: { zh: '数字资产', en: 'Digital' }, icon: '💎' },
    { id: 'service', label: { zh: '专业服务', en: 'Services' }, icon: '🛠' },
    { id: 'data', label: { zh: '数据资源', en: 'Data' }, icon: '📊' },
  ],
  tasks: [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'development', label: { zh: '开发', en: 'Dev' }, icon: '💻' },
    { id: 'design', label: { zh: '设计', en: 'Design' }, icon: '🎨' },
    { id: 'content', label: { zh: '内容创作', en: 'Content' }, icon: '✍️' },
    { id: 'research', label: { zh: '调研', en: 'Research' }, icon: '🔍' },
  ],
  openclaw: [
    { id: 'all', label: { zh: '全部', en: 'All' } },
    { id: 'automation', label: { zh: '自动化', en: 'Automation' }, icon: '⚡' },
    { id: 'data', label: { zh: '数据', en: 'Data' }, icon: '📊' },
    { id: 'web', label: { zh: 'Web', en: 'Web' }, icon: '🌐' },
    { id: 'dev', label: { zh: '开发工具', en: 'Dev Tools' }, icon: '🛠' },
    { id: 'finance', label: { zh: '金融', en: 'Finance' }, icon: '💰' },
  ],
};

export default function MarketplacePage() {
  const router = useRouter();
  const { t } = useLocalization();
  const { isAuthenticated } = useUser();
  const [viewMode, setViewMode] = useState<ViewMode>('resources');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [trending, setTrending] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selCat, setSelCat] = useState('all');
  const [sortBy, setSortBy] = useState<'callCount' | 'createdAt' | 'rating'>('callCount');
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [shareModal, setShareModal] = useState<{
    skill: Skill | null; link: ReferralLinkResponse | null; loading: boolean; copied: boolean;
  }>({ skill: null, link: null, loading: false, copied: false });
  const tRef = useRef<HTMLDivElement>(null);
  const pgRef = useRef(1);

  // Debounce 300ms
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(searchQuery), 300); return () => clearTimeout(t); }, [searchQuery]);

  // Trending on mount
  useEffect(() => {
    fetch('/api/unified-marketplace/search?sortBy=callCount&sortOrder=DESC&limit=8&humanAccessible=true')
      .then(r => r.json()).then(d => setTrending(d.items || [])).catch(() => {});
  }, []);

  // Fetch with pagination
  const fetchSkills = useCallback(async (reset = true) => {
    if (viewMode === 'tasks') return;
    if (viewMode === 'openclaw') {
      // OpenClaw skills: agentCompatible=true filter
      if (reset) { setLoading(true); pgRef.current = 1; } else setLoadingMore(true);
      try {
        const p = new URLSearchParams();
        if (debouncedQ) p.set('q', debouncedQ);
        p.append('layer', 'infra'); p.append('layer', 'logic'); p.append('layer', 'composite');
        if (selCat !== 'all') p.set('category', selCat);
        p.set('humanAccessible', 'true'); p.set('limit', '12');
        p.set('page', reset ? '1' : String(pgRef.current + 1));
        p.set('sortBy', sortBy); p.set('sortOrder', 'DESC');
        const res = await fetch('/api/unified-marketplace/search?' + p.toString());
        const data = await res.json();
        const items: Skill[] = data.items || [];
        if (reset) { setSkills(items); pgRef.current = 1; } else { setSkills(prev => [...prev, ...items]); pgRef.current += 1; }
        setTotal(data.total || items.length); setHasMore(items.length >= 12);
      } catch (e) { console.error('OpenClaw fetch error:', e); }
      finally { setLoading(false); setLoadingMore(false); }
      return;
    }
    if (reset) { setLoading(true); pgRef.current = 1; } else setLoadingMore(true);
    try {
      const p = new URLSearchParams();
      if (debouncedQ) p.set('q', debouncedQ);
      if (viewMode === 'resources') p.append('layer', 'resource');
      else { p.append('layer', 'infra'); p.append('layer', 'logic'); p.append('layer', 'composite'); }
      if (selCat !== 'all') p.set(viewMode === 'resources' ? 'resourceType' : 'category', selCat);
      p.set('humanAccessible', 'true'); p.set('limit', '12');
      p.set('page', reset ? '1' : String(pgRef.current + 1));
      p.set('sortBy', sortBy); p.set('sortOrder', 'DESC');
      const res = await fetch(`/api/unified-marketplace/search?${p}`);
      const data = await res.json();
      const items: Skill[] = data.items || [];
      if (reset) { setSkills(items); pgRef.current = 1; } else { setSkills(prev => [...prev, ...items]); pgRef.current += 1; }
      setTotal(data.total || items.length); setHasMore(items.length >= 12);
    } catch (e) { console.error('Fetch error:', e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [viewMode, debouncedQ, selCat, sortBy]);

  useEffect(() => { fetchSkills(true); }, [fetchSkills]);

  const estComm = (s: Skill) => (((s.pricing?.pricePerCall || 0) * (s.pricing?.commissionRate || 20)) / 100).toFixed(2);

  const handleShare = async (skill: Skill) => {
    if (!isAuthenticated) { router.push('/auth/login?redirect=/marketplace'); return; }
    setShareModal({ skill, link: null, loading: true, copied: false });
    try {
      const link = await referralApi.createReferralLink({ type: 'skill', targetId: skill.id, targetName: skill.displayName || skill.name });
      setShareModal(prev => ({ ...prev, link, loading: false }));
    } catch { setShareModal(prev => ({ ...prev, loading: false })); }
  };
  const copyLink = () => {
    if (!shareModal.link?.shortUrl) return;
    navigator.clipboard.writeText(shareModal.link.shortUrl);
    setShareModal(prev => ({ ...prev, copied: true }));
    setTimeout(() => setShareModal(prev => ({ ...prev, copied: false })), 2000);
  };
  const go = (skill: Skill) => router.push(`/skill/${skill.id}`);
  const buy = (skill: Skill) => { if (!isAuthenticated) { router.push('/auth/login?redirect=/marketplace'); return; } router.push(`/pay/checkout?skillId=${skill.id}`); };
  const install = (skill: Skill) => { if (!isAuthenticated) { router.push('/auth/login?redirect=/marketplace'); return; } router.push(`/workbench?action=install&skillId=${skill.id}`); };
  const scrollT = (d: 'l' | 'r') => tRef.current?.scrollBy({ left: d === 'l' ? -300 : 300, behavior: 'smooth' });
  const cats = CATS[viewMode];
  const accent = viewMode === 'resources' ? 'blue' : viewMode === 'openclaw' ? 'green' : 'amber';

  return (
    <>
      <Head><title>{t({ zh: 'Agentrix 市场', en: 'Agentrix Marketplace' })}</title></Head>
      <Navigation />
      <main className="min-h-screen bg-slate-950">

        {/* ── HERO ── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.1),transparent_50%)]" />
          <div className="container mx-auto px-6 pt-12 pb-8 relative">
            <div className="flex items-center gap-6 mb-6 text-sm">
              <span className="flex items-center gap-1.5 text-slate-400"><Package size={14} className="text-blue-400" /><b className="text-white">{total || '---'}</b> {t({ zh: '款商品', en: 'Products' })}</span>
              <span className="flex items-center gap-1.5 text-slate-400"><Users size={14} className="text-green-400" /><b className="text-white">2,400+</b> {t({ zh: '卖家', en: 'Sellers' })}</span>
              <span className="flex items-center gap-1.5 text-slate-400"><DollarSign size={14} className="text-amber-400" /><b className="text-white">$1.2M+</b> {t({ zh: '交易额', en: 'Volume' })}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">{t({ zh: '发现、购买、推广', en: 'Discover, Buy, Promote' })}</h1>
            <p className="text-lg text-slate-400 mb-8 max-w-xl">{t({ zh: '海量商品与工具，一键购买，分享即赚钱', en: 'Products & tools at your fingertips — buy and share to earn' })}</p>
            <div className="max-w-2xl relative mb-6">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input type="text" placeholder={t({ zh: '搜索商品、工具、服务...', en: 'Search products, tools, services...' })} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-slate-900/80 border border-slate-700/80 rounded-2xl text-white text-lg placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Flame size={14} className="text-orange-400" />
              {HOT_TAGS.map(tag => (
                <button key={tag.q} onClick={() => setSearchQuery(tag.q)} className="px-3 py-1 text-xs font-medium text-slate-400 bg-slate-800/60 border border-slate-700/50 rounded-full hover:text-white hover:border-slate-600 transition-all">{t(tag.label)}</button>
              ))}
            </div>
          </div>
        </section>

        {/* ── LAUNCH ACTIVITY BANNER ── */}
        <section className="container mx-auto px-6 pt-6">
          <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-purple-900/40">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(59,130,246,0.15),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(168,85,247,0.1),transparent_60%)]" />
            <div className="relative px-6 py-5 md:px-8 md:py-6 flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded-full text-[10px] font-bold text-blue-300 uppercase tracking-wider animate-pulse">{t({ zh: '🚀 上线活动', en: '🚀 Launch Event' })}</span>
                  <span className="text-xs text-slate-400">{t({ zh: '限时进行中', en: 'Limited Time' })}</span>
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white mb-1">{t({ zh: 'Agentrix Commerce 正式上线 — 三重奖励等你拿', en: 'Agentrix Commerce Launch — Triple Rewards Await' })}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
                  <span className="flex items-center gap-1"><span className="text-amber-400">🎁</span> {t({ zh: '早鸟注册奖 $5', en: 'Early bird $5 bonus' })}</span>
                  <span className="flex items-center gap-1"><span className="text-green-400">💰</span> {t({ zh: '推广佣金最高 20%', en: 'Up to 20% referral commission' })}</span>
                  <span className="flex items-center gap-1"><span className="text-purple-400">🎯</span> {t({ zh: '悬赏任务 $200-$2000', en: 'Bounty tasks $200-$2000' })}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => { setViewMode('tasks'); setSelCat('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                  {t({ zh: '🎯 悬赏任务', en: '🎯 Bounty Board' })}
                </button>
                <button onClick={() => router.push('/alliance')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1">
                  {t({ zh: '立即参与', en: 'Join Now' })} <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── TRENDING ── */}
        {trending.length > 0 && (
          <section className="border-y border-slate-800/60 bg-slate-900/30">
            <div className="container mx-auto px-6 py-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2"><TrendingUp size={18} className="text-orange-400" /><h2 className="text-lg font-bold text-white">{t({ zh: '热门推荐', en: 'Trending Now' })}</h2></div>
                <div className="flex gap-1">
                  <button onClick={() => scrollT('l')} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"><ChevronLeft size={18} /></button>
                  <button onClick={() => scrollT('r')} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"><ChevronRight size={18} /></button>
                </div>
              </div>
              <div ref={tRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth">
                {trending.map((s, i) => (
                  <div key={s.id} onClick={() => go(s)} className="flex-shrink-0 w-[280px] bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/40 transition-all cursor-pointer group relative">
                    {i < 3 && <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : 'bg-amber-700 text-white'}`}>{i + 1}</div>}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                        {s.layer === 'resource' ? <Package size={18} className="text-blue-400" /> : s.layer === 'infra' ? <Zap size={18} className="text-amber-400" /> : <Code size={18} className="text-purple-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-white text-sm truncate group-hover:text-blue-400 transition-colors">{s.displayName || s.name}</h3>
                        <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{s.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {s.rating ? <span className="flex items-center gap-0.5"><Star size={10} className="text-amber-400 fill-amber-400" />{Number(s.rating).toFixed(1)}</span> : null}
                        <span>{(s.callCount || 0).toLocaleString()} {t({ zh: '次', en: 'calls' })}</span>
                      </div>
                      {s.pricing?.pricePerCall ? <span className="text-sm font-bold text-green-400">${s.pricing.pricePerCall}</span> : <span className="text-xs font-medium text-blue-400">{t({ zh: '免费', en: 'Free' })}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TABS + FILTERS ── */}
        <section className="sticky top-[72px] z-30 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/60">
          <div className="container mx-auto px-6 py-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-0.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800">
                {([
                  { m: 'resources' as ViewMode, Icon: ShoppingBag, l: { zh: '资源与商品', en: 'Resources' }, c: 'from-blue-600 to-blue-500 shadow-blue-600/20' },
                  { m: 'openclaw' as ViewMode, Icon: Zap, l: { zh: 'OpenClaw技能', en: 'OpenClaw Skills' }, c: 'from-green-600 to-emerald-500 shadow-green-600/20' },
                  { m: 'tasks' as ViewMode, Icon: Briefcase, l: { zh: '任务集市', en: 'Tasks' }, c: 'from-amber-600 to-orange-500 shadow-amber-600/20' },
                ] as const).map(tab => (
                  <button key={tab.m} onClick={() => { setViewMode(tab.m); setSelCat('all'); pgRef.current = 1; }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === tab.m ? `bg-gradient-to-r ${tab.c} text-white shadow-lg` : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                    <tab.Icon size={15} />{t(tab.l)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1">
                {cats.map(c => (
                  <button key={c.id} onClick={() => { setSelCat(c.id); pgRef.current = 1; }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${selCat === c.id
                      ? (accent === 'blue' ? 'bg-blue-600 text-white' : accent === 'green' ? 'bg-green-600 text-white' : 'bg-amber-600 text-white')
                      : 'text-slate-400 bg-slate-800/50 border border-slate-700/50 hover:text-white hover:bg-slate-800'}`}>
                    {c.icon ? <span className="mr-1">{c.icon}</span> : null}{t(c.label)}
                  </button>
                ))}
              </div>
              <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); pgRef.current = 1; }}
                className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500/50">
                <option value="callCount">{t({ zh: '🔥 最热门', en: '🔥 Popular' })}</option>
                <option value="createdAt">{t({ zh: '🆕 最新', en: '🆕 Newest' })}</option>
                <option value="rating">{t({ zh: '⭐ 最高评分', en: '⭐ Top Rated' })}</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── PROMOTER BANNER ── */}
        {viewMode !== 'tasks' && (
          <section className="container mx-auto px-6 pt-6">
            <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center"><DollarSign size={16} className="text-orange-400" /></div>
                <div>
                  <span className="text-sm font-semibold text-white">{t({ zh: '分享赚佣 — 每笔交易最高 20% 佣金', en: 'Share & Earn — Up to 20% commission per sale' })}</span>
                  <span className="text-xs text-slate-400 ml-2">{t({ zh: '实时到账，无门槛', en: 'Instant, no minimum' })}</span>
                </div>
              </div>
              <button onClick={() => router.push('/workbench?tab=promotion')} className="px-4 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
                {t({ zh: '了解更多', en: 'Learn More' })} <ArrowRight size={12} />
              </button>
            </div>
          </section>
        )}

        {/* ── CONTENT ── */}
        <section className="container mx-auto px-6 py-6">
          {viewMode === 'tasks' ? <TaskMarketplace /> : loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : skills.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 mb-2">{t({ zh: '暂无结果', en: 'No results' })}</p>
              <p className="text-xs text-slate-600">{t({ zh: '试试其他关键词或分类', en: 'Try different keywords' })}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-4">{t({ zh: `共 ${total} 个商品`, en: `${total} products` })}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {skills.map(s => (
                  <SkillCardNew key={s.id} skill={s} viewMode={viewMode === 'resources' ? 'resources' : 'openclaw'} t={t}
                    onClick={() => go(s)} onBuy={() => buy(s)} onInstall={() => install(s)} onShare={() => handleShare(s)} />
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button onClick={() => fetchSkills(false)} disabled={loadingMore}
                    className="px-8 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50">
                    {loadingMore && <Loader2 size={16} className="animate-spin" />}
                    {loadingMore ? t({ zh: '加载中...', en: 'Loading...' }) : t({ zh: '加载更多', en: 'Load More' })}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── CTA ── */}
        <section className="container mx-auto px-6 py-12">
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 rounded-2xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">{t({ zh: '入驻开店，触达全球买家', en: 'Open Your Store, Reach Global Buyers' })}</h2>
                <p className="text-slate-400 mb-6 max-w-lg">{t({ zh: '商家上架商品，开发者发布工具 — 自动获得推广分销网络和支付能力', en: 'List products or publish tools — auto-gain distribution network & payment' })}</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => router.push('/workbench?mode=merchant')} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"><ShoppingBag size={16} />{t({ zh: '商家入驻', en: 'Merchant' })}</button>
                  <button onClick={() => router.push('/workbench?mode=developer')} className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"><Code size={16} />{t({ zh: '开发者', en: 'Developer' })}</button>
                </div>
              </div>
              <div className="flex gap-6 text-center">
                {[{ v: '20%', l: { zh: '推广佣金', en: 'Commission' }, c: 'text-orange-400' }, { v: 'T+1', l: { zh: '结算周期', en: 'Settlement' }, c: 'text-green-400' }, { v: '$0', l: { zh: '入驻费用', en: 'Entry Fee' }, c: 'text-blue-400' }].map(s => (
                  <div key={s.v}><div className={`text-2xl font-bold ${s.c}`}>{s.v}</div><div className="text-xs text-slate-500 mt-1">{t(s.l)}</div></div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />

      {/* ── SHARE MODAL ── */}
      {shareModal.skill && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShareModal({ skill: null, link: null, loading: false, copied: false })}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Share2 className="w-5 h-5 text-orange-400" />{t({ zh: '分享赚佣', en: 'Share & Earn' })}</h3>
              <button onClick={() => setShareModal({ skill: null, link: null, loading: false, copied: false })} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
              <h4 className="font-semibold text-white mb-1">{shareModal.skill.displayName || shareModal.skill.name}</h4>
              <p className="text-sm text-slate-400 line-clamp-2 mb-2">{shareModal.skill.description}</p>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-400 font-semibold">${shareModal.skill.pricing?.pricePerCall || 0}</span>
                <span className="text-orange-400 font-semibold">{t({ zh: `佣金 $${estComm(shareModal.skill)}`, en: `Commission $${estComm(shareModal.skill)}` })}</span>
              </div>
            </div>
            {shareModal.loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : shareModal.link ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t({ zh: '推广短链', en: 'Referral Link' })}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono truncate">{shareModal.link.shortUrl}</div>
                    <button onClick={copyLink} className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${shareModal.copied ? 'bg-green-500/20 text-green-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                      {shareModal.copied ? <><CheckCircle size={14} />{t({ zh: '已复制', en: 'Copied' })}</> : <><Copy size={14} />{t({ zh: '复制', en: 'Copy' })}</>}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🔥 ${shareModal.skill?.displayName || shareModal.skill?.name} - ${shareModal.link?.shortUrl}`)}`, '_blank')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">𝕏 Twitter</button>
                  <button onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareModal.link?.shortUrl || '')}&text=${encodeURIComponent(`🔥 ${shareModal.skill?.displayName || shareModal.skill?.name}`)}`, '_blank')} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">✈️ Telegram</button>
                </div>
                <p className="text-xs text-slate-500 text-center">{t({ zh: '分享链接，好友购买你赚佣金，实时到账', en: 'Share & earn commission instantly' })}</p>
              </div>
            ) : (
              <p className="text-sm text-red-400 text-center py-4">{t({ zh: '生成链接失败，请重试', en: 'Failed, please retry' })}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
