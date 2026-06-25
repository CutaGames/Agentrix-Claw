import { useRouter } from 'next/router';
import { useLocalization } from '../../contexts/LocalizationContext';
import { User, Store, Code, Share2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function AgentRolesSection() {
  const { t } = useLocalization();
  const router = useRouter();

  const roles = [
    {
      id: 'personal',
      icon: User,
      title: { zh: '个人 Agent', en: 'Personal Agent' },
      subtitle: { zh: '智能购物助手', en: 'Smart Shopping Assistant' },
      desc: { zh: '帮我找最便宜的 iPhone 15', en: 'Find me the cheapest iPhone 15' },
      tags: ['Product Search', 'Price Compare', 'Marketplace Access'],
      color: 'blue',
      benefit: { zh: '节省 30% 购物时间', en: 'Save 30% shopping time' }
    },
    {
      id: 'merchant',
      icon: Store,
      title: { zh: '商户 Agent', en: 'Merchant Agent' },
      subtitle: { zh: '智能商户助手', en: 'Smart Merchant Assistant' },
      desc: { zh: '自动处理订单并结算', en: 'Auto process orders and settle' },
      tags: ['Product Management', 'Order Processing', 'Auto-Listing'],
      color: 'emerald',
      benefit: { zh: '降低 50% 运营成本', en: 'Reduce 50% operating cost' }
    },
    {
      id: 'developer',
      icon: Code,
      title: { zh: '开发者 Agent', en: 'Developer Agent' },
      subtitle: { zh: '智能开发助手', en: 'Smart Development Assistant' },
      desc: { zh: '生成支付集成代码', en: 'Generate payment integration code' },
      tags: ['SDK Gen', 'API Integration', 'Plugin Dev'],
      color: 'purple',
      benefit: { zh: '5分钟完成集成', en: '5 min integration' }
    },
    {
      id: 'promoter',
      icon: Share2,
      title: { zh: '推广 Agent', en: 'Promoter Agent' },
      subtitle: { zh: '智能推广助手', en: 'Smart Promotion Assistant' },
      desc: { zh: '推广商户获得永久分佣', en: 'Promote merchants for permanent commission' },
      tags: ['Affiliate', 'Referral', 'Revenue Share'],
      color: 'pink',
      benefit: { zh: '0.5% 永久分佣', en: '0.5% permanent commission' }
    }
  ];

  const getColorClasses = (color: string) => {
    const map: Record<string, string> = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20 group-hover:border-blue-500/50',
      emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 group-hover:border-emerald-500/50',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20 group-hover:border-purple-500/50',
      pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20 group-hover:border-pink-500/50',
    };
    return map[color] || map.blue;
  };

  return (
    <section className="py-24 bg-slate-900 border-y border-white/5">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <p className="text-blue-400 uppercase text-xs tracking-[0.4em] font-bold">
            {t({ zh: 'Agent 能做什么？', en: 'What Can Agents Do?' })}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            {t({ zh: '4 种 Agent 角色，覆盖所有商业场景', en: '4 Agent Roles, Covering All Business Scenarios' })}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {roles.map((role, idx) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`group p-8 rounded-3xl border transition-all hover:bg-white/[0.02] ${getColorClasses(role.color).split(' ').slice(2).join(' ')} border-white/10`}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${getColorClasses(role.color).split(' ').slice(0, 2).join(' ')}`}>
                    <role.icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white group-hover:text-blue-200 transition-colors">
                      {t(role.title)}
                    </h3>
                    <p className="text-slate-400 text-sm font-medium">
                      {t(role.subtitle)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-950/50 rounded-xl p-4 border border-white/5">
                  <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">
                    {t({ zh: '示例指令', en: 'Example Prompt' })}
                  </p>
                  <p className="text-slate-200 text-sm font-mono">
                    &quot;{t(role.desc)}&quot;
                  </p>
                </div>

                <div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {role.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className={`text-sm font-bold flex items-center gap-2 ${getColorClasses(role.color).split(' ')[1]}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {t(role.benefit)}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <button
            onClick={() => router.push('/agent-builder')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-slate-900 hover:bg-slate-100 font-bold rounded-xl transition-colors shadow-lg shadow-white/10"
          >
            {t({ zh: '立即创建 Agent', en: 'Create Your Agent Now' })}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
