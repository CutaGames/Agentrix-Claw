/**
 * Developers Hub — unified page for both Skill SDK developers and
 * ClawCore hardware partners.
 *
 * Combines the old pages/developers.tsx (Skill SDK) + pages/developers/index.tsx (ClawCore)
 * into one comprehensive, well-designed page.
 */
import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  Code2,
  Package,
  GitBranch,
  Cpu,
  Wallet,
  BookOpen,
  Bluetooth,
  Wifi,
  Shield,
  Zap,
  FileCode2,
  Terminal,
  Award,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

// ─── Skill SDK Section Data ───────────────────────────────────────────────────

const SKILL_PILLARS = [
  { icon: Code2, title: { zh: 'Skill SDK', en: 'Skill SDK' }, desc: { zh: 'TypeScript SDK，3 行代码发布一个 Skill。', en: 'TypeScript SDK — publish a Skill in 3 lines.' } },
  { icon: Package, title: { zh: 'Skill 市场分润', en: 'Marketplace revenue share' }, desc: { zh: '安装 / 调用 / 订阅，按 X402 结算到你的钱包。', en: 'Install / call / subscribe. Settled via X402 to your wallet.' } },
  { icon: GitBranch, title: { zh: 'Worktree 执行环境', en: 'Worktree runtime' }, desc: { zh: 'Skill 在用户本地 Worktree 中执行，与项目代码隔离。', en: 'Skills run in the user\'s local Worktree, isolated from project code.' } },
  { icon: Cpu, title: { zh: 'MCP 协议原生', en: 'Native MCP' }, desc: { zh: '基于 Model Context Protocol，跨模型可用。', en: 'Built on Model Context Protocol — cross-model.' } },
  { icon: Wallet, title: { zh: '内置 X402 计费', en: 'Built-in X402 billing' }, desc: { zh: '无需自建支付，按调用 / 按时长 / 按结果计费。', en: 'No payment infra needed. Bill by call / time / outcome.' } },
  { icon: BookOpen, title: { zh: '完整文档', en: 'Full docs' }, desc: { zh: 'Quickstart、API Reference、Recipes 全部开放。', en: 'Quickstart, API reference, recipes — fully open.' } },
];

// ─── ClawCore Section Data ────────────────────────────────────────────────────

const PROTOCOL_FEATURES = [
  { icon: Bluetooth, label: { zh: 'BLE 5.0', en: 'BLE 5.0' } },
  { icon: Wifi, label: { zh: 'WebSocket', en: 'WebSocket' } },
  { icon: Cpu, label: { zh: 'MQTT', en: 'MQTT' } },
  { icon: Shield, label: { zh: '重放保护', en: 'Replay Protection' } },
  { icon: Zap, label: { zh: '能耗管理', en: 'Energy Mgmt' } },
  { icon: FileCode2, label: { zh: 'JSON Schema', en: 'JSON Schema' } },
];

const SDK_TABLE = [
  { surface: 'TypeScript', lang: 'TS', file: 'bridge.ts', status: 'v1 stable', color: 'text-green-400' },
  { surface: 'Android', lang: 'Kotlin', file: 'bridge.android.kt', status: 'contract', color: 'text-agentrix-solar' },
  { surface: 'iOS', lang: 'Swift', file: 'bridge.ios.swift', status: 'contract', color: 'text-agentrix-solar' },
  { surface: 'Desktop', lang: 'Rust', file: 'bridge.desktop.rs', status: 'contract', color: 'text-agentrix-solar' },
  { surface: 'esp32', lang: 'Rust', file: null, status: 'P5 W10', color: 'text-agentrix-mist' },
  { surface: 'nRF52', lang: 'C', file: null, status: 'P5 W10', color: 'text-agentrix-mist' },
];

export default function DevelopersPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '开发者中心 · Agentrix', en: 'Developers · Agentrix' }),
    description: t({
      zh: '发布 Skill 赚取分润 + 接入 ClawCore 硬件生态。TypeScript SDK + X402 自动结算。',
      en: 'Publish Skills to earn revenue + integrate ClawCore hardware. TypeScript SDK + X402 auto-settlement.',
    }),
    path: '/developers',
  });

  return (
    <MarketingLayout seo={seo}>
      {/* ═══ Hero ═══ */}
      <section className="relative overflow-hidden bg-agentrix-ink pt-20 pb-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-1/4 h-[400px] w-[400px] rounded-full bg-agentrix-electric/10 blur-3xl" />
          <div className="absolute -bottom-20 left-10 h-[300px] w-[300px] rounded-full bg-agentrix-purple/15 blur-3xl" />
        </div>
        <div className="container relative mx-auto max-w-5xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-4 py-1.5 text-xs text-agentrix-fog backdrop-blur">
            <Code2 size={14} className="text-agentrix-electric" />
            {t({ zh: 'Skill SDK + ClawCore Protocol · 开发者生态', en: 'Skill SDK + ClawCore Protocol · Developer Ecosystem' })}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl">
            {t({ zh: '为 Agent 开发，', en: 'Build for Agents.' })}
            <br />
            <span className="bg-gradient-to-r from-agentrix-electric via-agentrix-purpleSoft to-agentrix-solar bg-clip-text text-transparent">
              {t({ zh: '按调用收入', en: 'Earn per call.' })}
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: 'Skill 是 Agentrix 的能力单元，跨 5 端运行，按 X402 微支付分润。ClawCore 让硬件成为宠物 Agent 的物理化身。',
              en: 'Skills are the capability unit — run on 5 surfaces, earn via X402 micropay. ClawCore makes hardware a physical avatar for pet agents.',
            })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/CutaGames/Agentrix-Claw"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
            >
              GitHub <ExternalLink size={14} />
            </a>
            <Link
              href="/skills"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white transition-colors hover:border-agentrix-electric hover:text-agentrix-electric"
            >
              {t({ zh: '浏览 Skill 市场', en: 'Browse Skills' })}
            </Link>
            <Link
              href="/developers/console"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white transition-colors hover:border-agentrix-electric hover:text-agentrix-electric"
            >
              {t({ zh: 'API Keys', en: 'API Keys' })}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Skill SDK ═══ */}
      <section className="bg-agentrix-ink py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '⚡ Skill SDK · 3 行代码发布', en: '⚡ Skill SDK · Publish in 3 lines' })}
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SKILL_PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title.en}
                  className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 transition-all hover:border-agentrix-electric/40 hover:-translate-y-0.5"
                >
                  <Icon size={22} className="text-agentrix-electric" />
                  <h3 className="mt-3 text-base font-bold text-white">{t(p.title)}</h3>
                  <p className="mt-2 text-sm text-agentrix-fog">{t(p.desc)}</p>
                </div>
              );
            })}
          </div>

          {/* CLI snippet */}
          <div className="mt-10 rounded-xl border border-agentrix-inkLine bg-agentrix-ink/60 p-5 font-mono text-sm">
            <div className="flex items-center gap-2 text-agentrix-mist mb-3">
              <Terminal size={14} className="text-agentrix-electric" />
              <span className="text-xs font-semibold">{t({ zh: '快速开始', en: 'Quick start' })}</span>
            </div>
            <pre className="overflow-x-auto text-agentrix-fog leading-relaxed">{`$ npm install -g @agentrix/cli
$ agentrix skill init my-translator
$ agentrix skill publish --price 0.01usd/call`}</pre>
          </div>
        </div>
      </section>

      {/* ═══ ClawCore Hardware ═══ */}
      <section className="bg-agentrix-ink py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '🔌 ClawCore · 硬件接入协议', en: '🔌 ClawCore · Hardware Protocol' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '三层 SDK：Transport（BLE / WS / MQTT）→ Protocol（JSON Schemas）→ Policy（权限 + OTA）',
              en: '3-layer SDK: Transport (BLE / WS / MQTT) → Protocol (JSON Schemas) → Policy (permissions + OTA)',
            })}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 md:grid-cols-6">
            {PROTOCOL_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label.en} className="flex flex-col items-center gap-2 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-3 text-center">
                  <Icon size={20} className="text-agentrix-electric" />
                  <span className="text-[11px] font-medium text-agentrix-fog">{t(f.label)}</span>
                </div>
              );
            })}
          </div>

          {/* SDK Table */}
          <div className="mt-8 overflow-hidden rounded-xl border border-agentrix-inkLine">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-agentrix-inkLine bg-agentrix-inkSoft">
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '平台', en: 'Surface' })}</th>
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '语言', en: 'Lang' })}</th>
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '合约', en: 'Contract' })}</th>
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '状态', en: 'Status' })}</th>
                </tr>
              </thead>
              <tbody>
                {SDK_TABLE.map((row) => (
                  <tr key={row.surface} className="border-b border-agentrix-inkLine/50 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-medium text-white">{row.surface}</td>
                    <td className="px-4 py-2.5 text-agentrix-mist">{row.lang}</td>
                    <td className="px-4 py-2.5">
                      {row.file ? (
                        <a href={`https://github.com/CutaGames/Agentrix/blob/main/shared/clawcore/v1/${row.file}`} target="_blank" rel="noopener noreferrer" className="text-agentrix-electric hover:underline">
                          {row.file}
                        </a>
                      ) : <span className="text-agentrix-mist">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 font-medium ${row.color}`}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══ Certification ═══ */}
      <section className="bg-agentrix-ink py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '🏅 认证流程', en: '🏅 Certification' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '100 项自动化测试套件。通过后获得 L2 联名或 L3 第三方上架资格。',
              en: '100-item automated test suite. Pass to qualify for L2 co-brand or L3 third-party listing.',
            })}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { n: '1', title: t({ zh: '申请合作', en: 'Apply' }), desc: t({ zh: '邮件 partners@agentrix.top', en: 'Email partners@agentrix.top' }) },
              { n: '2', title: t({ zh: '本地认证', en: 'Run cert' }), desc: t({ zh: 'agentrix cert run --device-id <id>', en: 'agentrix cert run --device-id <id>' }) },
              { n: '3', title: t({ zh: '颁发徽章', en: 'Badge issued' }), desc: t({ zh: 'L2/L3 认证通过', en: 'L2/L3 certification granted' }) },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-agentrix-electric/30 to-agentrix-purpleSoft/30 text-sm font-bold text-white">{s.n}</div>
                <h3 className="mt-3 text-sm font-bold text-white">{s.title}</h3>
                <p className="mt-1 text-xs text-agentrix-mist">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Link href="/developers/cert" className="inline-flex items-center gap-1.5 text-sm font-semibold text-agentrix-electric hover:underline">
              <Award size={14} /> {t({ zh: '认证仪表盘 →', en: 'Certification dashboard →' })}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="bg-gradient-to-br from-agentrix-purple/20 via-agentrix-ink to-agentrix-electric/10 py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold">{t({ zh: '开始构建', en: 'Start building' })}</h2>
          <p className="mt-3 text-agentrix-fog">
            {t({ zh: '无论是 Skill 开发还是硬件接入，我们都提供完整的工具链和文档。', en: 'Whether building Skills or integrating hardware, we provide complete tooling and docs.' })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="mailto:partners@agentrix.top" className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink">
              {t({ zh: '联系合作', en: 'Contact partnership' })} <ArrowRight size={14} />
            </a>
            <a href="https://github.com/CutaGames/Agentrix" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white hover:border-agentrix-electric">
              GitHub <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
