import {
  claimDesktopCommand,
  completeDesktopCommand,
  fetchDesktopSyncState,
  fetchPendingDesktopCommands,
  syncDesktopHeartbeat,
  syncDesktopTask,
  type DesktopRemoteCommand,
} from "./desktopSync";
import {
  getActiveDesktopWindow,
  getDesktopContext,
  getDesktopDeviceId,
  listDesktopDirectory,
  listDesktopWindows,
  openDesktopBrowser,
  readDesktopFile,
  runDesktopCommand,
  writeDesktopFile,
} from "./desktop";
import {
  ApprovalRejectedError,
  attachApprovalResponseListener as attachSharedApprovalResponseListener,
  resetDesktopApprovals,
  settleApprovalRecords,
} from "./desktopApproval";
import { openDesktopActionGate, type DesktopActionGate } from "./desktopExecutionPort";
import { toWorkspaceRelativePath } from "./workspaceBackups";
import {
  classifyFenceCommand,
  FenceDeniedError,
  isBackendRemoteMutationDenied,
  noteBackendRemoteMutationState,
  requestDenial,
  shellTouchesSecrets,
} from "./executionFence";
import { getNonceLedger } from "./nonceLedger";
import type { ApprovalRiskLevel } from "./desktop";

// Desktop D0 — the approval flow now lives in desktopApproval.ts and is shared
// by all three side-effect channels. Re-exported for existing callers.
export { requireDesktopActionApproval } from "./desktopApproval";

const HEARTBEAT_MS = 30_000;
// E64: after login every poll is ≥ 30 s and pauses while this window is hidden.
// Socket pushes (`desktop-sync:command`, `desktop-sync:*`) still trigger an
// immediate poll, so these intervals are only the safety net.
export const STATE_POLL_MS = 30_000;
// v0.7.17 — was 2500ms which adds ~1.25s avg latency on top of every desktop
// tool. Socket relay already triggers immediate poll on `desktop-sync:command`,
// so this interval is purely the safety-net cadence; 800ms is fast enough that
// users barely notice when WebSocket relay is unavailable (e.g. captive portal)
// and not so frequent it hammers nginx.
export const COMMAND_POLL_MS = 30_000;
const COMMAND_EXECUTION_TIMEOUT_MS = 10 * 60_000;
// Commands whose claim backend refused (kill switch, conflict, expired). They
// stay `pending` server-side, so remember them to avoid re-claiming every poll.
const MAX_SKIPPED_COMMAND_IDS = 500;

let activeToken: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let stateTimer: ReturnType<typeof setInterval> | null = null;
let commandTimer: ReturnType<typeof setInterval> | null = null;
let commandInFlight = new Set<string>();
let skippedCommandIds = new Set<string>();
let socketListenerAttached = false;

function rememberSkippedCommand(commandId: string) {
  skippedCommandIds.add(commandId);
  if (skippedCommandIds.size > MAX_SKIPPED_COMMAND_IDS) {
    const oldest = skippedCommandIds.values().next().value;
    if (oldest !== undefined) skippedCommandIds.delete(oldest);
  }
}

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

function isAbsoluteDesktopPath(path: string) {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("~");
}

async function requireDesktopWorkspaceForRelativePath() {
  const { getWorkspaceDir } = await import("./workspace");
  const workspaceDir = await getWorkspaceDir();
  if (!workspaceDir) {
    throw new Error("No workspace selected. Choose a workspace folder in Settings before using relative desktop paths, or provide an absolute path.");
  }
  return workspaceDir;
}

async function resolveDesktopCommandPath(path: unknown, allowWorkspaceRoot = false) {
  const raw = String(path || "").trim().replace(/\\/g, "/");

  if (!raw || raw === ".") {
    if (!allowWorkspaceRoot) {
      throw new Error("path is required");
    }
    return requireDesktopWorkspaceForRelativePath();
  }

  if (isAbsoluteDesktopPath(raw)) {
    return raw;
  }

  const segments = raw.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("Relative desktop paths must stay inside the selected workspace.");
  }

  const workspaceDir = await requireDesktopWorkspaceForRelativePath();
  const separator = workspaceDir.includes("\\") ? "\\" : "/";
  return `${workspaceDir.replace(/[\\/]+$/g, "")}${separator}${segments.join(separator)}`;
}

async function resolveDesktopCommandWorkingDirectory(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return undefined;
  }
  return resolveDesktopCommandPath(raw, true);
}

async function readWorkspaceRootForFence(): Promise<string | null> {
  try {
    const { getWorkspaceDir } = await import("./workspace");
    return (await getWorkspaceDir()) || null;
  } catch {
    return null;
  }
}

function describeApproval(command: DesktopRemoteCommand) {
  const payload = payloadStrings(command.payload);

  if (command.kind === "write-file") {
    return `Allow Agentrix to write to this file?\n${payload.path || command.title}`;
  }

  if (command.kind === "run-command") {
    const lines = [
      ...(shellTouchesSecrets(payload.command)
        ? ["⚠️ 这条命令涉及密钥或凭证（.env、私钥、云凭证、环境变量），只能在这台电脑上确认。"]
        : []),
      "Allow Agentrix to run this desktop command?",
    ];
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

  // Computer Use approval prompts.
  if (command.kind === "computer-use-click") {
    const x = payload.x ?? "?";
    const y = payload.y ?? "?";
    return `Allow Agentrix to click ${payload.button || "left"} button at screen coordinates (${x}, ${y})?`;
  }
  if (command.kind === "computer-use-type") {
    const text = String(payload.text || "");
    return `Allow Agentrix to type ${text.length} characters into the focused window?\n\n${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`;
  }
  if (command.kind === "computer-use-key") {
    return `Allow Agentrix to send key combo '${payload.combo || command.title}'?`;
  }
  if (command.kind === "computer-use-browser-navigate") {
    return `Allow Agentrix to open this URL in its controlled Chrome window?\n${payload.url || command.title}`;
  }
  if (command.kind === "computer-use-browser-eval") {
    return `Allow Agentrix to run this JavaScript in the controlled Chrome tab?\n${(payload.expression || "").slice(0, 400)}`;
  }
  if (command.kind === "computer-use-browser-click-selector") {
    return `Allow Agentrix to click \`${payload.selector || "(unknown selector)"}\` in the controlled Chrome tab?`;
  }

  return command.title;
}

async function refreshState() {
  if (!activeToken) return;
  try {
    const state = await fetchDesktopSyncState(activeToken);
    // Backend read-back. L3 waiters ignore approvals from here (they need a
    // local confirmation); rejections from any device still apply.
    settleApprovalRecords(Array.isArray(state.approvals) ? state.approvals : [], "backend");
    dispatchDesktopState(state);
  } catch {
    // Ignore sync refresh failures until the next poll or socket event.
  }
}

async function executeRemoteCommand(command: DesktopRemoteCommand) {
  const token = activeToken;
  if (!token || commandInFlight.has(command.commandId) || skippedCommandIds.has(command.commandId)) return;
  commandInFlight.add(command.commandId);

  // P-2 (Sprint 2026-05-21) — Computer Use form trigger.
  // Any computer-use-* command flips the pet to "computer-use" form
  // (cu-mouse sprite + cursor follow). Desktop D0: only after the fence and
  // approval pass, so a refused command never animates the pet.
  const isComputerUseCommand = command.kind.startsWith("computer-use");
  let cuActiveDispatched = false;
  let claimed = false;
  let gate: DesktopActionGate | null = null;

  const startedAt = Date.now();
  let timelineBase: {
    id: string;
    title: string;
    detail?: string;
    kind: string;
    riskLevel: ApprovalRiskLevel;
  } = {
    id: command.commandId,
    title: command.title,
    detail: typeof command.payload?.path === "string"
      ? command.payload.path
      : typeof command.payload?.command === "string"
        ? command.payload.command
        : undefined,
    kind: command.kind,
    riskLevel: "L3",
  };

  try {
    // 1. Claim. Backend enforces the remote-mutation kill switch
    //    (AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED), binding, expiry and CAS
    //    here. Anything short of an explicit success means: do not execute.
    const claim = await claimDesktopCommand(token, command.commandId);
    if (!claim.ok) {
      if (isBackendRemoteMutationDenied(claim.body)) {
        noteBackendRemoteMutationState("disabled");
      }
      rememberSkippedCommand(command.commandId);
      dispatchDesktopCommand({ ...command, status: "skipped", error: `claim_refused:${claim.status}` });
      return;
    }
    claimed = true;
    // Desktop D2 — a command id executes at most once on this device, even if
    // backend (or anything pretending to be it) hands it out again.
    const commandExpiresAt = Date.parse(String((claim.command as { expiresAt?: unknown } | undefined)?.expiresAt ?? ""));
    if (!getNonceLedger().consume(`agent-sync:${getDesktopDeviceId()}`, command.commandId, Number.isFinite(commandExpiresAt) ? commandExpiresAt : undefined)) {
      // Do not complete / overwrite the first execution's record.
      claimed = false;
      rememberSkippedCommand(command.commandId);
      throw requestDenial("agent-sync", command.kind, "replayed_request");
    }
    if (classifyFenceCommand("agent-sync", command.kind) === "mutating") {
      noteBackendRemoteMutationState("enabled");
    }

    // 2. Local fence + the shared approval path.
    gate = openDesktopActionGate(
      {
        source: "agent-sync",
        command: command.kind,
        payload: command.payload,
        payloadRef: command.payloadRef,
        workspaceRoot: await readWorkspaceRootForFence(),
      },
      {
        token,
        sessionId: command.sessionId,
        taskId: command.commandId,
        timelineEntryId: command.commandId,
        title: command.title,
        description: describeApproval(command),
        requestRef: command.commandId,
      },
    );
    timelineBase = { ...timelineBase, riskLevel: gate.decision.riskLevel };
    if (gate.decision.approval !== "none") {
      await syncDesktopTask(token, {
        taskId: command.commandId,
        title: command.title,
        summary: `Remote ${command.kind}`,
        sessionId: command.sessionId,
        status: "need-approve",
        startedAt,
        timeline: [{ ...timelineBase, status: "waiting-approval", startedAt }],
      });
    }
    await gate.approve();

    if (isComputerUseCommand && typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("agentrix:cu-active", { detail: { active: true } }),
        );
        cuActiveDispatched = true;
      } catch { /* SSR / non-window guard */ }
    }

    await syncDesktopTask(token, {
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
      case "world-creation-task": {
        // World Creation (v6) — a Tier_C creation task dispatched off Mobile.
        // Open the Tier_C creator for the Plot; App.tsx listens for this event.
        const wcPlotId = typeof command.payload?.plotId === "string" ? command.payload.plotId : "";
        const wcTaskId =
          typeof command.payload?.taskId === "string" ? command.payload.taskId : command.commandId;
        if (typeof window !== "undefined" && wcPlotId) {
          window.dispatchEvent(
            new CustomEvent("agentrix:open-world-creator", {
              detail: { plotId: wcPlotId, taskId: wcTaskId },
            }),
          );
        }
        result = { opened: Boolean(wcPlotId), plotId: wcPlotId, taskId: wcTaskId };
        break;
      }
      case "active-window":
        result = { activeWindow: await getActiveDesktopWindow() };
        break;
      case "list-windows":
        result = { windows: await listDesktopWindows() };
        break;
      case "list-directory": {
        const resolvedPath = await resolveDesktopCommandPath(payload.path, true);
        result = { directory: await listDesktopDirectory(resolvedPath) };
        break;
      }
      case "run-command": {
        const workingDirectory = await resolveDesktopCommandWorkingDirectory(payload.workingDirectory);
        result = await runDesktopCommand(
          String(payload.command || ""),
          workingDirectory,
          typeof payload.timeoutMs === "number" ? payload.timeoutMs : COMMAND_EXECUTION_TIMEOUT_MS,
        ) as unknown as Record<string, unknown>;
        break;
      }
      case "read-file": {
        const resolvedPath = await resolveDesktopCommandPath(payload.path);
        result = await readDesktopFile(
          resolvedPath,
          typeof payload.startLine === "number" ? payload.startLine : undefined,
          typeof payload.endLine === "number" ? payload.endLine : undefined,
        ) as unknown as Record<string, unknown>;
        break;
      }
      case "write-file": {
        const resolvedPath = await resolveDesktopCommandPath(payload.path);
        // Desktop D3 — snapshot before the write (the fence only admits
        // paths inside the selected workspace for remote commands).
        const workspaceRoot = await readWorkspaceRootForFence();
        const relativePath = toWorkspaceRelativePath(resolvedPath, workspaceRoot);
        if (relativePath) {
          const { createWorkspaceFileBackup } = await import("./workspaceBackups");
          await createWorkspaceFileBackup(relativePath, String(payload.content || ""));
        }
        result = await writeDesktopFile(
          resolvedPath,
          String(payload.content || ""),
        ) as unknown as Record<string, unknown>;
        break;
      }
      case "open-browser":
        result = { opened: await openDesktopBrowser(String(payload.url || "")) };
        break;
      // ── Computer Use (Phase B) — invoke Tauri commands directly ──────────
      case "computer-use-screenshot": {
        const { invokeDesktopCommand } = await import("./desktop");
        const screenshot = await invokeDesktopCommand<{
          png_base64: string;
          width: number;
          height: number;
          monitor_index: number;
        }>("computer_use_screenshot", {
          monitorIndex: typeof payload.monitorIndex === "number" ? payload.monitorIndex : undefined,
          region: Array.isArray(payload.region) ? payload.region : undefined,
          maxSize: typeof payload.maxSize === "number" ? payload.maxSize : 1024,
        });

        // Convert PNG to JPEG (quality 65%) to reduce payload size.
        // A 1024px PNG screenshot is ~200-400KB base64; JPEG brings it to ~30-60KB,
        // safely under WebView2 fetch body limits.
        let finalDataUrl = `data:image/png;base64,${screenshot.png_base64}`;
        try {
          const img = new Image();
          const loadPromise = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("img decode failed"));
          });
          img.src = finalDataUrl;
          await loadPromise;
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            finalDataUrl = canvas.toDataURL("image/jpeg", 0.65);
          }
        } catch {
          // If JPEG conversion fails, fall back to original PNG
        }

        result = {
          width: screenshot.width,
          height: screenshot.height,
          monitor_index: screenshot.monitor_index,
          image_data_url: finalDataUrl,
        };
        break;
      }
      case "computer-use-click": {
        const { invokeDesktopCommand } = await import("./desktop");
        await invokeDesktopCommand<void>("computer_use_click", {
          x: Number(payload.x),
          y: Number(payload.y),
          button: payload.button,
          double: payload.double,
        });
        result = { success: true };
        break;
      }
      case "computer-use-move": {
        const { invokeDesktopCommand } = await import("./desktop");
        await invokeDesktopCommand<void>("computer_use_move", {
          x: Number(payload.x),
          y: Number(payload.y),
        });
        result = { success: true };
        break;
      }
      case "computer-use-type": {
        const { invokeDesktopCommand } = await import("./desktop");
        await invokeDesktopCommand<void>("computer_use_type", {
          text: String(payload.text || ""),
        });
        result = { success: true };
        break;
      }
      case "computer-use-key": {
        const { invokeDesktopCommand } = await import("./desktop");
        await invokeDesktopCommand<void>("computer_use_key", {
          combo: String(payload.combo || ""),
        });
        result = { success: true };
        break;
      }
      case "computer-use-window-tree": {
        const { invokeDesktopCommand } = await import("./desktop");
        const windows = await invokeDesktopCommand<unknown[]>("computer_use_window_tree");
        result = { windows };
        break;
      }
      case "computer-use-browser-navigate": {
        const { invokeDesktopCommand } = await import("./desktop");
        const url = String(payload.url || "").trim();
        if (!/^https?:\/\//i.test(url)) {
          throw new Error("url must be http(s)");
        }
        const tab = await invokeDesktopCommand<{ id: string; title: string; url: string }>(
          "computer_use_browser_navigate",
          { url },
        );
        result = { success: true, tab };
        break;
      }
      case "computer-use-browser-list-tabs": {
        const { invokeDesktopCommand } = await import("./desktop");
        const tabs = await invokeDesktopCommand<unknown[]>("computer_use_browser_list_tabs");
        result = { tabs };
        break;
      }
      case "computer-use-browser-eval": {
        const { invokeDesktopCommand } = await import("./desktop");
        const expression = String(payload.expression || "").trim();
        if (!expression) {
          throw new Error("expression is required");
        }
        const evalResult = await invokeDesktopCommand<{ value: string; type: string; thrown: boolean }>(
          "computer_use_browser_eval",
          {
            target_id: payload.targetId ? String(payload.targetId) : undefined,
            expression,
          },
        );
        result = evalResult as unknown as Record<string, unknown>;
        break;
      }
      case "computer-use-browser-click-selector": {
        const { invokeDesktopCommand } = await import("./desktop");
        const selector = String(payload.selector || "").trim();
        if (!selector) {
          throw new Error("selector is required");
        }
        await invokeDesktopCommand<void>("computer_use_browser_click_selector", {
          target_id: payload.targetId ? String(payload.targetId) : undefined,
          selector,
        });
        result = { success: true };
        break;
      }
      // ── Git tools ────────────────────────────────────────────────────────
      case "git-status": {
        const { gitStatus } = await import("./git");
        result = await gitStatus() as unknown as Record<string, unknown>;
        break;
      }
      case "git-diff": {
        const { gitDiff } = await import("./git");
        const diff = await gitDiff(Boolean(payload.staged), payload.filePath ? String(payload.filePath) : undefined);
        result = { diff };
        break;
      }
      case "git-log": {
        const { gitLog } = await import("./git");
        const entries = await gitLog(typeof payload.count === "number" ? payload.count : 10);
        result = { entries } as unknown as Record<string, unknown>;
        break;
      }
      case "git-commit": {
        const { gitCommit } = await import("./git");
        result = await gitCommit(String(payload.message || ""), payload.addAll !== false) as unknown as Record<string, unknown>;
        break;
      }
      case "git-push": {
        const { gitPush } = await import("./git");
        result = await gitPush(
          payload.remote ? String(payload.remote) : undefined,
          payload.branch ? String(payload.branch) : undefined,
          Boolean(payload.setUpstream),
        ) as unknown as Record<string, unknown>;
        break;
      }
      case "git-pull": {
        const { gitPull } = await import("./git");
        result = await gitPull(
          payload.remote ? String(payload.remote) : undefined,
          payload.branch ? String(payload.branch) : undefined,
          Boolean(payload.rebase),
        ) as unknown as Record<string, unknown>;
        break;
      }
      case "git-checkout": {
        const { gitCheckout } = await import("./git");
        result = await gitCheckout(String(payload.branch || ""), Boolean(payload.create)) as unknown as Record<string, unknown>;
        break;
      }
      default:
        throw new Error(`Unsupported desktop command: ${command.kind}`);
    }

    gate.settle("completed");
    await completeDesktopCommand(token, command.commandId, {
      status: "completed",
      result,
    });
    await syncDesktopTask(token, {
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
    const rejected = error instanceof ApprovalRejectedError || error instanceof FenceDeniedError;
    gate?.settle("failed", message);
    // Only the claimant may complete a command (backend: claimant-only).
    if (activeToken && claimed) {
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
    if (isComputerUseCommand && cuActiveDispatched && typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("agentrix:cu-active", { detail: { active: false } }),
        );
      } catch { /* SSR / non-window guard */ }
    }
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

function attachApprovalResponseListener() {
  attachSharedApprovalResponseListener(() => {
    void refreshState();
  });
}

function attachSocketListener() {
  if (socketListenerAttached) return;
  socketListenerAttached = true;
  attachApprovalResponseListener();
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
}

function pageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true;
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
      if (pageHidden()) return;
      void refreshState();
    }, STATE_POLL_MS);
  }

  if (!commandTimer) {
    commandTimer = setInterval(() => {
      if (pageHidden()) return;
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
  skippedCommandIds = new Set<string>();
  resetDesktopApprovals("Desktop sync stopped");
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