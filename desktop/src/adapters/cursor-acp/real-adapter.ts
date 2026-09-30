/**
 * Real local Cursor ACP runtime adapter.
 * Fixture spike stays in adapter.ts. This type only talks to the Rust host.
 */

import { validateDeveloperAdapterCapabilityV1 } from "../../../../shared/types/developer-remote-workspace.ts";
import {
  CURSOR_ACP_LOCAL_ENVIRONMENT,
  LOCAL_RUNTIME_UNCERTIFIED,
} from "./constants";
import { assertControlPlaneSafe } from "./control-plane";
import {
  CURSOR_ACP_LOCAL_CAPABILITY_SHEET,
  CURSOR_ACP_LOCAL_MANIFEST,
} from "./real-manifest";
import { CursorAcpProcessHostClient, localEnvelope } from "./process-host";
import type {
  CursorAcpLocalCapabilitySheet,
  CursorAcpLocalEnvelope,
  DeveloperRuntimeInvoke,
} from "./types";

export interface CursorAcpLocalRuntimeConfig {
  enabled?: boolean;
  invoke: DeveloperRuntimeInvoke;
}

export class CursorAcpLocalRuntime {
  private readonly enabled: boolean;
  private readonly host: CursorAcpProcessHostClient;

  constructor(config: CursorAcpLocalRuntimeConfig) {
    this.enabled = config.enabled === true;
    this.host = new CursorAcpProcessHostClient({
      invoke: config.invoke,
      enabled: this.enabled,
    });
  }

  manifest(): CursorAcpLocalEnvelope<typeof CURSOR_ACP_LOCAL_MANIFEST> {
    const validation = validateDeveloperAdapterCapabilityV1(
      CURSOR_ACP_LOCAL_MANIFEST,
    );
    if (!validation.valid) {
      return localEnvelope<typeof CURSOR_ACP_LOCAL_MANIFEST>(
        "fail_closed",
        this.enabled,
        false,
        undefined,
        "unknown_schema",
      );
    }
    return this.ok(CURSOR_ACP_LOCAL_MANIFEST);
  }

  capabilitySheet(): CursorAcpLocalEnvelope<CursorAcpLocalCapabilitySheet> {
    return this.ok(CURSOR_ACP_LOCAL_CAPABILITY_SHEET);
  }

  async loadSession(): Promise<CursorAcpLocalEnvelope<never>> {
    return this.host.loadSession();
  }

  async cancel(input: {
    instructionRef: string;
  }): Promise<CursorAcpLocalEnvelope<unknown>> {
    return this.host.cancel(input.instructionRef);
  }

  async query(input: {
    instructionRef: string;
  }): Promise<CursorAcpLocalEnvelope<unknown>> {
    return this.host.query(input.instructionRef);
  }

  async queryTerminal(): Promise<CursorAcpLocalEnvelope<never>> {
    return this.host.queryTerminal();
  }

  async probeVendor(): Promise<CursorAcpLocalEnvelope<unknown>> {
    return this.host.probeVendor();
  }

  private ok<T>(payload: T): CursorAcpLocalEnvelope<T> {
    const envelope = localEnvelope("ok", this.enabled, false, payload);
    assertControlPlaneSafe(envelope);
    return envelope;
  }
}

export const CURSOR_ACP_LOCAL_RESULT_CLASS = LOCAL_RUNTIME_UNCERTIFIED;
export const CURSOR_ACP_LOCAL_RUNTIME_ENVIRONMENT =
  CURSOR_ACP_LOCAL_ENVIRONMENT;
