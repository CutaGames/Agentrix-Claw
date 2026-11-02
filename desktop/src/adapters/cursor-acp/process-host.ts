/**
 * Typed client for the Rust `agent acp` stdio process host.
 * Vendor probe and process I/O stay in Tauri. This module never imports
 * Node fs/path or child_process.
 */

import {
  CURSOR_ACP_LOCAL_COMMAND_LOCK,
  CURSOR_ACP_LOCAL_DEFAULT_ENABLED,
  CURSOR_ACP_LOCAL_ENVIRONMENT,
  LOCAL_RUNTIME_UNCERTIFIED,
} from "./constants";
import { assertControlPlaneSafe } from "./control-plane";
import type {
  CursorAcpLocalEnvelope,
  CursorAcpVendorProbe,
  DeveloperRuntimeInvoke,
} from "./types";

export interface CursorAcpProcessHostConfig {
  invoke: DeveloperRuntimeInvoke;
  enabled?: boolean;
  commandLock?: {
    program: string;
    args: readonly string[];
    protocolVersion: number;
  };
}

export function localEnvelope<T = never>(
  outcome: CursorAcpLocalEnvelope<T>["outcome"],
  enabled: boolean,
  vendorProcessStarted: boolean,
  payload?: T,
  reasonCode?: string,
): CursorAcpLocalEnvelope<T> {
  const envelope: CursorAcpLocalEnvelope<T> = {
    resultClass: LOCAL_RUNTIME_UNCERTIFIED,
    environment: CURSOR_ACP_LOCAL_ENVIRONMENT,
    enabled,
    defaultOff: true,
    productionRoute: false,
    productionCertification: false,
    receiptClaim: false,
    canonicalSuccessClaim: false,
    replayAllowed: false,
    vendorProcessStarted,
    outcome,
    ...(reasonCode ? { reasonCode } : {}),
    ...(payload !== undefined ? { payload } : {}),
  };
  assertControlPlaneSafe(envelope);
  return envelope;
}

export function lockedCommand(
  lock: {
    program: string;
    args: readonly string[];
    protocolVersion: number;
  } = CURSOR_ACP_LOCAL_COMMAND_LOCK,
): {
  program: string;
  args: readonly string[];
  protocolVersion: number;
} {
  if (
    lock.program !== "agent" ||
    lock.args.length !== 1 ||
    lock.args[0] !== "acp"
  ) {
    throw new Error("command_args_locked");
  }
  if (lock.protocolVersion !== 1) {
    throw new Error("protocol_version_locked");
  }
  if (/[\\/]/.test(lock.program) || lock.program.includes("..")) {
    throw new Error("command_path_forbidden");
  }
  return lock;
}

export class CursorAcpProcessHostClient {
  private readonly enabled: boolean;
  private readonly invoke: DeveloperRuntimeInvoke;
  readonly commandLock: {
    program: string;
    args: readonly string[];
    protocolVersion: number;
  };

  constructor(config: CursorAcpProcessHostConfig) {
    this.invoke = config.invoke;
    this.enabled = config.enabled === true;
    this.commandLock = lockedCommand(
      config.commandLock ?? CURSOR_ACP_LOCAL_COMMAND_LOCK,
    );
  }

  async invokeHost(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<CursorAcpLocalEnvelope<unknown>> {
    if (!this.enabled && command !== "developer_runtime_probe_vendor") {
      return localEnvelope(
        "unavailable",
        false,
        false,
        undefined,
        "adapter_default_off",
      );
    }
    let raw: unknown;
    try {
      raw = await this.invoke(command, args);
    } catch {
      // The Rust host may not expose this command yet, or the IPC may fail.
      // Never surface the rejection: its message can carry absolute local
      // paths, which are forbidden on the control plane. Fail closed with a
      // fixed reason code instead.
      return localEnvelope(
        "fail_closed",
        this.enabled,
        false,
        undefined,
        "host_invoke_failed",
      );
    }
    return this.asEnvelope(raw);
  }

  async probeVendor(): Promise<CursorAcpLocalEnvelope<CursorAcpVendorProbe>> {
    const invoked = await this.invokeHost("developer_runtime_probe_vendor");
    if (invoked.payload && typeof invoked.payload === "object") {
      return invoked as CursorAcpLocalEnvelope<CursorAcpVendorProbe>;
    }
    return localEnvelope(
      "unavailable",
      this.enabled,
      false,
      {
        available: false,
        reasonCode: invoked.reasonCode ?? "vendor_cli_unavailable",
        program: this.commandLock.program,
        spawnAttempted: false,
        processStarted: false,
        productionClaim: false,
      },
      invoked.reasonCode ?? "vendor_cli_unavailable",
    );
  }

  async cancel(
    instructionRef: string,
  ): Promise<CursorAcpLocalEnvelope<unknown>> {
    return this.invokeHost("developer_runtime_cancel", { instructionRef });
  }

  async query(
    instructionRef: string,
  ): Promise<CursorAcpLocalEnvelope<unknown>> {
    return this.invokeHost("developer_runtime_query", { instructionRef });
  }

  async loadSession(): Promise<CursorAcpLocalEnvelope<never>> {
    return localEnvelope<never>(
      "unavailable",
      this.enabled,
      false,
      undefined,
      "session_resume_unverified",
    );
  }

  async queryTerminal(): Promise<CursorAcpLocalEnvelope<never>> {
    return localEnvelope<never>(
      "unavailable",
      this.enabled,
      false,
      undefined,
      "terminal_query_unverified",
    );
  }

  private asEnvelope(raw: unknown): CursorAcpLocalEnvelope<unknown> {
    if (!raw || typeof raw !== "object") {
      return localEnvelope(
        "fail_closed",
        this.enabled,
        false,
        undefined,
        "unknown_schema",
      );
    }
    const record = raw as Record<string, unknown>;
    const outcome =
      record.outcome === "ok" ||
      record.outcome === "fail_closed" ||
      record.outcome === "unavailable"
        ? record.outcome
        : "fail_closed";
    return localEnvelope(
      outcome,
      record.enabled === true,
      record.vendorProcessStarted === true,
      record.payload,
      typeof record.reasonCode === "string" ? record.reasonCode : undefined,
    );
  }
}

export const CURSOR_ACP_PROCESS_HOST_DEFAULT_ENABLED =
  CURSOR_ACP_LOCAL_DEFAULT_ENABLED;
