/**
 * 护照与名片的可见性操作分级与 step-up（合同 v1 草案，CONTRACTS.md；产品文档 8.3，D16）。
 *
 * 后端按操作的性质校验，不按客户端类型信任：
 * - 收紧类（tighten）：隐藏字段、缩短有效期、收回分享、取消公开分身。任何一端都能做，立即生效，
 *   响应里带回执。不需要预览摘要，也不需要 step-up。
 * - 放宽类（loosen）：新建分享、加字段、延长有效期、公开分身。
 * - 内容编辑（content_edit）：确认护照自我介绍。
 * - 放宽类和内容编辑都要：
 *   1. 先调对应的 preview 接口，拿到 `previewDigest`（它只绑定这次改动本身：对象、操作、改后的取值）；
 *   2. 提交时把同一个 `previewDigest` 放在请求体顶层；缺了返回 428 `VISIBILITY_PREVIEW_REQUIRED`，
 *      和服务端按提交内容重算的不一致返回 409 `VISIBILITY_PREVIEW_MISMATCH`（重新预览）；
 *   3. step-up：v1 的做法是"最近登录过"，即这次请求用的登录凭据签发于 `STEP_UP_MAX_AGE_SECONDS`
 *      之内；否则返回 403 `STEP_UP_REQUIRED`（`reasonCode: 'recent_sign_in_required'`），客户端让用户
 *      重新登录一次再重试。以后可以加更强的方式（通行密钥、邮箱验证码），不改这里的错误码。
 * - 摘要算法各端一致（纯 JS sha256，不依赖 Node），客户端也可以自己算来核对，但以服务端 preview 为准。
 * - 分级按改动的实际效果算，不看请求里写的意图：例如把 30 天的链接改成"7 天后过期"，如果它原本
 *   只剩 2 天，那是延长，按放宽处理。
 */
import { canonicalizeContextJsonV1 } from './context-gateway-digest';
import { sha256Hex, utf8Encode } from './trust-loop-primitives';
import {
  PASSPORT_SHARE_EXPIRIES,
  PASSPORT_SHARE_EXPIRY_MS,
  PASSPORT_SHARE_FIELDS_ALLOWED,
  isPassportShareField,
  passportShareStatus,
  type PassportAudience,
  type PassportShareExpiry,
  type PassportShareField,
} from './agent-passport';

export const VISIBILITY_ACTION_SCHEMA_VERSION = 'agentrix.visibility.v1' as const;
/** 摘要的域分隔串，防止同一段 JSON 在别的合同里被当成同一个摘要。 */
export const VISIBILITY_DIGEST_DOMAIN_V1 = 'AGENTRIX_VISIBILITY_PREVIEW_V1' as const;
export const VISIBILITY_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const VISIBILITY_TIERS = ['tighten', 'loosen', 'content_edit'] as const;
export type VisibilityTierV1 = (typeof VISIBILITY_TIERS)[number];

export const VISIBILITY_OBJECT_KINDS = ['passport_share', 'passport_persona', 'twin_public', 'representation_mandate', 'twin_indexing', 'order_offer'] as const;
export type VisibilityObjectKindV1 = (typeof VISIBILITY_OBJECT_KINDS)[number];

export const PASSPORT_SHARE_OPERATIONS = [
  'create',
  'add_fields',
  'extend_expiry',
  'hide_fields',
  'shorten_expiry',
  'revoke',
] as const;
export type PassportShareOperationV1 = (typeof PASSPORT_SHARE_OPERATIONS)[number];
export const PASSPORT_PERSONA_OPERATIONS = ['confirm'] as const;
export type PassportPersonaOperationV1 = (typeof PASSPORT_PERSONA_OPERATIONS)[number];
export const TWIN_PUBLIC_OPERATIONS = ['publish', 'unpublish'] as const;
export type TwinPublicOperationV1 = (typeof TWIN_PUBLIC_OPERATIONS)[number];
/** 代表授权（`representation-mandate.ts`）：建立和扩大是放宽，收窄和撤销是收紧。 */
export const REPRESENTATION_MANDATE_OPERATIONS = ['mandate_grant', 'mandate_widen', 'mandate_narrow', 'mandate_revoke'] as const;
export type RepresentationMandateOperationV1 = (typeof REPRESENTATION_MANDATE_OPERATIONS)[number];
/** 分身名片的搜索引擎收录（`digital-twin-public.ts`，7.5、D17，草案）：打开是放宽，关掉是收紧。 */
export const TWIN_INDEXING_OPERATIONS = ['index_on', 'index_off'] as const;
export type TwinIndexingOperationV1 = (typeof TWIN_INDEXING_OPERATIONS)[number];
/** 服务目录条目（`order-escrow.ts` v0.5，T7）：上架（开始公开收钱）是放宽，下架是收紧。 */
export const ORDER_OFFER_OPERATIONS = ['offer_publish', 'offer_withdraw'] as const;
export type OrderOfferOperationV1 = (typeof ORDER_OFFER_OPERATIONS)[number];
export type VisibilityOperationV1 =
  | PassportShareOperationV1
  | PassportPersonaOperationV1
  | TwinPublicOperationV1
  | RepresentationMandateOperationV1
  | TwinIndexingOperationV1
  | OrderOfferOperationV1;

/** 每个操作的级别。操作名在各对象之间不重复。 */
export const VISIBILITY_OPERATION_TIER: Readonly<Record<VisibilityOperationV1, VisibilityTierV1>> = {
  create: 'loosen',
  add_fields: 'loosen',
  extend_expiry: 'loosen',
  hide_fields: 'tighten',
  shorten_expiry: 'tighten',
  revoke: 'tighten',
  confirm: 'content_edit',
  publish: 'loosen',
  unpublish: 'tighten',
  mandate_grant: 'loosen',
  mandate_widen: 'loosen',
  mandate_narrow: 'tighten',
  mandate_revoke: 'tighten',
  index_on: 'loosen',
  index_off: 'tighten',
  offer_publish: 'loosen',
  offer_withdraw: 'tighten',
};

const OPERATION_ORDER: readonly VisibilityOperationV1[] = [
  ...PASSPORT_SHARE_OPERATIONS,
  ...PASSPORT_PERSONA_OPERATIONS,
  ...TWIN_PUBLIC_OPERATIONS,
  ...REPRESENTATION_MANDATE_OPERATIONS,
  ...TWIN_INDEXING_OPERATIONS,
  ...ORDER_OFFER_OPERATIONS,
];

/** 一次改动里只要有一项放宽，整次就按放宽算；有内容编辑按内容编辑算；空改动算收紧（什么也不放开）。 */
export function visibilityTierOfV1(operations: readonly VisibilityOperationV1[]): VisibilityTierV1 {
  const tiers = operations.map((operation) => VISIBILITY_OPERATION_TIER[operation]);
  if (tiers.includes('content_edit')) return 'content_edit';
  if (tiers.includes('loosen')) return 'loosen';
  return 'tighten';
}

/** 收紧类不需要预览摘要和 step-up；其余都需要。 */
export function visibilityTierRequiresConfirmationV1(tier: VisibilityTierV1): boolean {
  return tier !== 'tighten';
}

// ---------------------------------------------------------------------------
// 预览摘要

type JsonValueV1 = string | number | boolean | null | JsonValueV1[] | { [key: string]: JsonValueV1 };

/** 一次可见性改动：对象、对象引用、操作和改后的取值。摘要只由它决定。 */
export interface VisibilityChangeV1 {
  objectKind: VisibilityObjectKindV1;
  /** 新建分享、自我介绍、公开分身：Agent 账户 id；修改已有分享：shareId。 */
  objectRef: string;
  operations: VisibilityOperationV1[];
  change: { [key: string]: JsonValueV1 };
  /**
   * 预览时给主人看的那一份结果（例如访客会看到的护照视图）。带上它，提交时服务端按当时的数据重算，
   * 数据在预览之后变了（例如履历区间变了）摘要就对不上，要重新预览。没有可展示结果的操作不带。
   */
  rendered?: unknown;
}

export function isVisibilityDigestV1(value: unknown): value is string {
  return typeof value === 'string' && VISIBILITY_DIGEST_PATTERN.test(value);
}

/**
 * `sha256:<hex>`，对 `域串 + "\n" + 规范 JSON` 求 sha256。操作按固定顺序排列，键按字典序。
 * `rendered` 先按 JSON 往返一次（去掉 undefined，Date 变成 ISO 字符串），再参与规范化。
 */
export function visibilityPreviewDigestV1(input: VisibilityChangeV1): string {
  const operations = OPERATION_ORDER.filter((operation) => input.operations.includes(operation));
  const canonical = canonicalizeContextJsonV1({
    v: VISIBILITY_ACTION_SCHEMA_VERSION,
    objectKind: input.objectKind,
    objectRef: input.objectRef,
    operations,
    change: input.change,
    rendered: input.rendered === undefined ? null : (JSON.parse(JSON.stringify(input.rendered)) as JsonValueV1),
  });
  return `sha256:${sha256Hex(utf8Encode(`${VISIBILITY_DIGEST_DOMAIN_V1}\n${canonical}`))}`;
}

/** preview 接口在响应里带的这一段（各 preview 接口的 `data.visibility`）。 */
export interface VisibilityPreviewV1 {
  v: typeof VISIBILITY_ACTION_SCHEMA_VERSION;
  objectKind: VisibilityObjectKindV1;
  tier: VisibilityTierV1;
  operations: VisibilityOperationV1[];
  /** 收紧类也会给出摘要，提交时带不带都行。 */
  previewDigest: string;
  requiresStepUp: boolean;
}

export function buildVisibilityPreviewV1(change: VisibilityChangeV1): VisibilityPreviewV1 {
  const tier = visibilityTierOfV1(change.operations);
  return {
    v: VISIBILITY_ACTION_SCHEMA_VERSION,
    objectKind: change.objectKind,
    tier,
    operations: OPERATION_ORDER.filter((operation) => change.operations.includes(operation)),
    previewDigest: visibilityPreviewDigestV1(change),
    requiresStepUp: visibilityTierRequiresConfirmationV1(tier),
  };
}

/** 写操作成功后的回执（响应里的 `data.receipt`）。 */
export interface VisibilityActionReceiptV1 {
  v: typeof VISIBILITY_ACTION_SCHEMA_VERSION;
  objectKind: VisibilityObjectKindV1;
  objectRef: string;
  tier: VisibilityTierV1;
  operations: VisibilityOperationV1[];
  /**
   * `none`：收紧类，不需要确认。`preview_digest_and_recent_sign_in`：摘要一致且最近登录过。
   * `enforcement_disabled`：服务端临时关掉了校验（`AGENTRIX_VISIBILITY_STEP_UP_ENFORCED=0`），只作回滚阀门。
   */
  confirmedBy: 'none' | 'preview_digest_and_recent_sign_in' | 'enforcement_disabled';
  previewDigest: string | null;
  at: string;
}

// 各对象的改动构造函数：preview 和提交两边用同一个函数，摘要才对得上。

export function passportShareCreateChangeV1(
  agentId: string,
  request: { audience: PassportAudience; fields: readonly PassportShareField[]; expiresIn: PassportShareExpiry; label: string | null },
  rendered?: unknown,
): VisibilityChangeV1 {
  return {
    objectKind: 'passport_share',
    objectRef: agentId,
    operations: ['create'],
    change: {
      audience: request.audience,
      fields: orderedShareFields(request.audience, request.fields),
      expiresIn: request.expiresIn,
      label: request.label ?? null,
    },
    ...(rendered !== undefined ? { rendered } : {}),
  };
}

export function passportShareUpdateChangeV1(
  shareId: string,
  audience: PassportAudience,
  update: PassportShareUpdateV1,
  operations: readonly PassportShareOperationV1[],
  rendered?: unknown,
): VisibilityChangeV1 {
  return {
    objectKind: 'passport_share',
    objectRef: shareId,
    operations: [...operations],
    change: {
      fields: update.fields ? orderedShareFields(audience, update.fields) : null,
      expiresIn: update.expiresIn ?? null,
    },
    ...(rendered !== undefined ? { rendered } : {}),
  };
}

export function passportPersonaChangeV1(agentId: string, persona: { tagline: string; tags: readonly string[] }): VisibilityChangeV1 {
  return {
    objectKind: 'passport_persona',
    objectRef: agentId,
    operations: ['confirm'],
    change: { tagline: persona.tagline, tags: [...persona.tags] },
  };
}

export function twinPublicChangeV1(agentId: string, command: { action: 'publish' | 'unpublish'; topics?: readonly string[] }): VisibilityChangeV1 {
  return {
    objectKind: 'twin_public',
    objectRef: agentId,
    operations: [command.action],
    change: command.action === 'publish' ? { action: 'publish', topics: [...(command.topics ?? [])] } : { action: 'unpublish' },
  };
}

/** 分身名片收录：objectRef 是 Agent 账户 id；打开是 `index_on`（放宽），关掉是 `index_off`（收紧）。 */
export function twinIndexingChangeV1(agentId: string, indexing: 'index' | 'noindex'): VisibilityChangeV1 {
  return {
    objectKind: 'twin_indexing',
    objectRef: agentId,
    operations: [indexing === 'index' ? 'index_on' : 'index_off'],
    change: { indexing },
  };
}
function orderedShareFields(audience: PassportAudience, fields: readonly PassportShareField[]): PassportShareField[] {
  return PASSPORT_SHARE_FIELDS_ALLOWED[audience].filter((field) => fields.includes(field));
}

// ---------------------------------------------------------------------------
// 修改已有分享：`PATCH /api/agent-accounts/:id/passport/shares/:shareId`
// 预览：`POST /api/agent-accounts/:id/passport/shares/:shareId/preview`（同样的请求体）

/** 只能改字段和有效期。受众不能改（换受众就新建一条链接），标签 v1 不开放修改。 */
export interface PassportShareUpdateV1 {
  /** 改后的完整字段集；空数组表示全部隐藏（收紧）。 */
  fields?: PassportShareField[];
  /** 从现在起算；`never` 表示不过期。 */
  expiresIn?: PassportShareExpiry;
}

export interface PassportShareUpdateErrorV1 {
  field: 'body' | 'fields' | 'expiresIn' | 'previewDigest' | 'audience' | 'label';
  code: 'body_invalid' | 'field_unexpected' | 'audience_immutable' | 'fields_not_allowed' | 'expires_in_invalid' | 'preview_digest_invalid' | 'nothing_to_update';
  message: string;
}

export type PassportShareUpdateValidationV1 =
  | { ok: true; value: PassportShareUpdateV1; previewDigest: string | null }
  | { ok: false; errors: PassportShareUpdateErrorV1[] };

const SHARE_UPDATE_KEYS = new Set(['fields', 'expiresIn', 'previewDigest']);

export function validatePassportShareUpdateV1(input: unknown, audience: PassportAudience): PassportShareUpdateValidationV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ field: 'body', code: 'body_invalid', message: 'body must be an object' }] };
  }
  const record = input as Record<string, unknown>;
  const errors: PassportShareUpdateErrorV1[] = [];
  for (const key of Object.keys(record)) {
    if (SHARE_UPDATE_KEYS.has(key)) continue;
    if (key === 'audience') errors.push({ field: 'audience', code: 'audience_immutable', message: 'audience cannot change; create a new link instead' });
    else if (key === 'label') errors.push({ field: 'label', code: 'field_unexpected', message: 'label cannot be changed in v1' });
    else errors.push({ field: 'body', code: 'field_unexpected', message: `${key}: unexpected field` });
  }
  const value: PassportShareUpdateV1 = {};
  if (record.fields !== undefined) {
    const allowed = PASSPORT_SHARE_FIELDS_ALLOWED[audience];
    if (!Array.isArray(record.fields)) {
      errors.push({ field: 'fields', code: 'fields_not_allowed', message: 'fields must be an array' });
    } else {
      const rejected = record.fields.filter((raw) => !(isPassportShareField(raw) && allowed.includes(raw)));
      if (rejected.length) {
        errors.push({ field: 'fields', code: 'fields_not_allowed', message: `fields not allowed for audience "${audience}": ${rejected.map(String).join(', ')}` });
      } else {
        value.fields = allowed.filter((field) => (record.fields as unknown[]).includes(field));
      }
    }
  }
  if (record.expiresIn !== undefined) {
    if ((PASSPORT_SHARE_EXPIRIES as readonly unknown[]).includes(record.expiresIn)) value.expiresIn = record.expiresIn as PassportShareExpiry;
    else errors.push({ field: 'expiresIn', code: 'expires_in_invalid', message: `expiresIn must be one of ${PASSPORT_SHARE_EXPIRIES.join(', ')}` });
  }
  if (record.previewDigest !== undefined && !isVisibilityDigestV1(record.previewDigest)) {
    errors.push({ field: 'previewDigest', code: 'preview_digest_invalid', message: 'previewDigest must look like sha256:<64 hex>' });
  }
  if (record.fields === undefined && record.expiresIn === undefined) {
    errors.push({ field: 'body', code: 'nothing_to_update', message: 'send fields and/or expiresIn' });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value, previewDigest: typeof record.previewDigest === 'string' ? record.previewDigest : null };
}

export type PassportShareUpdateClassificationV1 =
  | {
      ok: true;
      operations: PassportShareOperationV1[];
      tier: VisibilityTierV1;
      next: { fields: PassportShareField[]; expiresAt: string | null };
    }
  | { ok: false; code: 'share_not_active' };

/**
 * 按效果分级。`current` 是库里的这一行；`nowMs` 由调用方给（预览和提交各算一次）。
 * 没有实际变化时 `operations` 为空，级别是收紧（什么也不放开）。
 */
export function classifyPassportShareUpdateV1(
  current: { audience: PassportAudience; fields: readonly PassportShareField[]; expiresAt: string | Date | null; revokedAt: string | Date | null },
  update: PassportShareUpdateV1,
  nowMs: number,
): PassportShareUpdateClassificationV1 {
  if (passportShareStatus(current, nowMs) !== 'active') return { ok: false, code: 'share_not_active' };
  const operations: PassportShareOperationV1[] = [];
  const currentFields = orderedShareFields(current.audience, current.fields);
  let nextFields = currentFields;
  if (update.fields) {
    nextFields = orderedShareFields(current.audience, update.fields);
    if (nextFields.some((field) => !currentFields.includes(field))) operations.push('add_fields');
    if (currentFields.some((field) => !nextFields.includes(field))) operations.push('hide_fields');
  }
  const currentExpiry = toMs(current.expiresAt);
  let nextExpiry = currentExpiry;
  if (update.expiresIn) {
    nextExpiry = update.expiresIn === 'never' ? null : nowMs + PASSPORT_SHARE_EXPIRY_MS[update.expiresIn];
    if (currentExpiry === null) {
      if (nextExpiry !== null) operations.push('shorten_expiry');
    } else if (nextExpiry === null || nextExpiry > currentExpiry) {
      operations.push('extend_expiry');
    } else if (nextExpiry < currentExpiry) {
      operations.push('shorten_expiry');
    }
  }
  const ordered = PASSPORT_SHARE_OPERATIONS.filter((operation) => operations.includes(operation));
  return {
    ok: true,
    operations: ordered,
    tier: visibilityTierOfV1(ordered),
    next: { fields: nextFields, expiresAt: nextExpiry === null ? null : new Date(nextExpiry).toISOString() },
  };
}

function toMs(value: string | Date | null): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// 错误码与 step-up

export const VISIBILITY_PREVIEW_REQUIRED_CODE = 'VISIBILITY_PREVIEW_REQUIRED' as const; // HTTP 428
export const VISIBILITY_PREVIEW_MISMATCH_CODE = 'VISIBILITY_PREVIEW_MISMATCH' as const; // HTTP 409
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED' as const; // HTTP 403
export const STEP_UP_RECENT_SIGN_IN_REASON = 'recent_sign_in_required' as const;
/** "最近登录"的窗口。全局错误过滤器只透传 `code`/`reasonCode`，客户端以这个常量为准。 */
export const STEP_UP_MAX_AGE_SECONDS = 600;
/** 容忍客户端和服务端的时钟差。 */
export const STEP_UP_CLOCK_SKEW_SECONDS = 60;

/**
 * `authIssuedAtSeconds` 是登录凭据的签发时间（JWT `iat`，秒）。
 * 以后如果加 token 续期，续出来的 token 必须保留原登录时间（例如另带 `auth_time`），不能用新的 `iat`
 * 冒充"刚登录"（REQ-backend-017.re-web）。
 */
export function isRecentSignInV1(authIssuedAtSeconds: unknown, nowMs: number, maxAgeSeconds: number = STEP_UP_MAX_AGE_SECONDS): boolean {
  if (typeof authIssuedAtSeconds !== 'number' || !Number.isFinite(authIssuedAtSeconds)) return false;
  const issuedMs = authIssuedAtSeconds * 1000;
  if (issuedMs > nowMs + STEP_UP_CLOCK_SKEW_SECONDS * 1000) return false;
  return nowMs - issuedMs <= maxAgeSeconds * 1000;
}
