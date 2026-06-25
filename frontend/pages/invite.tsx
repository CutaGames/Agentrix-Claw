import Link from 'next/link';
import { useState } from 'react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { ArrowRight, Sparkles, Check } from 'lucide-react';

const STEPS = [
  { zh: '输入邀请码', en: 'Enter your invite code' },
  { zh: '注册 Agentrix 账号', en: 'Create your Agentrix account' },
  { zh: '在 Console 选择 Living Agent 形象', en: 'Pick your Living Agent in Console' },
  { zh: '下载 Mobile / Desktop 客户端', en: 'Install Mobile / Desktop apps' },
  { zh: '开启 Auto-Earn 试用', en: 'Enable Auto-Earn trial' },
];

export default function InvitePage() {
  const { t } = useLocalization();
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const seo = buildSeo({
    title: t({ zh: '邀请码 · Agentrix', en: 'Invite · Agentrix' }),
    description: t({
      zh: '使用邀请码解锁 Pro / Team 试用，立即体验 Living Agent 与 Auto-Earn。',
      en: 'Use an invite code to unlock Pro / Team trial. Experience Living Agent and Auto-Earn now.',
    }),
    path: '/invite',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitted(true);
    // Stripe 上线前：先把邀请码写入 localStorage，注册流程读取后绑定
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentrix_invite_code', code.trim());
    }
  }

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto grid gap-12 px-6 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-4 py-1.5 text-xs text-agentrix-fog">
              <Sparkles size={14} className="text-agentrix-solar" />
              {t({ zh: '内测邀请码限时开放', en: 'Closed-beta invites open' })}
            </div>
            <h1 className="mt-5 text-4xl font-extrabold md:text-5xl">
              {t({
                zh: '一行邀请码，开启五端旅程',
                en: 'One invite code. Five-surface journey.',
              })}
            </h1>
            <p className="mt-4 text-agentrix-fog">
              {t({
                zh: '通过邀请码加入 Agentrix v3 内测，获得 Pro 试用、Skill 市场提前体验、以及 Auto-Earn 早鸟份额。',
                en: 'Join the v3 closed beta — Pro trial, early Skill market access, and an Auto-Earn early-bird share.',
              })}
            </p>
            <form onSubmit={handleSubmit} className="mt-8 flex max-w-md gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t({ zh: 'INVITE-XXXX-XXXX', en: 'INVITE-XXXX-XXXX' })}
                className="flex-1 rounded-full border border-agentrix-inkLine bg-agentrix-inkSoft px-5 py-3 text-sm text-white placeholder:text-agentrix-mist focus:border-agentrix-electric focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-5 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
              >
                {t({ zh: '验证', en: 'Verify' })}
                <ArrowRight size={14} />
              </button>
            </form>
            {submitted && (
              <div className="mt-4 rounded-xl border border-agentrix-electric/40 bg-agentrix-electric/10 p-4 text-sm text-white">
                {t({
                  zh: '邀请码已记录。请继续注册并在 Console 中绑定。',
                  en: 'Invite code captured. Continue to sign up and link it in Console.',
                })}
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/auth/login?next=/console/dashboard"
                    className="rounded-full bg-agentrix-solar px-4 py-1.5 text-xs font-bold text-agentrix-ink"
                  >
                    {t({ zh: '前往注册', en: 'Sign up' })}
                  </Link>
                  <Link
                    href="/download"
                    className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-bold text-white"
                  >
                    {t({ zh: '下载客户端', en: 'Download apps' })}
                  </Link>
                </div>
              </div>
            )}
            <p className="mt-6 text-xs text-agentrix-mist">
              {t({
                zh: '没有邀请码？关注 X / Telegram 获取每周抽签名额。',
                en: 'No invite? Follow X / Telegram for weekly raffle slots.',
              })}
            </p>
          </div>

          <div className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-8">
            <h3 className="text-lg font-bold text-white">
              {t({ zh: '5 步进入 Agentrix 生态', en: 'Five steps into the Agentrix ecosystem' })}
            </h3>
            <ol className="mt-6 space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.en} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-agentrix-electric/15 text-xs font-bold text-agentrix-electric">
                    {i + 1}
                  </span>
                  <span className="text-sm text-agentrix-fog">{t(s)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 rounded-xl border border-agentrix-inkLine bg-agentrix-ink/60 p-4 text-xs text-agentrix-mist">
              <Check size={14} className="mb-2 text-agentrix-electric" />
              {t({
                zh: '邀请码可叠加 Pro 7 天试用 + Auto-Earn 早鸟份额。',
                en: 'Invite codes stack with 7-day Pro trial + Auto-Earn early share.',
              })}
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
