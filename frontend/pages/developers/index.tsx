/**
 * ClawCore Developer Portal — hardware partner landing page.
 *
 * Phase 5 HW-12.3 — redesigned with dark theme + MarketingLayout.
 */
import Link from 'next/link';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  Cpu,
  Bluetooth,
  Wifi,
  Shield,
  Zap,
  FileCode2,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Terminal,
  Award,
} from 'lucide-react';

const SDK_TABLE = [
  { surface: 'Reference (TypeScript)', lang: 'TS', file: 'bridge.ts', status: 'v1 — stable', statusColor: 'text-green-400' },
  { surface: 'Android', lang: 'Kotlin', file: 'bridge.android.kt', status: 'contract — impl P5b', statusColor: 'text-agentrix-solar' },
  { surface: 'iOS', lang: 'Swift', file: 'bridge.ios.swift', status: 'contract — impl P5b', statusColor: 'text-agentrix-solar' },
  { surface: 'Desktop', lang: 'Rust (Tauri)', file: 'bridge.desktop.rs', status: 'contract — impl P5b', statusColor: 'text-agentrix-solar' },
  { surface: 'esp32', lang: 'Rust (esp-rs)', file: null, status: 'P5 W10 (firmware)', statusColor: 'text-agentrix-mist' },
  { surface: 'nRF52', lang: 'C (Zephyr)', file: null, status: 'P5 W10 (firmware)', statusColor: 'text-agentrix-mist' },
];

const PROTOCOL_FEATURES = [
  { icon: Bluetooth, label: { zh: 'BLE 5.0 低功耗', en: 'BLE 5.0 Low Energy' } },
  { icon: Wifi, label: { zh: 'WebSocket 实时', en: 'WebSocket Real-time' } },
  { icon: Cpu, label: { zh: 'MQTT IoT 协议', en: 'MQTT IoT Protocol' } },
  { icon: Shield, label: { zh: '重放保护 + OTA', en: 'Replay Protection + OTA' } },
  { icon: Zap, label: { zh: '能耗预算管理', en: 'Energy Budget Mgmt' } },
  { icon: FileCode2, label: { zh: 'JSON Schema 标准', en: 'JSON Schema Standard' } },
];

export default function DeveloperPortalPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: 'ClawCore 开发者门户 · Agentrix', en: 'ClawCore Developer Portal · Agentrix' }),
    description: t({
      zh: '为你的硬件接入 Agentrix 宠物生态。SDK、协议规范、认证流程。',
      en: 'Bring Agentrix pets onto your hardware. SDKs, protocol spec, and certification.',
    }),
    path: '/developers',
  });

  return (
    <MarketingLayout seo={seo}>
      {/* Hero */}
      <section className="relative overflow-hidden bg-agentrix-ink pt-20 pb-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 right-1/4 h-[400px] w-[400px] rounded-full bg-agentrix-electric/10 blur-3xl" />
          <div className="absolute -bottom-20 left-10 h-[300px] w-[300px] rounded-full bg-agentrix-purple/15 blur-3xl" />
        </div>
        <div className="container relative mx-auto max-w-5xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-4 py-1.5 text-xs text-agentrix-fog backdrop-blur">
            <Cpu size={14} className="text-agentrix-electric" />
            {t({ zh: 'ClawCore Protocol v1 · 硬件合作伙伴计划', en: 'ClawCore Protocol v1 · Hardware Partner Program' })}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl">
            {t({ zh: '让你的硬件', en: 'Bring Agentrix pets' })}
            <br />
            <span className="bg-gradient-to-r from-agentrix-electric via-agentrix-purpleSoft to-agentrix-solar bg-clip-text text-transparent">
              {t({ zh: '接入 Agentrix 宠物生态', en: 'onto your hardware' })}
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: '玩具、穿戴设备、控制器、环境显示器 —— 通过 ClawCore SDK 让任何硬件成为宠物 Agent 的物理化身。',
              en: 'Toys, wearables, controllers, ambient displays — make any hardware a physical avatar for pet agents via ClawCore SDK.',
            })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:partners@agentrix.top"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
            >
              {t({ zh: '申请合作', en: 'Apply for partnership' })}
              <ArrowRight size={16} />
            </a>
            <a
              href="https://github.com/CutaGames/Agentrix"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white transition-colors hover:border-agentrix-electric hover:text-agentrix-electric"
            >
              GitHub <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Protocol */}
      <section className="bg-agentrix-ink py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '1. 协议架构', en: '1. Protocol Architecture' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: 'ClawCore v1 是三层 SDK：Transport（BLE / WS / MQTT）→ Protocol（JSON Schemas）→ Policy（权限 + OTA）。',
              en: 'ClawCore v1 is a 3-layer SDK: Transport (BLE / WS / MQTT) → Protocol (JSON Schemas) → Policy (permissions + OTA).',
            })}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {PROTOCOL_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.label.en}
                  className="flex flex-col items-center gap-2 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4 text-center transition-colors hover:border-agentrix-electric/40"
                >
                  <Icon size={22} className="text-agentrix-electric" />
                  <span className="text-xs font-medium text-agentrix-fog">{t(f.label)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md"
              className="inline-flex items-center gap-1.5 rounded-lg border border-agentrix-inkLine bg-agentrix-inkSoft px-4 py-2 text-sm text-agentrix-electric hover:border-agentrix-electric/50"
            >
              <FileCode2 size={14} /> RFC: ClawCore Protocol v0 (中文)
            </Link>
            <a
              href="https://agentrix.top/schemas/clawcore/v1/pet_state.json"
              className="inline-flex items-center gap-1.5 rounded-lg border border-agentrix-inkLine bg-agentrix-inkSoft px-4 py-2 text-sm text-agentrix-fog hover:text-white hover:border-agentrix-electric/50"
            >
              <FileCode2 size={14} /> pet_state.json
            </a>
            <a
              href="https://agentrix.top/schemas/clawcore/v1/approval_request.json"
              className="inline-flex items-center gap-1.5 rounded-lg border border-agentrix-inkLine bg-agentrix-inkSoft px-4 py-2 text-sm text-agentrix-fog hover:text-white hover:border-agentrix-electric/50"
            >
              <FileCode2 size={14} /> approval_request.json
            </a>
          </div>
        </div>
      </section>

      {/* SDKs */}
      <section className="bg-agentrix-ink py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '2. SDK 与接口合约', en: '2. SDKs & Interface Contracts' })}
          </h2>
          <p className="mt-3 text-sm text-agentrix-fog">
            {t({
              zh: '参考接口合约（Phase 5 W10 后续）。具体原生实现在 Bridge SDK 路线图中跟踪。',
              en: 'Reference interface contracts (Phase 5 W10 follow-on). Native implementations tracked in Bridge SDK roadmap.',
            })}
          </p>

          <div className="mt-8 overflow-hidden rounded-xl border border-agentrix-inkLine">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-agentrix-inkLine bg-agentrix-inkSoft">
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '平台', en: 'Surface' })}</th>
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '语言', en: 'Language' })}</th>
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '合约', en: 'Contract' })}</th>
                  <th className="px-4 py-3 text-left font-semibold text-agentrix-fog">{t({ zh: '状态', en: 'Status' })}</th>
                </tr>
              </thead>
              <tbody>
                {SDK_TABLE.map((row) => (
                  <tr key={row.surface} className="border-b border-agentrix-inkLine/50 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{row.surface}</td>
                    <td className="px-4 py-3 text-agentrix-mist">{row.lang}</td>
                    <td className="px-4 py-3">
                      {row.file ? (
                        <a
                          href={`https://github.com/CutaGames/Agentrix/blob/main/shared/clawcore/v1/${row.file}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-agentrix-electric hover:underline"
                        >
                          {row.file} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-agentrix-mist">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 font-medium ${row.statusColor}`}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Certification */}
      <section className="bg-agentrix-ink py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '3. 认证流程', en: '3. Certification' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '设备必须通过 100 项 ClawCore 认证套件才能获得 L2 联名或 L3 第三方上架资格。套件覆盖线格式、重放保护、OTA、配对、性能和能耗预算。',
              en: 'Devices must pass the 100-item ClawCore certification suite to qualify for L2 co-brand or L3 third-party listings. Covers wire format, replay protection, OTA, pairing, performance, and energy budget.',
            })}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                step: '1',
                title: t({ zh: '申请 + 样品', en: 'Apply + Sample' }),
                desc: t({ zh: '邮件联系 partners@agentrix.top，提交设备类别和目标上市日期。', en: 'Email partners@agentrix.top with device class and target ship date.' }),
              },
              {
                step: '2',
                title: t({ zh: '本地认证', en: 'Local Certification' }),
                desc: t({ zh: '运行 agentrix cert run --device-id <id>，100 项自动化测试。', en: 'Run agentrix cert run --device-id <id>, 100 automated tests.' }),
              },
              {
                step: '3',
                title: t({ zh: '颁发认证', en: 'Certification Issued' }),
                desc: t({ zh: 'Agentrix 抽样验证通过后颁发 L2/L3 认证徽章。', en: 'After Agentrix spot-check, L2/L3 certification badge issued.' }),
              },
            ].map((s) => (
              <div
                key={s.step}
                className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-agentrix-electric/30 to-agentrix-purpleSoft/30 text-sm font-bold text-white">
                  {s.step}
                </div>
                <h3 className="mt-3 text-base font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-xs text-agentrix-mist leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-agentrix-inkLine bg-agentrix-ink/60 p-4 font-mono text-sm">
            <div className="flex items-center gap-2 text-agentrix-mist mb-2">
              <Terminal size={14} className="text-agentrix-electric" />
              <span className="text-xs font-semibold">{t({ zh: '本地运行认证', en: 'Run certification locally' })}</span>
            </div>
            <pre className="overflow-x-auto text-agentrix-fog">
{`$ npm install -g @agentrix/cli
$ agentrix cert run --device-id <your-device-id>`}
            </pre>
          </div>

          <div className="mt-4">
            <Link
              href="/developers/cert"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-agentrix-electric hover:underline"
            >
              <Award size={14} />
              {t({ zh: '查看实时认证仪表盘 →', en: 'View live certification dashboard →' })}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-agentrix-purple/20 via-agentrix-ink to-agentrix-electric/10 py-16 border-t border-agentrix-inkLine">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '4. 开始合作', en: '4. Get Started' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '发送邮件至 partners@agentrix.top，附上设备类别、目标上市日期和期望的 L2/L3 层级。',
              en: 'Email partners@agentrix.top with your device class, target ship date, and intended L2/L3 tier.',
            })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:partners@agentrix.top"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
            >
              {t({ zh: '联系合作', en: 'Contact Partnership' })}
              <ArrowRight size={16} />
            </a>
            <Link
              href="/developers/console"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white transition-colors hover:border-agentrix-electric hover:text-agentrix-electric"
            >
              {t({ zh: 'API Keys 控制台', en: 'API Keys Console' })}
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
