/**
 * rentalJobWorker — 出租任务（L5 B4，`DEVICE_RENTAL_ROUTES_V0`）：领一单，Rust 在受限推理进程里跑，设备钥匙签回执，上传。默认关。
 *
 * - 只在这几样都满足时去领：本机开关 `VITE_DEVICE_RENTAL_ENABLED=1`；服务端开关表里 `DEVICE_RENTAL_V0_ENABLED=1`（按合同解码，
 *   读不到或过期当关）；Rust 说现在能接（已登记、出租规则开着且完好、急停没拉、平台固定的推理程序和模型核对得上）。
 * - 领到的任务一定交回执：Rust 跑不了（急停、规则关了、输入摘要不对、不支持的任务）也签一份失败回执（用量 0），买方的预占就退回。
 * - 输入和输出只在内存里经过，不写日志、不存。上传被拒时报状态和错误码，不重试同一份。
 */
import { DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0, DEVICE_RENTAL_JOB_REF_PATTERN_V0, DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0 } from "../../../shared/types/device-capability";
import { ownerCall, readDeviceMeshConfig } from "./deviceCapabilityUpload";

export const DEVICE_RENTAL_SERVER_FLAG = "DEVICE_RENTAL_V0_ENABLED";
export const RENTAL_POLL_INTERVAL_MS = 30_000;

export interface RentalJobV0 {
  jobRef: string;
  capabilityType: string;
  unit: string;
  maxUnits: number;
  input: string;
  inputDigest: string;
}

export interface SignedRentalReceiptV0 {
  jobRef: string;
  status: "completed" | "failed";
  unitsUsed: number;
  resultDigest: string;
  finishedAt: string;
  output: string | null;
  endReason: string;
  signature: string;
}

export interface RentalJobsStatus {
  ready: boolean;
  deviceId: string | null;
  reason: string;
}

export interface RentalWorkerDeps {
  /** `import.meta.env.VITE_DEVICE_RENTAL_ENABLED === "1"`. */
  localEnabled: boolean;
  nowMs: () => number;
  getJson: (path: string) => Promise<{ status: number; body: unknown }>;
  postJson: (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;
  status: () => Promise<RentalJobsStatus>;
  runJob: (job: RentalJobV0) => Promise<SignedRentalReceiptV0>;
}

export type RentalWorkerResult =
  | { kind: "off"; reason: string }
  | { kind: "idle" }
  | { kind: "done"; jobRef: string; status: "completed" | "failed"; endReason: string }
  | { kind: "error"; reason: "network" | "unreadable" | "run_failed" | "rejected"; jobRef?: string; status?: number; code?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `{ job: null }` is no job; anything that is not a well-formed job is unreadable (undefined). */
export function decodeNextRentalJob(body: unknown): RentalJobV0 | null | undefined {
  if (!isRecord(body)) return undefined;
  if (body.job === null) return null;
  const job = body.job;
  if (!isRecord(job)) return undefined;
  if (typeof job.jobRef !== "string" || !DEVICE_RENTAL_JOB_REF_PATTERN_V0.test(job.jobRef)) return undefined;
  if (typeof job.capabilityType !== "string" || typeof job.unit !== "string" || typeof job.input !== "string") return undefined;
  if (!Number.isInteger(job.maxUnits) || (job.maxUnits as number) < 1) return undefined;
  if (typeof job.inputDigest !== "string" || !DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0.test(job.inputDigest)) return undefined;
  return { jobRef: job.jobRef, capabilityType: job.capabilityType, unit: job.unit, maxUnits: job.maxUnits as number, input: job.input, inputDigest: job.inputDigest };
}

function receiptIsWellFormed(receipt: SignedRentalReceiptV0, jobRef: string): boolean {
  return (
    isRecord(receipt) &&
    receipt.jobRef === jobRef &&
    (receipt.status === "completed" || receipt.status === "failed") &&
    Number.isInteger(receipt.unitsUsed) &&
    receipt.unitsUsed >= 0 &&
    typeof receipt.resultDigest === "string" &&
    DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0.test(receipt.resultDigest) &&
    typeof receipt.finishedAt === "string" &&
    typeof receipt.signature === "string" &&
    DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0.test(receipt.signature) &&
    (receipt.status === "failed" || typeof receipt.output === "string")
  );
}

/** One pass: take at most one job, run it, upload its receipt. */
export async function runOneRentalJob(deps: RentalWorkerDeps): Promise<RentalWorkerResult> {
  if (!deps.localEnabled) return { kind: "off", reason: "local_off" };
  const config = await readDeviceMeshConfig(deps);
  if (config?.flags[DEVICE_RENTAL_SERVER_FLAG] !== "1") return { kind: "off", reason: "server_off" };
  let status: RentalJobsStatus;
  try {
    status = await deps.status();
  } catch {
    return { kind: "off", reason: "status_unavailable" };
  }
  if (!status.ready || !status.deviceId) return { kind: "off", reason: status.reason || "not_ready" };

  let next: { status: number; body: unknown };
  try {
    next = await deps.getJson(`/device-rental/jobs/next?deviceId=${encodeURIComponent(status.deviceId)}`);
  } catch {
    return { kind: "error", reason: "network" };
  }
  if (next.status === 404) return { kind: "off", reason: "server_off" };
  if (next.status !== 200) return { kind: "error", reason: "rejected", status: next.status };
  const job = decodeNextRentalJob(next.body);
  if (job === null) return { kind: "idle" };
  if (job === undefined) return { kind: "error", reason: "unreadable" };

  let receipt: SignedRentalReceiptV0;
  try {
    receipt = await deps.runJob(job);
  } catch {
    return { kind: "error", reason: "run_failed", jobRef: job.jobRef };
  }
  if (!receiptIsWellFormed(receipt, job.jobRef)) return { kind: "error", reason: "run_failed", jobRef: job.jobRef };

  const body = {
    status: receipt.status,
    unitsUsed: receipt.unitsUsed,
    resultDigest: receipt.resultDigest,
    finishedAt: receipt.finishedAt,
    signature: receipt.signature,
    ...(receipt.status === "completed" ? { output: receipt.output } : {}),
  };
  let response: { status: number; body: unknown };
  try {
    response = await deps.postJson(`/device-rental/jobs/${encodeURIComponent(job.jobRef)}/receipt`, body);
  } catch {
    return { kind: "error", reason: "network", jobRef: job.jobRef };
  }
  if (response.status === 200 || response.status === 201) return { kind: "done", jobRef: job.jobRef, status: receipt.status, endReason: receipt.endReason };
  const code = isRecord(response.body) && typeof response.body.code === "string" ? response.body.code : null;
  return { kind: "error", reason: "rejected", jobRef: job.jobRef, status: response.status, code };
}

/** Polls every `intervalMs` while the app runs; one pass at a time. Returns the stop function. */
export function startRentalJobLoop(deps: RentalWorkerDeps, intervalMs = RENTAL_POLL_INTERVAL_MS, onResult?: (result: RentalWorkerResult) => void): () => void {
  if (!deps.localEnabled) return () => undefined;
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await runOneRentalJob(deps);
      onResult?.(result);
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

/** The real dependencies: the owner's sign-in, the API base, and the Rust commands. */
export function desktopRentalWorkerDeps(env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}): RentalWorkerDeps {
  return {
    localEnabled: env.VITE_DEVICE_RENTAL_ENABLED === "1",
    nowMs: () => Date.now(),
    getJson: (path) => ownerCall("GET", path),
    postJson: (path, body) => ownerCall("POST", path, body),
    status: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<RentalJobsStatus>("desktop_bridge_rental_jobs_status");
    },
    runJob: async (job) => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<SignedRentalReceiptV0>("desktop_bridge_rental_run_job", { job });
    },
  };
}
