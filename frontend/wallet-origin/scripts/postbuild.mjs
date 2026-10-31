#!/usr/bin/env node
/**
 * L8-6 wallet origin post-build step (design 7.1 "构建后脚本", 2.0 response headers, M7). Plain Node, no dependency.
 *
 *   node wallet-origin/scripts/postbuild.mjs [outDir]      (cwd frontend/, after `next build wallet-origin`)
 *
 * 1. Adds `integrity="sha256-…"` to every `<script src>`, `<link rel="stylesheet">` and script/style preload in the
 *    exported HTML.
 * 2. Hashes every executable inline script and writes `headers.json` (per page: CSP, frame-ancestors, Referrer-Policy,
 *    Cache-Control) and `wallet-origin-headers.nginx.conf` (the same as nginx `add_header` lines) next to `out/`.
 * 3. Writes `wallet-origin-manifest.json`: the SHA-256 of every file in `out/`.
 * 4. Fails (exit 1) when `out/` has a `.well-known/` directory, a JS file contains a dynamic `import(`, or an HTML file
 *    loads anything from another origin.
 *
 * The origins come from the same build-time variables as the pages: NEXT_PUBLIC_AGENT_OWN_WALLET_API_ORIGIN,
 * NEXT_PUBLIC_AGENT_MAIN_ORIGIN, NEXT_PUBLIC_AGENT_ERC8004_FILE_BASE_URL and the public nodes
 * NEXT_PUBLIC_AGENT_OWN_WALLET_PUBLIC_RPC_URL_<chainId> (defaults as in lib/own-wallet/config.ts, 97 first).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_PUBLIC_RPC = { 97: 'https://data-seed-prebsc-1-s1.binance.org:8545', 84532: 'https://sepolia.base.org' };
const ORIGIN = /^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;
/** The only page another origin may frame (the main site's badge iframe). */
export const BADGE_PAGE = 'wallet/badge/index.html';

export function sha256Base64(bytes) {
  return createHash('sha256').update(bytes).digest('base64');
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * Adds SRI to same-origin scripts, stylesheets and script/style preloads. `readAsset(path)` returns the bytes of an
 * absolute path like `/_next/static/…` (or null). Tags that already carry `integrity` are left alone.
 */
export function addSri(html, readAsset) {
  const missing = [];
  const add = (tag, url) => {
    if (/\sintegrity=/i.test(tag) || !url || !url.startsWith('/') || url.startsWith('//')) return tag;
    const bytes = readAsset(url.split('?')[0].split('#')[0]);
    if (!bytes) {
      missing.push(url);
      return tag;
    }
    const closing = tag.endsWith('/>') ? '/>' : '>';
    return `${tag.slice(0, tag.length - closing.length)} integrity="sha256-${sha256Base64(bytes)}"${closing}`;
  };
  const out = html
    .replace(/<script\b[^>]*\ssrc=(?:"[^"]*"|'[^']*')[^>]*>/gi, (tag) => add(tag, attr(tag, 'src')))
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      const as = (attr(tag, 'as') || '').toLowerCase();
      if (rel === 'stylesheet' || (rel === 'preload' && (as === 'script' || as === 'style')) || rel === 'modulepreload') return add(tag, attr(tag, 'href'));
      return tag;
    });
  return { html: out, missing };
}

const EXECUTABLE_TYPES = ['', 'text/javascript', 'application/javascript', 'module'];

/** `'sha256-…'` of every inline script a browser would execute (not `application/json` data blocks). */
export function inlineScriptHashes(html) {
  const hashes = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = `<script${m[1]}>`;
    if (attr(tag, 'src') !== null) continue;
    const type = (attr(tag, 'type') || '').trim().toLowerCase();
    if (!EXECUTABLE_TYPES.includes(type)) continue;
    if (m[2].length === 0) continue;
    hashes.push(`'sha256-${sha256Base64(Buffer.from(m[2], 'utf8'))}'`);
  }
  return Array.from(new Set(hashes));
}

function originOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Origins and constants for the headers; `problems` lists what is missing. */
export function headerInputsFromEnv(env) {
  const problems = [];
  const apiOrigin = (env.NEXT_PUBLIC_AGENT_OWN_WALLET_API_ORIGIN || '').trim();
  const mainOrigin = (env.NEXT_PUBLIC_AGENT_MAIN_ORIGIN || '').trim();
  if (!ORIGIN.test(apiOrigin)) problems.push('NEXT_PUBLIC_AGENT_OWN_WALLET_API_ORIGIN');
  if (!ORIGIN.test(mainOrigin)) problems.push('NEXT_PUBLIC_AGENT_MAIN_ORIGIN');
  const connect = [apiOrigin];
  const fileBase = originOf((env.NEXT_PUBLIC_AGENT_ERC8004_FILE_BASE_URL || '').trim());
  if (fileBase) connect.push(fileBase);
  for (const chainId of [97, 84532]) {
    const override = (env[`NEXT_PUBLIC_AGENT_OWN_WALLET_PUBLIC_RPC_URL_${chainId}`] || '').trim();
    const rpc = originOf(/^https:\/\//.test(override) ? override : DEFAULT_PUBLIC_RPC[chainId]);
    if (rpc) connect.push(rpc);
  }
  return { problems, mainOrigin, connectSrc: Array.from(new Set(connect.filter((o) => ORIGIN.test(o)))) };
}

/** The response headers of one exported HTML file (path relative to `out/`, `/` separators). */
export function headersFor(page, inputs, scriptHashes) {
  const frameAncestors = page === BADGE_PAGE ? inputs.mainOrigin : "'none'";
  const csp = [
    "default-src 'none'",
    ['script-src', "'self'", ...scriptHashes].join(' '),
    ['connect-src', ...inputs.connectSrc].join(' '),
    "style-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

/** nginx `location` blocks with `add_header … always` for each page (the hosting sets headers, not `<meta>`). */
export function nginxSnippet(headersByPage) {
  const lines = ['# Generated by wallet-origin/scripts/postbuild.mjs. Include inside the wallet origin server block.'];
  for (const page of Object.keys(headersByPage).sort()) {
    const path = '/' + page.replace(/index\.html$/, '');
    lines.push(`location = ${path} {`);
    for (const [name, value] of Object.entries(headersByPage[page])) lines.push(`    add_header ${name} "${value}" always;`);
    lines.push(`    try_files ${path === '/' ? '/index.html' : `/${page}`} =404;`);
    lines.push('}');
  }
  return lines.join('\n') + '\n';
}

/**
 * Checks of the export (design 7.1 ④). `files`: `{ path, text }` with `/` separators relative to `out/`; `text` only
 * for HTML and JS.
 */
export function outputProblems(files) {
  const problems = [];
  for (const f of files) {
    if (f.path === '.well-known' || f.path.startsWith('.well-known/') || f.path.includes('/.well-known/')) problems.push(`well_known:${f.path}`);
    if (typeof f.text !== 'string') continue;
    if (f.path.endsWith('.js') && /\bimport\s*\(/.test(f.text)) problems.push(`dynamic_import:${f.path}`);
    if (f.path.endsWith('.html') && /\s(?:src|href)=(?:"|')(?:https?:)?\/\//i.test(f.text)) problems.push(`third_party_source:${f.path}`);
  }
  return problems;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(full, ...walk(full));
    else out.push(full);
  }
  return out;
}

export function main(outDirArg) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(outDirArg || join(here, '..', 'out'));
  const rel = (p) => relative(outDir, p).split(sep).join('/');
  const all = walk(outDir);
  const files = all.filter((p) => !statSync(p).isDirectory());
  const inputs = headerInputsFromEnv(process.env);
  const problems = [...inputs.problems.map((v) => `missing_env:${v}`)];
  problems.push(...outputProblems(all.map((p) => ({ path: rel(p), text: /\.(html|js)$/.test(p) && !statSync(p).isDirectory() ? readFileSync(p, 'utf8') : undefined }))));
  const readAsset = (url) => {
    const p = join(outDir, ...url.split('/').filter(Boolean));
    try {
      return readFileSync(p);
    } catch {
      return null;
    }
  };
  const headersByPage = {};
  for (const p of files.filter((f) => f.endsWith('.html'))) {
    const page = rel(p);
    const { html, missing } = addSri(readFileSync(p, 'utf8'), readAsset);
    for (const m of missing) problems.push(`sri_asset_missing:${page}:${m}`);
    writeFileSync(p, html);
    headersByPage[page] = headersFor(page, inputs, inlineScriptHashes(html));
  }
  const manifest = {};
  for (const p of files) manifest[rel(p)] = sha256Hex(readFileSync(p));
  const target = dirname(outDir);
  writeFileSync(join(target, 'headers.json'), JSON.stringify(headersByPage, null, 2) + '\n');
  writeFileSync(join(target, 'wallet-origin-headers.nginx.conf'), nginxSnippet(headersByPage));
  writeFileSync(join(target, 'wallet-origin-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (problems.length > 0) {
    for (const p of problems) console.error(`postbuild: ${p}`);
    return 1;
  }
  console.log(`postbuild: ${Object.keys(headersByPage).length} pages, ${files.length} files, no problems`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv[2]));
}
