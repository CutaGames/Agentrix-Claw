/**
 * CookieConsent — Sprint W-3 / W-P2-3.
 *
 * Lightweight GDPR / CCPA cookie banner.
 *
 * Design principles:
 *   1. Default to "no analytics cookies" until user explicitly accepts.
 *   2. Persist decision in localStorage (`agentrix_cookie_consent`).
 *      Values: 'all' | 'necessary'.
 *   3. Necessary cookies (login token / language) always allowed.
 *   4. Bottom-right slide-up card so it doesn't break first-paint LCP.
 *   5. SSR-safe: only renders after mount.
 *
 * Integrates with `analytics.ts` via the global window flag
 * `window.__agentrixAnalyticsAllowed` which the analytics service checks
 * before flushing batches.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'agentrix_cookie_consent';
const FLAG = '__agentrixAnalyticsAllowed';

type ConsentLevel = 'all' | 'necessary';

declare global {
  interface Window {
    __agentrixAnalyticsAllowed?: boolean;
  }
}

function readConsent(): ConsentLevel | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'all' || v === 'necessary') return v;
  } catch {
    // storage blocked: treat as no consent
  }
  return null;
}

function saveConsent(level: ConsentLevel) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // ignore
  }
  window[FLAG] = level === 'all';
  // Notify any listeners (e.g. analytics service) without forcing a hard reload
  try {
    window.dispatchEvent(new CustomEvent('agentrix-consent-change', { detail: level }));
  } catch {
    // ignore
  }
}

export const CookieConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (existing) {
      window[FLAG] = existing === 'all';
      return;
    }
    // Defer 1s so it doesn't compete with first paint
    const t = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const onAcceptAll = () => {
    saveConsent('all');
    setVisible(false);
  };

  const onNecessaryOnly = () => {
    saveConsent('necessary');
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-[9999] max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-lg sm:p-5"
      style={{
        animation: 'cookie-slide-up 360ms ease-out',
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🍪</span>
        <div className="flex-1 text-sm leading-relaxed text-gray-700">
          <p className="font-semibold text-gray-900">
            我们使用 Cookie 提升体验
          </p>
          <p className="mt-1 text-xs text-gray-500">
            必要 Cookie 用于登录与语言偏好。可选的分析 Cookie 帮助我们优化产品，
            <Link href="/privacy" className="ml-1 text-violet-600 hover:underline">
              查看隐私政策
            </Link>。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAcceptAll}
              className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              全部接受
            </button>
            <button
              type="button"
              onClick={onNecessaryOnly}
              className="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              仅必要
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes cookie-slide-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default CookieConsent;
