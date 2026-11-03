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
 *    The dynamic-import check has two classes of files (10-31, after the first real build on Claw, run 41195968989):
 *    - the wallet's own chunks (everything under `_next/static/` except the four Next runtime chunks): any
 *      `\bimport\s*\(` fails, as before.
 *    - the Next runtime chunks `main-`, `framework-`, `webpack-`, `polyfills-` (`NEXT_RUNTIME_CHUNK`): not skipped.
 *      A hit is allowed only when (a) the installed Next version and the chunk file name are pinned in
 *      `NEXT_RUNTIME_PINS` (the webpack content hash is in the file name, so a changed chunk is a changed name) and
 *      (b) the hit is not a dynamic import: a member call `x.import(…)` or a method definition `import(e){…}`.
 *      Next 13.5.x ships `BloomFilter.import(data)` (`next/dist/shared/lib/bloom-filter.js`) and calls
 *      `this._bfl_s.import(…)` in `next/dist/shared/lib/router/router.js`; both end up in `main-*.js` and look like a
 *      dynamic import to a plain regex. A runtime chunk without any hit needs no pin. A hit in an unpinned chunk, or a
 *      real `import(…)` in a pinned one, fails.
 *    Every failing hit prints 80 characters before and after it.
 *    CI (Claw, `npm ci` from `frontend/package-lock.json`) installs Next 13.5.11. The Mac worktree's node_modules is an
 *    older 13.5.6 install, and the remote-gate steps (vitest, tsc) never run `next build`, so only the Claw build shows
 *    the real chunk names. A Next upgrade means a new pin entry, added on purpose after reading the printed context.
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

/** Next's own client runtime chunks (path relative to `out/`). Everything else under `_next/static/` is wallet code. */
export const NEXT_RUNTIME_CHUNK = /^_next\/static\/chunks\/(?:main|framework|webpack|polyfills)-[0-9a-f]{16}\.js$/;

/**
 * Runtime chunks that may contain a literal `import(` which is not a dynamic import, per Next version. Observed on the
 * first real build (Claw gate/l86-b82cef64, run 41195968989, Next 13.5.11 from `frontend/package-lock.json`): the
 * postbuild reported `main-fe876b1365acae50.js`. The other runtime chunks had no hit and need no entry.
 */
export const NEXT_RUNTIME_PINS = {
  '13.5.11': ['_next/static/chunks/main-fe876b1365acae50.js'],
};

const DYNAMIC_IMPORT = /\bimport\s*\(/g;
const CONTEXT_CHARS = 80;

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

/** Version of the Next that built `out/` (`<frontendDir>/node_modules/next/package.json`), or null when unreadable. */
export function readNextVersion(frontendDir) {
  try {
    const version = JSON.parse(readFileSync(join(frontendDir, 'node_modules', 'next', 'package.json'), 'utf8')).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/** Every `import(` in `text` with 80 characters before and after it (JSON-quoted, so one line in the log). */
export function importHits(text) {
  const hits = [];
  for (const m of text.matchAll(DYNAMIC_IMPORT)) {
    const from = Math.max(0, m.index - CONTEXT_CHARS);
    const to = Math.min(text.length, m.index + m[0].length + CONTEXT_CHARS);
    hits.push({ index: m.index, length: m[0].length, context: JSON.stringify(text.slice(from, to)) });
  }
  return hits;
}

/**
 * True for an `import(` that is not a dynamic import: a member call `x.import(…)` (a single dot; `...import(x)` spreads
 * a dynamic import) or a method definition `import(e){…}` (after `{ } ; , *` or a modifier, parameters without quotes,
 * the body's `{` on the same line as the closing parenthesis).
 */
export function isMemberOrMethodImport(text, index, length) {
  let p = index - 1;
  while (p >= 0 && /\s/.test(text[p])) p--;
  if (p >= 0 && text[p] === '.' && text[p - 1] !== '.') return true;
  const before = text.slice(Math.max(0, p - 8), p + 1);
  if (!(p < 0 || /[{};,*]$/.test(before) || /(?:^|[^\w$])(?:static|async|get|set)$/.test(before))) return false;
  let i = index + length;
  let depth = 1;
  const end = Math.min(text.length, i + 200);
  for (; i < end && depth > 0; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') return false;
    if (c === '(') depth++;
    else if (c === ')') depth--;
  }
  if (depth !== 0) return false;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return text[i] === '{';
}

const MAX_HITS_SHOWN = 5;

function importProblems(path, text, nextVersion, notes) {
  const hits = importHits(text);
  if (hits.length === 0) return [];
  const problems = [];
  let kind = 'dynamic_import';
  let failing = hits;
  if (NEXT_RUNTIME_CHUNK.test(path)) {
    if (nextVersion === null || !(NEXT_RUNTIME_PINS[nextVersion] || []).includes(path)) {
      kind = `next_runtime_unpinned(next=${nextVersion === null ? 'unknown' : nextVersion})`;
    } else {
      failing = hits.filter((h) => !isMemberOrMethodImport(text, h.index, h.length));
      if (notes && failing.length < hits.length) notes.push(`${path}: ${hits.length - failing.length} member call or method definition named import (not a dynamic import), pinned for next ${nextVersion}`);
    }
  }
  for (const h of failing.slice(0, MAX_HITS_SHOWN)) problems.push(`${kind}:${path}@${h.index}:${h.context}`);
  if (failing.length > MAX_HITS_SHOWN) problems.push(`${kind}:${path}:+${failing.length - MAX_HITS_SHOWN} more`);
  return problems;
}

/**
 * Checks of the export (design 7.1 ④). `files`: `{ path, text }` with `/` separators relative to `out/`; `text` only
 * for HTML and JS. `options.nextVersion`: the installed Next version (null / missing = no pin applies);
 * `options.notes`: an array that receives one line per pinned runtime chunk that had harmless hits.
 */
export function outputProblems(files, options = {}) {
  const problems = [];
  const nextVersion = typeof options.nextVersion === 'string' ? options.nextVersion : null;
  for (const f of files) {
    if (f.path === '.well-known' || f.path.startsWith('.well-known/') || f.path.includes('/.well-known/')) problems.push(`well_known:${f.path}`);
    if (typeof f.text !== 'string') continue;
    if (f.path.endsWith('.js')) problems.push(...importProblems(f.path, f.text, nextVersion, options.notes));
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
  const nextVersion = readNextVersion(join(here, '..', '..'));
  const notes = [];
  console.log(`postbuild: next ${nextVersion === null ? 'version unknown' : nextVersion}`);
  problems.push(...outputProblems(all.map((p) => ({ path: rel(p), text: /\.(html|js)$/.test(p) && !statSync(p).isDirectory() ? readFileSync(p, 'utf8') : undefined })), { nextVersion, notes }));
  for (const n of notes) console.log(`postbuild: note: ${n}`);
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
