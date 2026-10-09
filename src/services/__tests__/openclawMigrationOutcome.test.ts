/**
 * Pins the OpenClaw bridge outcome rules so a bound-but-unread instance can never
 * be presented to the user as a completed migration.
 *
 * Guards the release-blocking criterion in
 * `docs/agentrix-cross-platform-soul-core-connectors-strategy-roadmap-2026-08-08.zh-CN.md`
 * §4.4 / §7.9: "失败仍显示『完成/完整保留』即阻塞".
 *
 * Two verified backend facts are encoded here. Both come from
 * `backend/src/modules/openclaw-bridge/openclaw-bridge.service.ts`:
 *   - every category failure is reported as `skipped`, never `error`;
 *   - only instance name/personality are persisted, so nothing may claim the
 *     read content was migrated, synced or retained.
 */

import {
  describeMigrationOutcome,
  deriveMigrationOutcome,
  incompleteMigrationCategories,
  migrationCategoryLabel,
  presentableMigrationError,
  type MigrationOutcome,
} from '../openclaw-migration-outcome';
import type { MigrationCategory, MigrationResult } from '../openclaw-bridge.service';

function buildResult(categories: MigrationCategory[]): MigrationResult {
  return {
    instanceId: 'instance-1',
    startedAt: '2026-08-09T00:00:00.000Z',
    finishedAt: '2026-08-09T00:00:05.000Z',
    categories,
    skills: [],
    memoryEntries: [],
    sessionSummaries: [],
    totalMigrated: 0,
  };
}

const ALL_OUTCOMES: Array<MigrationOutcome | null> = [
  'succeeded',
  'partial',
  'nothing_read',
  'failed',
  null,
];

describe('deriveMigrationOutcome', () => {
  it('claims succeeded only when every category returned content', () => {
    expect(
      deriveMigrationOutcome(
        buildResult([
          { category: 'config', status: 'ok', count: 1 },
          { category: 'skills', status: 'ok', count: 3 },
        ]),
      ),
    ).toBe('succeeded');
  });

  it('treats an all-skipped result as nothing read, not success', () => {
    // This is the real unreachable-instance shape: the backend maps timeout, 401,
    // 500 and missing-endpoint all to `skipped`, and never throws.
    expect(
      deriveMigrationOutcome(
        buildResult([
          { category: 'config', status: 'skipped', detail: 'Endpoint not available' },
          { category: 'skills', status: 'skipped', detail: 'Endpoint not available' },
          { category: 'memory', status: 'skipped', detail: 'Endpoint not available' },
          { category: 'sessions', status: 'skipped', detail: 'Endpoint not available' },
        ]),
      ),
    ).toBe('nothing_read');
  });

  it('reports partial when some categories returned and some did not', () => {
    expect(
      deriveMigrationOutcome(
        buildResult([
          { category: 'config', status: 'ok', count: 1 },
          { category: 'skills', status: 'skipped', detail: 'Endpoint not available' },
        ]),
      ),
    ).toBe('partial');
  });

  it('treats an error category as incomplete even though the backend never emits it', () => {
    expect(
      deriveMigrationOutcome(
        buildResult([
          { category: 'config', status: 'ok', count: 1 },
          { category: 'memory', status: 'error', detail: 'source unreachable' },
        ]),
      ),
    ).toBe('partial');
  });

  it('never claims success from an absent or malformed category list', () => {
    expect(deriveMigrationOutcome(buildResult([]))).toBe('nothing_read');
    expect(
      deriveMigrationOutcome({ ...buildResult([]), categories: undefined } as unknown as MigrationResult),
    ).toBe('nothing_read');
    expect(deriveMigrationOutcome(null)).toBe('nothing_read');
  });
});

describe('incompleteMigrationCategories', () => {
  it('includes skipped, because that is how the backend reports failure', () => {
    const result = buildResult([
      { category: 'config', status: 'ok' },
      { category: 'skills', status: 'skipped', detail: 'Endpoint not available' },
      { category: 'memory', status: 'error', detail: 'timeout' },
    ]);
    expect(incompleteMigrationCategories(result).map((entry) => entry.category)).toEqual([
      'skills',
      'memory',
    ]);
  });

  it('returns an empty list for a fully read result and for null', () => {
    expect(incompleteMigrationCategories(buildResult([{ category: 'config', status: 'ok' }]))).toEqual([]);
    expect(incompleteMigrationCategories(null)).toEqual([]);
  });
});

describe('migrationCategoryLabel', () => {
  it('localizes every category the contract defines', () => {
    expect(migrationCategoryLabel('config')).toBe('配置');
    expect(migrationCategoryLabel('skills')).toBe('技能');
    expect(migrationCategoryLabel('memory')).toBe('记忆');
    expect(migrationCategoryLabel('sessions')).toBe('对话历史');
  });
});

describe('describeMigrationOutcome', () => {
  it.each(ALL_OUTCOMES)('never claims migration completion or full retention for %s', (outcome) => {
    const { title, body } = describeMigrationOutcome(outcome);
    const forbidden = ['迁移完成', '完整保留', '已同步', '数据完整', '全部迁移'];
    for (const phrase of forbidden) {
      expect(title).not.toContain(phrase);
      expect(body).not.toContain(phrase);
    }
  });

  it.each(ALL_OUTCOMES)('always provides non-empty copy for %s', (outcome) => {
    const copy = describeMigrationOutcome(outcome);
    expect(copy.icon.length).toBeGreaterThan(0);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.body.length).toBeGreaterThan(0);
  });

  it('offers retry for every non-successful settled outcome', () => {
    expect(describeMigrationOutcome('partial').offersRetry).toBe(true);
    expect(describeMigrationOutcome('nothing_read').offersRetry).toBe(true);
    expect(describeMigrationOutcome('failed').offersRetry).toBe(true);
  });

  it('does not offer retry on success, and not while an attempt is in flight', () => {
    expect(describeMigrationOutcome('succeeded').offersRetry).toBe(false);
    expect(describeMigrationOutcome(null).offersRetry).toBe(false);
  });

  it('shows read counts only when something was actually read', () => {
    expect(describeMigrationOutcome('succeeded').showsReadCounts).toBe(true);
    expect(describeMigrationOutcome('partial').showsReadCounts).toBe(true);
    expect(describeMigrationOutcome('nothing_read').showsReadCounts).toBe(false);
    expect(describeMigrationOutcome('failed').showsReadCounts).toBe(false);
    expect(describeMigrationOutcome(null).showsReadCounts).toBe(false);
  });

  it('states that read content is not yet written into Agentrix on success', () => {
    // Success is the only branch that shows counts prominently, so it is the one
    // that could most easily be misread as a completed import.
    expect(describeMigrationOutcome('succeeded').body).toContain('尚未写入');
  });

  it('keeps binding and reading distinguishable in every failure branch', () => {
    for (const outcome of ['nothing_read', 'failed'] as const) {
      expect(describeMigrationOutcome(outcome).title).toContain('已绑定');
    }
  });
});

describe('presentableMigrationError', () => {
  it('keeps a short, readable API message', () => {
    expect(presentableMigrationError('Instance has no URL configured')).toBe(
      'Instance has no URL configured',
    );
  });

  it('never renders a markup response body to the user', () => {
    // apiFetch falls back to raw response text, so an upstream HTML body can
    // otherwise reach the UI verbatim.
    for (const body of [
      '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>',
      '<html lang="en">nginx</html>',
      '  <script>alert(1)</script>',
    ]) {
      expect(presentableMigrationError(body)).toBe('读取请求失败，请稍后重试');
    }
  });

  it('falls back for empty, whitespace and non-string input', () => {
    for (const value of ['', '   ', undefined, null, 42, {}]) {
      expect(presentableMigrationError(value)).toBe('读取请求失败，请稍后重试');
    }
  });

  it('collapses whitespace and clips very long text', () => {
    expect(presentableMigrationError('read  failed\n\nretry later')).toBe('read failed retry later');
    const long = presentableMigrationError('x'.repeat(400));
    expect(long.length).toBe(161);
    expect(long.endsWith('…')).toBe(true);
  });
});
