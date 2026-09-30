/**
 * remoteControl.ts — Desktop receiver for mobile→backend→desktop remote control.
 *
 * Mobile (PetDetailSheet 跨端 / RemoteControlPanel) emits `remote-control:execute`
 * to the backend `/remote-control` namespace; the backend forwards
 * `remote-control:run` to room `device:<targetDeviceId>`. The mobile targets the
 * user's OpenClaw **instance id**, so the desktop MUST join `device:<activeInstanceId>`
 * (NOT the localStorage desktop device id) or the command never arrives.
 *
 * On `remote-control:run` we map the 4 whitelisted desktop commands to existing
 * desktop primitives and emit `remote-control:ack` back so the mobile's 5s ack
 * timeout resolves with a real result (fixing the "对方设备未响应" dead-end).
 *
 * Commands:
 *   desktop.computer-use.start  → set CU-enabled flag on + cu-active event
 *   desktop.computer-use.stop   → set CU-enabled flag off + cu-active(false)
 *   desktop.pro-mode.toggle     → open Pro chat panel (app-mode pro-mode)
 *   desktop.aira-work-mode.start→ open Pro panel in living-agent work mode
 */
import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./store";
import { openDesktopActionGate } from "./desktopExecutionPort";
import {
  COMPUTER_USE_ENABLED_KEY,
  evaluateFence,
  FenceDeniedError,
  requestDenial,
} from "./executionFence";
import { getNonceLedger } from "./nonceLedger";

const WS_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

// Mirror shared/types/remote-control.ts (kept local to avoid RN/desktop path coupling).
const EVENTS = {
  RUN: "remote-control:run",
  ACK: "remote-control:ack",
} as const;

export interface RunPayload {
  requestId: string;
  command: string;
  args?: Record<string, unknown>;
  requestedBy?: string;
  executeMode?: "execute" | "notify-only";
}

let _socket: Socket | null = null;
let _token: string | null = null;
let _deviceId: string | null = null;

/**
 * Connect the desktop as `device:<instanceId>`. Call after auth with the
 * active OpenClaw instance id (the id mobile targets). Re-call on instance change.
 */
export function initRemoteControl(token: string, instanceId: string): void {
  if (!token || !instanceId) return;
  if (_socket && _token === token && _deviceId === instanceId && _socket.connected) return;
  destroyRemoteControl();
  _token = token;
  _deviceId = instanceId;

  _socket = io(`${WS_ORIGIN}/remote-control`, {
    auth: { token, deviceId: instanceId },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30000,
  });

  _socket.on("connect", () => {
    // eslint-disable-next-line no-console
    console.log(`[remote-control] desktop joined device:${instanceId}`);
  });

  _socket.on(EVENTS.RUN, async (payload: RunPayload) => {
    const startedAt = Date.now();
    let success = false;
    let message = "";
    try {
      message = await handleCommand(payload);
      success = true;
    } catch (err) {
      message = (err as Error).message || "command failed";
      success = false;
    }
    _socket?.emit(EVENTS.ACK, {
      requestId: payload.requestId,
      targetDeviceId: instanceId,
      command: payload.command,
      success,
      message,
      durationMs: Date.now() - startedAt,
    });
  });
}

export function destroyRemoteControl(): void {
  if (_socket) {
    try {
      _socket.disconnect();
    } catch {
      /* ignore */
    }
    _socket = null;
  }
  _token = null;
  _deviceId = null;
}

/**
 * Map a whitelisted command to desktop primitives. Returns a human message.
 *
 * Desktop D0: every command passes the shared execution fence first
 * (unknown → deny; kill switch → only stop; remote mutation needs the local
 * "允许远程改动" switch; starting Computer Use needs a confirmation on this
 * computer). Exported for tests.
 */
export async function handleCommand(payload: RunPayload): Promise<string> {
  const request = {
    source: "remote-control" as const,
    command: typeof payload?.command === "string" ? payload.command : "",
    payload: payload?.args,
  };

  // Desktop D2 — replay protection: every requestId is single-use for this
  // device, even when the command is later refused.
  const requestId = typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
  if (!requestId) {
    throw requestDenial("remote-control", request.command, "missing_request_id");
  }
  if (!getNonceLedger().consume(`remote-control:${_deviceId || "unbound"}`, requestId)) {
    throw requestDenial("remote-control", request.command, "replayed_request");
  }

  // notify-only (night mode): nothing executes, so only reject unknown commands.
  if (payload?.executeMode === "notify-only") {
    const decision = evaluateFence(request);
    if (decision.effect === "unknown") {
      throw new FenceDeniedError(decision);
    }
    window.dispatchEvent(
      new CustomEvent("agentrix:remote-notify", {
        detail: { command: payload.command, requestedBy: payload.requestedBy },
      }),
    );
    return "已记录为通知,稍后由你确认";
  }

  const gate = openDesktopActionGate(request, {
    token: _token,
    taskId: `remote-control-${requestId}`,
    requestRef: requestId,
    title: `手机请求：${payload.command}`,
    description: describeRemoteCommand(payload),
  });
  await gate.approve();

  try {
    const message = await runRemoteCommand(payload);
    gate.settle("completed");
    return message;
  } catch (error) {
    gate.settle("failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function runRemoteCommand(payload: RunPayload): Promise<string> {
  switch (payload.command) {
    case "desktop.computer-use.start": {
      try {
        localStorage.setItem(COMPUTER_USE_ENABLED_KEY, "1");
      } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("agentrix:computer-use-changed", { detail: { enabled: true } }));
      window.dispatchEvent(new CustomEvent("agentrix:cu-active", { detail: { active: true } }));
      // Bring the Pro panel up so the user can see the agent working.
      await openProPanel(false).catch(() => {});
      return "已启动 Computer Use";
    }
    case "desktop.computer-use.stop": {
      try {
        localStorage.setItem(COMPUTER_USE_ENABLED_KEY, "0");
      } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("agentrix:computer-use-changed", { detail: { enabled: false } }));
      window.dispatchEvent(new CustomEvent("agentrix:cu-active", { detail: { active: false } }));
      return "已停止 Computer Use";
    }
    case "desktop.pro-mode.toggle": {
      await openProPanel(true);
      return "已打开 Pro 模式面板";
    }
    case "desktop.aira-work-mode.start": {
      window.dispatchEvent(new CustomEvent("agentrix:app-mode-changed", { detail: { mode: "living-agent" } }));
      await openProPanel(true);
      return "已进入 Aira 工作模式";
    }
    default:
      // Unreachable: the fence only admits registered commands.
      throw new Error(`不支持的命令: ${payload.command}`);
  }
}

function describeRemoteCommand(payload: RunPayload): string {
  const who = payload.requestedBy ? `（来自 ${payload.requestedBy}）` : "";
  switch (payload.command) {
    case "desktop.computer-use.start":
      return `手机请求在这台电脑上打开 Computer Use${who}。打开后 AI 可以控制鼠标、键盘和屏幕，每个动作仍需审批。只有在这台电脑上确认才会生效。`;
    case "desktop.pro-mode.toggle":
      return `手机请求打开 Pro 模式面板${who}。`;
    case "desktop.aira-work-mode.start":
      return `手机请求进入工作模式${who}。`;
    default:
      return `手机请求执行 ${payload.command}${who}。`;
  }
}

/** Open the desktop Pro chat panel (Tauri command); broadcast pro-mode. */
async function openProPanel(broadcast: boolean): Promise<void> {
  if (broadcast) {
    window.dispatchEvent(new CustomEvent("agentrix:app-mode-changed", { detail: { mode: "pro-mode" } }));
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desktop_bridge_open_chat_panel", { proMode: true });
  } catch {
    // Non-Tauri / web preview — best-effort event so the host can react.
    window.dispatchEvent(new CustomEvent("agentrix:open-panel-pro"));
  }
}
