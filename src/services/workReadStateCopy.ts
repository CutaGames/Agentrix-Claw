/**
 * User-facing copy for the eight Work read-states — M1.2.2 (MTR-R07.2/.3).
 *
 * Pure data, no React Native imports, so the current jest `testMatch` can
 * assert that every state and every next-action the reducer can emit has
 * copy in both languages. `WorkReadStateCard.tsx` only renders this table.
 */
import type { WorkReadStateNextAction } from './workReadStateDisplay';

export interface BilingualCopy {
  readonly en: string;
  readonly zh: string;
}

export interface WorkReadStateCopy {
  /** Short headline for the empty / degraded state. */
  readonly title: BilingualCopy;
  /** One sentence telling the user what this means for them. */
  readonly body: BilingualCopy;
}

/** Keyed by `WorkReadStateDisplay.messageKey`. */
export const WORK_READ_STATE_COPY: Readonly<Record<string, WorkReadStateCopy>> = Object.freeze({
  'readState.ready': {
    title: { en: 'Up to date', zh: '已是最新' },
    body: { en: 'Showing the latest confirmed state.', zh: '显示的是最新已确认的状态。' },
  },
  'readState.partial': {
    title: { en: 'Partially loaded', zh: '部分加载' },
    body: {
      en: 'Some items could not be read. What is shown may be incomplete.',
      zh: '部分项目未能读取，当前显示可能不完整。',
    },
  },
  'readState.unavailable': {
    title: { en: 'Not available here', zh: '此处不可用' },
    body: {
      en: 'This capability is not served on Mobile in this release.',
      zh: '本次发布中，此能力不在 Mobile 提供。',
    },
  },
  'readState.offlineStale': {
    title: { en: 'Offline · showing last known', zh: '离线 · 显示上次已知' },
    body: {
      en: 'You are offline. Nothing here is live, and nothing can be acted on until you reconnect.',
      zh: '当前离线。这里的内容不是实时的，重新联网前不能执行任何操作。',
    },
  },
  'readState.unknown': {
    title: { en: 'Status not confirmed', zh: '状态尚未确认' },
    body: {
      en: 'The server has not confirmed this state yet. No data is shown until it does.',
      zh: '服务端尚未确认此状态，确认前不显示数据。',
    },
  },
  'readState.unauthorized': {
    title: { en: 'Sign in required', zh: '需要登录' },
    body: {
      en: 'Your session is missing or expired. Sign in again to continue.',
      zh: '会话缺失或已过期，请重新登录后继续。',
    },
  },
  'readState.unsupported': {
    title: { en: 'Not supported on this version', zh: '当前版本不支持' },
    body: {
      en: 'This app version cannot read this data. Open it on Web instead.',
      zh: '当前 App 版本无法读取此数据，请改在 Web 打开。',
    },
  },
  'readState.error': {
    title: { en: 'Could not load', zh: '读取失败' },
    body: { en: 'The read failed. Try again in a moment.', zh: '读取失败，请稍后重试。' },
  },
});

/** Keyed by `WorkReadStateDisplay.nextAction`; `none` intentionally renders nothing. */
export const WORK_READ_STATE_NEXT_ACTION_COPY: Readonly<Record<WorkReadStateNextAction, BilingualCopy | null>> =
  Object.freeze({
    none: null,
    retry: { en: 'Pull to refresh to try again', zh: '下拉刷新重试' },
    reconnect: { en: 'Reconnect to see live data', zh: '重新联网后查看实时数据' },
    sign_in: { en: 'Sign in again from My → Account', zh: '在「我的 → 账户」重新登录' },
    open_on_web: { en: 'Open on Web for the full view', zh: '在 Web 打开查看完整内容' },
    contact_support: { en: 'Contact support if this persists', zh: '若持续出现请联系支持' },
  });

export function workReadStateCopyFor(messageKey: string): WorkReadStateCopy {
  return WORK_READ_STATE_COPY[messageKey] ?? WORK_READ_STATE_COPY['readState.unknown'];
}
