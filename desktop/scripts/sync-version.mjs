#!/usr/bin/env node
/**
 * sync-version.mjs — single source of truth for desktop app version.
 *
 * Reads the version from `desktop/src-tauri/tauri.conf.json` and propagates
 * it to:
 *   - desktop/src-tauri/Cargo.toml        (Rust crate version)
 *   - desktop/package.json                (npm package version)
 *
 * Lockfiles (`package-lock.json`, `src-tauri/Cargo.lock`) are only *checked*,
 * never written: changing them needs an approved dependency task. Cargo
 * rewrites the root entry of Cargo.lock on the next non-`--locked` build.
 *
 * Usage:
 *   node scripts/sync-version.mjs              # propagate current version
 *   node scripts/sync-version.mjs 0.7.17       # set new version everywhere
 *   node scripts/sync-version.mjs --check      # exit 1 if the three sources drift
 *
 * Run before every `npm run tauri build` to guarantee the three files agree.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;

export function desktopPaths(desktopRoot) {
  return {
    tauriConf: resolve(desktopRoot, 'src-tauri/tauri.conf.json'),
    cargoToml: resolve(desktopRoot, 'src-tauri/Cargo.toml'),
    cargoLock: resolve(desktopRoot, 'src-tauri/Cargo.lock'),
    packageJson: resolve(desktopRoot, 'package.json'),
    packageLock: resolve(desktopRoot, 'package-lock.json'),
  };
}

function readCargoPackageVersion(raw) {
  // First `version = "…"` inside the [package] table.
  const packageTable = raw.split(/^\[/m).find((section) => section.startsWith('package]'));
  const match = packageTable && packageTable.match(/^version\s*=\s*"([^"]+)"/m);
  return match ? match[1] : undefined;
}

function readCargoLockRootVersion(raw, crateName) {
  const blocks = raw.split(/^\[\[package\]\]\s*$/m);
  for (const block of blocks) {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m);
    if (name && name[1] === crateName) {
      const version = block.match(/^version\s*=\s*"([^"]+)"/m);
      return version ? version[1] : undefined;
    }
  }
  return undefined;
}

/** Read every place the desktop version is recorded. */
export function readDesktopVersions(desktopRoot) {
  const paths = desktopPaths(desktopRoot);
  const tauriConf = JSON.parse(readFileSync(paths.tauriConf, 'utf-8'));
  const cargoRaw = readFileSync(paths.cargoToml, 'utf-8');
  const pkg = JSON.parse(readFileSync(paths.packageJson, 'utf-8'));
  const crateName = (cargoRaw.match(/^name\s*=\s*"([^"]+)"/m) || [])[1];

  const lockfiles = {};
  if (existsSync(paths.packageLock)) {
    const lock = JSON.parse(readFileSync(paths.packageLock, 'utf-8'));
    lockfiles['package-lock.json'] = lock.packages?.['']?.version ?? lock.version;
  }
  if (existsSync(paths.cargoLock) && crateName) {
    lockfiles['src-tauri/Cargo.lock'] = readCargoLockRootVersion(readFileSync(paths.cargoLock, 'utf-8'), crateName);
  }

  return {
    sources: {
      'src-tauri/tauri.conf.json': tauriConf.version,
      'src-tauri/Cargo.toml': readCargoPackageVersion(cargoRaw),
      'package.json': pkg.version,
    },
    lockfiles,
  };
}

/** Returns the canonical version and every source/lockfile that disagrees with it. */
export function checkDesktopVersions(desktopRoot) {
  const { sources, lockfiles } = readDesktopVersions(desktopRoot);
  const canonical = sources['src-tauri/tauri.conf.json'];
  const drift = Object.entries(sources)
    .filter(([, version]) => version !== canonical)
    .map(([file, version]) => ({ file, version: version ?? '(missing)' }));
  const lockfileDrift = Object.entries(lockfiles)
    .filter(([, version]) => version !== canonical)
    .map(([file, version]) => ({ file, version: version ?? '(missing)' }));
  return { canonical, sources, lockfiles, drift, lockfileDrift, ok: Boolean(canonical && SEMVER.test(canonical)) && drift.length === 0 };
}

/** Write `targetVersion` into tauri.conf.json, Cargo.toml and package.json. */
export function syncDesktopVersion(desktopRoot, targetVersion) {
  if (!SEMVER.test(targetVersion)) {
    throw new Error(`Invalid version: ${targetVersion}. Expected semver e.g. 0.7.17 or 0.7.17-beta.1`);
  }
  const paths = desktopPaths(desktopRoot);

  const tauriConfRaw = readFileSync(paths.tauriConf, 'utf-8');
  writeFileSync(paths.tauriConf, tauriConfRaw.replace(/("version"\s*:\s*")[\d.\w-]+(")/, `$1${targetVersion}$2`));

  const cargoRaw = readFileSync(paths.cargoToml, 'utf-8');
  writeFileSync(paths.cargoToml, cargoRaw.replace(/^(version\s*=\s*")[\d.\w-]+(")/m, `$1${targetVersion}$2`));

  const pkg = JSON.parse(readFileSync(paths.packageJson, 'utf-8'));
  pkg.version = targetVersion;
  writeFileSync(paths.packageJson, JSON.stringify(pkg, null, 2) + '\n');
}

function main(argv) {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const arg = argv[2];

  if (arg === '--check') {
    const result = checkDesktopVersions(desktopRoot);
    for (const [file, version] of Object.entries(result.sources)) {
      console.log(`  ${version === result.canonical ? '✓' : '✗'} ${file}: ${version ?? '(missing)'}`);
    }
    for (const { file, version } of result.lockfileDrift) {
      console.warn(`  ! ${file}: ${version} (lockfile, not changed by this script)`);
    }
    if (!result.ok) {
      console.error(`✗ Desktop version drift: canonical tauri.conf.json = ${result.canonical}`);
      process.exit(1);
    }
    console.log(`✅ Desktop version sources agree on v${result.canonical}`);
    return;
  }

  let targetVersion = arg;
  if (!targetVersion) {
    targetVersion = readDesktopVersions(desktopRoot).sources['src-tauri/tauri.conf.json'];
    if (!targetVersion) {
      console.error('✗ tauri.conf.json has no "version" field');
      process.exit(1);
    }
  }
  console.log(`▶ Syncing all version files to v${targetVersion}\n`);
  try {
    syncDesktopVersion(desktopRoot, targetVersion);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
  console.log('  ✓ tauri.conf.json\n  ✓ Cargo.toml\n  ✓ package.json');
  console.log(`\n✅ All version files now at v${targetVersion}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
