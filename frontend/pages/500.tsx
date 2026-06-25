/**
 * 500 page — Sprint W-3 / W-P2-2.
 *
 * Reuses 404 design language (animated background, helpful navigation).
 * Differentiates by:
 *   - Big "500" gradient
 *   - Apologetic copy + suggestion to retry / contact support
 *   - "Reload" button + "Status page" link
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Home, RefreshCw, MessageCircle, Activity } from 'lucide-react';
import { Button, Card } from '../components/ui/ax';
import { useLocalization } from '../contexts/LocalizationContext';

const HELPFUL_LINKS: Array<{ href: string; label: { zh: string; en: string }; desc: { zh: string; en: string } }> = [
  { href: '/',         label: { zh: '回到首页', en: 'Home' },        desc: { zh: '回首页重新开始',  en: 'Start over' } },
  { href: '/help',     label: { zh: '帮助中心', en: 'Help Center' }, desc: { zh: '查找解决方案',  en: 'Find a solution' } },
  { href: 'mailto:support@agentrix.top', label: { zh: '联系支持', en: 'Contact Support' }, desc: { zh: '我们 24h 内回复', en: 'We reply within 24h' } },
  { href: '/status',   label: { zh: '系统状态', en: 'System Status' }, desc: { zh: '查看服务可用性', en: 'Check service uptime' } },
];

export default function Custom500(): React.ReactElement {
  const { t } = useLocalization();

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <>
      <Head>
        <title>{t({ zh: '500 - 服务器错误 | Agentrix', en: '500 - Server Error | Agentrix' })}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="relative min-h-screen overflow-hidden bg-ax-base flex items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-red-500/15 blur-3xl ax-aurora" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-ax-warm/15 blur-3xl ax-aurora" style={{ animationDelay: '4s' }} />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[28rem] w-[28rem] rounded-full bg-ax-purple/5 blur-3xl" />

        <div className="relative w-full max-w-2xl text-center">
          <div className="mb-6 select-none">
            <span className="ax-text-gradient text-[10rem] md:text-[14rem] font-black leading-none tracking-tighter">
              500
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-ax-ink mb-3">
            {t({ zh: '宠物把服务器打翻了', en: "Our pets knocked over the server" })}
          </h1>
          <p className="text-base text-ax-fog mb-8 max-w-md mx-auto">
            {t({
              zh: '别担心，我们已经收到错误报告 🐾 — 通常稍等片刻刷新就能恢复。',
              en: "We've logged the error 🐾 — usually a quick refresh fixes things.",
            })}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <Button variant="primary" size="lg" leftIcon={<RefreshCw />} onClick={handleReload}>
              {t({ zh: '重新加载', en: 'Reload Page' })}
            </Button>
            <Link href="/">
              <Button variant="secondary" size="lg" leftIcon={<Home />}>
                {t({ zh: '回到首页', en: 'Back to Home' })}
              </Button>
            </Link>
          </div>

          <div className="text-left">
            <p className="mb-3 text-center text-xs uppercase tracking-wider text-ax-mist font-bold">
              <Activity className="inline-block h-3 w-3 mr-1 -mt-0.5" />
              {t({ zh: '其他选择', en: 'Other options' })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HELPFUL_LINKS.map((link) => {
                const isExternal = link.href.startsWith('mailto:') || link.href.startsWith('http');
                const Icon = link.href.startsWith('mailto') ? MessageCircle : Activity;
                const inner = (
                  <Card variant="default" padding="md" hoverable className="group h-full">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-ax-ink">{t(link.label)}</div>
                        <div className="mt-0.5 text-xs text-ax-mist">{t(link.desc)}</div>
                      </div>
                      <Icon className="h-4 w-4 shrink-0 text-ax-mist transition-colors group-hover:text-ax-accent" />
                    </div>
                  </Card>
                );
                return isExternal ? (
                  <a key={link.href} href={link.href}>{inner}</a>
                ) : (
                  <Link key={link.href} href={link.href}>{inner}</Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
