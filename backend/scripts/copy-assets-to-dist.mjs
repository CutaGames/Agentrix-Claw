#!/usr/bin/env node
/**
 * Copy non-TS assets (JSON files, etc.) to dist directory after tsc build.
 * tsc doesn't copy non-TS files, so we need to do this manually.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const srcDir = path.join(backendDir, 'src');
const distDir = path.join(backendDir, 'dist');

const ASSET_EXTENSIONS = ['.json', '.txt', '.md'];

let copied = 0;

function copyAssetsRecursive(currentSrcDir, currentDistDir) {
  if (!existsSync(currentSrcDir)) return;

  const entries = readdirSync(currentSrcDir);

  for (const entry of entries) {
    const srcPath = path.join(currentSrcDir, entry);
    const distPath = path.join(currentDistDir, entry);
    const stats = statSync(srcPath);

    if (stats.isDirectory()) {
      // Skip node_modules and dist
      if (entry === 'node_modules' || entry === 'dist') continue;
      copyAssetsRecursive(srcPath, distPath);
    } else if (ASSET_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      // Skip TypeScript-related files
      if (entry === 'package.json' || entry === 'tsconfig.json') continue;

      // Ensure dist subdirectory exists
      if (!existsSync(currentDistDir)) {
        mkdirSync(currentDistDir, { recursive: true });
      }

      copyFileSync(srcPath, distPath);
      copied++;
    }
  }
}

console.log('📋 Copying non-TS assets to dist...');
copyAssetsRecursive(srcDir, distDir);
console.log(`✅ Copied ${copied} asset files to dist`);
