import type { AppProps } from 'next/app';
import Head from 'next/head';
import React from 'react';
import '../styles.css';

/** L8-6 wallet origin app shell. Pages navigate with full page loads only (no next/link). */
export default function WalletOriginApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Agentrix Wallet</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="ow-page">
        <Component {...pageProps} />
      </main>
    </>
  );
}
