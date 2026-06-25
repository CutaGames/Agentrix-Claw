import Head from 'next/head';
import { ReactNode } from 'react';
import { MarketingHeader } from './MarketingHeader';
import { MarketingFooter } from './MarketingFooter';
import type { MarketingSeo } from '../../lib/seo';

interface MarketingLayoutProps {
  seo: MarketingSeo;
  children: ReactNode;
  /** Hide the global footer (used by /legacy/[slug] minimalist pages). */
  hideFooter?: boolean;
}

export function MarketingLayout({ seo, children, hideFooter }: MarketingLayoutProps) {
  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <link rel="canonical" href={seo.canonical} />
        <meta property="og:title" content={seo.ogTitle} />
        <meta property="og:description" content={seo.ogDescription} />
        <meta property="og:image" content={seo.ogImage} />
        <meta property="og:type" content={seo.ogType} />
        <meta property="og:url" content={seo.canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.ogTitle} />
        <meta name="twitter:description" content={seo.ogDescription} />
        <meta name="twitter:image" content={seo.ogImage} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="flex min-h-screen flex-col bg-agentrix-ink text-white">
        <MarketingHeader />
        <main className="flex-1">{children}</main>
        {!hideFooter && <MarketingFooter />}
      </div>
    </>
  );
}
