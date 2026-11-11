/**
 * deviceAssetRecord — 这台电脑读自己的序列号、电池循环次数和容量，用这台电脑的设备钥匙签名，交给后端挂到「我的东西」的
 * 一条记录上（L9 S17，L2，合同在 `shared/types/device-assets.ts`）。默认关。
 *
 * - 只在构建时 `VITE_DEVICE_ASSET_RECORD_ENABLED` 精确为 "1" 时开；关着时不调 Tauri 命令、不发任何请求。
 *   服务端的 `DEVICE_ASSET_RECORD_V1_ENABLED` 关着时路由回 404，这里当成「没有开放」，卡片不显示。
 * - 读和签都在 Rust 里（`device_asset_record_read`）：命令参数写死，读到的字段和摘要都由 Rust 算，私钥不出 Rust。
 *   这里按合同再算一遍摘要，对不上就不上传；Rust 签的设备也必须是这台电脑绑定的那台。
 * - 上传体就是合同的 `DeviceAssetRecordUploadV1`（五个键，不多带）；服务端只留摘要和签名，不留序列号和电池数。
 * - 它是「由这台电脑读取并签名」，不是检测或认证。
 */
import {
  DEVICE_ASSET_RECORD_DESKTOP_FLAG_V1,
  DEVICE_ASSET_RECORD_READ_AT_PATTERN_V1,
  DEVICE_ASSET_RECORD_SIGNATURE_PATTERN_V1,
  DEVICE_ASSET_REF_PATTERN_V1,
  DEVICE_ASSETS_ITEMS_PATH_V1,
  decodeDeviceAssetListV1,
  decodeDeviceAssetRecordViewV1,
  deviceAssetRecordDigestV1,
  deviceAssetRecordPathV1,
  isDeviceAssetRecordFieldsV1,
  type DeviceAssetRecordFieldsV1,
  type DeviceAssetRecordSummaryV1,
  type DeviceAssetRecordUploadV1,
  type DeviceAssetSummaryV1,
} from "../../../shared/types/device-assets";
import type { DesktopRuntimeIdentity } from "./developerRuntime";
import { pickFor } from "../i18n/pick";

/** The Tauri command (registered in `lib.rs`): reads this computer and signs, for one item. */
export const DEVICE_ASSET_RECORD_COMMAND = "device_asset_record_read";

export function deviceAssetRecordEnabled(env: Record<string, unknown> = (import.meta as { env?: Record<string, unknown> }).env ?? {}): boolean {
  return env[DEVICE_ASSET_RECORD_DESKTOP_FLAG_V1] === "1";
}

export interface DeviceAssetRecordDeps {
  /** `VITE_DEVICE_ASSET_RECORD_ENABLED === "1"`. */
  enabled: boolean;
  /** This computer's bound identity from Rust (device id and its signing credential ref). */
  identity: () => Promise<DesktopRuntimeIdentity | null>;
  /** `invoke("device_asset_record_read", { assetRef })`. */
  readSigned: (assetRef: string) => Promise<unknown>;
  getJson: (path: string) => Promise<{ status: number; body: unknown }>;
  postJson: (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;
}

/** What Rust read and signed, checked; `signerRef` is this computer's credential, from its identity. */
export interface DeviceAssetRecordReading {
  deviceId: string;
  signerRef: string;
  assetRef: string;
  readAt: string;
  fields: DeviceAssetRecordFieldsV1;
  digest: string;
  signature: string;
}

export type DeviceAssetRecordFailure = "off" | "no_session" | "closed" | "unreadable" | "not_bound" | "read_failed" | "digest_mismatch" | "rejected" | "network";

export type ThingsResult = { ok: true; items: DeviceAssetSummaryV1[] } | { ok: false; reason: DeviceAssetRecordFailure };
export type ReadResult = { ok: true; reading: DeviceAssetRecordReading } | { ok: false; reason: DeviceAssetRecordFailure };
export type UploadResult = { ok: true; record: DeviceAssetRecordSummaryV1 } | { ok: false; reason: DeviceAssetRecordFailure; status?: number; code?: string | null };

function statusFailure(status: number): DeviceAssetRecordFailure {
  if (status === 401 || status === 403) return "no_session";
  if (status === 404) return "closed";
  return "unreadable";
}

/** The owner's things that can carry a record (owned or listed). 404 = the ledger is not open to this account. */
export async function listThings(deps: DeviceAssetRecordDeps): Promise<ThingsResult> {
  if (!deps.enabled) return { ok: false, reason: "off" };
  let response: { status: number; body: unknown };
  try {
    response = await deps.getJson(`${DEVICE_ASSETS_ITEMS_PATH_V1}?limit=200`);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status !== 200) return { ok: false, reason: statusFailure(response.status) };
  const decoded = decodeDeviceAssetListV1(response.body);
  if (decoded.ok === false) return { ok: false, reason: "unreadable" };
  const list = (decoded as Extract<typeof decoded, { ok: true }>).value;
  return { ok: true, items: list.items.filter((item) => item.status === "owned" || item.status === "listed") };
}

const READING_KEYS = ["assetRef", "deviceId", "digest", "fields", "readAt", "signature"];

/** Reads and signs this computer for one item, in Rust. Nothing leaves the computer here. */
export async function readThisComputer(assetRef: string, deps: DeviceAssetRecordDeps): Promise<ReadResult> {
  if (!deps.enabled) return { ok: false, reason: "off" };
  if (typeof assetRef !== "string" || !DEVICE_ASSET_REF_PATTERN_V1.test(assetRef)) return { ok: false, reason: "read_failed" };
  const identity = await deps.identity().catch(() => null);
  if (!identity) return { ok: false, reason: "not_bound" };
  let raw: unknown;
  try {
    raw = await deps.readSigned(assetRef);
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "read_failed" };
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== READING_KEYS.join(",")) return { ok: false, reason: "read_failed" };
  if (value.deviceId !== identity.deviceId || value.assetRef !== assetRef) return { ok: false, reason: "read_failed" };
  const readAt = value.readAt;
  const signature = value.signature;
  const fields = value.fields;
  const digest = value.digest;
  if (typeof readAt !== "string" || !DEVICE_ASSET_RECORD_READ_AT_PATTERN_V1.test(readAt)) return { ok: false, reason: "read_failed" };
  if (typeof signature !== "string" || !DEVICE_ASSET_RECORD_SIGNATURE_PATTERN_V1.test(signature)) return { ok: false, reason: "read_failed" };
  if (!isDeviceAssetRecordFieldsV1(fields)) return { ok: false, reason: "read_failed" };
  if (typeof digest !== "string" || digest !== deviceAssetRecordDigestV1(fields)) return { ok: false, reason: "digest_mismatch" };
  return {
    ok: true,
    reading: { deviceId: identity.deviceId, signerRef: identity.credentialRef, assetRef, readAt, fields, digest, signature },
  };
}

/** Hands one checked reading in. The body is exactly the contract's five keys. */
export async function uploadReading(reading: DeviceAssetRecordReading, deps: DeviceAssetRecordDeps): Promise<UploadResult> {
  if (!deps.enabled) return { ok: false, reason: "off" };
  const body: DeviceAssetRecordUploadV1 = {
    deviceId: reading.deviceId,
    signerRef: reading.signerRef,
    readAt: reading.readAt,
    fields: reading.fields,
    signature: reading.signature,
  };
  let response: { status: number; body: unknown };
  try {
    response = await deps.postJson(deviceAssetRecordPathV1(reading.assetRef), body);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status === 200) {
    const decoded = decodeDeviceAssetRecordViewV1(response.body);
    if (decoded.ok === false) return { ok: false, reason: "unreadable" };
    const view = (decoded as Extract<typeof decoded, { ok: true }>).value;
    return view.record ? { ok: true, record: view.record } : { ok: false, reason: "unreadable" };
  }
  if (response.status === 400 || response.status === 409 || response.status === 503) {
    const code = (response.body as { code?: unknown } | null)?.code;
    return { ok: false, reason: "rejected", status: response.status, code: typeof code === "string" ? code : null };
  }
  return { ok: false, reason: statusFailure(response.status) };
}

/** The real dependencies: the owner's sign-in and API base, the bound identity, and the Rust command. */
export function desktopDeviceAssetRecordDeps(env?: Record<string, unknown>): DeviceAssetRecordDeps {
  return {
    enabled: deviceAssetRecordEnabled(env),
    identity: async () => (await import("./developerRuntime")).readDesktopRuntimeIdentity(),
    readSigned: async (assetRef) => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke(DEVICE_ASSET_RECORD_COMMAND, { assetRef });
    },
    getJson: async (path) => (await import("./deviceCapabilityUpload")).ownerCall("GET", path),
    postJson: async (path, body) => (await import("./deviceCapabilityUpload")).ownerCall("POST", path, body),
  };
}

/** The preview lines, one language (the app's). A fact the system did not report says so. */
export function deviceAssetRecordLines(fields: DeviceAssetRecordFieldsV1, locale: string = "zh"): Array<{ label: string; value: string }> {
  const p = pickFor(locale);
  const none = p("系统没有报", "not reported");
  const unit = fields.batteryCapacityUnit ?? "";
  return [
    { label: p("序列号", "Serial number"), value: fields.serialNumber ?? none },
    { label: p("电池循环次数", "Battery cycle count"), value: fields.batteryCycleCount === null ? none : String(fields.batteryCycleCount) },
    { label: p("设计容量", "Design capacity"), value: fields.batteryDesignCapacity === null ? none : `${fields.batteryDesignCapacity} ${unit}` },
    { label: p("满充容量", "Full charge capacity"), value: fields.batteryFullChargeCapacity === null ? none : `${fields.batteryFullChargeCapacity} ${unit}` },
    { label: p("最大容量", "Maximum capacity"), value: fields.batteryMaximumCapacityPercent === null ? none : `${fields.batteryMaximumCapacityPercent}%` },
  ];
}

/** One line per failure, one language. */
export function deviceAssetRecordFailureText(reason: DeviceAssetRecordFailure, locale: string = "zh"): string {
  const p = pickFor(locale);
  switch (reason) {
    case "no_session":
      return p("请先登录。", "Please sign in first.");
    case "not_bound":
      return p("这台电脑还没有绑定设备钥匙，先在上面绑定这台电脑。", "This computer has no device key yet. Bind this computer first.");
    case "read_failed":
      return p("没有读出来，请稍后再试。", "This computer could not be read. Try again later.");
    case "digest_mismatch":
      return p("读到的内容对不上，没有上传。", "What was read did not check out, so nothing was sent.");
    case "rejected":
      return p("服务器没有收下（签名或设备对不上）。", "The server did not take it (the signature or the device did not match).");
    case "network":
      return p("连不上服务器，请稍后再试。", "Cannot reach the server. Try again later.");
    default:
      return p("暂时用不了。", "Not available right now.");
  }
}
