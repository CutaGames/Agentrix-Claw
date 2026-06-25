// 创作分享落地页 — /c/:code
// 解析 shareCode → 展示作品(封面/标题)+ OG 预览(社交分享缩略图)+ 打开App/下载引导。
// SSR 拉取后端公开接口 /v1/creations/by-share/:code(无鉴权)。
import { useEffect, useState } from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';

const API_BASE = 'https://api.agentrix.top/api';
const WEBSITE_BASE = 'https://www.agentrix.top';
const DOWNLOAD_HUB = 'https://agentrix.top/download';
const ANDROID_APK_URL = 'https://agentrix.top/downloads/ClawLink-latest.apk';

interface PublicCreation {
  id: string;
  type: string;
  title: string;
  summary?: string;
  coverUrl?: string;
  shareCode: string;
  deepLink: string;
}

interface Props {
  creation: PublicCreation | null;
  code: string;
}

const TYPE_LABEL: Record<string, string> = {
  game: '🎮 游戏', drama: '🎭 互动剧', shop: '🛒 店铺', livestream: '🔴 直播', stage: '🎤 舞台', place: '🚪 场所',
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const code = String(ctx.params?.code ?? '');
  let creation: PublicCreation | null = null;
  try {
    const res = await fetch(`${API_BASE}/v1/creations/by-share/${encodeURIComponent(code)}`);
    if (res.ok) creation = await res.json();
  } catch {
    /* fall through → not-found view */
  }
  return { props: { creation, code } };
};

export default function CreationLandingPage({ creation, code }: Props) {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'server'>('server');

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const p = /android/i.test(ua) ? 'android' : /iPad|iPhone|iPod/.test(ua) ? 'ios' : 'desktop';
    setPlatform(p);
    // 移动端:尝试用 deep link 直接打开 App(装了就直达)。
    if ((p === 'android' || p === 'ios') && creation) {
      const t = setTimeout(() => { window.location.href = creation.deepLink; }, 400);
      return () => clearTimeout(t);
    }
  }, [creation]);

  const title = creation ? `${creation.title} · Agentrix` : 'Agentrix';
  const desc = creation?.summary || '来 Agentrix 一起玩这个 AI 创作。';
  const ogImage = creation?.coverUrl || `${WEBSITE_BASE}/og-image.png`;
  const downloadUrl = platform === 'android' ? ANDROID_APK_URL : DOWNLOAD_HUB;
  const downloadLabel =
    platform === 'android'
      ? '📥 下载 Android APK（官网）'
      : platform === 'ios'
      ? '📥 下载 Agentrix（官网）'
      : '📥 下载 Agentrix App（官网）';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content={creation?.title || 'Agentrix'} />
        <meta property="og:description" content={desc} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={creation?.title || 'Agentrix'} />
        <meta name="twitter:description" content={desc} />
        <meta name="twitter:image" content={ogImage} />
      </Head>

      <div style={styles.container}>
        <div style={styles.card}>
          {!creation ? (
            <div style={{ textAlign: 'center' }}>
              <div style={styles.logoCircle}><span style={styles.logoEmoji}>🌍</span></div>
              <h1 style={styles.title}>创作未找到</h1>
              <p style={styles.subtitle}>这个分享链接可能已失效或作品已下架（{code}）。</p>
              <a href={WEBSITE_BASE} style={styles.primaryBtn}>前往 Agentrix</a>
            </div>
          ) : (
            <>
              {creation.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creation.coverUrl} alt={creation.title} style={styles.cover} />
              ) : (
                <div style={styles.coverFallback}><span style={{ fontSize: 64 }}>🎮</span></div>
              )}
              <div style={styles.typeBadge}>{TYPE_LABEL[creation.type] || '🎮 创作'}</div>
              <h1 style={styles.title}>{creation.title}</h1>
              {creation.summary ? <p style={styles.subtitle}>{creation.summary}</p> : null}

              <div style={styles.ctaSection}>
                <a href={creation.deepLink} style={styles.primaryBtn}>▶ 在 App 中打开</a>
                <a href={downloadUrl} style={styles.secondaryBtn}>{downloadLabel}</a>
                <a href={DOWNLOAD_HUB} style={styles.tertiaryLink}>
                  {platform === 'android' ? '其他平台下载（Windows / iOS / Watch）' : '查看全部下载方式 · Android APK / Windows / Watch'} →
                </a>
              </div>
              <p style={styles.hint}>扫码即玩 · 在 Agentrix 与 AI 一起共建活世界 · Google Play 上架审核中</p>
            </>
          )}
        </div>
        <p style={styles.footer}>© 2026 Agentrix · <a href={WEBSITE_BASE} style={styles.footerLink}>agentrix.top</a></p>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  card: { background: 'rgba(30,41,59,0.85)', backdropFilter: 'blur(20px)', borderRadius: 24, padding: 24, maxWidth: 420, width: '100%', border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', textAlign: 'center' },
  cover: { width: '100%', height: 300, objectFit: 'cover', borderRadius: 16, marginBottom: 16, background: '#0e1016' },
  coverFallback: { width: '100%', height: 300, borderRadius: 16, marginBottom: 16, background: '#11161d', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  typeBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 10 },
  logoCircle: { width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  logoEmoji: { fontSize: 36 },
  title: { color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 8px' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 },
  ctaSection: { display: 'flex', flexDirection: 'column', gap: 12 },
  primaryBtn: { display: 'block', width: '100%', padding: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', textAlign: 'center', borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box' },
  secondaryBtn: { display: 'block', width: '100%', padding: 14, background: 'transparent', color: '#a5b4fc', textAlign: 'center', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(99,102,241,0.4)', boxSizing: 'border-box' },
  tertiaryLink: { display: 'block', width: '100%', textAlign: 'center', color: 'rgba(165,180,252,0.7)', fontSize: 12, fontWeight: 600, textDecoration: 'none', marginTop: 2 },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 14 },
  footer: { marginTop: 24, color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  footerLink: { color: 'rgba(255,255,255,0.4)', textDecoration: 'none' },
};
