/**
 * Sentry Node/Edge runtime SDK init (Sprint W-3 / W-P3).
 *
 * Captures errors from API routes, getServerSideProps, getStaticProps,
 * and middleware on the Next.js server runtime.
 */
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    release: process.env.RELEASE || undefined,
    tracesSampleRate: 0.05,
  });
}
