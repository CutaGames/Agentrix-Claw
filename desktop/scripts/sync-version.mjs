#!/usr/bin/env node
/**
 * sync-version.mjs — single source of truth for desktop app version.
 *
 * Reads the version from `desktop/src-tauri/tauri.conf.json` and propagates
 * it to:
 *   - desktop/src-tauri/Cargo.toml        (Rust crate version)
 *   - desktop/package.json                (npm package version)
 *
 * Usage:
 *   node scripts/sync-version.mjs              # propagate current version
 *   node scripts/sync-version.mjs 0.7.17       # set new version everywhere
 *
 * Run before every `npm run tauri build` to guarantee the three files agree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '..');

const tauriConfPath = resolve(desktopRoot, 'src-tauri/tauri.conf.json');
const cargoTomlPath = resolve(desktopRoot, 'src-tauri/Cargo.toml');
const packageJsonPath = resolve(desktopRoot, 'package.json');

const explicitVersion = process.argv[2];

let targetVersion;
if (explicitVersion) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(explicitVersion)) {
    console.error(`✗ Invalid version: ${explicitVersion}. Expected semver e.g. 0.7.17 or 0.7.17-beta.1`);
    process.exit(1);
  }
  targetVersion = explicitVersion;
} else {
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
  targetVersion = tauriConf.version;
  if (!targetVersion) {
    console.error('✗ tauri.conf.json has no "version" field');
    process.exit(1);
  }
}

console.log(`▶ Syncing all version files to v${targetVersion}\n`);

// ── tauri.conf.json ──────────────────────────────────────
const tauriConfRaw = readFileSync(tauriConfPath, 'utf-8');
const tauriConfNew = tauriConfRaw.replace(
  /("version"\s*:\s*")[\d.\w-]+(")/,
  `$1${targetVersion}$2`,
);
writeFileSync(tauriConfPath, tauriConfNew);
console.log(`  ✓ tauri.conf.json`);

// ── Cargo.toml ─────────────────────────────────────────────
const cargoRaw = readFileSync(cargoTomlPath, 'utf-8');
const cargoNew = cargoRaw.replace(
  /^(version\s*=\s*")[\d.\w-]+(")/m,
  `$1${targetVersion}$2`,
);
writeFileSync(cargoTomlPath, cargoNew);
console.log(`  ✓ Cargo.toml`);

// ── package.json ────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
pkg.version = targetVersion;
writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`  ✓ package.json`);

console.log(`\n✅ All version files now at v${targetVersion}`);
