#!/usr/bin/env node
// scripts/public-build/sync-maestro-to-claw.mjs
//
// Targeted patch: sync ONLY the `.maestro/*.yaml` files from Agentrix
// to Agentrix-Claw via GitHub Contents API. Used when a full mirror is
// too slow / too risky, and only a narrow fix (maestro YAML parse fix
// in c5f680de) needs to land on the Claw build branch so its APK CI
// Maestro step stops failing.
//
// Usage:
//   GH_TOKEN=ghp_xxx node scripts/public-build/sync-maestro-to-claw.mjs \
//     --branch build/sprint-a-b-c-d-2026-05-10 \
//     [--files .maestro/13-me-subscribe-axp.yaml,.maestro/14-coraising-greeting.yaml,.maestro/15-global-inbox-scan.yaml]

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_FILES = [
  '.maestro/13-me-subscribe-axp.yaml',
  '.maestro/14-coraising-greeting.yaml',
  '.maestro/15-global-inbox-scan.yaml',
];

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const token = process.env.GH_TOKEN;
if (!token) {
  console.error('GH_TOKEN env var required');
  process.exit(1);
}
const branch = argVal('--branch');
if (!branch) {
  console.error('--branch required');
  process.exit(1);
}
const files = (argVal('--files') || DEFAULT_FILES.join(',')).split(',').filter(Boolean);

const REPO = 'CutaGames/Agentrix-Claw';
const API = 'https://api.github.com';
const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'agentrix-sync-maestro',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function ghFetch(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!r.ok && r.status !== 404) {
    const body = await r.text();
    throw new Error(`GitHub ${r.status} ${r.statusText} on ${url}\n${body}`);
  }
  return r;
}

async function getCurrentSha(filePath) {
  const url = `${API}/repos/${REPO}/contents/${encodeURI(filePath)}?ref=${encodeURIComponent(branch)}`;
  const r = await ghFetch(url);
  if (r.status === 404) return null;
  const json = await r.json();
  return json.sha;
}

async function putFile(filePath, localPath) {
  const content = await fs.readFile(localPath);
  const sha = await getCurrentSha(filePath);
  const body = {
    message: `sync(maestro): ${filePath} from Agentrix@c5f680de`,
    content: content.toString('base64'),
    branch,
    committer: { name: 'agentrix-bot', email: 'agentrix-bot@cutagames.local' },
  };
  if (sha) body.sha = sha;
  const url = `${API}/repos/${REPO}/contents/${encodeURI(filePath)}`;
  const r = await ghFetch(url, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const json = await r.json();
  if (!r.ok) {
    throw new Error(`PUT ${filePath} failed ${r.status}: ${JSON.stringify(json)}`);
  }
  return json.commit.sha;
}

async function main() {
  const repoRoot = process.cwd();
  for (const rel of files) {
    const local = path.join(repoRoot, rel);
    try {
      await fs.access(local);
    } catch {
      console.warn(`skip (missing locally): ${rel}`);
      continue;
    }
    const sha = await putFile(rel, local);
    console.log(`PUT ${rel} -> ${sha}`);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
