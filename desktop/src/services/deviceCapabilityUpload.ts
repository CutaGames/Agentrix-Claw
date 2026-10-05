/**
 * deviceCapabilityUpload — 把这台电脑的能力声明签名并上传（L5 B2，`DEVICE_MESH_ROUTES_V0.declare`）。默认关。
 *
 * - 只在设备网开着时做：本机开关 `VITE_DEVICE_MESH_ENABLED=1`，并且服务端下发的开关表里 `DEVICE_MESH_V0_ENABLED=1`
 *   （`GET /api/device-mesh/config`，按合同的解码器读，读不到或过期就当关）。
 * - 签名在 Rust 里做（`sign_device_capability_declaration`），摘要也是 Rust 按声明本身算的；这里再按合同算一遍，
 *   两边对不上就不上传（规范化不一致时宁可不发）。
 * - 上传体就是合同的 `{ declaration, signature }`；服务端拒绝时带回状态和错误码，不重试同一份。
 */
import {
  DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0,
  DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS,
  decodeDeviceMeshConfigV0,
  deviceCapabilityDeclarationDigestV0,
  type DeviceCapabilityDeclarationV0,
  type DeviceMeshConfigV0,
} from "../../../shared/types/device-capability";
import { buildCapabilityDeclaration } from "./deviceCapabilityDeclaration";
import type { DesktopRuntimeIdentity } from "./developerRuntime";
import type { RentalRulesView } from "./rentalRules";

export const DEVICE_MESH_SERVER_FLAG = "DEVICE_MESH_V0_ENABLED";

export interface CapabilityUploadDeps {
  /** `import.meta.env.VITE_DEVICE_MESH_ENABLED === "1"`. */
  localEnabled: boolean;
  nowMs: () => number;
  getJson: (path: string) => Promise<{ status: number; body: unknown }>;
  postJson: (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;
  sign: (declaration: DeviceCapabilityDeclarationV0) => Promise<{ digest: string; signature: string }>;
}

export type CapabilityUploadResult =
  | { ok: true; expiresAt: string; replayed: boolean }
  | { ok: false; reason: "off" | "sign_failed" | "digest_mismatch" | "network" | "rejected"; status?: number; code?: string | null };

/** The server's switch table, or null when it is off, unreadable or stale (treated as all off). */
export async function readDeviceMeshConfig(deps: Pick<CapabilityUploadDeps, "getJson" | "nowMs">): Promise<DeviceMeshConfigV0 | null> {
  try {
    const response = await deps.getJson("/device-mesh/config");
    return response.status === 200 ? decodeDeviceMeshConfigV0(response.body, deps.nowMs()) : null;
  } catch {
    return null;
  }
}

export async function uploadCapabilityDeclaration(
  declaration: DeviceCapabilityDeclarationV0,
  deps: CapabilityUploadDeps,
): Promise<CapabilityUploadResult> {
  if (!deps.localEnabled) return { ok: false, reason: "off" };
  const config = await readDeviceMeshConfig(deps);
  if (config?.flags[DEVICE_MESH_SERVER_FLAG] !== "1") return { ok: false, reason: "off" };

  let signed: { digest: string; signature: string };
  try {
    signed = await deps.sign(declaration);
  } catch {
    return { ok: false, reason: "sign_failed" };
  }
  if (typeof signed?.signature !== "string" || !DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0.test(signed.signature)) return { ok: false, reason: "sign_failed" };
  if (signed.digest !== deviceCapabilityDeclarationDigestV0(declaration)) return { ok: false, reason: "digest_mismatch" };

  let response: { status: number; body: unknown };
  try {
    response = await deps.postJson(`/devices/${encodeURIComponent(declaration.deviceId)}/capabilities`, { declaration, signature: signed.signature });
  } catch {
    return { ok: false, reason: "network" };
  }
  const body = (response.body ?? {}) as { expiresAt?: unknown; replayed?: unknown; code?: unknown };
  if (response.status === 200 && typeof body.expiresAt === "string") return { ok: true, expiresAt: body.expiresAt, replayed: body.replayed === true };
  return { ok: false, reason: "rejected", status: response.status, code: typeof body.code === "string" ? body.code : null };
}

export async function ownerCall(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const { API_BASE, apiFetch, useAuthStore } = await import("./store");
  const token = useAuthStore.getState().token;
  if (!token) return { status: 401, body: null };
  const response = await apiFetch(`${API_BASE}${path}`, {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

/** The real dependencies: the owner's sign-in, the API base, and the Rust device key. */
export function desktopCapabilityUploadDeps(env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}): CapabilityUploadDeps {
  return {
    localEnabled: env.VITE_DEVICE_MESH_ENABLED === "1",
    nowMs: () => Date.now(),
    getJson: (path) => ownerCall("GET", path),
    postJson: (path, body) => ownerCall("POST", path, body),
    sign: async (declaration) => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<{ digest: string; signature: string }>("sign_device_capability_declaration", { declaration });
    },
  };
}

/** Declarations live at most 15 minutes; a fresh one every 5 keeps one live through a missed pass. */
export const CAPABILITY_UPLOAD_INTERVAL_MS = 5 * 60 * 1000;

export interface CapabilityLoopDeps extends CapabilityUploadDeps {
  /** The bound identity from Rust (`developer_runtime_presentation`): device, binding and device key refs only. */
  identity: () => Promise<DesktopRuntimeIdentity | null>;
  rentalRules: () => Promise<RentalRulesView>;
  newId: () => string;
}

export type CapabilityDeclareResult = CapabilityUploadResult | { ok: false; reason: "not_bound" | "no_shell_binding" };

/** One pass: this computer's current declaration from its bound identity and rental rules, signed and uploaded. */
export async function declareThisComputer(deps: CapabilityLoopDeps): Promise<CapabilityDeclareResult> {
  if (!deps.localEnabled) return { ok: false, reason: "off" };
  const config = await readDeviceMeshConfig(deps);
  if (config?.flags[DEVICE_MESH_SERVER_FLAG] !== "1") return { ok: false, reason: "off" };
  const identity = await deps.identity().catch(() => null);
  if (!identity) return { ok: false, reason: "not_bound" };
  const built = buildCapabilityDeclaration({
    deviceId: identity.deviceId,
    signerRef: identity.credentialRef,
    shellBinding: { id: identity.bindingId, version: identity.bindingVersion },
    declarationId: deps.newId(),
    rental: await deps.rentalRules(),
    now: new Date(deps.nowMs()),
    flags: config.flags,
    ttlSeconds: DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS,
  });
  if (built.ok === false) return { ok: false, reason: built.reason };
  return uploadCapabilityDeclaration(built.declaration, deps);
}

/** Started once by the desktop shell; a no-op unless VITE_DEVICE_MESH_ENABLED=1. Returns the stop function. */
export function startCapabilityUploadLoop(deps: CapabilityLoopDeps, intervalMs = CAPABILITY_UPLOAD_INTERVAL_MS, onResult?: (result: CapabilityDeclareResult) => void): () => void {
  if (!deps.localEnabled) return () => undefined;
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      onResult?.(await declareThisComputer(deps));
    } catch {
      // A failed pass is retried on the next tick.
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** The real dependencies for the loop: the upload's, plus the Rust identity and rental rules. */
export function desktopCapabilityLoopDeps(env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}): CapabilityLoopDeps {
  return {
    ...desktopCapabilityUploadDeps(env),
    identity: async () => (await import("./developerRuntime")).readDesktopRuntimeIdentity(),
    rentalRules: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const { RENTAL_RULES_COMMANDS, normalizeRentalRulesView } = await import("./rentalRules");
      try {
        return normalizeRentalRulesView(await invoke(RENTAL_RULES_COMMANDS.get));
      } catch {
        return normalizeRentalRulesView(null);
      }
    },
    newId: () => crypto.randomUUID(),
  };
}
