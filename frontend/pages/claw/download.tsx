/**
 * /claw/download — Platform-specific download landing page
 * Handles ?platform=android|ios|cli query param to auto-trigger downloads
 * Falls back to the full download selector if no platform specified.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Navigation } from '../../components/ui/Navigation';
import { Footer } from '../../components/layout/Footer';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  Download, Smartphone, Terminal, ArrowLeft, CheckCircle, ExternalLink,
  Shield, HardDrive, Clock, AlertCircle, type LucideIcon,
} from 'lucide-react';

const DOWNLOAD_BASE = 'https://api.agentrix.top/downloads';

interface SubPlatform { os: string; file: string; label: string; }
interface PlatformConfig {
  icon: LucideIcon;
  name: string;
  fileName: string | null;
  url: string | null;
  requirements: string;
  size: string;
  color: string;
  instructions?: { step: number; text: { zh: string; en: string } }[];
  subPlatforms?: SubPlatform[];
}

const PLATFORMS: Record<string, PlatformConfig> = {
  android: {
    icon: Smartphone,
    name: 'Android',
    fileName: 'ClawLink-latest.apk',
    url: `${DOWNLOAD_BASE}/ClawLink-latest.apk`,
    requirements: 'Android 7.0+',
    size: '~45 MB',
    color: 'violet',
    instructions: [
      { step: 1, text: { zh: '点击下载按钮获取 APK 文件', en: 'Click download to get the APK file' } },
      { step: 2, text: { zh: '安装前需允许"未知来源"安装应用', en: 'Allow "Install from Unknown Sources" when prompted' } },
      { step: 3, text: { zh: '打开 APK 文件完成安装', en: 'Open the APK file to install' } },
      { step: 4, text: { zh: '启动 ClawLink，注册/登录，选择部署方式', en: 'Launch ClawLink, sign up/log in, choose deployment' } },
    ],
  },
  ios: {
    icon: Smartphone,
    name: 'iOS',
    fileName: null,
    url: 'https://testflight.apple.com',
    requirements: 'iOS 15+ · TestFlight',
    size: 'N/A',
    color: 'cyan',
    instructions: [
      { step: 1, text: { zh: '确保已安装 TestFlight 应用', en: 'Ensure TestFlight app is installed' } },
      { step: 2, text: { zh: '点击按钮加入 Beta 测试', en: 'Click button to join the Beta' } },
      { step: 3, text: { zh: '在 TestFlight 中接受邀请并安装', en: 'Accept the invite in TestFlight and install' } },
      { step: 4, text: { zh: '启动 ClawLink 并登录', en: 'Launch ClawLink and log in' } },
    ],
  },
  cli: {
    icon: Terminal,
    name: 'Desktop',
    fileName: null,
    url: null, // Will be set per-OS
    requirements: 'Windows 10+ / macOS 12+ / Linux',
    size: '~25 MB',
    color: 'emerald',
    subPlatforms: [
      { os: 'Windows', file: 'Agentrix-Setup.exe', label: 'Windows Installer (.exe)' },
      { os: 'macOS', file: 'Agentrix.dmg', label: 'macOS Installer (.dmg)' },
      { os: 'Linux', file: 'Agentrix.AppImage', label: 'Linux AppImage' },
    ],
    instructions: [
      { step: 1, text: { zh: '选择你的操作系统并下载安装包', en: 'Choose your OS and download the installer' } },
      { step: 2, text: { zh: '运行安装程序完成安装', en: 'Run the installer to complete setup' } },
      { step: 3, text: { zh: '程序会自动配置 OpenClaw 本地环境', en: 'The app will auto-configure your local OpenClaw environment' } },
      { step: 4, text: { zh: '用手机扫码连接或在桌面端直接使用', en: 'Scan QR with your phone or use directly on desktop' } },
    ],
  },
} as const;

type PlatformKey = keyof typeof PLATFORMS;

export default function ClawDownloadPage() {
  const router = useRouter();
  const { t } = useLocalization();
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  const platform = (router.query.platform as string)?.toLowerCase() as PlatformKey | undefined;
  const platformConfig = platform ? PLATFORMS[platform] : null;

  // Auto-start download for direct links (android)
  useEffect(() => {
    if (platform === 'android' && platformConfig?.url && !downloading && !downloadStarted) {
      const timer = setTimeout(() => {
        setDownloading(true);
        window.location.href = platformConfig.url!;
        setTimeout(() => {
          setDownloading(false);
          setDownloadStarted(true);
        }, 2000);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [platform, platformConfig, downloading, downloadStarted]);

  const handleDownload = (url: string) => {
    setDownloading(true);
    window.location.href = url;
    setTimeout(() => {
      setDownloading(false);
      setDownloadStarted(true);
    }, 2000);
  };

  const colorMap: Record<string, { text: string; bg: string; border: string }> = {
    violet: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25' },
    cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/25' },
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  };

  if (!platform || !platformConfig) {
    // Show all platforms selector
    return (
      <>
        <Head><title>{t({ zh: '下载 Agentrix Claw', en: 'Download Agentrix Claw' })}</title></Head>
        <Navigation />
        <main className="min-h-screen bg-slate-950 pt-24 pb-16">
          <div className="container mx-auto px-6 max-w-3xl">
            <h1 className="text-3xl font-bold text-white text-center mb-4">
              {t({ zh: '下载 Agentrix Claw', en: 'Download Agentrix Claw' })}
            </h1>
            <p className="text-slate-400 text-center mb-10">
              {t({ zh: '选择你的平台开始使用', en: 'Choose your platform to get started' })}
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {(Object.entries(PLATFORMS) as [PlatformKey, typeof PLATFORMS[PlatformKey]][]).map(([key, p]) => {
                const c = colorMap[p.color];
                return (
                  <button
                    key={key}
                    onClick={() => router.push(`/claw/download?platform=${key}`)}
                    className={`flex flex-col items-center text-center p-7 rounded-2xl bg-slate-900/70 border ${c.border} hover:border-opacity-70 hover:-translate-y-1 transition-all`}
                  >
                    <div className={`w-14 h-14 rounded-2xl ${c.bg} flex items-center justify-center mb-4`}>
                      <p.icon className={`w-7 h-7 ${c.text}`} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{p.name}</h3>
                    <p className="text-xs text-slate-500 mb-4">{p.requirements}</p>
                    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold ${c.bg} ${c.text} border ${c.border}`}>
                      <Download className="w-4 h-4" />
                      {t({ zh: '前往下载', en: 'Download' })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const c = colorMap[platformConfig.color];

  return (
    <>
      <Head>
        <title>{t({ zh: `下载 Agentrix Claw — ${platformConfig.name}`, en: `Download Agentrix Claw — ${platformConfig.name}` })}</title>
      </Head>
      <Navigation />

      <main className="min-h-screen bg-slate-950 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-2xl">
          {/* Back */}
          <button onClick={() => router.push('/claw#download')} className="flex items-center gap-2 text-slate-500 hover:text-white text-sm mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t({ zh: '返回 Claw 页面', en: 'Back to Claw' })}
          </button>

          {/* Download Card */}
          <div className={`rounded-2xl bg-slate-900/80 border ${c.border} p-8 mb-8`}>
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-16 h-16 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center`}>
                <platformConfig.icon className={`w-8 h-8 ${c.text}`} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Agentrix Claw — {platformConfig.name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
                  <span>{platformConfig.requirements}</span>
                  {platformConfig.size && <span>· {platformConfig.size}</span>}
                </div>
              </div>
            </div>

            {/* Download button(s) */}
            {platform === 'cli' && 'subPlatforms' in platformConfig ? (
              <div className="space-y-3">
                {platformConfig.subPlatforms.map((sp) => (
                  <button
                    key={sp.os}
                    onClick={() => handleDownload(`${DOWNLOAD_BASE}/${sp.file}`)}
                    className={`w-full flex items-center justify-between px-5 py-4 rounded-xl ${c.bg} border ${c.border} hover:border-opacity-70 transition-all group`}
                  >
                    <div className="flex items-center gap-3">
                      <Terminal className={`w-5 h-5 ${c.text}`} />
                      <div className="text-left">
                        <div className="text-white font-semibold">{sp.os}</div>
                        <div className="text-xs text-slate-500">{sp.label}</div>
                      </div>
                    </div>
                    <Download className={`w-5 h-5 ${c.text} group-hover:scale-110 transition-transform`} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {downloadStarted ? (
                  <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-green-500/10 border border-green-500/25">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-green-300 font-semibold">
                      {t({ zh: '下载已开始！请检查浏览器下载列表', en: 'Download started! Check your browser downloads' })}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => platformConfig.url && handleDownload(platformConfig.url)}
                    disabled={downloading || !platformConfig.url}
                    className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl ${c.bg} border ${c.border} ${c.text} font-bold text-lg hover:scale-[1.02] transition-all disabled:opacity-50`}
                  >
                    {downloading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        {t({ zh: '正在开始下载...', en: 'Starting download...' })}
                      </>
                    ) : platform === 'ios' ? (
                      <>
                        <ExternalLink className="w-5 h-5" />
                        {t({ zh: '打开 TestFlight', en: 'Open TestFlight' })}
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        {t({ zh: '立即下载', en: 'Download Now' })}
                      </>
                    )}
                  </button>
                )}

                {platform === 'android' && !downloadStarted && (
                  <p className="text-xs text-slate-500 text-center">
                    {t({ zh: '下载将自动开始，如未开始请点击按钮', en: 'Download will start automatically. Click button if it doesn\'t.' })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Installation Instructions */}
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-8 mb-8">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              {t({ zh: '安装步骤', en: 'Installation Steps' })}
            </h2>
            <div className="space-y-4">
              {platformConfig.instructions.map((inst) => (
                <div key={inst.step} className="flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-full ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
                    <span className={`text-sm font-bold ${c.text}`}>{inst.step}</span>
                  </div>
                  <p className="text-slate-300 text-sm pt-1.5">{t(inst.text)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5">
              <HardDrive className="w-5 h-5 text-violet-400 mb-2" />
              <h3 className="text-white font-semibold text-sm mb-1">
                {t({ zh: '10 GB 免费存储', en: '10 GB Free Storage' })}
              </h3>
              <p className="text-xs text-slate-500">
                {t({ zh: '注册即送，可升级至 100 GB', en: 'Free on signup, upgradeable to 100 GB' })}
              </p>
            </div>
            <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-5">
              <Clock className="w-5 h-5 text-cyan-400 mb-2" />
              <h3 className="text-white font-semibold text-sm mb-1">
                {t({ zh: '30 秒上线', en: '30s to Go Live' })}
              </h3>
              <p className="text-xs text-slate-500">
                {t({ zh: '云端一键部署，无需配置', en: 'One-tap cloud deploy, zero config' })}
              </p>
            </div>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm">
            <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-slate-400">
              {t({
                zh: '所有安装包均由 Agentrix 官方构建和签名。如果你的浏览器或系统警告"未知来源"，这是正常现象——我们的应用尚未上架应用商店，后续会提供 App Store / Google Play 版本。',
                en: 'All installers are officially built and signed by Agentrix. If your browser or OS warns about "unknown source", this is normal — we haven\'t published to app stores yet. App Store / Google Play versions coming soon.',
              })}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
