/**
 * openclaw-migration-outcome.ts
 *
 * The single rule for what an OpenClaw bridge "migration" outcome actually is.
 *
 * This lives beside the API contract rather than inside a screen because it is a
 * correctness rule, not presentation.
 *
 * Two backend facts drive every decision here, both verified against
 * `backend/src/modules/openclaw-bridge/openclaw-bridge.service.ts`:
 *
 *  1. **`status: 'error'` is never produced.** All four category fetches collapse
 *     every failure — timeout, 401, 500, missing endpoint — into
 *     `{ status: 'skipped', detail: 'Endpoint not available' }`. So `skipped` is
 *     ambiguous: it means "absent or failed" and can never be read as success.
 *     Treating only `error` as failure would report an unreachable instance as a
 *     completed migration.
 *  2. **Only `instance.name` and `instance.personality` are persisted.** Skills,
 *     memory entries and session summaries are returned in the response body and
 *     never written into Agentrix. The operation is a source read, not a commit,
 *     so no outcome here may claim content was migrated or retained.
 *
 * Kept free of React Native and network imports so it stays unit-testable under
 * the root pure-logic Jest config.
 */

import type { MigrationCategory, MigrationResult } from './openclaw-bridge.service';

/**
 * Outcome of one bridge read attempt.
 *
 * - `succeeded`      every category returned content
 * - `partial`        at least one category returned, at least one did not
 * - `nothing_read`   no category returned; binding held but nothing was read
 * - `failed`         the request threw; the server-side outcome is unknown
 */
export type MigrationOutcome = 'succeeded' | 'partial' | 'nothing_read' | 'failed';

/** Outcomes derivable from a returned result. `failed` is set by the caller. */
export type ReturnedMigrationOutcome = Exclude<MigrationOutcome, 'failed'>;

const CATEGORY_LABELS: Record<MigrationCategory['category'], string> = {
  config: '配置',
  skills: '技能',
  memory: '记忆',
  sessions: '对话历史',
};

function categories(result: MigrationResult | null | undefined): MigrationCategory[] {
  return Array.isArray(result?.categories) ? (result!.categories as MigrationCategory[]) : [];
}

/**
 * Derives the outcome of a bridge read that **returned a result**.
 *
 * A thrown request is not an input: the caller cannot know the server-side
 * outcome, so it records `failed` directly instead of guessing.
 *
 * Only `ok` counts as positive evidence. An empty or malformed category list
 * carries no evidence and therefore resolves to `nothing_read`, never success.
 */
export function deriveMigrationOutcome(
  result: MigrationResult | null | undefined,
): ReturnedMigrationOutcome {
  const all = categories(result);
  const readCount = all.filter((entry) => entry?.status === 'ok').length;
  if (readCount === 0) return 'nothing_read';
  return readCount === all.length ? 'succeeded' : 'partial';
}

/**
 * Categories that did not return content, for retry and support.
 *
 * Includes `skipped` as well as `error`, because the backend reports real
 * failures as `skipped`. Omitting it would hide the common failure from the user.
 */
export function incompleteMigrationCategories(
  result: MigrationResult | null | undefined,
): MigrationCategory[] {
  return categories(result).filter((entry) => entry?.status !== 'ok');
}

/** Chinese label for a category, falling back to the raw key if unmapped. */
export function migrationCategoryLabel(category: MigrationCategory['category']): string {
  return CATEGORY_LABELS[category] ?? String(category);
}



/**
 * Presentation derived from an outcome.
 *
 * Deliberately a pure function rather than inline JSX so the release-blocking
 * rule — a bound-but-unread instance must never be shown as a completed
 * migration — is assertable without React Native test infrastructure.
 */
export interface MigrationOutcomeCopy {
  icon: string;
  title: string;
  body: string;
  /** Whether the per-category read counts may be shown. */
  showsReadCounts: boolean;
  /** Whether a retry action must be offered. */
  offersRetry: boolean;
}

/**
 * `null` means no attempt has settled yet (initial or retry in flight). It is
 * rendered as in-progress, never as an outcome.
 *
 * No branch may state that content was migrated, synced or fully retained: the
 * bridge only reads the source and persists instance name/personality.
 */
export function describeMigrationOutcome(outcome: MigrationOutcome | null): MigrationOutcomeCopy {
  switch (outcome) {
    case 'succeeded':
      return {
        icon: '✅',
        title: '实例已接入',
        body: '已从源实例读取到以下内容。这些内容尚未写入 Agentrix，导入功能开放后可以选择保留哪些部分。',
        showsReadCounts: true,
        offersRetry: false,
      };
    case 'partial':
      return {
        icon: '⚠️',
        title: '实例已接入，部分内容未读取到',
        body: '部分类别没有返回内容，可能是源实例未提供该接口，也可能是读取失败。已读取的内容如下，未读取的类别可以重试。',
        showsReadCounts: true,
        offersRetry: true,
      };
    case 'nothing_read':
      return {
        icon: '🔌',
        title: '实例已绑定，未读取到内容',
        body: '绑定已保存，但所有类别都没有返回内容。源实例可能已离线，或未提供这些接口。可以立即重试，或稍后在设置中重试。',
        showsReadCounts: false,
        offersRetry: true,
      };
    case 'failed':
      return {
        icon: '🔌',
        title: '实例已绑定，读取失败',
        body: '绑定已保存，但读取请求失败，本次没有获得任何内容。可以立即重试，或稍后在设置中重试。',
        showsReadCounts: false,
        offersRetry: true,
      };
    default:
      return {
        icon: '⏳',
        title: '正在读取源实例…',
        body: '绑定已保存，正在读取配置、技能、记忆与对话历史。',
        showsReadCounts: false,
        offersRetry: false,
      };
  }
}

/**
 * Makes a thrown error safe and readable in the UI.
 *
 * `apiFetch` falls back to the raw response text when a body carries no
 * `message`/`error` field, so an upstream body can otherwise be rendered
 * verbatim to the user. Markup-looking payloads and empty messages fall back to
 * a generic line, and long text is collapsed to one clipped line.
 */
export function presentableMigrationError(raw: unknown): string {
  const fallback = '读取请求失败，请稍后重试';
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return fallback;
  if (/<\s*(?:!doctype|html|head|body|script)\b/i.test(text)) return fallback;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return fallback;
  return oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
}
