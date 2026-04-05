import {
  claimDesktopCommand,
  completeDesktopCommand,
  createDesktopApproval,
  fetchDesktopSyncState,
  fetchPendingDesktopCommands,
  syncDesktopHeartbeat,
  syncDesktopTask,
  type DesktopRemoteApproval,
  type DesktopRemoteCommand,
} from "./desktopSync";
import {
  buildDesktopApprovalSessionKey,
  classifyDesktopRisk,
  getActiveDesktopWindow,
  getDesktopContext,
  getDesktopDeviceId,
  listDesktopDirectory,
  listDesktopWindows,
  openDesktopBrowser,
  readDesktopFile,
  runDesktopCommand,
  shouldRequireApproval,
  writeDesktopFile,
} from "./desktop";

const HEARTBEAT_MS = 15_000;
const STATE_POLL_MS = 5_000;
const COMMAND_POLL_MS = 3_000;
const COMMAND_EXECUTION_TIMEOUT_MS = 10 * 60_000;
const APPROVAL_WAIT_MS = 15 * 60_000;

let activeToken: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let stateTimer: ReturnType<typeof setInterval> | null = null;
let commandTimer: ReturnType<typeof setInterval> | null = null;
let commandInFlight = new Set<string>();
let rememberedApprovalSessionKeys = new Set<string>();
let approvalWaiters = new Map<
  string,
  {
    resolve: (approval: DesktopRemoteApproval) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();
let socketListenerAttached = false;

class ApprovalRejectedError extends Error {}
class ApprovalTimedOutError extends Error {}

function dispatchDesktopState(detail: unknown) {
  window.dispatchEvent(new CustomEvent("agentrix:desktop-sync-state", { detail }));
}

function dispatchDesktopCommand(detail: unknown) {
  window.dispatchEvent(new CustomEvent("agentrix:desktop-command-updated", { detail }));
}

function payloadStrings(payload?: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    }
  }
  return result;
}

function getCommandRiskLevel(command: DesktopRemoteCommand) {
  return classifyDesktopRisk(command.kind, payloadStrings(command.payload));
}

function describeApproval(command: DesktopRemoteCommand) {
  const payload = payloadStrings(command.payload);

  if (command.kind === "write-file") {
    return `Allow Agentrix to write to this file?\n${payload.path || command.title}`;
  }

  if (command.kind === "run-command") {
    const lines = ["Allow Agentrix to run this desktop command?"];
    if (payload.command) {
      lines.push(payload.command);
    }
    if (payload.workingDirectory) {
      lines.push(`Working directory: ${payload.workingDirectory}`);
    }
    return lines.join("\n");
  }

  if (command.kind === "open-browser") {
    return `Allow Agentrix to open this URL?\n${payload.url || command.title}`;
  }

  return command.title;
}

function settleApprovalRecord(approval: DesktopRemoteApproval) {
  if (approval.status === "approved" && approval.rememberForSession && approval.sessionKey) {
    rememberedApprovalSessionKeys.add(approval.sessionKey);
  }

  if (approval.status === "pending") {
    return;
  }

  const waiter = approvalWaiters.get(approval.approvalId);
  if (!waiter) {
    return;
  }

  clearTimeout(waiter.timeoutId);
  approvalWaiters.delete(approval.approvalId);

  if (approval.status === "approved") {
    waiter.resolve(approval);
    return;
  }

  waiter.reject(new ApprovalRejectedError("Command was rejected by the user"));
}

function settleApprovalRecords(approvals: DesktopRemoteApproval[]) {
  approvals.forEach(settleApprovalRecord);
}

function waitForApproval(approvalId: string) {
  return new Promise<DesktopRemoteApproval>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      approvalWaiters.delete(approvalId);
      reject(new ApprovalTimedOutError("Approval timed out"));
    }, APPROVAL_WAIT_MS);

    approvalWaiters.set(approvalId, { resolve, reject, timeoutId });
  });
}

async function requireApprovalIfNeeded(
  command: DesktopRemoteCommand,
  startedAt: number,
  timelineBase: {
    id: string;
    title: string;
    detail?: string;
    kind: string;
    riskLevel: "L0" | "L1" | "L2" | "L3";
  },
) {
  if (!activeToken) {
    return;
  }

  const payload = payloadStrings(command.payload);
  const riskLevel = classifyDesktopRisk(command.kind, payload);
  const sessionKey = buildDesktopApprovalSessionKey(command.kind, payload);
  const sessionApproved = Boolean(sessionKey && rememberedApprovalSessionKeys.has(sessionKey));

  if (!shouldRequireApproval(riskLevel, sessionApproved)) {
    return;
  }

  const { approval } = await createDesktopApproval(activeToken, {
    taskId: command.commandId,
    timelineEntryId: command.commandId,
    title: command.title,
    description: describeApproval(command),
    riskLevel,
    sessionKey,
  });

  const approvalPromise = waitForApproval(approval.approvalId);

  window.dispatchEvent(new CustomEvent("agentrix:approval-new", { detail: approval }));

  await syncDesktopTask(activeToken, {
    taskId: command.commandId,
    title: command.title,
    summary: `Remote ${command.kind}`,
    sessionId: command.sessionId,
    status: "need-approve",
    startedAt,
    timeline: [{ ...timelineBase, status: "waiting-approval", startedAt }],
  });

  const resolvedApproval = await approvalPromise;
  if (resolvedApproval.rememberForSession && resolvedApproval.sessionKey) {
    rememberedApprovalSessionKeys.add(resolvedApproval.sessionKey);
  }
}

async function refreshState() {
  if (!activeToken) return;
  try {
    const state = await fetchDesktopSyncState(activeToken);
    settleApprovalRecords(Array.isArray(state.approvals) ? state.approvals : []);
    dispatchDesktopState(state);
  } catch {
    // Ignore sync refresh failures until the next poll or socket event.
  }
}

async function executeRemoteCommand(command: DesktopRemoteCommand) {
  if (!activeToken || commandInFlight.has(command.commandId)) return;
  commandInFlight.add(command.commandId);

  const startedAt = Date.now();
  const timelineBase = {
    id: command.commandId,
    title: command.title,
    detail: typeof command.payload?.path === "string"
      ? command.payload.path
      : typeof command.payload?.command === "string"
        ? command.payload.command
        : undefined,
    kind: command.kind,
    riskLevel: command.kind === "run-command" ? "L2" : command.kind === "write-file" ? "L1" : "L0",
  } as const;

  try {
    await claimDesktopCommand(activeToken, command.commandId);
    await requireApprovalIfNeeded(command, startedAt, timelineBase);
    await syncDesktopTask(activeToken, {
      taskId: command.commandId,
      title: command.title,
      summary: `Remote ${command.kind}`,
      sessionId: command.sessionId,
      status: "executing",
      startedAt,
      timeline: [{ ...timelineBase, status: "running", startedAt }],
    });

    const payload = command.payload || {};
    let result: Record<string, unknown>;

    switch (command.kind) {
      case "context":
        result = { context: await getDesktopContext() };
        break;
      case "active-window":
        result = { activeWindow: await getActiveDesktopWindow() };
        break;
      case "list-windows":
        result = { windows: await listDesktopWindows() };
        break;
      case "list-directory":
        result = { directory: await listDesktopDirectory(String(payload.path || "")) };
        break;
      case "run-command":
        result = await runDesktopCommand(
          String(payload.command || ""),
          typeof payload.workingDirectory === "string" ? payload.workingDirectory : undefined,
          typeof payload.timeoutMs === "number" ? payload.timeoutMs : COMMAND_EXECUTION_TIMEOUT_MS,
        ) as unknown as Record<string, unknown>;
        break;
      case "read-file":
        result = await readDesktopFile(
          String(payload.path || ""),
          typeof payload.startLine === "number" ? payload.startLine : undefined,
          typeof payload.endLine === "number" ? payload.endLine : undefined,
        ) as unknown as Record<string, unknown>;
        break;
      case "write-file":
        result = await writeDesktopFile(
          String(payload.path || ""),
          String(payload.content || ""),
        ) as unknown as Record<string, unknown>;
        break;
      case "open-browser":
        result = { opened: await openDesktopBrowser(String(payload.url || "")) };
        break;
      default:
        throw new Error(`Unsupported desktop command: ${command.kind}`);
    }

    await completeDesktopCommand(activeToken, command.commandId, {
      status: "completed",
      result,
    });
    await syncDesktopTask(activeToken, {
      taskId: command.commandId,
      title: command.title,
      summary: `Remote ${command.kind}`,
      sessionId: command.sessionId,
      status: "completed",
      startedAt,
      finishedAt: Date.now(),
      timeline: [{ ...timelineBase, status: "completed", startedAt, finishedAt: Date.now() }],
    });
    dispatchDesktopCommand({ ...command, status: "completed", result });
  } catch (error: any) {
    const message = error?.message || String(error);
    const rejected = error instanceof ApprovalRejectedError;
    if (activeToken) {
      await completeDesktopCommand(activeToken, command.commandId, {
        status: rejected ? "rejected" : "failed",
        error: message,
      }).catch(() => {});
      await syncDesktopTask(activeToken, {
        taskId: command.commandId,
        title: command.title,
        summary: `Remote ${command.kind}`,
        sessionId: command.sessionId,
        status: "failed",
        startedAt,
        finishedAt: Date.now(),
        timeline: [{
          ...timelineBase,
          status: rejected ? "rejected" : "failed",
          startedAt,
          finishedAt: Date.now(),
          output: message,
        }],
      }).catch(() => {});
    }
    dispatchDesktopCommand({ ...command, status: rejected ? "rejected" : "failed", error: message });
  } finally {
    commandInFlight.delete(command.commandId);
    void refreshState();
  }
}

async function pollCommands() {
  if (!activeToken) return;
  try {
    const { commands } = await fetchPendingDesktopCommands(activeToken, getDesktopDeviceId());
    for (const command of commands) {
      void executeRemoteCommand(command);
    }
  } catch {
    // Ignore polling failures until the next interval.
  }
}

async function heartbeat() {
  if (!activeToken) return;
  try {
    await syncDesktopHeartbeat(activeToken);
  } catch {
    // Ignore transient heartbeat failures.
  }
}

function attachSocketListener() {
  if (socketListenerAttached) return;
  socketListenerAttached = true;
  window.addEventListener("agentrix:socket-event", ((event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    if (detail.event === "desktop-sync:command") {
      void pollCommands();
    }
    if (
      detail.event === "desktop-sync:command-updated" ||
      detail.event === "desktop-sync:task" ||
      detail.event === "desktop-sync:approval" ||
      detail.event === "desktop-sync:approval-response" ||
      detail.event === "desktop-sync:presence"
    ) {
      void refreshState();
    }
  }) as EventListener);

  window.addEventListener("agentrix:approval-response-local", ((event: Event) => {
    const approval = (event as CustomEvent).detail as DesktopRemoteApproval | undefined;
    if (!approval) {
      return;
    }
    settleApprovalRecord(approval);
    void refreshState();
  }) as EventListener);
}

export function startDesktopAgentSync(token: string) {
  activeToken = token;
  attachSocketListener();

  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);
  }

  if (!stateTimer) {
    stateTimer = setInterval(() => {
      void refreshState();
    }, STATE_POLL_MS);
  }

  if (!commandTimer) {
    commandTimer = setInterval(() => {
      void pollCommands();
    }, COMMAND_POLL_MS);
  }

  void heartbeat();
  void refreshState();
  void pollCommands();
}

export function stopDesktopAgentSync() {
  activeToken = null;
  commandInFlight = new Set<string>();
  rememberedApprovalSessionKeys = new Set<string>();
  for (const waiter of approvalWaiters.values()) {
    clearTimeout(waiter.timeoutId);
    waiter.reject(new Error("Desktop sync stopped"));
  }
  approvalWaiters.clear();
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (stateTimer) {
    clearInterval(stateTimer);
    stateTimer = null;
  }
  if (commandTimer) {
    clearInterval(commandTimer);
    commandTimer = null;
  }
}