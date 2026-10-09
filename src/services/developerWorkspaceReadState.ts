export const DEVELOPER_WORKSPACE_READ_STATES = [
  "ready",
  "partial",
  "offline_stale",
  "unavailable",
  "unknown",
  "unauthorized",
  "unsupported",
  "error",
] as const;

export type DeveloperWorkspaceReadStateKind =
  (typeof DEVELOPER_WORKSPACE_READ_STATES)[number];

export type DeveloperWorkspaceReadState<T = unknown> =
  | {
      kind: "ready";
      data: T;
      capturedAt: string;
      source: "fixture" | "api";
      defaultOff: boolean;
    }
  | {
      kind: "partial";
      data: Partial<T>;
      missing: readonly string[];
      capturedAt: string;
      source: "fixture" | "api";
      defaultOff: boolean;
    }
  | {
      kind: "offline_stale";
      data?: Partial<T>;
      capturedAt: string;
      reason: string;
      source: "fixture" | "api";
    }
  | { kind: "unavailable"; capability: string; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "unauthorized"; reason: string }
  | { kind: "unsupported"; capability: string; reason: string }
  | { kind: "error"; reason: string; retryable: boolean };

export function developerWorkspaceStateCopy(
  state: DeveloperWorkspaceReadState,
  zh: boolean,
): { title: string; detail: string } {
  switch (state.kind) {
    case "ready":
      return {
        title: zh ? "只读投影已就绪" : "Read-only projection ready",
        detail:
          state.source === "fixture"
            ? zh
              ? "本地 contract fixture · default-off · 不是 live 成功。"
              : "Local contract fixture · default-off · not live success."
            : zh
              ? "已通过 strict validator。"
              : "Passed the strict validator.",
      };
    case "partial":
      return {
        title: zh ? "部分数据可用" : "Partial data",
        detail: state.missing.join(", "),
      };
    case "offline_stale":
      return {
        title: zh ? "离线 · 显示旧数据" : "Offline · showing stale data",
        detail: state.reason,
      };
    case "unavailable":
      return {
        title: zh ? "此能力当前不可用" : "Capability unavailable",
        detail: `${state.capability}: ${state.reason}`,
      };
    case "unknown":
      return {
        title: zh ? "状态尚未确认" : "Status not confirmed",
        detail: state.reason,
      };
    case "unauthorized":
      if (state.reason === "developer_not_found") {
        return {
          title: zh ? "资源不存在或无权访问" : "Not found",
          detail: zh
            ? "对象不存在，或当前身份无权访问。"
            : "The object does not exist or this identity cannot access it.",
        };
      }
      return {
        title: zh
          ? "需要登录或 Agent 不匹配"
          : "Authorization or Agent mismatch",
        detail: state.reason,
      };
    case "unsupported":
      return {
        title: zh ? "适配器未发布" : "Adapter unpublished",
        detail: `${state.capability}: ${state.reason}`,
      };
    case "error":
      return {
        title: zh ? "读取失败" : "Read failed",
        detail: state.reason,
      };
    default: {
      const _exhaustive: never = state;
      return {
        title: zh ? "未知状态" : "Unknown state",
        detail: String(_exhaustive),
      };
    }
  }
}

export type DeveloperAgentRouteMismatch = Extract<
  DeveloperWorkspaceReadState<never>,
  { kind: "unknown" | "unavailable" | "unauthorized" }
>;

export function assertAgentRouteMatch(
  routeAgentId: string | undefined,
  recordAgentId: string | undefined,
): DeveloperAgentRouteMismatch | null {
  if (typeof routeAgentId !== "string" || routeAgentId.length === 0) {
    return { kind: "unknown", reason: "agent_route_unresolved" };
  }
  if (typeof recordAgentId !== "string" || recordAgentId.length === 0) {
    return {
      kind: "unavailable",
      capability: "developer.agent_scope_v1",
      reason: "record_agent_missing",
    };
  }
  if (routeAgentId !== recordAgentId) {
    return { kind: "unauthorized", reason: "cross_agent_route_mismatch" };
  }
  return null;
}
