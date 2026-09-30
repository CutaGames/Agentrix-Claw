/**
 * M1 Maestro guard (2026-09-27, I-006 / REQ-mobile-014).
 *
 * CI (`build-apk.yml`) runs every top-level `.maestro/*.yaml` except 01–04
 * on the built APK; one stale selector turns the whole UI job red. This test
 * catches that before CI: every *blocking* `id:` selector (tapOn,
 * assertVisible, extendedWaitUntil, scrollUntilVisible, not optional, not
 * inside a conditional runFlow) must exist as a testID in `src/` or App.tsx.
 * Flows for retired or removed surfaces live in `.maestro/legacy/`, which CI
 * does not scan.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { loadAll: (text: string) => unknown[] };

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MAESTRO_DIR = path.join(ROOT, '.maestro');

function listSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSource(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SOURCE = [...listSource(path.join(ROOT, 'src')), path.join(ROOT, 'App.tsx')]
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

const exactIds = new Set<string>();
const prefixIds: string[] = [];
for (const match of SOURCE.matchAll(/(?:testID|tabBarButtonTestID|testId)\s*[=:]\s*\{?\s*(['"`])([^'"`]+)\1/g)) {
  const value = match[2];
  if (value.includes('${')) {
    const prefix = value.split('${')[0];
    if (prefix.length >= 3) prefixIds.push(prefix);
  } else {
    exactIds.add(value);
  }
}

function idExists(id: string): boolean {
  return exactIds.has(id) || prefixIds.some((prefix) => id.startsWith(prefix));
}

type Command = Record<string, unknown> | string;

/** Blocking id selectors in a command list (skips optional and conditional steps). */
function blockingIds(commands: unknown): string[] {
  return blockingSelectors(commands)
    .filter((selector) => typeof selector.id === 'string')
    .map((selector) => selector.id as string);
}

/** Blocking selectors (id or text); with includeOptional, optional / conditional steps too. */
function blockingSelectors(commands: unknown, includeOptional = false): Array<Record<string, unknown>> {
  if (!Array.isArray(commands)) return [];
  const ids: Array<Record<string, unknown>> = [];
  for (const command of commands as Command[]) {
    if (!command || typeof command !== 'object') continue;
    for (const [name, arg] of Object.entries(command)) {
      if (name === 'runFlow') {
        const flow = arg as Record<string, unknown>;
        if (flow && typeof flow === 'object' && (includeOptional || !flow.when) && Array.isArray(flow.commands)) {
          ids.push(...blockingSelectors(flow.commands, includeOptional));
        }
        continue;
      }
      if (!arg || typeof arg !== 'object') continue;
      const options = arg as Record<string, unknown>;
      if (options.optional === true && !includeOptional) continue;
      const selector =
        name === 'extendedWaitUntil'
          ? (options.visible as Record<string, unknown> | undefined)
          : name === 'scrollUntilVisible'
            ? (options.element as Record<string, unknown> | undefined)
            : name === 'tapOn' || name === 'assertVisible' || name === 'longPressOn' || name === 'doubleTapOn'
              ? options
              : undefined;
      if (selector && (typeof selector.id === 'string' || typeof selector.text === 'string')) ids.push(selector);
    }
  }
  return ids;
}

function loadFlows(dir: string, prefix = '') {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => {
      const docs = yaml.loadAll(fs.readFileSync(path.join(dir, name), 'utf8'));
      const commands = docs.find((doc) => Array.isArray(doc));
      return { name: `${prefix}${name}`, ids: blockingIds(commands), selectors: blockingSelectors(commands, true) };
    });
}

const FLOWS = loadFlows(MAESTRO_DIR);
/** Four-zone flows (flag-on builds only; not scanned by CI's top-level run). */
const FOUR_ZONE_FLOWS = loadFlows(path.join(MAESTRO_DIR, 'four-zone'), 'four-zone/');

describe('Maestro flows (top level, run by CI)', () => {
  it('parses every flow and finds selectors to check', () => {
    expect(FLOWS.length).toBeGreaterThan(20);
    expect(FLOWS.reduce((sum, flow) => sum + flow.ids.length, 0)).toBeGreaterThan(20);
    expect(exactIds.size).toBeGreaterThan(100);
  });

  it.each(FLOWS.map((flow) => [flow.name, flow.ids] as const))('%s: every blocking id exists in the app', (_name, ids) => {
    expect(ids.filter((id) => !idExists(id))).toEqual([]);
  });

  it.each(FOUR_ZONE_FLOWS.map((flow) => [flow.name, flow.ids] as const))('%s: every blocking id exists in the app', (_name, ids) => {
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.filter((id) => !idExists(id))).toEqual([]);
  });

  it('four-zone smoke runs only read: no tap on a stop, narrow, revoke, hide, share, pay or deliver control (L3)', () => {
    const taps = (commands: unknown): string[] => {
      if (!Array.isArray(commands)) return [];
      const out: string[] = [];
      for (const command of commands as Command[]) {
        if (!command || typeof command !== 'object') continue;
        for (const [name, arg] of Object.entries(command)) {
          if (name === 'runFlow' && arg && typeof arg === 'object') out.push(...taps((arg as Record<string, unknown>).commands));
          if ((name === 'tapOn' || name === 'longPressOn' || name === 'doubleTapOn') && arg && typeof arg === 'object') {
            const id = (arg as Record<string, unknown>).id;
            if (typeof id === 'string') out.push(id);
          }
        }
      }
      return out;
    };
    const write = /^(twin-stop-now|twin-unpublish|twin-mandate-(narrow|revoke)|twin-passport-(revoke|hide|shorten)|twin-order-deliver|twin-card-share|matters-approve|matters-reject|sync-continuity-watch-button)/;
    const offenders = FOUR_ZONE_FLOWS.flatMap((flow) => {
      const docs = yaml.loadAll(fs.readFileSync(path.join(MAESTRO_DIR, flow.name), 'utf8'));
      return taps(docs.find((doc) => Array.isArray(doc))).filter((id) => write.test(id)).map((id) => `${flow.name}: ${id}`);
    });
    expect(offenders).toEqual([]);
  });

  it('the four-zone flows open every 上线 3 phone screen (I-046)', () => {
    // Any use counts, conditions included (`runFlow: when: visible`): some screens show a card only with data.
    const all = FOUR_ZONE_FLOWS.flatMap((flow) =>
      [...fs.readFileSync(path.join(MAESTRO_DIR, flow.name), 'utf8').matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]),
    );
    const l3 = [
      'twin-income-screen', // 分身 → 收入与回执
      'twin-mandate-section', // 分身 → 公开状态 → 代表范围
      'device-safety-receipts', // 事项 → 电脑上 → 急停回执
      'twin-passport-card', // 分身 → Agent 护照（只读卡）
      'twin-passport-visitors-toggle-.*', // 护照 → 来访记录
      'matters-order-notice', // order_update 推送落点
    ];
    expect(l3.filter((id) => !all.includes(id))).toEqual([]);
  });

  it('no top-level flow exercises a retired surface (D22 / legacy drawer / Play)', () => {
    const retired = /预测|赛事|predict|polymarket|lsm|plaza-seg-|drawer-/i;
    const offenders = [...FLOWS, ...FOUR_ZONE_FLOWS].filter((flow) =>
      flow.selectors.some((selector) => retired.test(String(selector.id ?? '')) || retired.test(String(selector.text ?? ''))),
    ).map((flow) => flow.name);
    expect(offenders).toEqual([]);
  });
});
