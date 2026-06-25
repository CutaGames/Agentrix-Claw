import { useRouter } from 'next/router';
import { useLocalization } from '../../contexts/LocalizationContext';
import { motion } from 'framer-motion';
import { Users, TrendingUp, Gift, ArrowRight } from 'lucide-react';

export function AllianceSection() {
  const { t } = useLocalization();
  const router = useRouter();

  const stats = [
    {
      icon: Users,
      label: { zh: '固定佣金', en: 'Fixed Commission' },
      value: { zh: '3% - 5%', en: '3% - 5%' },
      sub: { zh: '实物 / 服务 / 链上资产', en: 'Physical / Service / On-chain' },
      color: 'text-blue-400',
      bg: 'bg-blue-500/10'
    },
    {
      icon: TrendingUp,
      label: { zh: '推广收益', en: 'Promotion Revenue' },
      value: { zh: '0.5%', en: '0.5%' },
      sub: { zh: '永久分成 (Lifetime)', en: 'Lifetime Revenue Share' },
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10'
    },
    {
      icon: Gift,
      label: { zh: '推广奖励', en: 'Promotion Rewards' },
      value: { zh: 'Bonus', en: 'Bonus' },
      sub: { zh: '商户入驻一次性奖励', en: 'One-time onboarding reward' },
      color: 'text-purple-400',
      bg: 'bg-purple-500/10'
    }
  ];

  return (
    <section className="py-24 bg-slate-950 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 bg-center [mask-image:linear-gradient(180deg,transparent,white,transparent)]" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
              {t({ zh: '联盟与分佣', en: 'Alliance & Commission' })}
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
              {t({ zh: '分佣透明，', en: 'Transparent Commission, ' })}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                {t({ zh: '网络驱动增长', en: 'Network-Driven Growth' })}
              </span>
            </h2>

            <p className="text-slate-400 text-lg leading-relaxed">
              {t({ 
                zh: '固定佣金 + 推广 Agent 永久分成，打造多赢生态。所有分佣基于智能合约自动计算、自动结算，公开透明，无需人工干预。', 
                en: 'Fixed commission + permanent Promoter Agent share, building a win-win ecosystem. All commissions are automatically calculated and settled via smart contracts, fully transparent without manual intervention.' 
              })}
            </p>

            <div className="flex flex-col gap-4">
              {stats.map((stat, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <div>
                    <div className="text-sm text-slate-400 font-medium">{t(stat.label)}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-white">{t(stat.value)}</span>
                      <span className="text-xs text-slate-500">{t(stat.sub)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => router.push('/alliance')}
              className="inline-flex items-center gap-2 text-pink-400 hover:text-pink-300 font-bold transition-colors group"
            >
              {t({ zh: '查看分佣设计详情', en: 'View Commission Details' })}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            {/* Abstract Network Visualization */}
            <div className="aspect-square rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 blur-[100px] absolute inset-0" />
            
            <div className="relative grid grid-cols-2 gap-4">
              <div className="space-y-4 mt-8">
                <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-xl">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 text-2xl">🛍️</div>
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">GMV</div>
                  <div className="text-2xl font-bold text-white">$1,240.50</div>
                  <div className="text-xs text-emerald-400 mt-2">+12.5% this week</div>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-xl opacity-80">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center mb-4 text-2xl">🤝</div>
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Partners</div>
                  <div className="text-2xl font-bold text-white">85</div>
                  <div className="text-xs text-slate-500 mt-2">Active Promoters</div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-xl opacity-90">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 text-2xl">💰</div>
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Commission</div>
                  <div className="text-2xl font-bold text-emerald-400">$62.00</div>
                  <div className="text-xs text-slate-500 mt-2">Auto-Settled</div>
                </div>
                <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-xl">
                  <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center mb-4 text-2xl">🚀</div>
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Growth</div>
                  <div className="text-2xl font-bold text-white">2.4x</div>
                  <div className="text-xs text-slate-500 mt-2">MoM Revenue</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
