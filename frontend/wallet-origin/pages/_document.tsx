import { Head, Html, Main, NextScript } from 'next/document';

/**
 * L8-6 wallet origin document: no inline script of our own (the CSP allows scripts from 'self' and the hashes
 * `scripts/postbuild.mjs` computes), no third-party source, no referrer.
 */
export default function WalletOriginDocument() {
  return (
    <Html lang="zh-CN">
      <Head>
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
