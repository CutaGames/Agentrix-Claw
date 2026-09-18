/**
 * M2 slice A5 / B4 (decision d-50) — the DRW flag must reach the APK.
 *
 * Claw #524 (run 35179971832): Maestro 91 failed on
 * `developer-workspace-fixture-banner` because the three Work-face readers
 * called `isDeveloperWorkspaceFlagEnabled(process.env as Record<…>)`.
 * `babel-preset-expo` inlines `EXPO_PUBLIC_*` only for the literal member
 * expression `process.env.EXPO_PUBLIC_<NAME>` (inline-env-vars.js), so that
 * object-style read was `undefined` in every APK and the Work face rendered
 * `feature_disabled` regardless of the CI injection (build-apk.yml / eas.json).
 *
 * jest runs in node where `process.env` is a real object, which is exactly why
 * no unit test caught it; the second block is the source-level guard.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  DEVELOPER_WORKSPACE_FLAG_ENV_KEY,
  isDeveloperWorkspaceBuildFlagEnabled,
  readDeveloperWorkspaceBuildEnv,
} from '../developerWorkspaceBuildEnv';

const ROOT = resolve(__dirname, '../../..');
const BUILD_ENV_MODULE = 'src/services/developerWorkspaceBuildEnv.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__') continue;
      walk(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('developerWorkspaceBuildEnv — the DRW flag read that the APK actually sees', () => {
  const previous = process.env[DEVELOPER_WORKSPACE_FLAG_ENV_KEY];

  afterEach(() => {
    if (previous === undefined) delete process.env[DEVELOPER_WORKSPACE_FLAG_ENV_KEY];
    else process.env[DEVELOPER_WORKSPACE_FLAG_ENV_KEY] = previous;
  });

  it('names the exact variable build-apk.yml and eas.json inject', () => {
    expect(DEVELOPER_WORKSPACE_FLAG_ENV_KEY).toBe('EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED');
  });

  it('is on only for the string "1", read at call time', () => {
    delete process.env[DEVELOPER_WORKSPACE_FLAG_ENV_KEY];
    expect(isDeveloperWorkspaceBuildFlagEnabled()).toBe(false);
    expect(readDeveloperWorkspaceBuildEnv()[DEVELOPER_WORKSPACE_FLAG_ENV_KEY]).toBeUndefined();

    process.env[DEVELOPER_WORKSPACE_FLAG_ENV_KEY] = '1';
    expect(isDeveloperWorkspaceBuildFlagEnabled()).toBe(true);

    for (const off of ['0', 'true', 'yes', '', ' 1']) {
      process.env[DEVELOPER_WORKSPACE_FLAG_ENV_KEY] = off;
      expect(isDeveloperWorkspaceBuildFlagEnabled()).toBe(false);
    }
  });
});

describe('EXPO_PUBLIC_* reads stay literal so babel-preset-expo can inline them', () => {
  const sources = [...walk(resolve(ROOT, 'src')), resolve(ROOT, 'App.tsx')].map((file) => ({
    rel: relative(ROOT, file).split(sep).join('/'),
    code: stripComments(readFileSync(file, 'utf8')),
  }));

  it('reads the DRW flag through one literal member expression, in the build-env module only', () => {
    const buildEnv = sources.find((s) => s.rel === BUILD_ENV_MODULE);
    expect(buildEnv).toBeDefined();
    expect(buildEnv!.code).toContain('process.env.EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED');

    const otherReaders = sources
      .filter((s) => s.rel !== BUILD_ENV_MODULE)
      .filter((s) => /process\.env\.EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED/.test(s.code))
      .map((s) => s.rel);
    expect(otherReaders).toEqual([]);
  });

  it('never hands process.env to isDeveloperWorkspaceFlagEnabled as an object', () => {
    const offenders = sources
      .filter((s) => /isDeveloperWorkspaceFlagEnabled\(\s*process\.env\b/.test(s.code))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });

  it('never uses process.env as a value (cast, argument, index, spread) anywhere in src/ or App.tsx', () => {
    // `process.env.<IDENT>` is the only shape the inline plugin rewrites; any
    // other use reads Metro's runtime object, which has no EXPO_PUBLIC_* keys.
    const offenders: string[] = [];
    for (const s of sources) {
      const bad = s.code.match(/process\.env(?!\.[A-Za-z_$][\w$]*)/g);
      if (bad) offenders.push(`${s.rel} (${bad.length})`);
    }
    expect(offenders).toEqual([]);
  });

  it('the three Work-face readers use the build-env helper', () => {
    for (const rel of [
      'src/hooks/useDeveloperWorkspaceLive.ts',
      'src/screens/agent-first/work/WorkHomeScreen.tsx',
      'src/screens/agent-first/work/WorkDetailScreens.tsx',
    ]) {
      const source = sources.find((s) => s.rel === rel);
      expect(source).toBeDefined();
      expect(source!.code).toContain('isDeveloperWorkspaceBuildFlagEnabled()');
      expect(source!.code).not.toContain('isDeveloperWorkspaceFlagEnabled(');
    }
  });
});
