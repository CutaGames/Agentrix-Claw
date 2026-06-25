import { useRouter } from 'next/router';
import { useLocalization } from '../../contexts/LocalizationContext';
import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export function CTASection() {
  const { t } = useLocalization();
  const router = useRouter();

  return (
    <section className="relative py-24 bg-slate-900 overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-emerald-600 opacity-10" />
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 bg-center [mask-image:linear-gradient(180deg,transparent,white,transparent)]" />

      <div className="container mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
            <Sparkles className="w-3 h-3 text-yellow-300" />
            {t({ zh: '立即开始', en: 'Start Now' })}
          </div>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
            {t({ zh: '让 AI Agent 成为', en: 'Turn AI Agents into' })}
            <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-emerald-200">
              {t({ zh: '独立商业体', en: 'Independent Business Entities' })}
            </span>
          </h2>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            {t({ 
              zh: '5 分钟创建 Agent · 立即体验工作台 · 查看完整文档', 
              en: 'Create Agent in 5 min · Experience Workspace · View Full Docs' 
            })}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <button
              onClick={() => router.push('/agent-builder')}
              className="px-8 py-4 bg-white text-blue-600 font-bold rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
            >
              {t({ zh: '立即创建 Agent', en: 'Create Agent Now' })}
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push('/agent-enhanced')}
              className="px-8 py-4 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20 transition-all backdrop-blur-sm"
            >
              {t({ zh: '体验工作台', en: 'Try Workspace' })}
            </button>
            <button
              onClick={() => router.push('/developers')}
              className="px-8 py-4 text-slate-300 font-bold hover:text-white transition-colors underline underline-offset-4 decoration-slate-500 decoration-dotted"
            >
              {t({ zh: '查看文档', en: 'View Docs' })}
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
