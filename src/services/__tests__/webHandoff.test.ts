/**
 * M1.4.4 / MTR-R09.5 (matrix #38): the full Workflow editor is a Web
 * responsibility. Mobile keeps a handoff URL, not a screen.
 *
 * The URL builder is a pure function (M0.0.5 option b, inside the root jest
 * range); the "no route is left behind" half is the source-level form of the
 * acceptance, because jest cannot render the navigators here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { APP_URL } from '../../config/env';
import { WORKFLOW_EDITOR_WEB_PATH, getWorkflowEditorWebUrl } from '../webHandoff';

const ROOT = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__') continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const HANDOFF_ENTRY_POINTS = [
  'src/components/AgentDrawerContent.tsx',
  'src/screens/agent/AgentConsoleScreen.tsx',
  'src/screens/agent-first/work/WorkHomeScreen.tsx',
];

describe('M1.4.4 — the Workflow editor handoff URL', () => {
  it('points at the Web console workflows page', () => {
    expect(WORKFLOW_EDITOR_WEB_PATH).toBe('/console/developer/workflows');
    expect(getWorkflowEditorWebUrl('https://agentrix.top')).toBe(
      'https://agentrix.top/console/developer/workflows',
    );
  });

  it('normalises trailing slashes on the base URL', () => {
    expect(getWorkflowEditorWebUrl('https://agentrix.top/')).toBe(
      'https://agentrix.top/console/developer/workflows',
    );
    expect(getWorkflowEditorWebUrl('https://agentrix.top///')).toBe(
      'https://agentrix.top/console/developer/workflows',
    );
  });

  it('defaults to the environment APP_URL and yields one absolute http(s) URL', () => {
    const url = getWorkflowEditorWebUrl();
    expect(url).toBe(`${APP_URL.replace(/\/+$/, '')}${WORKFLOW_EDITOR_WEB_PATH}`);
    expect(url).toMatch(/^https?:\/\/[^/]+\/console\/developer\/workflows$/);
  });

  // frontend/ is only present in the monorepo checkout (the public build
  // mirror ships src/ + shared/ without it), so the cross-check is skipped there.
  const frontendPages = resolve(ROOT, 'frontend/pages');
  (existsSync(frontendPages) ? it : it.skip)('mirrors a page that exists in the Web app', () => {
    expect(existsSync(join(frontendPages, 'console/developer/workflows.tsx'))).toBe(true);
  });
});

describe('M1.4.4 — Mobile no longer hosts a Workflow editor route', () => {
  it('registers no WorkflowList / WorkflowDetail screen in any navigator', () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, 'src/navigation'))) {
      const source = readFileSync(file, 'utf8');
      if (/name=["']Workflow(List|Detail)["']/.test(source)) {
        offenders.push(relative(ROOT, file).split(sep).join('/'));
      }
    }
    expect(offenders).toEqual([]);
    expect(read('src/navigation/types.ts')).not.toMatch(/^\s*Workflow(List|Detail)\s*:/m);
  });

  it('has removed the retired screens from disk', () => {
    expect(existsSync(resolve(ROOT, 'src/screens/agent/WorkflowListScreen.tsx'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'src/screens/agent/WorkflowDetailScreen.tsx'))).toBe(false);
  });

  it.each(HANDOFF_ENTRY_POINTS)('%s hands off to Web instead of navigating', (rel) => {
    const source = read(rel);
    expect(source).toContain('getWorkflowEditorWebUrl');
    expect(source).not.toMatch(/['"]WorkflowList['"]/);
    expect(source).not.toMatch(/['"]WorkflowDetail['"]/);
  });

  it('nothing else in src/ still navigates to the retired routes', () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      if (/navigate\(\s*['"]Workflow(List|Detail)['"]/.test(source)) {
        offenders.push(relative(ROOT, file).split(sep).join('/'));
      }
    }
    expect(offenders).toEqual([]);
  });
});
