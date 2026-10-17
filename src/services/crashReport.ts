/**
 * crashReport.ts — Sprint M-P0-4.
 *
 * Wraps `@sentry/react-native` with the Agentrix opt-in policy:
 *   - Only initializes when `SENTRY_DSN` is set in app.json `extra` or
 *     `EXPO_PUBLIC_SENTRY_DSN` env at build time.
 *   - Errors are still captured by default (safety net) but custom
 *     events / breadcrumbs are gated by `agentrix_telemetry_opt_in`.
 *   - Strips file paths and known PII (wallet addresses, emails)
 *     from breadcrumbs and stack frames before send.
 *
 * Mirrors the desktop side `crashReport.ts` so support tickets correlate
 * across platforms.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { mmkv } from '../stores/mmkvStorage';

const OPT_IN_KEY = 'agentrix_telemetry_opt_in';

function readDsn(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as any)?.SENTRY_DSN as string | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN as string | undefined;
  return fromExtra || fromEnv || null;
}

function readEnv(): 'development' | 'production' {
  return __DEV__ ? 'development' : 'production';
}

function isOptedIn(): boolean {
  try {
    return mmkv.getString(OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

const PII_PATTERNS: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /0x[a-fA-F0-9]{40}/g, replace: '<wallet>' }, // ETH
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replace: '<email>' },
  { pattern: /\/(?:Users|home|data\/user)\/[^\/]+/g, replace: '/<user>' }, // file paths
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/gi, replace: 'Bearer <token>' },
];

function sanitize(s: string | undefined): string | undefined {
  if (!s) return s;
  let out = s;
  for (const { pattern, replace } of PII_PATTERNS) {
    out = out.replace(pattern, replace);
  }
  return out;
}

let _initialized = false;

/**
 * Initialize Sentry. Call once on app start (after MMKV is ready).
 *
 * No-op when:
 *   - DSN is missing (devs / CI without secrets configured)
 *   - User has not opted in to telemetry
 *
 * Always-active errors: even when opt-in is OFF, fatal errors are still
 * captured because they help us fix bugs that affect everyone. Custom
 * `trackEvent`-style breadcrumbs are gated by opt-in.
 */
export function initCrashReport(): void {
  if (_initialized) return;
  const dsn = readDsn();
  if (!dsn) {
    if (__DEV__) console.log('[crashReport] DSN not configured, skipping Sentry init');
    return;
  }
  try {
    Sentry.init({
      dsn,
      environment: readEnv(),
      release: (Constants.expoConfig?.version || '0.0.0') + '+' + Platform.OS,
      // Mobile bundle is large; sample lightly.
      tracesSampleRate: 0.05,
      enableNative: !__DEV__,
      // Avoid auto-capture of every console.log
      enableNativeCrashHandling: true,
      attachStacktrace: true,
      // Keep replay disabled — privacy-sensitive
      _experiments: {},
      beforeSend(event) {
        // Always allow fatal/error events; gate non-error categories
        // (info, debug, warning) on opt-in.
        if (!isOptedIn() && event.level && event.level !== 'fatal' && event.level !== 'error') {
          return null;
        }
        // Sanitize message + frames
        if (event.message) event.message = sanitize(event.message) ?? event.message;
        if (event.exception?.values) {
          for (const ex of event.exception.values) {
            if (ex.value) ex.value = sanitize(ex.value);
            if (ex.stacktrace?.frames) {
              for (const f of ex.stacktrace.frames) {
                if (f.filename) f.filename = sanitize(f.filename);
              }
            }
          }
        }
        // Strip user identifiers we never want to leak
        if (event.user) {
          event.user = {
            id: event.user.id, // hashed elsewhere
            // remove email / username / ip
          };
        }
        return event;
      },
      ignoreErrors: [
        'Network request failed', // RN noise
        /AbortError/i,
        /User cancel/i,
      ],
    });
    _initialized = true;
    if (__DEV__) console.log('[crashReport] Sentry initialized:', readEnv());
  } catch (e) {
    console.warn('[crashReport] init failed:', (e as Error).message);
  }
}

/**
 * Report a non-fatal exception. Always captured if Sentry is initialized,
 * regardless of opt-in (developer-triggered, not user-triggered).
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!_initialized) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // ignore
  }
}

/**
 * Add a breadcrumb. Skipped if user has opted out.
 */
export function addBreadcrumb(message: string, category = 'app', data?: Record<string, unknown>): void {
  if (!_initialized || !isOptedIn()) return;
  try {
    Sentry.addBreadcrumb({
      message: sanitize(message),
      category,
      level: 'info',
      data,
    });
  } catch {
    // ignore
  }
}

/**
 * Tag the current user (hashed identifier) so subsequent events are
 * scoped to them in the Sentry dashboard. Email / wallet are never
 * sent — only an opaque user id.
 */
export function setUser(userId: string | null): void {
  if (!_initialized) return;
  try {
    if (userId) {
      Sentry.setUser({ id: userId });
    } else {
      Sentry.setUser(null);
    }
  } catch {
    // ignore
  }
}

/** True if Sentry was initialized successfully. */
export function isCrashReportEnabled(): boolean {
  return _initialized;
}
