/**
 * Sentry browser SDK init (Sprint W-3 / W-P3).
 *
 * Initialized only when:
 *   - NEXT_PUBLIC_SENTRY_DSN is provided at build time
 *   - User has accepted analytics cookies (window.__agentrixAnalyticsAllowed)
 *
 * This file is auto-loaded by `@sentry/nextjs` when present.
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'production',
    release: process.env.NEXT_PUBLIC_RELEASE || undefined,
    // Performance monitoring
    tracesSampleRate: 0.05,
    // Session replay disabled by default (privacy)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't send if user hasn't consented
    beforeSend(event) {
      if (typeof window !== 'undefined' && !window.__agentrixAnalyticsAllowed) {
        // Still allow error events even without consent (safety)
        if (event.level !== 'error' && event.level !== 'fatal') {
          return null;
        }
      }
      return event;
    },
    // Filter out noisy MetaMask errors (matches _app.tsx logic)
    ignoreErrors: [
      /MetaMask/,
      /Failed to connect to MetaMask/,
      'UNSUPPORTED_METHOD',
      // Browser extensions
      'top.GLOBALS',
      // Random plugins / extensions
      'originalCreateNotification',
      'canvas.contentDocument',
    ],
  });
}
