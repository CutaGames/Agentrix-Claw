import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

// P0-W2-7 Web Console route partition (PRD web-prd-v3 §4)
// Provides a unified shell for /console/** routes. Marketing pages (/, /pricing,
// /about) keep their existing top-nav layouts; the Console is a separate
// authenticated workspace.

const NAV_ITEMS = [
  { href: '/console/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/console/agents', label: 'Agents', icon: '🤖' },
  { href: '/console/wallet', label: 'Wallet', icon: '💰' },
  { href: '/console/presence', label: 'Presence', icon: '🛰️' },
  { href: '/console/billing', label: 'Billing', icon: '🧾' },
];

interface ConsoleLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ConsoleLayout({ title, children }: ConsoleLayoutProps) {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>{`${title} · Agentrix Console`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0b0d12', color: '#e7e9ee' }}>
        <aside style={{
          width: 240,
          background: '#11141a',
          borderRight: '1px solid #1f242d',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, padding: '0 8px' }}>
            Agentrix Console
          </div>
          {NAV_ITEMS.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: active ? '#1d2330' : 'transparent',
                  color: active ? '#fff' : '#9aa3b2',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </aside>
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>{title}</h1>
          {children}
        </main>
      </div>
    </>
  );
}
