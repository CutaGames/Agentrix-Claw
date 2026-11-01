/**
 * Generic Archive items schema v2 (Portability G-02 contract freeze).
 *
 * This file is the versioned archive-item contract. It does not replace
 * `agent-portability.ts` and it does not grant Soul / Memory / conversation
 * write authority. Backend writers, readiness-by-type, and UI grouping are
 * follow-up work.
 *
 * Compatibility:
 * - `/1` remains readable. Official v1 archives only carried preference
 *   key/value items; the parser treats every coercible v1 item as preference.
 * - `/2` carries typed items: `preference | instruction | memory | conversation |
 *   project | knowledge | mcp_config | workflow`. `project` / `knowledge` /
 *   `mcp_config` / `workflow` reshape onto existing carriers (`knowledge`,
 *   `skill`, `workflow`); they are not new `PortableItemTypeV1` values.
 *   Producers keep emitting `/1` by default: the production backend
 *   (hotfix/web-smooth-be-20260828) recognizes `/1` only, and the frontend
 *   ships independently of the backend. `/2` emission is opt-in
 *   (`NEXT_PUBLIC_PORTABILITY_ARCHIVE_V2_ENABLED=1`) until the `/2`-aware
 *   backend parser is in production.
 * - Unknown item types safe-degrade to `unsupported` (`unknown_item_type`).
 *   They never throw.
 */

import {
  PORTABILITY_DATA_CLASSES,
  PORTABLE_ITEM_LOSSINESS,
  findPortableSecretViolations,
  type OpaqueExternalRefV1,
  type PortabilityDataClassV1,
  type PortabilityValidationIssueV1,
  type PortableItemLossinessV1,
  type PortableItemTypeV1,
} from './agent-portability';
import {
  computeDigest,
  type DigestRef,
} from './trust-loop-primitives';

export const GENERIC_ARCHIVE_ITEMS_SCHEMA_V1 =
  'agentrix.generic-archive-items/1' as const;
export const GENERIC_ARCHIVE_ITEMS_SCHEMA_V2 =
  'agentrix.generic-archive-items/2' as const;
/** Every reader must accept both versions; which one a producer emits is a rollout decision. */
export const GENERIC_ARCHIVE_ITEMS_SCHEMAS = [
  GENERIC_ARCHIVE_ITEMS_SCHEMA_V1,
  GENERIC_ARCHIVE_ITEMS_SCHEMA_V2,
] as const;
export type GenericArchiveItemsSchemaVersion =
  (typeof GENERIC_ARCHIVE_ITEMS_SCHEMAS)[number];

export const GENERIC_ARCHIVE_ITEM_TYPES_V2 = [
  'preference',
  'instruction',
  'memory',
  'conversation',
  'project',
  'knowledge',
  'mcp_config',
  'workflow',
] as const;
export type GenericArchiveItemTypeV2 =
  (typeof GENERIC_ARCHIVE_ITEM_TYPES_V2)[number];

/**
 * Retention is archive-item metadata only. `archived_only` is the honest
 * default for conversation excerpts until a conversation owner writer exists.
 */
export const GENERIC_ARCHIVE_RETENTION_V2 = [
  'session',
  'until_revoked',
  'owner_managed',
  'archived_only',
  'unknown',
] as const;
export type GenericArchiveRetentionV2 =
  (typeof GENERIC_ARCHIVE_RETENTION_V2)[number];

export const GENERIC_ARCHIVE_ITEM_UNSUPPORTED_REASONS_V2 = [
  'unknown_item_type',
  'unrecognized_payload_shape',
  'secret_prohibited',
  'invalid_item',
] as const;
export type GenericArchiveItemUnsupportedReasonV2 =
  (typeof GENERIC_ARCHIVE_ITEM_UNSUPPORTED_REASONS_V2)[number];

export interface GenericArchivePreferencePayloadV2 {
  key: string;
  value: string;
  scope?: string;
  capturedAt?: string;
}

export interface GenericArchiveInstructionPayloadV2 {
  text: string;
  title?: string;
  filename?: string;
  language?: string;
}

export interface GenericArchiveMemoryPayloadV2 {
  content: string;
  enabled?: boolean;
  capturedAt?: string;
}

export interface GenericArchiveConversationPayloadV2 {
  excerpt: string;
  title?: string;
  messageCount?: number;
  capturedAt?: string;
}

export interface GenericArchiveProjectPayloadV2 {
  title: string;
  instructions?: string;
  fileNames?: string[];
  threadCount?: number;
}

export type GenericArchiveKnowledgeKindV2 =
  | 'document'
  | 'dataset'
  | 'prompt_library'
  | 'ignore_rules'
  | 'ide_manifest';

export interface GenericArchiveKnowledgePayloadV2 {
  content: string;
  title?: string;
  citation?: string;
  kind?: GenericArchiveKnowledgeKindV2;
}

export interface GenericArchiveMcpConfigPayloadV2 {
  name: string;
  command?: string;
  url?: string;
  envKeys?: string[];
  redactedKeys?: string[];
}

export interface GenericArchiveWorkflowPayloadV2 {
  name: string;
  description?: string;
  triggerType?: string;
}

export type GenericArchiveItemPayloadV2 =
  | GenericArchivePreferencePayloadV2
  | GenericArchiveInstructionPayloadV2
  | GenericArchiveMemoryPayloadV2
  | GenericArchiveConversationPayloadV2
  | GenericArchiveProjectPayloadV2
  | GenericArchiveKnowledgePayloadV2
  | GenericArchiveMcpConfigPayloadV2
  | GenericArchiveWorkflowPayloadV2;

interface GenericArchiveItemBaseV2 {
  sourceRef: OpaqueExternalRefV1;
  sourceDigest: DigestRef;
  sensitivity: PortabilityDataClassV1;
  confidence: number;
  lossiness: PortableItemLossinessV1;
  retention: GenericArchiveRetentionV2;
}

export type GenericArchiveItemV2 =
  | (GenericArchiveItemBaseV2 & {
      itemType: 'preference';
      payload: GenericArchivePreferencePayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'instruction';
      payload: GenericArchiveInstructionPayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'memory';
      payload: GenericArchiveMemoryPayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'conversation';
      payload: GenericArchiveConversationPayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'project';
      payload: GenericArchiveProjectPayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'knowledge';
      payload: GenericArchiveKnowledgePayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'mcp_config';
      payload: GenericArchiveMcpConfigPayloadV2;
    })
  | (GenericArchiveItemBaseV2 & {
      itemType: 'workflow';
      payload: GenericArchiveWorkflowPayloadV2;
    });

export interface GenericArchiveItemsDocumentV2 {
  schemaVersion: typeof GENERIC_ARCHIVE_ITEMS_SCHEMA_V2;
  items: GenericArchiveItemV2[];
}

export interface GenericArchiveUnsupportedItemV2 {
  itemIndex: number;
  reasonCode: GenericArchiveItemUnsupportedReasonV2;
  itemType?: string;
  sourceRef?: OpaqueExternalRefV1;
}

export interface GenericArchiveItemsParseOptionsV2 {
  rejectSecrets?: boolean;
}

export interface GenericArchiveItemsParseResultV2 {
  valid: boolean;
  schemaVersion?: GenericArchiveItemsSchemaVersion;
  items: GenericArchiveItemV2[];
  unsupported: GenericArchiveUnsupportedItemV2[];
  issues: PortabilityValidationIssueV1[];
}

const HEX_64 = /^[0-9a-f]{64}$/;
const REF_NAMESPACE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const REF_COMPONENT = /^[^\u0000-\u001f\u007f]{1,512}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const ITEM_TYPE_SET = new Set<string>(GENERIC_ARCHIVE_ITEM_TYPES_V2);
const DATA_CLASS_SET = new Set<string>(PORTABILITY_DATA_CLASSES);
const LOSSINESS_SET = new Set<string>(PORTABLE_ITEM_LOSSINESS);
const RETENTION_SET = new Set<string>(GENERIC_ARCHIVE_RETENTION_V2);
const SCHEMA_SET = new Set<string>(GENERIC_ARCHIVE_ITEMS_SCHEMAS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function issue(
  issues: PortabilityValidationIssueV1[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isBoundedString(value: unknown, maxLength = 512): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !RFC3339_UTC.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return undefined;
  }
  return value;
}

export function isGenericArchiveItemsSchemaVersion(
  value: unknown,
): value is GenericArchiveItemsSchemaVersion {
  return typeof value === 'string' && SCHEMA_SET.has(value);
}

/**
 * Recognition only — not writer authority.
 *
 * Which `PortableItemTypeV1` carries each `/2` item type once the backend
 * parser has validated it. Whether that carrier type is actually written is
 * decided downstream by the owner writer registry and its flags:
 *   - `preference`   -> `preference`   (preference owner)
 *   - `instruction`  -> `persona`      (Agent persona/goal owner; the
 *                       instruction text becomes persona `instructions`)
 *   - `memory`       -> `fact_memory`  (recognized; written only when a memory
 *                       owner writer is registered, parked otherwise)
 *   - `conversation` -> `conversation` (conversation owner)
 *   - `project`      -> `knowledge`    (professional owner, kind project)
 *   - `knowledge`    -> `knowledge`    (professional owner, kind document)
 *   - `mcp_config`   -> `skill`        (professional owner, inert declaration)
 *   - `workflow`     -> `workflow`     (professional owner, inert declaration)
 * A `null` entry would mean "no carrier type": the backend parser parks such
 * items as `unknown_item_type`.
 */
export const ARCHIVE_ITEM_RECOGNITION_V2: Record<
  GenericArchiveItemTypeV2,
  PortableItemTypeV1 | null
> = {
  preference: 'preference',
  conversation: 'conversation',
  instruction: 'persona',
  memory: 'fact_memory',
  project: 'knowledge',
  knowledge: 'knowledge',
  mcp_config: 'skill',
  workflow: 'workflow',
};

export function defaultArchiveMetadataV2(itemType: GenericArchiveItemTypeV2): Pick<
  GenericArchiveItemV2,
  'sensitivity' | 'confidence' | 'lossiness' | 'retention'
> {
  const conversation = itemType === 'conversation';
  const redacted = itemType === 'mcp_config' || itemType === 'workflow';
  return {
    sensitivity: 'owner',
    confidence: 1,
    lossiness: conversation ? 'summary_only' : redacted ? 'partial' : 'lossless',
    retention: conversation ? 'archived_only' : 'owner_managed',
  };
}

export function isGenericArchiveItemTypeV2(
  value: unknown,
): value is GenericArchiveItemTypeV2 {
  return typeof value === 'string' && ITEM_TYPE_SET.has(value);
}

export function isGenericArchiveItemsDocument(
  value: unknown,
): value is { schemaVersion: GenericArchiveItemsSchemaVersion; items: unknown[] } {
  return (
    isPlainObject(value) &&
    isGenericArchiveItemsSchemaVersion(value.schemaVersion) &&
    Array.isArray(value.items)
  );
}

export function isGenericArchiveItemsDocumentV1(
  value: unknown,
): value is { schemaVersion: typeof GENERIC_ARCHIVE_ITEMS_SCHEMA_V1; items: unknown[] } {
  return (
    isGenericArchiveItemsDocument(value) &&
    value.schemaVersion === GENERIC_ARCHIVE_ITEMS_SCHEMA_V1
  );
}

export function isGenericArchiveItemsDocumentV2(
  value: unknown,
): value is GenericArchiveItemsDocumentV2 {
  return (
    isGenericArchiveItemsDocument(value) &&
    value.schemaVersion === GENERIC_ARCHIVE_ITEMS_SCHEMA_V2
  );
}

function parseSourceRef(value: unknown): OpaqueExternalRefV1 | undefined {
  if (!isPlainObject(value)) return undefined;
  const { namespace, objectType, id } = value;
  if (
    !isBoundedString(namespace) ||
    !REF_NAMESPACE.test(namespace) ||
    !isBoundedString(objectType) ||
    !REF_COMPONENT.test(objectType) ||
    !isBoundedString(id) ||
    !REF_COMPONENT.test(id)
  ) {
    return undefined;
  }
  if (value.version === undefined) return { namespace, objectType, id };
  const version = value.version;
  if (!isBoundedString(version) || !REF_COMPONENT.test(version)) return undefined;
  return { namespace, objectType, id, version };
}

function parseDigest(value: unknown): DigestRef | undefined {
  if (!isPlainObject(value)) return undefined;
  if (
    value.algorithm !== 'sha-256' ||
    typeof value.canonicalization !== 'string' ||
    value.canonicalization.trim().length === 0 ||
    typeof value.value !== 'string' ||
    !HEX_64.test(value.value)
  ) {
    return undefined;
  }
  return {
    algorithm: 'sha-256',
    canonicalization: value.canonicalization,
    value: value.value,
  };
}

function parseConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return undefined;
  }
  return value;
}

function hasSecretViolation(value: unknown): boolean {
  return findPortableSecretViolations(value).length > 0;
}

function preferencePayload(
  value: unknown,
): GenericArchivePreferencePayloadV2 | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!isBoundedString(value.key, 120) || typeof value.value !== 'string') {
    return undefined;
  }
  const scope = isBoundedString(value.scope, 120) ? value.scope : undefined;
  const capturedAt = optionalTimestamp(value.capturedAt);
  return {
    key: value.key,
    value: value.value,
    ...(scope === undefined ? {} : { scope }),
    ...(capturedAt === undefined ? {} : { capturedAt }),
  };
}

function instructionPayload(
  value: unknown,
): GenericArchiveInstructionPayloadV2 | undefined {
  if (!isPlainObject(value) || typeof value.text !== 'string' || value.text.trim().length === 0) {
    return undefined;
  }
  const title = isBoundedString(value.title, 1_024) ? value.title : undefined;
  const filename = isBoundedString(value.filename, 512) ? value.filename : undefined;
  const language = isBoundedString(value.language, 32) ? value.language : undefined;
  return {
    text: value.text,
    ...(title === undefined ? {} : { title }),
    ...(filename === undefined ? {} : { filename }),
    ...(language === undefined ? {} : { language }),
  };
}

function memoryPayload(value: unknown): GenericArchiveMemoryPayloadV2 | undefined {
  if (!isPlainObject(value) || typeof value.content !== 'string' || value.content.trim().length === 0) {
    return undefined;
  }
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : undefined;
  const capturedAt = optionalTimestamp(value.capturedAt);
  return {
    content: value.content,
    ...(enabled === undefined ? {} : { enabled }),
    ...(capturedAt === undefined ? {} : { capturedAt }),
  };
}

function conversationPayload(
  value: unknown,
): GenericArchiveConversationPayloadV2 | undefined {
  if (!isPlainObject(value) || typeof value.excerpt !== 'string' || value.excerpt.trim().length === 0) {
    return undefined;
  }
  const title = isBoundedString(value.title, 1_024) ? value.title : undefined;
  const messageCount =
    typeof value.messageCount === 'number' &&
    Number.isSafeInteger(value.messageCount) &&
    value.messageCount >= 0
      ? value.messageCount
      : undefined;
  const capturedAt = optionalTimestamp(value.capturedAt);
  return {
    excerpt: value.excerpt,
    ...(title === undefined ? {} : { title }),
    ...(messageCount === undefined ? {} : { messageCount }),
    ...(capturedAt === undefined ? {} : { capturedAt }),
  };
}

function optionalStringList(value: unknown, maxItems = 32, maxLength = 200): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, maxLength))
    .slice(0, maxItems);
  return items.length > 0 ? items : undefined;
}

function projectPayload(value: unknown): GenericArchiveProjectPayloadV2 | undefined {
  if (!isPlainObject(value) || !isBoundedString(value.title, 1_024)) return undefined;
  const instructions =
    typeof value.instructions === 'string' && value.instructions.trim().length > 0
      ? value.instructions
      : undefined;
  const fileNames = optionalStringList(value.fileNames);
  const threadCount =
    typeof value.threadCount === 'number' &&
    Number.isSafeInteger(value.threadCount) &&
    value.threadCount >= 0
      ? value.threadCount
      : undefined;
  return {
    title: value.title,
    ...(instructions === undefined ? {} : { instructions }),
    ...(fileNames === undefined ? {} : { fileNames }),
    ...(threadCount === undefined ? {} : { threadCount }),
  };
}

function knowledgeDocumentPayload(value: unknown): GenericArchiveKnowledgePayloadV2 | undefined {
  if (!isPlainObject(value) || typeof value.content !== 'string' || value.content.trim().length === 0) {
    return undefined;
  }
  const title = isBoundedString(value.title, 1_024) ? value.title : undefined;
  const citation = isBoundedString(value.citation, 400) ? value.citation : undefined;
  const kind =
    value.kind === 'dataset' ||
    value.kind === 'prompt_library' ||
    value.kind === 'ignore_rules' ||
    value.kind === 'ide_manifest' ||
    value.kind === 'document'
      ? value.kind
      : undefined;
  return {
    content: value.content,
    ...(title === undefined ? {} : { title }),
    ...(citation === undefined ? {} : { citation }),
    ...(kind === undefined ? {} : { kind }),
  };
}

function mcpConfigPayload(value: unknown): GenericArchiveMcpConfigPayloadV2 | undefined {
  if (!isPlainObject(value) || !isBoundedString(value.name, 200)) return undefined;
  const command = isBoundedString(value.command, 512) ? value.command : undefined;
  const url = isBoundedString(value.url, 1_024) ? value.url : undefined;
  const envKeys = optionalStringList(value.envKeys);
  const redactedKeys = optionalStringList(value.redactedKeys);
  return {
    name: value.name,
    ...(command === undefined ? {} : { command }),
    ...(url === undefined ? {} : { url }),
    ...(envKeys === undefined ? {} : { envKeys }),
    ...(redactedKeys === undefined ? {} : { redactedKeys }),
  };
}

function workflowPayload(value: unknown): GenericArchiveWorkflowPayloadV2 | undefined {
  if (!isPlainObject(value) || !isBoundedString(value.name, 200)) return undefined;
  const description = isBoundedString(value.description, 8_000) ? value.description : undefined;
  const triggerType = isBoundedString(value.triggerType, 64) ? value.triggerType : undefined;
  return {
    name: value.name,
    ...(description === undefined ? {} : { description }),
    ...(triggerType === undefined ? {} : { triggerType }),
  };
}

function payloadForType(
  itemType: GenericArchiveItemTypeV2,
  value: unknown,
): GenericArchiveItemPayloadV2 | undefined {
  switch (itemType) {
    case 'preference':
      return preferencePayload(value);
    case 'instruction':
      return instructionPayload(value);
    case 'memory':
      return memoryPayload(value);
    case 'conversation':
      return conversationPayload(value);
    case 'project':
      return projectPayload(value);
    case 'knowledge':
      return knowledgeDocumentPayload(value);
    case 'mcp_config':
      return mcpConfigPayload(value);
    case 'workflow':
      return workflowPayload(value);
  }
}

function v1SourceRef(rawItem: Record<string, unknown>): OpaqueExternalRefV1 | undefined {
  return parseSourceRef(rawItem.sourceObjectRef) ?? parseSourceRef(rawItem.sourceRef);
}

function defaultV1Metadata(): Pick<
  GenericArchiveItemBaseV2,
  'sensitivity' | 'confidence' | 'lossiness' | 'retention'
> {
  return {
    sensitivity: 'owner',
    confidence: 1,
    lossiness: 'unknown',
    retention: 'owner_managed',
  };
}

export function createGenericArchiveItemV2(
  input: Omit<GenericArchiveItemV2, 'sourceDigest'>,
): GenericArchiveItemV2 {
  return {
    ...input,
    sourceDigest: computeDigest(input.payload),
  } as GenericArchiveItemV2;
}

function unsupported(
  itemIndex: number,
  reasonCode: GenericArchiveItemUnsupportedReasonV2,
  rawItem: Record<string, unknown> | undefined,
): GenericArchiveUnsupportedItemV2 {
  const sourceRef =
    rawItem === undefined
      ? undefined
      : parseSourceRef(rawItem.sourceRef) ?? parseSourceRef(rawItem.sourceObjectRef);
  const itemType = typeof rawItem?.itemType === 'string' ? rawItem.itemType : undefined;
  return {
    itemIndex,
    reasonCode,
    ...(itemType === undefined ? {} : { itemType }),
    ...(sourceRef === undefined ? {} : { sourceRef }),
  };
}

function parseV2Item(
  rawItem: unknown,
  itemIndex: number,
  rejectSecrets: boolean,
  issues: PortabilityValidationIssueV1[],
): GenericArchiveItemV2 | GenericArchiveUnsupportedItemV2 {
  const path = `$.items[${itemIndex}]`;
  if (!isPlainObject(rawItem)) {
    issue(issues, 'invalid_item', path, 'archive item must be an object');
    return { itemIndex, reasonCode: 'invalid_item' };
  }
  if (typeof rawItem.itemType !== 'string') {
    issue(issues, 'invalid_item', `${path}.itemType`, 'itemType must be a string');
    return unsupported(itemIndex, 'invalid_item', rawItem);
  }
  if (!isGenericArchiveItemTypeV2(rawItem.itemType)) {
    return unsupported(itemIndex, 'unknown_item_type', rawItem);
  }

  const sourceRef = parseSourceRef(rawItem.sourceRef);
  const sourceDigest = parseDigest(rawItem.sourceDigest);
  const confidence = parseConfidence(rawItem.confidence);
  const sensitivity = DATA_CLASS_SET.has(String(rawItem.sensitivity))
    ? (rawItem.sensitivity as PortabilityDataClassV1)
    : undefined;
  const lossiness = LOSSINESS_SET.has(String(rawItem.lossiness))
    ? (rawItem.lossiness as PortableItemLossinessV1)
    : undefined;
  const retention = RETENTION_SET.has(String(rawItem.retention))
    ? (rawItem.retention as GenericArchiveRetentionV2)
    : undefined;
  if (
    sourceRef === undefined ||
    sourceDigest === undefined ||
    confidence === undefined ||
    sensitivity === undefined ||
    lossiness === undefined ||
    retention === undefined
  ) {
    issue(issues, 'invalid_item', path, 'v2 item is missing required metadata');
    return unsupported(itemIndex, 'invalid_item', rawItem);
  }

  const payload = payloadForType(rawItem.itemType, rawItem.payload);
  if (payload === undefined) {
    return unsupported(itemIndex, 'unrecognized_payload_shape', rawItem);
  }
  if (rejectSecrets && hasSecretViolation({ payload })) {
    return unsupported(itemIndex, 'secret_prohibited', rawItem);
  }

  return {
    itemType: rawItem.itemType,
    sourceRef,
    sourceDigest,
    sensitivity,
    confidence,
    lossiness,
    retention,
    payload,
  } as GenericArchiveItemV2;
}

function parseV1Item(
  rawItem: unknown,
  itemIndex: number,
  rejectSecrets: boolean,
  issues: PortabilityValidationIssueV1[],
): GenericArchiveItemV2 | GenericArchiveUnsupportedItemV2 {
  const path = `$.items[${itemIndex}]`;
  if (!isPlainObject(rawItem)) {
    issue(issues, 'invalid_item', path, 'archive item must be an object');
    return { itemIndex, reasonCode: 'invalid_item' };
  }
  const sourceRef = v1SourceRef(rawItem);
  if (sourceRef === undefined) {
    issue(issues, 'invalid_item', `${path}.sourceObjectRef`, 'v1 source ref is invalid');
    return unsupported(itemIndex, 'invalid_item', rawItem);
  }
  const payload = preferencePayload(rawItem.payload);
  if (payload === undefined) {
    const reason: GenericArchiveItemUnsupportedReasonV2 =
      typeof rawItem.itemType === 'string' && rawItem.itemType !== 'preference'
        ? 'unknown_item_type'
        : 'unrecognized_payload_shape';
    return unsupported(itemIndex, reason, rawItem);
  }
  if (rejectSecrets && hasSecretViolation({ payload })) {
    return unsupported(itemIndex, 'secret_prohibited', rawItem);
  }
  return createGenericArchiveItemV2({
    itemType: 'preference',
    sourceRef,
    payload,
    ...defaultV1Metadata(),
  });
}

/**
 * Parse one `/2` item with the same rules {@link parseGenericArchiveItemsDocument}
 * applies. Exposed so runtime parsers (the backend source adapter) validate v2
 * metadata and payload shapes against this contract instead of re-implementing
 * them. Never throws.
 */
export function parseGenericArchiveItemV2(
  rawItem: unknown,
  itemIndex = 0,
  options: GenericArchiveItemsParseOptionsV2 = {},
): GenericArchiveItemV2 | GenericArchiveUnsupportedItemV2 {
  return parseV2Item(rawItem, itemIndex, options.rejectSecrets !== false, []);
}

/**
 * Parse a Generic Archive items document.
 *
 * `/1` items that have a preference key/value payload become `preference`.
 * `/2` items keep their typed payloads. Unknown types are returned in
 * `unsupported` and do not fail the document.
 */
export function parseGenericArchiveItemsDocument(
  input: unknown,
  options: GenericArchiveItemsParseOptionsV2 = {},
): GenericArchiveItemsParseResultV2 {
  const rejectSecrets = options.rejectSecrets !== false;
  const issues: PortabilityValidationIssueV1[] = [];
  if (!isPlainObject(input)) {
    issue(issues, 'invalid_document', '$', 'archive document must be an object');
    return { valid: false, items: [], unsupported: [], issues };
  }
  if (!isGenericArchiveItemsSchemaVersion(input.schemaVersion)) {
    issue(
      issues,
      'unknown_schema',
      '$.schemaVersion',
      'archive schemaVersion is not generic-archive-items/1 or /2',
    );
    return { valid: false, items: [], unsupported: [], issues };
  }
  if (!Array.isArray(input.items)) {
    issue(issues, 'invalid_document', '$.items', 'archive items must be an array');
    return { valid: false, schemaVersion: input.schemaVersion, items: [], unsupported: [], issues };
  }

  const items: GenericArchiveItemV2[] = [];
  const unsupportedItems: GenericArchiveUnsupportedItemV2[] = [];
  const parseItem =
    input.schemaVersion === GENERIC_ARCHIVE_ITEMS_SCHEMA_V1 ? parseV1Item : parseV2Item;
  for (const [itemIndex, rawItem] of input.items.entries()) {
    const parsed = parseItem(rawItem, itemIndex, rejectSecrets, issues);
    if ('reasonCode' in parsed) {
      unsupportedItems.push(parsed);
      continue;
    }
    items.push(parsed);
  }

  return {
    valid: true,
    schemaVersion: input.schemaVersion,
    items,
    unsupported: unsupportedItems,
    issues,
  };
}
