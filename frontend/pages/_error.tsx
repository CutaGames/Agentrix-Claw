/**
 * Generic error page (5xx + non-404 4xx) — v4 design.
 */
import React from 'react';
import { NextPageContext } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { AlertTriangle, Home, RefreshCw, MessageSquare } from 'lucide-react';
import { Button, Card } from '../components/ui/ax';
import { useLocalization } from '../contexts/LocalizationContext';

interface ErrorProps {
  statusCode?: number;
  hasGetInitialPropsRun?: boolean;
  err?: Error | null;
}

function Error({ statusCode, err }: ErrorProps): React.ReactElement {
  const { t } = useLocalization();
  const isServerError = statusCode != null && statusCode >= 500;
  const title = statusCode != null
    ? t({ zh: `错误 ${statusCode}`, en: `Error ${statusCode}` })
    : t({ zh: '出现错误', en: 'Something went wrong' });
  const description = statusCode === 404
    ? t({ zh: '页面未找到', en: 'Page not found' })
    : isServerError
      ? t({ zh: '服务器暂时无法响应，我们正在排查。', en: 'Our servers had a hiccup. We are looking into it.' })
      : err?.message || t({ zh: '发生了未知错误', en: 'An unknown error occurred' });

  return (
    <>
      <Head>
        <title>{t({ zh: '错误 - Agentrix', en: 'Error - Agentrix' })}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="relative min-h-screen overflow-hidden bg-ax-base flex items-center justify-center px-4 py-12">
        {/* Animated background orbs (warmer/danger palette) */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-ax-danger/12 blur-3xl ax-aurora" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-ax-warm/15 blur-3xl ax-aurora" style={{ animationDelay: '4s' }} />

        <div className="relative w-full max-w-lg">
          <Card variant="elevated" padding="lg" className="text-center">
            <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-ax-warm/10 text-ax-warm">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold text-ax-ink mb-2">{title}</h1>
            <p className="text-sm text-ax-fog mb-6 max-w-sm mx-auto">{description}</p>

            {/* Error details (dev only) */}
            {process.env.NODE_ENV === 'development' && err?.stack && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-xs text-ax-mist hover:text-ax-fog">
                  {t({ zh: '错误详情（开发环境）', en: 'Error details (dev)' })}
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-ax-md bg-black/30 p-3 text-[11px] text-ax-mist font-mono whitespace-pre-wrap">
                  {err.stack}
                </pre>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="primary"
                size="md"
                leftIcon={<RefreshCw />}
                onClick={(): void => {
                  if (typeof window !== 'undefined') window.location.reload();
                }}
              >
                {t({ zh: '刷新页面', en: 'Reload' })}
              </Button>
              <Link href="/">
                <Button variant="secondary" size="md" leftIcon={<Home />}>
                  {t({ zh: '回到首页', en: 'Home' })}
                </Button>
              </Link>
            </div>

            <div className="mt-6 pt-4 border-t border-ax-line/60 text-xs text-ax-mist">
              <Link href="/console/support" className="inline-flex items-center gap-1 hover:text-ax-accent transition-colors">
                <MessageSquare className="h-3 w-3" />
                {t({ zh: '问题持续存在？联系支持', en: 'Still stuck? Contact support' })}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext): ErrorProps => {
  const statusCode = res ? res.statusCode : err ? (err as { statusCode?: number }).statusCode : 404;
  return { statusCode, err: (err as Error | null) ?? null };
};

export default Error;
