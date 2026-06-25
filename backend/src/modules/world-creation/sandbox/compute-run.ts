/**
 * compute.run — L2 WASM capability authorization wrapper (task 5.2, R5.6/R6.3).
 *
 * Host-side gate for the `compute.run` capability. The actual untrusted compute
 * executes in the desktop Rust `world_sandbox` (wasmtime) — see
 * `desktop/src-tauri/src/world_sandbox/`. This module is the **authorization +
 * request-shaping layer** that runs *before* anything reaches the WASM runtime:
 *
 *   1. **deny-by-default**: reuses {@link dispatchCapability} from the
 *      Capability_Registry so a Tier_C logic module may invoke `compute.run`
 *      only if it declared it (and it is whitelisted). Denials produce a
 *      structured `CAP_DENIED` + an audit record (R5.5), identical to every
 *      other World_API capability.
 *   2. **intent gate**: each intent a tick returns (`scene.transform`,
 *      `state.kv`, …) is re-checked against the module's declared capabilities
 *      before the host applies it — mirrors the Rust `authorize_intent` so the
 *      WASM "returns intent only, host applies" contract (design §11.2) is
 *      enforced on both sides.
 *   3. **request shaping**: builds the {@link ComputeRunRequest} the desktop
 *      bridge forwards to `world_sandbox_compute_run`.
 *
 * Pure functions (audit via injected sink) so they can be unit/property tested
 * without a running WASM engine.
 *
 * @see desktop/src-tauri/src/world_sandbox/mod.rs — Rust L2 counterpart
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.1 L2, §11.2
 */

import {
  WorldApiCapability,
  type LogicModuleRef,
  type WorldCreationError,
} from '../../../../shared/types/world-creation';
import {
  dispatchCapability,
  isDispatchAllowed,
  type CapabilityAuditSink,
} from '../world-api/capability-registry';

/** The capability that gates L2 WASM execution (R5.6). */
export const COMPUTE_RUN_CAPABILITY = WorldApiCapability.ComputeRun;

/**
 * A `compute.run` request shaped for the desktop `world_sandbox` bridge. Mirrors
 * the Rust `ComputeRunRequest` struct (snake_case keys for serde).
 */
export interface ComputeRunRequest {
  /** Logic module id (matches {@link LogicModuleRef.moduleId}). */
  module_id: string;
  /** Entry function to invoke (e.g. "tick"). */
  entry: string;
  /** Capabilities the module declared (deny-by-default gate input). */
  capabilities: string[];
  /** Untrusted WASM bytecode (reviewed, hash-locked) as a byte array. */
  wasm_bytes: number[];
  /** JSON input passed to the entry. */
  input: unknown;
  /** Optional fuel override. */
  fuel?: number;
}

/** Input to {@link authorizeComputeRun}. */
export interface AuthorizeComputeRunInput {
  /** The Tier_C logic module reference being asked to run. */
  module: Pick<LogicModuleRef, 'moduleId' | 'entry' | 'capabilities' | 'runtime'>;
  /** Optional sandbox session id, recorded in audit entries on denial. */
  sessionId?: string;
  /** Optional audit sink (forwarded to the registry on denial, R5.5). */
  audit?: CapabilityAuditSink;
}

/** Result of {@link authorizeComputeRun}. */
export type AuthorizeComputeRunResult =
  | { ok: true }
  | WorldCreationError;

/**
 * Authorize a Tier_C logic module to invoke `compute.run` (deny-by-default).
 *
 * Delegates to the Capability_Registry: the module's declared
 * `capabilities` are the granted set, and `compute.run` must be among them and
 * whitelisted. Any denial returns a structured `CAP_DENIED` and audits it.
 */
export function authorizeComputeRun(
  input: AuthorizeComputeRunInput,
): AuthorizeComputeRunResult {
  const result = dispatchCapability({
    cap: COMPUTE_RUN_CAPABILITY,
    grantedCaps: input.module.capabilities,
    sessionId: input.sessionId,
    audit: input.audit,
  });
  if (isDispatchAllowed(result)) {
    return { ok: true };
  }
  return result;
}

/**
 * Authorize a single intent capability returned by a `compute.run` tick before
 * the host applies it (deny-by-default). Mirrors the Rust `authorize_intent`.
 *
 * @param cap the intent's capability (e.g. "scene.transform")
 * @param module the logic module whose declared capabilities are the grant set
 */
export function authorizeIntent(
  cap: WorldApiCapability | string,
  module: Pick<LogicModuleRef, 'capabilities'>,
  opts?: { sessionId?: string; audit?: CapabilityAuditSink },
): { ok: true; cap: string } | WorldCreationError {
  return dispatchCapability({
    cap,
    grantedCaps: module.capabilities,
    sessionId: opts?.sessionId,
    audit: opts?.audit,
  });
}

/**
 * Build the {@link ComputeRunRequest} forwarded to the desktop WASM sandbox,
 * *after* authorization has passed. Throws if `compute.run` is not authorized
 * so a request can never be shaped for an un-granted module.
 */
export function buildComputeRunRequest(
  module: Pick<LogicModuleRef, 'moduleId' | 'entry' | 'capabilities' | 'runtime'>,
  wasmBytes: Uint8Array | number[],
  input: unknown,
  opts?: { fuel?: number; sessionId?: string; audit?: CapabilityAuditSink },
): ComputeRunRequest {
  const auth = authorizeComputeRun({
    module,
    sessionId: opts?.sessionId,
    audit: opts?.audit,
  });
  if (!('ok' in auth)) {
    throw new Error(`${auth.error}: ${auth.detail}`);
  }

  return {
    module_id: module.moduleId,
    entry: module.entry,
    capabilities: [...module.capabilities],
    wasm_bytes: Array.from(wasmBytes),
    input,
    fuel: opts?.fuel,
  };
}
