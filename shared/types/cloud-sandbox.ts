/**
 * 云端沙箱的旁观和接管 v0（L5 D3，backlog web 5；10-03）。
 *
 * - 云端沙箱是这只 Agent 的一个"身体"（E93 ③），服务商是 Daytona（`provider-adapters`）。主人能开、能删、能看到在里面
 *   跑过的每一条命令和输出（旁观），也能自己跑一条命令（接管）。
 * - 接管是远程执行：只认主人本人登录的凭据（不认客户端令牌、不认 Agent），每条都记下来；命令和输出只存在主人自己的记录里，
 *   输出最多存 8 KB。
 * - 每个主人同时最多 2 个沙箱（控制服务商额度）。没配服务商时如实说"未配置"。
 * - 开关 `CLOUD_SANDBOX_V0_ENABLED` 默认关（关着时路由一律 404）。
 */

export const CLOUD_SANDBOX_ROUTES_V0 = {
  list: 'GET /api/cloud-sandbox/sandboxes',
  create: 'POST /api/cloud-sandbox/sandboxes',
  runs: 'GET /api/cloud-sandbox/sandboxes/:sandboxRef/runs',
  takeover: 'POST /api/cloud-sandbox/sandboxes/:sandboxRef/runs',
  destroy: 'DELETE /api/cloud-sandbox/sandboxes/:sandboxRef',
} as const;

export const CLOUD_SANDBOX_MAX_ACTIVE_V0 = 2;
export const CLOUD_SANDBOX_COMMAND_MAX_V0 = 2000;
export const CLOUD_SANDBOX_OUTPUT_KEPT_V0 = 8 * 1024;
export const CLOUD_SANDBOX_REF_PATTERN_V0 = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const CLOUD_SANDBOX_RUN_REF_PATTERN_V0 = /^csr_[0-9a-f]{32}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface CloudSandboxViewV0 {
  sandboxRef: string;
  /** 这台沙箱属于哪只 Agent（外部编号）。 */
  agentId: string;
  provider: 'daytona';
  createdAt: string;
}

export interface CloudSandboxRunViewV0 {
  runRef: string;
  sandboxRef: string;
  /** 谁跑的：主人接管，或者 Agent（v0 只有主人）。 */
  actor: 'owner' | 'agent';
  command: string;
  outcome: 'ok' | 'failed';
  exitCode: number | null;
  output: string;
  /** 输出超过 8 KB 时只存前 8 KB。 */
  truncated: boolean;
  reasonCode: string | null;
  at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 服务端用：接管时要跑的命令。不能空、不能超长、不能有 NUL。 */
export function validateCloudSandboxCommandV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (key !== 'command') errors.push(`${key}: unexpected field`);
  const command = value.command;
  if (typeof command !== 'string' || command.trim().length === 0 || command.length > CLOUD_SANDBOX_COMMAND_MAX_V0 || command.includes('\u0000')) {
    errors.push(`command: 1..${CLOUD_SANDBOX_COMMAND_MAX_V0} characters, no NUL`);
  }
  return { valid: errors.length === 0, errors };
}

export function decodeCloudSandboxViewV0(value: unknown): CloudSandboxViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.sandboxRef !== 'string' || !CLOUD_SANDBOX_REF_PATTERN_V0.test(value.sandboxRef)) return null;
  if (typeof value.agentId !== 'string' || value.agentId.length === 0 || value.agentId.length > 120) return null;
  if (value.provider !== 'daytona' || typeof value.createdAt !== 'string' || !ISO.test(value.createdAt)) return null;
  return { sandboxRef: value.sandboxRef, agentId: value.agentId, provider: 'daytona', createdAt: value.createdAt };
}

export function decodeCloudSandboxRunViewV0(value: unknown): CloudSandboxRunViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.runRef !== 'string' || !CLOUD_SANDBOX_RUN_REF_PATTERN_V0.test(value.runRef)) return null;
  if (typeof value.sandboxRef !== 'string' || !CLOUD_SANDBOX_REF_PATTERN_V0.test(value.sandboxRef)) return null;
  if (value.actor !== 'owner' && value.actor !== 'agent') return null;
  if (typeof value.command !== 'string' || value.command.length > CLOUD_SANDBOX_COMMAND_MAX_V0) return null;
  if (value.outcome !== 'ok' && value.outcome !== 'failed') return null;
  if (value.exitCode !== null && !Number.isInteger(value.exitCode)) return null;
  if (typeof value.output !== 'string' || value.output.length > CLOUD_SANDBOX_OUTPUT_KEPT_V0 || typeof value.truncated !== 'boolean') return null;
  if (value.reasonCode !== null && (typeof value.reasonCode !== 'string' || value.reasonCode.length > 64)) return null;
  if (typeof value.at !== 'string' || !ISO.test(value.at)) return null;
  return {
    runRef: value.runRef,
    sandboxRef: value.sandboxRef,
    actor: value.actor,
    command: value.command,
    outcome: value.outcome,
    exitCode: value.exitCode as number | null,
    output: value.output,
    truncated: value.truncated,
    reasonCode: value.reasonCode as string | null,
    at: value.at,
  };
}
