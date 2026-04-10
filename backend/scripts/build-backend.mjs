#!/usr/bin/env node

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const distMain = path.join(backendDir, 'dist', 'main.js');
const buildTsconfig = existsSync(path.join(backendDir, 'tsconfig.build.json'))
  ? 'tsconfig.build.json'
  : 'tsconfig.json';

const args = new Set(process.argv.slice(2));
const verifyOnly = args.has('--verify-only');
const tscOnly = args.has('--tsc-only');

function log(message = '') {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  return result.status === 0;
}

function cleanBuildArtifacts() {
  rmSync(path.join(backendDir, 'dist'), { recursive: true, force: true });
  rmSync(path.join(backendDir, 'tsconfig.tsbuildinfo'), { force: true });
}

function verifyRequiredFiles() {
  for (const relativePath of ['package.json', 'tsconfig.json', 'src/main.ts']) {
    if (!existsSync(path.join(backendDir, relativePath))) {
      fail(`❌ Build failed: ${relativePath} not found`);
    }
  }
}

function runNestBuild() {
  const nestBin = path.join(backendDir, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
  if (!existsSync(nestBin)) {
    return false;
  }

  log('📦 Trying nest build...');
  return run(process.execPath, [nestBin, 'build']);
}

function runTscBuild(noEmit = false) {
  const tscBin = path.join(backendDir, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tscBin)) {
    fail('❌ Build failed: TypeScript compiler not found in node_modules');
  }

  const compilerArgs = [tscBin, '-p', buildTsconfig, '--incremental', 'false'];
  if (noEmit) {
    compilerArgs.push('--noEmit');
  }

  log(noEmit
    ? `🔍 Running TypeScript diagnostics (${buildTsconfig})...`
    : `📦 Building with TypeScript compiler (${buildTsconfig})...`);
  return run(process.execPath, compilerArgs);
}

function hasValidBuildOutput() {
  if (!existsSync(distMain)) {
    return false;
  }

  return statSync(distMain).size > 0;
}

function verifyBuildOutput() {
  log('');
  log('🔍 Verifying build output...');

  if (!hasValidBuildOutput()) {
    log('❌ dist/main.js not found');
    const distDir = path.join(backendDir, 'dist');
    if (existsSync(distDir)) {
      const entries = readdirSync(distDir).slice(0, 20);
      log(`📋 dist contents: ${entries.join(', ') || '(empty)'}`);
    } else {
      log('📋 dist directory does not exist');
    }
    runTscBuild(true);
    fail('❌ Backend build verification failed');
  }

  const fileSize = statSync(distMain).size;
  if (fileSize <= 0) {
    fail('❌ Backend build verification failed: dist/main.js is empty');
  }

  log(`✅ Build succeeded: dist/main.js (${fileSize} bytes)`);
}

verifyRequiredFiles();

if (verifyOnly) {
  verifyBuildOutput();
  process.exit(0);
}

log('🔨 Building Agentrix Backend...');
log('');
log('🧹 Cleaning previous build artifacts...');
cleanBuildArtifacts();

let built = false;
if (!tscOnly) {
  built = runNestBuild();
  if (built && !hasValidBuildOutput()) {
    log('⚠️ nest build completed without dist/main.js, falling back to tsc.');
    built = false;
  }
}

if (!built) {
  if (!tscOnly) {
    log('⚠️ nest build failed, falling back to tsc.');
  }
  built = runTscBuild(false);
}

if (!built) {
  fail('❌ Backend build failed');
}

verifyBuildOutput();