/**
 * L8 第 2 批 data 线 A8：全量导出（开放格式）。
 *
 * 「导出我的全部数据」一键导出整个账户：原生对话、自动记忆、分身、附件、使用回执（A3 账本）、关系簿（rel 线还没合进来，
 * 先留接口，返回空数组）。在 canonical-export（`agent-portability`，签名的 Agent 包）的基础上把范围扩大到整个账户，
 * 格式是一份普通 JSON，不依赖 Agentrix 就能读。
 *
 * - 服务端把加密的内容（A7 封存的记忆、分身资料、附件）解开以后再导出；解不开的条目只给出处和 `readable: false`，不给占位。
 * - 导出这一步要最近 10 分钟登录过（和其它放宽类操作一样，403 `STEP_UP_REQUIRED` / `recent_sign_in_required`）。
 * - 内容里只有本人的东西：每个分区都按登录态里的属主读，导出前再扫一遍，发现别人的属主字段就整份拒绝。
 * - 不放：密钥、token、钱包私钥、通道 token、实例地址、API key 前缀。
 * - 公布的 JSON schema 有两份内容完全相同的文件：`shared/types/account-export.v2.schema.json` 和
 *   `docs/account-export-v2.schema.json`；测试会核对两份一致，也会拿真实导出结果去校验。
 *
 * 开关：后端 `ACCOUNT_EXPORT_V2_ENABLED`，只认精确的 `'1'`；关着时路由回 404，什么都不读。
 */

export const ACCOUNT_EXPORT_SCHEMA_VERSION_V2 = 2 as const;
export const ACCOUNT_EXPORT_FORMAT_V2 = 'agentrix.account-export' as const;
export const ACCOUNT_EXPORT_SCHEMA_ID_V2 = 'https://agentrix.top/schemas/account-export-v2.schema.json' as const;
export const ACCOUNT_EXPORT_ROUTE_V2 = 'POST /api/account-export/v2' as const;

export const ACCOUNT_EXPORT_SECTIONS_V2 = ['conversations', 'autoMemories', 'agents', 'attachments', 'receipts', 'relationshipBook', 'partnerWorkspace'] as const;
export type AccountExportSectionKeyV2 = (typeof ACCOUNT_EXPORT_SECTIONS_V2)[number];

/**
 * - `complete`：该分区全部在里面；
 * - `truncated`：碰到上限，只给了前面一部分（`omissions` 里说明）；
 * - `unavailable`：这个来源现在读不出来（`reasonCode`），分区是空的，不代表账户里没有；
 * - `not_enabled`：这类数据所在的功能还没上线（关系簿），分区是空的。
 */
export const ACCOUNT_EXPORT_SECTION_STATUSES_V2 = ['complete', 'truncated', 'unavailable', 'not_enabled'] as const;
export type AccountExportSectionStatusV2 = (typeof ACCOUNT_EXPORT_SECTION_STATUSES_V2)[number];

export const ACCOUNT_EXPORT_OMISSION_REASONS_V2 = [
  'section_limit',
  'message_limit',
  'attachment_too_large',
  'attachment_budget',
  'attachment_missing',
  'memory_unreadable',
  'agent_unreadable',
  'read_failed',
  'not_enabled',
] as const;
export type AccountExportOmissionReasonV2 = (typeof ACCOUNT_EXPORT_OMISSION_REASONS_V2)[number];

export const ACCOUNT_EXPORT_LIMITS_V2 = {
  /** 每个分区最多多少条（对话按会话数，其它按条数）。 */
  maxItemsPerSection: 5000,
  /** 全部对话里最多多少条消息。 */
  maxMessages: 200000,
  /** 一个附件内容最多多少字节；更大的只给元数据。 */
  maxAttachmentBytes: 5 * 1024 * 1024,
  /** 全部附件内容加起来最多多少字节。 */
  maxAttachmentBytesTotal: 50 * 1024 * 1024,
  /** 同一个账户两次导出之间至少隔多少秒。 */
  minIntervalSeconds: 30,
  /** 同一个账户一小时最多导出几次。 */
  maxPerHour: 6,
  /** 整个进程里同时最多几份导出在拼（整份在内存里）；多了答 409 `account_export_busy`。 */
  maxConcurrent: 2,
  /** 一份导出里所有分区加起来最多多少字节；超了的分区只给装得下的前面一部分，并标 `truncated`。 */
  maxTotalBytes: 100 * 1024 * 1024,
} as const;

export interface AccountExportSectionV2<T> {
  status: AccountExportSectionStatusV2;
  count: number;
  items: T[];
}

export interface AccountExportMessageV2 {
  id: string;
  role: 'user' | 'assistant' | 'system';
  type: string;
  content: string;
  sequence: number | null;
  createdAt: string;
  /** 助手回合用过的工具名。只有名字，不含参数和结果。 */
  toolNames: string[];
}

export interface AccountExportConversationV2 {
  id: string;
  title: string | null;
  agentId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messages: AccountExportMessageV2[];
  /** 这个会话的消息碰到上限，只给了前面一部分。 */
  messagesTruncated: boolean;
}

export interface AccountExportMemoryV2 {
  id: string;
  key: string;
  scope: string;
  type: string;
  agentId: string | null;
  sessionId: string | null;
  /** 解开以后的内容；`readable` 为 false 时是 null。 */
  value: unknown;
  readable: boolean;
  importance: number | null;
  tags: string[];
  dataClass: string | null;
  createdAt: string;
  updatedAt: string;
}

export const ACCOUNT_EXPORT_AGENT_SOURCES_V2 = ['agent_account', 'openclaw_instance', 'user_agent'] as const;
export type AccountExportAgentSourceV2 = (typeof ACCOUNT_EXPORT_AGENT_SOURCES_V2)[number];

export interface AccountExportAgentV2 {
  id: string;
  source: AccountExportAgentSourceV2;
  name: string;
  description: string | null;
  personality: string | null;
  systemPrompt: string | null;
  defaultModel: string | null;
  capabilities: string[];
  delegationLevel: string | null;
  /** 绑定的渠道：平台和显示名。不含渠道 id、token 和配置。 */
  channels: Array<{ platform: string; channelName: string | null }>;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export type AccountExportAttachmentContentV2 =
  | { included: true; encoding: 'base64'; data: string; sha256: string }
  | { included: false; omittedReason: 'attachment_too_large' | 'attachment_budget' | 'attachment_missing' };

export interface AccountExportAttachmentV2 {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  createdAt: string;
  content: AccountExportAttachmentContentV2;
}

/** A3 账本里的一条回执（`context-data-class.ts` 的 `ContextUseReceiptV1`），原样导出。 */
export interface AccountExportReceiptV2 {
  schemaVersion: number;
  receiptId: string;
  sequence: number;
  previousDigest: string | null;
  digest: string;
  kind: string;
  agentId: string;
  turnRef: string;
  items: Array<{ layer: string; id: string; dataClass: string }>;
  withheldCount: number;
  processor: string;
  credentialSource: string;
  providerId: string | null;
  modelId: string | null;
  passId: string | null;
  occurredAt: string;
}

/** 关系簿（rel 线）。接口先留着；还没上线时分区是空的。条目形状等 rel 线定下来再加字段。 */
export type AccountExportRelationshipV2 = Record<string, unknown>;
/** 合作方工作区（L8 3A E3）：用 Agentrix 登录的应用写进主人账号里它自己那一角的条目，带正文。还没上线时分区是空的。 */
export type AccountExportPartnerWorkspaceV2 = Record<string, unknown>;

export interface AccountExportOmissionV2 {
  section: AccountExportSectionKeyV2;
  reasonCode: AccountExportOmissionReasonV2;
  count: number;
}

export interface AccountExportV2 {
  $schema: typeof ACCOUNT_EXPORT_SCHEMA_ID_V2;
  schemaVersion: typeof ACCOUNT_EXPORT_SCHEMA_VERSION_V2;
  format: typeof ACCOUNT_EXPORT_FORMAT_V2;
  exportId: string;
  generatedAt: string;
  /** 导出的是谁的账户：登录态里的属主 id。 */
  account: { ownerId: string };
  sections: {
    conversations: AccountExportSectionV2<AccountExportConversationV2>;
    autoMemories: AccountExportSectionV2<AccountExportMemoryV2>;
    agents: AccountExportSectionV2<AccountExportAgentV2>;
    attachments: AccountExportSectionV2<AccountExportAttachmentV2>;
    receipts: AccountExportSectionV2<AccountExportReceiptV2>;
    relationshipBook: AccountExportSectionV2<AccountExportRelationshipV2>;
    partnerWorkspace: AccountExportSectionV2<AccountExportPartnerWorkspaceV2>;
  };
  /** 回执账本链头和平台签名（拿给别人验证用）；账本没开或没有回执时是 null。 */
  receiptsChain: {
    head: { sequence: number; digest: string } | null;
    headSignature: { message: string; signature: string; address: string; keyVersion: string } | null;
  } | null;
  omissions: AccountExportOmissionV2[];
  /** `sha256:` + `sections` 按键排序后的 JSON 的 SHA-256。拿到文件的人可以重算，看内容有没有被改过。 */
  sectionsDigest: string;
}

/** 导出被拒时的错误码（`api-error.ts` 的 `code`）。 */
export const ACCOUNT_EXPORT_ERROR_CODES_V2 = {
  /** 429，带 `retryAfterSeconds`。 */
  rateLimited: 'account_export_rate_limited',
  /** 409：同一个账户已经有一次导出在跑。 */
  inProgress: 'account_export_in_progress',
  /** 409：服务器上同时在拼的导出已满，稍后再试（不占这个账户的次数）。 */
  busy: 'account_export_busy',
  /** 500：导出结果里发现别人的属主字段，整份拒绝。 */
  foreignData: 'account_export_foreign_data',
} as const;
