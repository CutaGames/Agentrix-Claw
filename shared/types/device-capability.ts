/**
 * 设备能力合同 v0 草案（I-069 / I-070，E93 / E94，路线图 v2 第 3 节）。**只有合同，没有实现。**
 *
 * 一个 Agent，多个身体：云端沙箱、电脑、手机、手表、以后的硬件，都是同一个 Agent 的设备，
 * 在 Soul Core 里是 shell（`soul-shell.ts`、`device-runtime-binding.ts`、`device-lifecycle.ts`）。
 * 这份合同统一 `personal-machine-mesh-v1`、`soul-shell-protocol`、`machine-economy-v1` 三份 spec
 * 里对"设备、能力、主人规则、调度、出租"的描述：
 * 1. 能力类型（开放的，按类别有风险等级和平台开关）；
 * 2. 设备声明自己的能力（设备钥匙签名，服务端只信签名过的、没过期的声明）；
 * 3. 主人逐项设规则：谁能用、什么时候、要不要批准、花多少；
 * 4. 调度：按能力、在线、隐私、成本选设备，**不悄悄退回云端**；
 * 5. 出租（机器经济第 3 步）：只开白名单任务，报价、计量、托管、回执、信誉进护照。
 *
 * 现有的 `personal-machine-mesh.ts`（PMM v1，`llm.generate.v1`、只给自己用）照旧有效；
 * 它的 `MachineExecutionCapabilityV1` 是这里 `llm.generate.v1` 能力在电脑上的具体声明。
 * `MACHINE_ECONOMY_*` 那批占位类型由第 5 节取代，实现时删掉。
 *
 * v0.1（REQ-backend-096 桌面 1/2/3/4/5/6/11、手机 8/9/12 的答复，全是加法）：时段可以按星期几；出租时至少一段时段；
 * 声明的摘要和签名格式、上报请求体、设备网配置的下发都写定了（第 6 节）；`conditions.foreground`；手机钥匙怎么签声明。
 * 桌面 8（模型和推理程序白名单）、9（设备签的执行回执）留到 v0.2，按桌面在 REQ-backend-096.re-desktop 里给的字段定。
 */
import { canonicalize, sha256Hex } from '../soul-core-l1/v1_1/canonical';

// ── 1. 能力类型 ──────────────────────────────────────────────────────────────────────

/** `<域>.<名字>.v<版本>`，全小写；类型是开放的，不在目录里的也能声明，按类别的平台开关走。 */
export const DEVICE_CAPABILITY_TYPE_PATTERN_V0 = /^[a-z][a-z0-9_]{1,31}\.[a-z][a-z0-9_]{1,47}\.v[1-9][0-9]{0,2}$/;

export const DEVICE_KINDS_V0 = ['cloud_sandbox', 'desktop', 'mobile', 'wearable', 'hardware'] as const;
export type DeviceKindV0 = (typeof DEVICE_KINDS_V0)[number];

/**
 * 能力类别。每一类有一个平台开关（`DEVICE_CAPABILITY_CATEGORY_FLAGS_V0`），默认关；
 * 风险高的类别只靠开关打开，不靠改代码（E94 ①）。
 */
export const DEVICE_CAPABILITY_CATEGORIES_V0 = [
  /** 本地模型推理、转码、渲染、沙箱里的代码：碰不到主人的数据。 */
  'compute',
  /** GPU 等专门算力。 */
  'accelerator',
  /** 本机文件、应用、已登录的网站：主人的私人数据。 */
  'owner_data',
  /** 浏览器会话（云端沙箱的浏览器，或主人电脑上的浏览器）。 */
  'browser',
  /** 通知、批准、钥匙（Soul Key）。 */
  'owner_presence',
  /** 定位、相机、麦克风、通讯录、日历：每次授权。 */
  'personal_sensor',
  /** 打印机、机器人等会动的硬件（MHS）：每次主人确认。 */
  'actuation',
  /** 家庭网络出口：等于"住宅代理"。 */
  'network_egress',
  /** 手机号、短信。 */
  'telephony',
] as const;
export type DeviceCapabilityCategoryV0 = (typeof DEVICE_CAPABILITY_CATEGORIES_V0)[number];

export const DEVICE_CAPABILITY_RISK_LEVELS_V0 = ['low', 'medium', 'high', 'critical'] as const;
export type DeviceCapabilityRiskLevelV0 = (typeof DEVICE_CAPABILITY_RISK_LEVELS_V0)[number];

export interface DeviceCapabilityCategoryPolicyV0 {
  riskLevel: DeviceCapabilityRiskLevelV0;
  /** 平台开关（环境变量名）。没有设成 `1` 时，这一类的能力不调度、不出租。 */
  platformFlag: string;
  /**
   * 路线图 3.2 左列（true）：出租总开关开着就能租。右列（false）：还要这一类自己的出租开关
   * `DEVICE_RENTAL_<类别大写>_ENABLED`，默认关，开之前单独评估；只改开关，不改代码（E94 ①）。
   */
  rentableByDefault: boolean;
  /** 会碰到主人的私人数据：调度时优先主人自己的设备，不退回云端。 */
  touchesOwnerData: boolean;
  /** 每次使用都要主人在设备上确认（规则里不能改成"不用批准"）。 */
  alwaysAsk: boolean;
}

export const DEVICE_CAPABILITY_CATEGORY_POLICY_V0: Readonly<Record<DeviceCapabilityCategoryV0, DeviceCapabilityCategoryPolicyV0>> = {
  compute: { riskLevel: 'low', platformFlag: 'DEVICE_CAPABILITY_COMPUTE_ENABLED', rentableByDefault: true, touchesOwnerData: false, alwaysAsk: false },
  accelerator: { riskLevel: 'medium', platformFlag: 'DEVICE_CAPABILITY_ACCELERATOR_ENABLED', rentableByDefault: true, touchesOwnerData: false, alwaysAsk: false },
  owner_data: { riskLevel: 'high', platformFlag: 'DEVICE_CAPABILITY_OWNER_DATA_ENABLED', rentableByDefault: false, touchesOwnerData: true, alwaysAsk: false },
  browser: { riskLevel: 'high', platformFlag: 'DEVICE_CAPABILITY_BROWSER_ENABLED', rentableByDefault: false, touchesOwnerData: true, alwaysAsk: false },
  owner_presence: { riskLevel: 'medium', platformFlag: 'DEVICE_CAPABILITY_OWNER_PRESENCE_ENABLED', rentableByDefault: false, touchesOwnerData: true, alwaysAsk: false },
  personal_sensor: { riskLevel: 'high', platformFlag: 'DEVICE_CAPABILITY_PERSONAL_SENSOR_ENABLED', rentableByDefault: false, touchesOwnerData: true, alwaysAsk: true },
  actuation: { riskLevel: 'critical', platformFlag: 'DEVICE_CAPABILITY_ACTUATION_ENABLED', rentableByDefault: false, touchesOwnerData: false, alwaysAsk: true },
  network_egress: { riskLevel: 'critical', platformFlag: 'DEVICE_CAPABILITY_NETWORK_EGRESS_ENABLED', rentableByDefault: false, touchesOwnerData: true, alwaysAsk: true },
  telephony: { riskLevel: 'critical', platformFlag: 'DEVICE_CAPABILITY_TELEPHONY_ENABLED', rentableByDefault: false, touchesOwnerData: true, alwaysAsk: true },
};

export interface DeviceCapabilityCatalogEntryV0 {
  type: string;
  category: DeviceCapabilityCategoryV0;
  /** 哪些设备通常有这种能力（界面用来提示，不是限制）。 */
  typicalKinds: readonly DeviceKindV0[];
}

/**
 * 已知的能力类型。不在这里的类型照样能声明，类别由声明里写明，但永远不在出租白名单里。
 */
export const DEVICE_CAPABILITY_CATALOG_V0: readonly DeviceCapabilityCatalogEntryV0[] = [
  { type: 'llm.generate.v1', category: 'compute', typicalKinds: ['desktop', 'cloud_sandbox'] },
  { type: 'media.transcode.v1', category: 'compute', typicalKinds: ['desktop', 'cloud_sandbox'] },
  { type: 'render.image.v1', category: 'accelerator', typicalKinds: ['desktop'] },
  { type: 'sandbox.code.v1', category: 'compute', typicalKinds: ['cloud_sandbox', 'desktop'] },
  { type: 'gpu.compute.v1', category: 'accelerator', typicalKinds: ['desktop'] },
  { type: 'fs.local.v1', category: 'owner_data', typicalKinds: ['desktop'] },
  { type: 'app.local.v1', category: 'owner_data', typicalKinds: ['desktop'] },
  { type: 'browser.session.v1', category: 'browser', typicalKinds: ['cloud_sandbox', 'desktop'] },
  { type: 'notify.push.v1', category: 'owner_presence', typicalKinds: ['mobile', 'wearable', 'desktop'] },
  { type: 'approve.owner.v1', category: 'owner_presence', typicalKinds: ['mobile', 'wearable'] },
  { type: 'key.sign.v1', category: 'owner_presence', typicalKinds: ['mobile'] },
  { type: 'sensor.location.v1', category: 'personal_sensor', typicalKinds: ['mobile', 'wearable'] },
  { type: 'sensor.camera.v1', category: 'personal_sensor', typicalKinds: ['mobile', 'desktop'] },
  { type: 'sensor.microphone.v1', category: 'personal_sensor', typicalKinds: ['mobile', 'desktop', 'wearable'] },
  { type: 'data.contacts.v1', category: 'personal_sensor', typicalKinds: ['mobile'] },
  { type: 'data.calendar.v1', category: 'personal_sensor', typicalKinds: ['mobile', 'desktop'] },
  { type: 'hardware.print.v1', category: 'actuation', typicalKinds: ['hardware'] },
  { type: 'hardware.robot.v1', category: 'actuation', typicalKinds: ['hardware'] },
  { type: 'network.egress.v1', category: 'network_egress', typicalKinds: ['desktop', 'mobile'] },
  { type: 'telephony.sms.v1', category: 'telephony', typicalKinds: ['mobile'] },
];

export function deviceCapabilityCatalogEntryV0(type: string): DeviceCapabilityCatalogEntryV0 | null {
  return DEVICE_CAPABILITY_CATALOG_V0.find((entry) => entry.type === type) ?? null;
}

/** 平台开关：读环境（服务端）或者服务端下发的开关表（客户端）。没有设成 `1` 就是关。 */
export function deviceCapabilityCategoryEnabledV0(
  category: DeviceCapabilityCategoryV0,
  flags: Readonly<Record<string, string | undefined>>,
): boolean {
  return flags[DEVICE_CAPABILITY_CATEGORY_POLICY_V0[category].platformFlag] === '1';
}

/** 出租总开关。 */
export const DEVICE_RENTAL_ENABLED_FLAG_V0 = 'DEVICE_RENTAL_V0_ENABLED';
/** 出租的任务白名单（逗号分隔）；没设时只有 `llm.generate.v1`（路线图 3.5：先只开本地模型推理）。 */
export const DEVICE_RENTAL_TYPES_FLAG_V0 = 'DEVICE_RENTAL_TYPES';
export const DEVICE_RENTAL_DEFAULT_TYPES_V0: readonly string[] = ['llm.generate.v1'];

export function deviceRentalCategoryFlagV0(category: DeviceCapabilityCategoryV0): string {
  return `DEVICE_RENTAL_${category.toUpperCase()}_ENABLED`;
}

export function deviceRentalTypesV0(flags: Readonly<Record<string, string | undefined>>): string[] {
  const raw = flags[DEVICE_RENTAL_TYPES_FLAG_V0];
  if (raw === undefined) return [...DEVICE_RENTAL_DEFAULT_TYPES_V0];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(item));
}

/**
 * 目录里的类型，类别以目录为准（声明里换个类别躲不过开关）；目录外的类型用声明里写的类别。
 */
export function deviceCapabilityEffectiveCategoryV0(type: string, declared: DeviceCapabilityCategoryV0): DeviceCapabilityCategoryV0 {
  return deviceCapabilityCatalogEntryV0(type)?.category ?? declared;
}

/**
 * 能不能出租，几样都要：出租总开关；类型在出租白名单里；类别开关开着；右列的类别还要它自己的出租开关。
 * 全部是开关，不用改代码就能开或关（E94 ①）。
 */
export function deviceCapabilityRentableV0(
  type: string,
  declaredCategory: DeviceCapabilityCategoryV0,
  flags: Readonly<Record<string, string | undefined>>,
): boolean {
  if (flags[DEVICE_RENTAL_ENABLED_FLAG_V0] !== '1') return false;
  if (!DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(type) || !deviceRentalTypesV0(flags).includes(type)) return false;
  const category = deviceCapabilityEffectiveCategoryV0(type, declaredCategory);
  if (!deviceCapabilityCategoryEnabledV0(category, flags)) return false;
  return DEVICE_CAPABILITY_CATEGORY_POLICY_V0[category].rentableByDefault || flags[deviceRentalCategoryFlagV0(category)] === '1';
}

// ── 2. 设备声明自己的能力 ──────────────────────────────────────────────────────────────

/**
 * 一台设备当前有哪些能力。由设备用 E32 登记的签名钥匙签名（和 PMM 签名产物同一套），
 * 服务端只信：签名对、钥匙和绑定还有效、没过期（`expiresAt`，最长 `DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS`）。
 * 云端沙箱没有设备钥匙，由服务端适配器代它声明（`attestedBy: 'platform_adapter'`）。
 */
export const DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION = 0 as const;
export const DEVICE_CAPABILITY_DECLARATION_DOMAIN_V0 = 'agentrix.device.capability.declaration.v0' as const;
export const DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS = 15 * 60;
export const DEVICE_CAPABILITY_DECLARATION_MAX_ITEMS = 32;

export const DEVICE_CAPABILITY_STATES_V0 = ['available', 'busy', 'unavailable'] as const;
export type DeviceCapabilityStateV0 = (typeof DEVICE_CAPABILITY_STATES_V0)[number];

export interface DeviceCapabilityItemV0 {
  type: string;
  /** 目录里的类型必须写目录的类别；目录外的类型写它自己的类别。 */
  category: DeviceCapabilityCategoryV0;
  state: DeviceCapabilityStateV0;
  /** 能力自己的上限（例如 `maxOutputTokens`、`maxExecutionMs`、`maxConcurrentJobs`）；只放非负整数。 */
  limits: Record<string, number>;
  /** 可选：具体实现（模型名、GPU 型号），只给界面显示，不参与授权。 */
  detail?: string;
}

export interface DeviceCapabilityDeclarationV0 {
  schemaVersion: typeof DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION;
  declarationId: string;
  deviceId: string;
  kind: DeviceKindV0;
  /** 这台设备是哪个 Agent 的 shell（`shell_session_binding`）。 */
  shellBindingRef: { type: 'shell_session_binding'; id: string; version: number };
  attestedBy: 'device_key' | 'platform_adapter';
  /** `device_key` 时必填：E32 的 `keyRef`。 */
  signerRef?: string;
  items: DeviceCapabilityItemV0[];
  /** 设备现在的状态：接电源、温度、空闲（调度和出租规则会用）；不知道就是 null。 */
  conditions: {
    onPower: boolean | null;
    thermalOk: boolean | null;
    idle: boolean | null;
    /**
     * v0.1（手机 12）：App 在不在前台（手机、手表）。`personal_sensor` 类只在前台时声明 `available`；
     * 调度时不在前台就跳过。电脑和云端不带这一项。
     */
    foreground?: boolean | null;
  };
  observedAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const DECLARATION_KEYS = ['schemaVersion', 'declarationId', 'deviceId', 'kind', 'shellBindingRef', 'attestedBy', 'signerRef', 'items', 'conditions', 'observedAt', 'expiresAt'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isOneOf<T extends string>(value: unknown, set: readonly T[]): value is T {
  return typeof value === 'string' && (set as readonly string[]).includes(value);
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}
function triState(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean';
}

/** 签名的消息：域、设备、声明编号、规范化后的声明摘要、时间，五行，`\n` 分隔，没有结尾换行。 */
export function deviceCapabilityDeclarationMessageV0(input: { deviceId: string; declarationId: string; digest: string; observedAt: string }): string {
  return [DEVICE_CAPABILITY_DECLARATION_DOMAIN_V0, input.deviceId, input.declarationId, input.digest, input.observedAt].join('\n');
}

/**
 * 服务端和三端共用：解码一份声明。任何一项不对，整份不收（不部分接受）；
 * `now` 用来拒绝过期的、有效期太长的、时间在未来的声明。
 */
export function decodeDeviceCapabilityDeclarationV0(
  value: unknown,
  now: Date,
): { ok: true; value: DeviceCapabilityDeclarationV0 } | { ok: false; errors: string[] } {
  if (!isRecord(value)) return { ok: false, errors: ['declaration: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!DECLARATION_KEYS.includes(key)) errors.push(`${key}: unknown field`);
  if (value.schemaVersion !== DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof value.declarationId !== 'string' || !UUID.test(value.declarationId)) errors.push('declarationId: uuid required');
  if (typeof value.deviceId !== 'string' || !OPAQUE.test(value.deviceId)) errors.push('deviceId: invalid');
  if (!isOneOf(value.kind, DEVICE_KINDS_V0)) errors.push('kind: unknown');
  const binding = value.shellBindingRef;
  if (!isRecord(binding) || binding.type !== 'shell_session_binding' || typeof binding.id !== 'string' || !UUID.test(binding.id) || !Number.isInteger(binding.version) || (binding.version as number) < 1) {
    errors.push('shellBindingRef: invalid');
  }
  if (!isOneOf(value.attestedBy, ['device_key', 'platform_adapter'] as const)) errors.push('attestedBy: unknown');
  if (value.attestedBy === 'device_key' && (typeof value.signerRef !== 'string' || !OPAQUE.test(value.signerRef))) errors.push('signerRef: required for device_key');
  if (value.attestedBy === 'platform_adapter' && value.kind !== 'cloud_sandbox') errors.push('attestedBy: platform_adapter only for cloud_sandbox');
  const items = value.items;
  if (!Array.isArray(items) || items.length > DEVICE_CAPABILITY_DECLARATION_MAX_ITEMS) {
    errors.push(`items: array of at most ${DEVICE_CAPABILITY_DECLARATION_MAX_ITEMS}`);
  } else {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const at = `items[${index}]`;
      if (!isRecord(item)) {
        errors.push(`${at}: expected object`);
        return;
      }
      if (typeof item.type !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(item.type)) errors.push(`${at}.type: invalid`);
      else if (seen.has(item.type)) errors.push(`${at}.type: duplicate`);
      else seen.add(item.type);
      if (!isOneOf(item.category, DEVICE_CAPABILITY_CATEGORIES_V0)) errors.push(`${at}.category: unknown`);
      else if (typeof item.type === 'string') {
        const entry = deviceCapabilityCatalogEntryV0(item.type);
        if (entry && entry.category !== item.category) errors.push(`${at}.category: must be ${entry.category} for ${item.type}`);
      }
      if (!isOneOf(item.state, DEVICE_CAPABILITY_STATES_V0)) errors.push(`${at}.state: unknown`);
      if (!isRecord(item.limits) || Object.entries(item.limits).some(([key, n]) => !/^[a-zA-Z][a-zA-Z0-9]{0,47}$/.test(key) || !Number.isInteger(n) || (n as number) < 0)) {
        errors.push(`${at}.limits: non-negative integers by name`);
      }
      if (item.detail !== undefined && (typeof item.detail !== 'string' || item.detail.length > 120)) errors.push(`${at}.detail: at most 120 characters`);
    });
  }
  const conditions = value.conditions;
  if (!isRecord(conditions) || !triState(conditions.onPower) || !triState(conditions.thermalOk) || !triState(conditions.idle)) {
    errors.push('conditions: onPower / thermalOk / idle are boolean or null');
  } else if (conditions.foreground !== undefined && !triState(conditions.foreground)) {
    errors.push('conditions.foreground: boolean or null');
  }
  if (!isIso(value.observedAt) || !isIso(value.expiresAt)) {
    errors.push('observedAt / expiresAt: ISO 8601 UTC');
  } else {
    const observed = Date.parse(value.observedAt);
    const expires = Date.parse(value.expiresAt);
    if (expires <= observed) errors.push('expiresAt: must be after observedAt');
    if (expires - observed > DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS * 1000) errors.push('expiresAt: too far after observedAt');
    if (observed > now.getTime() + 5 * 60 * 1000) errors.push('observedAt: in the future');
    if (expires <= now.getTime()) errors.push('expiresAt: expired');
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: value as unknown as DeviceCapabilityDeclarationV0 };
}

// ── 3. 主人规则 ──────────────────────────────────────────────────────────────────────

/** 谁能用：只有自己的 Agent / 家人（主人列出的账户）/ 别的主人的 Agent（就是出租）。 */
export const DEVICE_RULE_AUDIENCES_V0 = ['own_agents', 'family', 'other_agents'] as const;
export type DeviceRuleAudienceV0 = (typeof DEVICE_RULE_AUDIENCES_V0)[number];
/** 要不要批准：不用 / 第一次 / 每次。`alwaysAsk` 的类别只能是 `every_time`。 */
export const DEVICE_RULE_APPROVALS_V0 = ['never', 'first_time', 'every_time'] as const;
export type DeviceRuleApprovalV0 = (typeof DEVICE_RULE_APPROVALS_V0)[number];

export interface DeviceCapabilityRuleV0 {
  deviceId: string;
  capabilityType: string;
  audience: DeviceRuleAudienceV0[];
  /** `family` 时列出的账户编号，1–10 个。 */
  familyUserIds?: string[];
  /**
   * 只在这些时段（主人的时区，可以跨零点）：`HH:MM-HH:MM` 是每天；`1,2,3,4,5/HH:MM-HH:MM` 只在这几天（ISO 星期 1–7，
   * 升序不重复，跨零点的时段算开始那天）；起止相同 = 全天。空数组 = 全天，但**出租时不行**：出租至少写一段（v0.1，桌面 2）。
   */
  windows: string[];
  timezone: string;
  /**
   * 只在空闲 / 接电源时（电脑）。空闲多久由设备自己定（桌面 5–240 分钟），服务端不需要知道这个数。
   * 温度上限由桌面端自己管，超了就把能力报成 `busy`。设备本机还有一份主人规则，是上限：服务端规则只能更严，
   * 本机规则不允许时，声明里这项报 `busy` 或 `unavailable`（v0.1，桌面 3、4）。
   */
  requireIdle: boolean;
  requireOnPower: boolean;
  approval: DeviceRuleApprovalV0;
  /** 出租（`other_agents`）：每单最低价，美分。 */
  minPriceCentsPerJob?: number;
  /** 出租：每天最多多少单、最多跑多少分钟。 */
  maxJobsPerDay?: number;
  maxMinutesPerDay?: number;
  /** 规则的版本，改的时候带上（乐观并发）。 */
  revision: number;
}

const WINDOW = /^(?:([1-7](?:,[1-7]){0,6})\/)?(([01]\d|2[0-3]):[0-5]\d)-(([01]\d|2[0-3]):[0-5]\d)$/;

/** `null` when the window is not one; `days` is empty for "every day". */
function parseWindow(window: string): { days: number[]; from: number; to: number } | null {
  const match = WINDOW.exec(window);
  if (!match) return null;
  const days = match[1] ? match[1].split(',').map(Number) : [];
  if (days.some((day, index) => index > 0 && day <= days[index - 1])) return null;
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  return { days, from: minutes(match[2]), to: minutes(match[4]) };
}

/**
 * 校验主人规则的形状。会被拒绝的：`alwaysAsk` 的类别选了 `never` / `first_time`；出租（`other_agents`）
 * 没有最低价或每日上限；出租非低风险能力却选了 `never`。能不能出租看开关，由服务端用
 * `deviceCapabilityRentableV0` 另外判断：开关关着时，规则可以存，但不会接单。
 */
export function validateDeviceCapabilityRuleV0(value: unknown, declaredCategory: DeviceCapabilityCategoryV0): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['rule: expected object'] };
  const errors: string[] = [];
  if (typeof value.deviceId !== 'string' || !OPAQUE.test(value.deviceId)) errors.push('deviceId: invalid');
  if (typeof value.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(value.capabilityType)) errors.push('capabilityType: invalid');
  const category = typeof value.capabilityType === 'string' ? deviceCapabilityEffectiveCategoryV0(value.capabilityType, declaredCategory) : declaredCategory;
  const policy = DEVICE_CAPABILITY_CATEGORY_POLICY_V0[category];
  const audience = value.audience;
  const audienceOk = Array.isArray(audience) && audience.length > 0 && new Set(audience).size === audience.length && audience.every((a) => isOneOf(a, DEVICE_RULE_AUDIENCES_V0));
  if (!audienceOk) errors.push('audience: non-empty, distinct, own_agents / family / other_agents');
  const renting = Array.isArray(audience) && audience.includes('other_agents');
  if (Array.isArray(audience) && audience.includes('family')) {
    const ids = value.familyUserIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 10 || !ids.every((id) => typeof id === 'string' && UUID.test(id))) errors.push('familyUserIds: 1-10 account ids');
  }
  if (!Array.isArray(value.windows) || value.windows.length > 8 || !value.windows.every((w) => typeof w === 'string' && parseWindow(w) !== null)) {
    errors.push('windows: up to 8 of HH:MM-HH:MM or D,D/HH:MM-HH:MM (ISO weekdays, ascending)');
  } else if (renting && value.windows.length === 0) {
    errors.push('windows: renting needs at least one window (00:00-00:00 is all day)');
  }
  if (typeof value.timezone !== 'string' || !/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/.test(value.timezone)) errors.push('timezone: IANA name');
  if (typeof value.requireIdle !== 'boolean' || typeof value.requireOnPower !== 'boolean') errors.push('requireIdle / requireOnPower: boolean');
  if (!isOneOf(value.approval, DEVICE_RULE_APPROVALS_V0)) errors.push('approval: unknown');
  else if (policy.alwaysAsk && value.approval !== 'every_time') errors.push(`approval: ${category} always asks the owner (every_time)`);
  if (renting) {
    if (!Number.isInteger(value.minPriceCentsPerJob) || (value.minPriceCentsPerJob as number) < 1) errors.push('minPriceCentsPerJob: required to rent (at least 1)');
    for (const key of ['maxJobsPerDay', 'maxMinutesPerDay'] as const) {
      if (!Number.isInteger(value[key]) || (value[key] as number) < 1) errors.push(`${key}: required to rent (at least 1)`);
    }
    if (value.approval === 'never' && policy.riskLevel !== 'low') errors.push('approval: renting a non-low-risk capability needs first_time or every_time');
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) errors.push('revision: non-negative integer');
  return { valid: errors.length === 0, errors };
}

/**
 * 时段是否包含这个本地时间（分钟数 0–1439，ISO 星期 1–7）；跨零点的时段也算；起止相同 = 全天。
 * 带星期的时段按开始那天算：`5/22:00-02:00` 包含周五 23:00 和周六 01:00，不包含周六 23:00。
 * 带星期的时段不给 `isoWeekday` 一律不包含。
 */
export function deviceRuleWindowContainsV0(window: string, minuteOfDay: number, isoWeekday?: number): boolean {
  const parsed = typeof window === 'string' ? parseWindow(window) : null;
  if (!parsed || !Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1439) return false;
  const { days, from, to } = parsed;
  const onDay = (day: number) => days.length === 0 || days.includes(day);
  if (days.length > 0 && !(Number.isInteger(isoWeekday) && (isoWeekday as number) >= 1 && (isoWeekday as number) <= 7)) return false;
  const today = isoWeekday as number;
  const yesterday = today === 1 ? 7 : today - 1;
  if (from === to) return onDay(today);
  if (from < to) return minuteOfDay >= from && minuteOfDay < to && onDay(today);
  return (minuteOfDay >= from && onDay(today)) || (minuteOfDay < to && onDay(yesterday));
}

// ── 4. 调度：选哪台设备 ─────────────────────────────────────────────────────────────

/**
 * 按四件事选：有没有这种能力、在不在线、隐私、成本。
 * - 碰主人数据的任务（`privacy: 'owner_private'`，或者能力类别 `touchesOwnerData`）只在主人自己的设备上跑；
 *   这时只有云端沙箱能跑，就**不跑**，返回 `needs_owner_device`，由主人决定（PMM-R06 "诚实路由"）。
 * - 不悄悄退回云端：主人有能跑的设备、但这次选了云端沙箱，`fallback` 写明为什么，界面要显示。
 */
export const DEVICE_ROUTE_PRIVACY_V0 = ['owner_private', 'none'] as const;
export type DeviceRoutePrivacyV0 = (typeof DEVICE_ROUTE_PRIVACY_V0)[number];

export const DEVICE_ROUTE_SKIP_REASONS_V0 = [
  'capability_missing',
  'capability_busy',
  'declaration_expired',
  'offline',
  'category_disabled',
  'rule_audience',
  'rule_window',
  'rule_idle',
  'rule_power',
  'rule_daily_cap',
  'owner_private_needs_own_device',
  'cost_above_limit',
  'emergency_stopped',
] as const;
export type DeviceRouteSkipReasonV0 = (typeof DEVICE_ROUTE_SKIP_REASONS_V0)[number];

export const DEVICE_ROUTE_OUTCOMES_V0 = ['selected', 'needs_approval', 'needs_owner_device', 'no_device'] as const;
export type DeviceRouteOutcomeV0 = (typeof DEVICE_ROUTE_OUTCOMES_V0)[number];

export interface DeviceRouteRequestV0 {
  capabilityType: string;
  privacy: DeviceRoutePrivacyV0;
  /** 这一次最多花多少（美分）；用自己的设备是 0。 */
  maxCostCents: number;
  /** 谁发起：主人自己的 Agent、家人，或者别的主人的 Agent（买方）。 */
  requester: DeviceRuleAudienceV0;
}

export interface DeviceRouteCandidateV0 {
  deviceId: string;
  kind: DeviceKindV0;
  ownDevice: boolean;
  estimatedCostCents: number;
  /** 没被选中的原因；选中的那台是空数组。 */
  skipped: DeviceRouteSkipReasonV0[];
}

export interface DeviceRouteDecisionV0 {
  schemaVersion: 0;
  decisionId: string;
  request: DeviceRouteRequestV0;
  outcome: DeviceRouteOutcomeV0;
  /** `selected` / `needs_approval` 时是选中的设备，其余为 null。 */
  deviceId: string | null;
  candidates: DeviceRouteCandidateV0[];
  /** 选了云端沙箱、但主人有能跑这项的自己的设备时：那些设备为什么没选上。 */
  fallback: { toCloud: true; ownDevicesSkipped: DeviceRouteSkipReasonV0[] } | null;
  decidedAt: string;
}

/** 三端共用：解码调度决定（界面显示"在哪台设备上做的、为什么"）。不认识的值整份不收。 */
export function decodeDeviceRouteDecisionV0(value: unknown): DeviceRouteDecisionV0 | null {
  if (!isRecord(value) || value.schemaVersion !== 0) return null;
  if (typeof value.decisionId !== 'string' || !UUID.test(value.decisionId)) return null;
  if (!isOneOf(value.outcome, DEVICE_ROUTE_OUTCOMES_V0)) return null;
  const request = value.request;
  if (!isRecord(request) || typeof request.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(request.capabilityType)) return null;
  if (!isOneOf(request.privacy, DEVICE_ROUTE_PRIVACY_V0) || !isOneOf(request.requester, DEVICE_RULE_AUDIENCES_V0)) return null;
  if (!Number.isInteger(request.maxCostCents) || (request.maxCostCents as number) < 0) return null;
  const needsDevice = value.outcome === 'selected' || value.outcome === 'needs_approval';
  if (needsDevice ? typeof value.deviceId !== 'string' || !OPAQUE.test(value.deviceId) : value.deviceId !== null) return null;
  if (!Array.isArray(value.candidates)) return null;
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || typeof candidate.deviceId !== 'string' || !OPAQUE.test(candidate.deviceId)) return null;
    if (!isOneOf(candidate.kind, DEVICE_KINDS_V0) || typeof candidate.ownDevice !== 'boolean') return null;
    if (!Number.isInteger(candidate.estimatedCostCents) || (candidate.estimatedCostCents as number) < 0) return null;
    if (!Array.isArray(candidate.skipped) || !candidate.skipped.every((reason) => isOneOf(reason, DEVICE_ROUTE_SKIP_REASONS_V0))) return null;
  }
  if (needsDevice && !value.candidates.some((c) => isRecord(c) && c.deviceId === value.deviceId && Array.isArray(c.skipped) && c.skipped.length === 0)) return null;
  const fallback = value.fallback;
  if (fallback !== null) {
    if (!isRecord(fallback) || fallback.toCloud !== true || !Array.isArray(fallback.ownDevicesSkipped)) return null;
    if (!fallback.ownDevicesSkipped.every((reason) => isOneOf(reason, DEVICE_ROUTE_SKIP_REASONS_V0))) return null;
  }
  if (!isIso(value.decidedAt)) return null;
  return value as unknown as DeviceRouteDecisionV0;
}

/** 碰主人数据的任务：请求自己标了 `owner_private`，或者能力类别本身碰主人数据。 */
export function deviceRouteIsOwnerPrivateV0(request: Pick<DeviceRouteRequestV0, 'privacy' | 'capabilityType'>, declaredCategory: DeviceCapabilityCategoryV0): boolean {
  if (request.privacy === 'owner_private') return true;
  return DEVICE_CAPABILITY_CATEGORY_POLICY_V0[deviceCapabilityEffectiveCategoryV0(request.capabilityType, declaredCategory)].touchesOwnerData;
}

// ── 5. 出租（机器经济第 3 步，邀请制试点） ─────────────────────────────────────────────

/**
 * 链路：发现（护照 / A2A card）→ 报价 → 统一预算检查（D1，`spend-budget.ts`）→ 托管（订单托管）→
 * 执行（每个任务一个虚拟机，碰不到主人的数据）→ 计量和抽查 → 回执 → 结算 → 信誉进护照。
 * 卖方要过 KYC、报税和条款（`external-ports.ts` 的 `sellerPayoutReadinessV0`），付款走 `PaymentsPortV0`。
 */
export const DEVICE_RENTAL_UNITS_V0 = ['job', 'minute', 'thousand_tokens'] as const;
export type DeviceRentalUnitV0 = (typeof DEVICE_RENTAL_UNITS_V0)[number];

export interface DeviceRentalOfferV0 {
  schemaVersion: 0;
  offerRef: string;
  /** 卖方 Agent（`agentUniqueId`）；不暴露主人是谁、设备是哪台。 */
  sellerAgentId: string;
  capabilityType: string;
  unit: DeviceRentalUnitV0;
  priceCentsPerUnit: number;
  /** 单个任务的上限，取自设备声明的 `limits`。 */
  limits: Record<string, number>;
  /** 证明活真的干了：先只有"重复执行比对 / 抽样核验"。 */
  verification: 'replay_sample';
  /** 设备证明的强度。 */
  assurance: 'device_key' | 'hardware_attested';
  /** 卖方的完成数、完成率（万分比，没有记录时为 null）和争议数，来自护照。 */
  reputation: { completedJobs: number; completionRateBps: number | null; disputes: number };
  availableNow: boolean;
}

export interface DeviceRentalReceiptV0 {
  schemaVersion: 0;
  receiptRef: string;
  offerRef: string;
  /** 订单托管里的订单（`order-escrow.ts`），钱只走那里。 */
  orderId: string;
  capabilityType: string;
  unitsUsed: number;
  amountCents: number;
  /** 抽查结果：通过 / 不一致（进争议）/ 这一单没抽到。 */
  verification: 'passed' | 'mismatch' | 'not_sampled';
  /** 执行结果的摘要，买方可以核对。 */
  resultDigest: string;
  startedAt: string;
  finishedAt: string;
}

/** 三端共用：解码出租报价（市场页）。价格必须是正整数美分；不认识的值整份不收。 */
export function decodeDeviceRentalOfferV0(value: unknown): DeviceRentalOfferV0 | null {
  if (!isRecord(value) || value.schemaVersion !== 0) return null;
  if (typeof value.offerRef !== 'string' || !OPAQUE.test(value.offerRef)) return null;
  if (typeof value.sellerAgentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(value.sellerAgentId)) return null;
  if (typeof value.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(value.capabilityType)) return null;
  if (!isOneOf(value.unit, DEVICE_RENTAL_UNITS_V0)) return null;
  if (!Number.isInteger(value.priceCentsPerUnit) || (value.priceCentsPerUnit as number) < 1) return null;
  if (!isRecord(value.limits) || Object.values(value.limits).some((n) => !Number.isInteger(n) || (n as number) < 0)) return null;
  if (value.verification !== 'replay_sample' || !isOneOf(value.assurance, ['device_key', 'hardware_attested'] as const)) return null;
  const rep = value.reputation;
  if (!isRecord(rep) || !Number.isInteger(rep.completedJobs) || (rep.completedJobs as number) < 0) return null;
  if (!Number.isInteger(rep.disputes) || (rep.disputes as number) < 0) return null;
  if (rep.completionRateBps !== null && (!Number.isInteger(rep.completionRateBps) || (rep.completionRateBps as number) < 0 || (rep.completionRateBps as number) > 10000)) return null;
  if (typeof value.availableNow !== 'boolean') return null;
  return value as unknown as DeviceRentalOfferV0;
}

// ── 6. v0.1：声明的摘要和签名、上报、设备网配置 ───────────────────────────────────────────

/**
 * 声明的摘要（桌面 5、手机 9）：`sha256:` + 小写十六进制的 SHA-256，输入是整份声明的规范化 JSON（键按字典序递归排序、
 * 数组保持顺序、没有空白、值为 undefined 的键去掉；`soul-core-l1` 的 `canonicalize`）。声明里没有签名字段，签名单独放在
 * 上报的请求体里，所以摘要覆盖声明的每一个字段。三端和服务端都用这个函数（纯 TS 的 SHA-256，RN、浏览器、Node 一样）。
 */
export const DEVICE_CAPABILITY_DIGEST_PREFIX_V0 = 'sha256:' as const;

export function deviceCapabilityDeclarationCanonicalV0(declaration: DeviceCapabilityDeclarationV0): string {
  return canonicalize(JSON.parse(JSON.stringify(declaration)));
}

export function deviceCapabilityDeclarationDigestV0(declaration: DeviceCapabilityDeclarationV0): string {
  return `${DEVICE_CAPABILITY_DIGEST_PREFIX_V0}${sha256Hex(deviceCapabilityDeclarationCanonicalV0(declaration))}`;
}

/**
 * 签名（手机 9）：设备钥匙对 `deviceCapabilityDeclarationMessageV0`（五行：域、设备、声明编号、摘要、`observedAt`）做
 * ECDSA P-256 / SHA-256，IEEE P1363 编码（r‖s，64 字节），base64url 无填充（86 个字符）——和审批确认、设备安全事件同一种。
 *
 * 手机的钥匙（手机 8，按手机的倾向定 a + b）：
 * - a. 手机另登记一把**不要本人验证**的硬件钥匙，只签能力声明和心跳；要本人在场的那把只用来批准和 `key.sign.v1`。
 * - b. `owner_presence` 类（`notify.push.v1`、`approve.owner.v1`、`key.sign.v1`）不靠实时声明：登记过、推送 token 有效就算可达；
 *   `personal_sensor` 类只在前台时声明（`conditions.foreground`）。
 */
export const DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0 = /^[A-Za-z0-9_-]{86}$/;

/** `POST /api/devices/:deviceId/capabilities` 的请求体。`platform_adapter` 的声明只由服务端自己写，不经过这条路由。 */
export interface DeviceCapabilityUploadV0 {
  declaration: DeviceCapabilityDeclarationV0;
  signature: string;
}

/** 服务端用：解码上报（形状和时间；签名对不对、钥匙和绑定还有效由服务端另查）。路由里的设备要和声明里的一致。 */
export function decodeDeviceCapabilityUploadV0(
  value: unknown,
  routeDeviceId: string,
  now: Date,
): { ok: true; value: DeviceCapabilityUploadV0 } | { ok: false; errors: string[] } {
  if (!isRecord(value)) return { ok: false, errors: ['upload: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (key !== 'declaration' && key !== 'signature') errors.push(`${key}: unknown field`);
  if (typeof value.signature !== 'string' || !DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0.test(value.signature)) errors.push('signature: 64-byte P1363 in base64url');
  const decoded = decodeDeviceCapabilityDeclarationV0(value.declaration, now);
  if (decoded.ok === false) {
    errors.push(...(decoded as { ok: false; errors: string[] }).errors.map((error) => `declaration.${error}`));
  } else {
    const declaration = (decoded as { ok: true; value: DeviceCapabilityDeclarationV0 }).value;
    if (declaration.attestedBy !== 'device_key') errors.push('declaration.attestedBy: only device_key declarations are uploaded');
    if (declaration.deviceId !== routeDeviceId) errors.push('declaration.deviceId: does not match the route');
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: value as unknown as DeviceCapabilityUploadV0 };
}

/**
 * 设备网的路由（手机 11、桌面 11）。`config` 给客户端下发平台开关：只放 `DEVICE_*` 键，客户端缓存不超过
 * `DEVICE_MESH_CONFIG_MAX_AGE_SECONDS`，拿不到或过期就当全关（出租类别一律显示"平台还没开放"）。
 * 主人读自己设备能力和规则的视图、出租回执的解码器在 v0.2。
 */
export const DEVICE_MESH_ROUTES_V0 = {
  config: 'GET /api/device-mesh/config',
  declare: 'POST /api/devices/:deviceId/capabilities',
} as const;
export const DEVICE_MESH_CONFIG_MAX_AGE_SECONDS = 15 * 60;

export interface DeviceMeshConfigV0 {
  flags: Record<string, string>;
  fetchedAt: string;
}

/** 客户端用：解码下发的开关。只留 `DEVICE_` 开头、值是短字符串的键；`fetchedAt` 不对或太旧返回 null（当全关）。 */
export function decodeDeviceMeshConfigV0(value: unknown, nowMs: number): DeviceMeshConfigV0 | null {
  if (!isRecord(value) || !isRecord(value.flags) || !isIso(value.fetchedAt)) return null;
  const fetchedMs = Date.parse(value.fetchedAt);
  if (fetchedMs > nowMs + 5 * 60 * 1000 || nowMs - fetchedMs > DEVICE_MESH_CONFIG_MAX_AGE_SECONDS * 1000) return null;
  const flags: Record<string, string> = {};
  for (const [key, flag] of Object.entries(value.flags)) {
    if (/^DEVICE_[A-Z0-9_]{1,60}$/.test(key) && typeof flag === 'string' && flag.length <= 200) flags[key] = flag;
  }
  return { flags, fetchedAt: value.fetchedAt };
}

/**
 * `llm.generate.v1` 的 `limits` 用这些键（桌面 6，和桌面受限推理进程的上限一一对应，都是非负整数）；
 * `maxConcurrentJobs` 在 L5 固定为 1。出租计价 L5 先用 `job` / `minute`；`thousand_tokens` 的数是推理程序自己报的（桌面 10）。
 */
export const DEVICE_LLM_GENERATE_LIMIT_KEYS_V0 = [
  'maxPromptBytes',
  'maxOutputBytes',
  'maxOutputTokens',
  'maxExecutionMs',
  'maxCpuMs',
  'maxMemoryMiB',
  'cores',
  'maxConcurrentJobs',
] as const;

// ── 7. 出租任务和设备签的回执（10-03，L5 B 段；加法） ─────────────────────────────────────

/**
 * 出租任务的路由（服务端实现 `device-mesh/device-rental.*`，`DEVICE_RENTAL_V0_ENABLED` 默认关）：
 * 卖方主人发布报价、买方下单、卖方设备领任务和交回执、双方读任务、卖方看收入。
 */
export const DEVICE_RENTAL_ROUTES_V0 = {
  publishOffer: 'POST /api/device-rental/offers',
  listOffers: 'GET /api/device-rental/offers?capabilityType=',
  createJob: 'POST /api/device-rental/jobs',
  nextJob: 'GET /api/device-rental/jobs/next?deviceId=',
  submitReceipt: 'POST /api/device-rental/jobs/:jobRef/receipt',
  readJob: 'GET /api/device-rental/jobs/:jobRef',
  earnings: 'GET /api/device-rental/earnings',
} as const;

export const DEVICE_RENTAL_OFFER_REF_PATTERN_V0 = /^dro_[0-9a-f]{32}$/;
export const DEVICE_RENTAL_JOB_REF_PATTERN_V0 = /^drj_[0-9a-f]{32}$/;
export const DEVICE_RENTAL_RECEIPT_DOMAIN_V0 = 'agentrix.device.rental.receipt.v0' as const;
/** 出租任务的结果摘要：`sha256:` + 结果原文（UTF-8）的 SHA-256 小写十六进制。 */
export const DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0 = /^sha256:[0-9a-f]{64}$/;

/**
 * 设备签出租回执的消息（和能力声明同一把设备钥匙、同一种 P-256 / P1363 签名）：
 * 域、设备、任务、结果摘要、用量、结束时间，六行，`\n` 分隔，没有结尾换行。失败的任务用量写 0、结果摘要写空串的摘要。
 */
export function deviceRentalReceiptMessageV0(input: { deviceId: string; jobRef: string; resultDigest: string; unitsUsed: number; finishedAt: string }): string {
  return [DEVICE_RENTAL_RECEIPT_DOMAIN_V0, input.deviceId, input.jobRef, input.resultDigest, String(input.unitsUsed), input.finishedAt].join('\n');
}

export function deviceRentalResultDigestV0(result: string): string {
  return `${DEVICE_CAPABILITY_DIGEST_PREFIX_V0}${sha256Hex(result)}`;
}

export const DEVICE_RENTAL_JOB_STATUSES_V0 = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export type DeviceRentalJobStatusV0 = (typeof DEVICE_RENTAL_JOB_STATUSES_V0)[number];

/**
 * 一单出租任务给双方看的样子。买方看得到结果原文（只给一次，读过就清掉）；卖方看不到买方的输入（设备领任务时已经拿走）。
 * v0 的托管只是测试模式（`escrowState`），真钱不在今天范围。
 */
export interface DeviceRentalJobViewV0 {
  schemaVersion: 0;
  jobRef: string;
  offerRef: string;
  role: 'buyer' | 'seller';
  capabilityType: string;
  unit: DeviceRentalUnitV0;
  priceCentsPerUnit: number;
  maxUnits: number;
  maxAmountCents: number;
  status: DeviceRentalJobStatusV0;
  escrowState: 'held' | 'released' | 'refunded';
  unitsUsed: number | null;
  amountCents: number | null;
  resultDigest: string | null;
  /** 只有买方、只有第一次读的时候有。 */
  output: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** 三端共用：解码一单出租任务。不认识的值整份不收。 */
export function decodeDeviceRentalJobViewV0(value: unknown): DeviceRentalJobViewV0 | null {
  if (!isRecord(value) || value.schemaVersion !== 0) return null;
  if (typeof value.jobRef !== 'string' || !DEVICE_RENTAL_JOB_REF_PATTERN_V0.test(value.jobRef)) return null;
  if (typeof value.offerRef !== 'string' || !DEVICE_RENTAL_OFFER_REF_PATTERN_V0.test(value.offerRef)) return null;
  if (value.role !== 'buyer' && value.role !== 'seller') return null;
  if (typeof value.capabilityType !== 'string' || !DEVICE_CAPABILITY_TYPE_PATTERN_V0.test(value.capabilityType)) return null;
  if (!isOneOf(value.unit, DEVICE_RENTAL_UNITS_V0) || !isOneOf(value.status, DEVICE_RENTAL_JOB_STATUSES_V0)) return null;
  if (!isOneOf(value.escrowState, ['held', 'released', 'refunded'] as const)) return null;
  for (const key of ['priceCentsPerUnit', 'maxUnits', 'maxAmountCents'] as const) {
    if (!Number.isInteger(value[key]) || (value[key] as number) < 1) return null;
  }
  for (const key of ['unitsUsed', 'amountCents'] as const) {
    if (value[key] !== null && (!Number.isInteger(value[key]) || (value[key] as number) < 0)) return null;
  }
  if (value.resultDigest !== null && (typeof value.resultDigest !== 'string' || !DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0.test(value.resultDigest))) return null;
  if (value.output !== null && (typeof value.output !== 'string' || value.role !== 'buyer')) return null;
  if (!isIso(value.createdAt) || (value.finishedAt !== null && !isIso(value.finishedAt))) return null;
  return value as unknown as DeviceRentalJobViewV0;
}
