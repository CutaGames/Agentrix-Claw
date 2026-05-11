/**
 * 404 page — v4 design with Agentrix branding, animated pet, smart navigation.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Home, Search, Compass, ArrowRight } from 'lucide-react';
import { Button, Card } from '../components/ui/ax';
import { useLocalization } from '../contexts/LocalizationContext';

const HELPFUL_LINKS: Array<{ href: string; label: { zh: string; en: string }; desc: { zh: string; en: string } }> = [
  { href: '/',            label: { zh: '首页',         en: 'Home' },         desc: { zh: '从头开始',         en: 'Start fresh' } },
  { href: '/console/dashboard', label: { zh: '控制台',  en: 'Console' },      desc: { zh: '管理你的 Agent',   en: 'Manage your agents' } },
  { href: '/pricing',     label: { zh: '价格',         en: 'Pricing' },      desc: { zh: '查看订阅方案',     en: 'View plans' } },
  { href: '/downloads',   label: { zh: '下载',         en: 'Downloads' },    desc: { zh: '获取桌面/移动端',  en: 'Get desktop/mobile' } },
];

export default function Custom404(): React.ReactElement {
  const { t } = useLocalization();
  return (
    <>
      <Head>
        <title>{t({ zh: '404 - 页面未找到 | Agentrix', en: '404 - Not Found | Agentrix' })}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="relative min-h-screen overflow-hidden bg-ax-base flex items-center justify-center px-4 py-12">
        {/* Animated background orbs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-ax-accent/15 blur-3xl ax-aurora" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-ax-purple/15 blur-3xl ax-aurora" style={{ animationDelay: '4s' }} />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[28rem] w-[28rem] rounded-full bg-ax-warm/5 blur-3xl" />

        <div className="relative w-full max-w-2xl text-center">
          {/* Huge 404 with gradient */}
          <div className="mb-6 select-none">
            <span className="ax-text-gradient text-[10rem] md:text-[14rem] font-black leading-none tracking-tighter">
              404
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-ax-ink mb-3">
            {t({ zh: '这里好像没有页面', en: 'Nothing lives here yet' })}
          </h1>
          <p className="text-base text-ax-fog mb-8 max-w-md mx-auto">
            {t({
              zh: '你访问的链接已被宠物吃掉了 🐾 — 看看下面这些去处？',
              en: 'Your pet may have nibbled this link 🐾 — try one of these instead.',
            })}
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <Link href="/">
              <Button variant="primary" size="lg" leftIcon={<Home />}>
                {t({ zh: '回到首页', en: 'Back to Home' })}
              </Button>
            </Link>
            <Link href="/console/dashboard">
              <Button variant="secondary" size="lg" leftIcon={<Compass />} rightIcon={<ArrowRight />}>
                {t({ zh: '打开控制台', en: 'Open Console' })}
              </Button>
            </Link>
          </div>

          {/* Helpful links grid */}
          <div className="text-left">
            <p className="mb-3 text-center text-xs uppercase tracking-wider text-ax-mist font-bold">
              <Search className="inline-block h-3 w-3 mr-1 -mt-0.5" />
              {t({ zh: '你可能在找', en: 'You might be looking for' })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HELPFUL_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  <Card variant="default" padding="md" hoverable className="group h-full">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-ax-ink">{t(link.label)}</div>
                        <div className="mt-0.5 text-xs text-ax-mist">{t(link.desc)}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ax-mist transition-transform group-hover:translate-x-1 group-hover:text-ax-accent" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

