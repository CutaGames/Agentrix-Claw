/**
 * /download — Multi-platform download hub.
 *
 * Sprint W-4: upgraded from desktop-only to multi-platform (Windows /
 * Android APK / iOS / Watch APK). Auto-detects current device's
 * platform and pre-highlights the relevant card. UTM + invite code
 * tracking is preserved per platform; backend tracker accepts
 * `platform: windows | android | ios | watch | macos`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { API_BASE_URL } from '../lib/api/client';

type PlatformId = 'windows' | 'android' | 'ios' | 'watch' | 'macos';

interface PlatformDef {
  id: PlatformId;
  badge: string;
  emoji: string;
  title: { zh: string; en: string };
  subtitle: { zh: string; en: string };
  ctaLabel: { zh: string; en: string };
  url: string;
  available: boolean;
  external?: boolean;
  size?: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'windows',
    badge: 'Windows',
    emoji: '🖥️',
    title: { zh: 'Windows 桌面端', en: 'Windows Desktop' },
    subtitle: {
      zh: 'v0.2.0 · ~7 MB · Windows 10 / 11 (x64)',
      en: 'v0.2.0 · ~7 MB · Windows 10 / 11 (x64)',
    },
    ctaLabel: { zh: '⬇️ 下载 Windows', en: '⬇️ Download Windows' },
    url: 'https://agentrix.top/downloads/Agentrix-Setup.exe',
    available: true,
  },
  {
    id: 'android',
    badge: 'Android',
    emoji: '📱',
    title: { zh: 'Android 手机端', en: 'Android Mobile' },
    subtitle: {
      zh: 'v1.1.0 · ~124 MB · Android 11+',
      en: 'v1.1.0 · ~124 MB · Android 11+',
    },
    ctaLabel: { zh: '⬇️ 下载 Android APK', en: '⬇️ Download Android APK' },
    url: 'https://agentrix.top/downloads/ClawLink-latest.apk',
    available: true,
  },
  {
    id: 'ios',
    badge: 'iOS',
    emoji: '🍎',
    title: { zh: 'iOS 手机端', en: 'iOS Mobile' },
    subtitle: {
      zh: 'App Store 审核中（预计 2026-06 上架）',
      en: 'In App Store review (ETA 2026-06)',
    },
    ctaLabel: { zh: 'TestFlight 即将开放', en: 'TestFlight coming soon' },
    url: '#testflight-coming',
    available: false,
    external: true,
  },
  {
    id: 'watch',
    badge: 'Wear OS',
    emoji: '⌚',
    title: { zh: 'Watch 配套', en: 'Watch Companion' },
    subtitle: {
      zh: '~52 MB · Wear OS 4+ · 需配合 Mobile App 使用',
      en: '~52 MB · Wear OS 4+ · pairs with Mobile App',
    },
    ctaLabel: { zh: '⬇️ 下载 Watch APK', en: '⬇️ Download Watch APK' },
    url: 'https://agentrix.top/downloads/agentrix-watch.apk',
    available: true,
  },
  {
    id: 'macos',
    badge: 'macOS',
    emoji: '🖥️',
    title: { zh: 'macOS 桌面端', en: 'macOS Desktop' },
    subtitle: {
      zh: '内测后跟进（计划 2026-Q3）',
      en: 'After internal beta (planned 2026-Q3)',
    },
    ctaLabel: { zh: 'Coming soon', en: 'Coming soon' },
    url: '#macos-coming',
    available: false,
    external: true,
  },
];

function detectPlatform(): PlatformId | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent.toLowerCase();
  if (/android/i.test(ua)) return 'android';
  if (/(iphone|ipad|ipod)/i.test(ua)) return 'ios';
  if (/mac(intel|ppc| os)/i.test(ua)) return 'macos';
  if (/(win|windows)/i.test(ua)) return 'windows';
  return null;
}

export default function DownloadPage() {
  const { t } = useLocalization();
  const router = useRouter();
  const [downloadingId, setDownloadingId] = useState<PlatformId | null>(null);
  const [detected, setDetected] = useState<PlatformId | null>(null);

  // Capture UTM + invite once on mount
  const [params, setParams] = useState<{
    utmSource?: string;
    utmCampaign?: string;
    utmMedium?: string;
    inviteCode?: string;
    referrer?: string;
  }>({});

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    setParams({
      utmSource: pickStr(q.utm_source) || pickStr(q.source),
      utmCampaign: pickStr(q.utm_campaign),
      utmMedium: pickStr(q.utm_medium),
      inviteCode: pickStr(q.invite) || pickStr(q.code),
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
    });
  }, [router.isReady, router.query]);

  const orderedPlatforms = useMemo(() => {
    if (!detected) return PLATFORMS;
    const head = PLATFORMS.filter((p) => p.id === detected);
    const rest = PLATFORMS.filter((p) => p.id !== detected);
    return [...head, ...rest];
  }, [detected]);

  const handleDownload = async (p: PlatformDef) => {
    if (!p.available || downloadingId) return;
    setDownloadingId(p.id);
    try {
      // Track (best-effort; never block the download)
      void fetch(`${API_BASE_URL}/desktop/download/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, platform: p.id }),
      }).catch(() => {});
      window.location.href = p.url;
    } finally {
      setTimeout(() => setDownloadingId(null), 3000);
    }
  };

  const seo = buildSeo({
    title: t({
      zh: '下载 Agentrix · 桌面 / 移动 / Watch',
      en: 'Download Agentrix · Desktop / Mobile / Watch',
    }),
    description: t({
      zh: '一站式下载入口：Windows 桌面 v0.2.0、Android APK v1.1.0、Watch 配套、macOS / iOS 即将到来。',
      en: 'One-stop download: Windows Desktop v0.2.0, Android APK v1.1.0, Watch companion, macOS / iOS coming.',
    }),
    path: '/download',
  });

  return (
    <MarketingLayout seo={seo}>
      <main className="bg-gradient-to-b from-gray-950 via-indigo-950 to-black text-white">
        {/* Hero */}
        <section className="container mx-auto px-6 py-16 md:py-20 max-w-5xl">
          <div className="text-center">
            <div className="text-6xl mb-4">🦊</div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {t({ zh: '下载 Agentrix', en: 'Download Agentrix' })}
            </h1>
            <p className="text-lg text-gray-300 mb-2">
              {t({
                zh: '一只 Agent · 五块屏幕 · 一只钱包',
                en: 'One Agent · Five Screens · One Wallet',
              })}
            </p>
            {detected && (
              <p className="text-sm text-violet-300 mb-2">
                {t({
                  zh: `检测到当前设备：${platformLabel(detected, 'zh')}（已置顶推荐）`,
                  en: `Detected: ${platformLabel(detected, 'en')} (highlighted below)`,
                })}
              </p>
            )}
          </div>
        </section>

        {/* Platform cards */}
        <section className="container mx-auto px-6 py-8 max-w-5xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderedPlatforms.map((p) => (
              <PlatformCard
                key={p.id}
                p={p}
                t={t}
                downloadingId={downloadingId}
                handleDownload={handleDownload}
                isDetected={detected === p.id}
              />
            ))}
          </div>
        </section>

        {/* SmartScreen guide for Windows */}
        <section className="container mx-auto px-6 py-12 max-w-3xl">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {t({ zh: '首次安装通过 SmartScreen（仅 Windows）', en: 'Pass SmartScreen on first install (Windows only)' })}
          </h2>
          <p className="text-gray-400 text-center mb-8 text-sm leading-relaxed">
            {t({
              zh: '内测期间未做代码签名，Windows SmartScreen 可能弹蓝色或红色警告。下面 4 步通过：',
              en: 'During internal beta we do not yet code-sign the installer. Windows SmartScreen may show a blue or red warning. Pass it in 4 steps:',
            })}
          </p>

          <ol className="space-y-4">
            {[
              {
                zh: '双击下载的 setup.exe',
                en: 'Double-click the downloaded setup.exe',
              },
              {
                zh: '看到 "Windows 已保护你的电脑" 提示后，点击 更多信息（不是关闭按钮）',
                en: 'When you see "Windows protected your PC", click More info (not the close button)',
              },
              {
                zh: '点击出现的 仍要运行 按钮',
                en: 'Click the Run anyway button that appears',
              },
              {
                zh: '进入正常 NSIS 安装向导',
                en: 'Continue through the normal NSIS installer',
              },
            ].map((step, i) => (
              <li
                key={i}
                className="flex gap-4 items-start p-4 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center font-bold">
                  {i + 1}
                </div>
                <div className="text-gray-300">{t(step)}</div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-gray-500 text-center">
            {t({
              zh: 'v0.2.1+ 我们会接入 Azure Trusted Signing，届时不再有此提示。',
              en: 'v0.2.1+ will be signed via Azure Trusted Signing — no warning after that.',
            })}
          </p>
        </section>

        {/* Android sideload guide */}
        <section className="container mx-auto px-6 py-12 max-w-3xl">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {t({ zh: 'Android APK 旁加载', en: 'Android APK sideload' })}
          </h2>
          <p className="text-gray-400 text-center mb-8 text-sm leading-relaxed">
            {t({
              zh: 'Play Store 审核期间，先用 APK 旁加载安装。3 步完成：',
              en: 'While Play Store review is pending, install via APK sideload — 3 steps:',
            })}
          </p>
          <ol className="space-y-4">
            {[
              { zh: '在浏览器或文件管理器中打开下载的 APK', en: 'Open the downloaded APK in your browser or file manager' },
              { zh: 'Android 提示"未知来源"时，点击 "设置" → 允许此来源', en: 'When Android prompts "Unknown source", tap Settings → allow this source' },
              { zh: '回到 APK 安装界面，点击"安装"', en: 'Return to the APK installer and tap Install' },
            ].map((step, i) => (
              <li key={i} className="flex gap-4 items-start p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold">
                  {i + 1}
                </div>
                <div className="text-gray-300">{t(step)}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* System requirements */}
        <section className="container mx-auto px-6 py-12 max-w-4xl">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {t({ zh: '系统要求', en: 'System Requirements' })}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <RequirementCard
              title={t({ zh: '桌面端（Windows）', en: 'Desktop (Windows)' })}
              items={[
                'Windows 10 1903+ / Windows 11 (x64)',
                t({ zh: '内存 ≥ 4 GB（推荐 8 GB）', en: 'RAM ≥ 4 GB (8 GB recommended)' }),
                t({ zh: '磁盘 ≥ 100 MB（本地模型另需 4 GB）', en: 'Disk ≥ 100 MB (+ 4 GB for local LLM)' }),
                t({ zh: 'WebView2（安装器自动安装）', en: 'WebView2 (auto-installed)' }),
              ]}
            />
            <RequirementCard
              title={t({ zh: '移动端（Android）', en: 'Mobile (Android)' })}
              items={[
                'Android 11+',
                t({ zh: '内存 ≥ 4 GB（VRM 渲染 ≥ 8 GB 体验最佳）', en: 'RAM ≥ 4 GB (≥ 8 GB for full VRM rendering)' }),
                t({ zh: '可选权限：摄像头 / 麦克风 / NFC / 蓝牙', en: 'Optional: Camera / Mic / NFC / Bluetooth' }),
                t({ zh: '存储 ≥ 200 MB', en: 'Storage ≥ 200 MB' }),
              ]}
            />
            <RequirementCard
              title={t({ zh: '网络', en: 'Network' })}
              items={[
                t({ zh: '可访问 api.agentrix.top', en: 'Access to api.agentrix.top' }),
                t({ zh: '语音 / 视频生成需稳定带宽', en: 'Stable bandwidth for voice / video' }),
              ]}
            />
            <RequirementCard
              title={t({ zh: 'Watch / Toy 配对', en: 'Watch / Toy Pairing' })}
              items={[
                t({ zh: 'Wear OS 4+', en: 'Wear OS 4+' }),
                t({ zh: '蓝牙 5.0+ + 移动端配对', en: 'Bluetooth 5.0+ via Mobile pairing' }),
                t({ zh: 'Watch APK 通过 Mobile 应用安装到手表', en: 'Watch APK installed to wrist via Mobile App' }),
              ]}
            />
          </div>
        </section>

        {/* Community */}
        <section className="container mx-auto px-6 py-12 max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-6">
            {t({ zh: '加入内测群', en: 'Join the Beta Community' })}
          </h2>
          <p className="text-gray-400 mb-8 text-sm">
            {t({
              zh: '反馈问题、获取最新更新、和团队直接交流',
              en: 'Report issues, get updates, and chat with our team',
            })}
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <a
              href="https://t.me/agentrix"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg text-sm font-medium"
            >
              📨 Telegram Group
            </a>
            <a
              href="https://discord.gg/agentrix"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 rounded-lg text-sm font-medium"
            >
              🎮 Discord Server
            </a>
            <Link
              href="/help"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/15 rounded-lg text-sm font-medium"
            >
              📖 {t({ zh: '用户手册', en: 'User Manuals' })}
            </Link>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}

function PlatformCard({
  p,
  t,
  downloadingId,
  handleDownload,
  isDetected,
}: {
  p: PlatformDef;
  t: (m: { zh: string; en: string }) => string;
  downloadingId: PlatformId | null;
  handleDownload: (p: PlatformDef) => void;
  isDetected: boolean;
}) {
  const isLoading = downloadingId === p.id;
  return (
    <div
      className={`relative rounded-xl border p-6 transition-all ${
        isDetected
          ? 'border-violet-400/50 bg-violet-500/5 shadow-[0_0_40px_rgba(139,92,246,0.15)]'
          : 'border-white/10 bg-white/5'
      }`}
    >
      {isDetected && (
        <span className="absolute -top-3 right-4 inline-block rounded-full bg-violet-500 px-3 py-0.5 text-xs font-bold text-white">
          {t({ zh: '当前设备', en: 'Your device' })}
        </span>
      )}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-3xl">{p.emoji}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-violet-300">{p.badge}</span>
      </div>
      <h3 className="text-lg font-bold mb-1">{t(p.title)}</h3>
      <p className="text-xs text-gray-500 mb-5">{t(p.subtitle)}</p>
      <button
        type="button"
        disabled={!p.available || isLoading}
        onClick={() => handleDownload(p)}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
          p.available && !isLoading
            ? 'bg-violet-500 hover:bg-violet-600 text-white'
            : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'
        }`}
      >
        {isLoading
          ? t({ zh: '正在跳转下载…', en: 'Redirecting…' })
          : t(p.ctaLabel)}
      </button>
    </div>
  );
}

function RequirementCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="p-5 bg-white/5 rounded-lg border border-white/10">
      <h3 className="text-sm font-bold mb-3 text-violet-300">{title}</h3>
      <ul className="space-y-2 text-sm text-gray-300">
        {items.map((item, i) => (
          <li key={i}>
            <span className="text-violet-400 mr-2">·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function platformLabel(id: PlatformId, lang: 'zh' | 'en'): string {
  const labels: Record<PlatformId, { zh: string; en: string }> = {
    windows: { zh: 'Windows', en: 'Windows' },
    android: { zh: 'Android 手机', en: 'Android' },
    ios: { zh: 'iOS 手机', en: 'iOS' },
    macos: { zh: 'macOS', en: 'macOS' },
    watch: { zh: 'Watch', en: 'Watch' },
  };
  return labels[id][lang];
}
