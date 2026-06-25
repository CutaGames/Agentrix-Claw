// 推广链接落地页 — /r/:code
// 智能判断：移动端已安装App → Deep Link 打开App / 未安装 → 下载引导 + 网页版入口 / 桌面端 → 跳转网页版
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const APP_STORE_URL = 'https://apps.apple.com/app/agentrix/id0000000000'; // TODO: replace with real App Store ID
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.agentrix.app'; // TODO: replace
const DEEP_LINK_PREFIX = 'agentrix://referral/';
const WEBSITE_BASE = 'https://www.agentrix.top';

function detectPlatform() {
  if (typeof window === 'undefined') return 'server';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  return 'desktop';
}

export default function ReferralLandingPage() {
  const router = useRouter();
  const { code } = router.query;
  const [platform, setPlatform] = useState<string>('server');
  const [deepLinkFailed, setDeepLinkFailed] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!code) return;
    const p = detectPlatform();
    setPlatform(p);

    if (p === 'desktop') {
      // Desktop: resolve short link via backend API, then redirect to target page
      fetch(`/api/referral/r/${code}/resolve`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.fullUrl) {
            window.location.href = data.fullUrl;
          } else {
            window.location.href = `${WEBSITE_BASE}/marketplace?ref=${code}`;
          }
        })
        .catch(() => {
          window.location.href = `${WEBSITE_BASE}/marketplace?ref=${code}`;
        });
      return;
    }

    // Mobile: try deep link first
    const deepLink = `${DEEP_LINK_PREFIX}${code}`;
    const start = Date.now();

    // Try to open the app via deep link
    window.location.href = deepLink;

    // If the app doesn't open within 2.5s, show download page
    const timer = setTimeout(() => {
      if (Date.now() - start < 4000) {
        setDeepLinkFailed(true);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [code]);

  // Countdown for auto-redirect to store
  useEffect(() => {
    if (!deepLinkFailed || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [deepLinkFailed, countdown]);

  const storeUrl = platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;

  return (
    <>
      <Head>
        <title>Agentrix — AI Commerce Platform</title>
        <meta name="description" content="Agentrix Commerce: AI-powered skills marketplace with referral rewards" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta property="og:title" content="Join Agentrix Commerce" />
        <meta property="og:description" content="Discover AI skills, earn commission, and build with agents" />
        <meta property="og:image" content={`${WEBSITE_BASE}/og-image.png`} />
      </Head>

      <div style={styles.container}>
        <div style={styles.card}>
          {/* Logo */}
          <div style={styles.logoSection}>
            <div style={styles.logoCircle}>
              <span style={styles.logoEmoji}>🤖</span>
            </div>
            <h1 style={styles.title}>Agentrix Commerce</h1>
            <p style={styles.subtitle}>AI-Powered Skills Marketplace</p>
          </div>

          {/* Features */}
          <div style={styles.features}>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>🛒</span>
              <div>
                <strong style={styles.featureTitle}>Smart Checkout</strong>
                <p style={styles.featureDesc}>One-click AI skill purchases</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>💰</span>
              <div>
                <strong style={styles.featureTitle}>Earn Commission</strong>
                <p style={styles.featureDesc}>10% L1 + 3% L2 referral rewards</p>
              </div>
            </div>
            <div style={styles.featureItem}>
              <span style={styles.featureIcon}>🎯</span>
              <div>
                <strong style={styles.featureTitle}>Bounty Board</strong>
                <p style={styles.featureDesc}>Post tasks, bid on bounties</p>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          {deepLinkFailed ? (
            <div style={styles.ctaSection}>
              <a href={storeUrl} style={styles.primaryBtn}>
                {platform === 'ios' ? '📱 Download on App Store' : '📱 Get it on Google Play'}
              </a>
              <a
                href={`${WEBSITE_BASE}/marketplace?ref=${code}`}
                style={styles.secondaryBtn}
              >
                🌐 Continue on Website
              </a>
              <p style={styles.hint}>
                Already have the app? <a href={`${DEEP_LINK_PREFIX}${code}`} style={styles.link}>Open Agentrix</a>
              </p>
            </div>
          ) : (
            <div style={styles.ctaSection}>
              <div style={styles.loadingDots}>
                <span style={styles.dot}>●</span>
                <span style={{ ...styles.dot, animationDelay: '0.2s' }}>●</span>
                <span style={{ ...styles.dot, animationDelay: '0.4s' }}>●</span>
              </div>
              <p style={styles.loadingText}>Opening Agentrix...</p>
            </div>
          )}

          {/* Referral badge */}
          {code && (
            <div style={styles.refBadge}>
              <span style={styles.refIcon}>🎁</span>
              <span style={styles.refText}>Invited by a friend — sign up for bonus rewards!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p style={styles.footerText}>© 2026 Agentrix · <a href={WEBSITE_BASE} style={styles.footerLink}>agentrix.top</a></p>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: 'rgba(30, 41, 59, 0.8)',
    backdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '32px 24px',
    maxWidth: '420px',
    width: '100%',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
  },
  logoSection: {
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  logoCircle: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  logoEmoji: {
    fontSize: '36px',
  },
  title: {
    color: '#fff',
    fontSize: '24px',
    fontWeight: '800',
    margin: '0 0 4px',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
    margin: '0',
  },
  features: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '24px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '12px',
  },
  featureIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  featureTitle: {
    color: '#fff',
    fontSize: '14px',
    display: 'block',
  },
  featureDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '12px',
    margin: '2px 0 0',
  },
  ctaSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    alignItems: 'center',
  },
  primaryBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    textAlign: 'center' as const,
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    textDecoration: 'none',
  },
  secondaryBtn: {
    display: 'block',
    width: '100%',
    padding: '14px',
    background: 'transparent',
    color: '#a5b4fc',
    textAlign: 'center' as const,
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none',
    border: '1px solid rgba(99, 102, 241, 0.4)',
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '12px',
    marginTop: '4px',
  },
  link: {
    color: '#818cf8',
    textDecoration: 'underline',
  },
  loadingDots: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    padding: '16px 0',
  },
  dot: {
    color: '#6366f1',
    fontSize: '20px',
    animation: 'pulse 1s infinite',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
    textAlign: 'center' as const,
  },
  refBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '20px',
    padding: '10px 14px',
    background: 'rgba(16, 185, 129, 0.15)',
    borderRadius: '10px',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  refIcon: {
    fontSize: '18px',
  },
  refText: {
    color: '#6ee7b7',
    fontSize: '12px',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center' as const,
  },
  footerText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: '12px',
  },
  footerLink: {
    color: 'rgba(255,255,255,0.4)',
    textDecoration: 'none',
  },
};
