import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { Code2, Package, GitBranch, Cpu, Wallet, BookOpen } from 'lucide-react';

const PILLARS = [
  { icon: Code2, title: { zh: 'Skill SDK', en: 'Skill SDK' }, desc: { zh: 'TypeScript SDK，3 行代码发布一个 Skill。', en: 'TypeScript SDK — publish a Skill in 3 lines.' } },
  { icon: Package, title: { zh: 'Skill 市场分润', en: 'Marketplace revenue share' }, desc: { zh: '安装 / 调用 / 订阅，按 X402 结算到你的钱包。', en: 'Install / call / subscribe. Settled via X402 to your wallet.' } },
  { icon: GitBranch, title: { zh: 'Worktree 执行环境', en: 'Worktree runtime' }, desc: { zh: 'Skill 在用户本地 Worktree 中执行，与项目代码隔离。', en: 'Skills run in the user\'s local Worktree, isolated from project code.' } },
  { icon: Cpu, title: { zh: 'MCP 协议原生', en: 'Native MCP' }, desc: { zh: '基于 Model Context Protocol，跨模型可用。', en: 'Built on Model Context Protocol — cross-model.' } },
  { icon: Wallet, title: { zh: '内置 X402 计费', en: 'Built-in X402 billing' }, desc: { zh: '无需自建支付，按调用 / 按时长 / 按结果计费。', en: 'No payment infra needed. Bill by call / time / outcome.' } },
  { icon: BookOpen, title: { zh: '完整文档', en: 'Full docs' }, desc: { zh: 'Quickstart、API Reference、Recipes 全部开放。', en: 'Quickstart, API reference, recipes — fully open.' } },
];

export default function DevelopersPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '开发者中心 · Agentrix', en: 'Developers · Agentrix' }),
    description: t({
      zh: '用 TypeScript SDK 发布你的 Skill，跨 5 端运行，按 X402 自动结算分润。',
      en: 'Publish Skills with the TypeScript SDK. Run on 5 surfaces. Auto-settle revenue via X402.',
    }),
    path: '/developers',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '为 Agent 开发，按调用收入', en: 'Build for Agents. Earn per call.' })}</h1>
            <p className="mt-4 max-w-2xl text-agentrix-fog mx-auto">
              {t({
                zh: 'Skill 是 Agentrix 的能力单元。任何开发者都能发布 Skill，跨 5 端运行，按 X402 微支付分润。',
                en: 'Skills are the capability unit. Any developer can publish them, run on all 5 surfaces, and earn via X402 micropayments.',
              })}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="https://github.com/CutaGames/Agentrix-Claw" target="_blank" rel="noopener noreferrer" className="rounded-full bg-agentrix-electric px-6 py-3 text-sm font-bold text-agentrix-ink">
                {t({ zh: 'GitHub 仓库', en: 'GitHub repo' })}
              </a>
              <Link href="/skills" className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white">
                {t({ zh: '浏览 Skill 市场', en: 'Browse Skills' })}
              </Link>
            </div>
          </div>

          <div id="cli" className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <Icon size={24} className="text-agentrix-electric" />
                  <h3 className="mt-4 text-lg font-bold text-white">{t(p.title)}</h3>
                  <p className="mt-2 text-sm text-agentrix-fog">{t(p.desc)}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-16 rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 font-mono text-sm">
            <pre className="overflow-x-auto whitespace-pre text-agentrix-fog">{`# 安装 Agentrix CLI
$ npm install -g @agentrix/cli

# 创建你的第一个 Skill
$ agentrix skill init my-translator

# 发布到 Skill 市场
$ agentrix skill publish --price 0.01usd/call`}</pre>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
