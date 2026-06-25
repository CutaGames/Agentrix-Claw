/**
 * Hero section — first-impression "Pet-as-Agent" pitch with mesh gradient,
 * animated aurora orbs and trust indicators.
 */
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Smartphone, Monitor, Globe2, Watch, Server,
  Sparkles, ShieldCheck, Coins, ArrowRight,
} from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

export function HeroLiving() {
  const { t } = useLocalization();
  return (
    <section className="relative overflow-hidden ax-mesh-bg pt-20 pb-28 md:pt-32 md:pb-36">
      {/* Grid lines backdrop */}
      <div className="pointer-events-none absolute inset-0 ax-grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

      {/* Animated aurora orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-ax-purple/25 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/3 right-1/4 h-[420px] w-[420px] rounded-full bg-ax-accent/20 blur-[110px] animate-pulse" style={{ animationDuration: '8s', animationDelay: '1s' }} />
        <div className="absolute -bottom-32 left-10 h-[360px] w-[360px] rounded-full bg-ax-warm/12 blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      {/* Conic-gradient aurora ring behind headline */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 -z-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-[0.08]">
        <div className="h-full w-full rounded-full bg-ax-aurora animate-ax-aurora blur-3xl" />
      </div>

      <div className="container relative z-10 mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-4xl text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-ax-line/80 bg-white/[0.04] px-4 py-1.5 text-xs text-ax-fog backdrop-blur-md shadow-ax-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-ax-accent/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ax-accent" />
            </span>
            {t({
              zh: 'Agentrix v4 · Pet-as-Agent Economy 正式上线',
              en: 'Agentrix v4 — Pet-as-Agent Economy is here',
            })}
          </motion.div>

          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-[64px] md:leading-[1.04]">
            {t({
              zh: '你养的每一只宠物，',
              en: 'Every pet you raise',
            })}
            <br />
            <span className="ax-text-gradient">
              {t({
                zh: '都是一个能赚钱的 AI Agent',
                en: 'is an AI agent that earns',
              })}
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mx-auto mt-7 max-w-2xl text-[15px] leading-relaxed text-ax-fog md:text-lg"
          >
            {t({
              zh: 'ERC-8004 独立身份 · MPC 独立钱包 · X402 微支付。跨 Mobile / Desktop / Web / Watch / Toy 五端陪你、帮你、替你赚钱。',
              en: 'ERC-8004 identity · MPC wallet · X402 micropay. Across Mobile / Desktop / Web / Watch / Toy — companions, works, earns.',
            })}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/download"
              className="group inline-flex items-center gap-2 rounded-full bg-ax-warm px-7 py-3.5 text-sm font-bold text-ax-base shadow-ax-glow-warm transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(245,158,11,0.45)]"
            >
              {t({ zh: '下载 Agentrix', en: 'Download Agentrix' })}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/auth/login?next=/console/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-ax-line bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-ax-ink backdrop-blur-sm transition-all hover:border-ax-accent hover:bg-ax-accent/5 hover:text-ax-accent"
            >
              {t({ zh: '打开 Web Console', en: 'Open Web Console' })}
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-10 grid gap-2 text-xs text-ax-mist sm:flex sm:flex-wrap sm:justify-center sm:gap-x-7 sm:gap-y-2"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-ax-accent" />
              {t({ zh: 'MPC 三方分片 · 签名只在 Mobile', en: 'MPC 3-share · signs on Mobile only' })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Coins size={14} className="text-ax-warm" />
              {t({
                zh: '1 AXP = $0.001 · 签到 / 对话 / 推广 / 消费返现',
                en: '1 AXP = $0.001 · check-in / chat / refer / cashback',
              })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe2 size={14} className="text-ax-purpleSoft" />
              {t({ zh: 'A2A · ERC-8004 · X402 原生支持', en: 'A2A · ERC-8004 · X402 native' })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={14} className="text-ax-accent" />
              {t({ zh: '6 族群灵魂 × 无限皮肤', en: '6 clans × unlimited skins' })}
            </span>
          </motion.div>

          {/* Trust indicators row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-16 flex flex-col items-center gap-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ax-mist">
              {t({ zh: '一个 Agent · 五块屏幕 · 一只钱包', en: 'One Agent · Five Screens · One Wallet' })}
            </p>
            <div className="flex items-center gap-5 text-ax-mist/80">
              {[Smartphone, Monitor, Globe2, Watch, Server].map((Icon, i) => (
                <Icon key={i} size={20} className="transition-colors hover:text-ax-accent" />
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom fade for smooth section transition */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ax-base to-transparent" />
    </section>
  );
}
