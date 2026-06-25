import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useUser } from '../../contexts/UserContext';
import { ArrowRight, Zap, ShieldCheck, Globe } from 'lucide-react';

export function HeroSection() {
  const { t } = useLocalization();
  const { isAuthenticated } = useUser();
  const router = useRouter();

  return (
    <section className="relative overflow-hidden min-h-[90vh] flex items-center pt-20">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-slate-950">
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              {t({ zh: 'AI 经济的基础设施', en: 'Infrastructure for AI Economy' })}
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight text-white tracking-tight">
              {t({ zh: '让 AI Agent 拥有', en: 'Empower AI Agents with' })}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 block mt-2">
                {t({ zh: '真实的商业能力', en: 'Real Business Capabilities' })}
              </span>
            </h1>
            
            <p className="text-lg text-slate-300 max-w-xl leading-relaxed">
              {t({ 
                zh: 'Agentrix 是首个为 AI 智能体设计的去中心化商业协议。集成支付、订单处理、分佣结算与全球合规，让代码产生真实价值。', 
                en: 'Agentrix is the first decentralized business protocol designed for AI Agents. Integrating payments, order processing, commission settlement, and global compliance.' 
              })}
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={() => router.push(isAuthenticated ? '/agent-enhanced' : '/auth/register')}
                className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/25 overflow-hidden"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                <span className="relative flex items-center gap-2">
                  {t({ zh: '开始构建', en: 'Start Building' })}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
              
              <button
                onClick={() => router.push('/unified-marketplace')}
                className="px-8 py-4 bg-slate-800/50 hover:bg-slate-800 text-white font-bold rounded-xl border border-white/10 hover:border-white/20 transition-all backdrop-blur-sm"
              >
                {t({ zh: '浏览市场', en: 'Explore Marketplace' })}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/5">
              {[
                { icon: Zap, label: '5 min Integration', value: 'SDK Ready' },
                { icon: ShieldCheck, label: 'Global Compliance', value: 'KYC/AML' },
                { icon: Globe, label: 'Cross-Border', value: '150+ Countries' },
              ].map((item, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <item.icon className="w-4 h-4 text-blue-400" />
                    {item.label}
                  </div>
                  <div className="text-white font-bold">{item.value}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Hero Visual / Demo */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl blur opacity-30 animate-pulse" />
            <div className="relative bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              {/* Fake Browser Header */}
              <div className="h-10 bg-slate-800 border-b border-white/5 flex items-center px-4 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                </div>
                <div className="flex-1 text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-slate-950/50 text-[10px] text-slate-400 font-mono">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    agentrix.protocol
                  </div>
                </div>
              </div>

              {/* Demo Content */}
              <div className="p-6 space-y-6">
                {/* Chat Message 1 */}
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">U</div>
                  <div className="bg-slate-800 rounded-2xl rounded-tl-none p-4 max-w-[80%] text-sm text-slate-200">
                    {t({ zh: '帮我订阅 ChatGPT Plus 并支付', en: 'Subscribe to ChatGPT Plus and pay for it' })}
                  </div>
                </div>

                {/* Chat Message 2 (Agent) */}
                <div className="flex gap-4 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-xs font-bold text-white">AI</div>
                  <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl rounded-tr-none p-4 max-w-[90%] space-y-3">
                    <p className="text-sm text-blue-100">
                      {t({ zh: '已为您生成支付链接。此交易包含自动化订阅服务。', en: 'Payment link generated. This transaction includes automated subscription service.' })}
                    </p>
                    
                    {/* Payment Card */}
                    <div className="bg-slate-900 rounded-xl p-4 border border-blue-500/30 shadow-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center">
                            <img src="/openai-logo.png" alt="OpenAI" className="w-6 h-6 opacity-80" onError={(e) => e.currentTarget.style.display = 'none'} />
                            <Zap className="w-6 h-6 text-black" />
                          </div>
                          <div>
                            <div className="font-bold text-white">ChatGPT Plus</div>
                            <div className="text-xs text-slate-400">Monthly Subscription</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-white">$20.00</div>
                          <div className="text-xs text-emerald-400">Recurring</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Protocol Fee (0.1%)</span>
                          <span className="text-slate-400">$0.02</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Agent Commission</span>
                          <span className="text-emerald-400">+$1.00</span>
                        </div>
                      </div>

                      <button className="w-full mt-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                        <ShieldCheck className="w-3 h-3" />
                        {t({ zh: '确认支付', en: 'Confirm Payment' })}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
