/**
 * Aeon 任务/契约状态机(纯函数,Property 8 / R7.3 / R9.3 可测)。
 *
 * 从 TaskContractService 抽出迁移表与判定为纯逻辑,便于属性测试(P.2/P.4)无需 DB。
 * service 复用本模块,保证"被测的"与"在跑的"是同一份规则。
 */
export type AeonTaskState =
  | 'open'
  | 'in_progress'
  | 'awaiting_verify'
  | 'disputed'
  | 'completed'
  | 'cancelled'
  | 'expired';

/** 合法迁移表。终态(completed/cancelled/expired)出度为空。 */
export const AEON_TASK_TRANSITIONS: Record<AeonTaskState, AeonTaskState[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_verify', 'expired', 'cancelled'],
  awaiting_verify: ['completed', 'in_progress', 'disputed'],
  disputed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  expired: [],
};

export const AEON_TASK_TERMINAL: ReadonlySet<AeonTaskState> = new Set<AeonTaskState>([
  'completed',
  'cancelled',
  'expired',
]);

/** 是否为合法迁移。 */
export function isLegalTransition(from: AeonTaskState, to: AeonTaskState): boolean {
  return AEON_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 是否终态(不可再迁移)。 */
export function isTerminal(s: AeonTaskState): boolean {
  return AEON_TASK_TERMINAL.has(s);
}
