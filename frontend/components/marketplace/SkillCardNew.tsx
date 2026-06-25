import { Star, Package, Zap, Code, Layers, TrendingUp, Share2, DollarSign } from 'lucide-react';

interface Skill {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  layer: string;
  category: string;
  rating?: number;
  callCount?: number;
  pricing?: { type: string; pricePerCall?: number; currency?: string; commissionRate?: number };
  tags?: string[];
  authorInfo?: { id: string; name: string; type: string };
  ucpEnabled?: boolean;
  x402Enabled?: boolean;
  metadata?: { performanceMetric?: string; persona?: string; image?: string };
  imageUrl?: string;
  thumbnailUrl?: string;
}

interface Props {
  skill: Skill;
  viewMode: 'resources' | 'openclaw';
  t: (v: { zh: string; en: string }) => string;
  onClick: () => void;
  onBuy: () => void;
  onInstall: () => void;
  onShare: () => void;
}

export function SkillCardNew({ skill, viewMode, t, onClick, onBuy, onInstall, onShare }: Props) {
  const price = skill.pricing?.pricePerCall;
  const isFree = skill.pricing?.type === 'free' || !price;
  const rate = skill.pricing?.commissionRate || 20;
  const commission = ((price || 0) * rate / 100).toFixed(2);
  const hasCommission = parseFloat(commission) > 0;

  if (viewMode === 'openclaw') {
    return (
      <div onClick={onClick} className="group bg-slate-900/60 border border-slate-800/60 rounded-xl p-4 hover:border-purple-500/40 transition-all cursor-pointer flex flex-col">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            skill.layer === 'infra' ? 'bg-amber-500/15 text-amber-400' :
            skill.layer === 'logic' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'
          }`}>
            {skill.layer === 'infra' ? <Zap size={20} /> : skill.layer === 'logic' ? <Code size={20} /> : <Layers size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white text-sm truncate group-hover:text-purple-400 transition-colors">{skill.displayName || skill.name}</h3>
            {skill.authorInfo && <p className="text-[11px] text-slate-500">by {skill.authorInfo.name}</p>}
          </div>
          {hasCommission && (
            <span className="px-2 py-0.5 bg-orange-500/15 text-orange-400 text-[10px] font-semibold rounded-md flex-shrink-0">
              💰 ${commission}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 line-clamp-2 mb-3 flex-1">{skill.description}</p>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-3 flex-wrap">
          <span className="px-1.5 py-0.5 bg-slate-800/80 rounded">⏱ {skill.metadata?.performanceMetric || '~50ms'}</span>
          <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">99.9% up</span>
          {skill.x402Enabled && <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">⚡ X402</span>}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <TrendingUp size={11} />
            <span>{(skill.callCount || 0).toLocaleString()} {t({ zh: '次', en: 'calls' })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={e => { e.stopPropagation(); onShare(); }} className="px-2 py-1 bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1">
              <Share2 size={10} /> {t({ zh: '赚佣', en: 'Earn' })}
            </button>
            <button onClick={e => { e.stopPropagation(); onInstall(); }} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium rounded-md transition-colors">
              {isFree ? t({ zh: '安装', en: 'Install' }) : `$${price}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Resources card
  const imgSrc = skill.imageUrl || skill.thumbnailUrl || skill.metadata?.image;
  return (
    <div onClick={onClick} className="group bg-slate-900/60 border border-slate-800/60 rounded-xl overflow-hidden hover:border-blue-500/40 transition-all cursor-pointer flex flex-col">
      {/* Image or compact header */}
      {imgSrc ? (
        <div className="aspect-[16/9] bg-slate-800 relative overflow-hidden">
          <img src={imgSrc} alt={skill.displayName || skill.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          {price && <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded-md text-white text-xs font-bold">${price}</div>}
          {hasCommission && <div className="absolute top-2 left-2 px-2 py-0.5 bg-orange-500/90 rounded-md text-white text-[10px] font-bold">💰 赚 ${commission}</div>}
          <div className="absolute bottom-1.5 left-1.5 flex gap-1">
            {skill.ucpEnabled && <span className="px-1 py-0.5 text-[8px] bg-emerald-500/90 text-white rounded">📦 UCP</span>}
            {skill.x402Enabled && <span className="px-1 py-0.5 text-[8px] bg-amber-500/90 text-white rounded">⚡ X402</span>}
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 flex items-center justify-between">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
            <Package size={18} className="text-blue-400" />
          </div>
          <div className="flex items-center gap-1.5">
            {price && <span className="text-sm font-bold text-green-400">${price}</span>}
            {hasCommission && <span className="px-1.5 py-0.5 bg-orange-500/15 text-orange-400 text-[10px] font-semibold rounded-md">💰 ${commission}</span>}
          </div>
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-white text-sm truncate mb-1 group-hover:text-blue-400 transition-colors">{skill.displayName || skill.name}</h3>
        <p className="text-xs text-slate-400 line-clamp-2 mb-3 flex-1">{skill.description}</p>
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {skill.rating && (
              <span className="flex items-center gap-0.5"><Star size={10} className="text-amber-400 fill-amber-400" />{Number(skill.rating).toFixed(1)}</span>
            )}
            {skill.callCount ? <span>{skill.callCount.toLocaleString()} {t({ zh: '次', en: 'sales' })}</span> : null}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={e => { e.stopPropagation(); onShare(); }} className="px-2 py-1 bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1">
              <Share2 size={10} /> {t({ zh: '赚佣', en: 'Earn' })}
            </button>
            <button onClick={e => { e.stopPropagation(); onBuy(); }} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium rounded-md transition-colors">
              {t({ zh: '购买', en: 'Buy' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
