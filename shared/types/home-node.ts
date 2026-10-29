/**
 * Home always-on node, v0 contract only (L7-3): a Raspberry Pi or mini PC as the family Agent's home, offering local
 * inference, a Home Assistant bridge where every appliance is granted on its own, and a home network tunnel. There is
 * never a shell. It waits for the desktop N0 work to be reused as the Linux package, so nothing reads this in v0.
 */

/** Future server switch; nothing reads it in v0. */
export const HOME_NODE_V0_FLAG = 'HOME_NODE_V0_ENABLED';

export const HOME_NODE_KINDS_V0 = ['raspberry_pi', 'mini_pc'] as const;
export type HomeNodeKindV0 = (typeof HOME_NODE_KINDS_V0)[number];

export const HOME_NODE_SERVICES_V0 = ['local_inference', 'home_assistant_bridge', 'home_tunnel'] as const;
export type HomeNodeServiceV0 = (typeof HOME_NODE_SERVICES_V0)[number];

export const HOME_APPLIANCE_ACTIONS_V0 = ['read', 'turn_on', 'turn_off', 'set'] as const;
export type HomeApplianceActionV0 = (typeof HOME_APPLIANCE_ACTIONS_V0)[number];

/** Home Assistant domains where every change needs the owner's confirmation, even with a grant. */
export const HOME_CONFIRM_EACH_TIME_DOMAINS_V0 = ['lock', 'alarm_control_panel', 'cover', 'valve'] as const;

export interface HomeApplianceGrantV0 {
  /** Home Assistant entity id, for example light.kitchen; no wildcards. */
  entityId: string;
  actions: HomeApplianceActionV0[];
  /** Family member who granted it. */
  grantedBy: string;
  /** ISO time; null means until revoked. */
  expiresAt: string | null;
}

const ENTITY = /^[a-z_]{2,32}\.[a-z0-9_]{1,64}$/;
const MEMBER = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

/** Only the three listed services; a shell, SSH or remote desktop is never offered. */
export function homeNodeServiceAllowedV0(service: string): boolean {
  return (HOME_NODE_SERVICES_V0 as readonly string[]).includes(service);
}

/** True only when a grant names exactly this entity and action and has not expired. */
export function homeApplianceActionAllowedV0(grants: readonly HomeApplianceGrantV0[], entityId: string, action: HomeApplianceActionV0, nowMs: number): boolean {
  return grants.some((g) => g.entityId === entityId && g.actions.includes(action) && (g.expiresAt === null || Date.parse(g.expiresAt) > nowMs));
}

/** Reads never ask; any change in a sensitive domain always asks. */
export function homeApplianceNeedsConfirmV0(entityId: string, action: HomeApplianceActionV0): boolean {
  if (action === 'read') return false;
  return (HOME_CONFIRM_EACH_TIME_DOMAINS_V0 as readonly string[]).includes(entityId.split('.')[0]);
}

export function decodeHomeApplianceGrantV0(value: unknown): HomeApplianceGrantV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { entityId, actions, grantedBy, expiresAt } = raw;
  if (typeof entityId !== 'string' || !ENTITY.test(entityId) || typeof grantedBy !== 'string' || !MEMBER.test(grantedBy)) return null;
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > HOME_APPLIANCE_ACTIONS_V0.length) return null;
  const kept: HomeApplianceActionV0[] = [];
  for (const action of actions) {
    if (typeof action !== 'string' || !(HOME_APPLIANCE_ACTIONS_V0 as readonly string[]).includes(action) || (kept as string[]).includes(action)) return null;
    kept.push(action as HomeApplianceActionV0);
  }
  let until: string | null = null;
  if (expiresAt !== null && expiresAt !== undefined) {
    if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
    until = expiresAt;
  }
  return { entityId, actions: kept, grantedBy, expiresAt: until };
}

// ── L8 第 3 批（D3，coord 10-20）：家庭任务 v1。只加不改：上面的东西一个字都没动。 ─────────────────────────

/**
 * 家庭任务：主人，或者主人规则里列出的家人，派给一台家庭节点的活。能力只有两种：本地推理（`llm.generate.v1`，只调节点本机
 * `127.0.0.1` 上的模型服务）和 Home Assistant 调用（`ha.call.v1`，按实体授权，敏感类每次要确认）。永远没有 shell。
 *
 * 流程：请求人（登录态里的主人或家人；不在请求体里）→ `HomeJobRequestV1` → 节点领单 → 敏感的家电动作先推一张确认卡给授权过的
 * 家人（`awaiting_confirmation`）→ 节点做完，用设备钥匙对 `homeJobReceiptMessageV1` 签名交回执（和出租回执
 * `deviceRentalReceiptMessageV0` 同一种 P-256 / P1363 签名）。不涉及钱。
 *
 * 谁能派给谁由主人规则决定（`device-capability.ts` 的 `DeviceCapabilityRuleV0`，经 `DeviceCapabilityRuleStorePortV1` 读）：
 * 家人受众只放行规则里列出的账户，而且要在时段内；没有规则一律拒绝。
 *
 * 开关：`HOME_NODE_V1_ENABLED`（要求 `DEVICE_MESH_V0_ENABLED` 也开着，否则当作关着）；家人受众另有
 * `FAMILY_ACCOUNT_AUDIENCE_V1_ENABLED`，只管新加的「家人受众」。都只认精确的 `'1'`，默认关。
 * 解码函数拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。
 */
export const HOME_NODE_V1_FLAG = 'HOME_NODE_V1_ENABLED';
export const HOME_NODE_V1_REQUIRES_FLAG = 'DEVICE_MESH_V0_ENABLED';
export const FAMILY_ACCOUNT_AUDIENCE_V1_FLAG = 'FAMILY_ACCOUNT_AUDIENCE_V1_ENABLED';

export const HOME_JOB_SCHEMA_VERSION_V1 = 1 as const;

export const HOME_JOB_CAPABILITY_TYPES_V1 = ['llm.generate.v1', 'ha.call.v1'] as const;
export type HomeJobCapabilityTypeV1 = (typeof HOME_JOB_CAPABILITY_TYPES_V1)[number];

export const HOME_JOB_STATUSES_V1 = ['pending', 'claimed', 'awaiting_confirmation', 'completed', 'failed', 'cancelled', 'expired'] as const;
export type HomeJobStatusV1 = (typeof HOME_JOB_STATUSES_V1)[number];

export const HOME_JOB_REQUESTER_ROLES_V1 = ['owner', 'family'] as const;
export type HomeJobRequesterRoleV1 = (typeof HOME_JOB_REQUESTER_ROLES_V1)[number];

export const HOME_JOB_LIMITS_V1 = {
  promptMaxChars: 16000,
  maxOutputTokensMax: 4096,
  dataKeysMax: 8,
  dataStringMax: 200,
} as const;

export const HOME_JOB_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  /** 不是这两种能力（shell、SSH、远程桌面、别的服务一律不收）。 */
  'service_not_allowed',
  /** 请求人不在规则里。 */
  'not_in_rule',
  'outside_window',
  /** 这个家电实体没有授权这个动作。 */
  'appliance_not_granted',
  /** 敏感类的动作还没有家人确认。 */
  'confirmation_required',
  'emergency_stopped',
  /** 不存在，或者不是这个主人的（不区分，不给探测）；家人看不到主人的其他设备也走这条。 */
  'not_found',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `HOME_NODE_V1_ENABLED` 没开，或者它的前置开关没开。 */
  'feature_disabled',
] as const;
export type HomeJobReasonCodeV1 = (typeof HOME_JOB_REASON_CODES_V1)[number];

export type HomeJobDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: HomeJobReasonCodeV1; field: string };

export interface HomeLlmTaskV1 {
  kind: 'llm.generate.v1';
  prompt: string;
  maxOutputTokens?: number;
}

export interface HomeAssistantTaskV1 {
  kind: 'ha.call.v1';
  /** Home Assistant 实体，例如 `light.kitchen`，不许通配。 */
  entityId: string;
  action: HomeApplianceActionV0;
  /** 只有 `turn_on` 和 `set` 能带，例如亮度。最多 8 项，值是短字符串、数字或布尔。 */
  data?: Record<string, string | number | boolean>;
}

export type HomeJobTaskV1 = HomeLlmTaskV1 | HomeAssistantTaskV1;

/** 派一个家庭任务。请求人不在里面，由服务端从登录态取。 */
export interface HomeJobRequestV1 {
  schemaVersion: typeof HOME_JOB_SCHEMA_VERSION_V1;
  nodeDeviceId: string;
  task: HomeJobTaskV1;
}

/** 一个家庭任务给请求人看的样子。 */
export interface HomeJobV1 {
  schemaVersion: typeof HOME_JOB_SCHEMA_VERSION_V1;
  /** `hj_` + 32 位小写十六进制。 */
  jobRef: string;
  nodeDeviceId: string;
  capabilityType: HomeJobCapabilityTypeV1;
  status: HomeJobStatusV1;
  requestedBy: HomeJobRequesterRoleV1;
  /** 这个任务做之前要不要家人确认（敏感类家电动作）。 */
  confirmationRequired: boolean;
  createdAt: string;
  finishedAt: string | null;
  /** 完成或失败后才有：`sha256:` + 结果原文的 SHA-256。 */
  resultDigest: string | null;
}

/** 节点交回执：用设备钥匙对 `homeJobReceiptMessageV1` 签名。 */
export interface HomeJobReceiptUploadV1 {
  schemaVersion: typeof HOME_JOB_SCHEMA_VERSION_V1;
  jobRef: string;
  status: 'completed' | 'failed';
  resultDigest: string;
  finishedAt: string;
  /** base64url 无填充的 64 字节 P1363 签名（86 个字符）。 */
  signature: string;
}

export const HOME_JOB_RECEIPT_DOMAIN_V1 = 'agentrix.home.job.receipt.v1' as const;

/** 签名的消息：域、设备、任务、状态、结果摘要、结束时间，六行，`\n` 分隔，没有结尾换行。失败的任务摘要写空串的摘要。 */
export function homeJobReceiptMessageV1(input: { deviceId: string; jobRef: string; status: 'completed' | 'failed'; resultDigest: string; finishedAt: string }): string {
  return [HOME_JOB_RECEIPT_DOMAIN_V1, input.deviceId, input.jobRef, input.status, input.resultDigest, input.finishedAt].join('\n');
}

/** 这个任务做之前要不要家人确认：只有 Home Assistant 的敏感类动作（锁、警报、窗帘、阀门的任何改动）。读和推理不要。 */
export function homeJobNeedsConfirmationV1(task: HomeJobTaskV1): boolean {
  return task.kind === 'ha.call.v1' && homeApplianceNeedsConfirmV0(task.entityId, task.action);
}

/** 能力名 → 任务种类。只认这两种；别的（包括 shell）返回 false。 */
export function homeJobCapabilityAllowedV1(capabilityType: string): capabilityType is HomeJobCapabilityTypeV1 {
  return (HOME_JOB_CAPABILITY_TYPES_V1 as readonly string[]).includes(capabilityType);
}

const HOME_JOB_REF_V1 = /^hj_[0-9a-f]{32}$/;
const HOME_OPAQUE_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOME_ISO_V1 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
/** 和 `device-capability.ts` 的 `DEVICE_RENTAL_RESULT_DIGEST_PATTERN_V0`、`DEVICE_CAPABILITY_SIGNATURE_PATTERN_V0` 一样（合同测试钉住）。 */
const HOME_DIGEST_V1 = /^sha256:[0-9a-f]{64}$/;
const HOME_SIGNATURE_V1 = /^[A-Za-z0-9_-]{86}$/;
const HOME_DATA_KEY_V1 = /^[a-z][a-z0-9_]{0,31}$/;
/**
 * Keys a job may never carry in `data`: Home Assistant merges these into the target set of a service call, so one
 * could widen a grant for one entity into a whole area, floor, label or device. `code` is the lock / alarm code.
 * The desktop node keeps the same list (`desktop/src-tauri/src/home_node/jobs.rs`, pinned by a contract test).
 */
export const HOME_DATA_DENIED_KEYS_V1 = ['entity_id', 'device_id', 'area_id', 'floor_id', 'label_id', 'code'] as const;
/**
 * The only `data` keys a job may carry, by (Home Assistant domain, action). Any other pair takes no `data`.
 * The desktop node keeps the same table (`jobs.rs`, pinned by a contract test).
 */
export const HOME_DATA_KEYS_V1: Readonly<Record<string, readonly string[]>> = {
  'light.turn_on': ['brightness', 'brightness_pct', 'color_temp', 'color_temp_kelvin', 'transition'],
  'light.set': ['brightness', 'brightness_pct', 'color_temp', 'color_temp_kelvin', 'transition'],
  'fan.turn_on': ['percentage'],
  'climate.set': ['temperature'],
  'cover.set': ['position'],
  'number.set': ['value'],
  'input_number.set': ['value'],
};
/** True when `key` is a `data` key this (domain, action) may carry. */
export function homeDataKeyAllowedV1(entityId: string, action: string, key: string): boolean {
  if ((HOME_DATA_DENIED_KEYS_V1 as readonly string[]).includes(key)) return false;
  const allowed = HOME_DATA_KEYS_V1[`${entityId.split('.')[0]}.${action}`];
  return allowed !== undefined && allowed.includes(key);
}
const HOME_CONTROL_V1 = /[\u0000-\u001f\u007f]/;

type HomeFailureV1 = { ok: false; reasonCode: HomeJobReasonCodeV1; field: string };

function homeFail(reasonCode: HomeJobReasonCodeV1, field: string): HomeFailureV1 {
  return { ok: false, reasonCode, field };
}

function homeIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function homeIsOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function homeIsIso(value: unknown): value is string {
  return typeof value === 'string' && HOME_ISO_V1.test(value) && Number.isFinite(Date.parse(value));
}

function homeCheckEnvelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): HomeFailureV1 | null {
  if (value.schemaVersion === undefined) return homeFail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return homeFail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== HOME_JOB_SCHEMA_VERSION_V1) return homeFail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return homeFail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return homeFail('missing_field', key);
  return null;
}

function decodeHomeTaskV1(value: unknown): HomeJobDecodeResultV1<HomeJobTaskV1> {
  if (!homeIsRecord(value)) return homeFail('invalid_type', 'task');
  if (value.kind === undefined) return homeFail('missing_field', 'task.kind');
  if (typeof value.kind !== 'string') return homeFail('invalid_type', 'task.kind');
  if (!homeJobCapabilityAllowedV1(value.kind)) return homeFail('service_not_allowed', 'task.kind');

  if (value.kind === 'llm.generate.v1') {
    for (const key of Object.keys(value)) if (!['kind', 'prompt', 'maxOutputTokens'].includes(key)) return homeFail('unknown_field', `task.${key}`);
    if (value.prompt === undefined) return homeFail('missing_field', 'task.prompt');
    if (typeof value.prompt !== 'string') return homeFail('invalid_type', 'task.prompt');
    if (value.prompt.trim().length === 0 || value.prompt.length > HOME_JOB_LIMITS_V1.promptMaxChars) return homeFail('invalid_value', 'task.prompt');
    const task: HomeLlmTaskV1 = { kind: 'llm.generate.v1', prompt: value.prompt };
    if (value.maxOutputTokens !== undefined) {
      if (typeof value.maxOutputTokens !== 'number') return homeFail('invalid_type', 'task.maxOutputTokens');
      if (!Number.isInteger(value.maxOutputTokens) || value.maxOutputTokens < 1 || value.maxOutputTokens > HOME_JOB_LIMITS_V1.maxOutputTokensMax) {
        return homeFail('invalid_value', 'task.maxOutputTokens');
      }
      task.maxOutputTokens = value.maxOutputTokens;
    }
    return { ok: true, value: task };
  }

  for (const key of Object.keys(value)) if (!['kind', 'entityId', 'action', 'data'].includes(key)) return homeFail('unknown_field', `task.${key}`);
  for (const key of ['entityId', 'action']) if (value[key] === undefined) return homeFail('missing_field', `task.${key}`);
  if (typeof value.entityId !== 'string') return homeFail('invalid_type', 'task.entityId');
  if (!ENTITY.test(value.entityId)) return homeFail('invalid_value', 'task.entityId');
  if (typeof value.action !== 'string') return homeFail('invalid_type', 'task.action');
  if (!homeIsOneOf(HOME_APPLIANCE_ACTIONS_V0, value.action)) return homeFail('invalid_value', 'task.action');
  const task: HomeAssistantTaskV1 = { kind: 'ha.call.v1', entityId: value.entityId, action: value.action };
  if (value.data !== undefined) {
    if (!homeIsRecord(value.data)) return homeFail('invalid_type', 'task.data');
    if (value.action !== 'turn_on' && value.action !== 'set') return homeFail('invalid_value', 'task.data');
    const entries = Object.entries(value.data);
    if (entries.length === 0 || entries.length > HOME_JOB_LIMITS_V1.dataKeysMax) return homeFail('invalid_value', 'task.data');
    const data: Record<string, string | number | boolean> = {};
    for (const [key, item] of entries) {
      if (!HOME_DATA_KEY_V1.test(key) || !homeDataKeyAllowedV1(value.entityId, value.action, key)) return homeFail('invalid_value', `task.data.${key}`);
      const text = typeof item === 'string';
      if (!(text || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))) return homeFail('invalid_type', `task.data.${key}`);
      if (text && ((item as string).length > HOME_JOB_LIMITS_V1.dataStringMax || HOME_CONTROL_V1.test(item as string))) return homeFail('invalid_value', `task.data.${key}`);
      data[key] = item as string | number | boolean;
    }
    task.data = data;
  }
  return { ok: true, value: task };
}

export function decodeHomeJobRequestV1(value: unknown): HomeJobDecodeResultV1<HomeJobRequestV1> {
  if (!homeIsRecord(value)) return homeFail('invalid_type', '$');
  const bad = homeCheckEnvelope(value, ['schemaVersion', 'nodeDeviceId', 'task'], ['nodeDeviceId', 'task']);
  if (bad) return bad;
  if (typeof value.nodeDeviceId !== 'string') return homeFail('invalid_type', 'nodeDeviceId');
  if (!HOME_OPAQUE_V1.test(value.nodeDeviceId)) return homeFail('invalid_value', 'nodeDeviceId');
  const task = decodeHomeTaskV1(value.task);
  if (task.ok === false) return task;
  return { ok: true, value: { schemaVersion: HOME_JOB_SCHEMA_VERSION_V1, nodeDeviceId: value.nodeDeviceId, task: task.value } };
}

export function decodeHomeJobV1(value: unknown): HomeJobDecodeResultV1<HomeJobV1> {
  if (!homeIsRecord(value)) return homeFail('invalid_type', '$');
  const keys = ['jobRef', 'nodeDeviceId', 'capabilityType', 'status', 'requestedBy', 'confirmationRequired', 'createdAt', 'finishedAt', 'resultDigest'];
  const bad = homeCheckEnvelope(value, ['schemaVersion', ...keys], keys);
  if (bad) return bad;
  if (typeof value.jobRef !== 'string') return homeFail('invalid_type', 'jobRef');
  if (!HOME_JOB_REF_V1.test(value.jobRef)) return homeFail('invalid_value', 'jobRef');
  if (typeof value.nodeDeviceId !== 'string') return homeFail('invalid_type', 'nodeDeviceId');
  if (!HOME_OPAQUE_V1.test(value.nodeDeviceId)) return homeFail('invalid_value', 'nodeDeviceId');
  if (typeof value.capabilityType !== 'string') return homeFail('invalid_type', 'capabilityType');
  if (!homeJobCapabilityAllowedV1(value.capabilityType)) return homeFail('service_not_allowed', 'capabilityType');
  if (typeof value.status !== 'string') return homeFail('invalid_type', 'status');
  if (!homeIsOneOf(HOME_JOB_STATUSES_V1, value.status)) return homeFail('invalid_value', 'status');
  if (typeof value.requestedBy !== 'string') return homeFail('invalid_type', 'requestedBy');
  if (!homeIsOneOf(HOME_JOB_REQUESTER_ROLES_V1, value.requestedBy)) return homeFail('invalid_value', 'requestedBy');
  if (typeof value.confirmationRequired !== 'boolean') return homeFail('invalid_type', 'confirmationRequired');
  if (value.capabilityType === 'llm.generate.v1' && value.confirmationRequired) return homeFail('invalid_value', 'confirmationRequired');
  if (typeof value.createdAt !== 'string') return homeFail('invalid_type', 'createdAt');
  if (!homeIsIso(value.createdAt)) return homeFail('invalid_value', 'createdAt');
  let finishedAt: string | null = null;
  if (value.finishedAt !== null) {
    if (typeof value.finishedAt !== 'string') return homeFail('invalid_type', 'finishedAt');
    if (!homeIsIso(value.finishedAt)) return homeFail('invalid_value', 'finishedAt');
    finishedAt = value.finishedAt;
  }
  let resultDigest: string | null = null;
  if (value.resultDigest !== null) {
    if (typeof value.resultDigest !== 'string') return homeFail('invalid_type', 'resultDigest');
    if (!HOME_DIGEST_V1.test(value.resultDigest)) return homeFail('invalid_value', 'resultDigest');
    resultDigest = value.resultDigest;
  }
  const done = value.status === 'completed' || value.status === 'failed';
  const ended = done || value.status === 'cancelled' || value.status === 'expired';
  if (ended !== (finishedAt !== null)) return homeFail('invalid_value', 'finishedAt');
  if (done !== (resultDigest !== null)) return homeFail('invalid_value', 'resultDigest');
  return {
    ok: true,
    value: {
      schemaVersion: HOME_JOB_SCHEMA_VERSION_V1,
      jobRef: value.jobRef,
      nodeDeviceId: value.nodeDeviceId,
      capabilityType: value.capabilityType,
      status: value.status,
      requestedBy: value.requestedBy,
      confirmationRequired: value.confirmationRequired,
      createdAt: value.createdAt,
      finishedAt,
      resultDigest,
    },
  };
}

export function decodeHomeJobReceiptUploadV1(value: unknown): HomeJobDecodeResultV1<HomeJobReceiptUploadV1> {
  if (!homeIsRecord(value)) return homeFail('invalid_type', '$');
  const keys = ['jobRef', 'status', 'resultDigest', 'finishedAt', 'signature'];
  const bad = homeCheckEnvelope(value, ['schemaVersion', ...keys], keys);
  if (bad) return bad;
  if (typeof value.jobRef !== 'string') return homeFail('invalid_type', 'jobRef');
  if (!HOME_JOB_REF_V1.test(value.jobRef)) return homeFail('invalid_value', 'jobRef');
  if (typeof value.status !== 'string') return homeFail('invalid_type', 'status');
  if (value.status !== 'completed' && value.status !== 'failed') return homeFail('invalid_value', 'status');
  if (typeof value.resultDigest !== 'string') return homeFail('invalid_type', 'resultDigest');
  if (!HOME_DIGEST_V1.test(value.resultDigest)) return homeFail('invalid_value', 'resultDigest');
  if (typeof value.finishedAt !== 'string') return homeFail('invalid_type', 'finishedAt');
  if (!homeIsIso(value.finishedAt)) return homeFail('invalid_value', 'finishedAt');
  if (typeof value.signature !== 'string') return homeFail('invalid_type', 'signature');
  if (!HOME_SIGNATURE_V1.test(value.signature)) return homeFail('invalid_value', 'signature');
  return {
    ok: true,
    value: {
      schemaVersion: HOME_JOB_SCHEMA_VERSION_V1,
      jobRef: value.jobRef,
      status: value.status,
      resultDigest: value.resultDigest,
      finishedAt: value.finishedAt,
      signature: value.signature,
    },
  };
}
