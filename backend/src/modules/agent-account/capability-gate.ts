/**
 * 能力门控（G 组)— 单一权威来源(Single Authoritative Source)
 *
 * 需求 7.22 / 7.23、design C1「能力门控」:
 *   `AgentAccount.capabilities`(MCP tools)是某个 agent **实际可调用工具集**的
 *   唯一权威声明源。`openclaw_instance` / skill 侧的门控均**从此派生**,
 *   不再各自维护一套 allow-list,消除双源冲突。
 *
 * 语义:**声明即门控(deny-by-default)** —— 未在 `capabilities` 中声明的工具
 * 一律拒绝。本模块只承载纯匹配逻辑(无 I/O、无副作用),供执行层
 * (`skill-executor` / desktop tool gating)与 `AgentAccountService` 复用,
 * 保证「权威判定逻辑」本身也只有一份。
 */

/** 全通配 token —— 声明该 token 等价于「允许全部工具」。 */
export const WILDCARD_ALL = '*';

/**
 * 归一化工具名:去首尾空白并转小写。
 *
 * 工具名在不同执行层有大小写/空白差异(如 `Skill_Search` vs `skill_search`),
 * 统一归一化后再比较,避免「同一工具因书写差异被误拒」。
 */
export function normalizeToolName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * 单条声明 token 是否匹配目标工具名。
 *
 * 支持三种声明形态:
 *  - 全通配 `'*'` —— 匹配任何工具;
 *  - 前缀通配 `'mcp_*'` / `'skill_*'`(token 以 `*` 结尾)—— 匹配以该前缀开头的工具;
 *  - 精确匹配 —— 归一化后字符串相等。
 */
export function capabilityMatches(token: string | null | undefined, tool: string | null | undefined): boolean {
  const t = normalizeToolName(token);
  const target = normalizeToolName(tool);
  if (!t || !target) return false;
  if (t === WILDCARD_ALL) return true;
  if (t.endsWith('*')) {
    return target.startsWith(t.slice(0, -1));
  }
  return t === target;
}

/**
 * 工具是否被权威 `capabilities` 集合声明。
 *
 * **deny-by-default**:`capabilities` 为空 / 未配置 / 工具名为空 → 一律返回 `false`
 * (即拒绝),绝不静默放行。
 */
export function isToolDeclared(
  capabilities: string[] | null | undefined,
  tool: string | null | undefined,
): boolean {
  const target = normalizeToolName(tool);
  if (!target) return false;
  if (!Array.isArray(capabilities) || capabilities.length === 0) return false;
  return capabilities.some((cap) => capabilityMatches(cap, target));
}

/** 未声明工具被拒时携带的结构化原因(供执行层构造错误 / 审计)。 */
export interface CapabilityDenial {
  code: 'CAPABILITY_NOT_DECLARED';
  tool: string;
  message: string;
}

/** 一次工具调用门控评估结果。 */
export interface ToolCallEvaluation {
  /** 是否允许调用。 */
  allowed: boolean;
  /** 当 `allowed === false` 时携带的结构化拒绝原因。 */
  denial?: CapabilityDenial;
}

/**
 * 评估一次工具调用是否被允许。
 *
 * @returns `{ allowed: true }` 当工具被声明;否则 `{ allowed: false, denial }`
 *          带结构化拒绝原因。纯函数,不抛异常,由调用方决定如何呈现(抛 403 / 审计)。
 */
export function evaluateToolCall(
  capabilities: string[] | null | undefined,
  tool: string | null | undefined,
): ToolCallEvaluation {
  if (isToolDeclared(capabilities, tool)) {
    return { allowed: true };
  }
  const normalized = normalizeToolName(tool);
  return {
    allowed: false,
    denial: {
      code: 'CAPABILITY_NOT_DECLARED',
      tool: normalized,
      message: `工具「${normalized || '(空)'}」未在 Agent 能力声明(capabilities)中,已按「声明即门控」拒绝调用`,
    },
  };
}
