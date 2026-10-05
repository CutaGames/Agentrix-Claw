/**
 * rentalRules — L5 出租（试验）的主人规则（REQ-desktop-060 第 3 节，E100）。默认关。
 *
 * 规则就是合同 `shared/types/device-capability.ts` 里的 `DeviceCapabilityRuleV0`，能力只有 `llm.generate.v1`
 * （本地模型推理，E100 ①）。校验和判断都用合同自己的函数，桌面不另写一套（coord 在 REQ-desktop-062 的答复）：
 * - 规则形状：`validateDeviceCapabilityRuleV0`；
 * - 平台开没开放：`deviceCapabilityRentableV0`，开关表客户端现在还读不到，读不到就当全关；
 * - 时段：`deviceRuleWindowContainsV0`，按规则里的时区算。
 * 合同说温度由桌面端自己管，所以"热不热"由这里加上；读不到的一律算"不行"。
 *
 * 服务端还没存规则，现在存在这台电脑上：Rust（`rental_rules.rs`）用和常开节点同一把钥匙串密钥、不同的域签名，
 * 文件被改过就当关着。另存几项只属于这台电脑的：本机总开关、空闲多少分钟算空闲、最多几核、多少内存。
 * 增删改只在"这台电脑 → 出租（试验）"里由本人点；fence 登记表里没有这些命令，AI 调不到。
 * 收入不在本机：页面只显示服务端的记账（还没接上）。
 */
import {
  DEVICE_CAPABILITY_CATEGORY_POLICY_V0,
  deviceCapabilityCatalogEntryV0,
  deviceCapabilityRentableV0,
  deviceRuleWindowContainsV0,
  validateDeviceCapabilityRuleV0,
  type DeviceCapabilityCategoryV0,
  type DeviceCapabilityRuleV0,
  type DeviceRuleApprovalV0,
} from "../../../shared/types/device-capability";

export const RENTAL_CAPABILITY_TYPE = "llm.generate.v1";
export const RENTAL_CAPABILITY_CATEGORY: DeviceCapabilityCategoryV0 = deviceCapabilityCatalogEntryV0(RENTAL_CAPABILITY_TYPE)?.category ?? "compute";
export const RENTAL_IDLE_MINUTES = { min: 5, max: 240 } as const;
const FIRST_TIME: DeviceRuleApprovalV0 = "first_time";

export type RentalIntegrity = "empty" | "ok" | "tampered" | "key_unavailable" | "unknown";
export type RentalBlocker =
  | "off"
  | "not_verified"
  | "unsupported_os"
  | "kill_switch"
  | "rule_invalid"
  | "nothing_open"
  | "outside_hours"
  | "idle_unknown"
  | "not_idle"
  | "power_unknown"
  | "not_on_mains"
  | "thermal_unknown"
  | "hot";
export interface RentalProbes {
  power: "ac" | "battery" | "unknown";
  idleSeconds: number | null;
  thermal: "nominal" | "elevated" | "unknown";
  killSwitch: boolean;
  supportedOs: boolean;
}
export interface RentalRulesView {
  enabled: boolean;
  integrity: RentalIntegrity;
  /** The stored rule as read back; check it with `validateRentalRule` before trusting it. */
  rule: Record<string, unknown> | null;
  idleMinutes: number;
  maxCores: number;
  maxMemoryGib: number;
  probes: RentalProbes;
  cpus: number;
  coresAllowed: number;
  memoryGibAllowed: number;
}
export interface RentalRulesInput {
  enabled: boolean;
  rule: DeviceCapabilityRuleV0 | null;
  idleMinutes: number;
  maxCores: number;
  maxMemoryGib: number;
}
export const RENTAL_RULES_COMMANDS = {
  get: "desktop_bridge_rental_rules_get",
  set: "desktop_bridge_rental_rules_set",
} as const;
const INTEGRITY: ReadonlySet<string> = new Set(["empty", "ok", "tampered", "key_unavailable"]);
export const UNKNOWN_RENTAL_RULES: RentalRulesView = {
  enabled: false,
  integrity: "unknown",
  rule: null,
  idleMinutes: 15,
  maxCores: 2,
  maxMemoryGib: 4,
  probes: { power: "unknown", idleSeconds: null, thermal: "unknown", killSwitch: true, supportedOs: false },
  cpus: 0,
  coresAllowed: 0,
  memoryGibAllowed: 0,
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function int(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}
export function normalizeRentalRulesView(raw: unknown): RentalRulesView {
  if (!isRecord(raw)) return { ...UNKNOWN_RENTAL_RULES };
  const integrity = typeof raw.integrity === "string" && INTEGRITY.has(raw.integrity) ? (raw.integrity as RentalIntegrity) : "unknown";
  const probesRaw = isRecord(raw.probes) ? raw.probes : {};
  return {
    // Only a verified file can be on.
    enabled: raw.enabled === true && integrity === "ok",
    integrity,
    rule: integrity === "ok" && isRecord(raw.rule) ? raw.rule : null,
    idleMinutes: int(raw.idleMinutes, RENTAL_IDLE_MINUTES.min, RENTAL_IDLE_MINUTES.max) ?? 15,
    maxCores: int(raw.maxCores, 1, 256) ?? 1,
    maxMemoryGib: int(raw.maxMemoryGib, 1, 4096) ?? 1,
    probes: {
      power: probesRaw.power === "ac" || probesRaw.power === "battery" ? probesRaw.power : "unknown",
      idleSeconds: int(probesRaw.idleSeconds, 0, Number.MAX_SAFE_INTEGER),
      thermal: probesRaw.thermal === "nominal" || probesRaw.thermal === "elevated" ? probesRaw.thermal : "unknown",
      // A missing reading counts as pulled.
      killSwitch: probesRaw.killSwitch !== false,
      supportedOs: probesRaw.supportedOs === true,
    },
    cpus: int(raw.cpus, 0, 4096) ?? 0,
    coresAllowed: int(raw.coresAllowed, 0, 4096) ?? 0,
    memoryGibAllowed: int(raw.memoryGibAllowed, 0, 1 << 20) ?? 0,
  };
}

/** The contract's check, for the one capability this computer rents out. */
export function validateRentalRule(rule: unknown): { valid: boolean; errors: string[] } {
  const result = validateDeviceCapabilityRuleV0(rule, RENTAL_CAPABILITY_CATEGORY);
  if (!result.valid) return result;
  const value = rule as DeviceCapabilityRuleV0;
  const errors: string[] = [];
  if (value.capabilityType !== RENTAL_CAPABILITY_TYPE) errors.push("capabilityType: only llm.generate.v1 is rented from this computer");
  if (!value.audience.includes("other_agents")) errors.push("audience: renting means other_agents");
  return { valid: errors.length === 0, errors };
}

/** A starting rule: renting to other owners' agents, idle and on mains only, ask the first time. Price and caps left for the owner. */
export function draftRentalRule(deviceId: string, timezone: string): Record<string, unknown> {
  return {
    deviceId,
    capabilityType: RENTAL_CAPABILITY_TYPE,
    audience: ["other_agents"],
    windows: [],
    timezone,
    requireIdle: true,
    requireOnPower: true,
    approval: FIRST_TIME,
    revision: 0,
  };
}

/** Minutes since midnight in an IANA time zone, or null when the zone is unknown here. */
export function minuteOfDayIn(timezone: string, now: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    return Number.isInteger(hour) && Number.isInteger(minute) ? (hour % 24) * 60 + minute : null;
  } catch {
    return null;
  }
}

/** ISO weekday (1 = Monday) in an IANA time zone, or null when the zone is unknown here. */
export function isoWeekdayIn(timezone: string, now: Date): number | null {
  try {
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short" }).format(now);
    const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day);
    return index >= 0 ? index + 1 : null;
  } catch {
    return null;
  }
}

export interface RentalVerdict {
  mayRent: boolean;
  blockers: RentalBlocker[];
}
/**
 * May a rented task run right now? Every reason it may not, in order. `flags` is the platform's switch table
 * (`DEVICE_*`); clients cannot read it yet, so callers pass `{}` and the answer includes `nothing_open`.
 */
export function rentalVerdict(view: RentalRulesView, now: Date, flags: Readonly<Record<string, string | undefined>> = {}): RentalVerdict {
  const blockers: RentalBlocker[] = [];
  if (!view.enabled || view.integrity !== "ok") blockers.push("off");
  if (view.integrity === "tampered" || view.integrity === "key_unavailable") blockers.push("not_verified");
  if (!view.probes.supportedOs) blockers.push("unsupported_os");
  if (view.probes.killSwitch) blockers.push("kill_switch");
  const valid = view.rule !== null && validateRentalRule(view.rule).valid;
  if (!valid) blockers.push("rule_invalid");
  if (!deviceCapabilityRentableV0(RENTAL_CAPABILITY_TYPE, RENTAL_CAPABILITY_CATEGORY, flags)) blockers.push("nothing_open");
  if (valid) {
    const rule = view.rule as unknown as DeviceCapabilityRuleV0;
    if (rule.windows.length > 0) {
      const minute = minuteOfDayIn(rule.timezone, now);
      const weekday = isoWeekdayIn(rule.timezone, now) ?? undefined;
      if (minute === null || !rule.windows.some((window) => deviceRuleWindowContainsV0(window, minute, weekday))) blockers.push("outside_hours");
    }
    if (rule.requireIdle) {
      if (view.probes.idleSeconds === null) blockers.push("idle_unknown");
      else if (view.probes.idleSeconds < view.idleMinutes * 60) blockers.push("not_idle");
    }
    if (rule.requireOnPower) {
      if (view.probes.power === "unknown") blockers.push("power_unknown");
      else if (view.probes.power !== "ac") blockers.push("not_on_mains");
    }
  }
  // Temperature is the desktop's own (the contract leaves it here).
  if (view.probes.thermal === "unknown") blockers.push("thermal_unknown");
  else if (view.probes.thermal === "elevated") blockers.push("hot");
  return { mayRent: blockers.length === 0, blockers };
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}
async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}
export type RentalRulesEditResult = { ok: true; view: RentalRulesView } | { ok: false; reason: string; errors?: string[] };
function reasonOf(error: unknown): string {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return /^[a-z_]{1,64}$/.test(text) ? text : "invoke_failed";
}
export async function readRentalRules(): Promise<RentalRulesView> {
  if (!hasNativeHost()) return { ...UNKNOWN_RENTAL_RULES };
  try {
    return normalizeRentalRulesView(await invokeNative<unknown>(RENTAL_RULES_COMMANDS.get));
  } catch {
    return { ...UNKNOWN_RENTAL_RULES };
  }
}
/** Saves after the contract's check; a rule that does not pass is not sent. */
export async function saveRentalRules(input: RentalRulesInput): Promise<RentalRulesEditResult> {
  if (input.rule !== null) {
    const check = validateRentalRule(input.rule);
    if (!check.valid) return { ok: false, reason: "rule_invalid", errors: check.errors };
  } else if (input.enabled) {
    return { ok: false, reason: "rule_missing" };
  }
  if (!hasNativeHost()) return { ok: false, reason: "no_native_host" };
  try {
    return { ok: true, view: normalizeRentalRulesView(await invokeNative<unknown>(RENTAL_RULES_COMMANDS.set, { rules: input })) };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

const BLOCKER_TEXT: Record<RentalBlocker, string> = {
  off: "出租没打开",
  not_verified: "规则文件被改过或读不到钥匙串，按关闭处理",
  unsupported_os: "这个系统还不支持出租（目前只有 macOS）",
  kill_switch: "急停拉着",
  rule_invalid: "规则还没填完整",
  nothing_open: "平台还没开放出租（本地模型推理）",
  outside_hours: "现在不在出租时段里",
  idle_unknown: "读不到你多久没用电脑",
  not_idle: "你最近在用电脑",
  power_unknown: "读不到是不是接着电源",
  not_on_mains: "没接电源",
  thermal_unknown: "读不到机器热不热",
  hot: "机器偏热或在降频",
};
export function describeRentalBlocker(blocker: RentalBlocker): string {
  return BLOCKER_TEXT[blocker];
}
const REASON_TEXT: Record<string, string> = {
  kill_switch_engaged: "急停拉着，不能打开出租",
  rule_missing: "先把规则填好再打开",
  rule_invalid: "规则没填对",
  rule_too_large: "规则太大了",
  idle_minutes_invalid: `空闲时间要在 ${RENTAL_IDLE_MINUTES.min} 到 ${RENTAL_IDLE_MINUTES.max} 分钟之间`,
  max_cores_invalid: "核数至少 1",
  max_memory_invalid: "内存至少 1 GB",
  rental_rules_key_unavailable: "读不到钥匙串，规则没有保存",
  rental_rules_write_failed: "写规则失败",
  no_native_host: "这个窗口不能调用本机功能",
};
export function describeRentalRulesReason(reason: string | undefined): string {
  if (!reason) return "";
  return REASON_TEXT[reason] ?? `没有完成（${reason}）`;
}
/** The contract's error strings start with the field name; say which field in Chinese. */
const FIELD_TEXT: Record<string, string> = {
  deviceId: "这台电脑的编号不对",
  capabilityType: "能力类型不对",
  audience: "出租对象不对",
  windows: "时段最多 8 段，每段写成 HH:MM-HH:MM，或者带星期几：1,2,3,4,5/HH:MM-HH:MM",
  timezone: "时区不对",
  "requireIdle / requireOnPower": "空闲和接电源的设置不对",
  approval: "批准方式不对（风险不低的能力不能选不用批准）",
  minPriceCentsPerJob: "要填每单最低价（至少 1 美分）",
  maxJobsPerDay: "要填每天最多几单（至少 1）",
  maxMinutesPerDay: "要填每天最多跑几分钟（至少 1）",
  revision: "版本号不对",
};
/** Contract v0.1: renting needs at least one window (an empty list is not "all day" for rental). */
const RENT_NEEDS_WINDOW = "出租至少要设一段时段（全天就写 00:00-00:00）";

export function describeRentalRuleErrors(errors: readonly string[] = []): string[] {
  return [
    ...new Set(
      errors.map((error) => (error.startsWith("windows: renting needs") ? RENT_NEEDS_WINDOW : FIELD_TEXT[error.split(":")[0]] ?? "规则没填对")),
    ),
  ];
}
export function ruleRisk(): string {
  return DEVICE_CAPABILITY_CATEGORY_POLICY_V0[RENTAL_CAPABILITY_CATEGORY].riskLevel;
}
