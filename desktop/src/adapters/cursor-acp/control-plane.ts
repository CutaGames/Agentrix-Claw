/**
 * Control-plane guards, envelopes, and digest helpers.
 * DEVELOPMENT_SPIKE_ONLY. Bodies stay behind encrypted data refs.
 * Digests reuse shared JCS + SHA; no Node builtin crypto.
 */

import { computeDigest } from "../../../../shared/types/trust-loop-primitives.ts";
import type { DigestRef } from "../../../../shared/types/trust-loop-primitives.ts";
import {
  CURSOR_ACP_SPIKE_ENVIRONMENT,
  DEVELOPMENT_SPIKE_ONLY,
} from "./constants";
import type { CursorAcpSpikeEnvelope, CursorAcpSpikeOutcome } from "./types";

const FORBIDDEN_CONTROL_KEYS = new Set([
  "absolutelocalpath",
  "apikey",
  "authorization",
  "body",
  "cookie",
  "credential",
  "cwd",
  "diffbody",
  "filepath",
  "localpath",
  "logbody",
  "password",
  "promptbody",
  "providertoken",
  "rawcredential",
  "rawdiff",
  "rawlog",
  "rawprompt",
  "secret",
]);

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export function digestRefOf(value: unknown): DigestRef {
  return computeDigest(value);
}

export function lookLikeAbsolutePath(value: string): boolean {
  const candidate = value.trimStart();
  return (
    WINDOWS_ABSOLUTE_PATH.test(candidate) ||
    candidate.startsWith("/") ||
    candidate.startsWith("\\\\") ||
    candidate.toLowerCase().startsWith("file:") ||
    candidate.startsWith("~/") ||
    candidate.startsWith("~\\")
  );
}

export function controlPlaneSafetyErrors(
  value: unknown,
  path = "root",
): string[] {
  const errors: string[] = [];
  visitControlPlane(value, path, errors);
  return errors;
}

function visitControlPlane(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (typeof value === "string") {
    if (lookLikeAbsolutePath(value)) {
      errors.push(`${path}: absolute local paths are forbidden`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      visitControlPlane(entry, `${path}[${index}]`, errors);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.replace(/[_-]/g, "").toLowerCase();
      if (FORBIDDEN_CONTROL_KEYS.has(normalized)) {
        errors.push(`${path}.${key}: forbidden control-plane field`);
      }
      visitControlPlane(child, `${path}.${key}`, errors);
    }
  }
}

export function assertControlPlaneSafe(value: unknown): void {
  const errors = controlPlaneSafetyErrors(value);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

export function spikeEnvelope<T>(
  outcome: CursorAcpSpikeOutcome,
  enabled: boolean,
  payload?: T,
  reasonCode?: string,
): CursorAcpSpikeEnvelope<T> {
  const envelope: CursorAcpSpikeEnvelope<T> = {
    resultClass: DEVELOPMENT_SPIKE_ONLY,
    environment: CURSOR_ACP_SPIKE_ENVIRONMENT,
    enabled,
    defaultOff: true,
    singleOwner: true,
    fixedWorkspace: true,
    productionRoute: false,
    productionFlag: false,
    receiptClaim: false,
    canonicalSuccessClaim: false,
    replayAllowed: false,
    vendorProcessStarted: false,
    outcome,
    ...(reasonCode ? { reasonCode } : {}),
    ...(payload !== undefined ? { payload } : {}),
  };
  assertControlPlaneSafe(envelope);
  return envelope;
}
