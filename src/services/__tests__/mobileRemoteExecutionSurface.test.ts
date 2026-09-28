/**
 * M0 (2026-09-27) — source guard: no mobile screen or component may carry a
 * remote shell / file write / file read / URL open submission path, or a
 * loosening remote-control command. Complements the runtime fence tests in
 * mobileRemoteExecutionPolicy.test.ts: this one fails if someone re-adds a
 * button that would have been blocked at runtime anyway.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { MOBILE_DESKTOP_COMMAND_ALLOWLIST } from '../mobileRemoteExecutionPolicy';

const SRC_ROOT = path.resolve(__dirname, '..', '..');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = listSourceFiles(SRC_ROOT).map((file) => ({
  rel: path.relative(SRC_ROOT, file).split(path.sep).join('/'),
  text: fs.readFileSync(file, 'utf8'),
}));

/** Files allowed to name the blocked kinds: display-only type + the fence. */
const KIND_DECLARATION_FILES = new Set(['services/desktopSync.ts', 'services/mobileRemoteExecutionPolicy.ts']);

function offenders(pattern: RegExp, allow: Set<string> = new Set()): string[] {
  return FILES.filter((file) => !allow.has(file.rel) && pattern.test(file.text)).map((file) => file.rel);
}

describe('mobile remote-execution surface', () => {
  it('scans a real source tree', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((file) => file.rel === 'screens/agent/DesktopControlScreen.tsx')).toBe(true);
  });

  it('no screen or component names run-command / write-file / read-file / open-browser', () => {
    expect(offenders(/['"`](run-command|write-file|read-file|open-browser)['"`]/, KIND_DECLARATION_FILES)).toEqual([]);
  });

  it('no client calls a raw exec endpoint', () => {
    expect(offenders(/\/(exec|shell|terminal)['"`?]/)).toEqual([]);
  });

  it('no client emits a loosening remote-control command', () => {
    expect(
      offenders(
        /computer-use\.start|pro-mode\.toggle|aira-work-mode\.start|tts\.broadcast|white-noise\.start|notifications\.silence/,
      ),
    ).toEqual([]);
  });

  it('every literal desktop command kind submitted from the UI is on the allowlist', () => {
    const allowed = new Set<string>(MOBILE_DESKTOP_COMMAND_ALLOWLIST);
    const submitted: Array<{ file: string; kind: string }> = [];
    const patterns = [/submitCommand\(\s*['"`]([^'"`]+)['"`]/g, /createRemoteDesktopCommand\(\{[^}]*?kind:\s*['"`]([^'"`]+)['"`]/g];
    for (const file of FILES) {
      for (const pattern of patterns) {
        for (const match of file.text.matchAll(pattern)) {
          submitted.push({ file: file.rel, kind: match[1] });
        }
      }
    }
    expect(submitted.length).toBeGreaterThan(0);
    expect(submitted.filter((item) => !allowed.has(item.kind))).toEqual([]);
  });

  it('DesktopControlScreen has no free-text command, path or URL input', () => {
    const screen = FILES.find((file) => file.rel === 'screens/agent/DesktopControlScreen.tsx');
    expect(screen?.text).toBeDefined();
    expect(screen?.text).not.toMatch(/<TextInput\b/);
  });

  it('AgentToolsScreen has no terminal tab', () => {
    const screen = FILES.find((file) => file.rel === 'screens/agent/AgentToolsScreen.tsx');
    expect(screen?.text).toBeDefined();
    expect(screen?.text).not.toMatch(/TerminalTab|'terminal'/);
  });
});
