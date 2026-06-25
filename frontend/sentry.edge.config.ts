/**
 * Sentry Edge runtime SDK init (Sprint W-3 / W-P3).
 *
 * For middleware and edge route handlers.
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.05,
  });
}
