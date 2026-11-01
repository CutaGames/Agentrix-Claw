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
 * 可选分区（L9 设备和资产，D16）：功能开关关着时这一节根本不出现，导出文件、`omissions` 和 `sectionsDigest` 和没有它时逐键相同。
 * 不进 `ACCOUNT_EXPORT_SECTIONS_V2`：共享客户端要求必有的每一节都在，放进去会把旧后端的导出判成读不懂。
 */
export const ACCOUNT_EXPORT_OPTIONAL_SECTIONS_V2 = ['deviceAssets'] as const;
export type AccountExportOptionalSectionKeyV2 = (typeof ACCOUNT_EXPORT_OPTIONAL_SECTIONS_V2)[number];
export type AccountExportAnySectionKeyV2 = AccountExportSectionKeyV2 | AccountExportOptionalSectionKeyV2;

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

/**
 * 设备和资产（L9，`shared/types/device-assets.ts`、`resale.ts`）：一个带 `kind` 的联合，五种条目一次定全。
 * 条目里没有任何属主字段（`ownerId` / `ownerUserId` / `userId`），也没有买家的账号 id 和买家写的话。
 * 要解密的字段打不开时（钥匙关着、钥匙已粉碎）标读不出、不带内容。
 */
export const ACCOUNT_EXPORT_DEVICE_ASSET_KINDS_V2 = ['asset', 'listing', 'ownMessage', 'disclosure', 'wanted'] as const;
export type AccountExportDeviceAssetKindV2 = (typeof ACCOUNT_EXPORT_DEVICE_ASSET_KINDS_V2)[number];
export interface AccountExportMoneyV2 {
  amountMinor: number;
  currency: string;
}
/** 「我的东西」里的一条记录。私密字段已解开；`privateReadable` 为 false 时 `private` 是 null。 */
export interface AccountExportDeviceAssetRecordV2 {
  kind: 'asset';
  assetRef: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  condition: string;
  status: string;
  purchasedOn: string | null;
  purchasePrice: AccountExportMoneyV2 | null;
  warrantyUntil: string | null;
  estimate: { amountMinor: number; currency: string; source: 'owner' | 'recycle_quote'; destinationId: string | null; at: string } | null;
  linkedDeviceRef: string | null;
  privateReadable: boolean;
  private: { serialNumber: string | null; imei: string | null; receiptRef: string | null; notes: string | null } | null;
  createdAt: string;
  updatedAt: string;
  /**
   * L2（S17）：电脑读到并签名的履历，服务器存的全部内容（哪台设备、哪把签名凭据、读取和交来的时间、字段摘要、签名）。
   * 序列号和电池数服务器不存，所以这里也没有。没有履历时不出现这个键。
   */
  deviceRecord?: AccountExportDeviceAssetRecordSummaryV2;
}
export interface AccountExportDeviceAssetRecordSummaryV2 {
  deviceRef: string;
  signerRef: string;
  readAt: string;
  receivedAt: string;
  digest: string;
  signature: string;
}
/** 一个挂牌，含底价和已解开的预设取货点（没设是 null；设了打不开是 `readable: false`）。 */
export interface AccountExportDeviceAssetListingV2 {
  kind: 'listing';
  listingRef: string;
  assetRef: string | null;
  status: string;
  title: string | null;
  description: string | null;
  category: string;
  condition: string;
  asking: AccountExportMoneyV2 | null;
  floor: AccountExportMoneyV2 | null;
  sold: AccountExportMoneyV2 | null;
  area: string | null;
  handover: string | null;
  faq: Array<{ q: string; a: string }>;
  twinReplies: boolean;
  pickupPoint: { readable: boolean; value: string | null } | null;
  publishedAt: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * L3（S18）：这件东西的成交回执（卖家发起的时间、买家确认的时间和平台签的回执），没有回执时不出现这个键。
   * 回执里本来就没有买家和价格，这里也没有。
   */
  saleReceipt?: AccountExportDeviceAssetSaleReceiptV2;
  /** L3（S18）：卖家选了把这件挂在名片上时是 `true`，没选时不出现这个键。 */
  onCard?: true;
}
export interface AccountExportDeviceAssetSaleReceiptV2 {
  receiptRef: string;
  status: string;
  requestedAt: string;
  confirmedAt: string | null;
  token: string | null;
}
/** 本人作为卖家在一个对话里自己写的话，按对话分组。不带买家的账号 id，也不带买家写的话。 */
export interface AccountExportDeviceAssetOwnMessagesV2 {
  kind: 'ownMessage';
  listingRef: string;
  threadRef: string;
  messages: Array<{ at: string; readable: boolean; text: string | null }>;
}
/** 本人在批准卡上批准给出的值。 */
export interface AccountExportDeviceAssetDisclosureV2 {
  kind: 'disclosure';
  cardRef: string;
  listingRef: string;
  threadRef: string;
  field: string;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  readable: boolean;
  value: string | null;
}
/** 「我在找」。 */
export interface AccountExportDeviceAssetWantedV2 {
  kind: 'wanted';
  wantedRef: string;
  category: string;
  maxPrice: AccountExportMoneyV2 | null;
  area: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}
export type AccountExportDeviceAssetV2 =
  | AccountExportDeviceAssetRecordV2
  | AccountExportDeviceAssetListingV2
  | AccountExportDeviceAssetOwnMessagesV2
  | AccountExportDeviceAssetDisclosureV2
  | AccountExportDeviceAssetWantedV2;

export interface AccountExportOmissionV2 {
  section: AccountExportAnySectionKeyV2;
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
    /** 可选分区（`ACCOUNT_EXPORT_OPTIONAL_SECTIONS_V2`）：账本开关关着时没有这个键。 */
    deviceAssets?: AccountExportSectionV2<AccountExportDeviceAssetV2>;
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
