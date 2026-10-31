#!/usr/bin/env node
/**
 * L8-6 S6 offline recovery tool build (design decision 3d, A10, R2-L3). Plain Node; the only tool it uses is esbuild,
 * which `frontend/node_modules` already has (vitest's vite depends on it); nothing is added to package.json.
 *
 *   node wallet-origin/scripts/build-offline-tool.mjs [outFile]      (cwd frontend/)
 *
 * Bundles `offline/offline-recovery.page.ts` (with `lib/own-wallet/offline-recovery.ts` and ethers) into one script and
 * inlines it into the template `offline/offline-recovery.html`, together with a Content-Security-Policy `<meta>`:
 * nothing may load (default-src 'none'), the only script and the only style are the inline ones (by SHA-256), and the
 * only connections are https (or this computer's own http) to the node the owner types in. The result is one file with no
 * external resource.
 *
 * Prints two SHA-256 values for the release notes:
 * - the file's (`shasum -a 256 offline-recovery.html`);
 * - the script segment's: the exact text of `<script id="offline-recovery-script">`, which the page hashes with
 *   `crypto.subtle.digest` and shows at the top. The output is ASCII only (`charset: 'ascii'`), so both hashes are the
 *   same on every platform.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const walletOrigin = resolve(here, '..');
const frontend = resolve(walletOrigin, '..');
export const SCRIPT_MARKER = '/*__OFFLINE_RECOVERY_SCRIPT__*/';
export const CSP_MARKER = '<!--__OFFLINE_RECOVERY_CSP__-->';
export const TEMPLATE_FILE = join(walletOrigin, 'offline', 'offline-recovery.html');
export const PAGE_ENTRY = join(walletOrigin, 'offline', 'offline-recovery.page.ts');

export const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
export const sha256Base64 = (text) => createHash('sha256').update(text, 'utf8').digest('base64');

/** The policy of the file. `connect-src https:` because the node is the owner's choice; the page refuses Agentrix hosts. */
export function contentSecurityPolicy(scriptText, styleText) {
  return [
    "default-src 'none'",
    `script-src 'sha256-${sha256Base64(scriptText)}'`,
    `style-src 'sha256-${sha256Base64(styleText)}'`,
    'connect-src https: http://localhost:* http://127.0.0.1:* http://[::1]:*',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function once(text, marker, what) {
  const first = text.indexOf(marker);
  if (first < 0 || text.indexOf(marker, first + 1) >= 0) throw new Error(`${what}: the marker must appear exactly once`);
}

/** Builds the file in memory. */
export async function buildOfflineToolHtml(options = {}) {
  const esbuild = await import('esbuild');
  const template = readFileSync(options.template ?? TEMPLATE_FILE, 'utf8').replace(/\r\n/g, '\n');
  once(template, SCRIPT_MARKER, 'template script');
  once(template, CSP_MARKER, 'template CSP');
  const style = /<style id="offline-recovery-style">([\s\S]*?)<\/style>/.exec(template);
  if (!style) throw new Error('template: the <style id="offline-recovery-style"> element is missing');
  const bundled = await esbuild.build({
    entryPoints: [options.entry ?? PAGE_ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'none',
    charset: 'ascii',
    logLevel: 'silent',
    absWorkingDir: frontend,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  if (bundled.outputFiles.length !== 1) throw new Error('esbuild: expected exactly one output file');
  const scriptText = bundled.outputFiles[0].text.replace(/\r\n/g, '\n').trimEnd();
  // `</script` or `<!--` inside an inline script would change how the HTML parser reads it.
  if (/<\/script|<!--/i.test(scriptText)) throw new Error('the bundled script contains "</script" or "<!--"');
  const csp = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(scriptText, style[1])}">`;
  const html = template.replace(CSP_MARKER, () => csp).replace(SCRIPT_MARKER, () => scriptText);
  return { html, scriptText, styleText: style[1], fileSha256: sha256Hex(html), scriptSha256: sha256Hex(scriptText), bytes: Buffer.byteLength(html, 'utf8') };
}

export async function main(outArg) {
  const built = await buildOfflineToolHtml();
  const out = resolve(outArg || join(walletOrigin, 'out-offline', 'offline-recovery.html'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, built.html);
  console.log(`offline-recovery.html: ${built.bytes} bytes -> ${out}`);
  console.log(`file SHA-256:   ${built.fileSha256}`);
  console.log(`script SHA-256: ${built.scriptSha256}   (the page shows this value at the top)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`build-offline-tool: ${error && error.message ? error.message : error}`);
      process.exit(1);
    },
  );
}
