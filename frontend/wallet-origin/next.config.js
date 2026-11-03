/**
 * L8-6 wallet origin (design 2.0 "钱包源", 7.1): a separate static site, built from `frontend/` with
 * `node node_modules/next/dist/bin/next build wallet-origin`, output in `wallet-origin/out/`. No Next server, no SSR,
 * no API routes. `next`, `react`, `ethers` and `qrcode.react` resolve from `frontend/node_modules`; the page logic lives
 * in `frontend/lib/own-wallet/` and `frontend/components/own-wallet/` (hence `externalDir`). After the build,
 * `node wallet-origin/scripts/postbuild.mjs` adds SRI, writes the response headers and the file manifest, and fails on a
 * `.well-known/` directory, a dynamic `import(` or a third-party source.
 *
 * Build-time constants (`NEXT_PUBLIC_*`, read in `lib/own-wallet/config.ts`): the wallet origin, its RP ID, the main
 * origin, the API origin, the registration file base, the chain id and the public nodes.
 */
/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  experimental: { externalDir: true },
};
