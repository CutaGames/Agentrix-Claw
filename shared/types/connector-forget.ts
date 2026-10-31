/**
 * L8 第 2 批 data 线 B6：断开连接器时删掉来自它的记忆（迁移 2050）。
 *
 * - 出处（`MemoryProvenanceV1`）：一条记忆是从哪个连接来的。只放引用（连接 id / 连接 ref），不放正文。
 *   只有新写入的记忆才带；不回填。
 * - 回执（`ConnectorForgetReceiptV1`）：给主人本人看的一份，删了几条、来自哪个连接。不含任何记忆内容。
 *
 * 开关：后端 `CONNECTOR_DISCONNECT_FORGET_V1_ENABLED`，只认精确的 `'1'`；关着时断开连接的行为和现在逐字节一致。
 */

export const CONNECTOR_FORGET_SCHEMA_VERSION_V1 = 1 as const;

/** `connector_beta`：connector-beta 的连接（id 是连接的 uuid）；`composio`：Composio 连接（ref 是 `cxn_…`）；`oauth_client`：用 Agentrix 登录的应用（ref 是 `client_id` 的 SHA-256 十六进制，64 个字符，迁移 2057）。 */
export const MEMORY_PROVENANCE_KINDS_V1 = ['connector_beta', 'composio', 'oauth_client'] as const;
export type MemoryProvenanceKindV1 = (typeof MEMORY_PROVENANCE_KINDS_V1)[number];

export interface MemoryProvenanceV1 {
  kind: MemoryProvenanceKindV1;
  /** 连接的引用。只含字母、数字和 `._:-`，最长 64 个字符。 */
  ref: string;
}

export const MEMORY_PROVENANCE_REF_MAX_V1 = 64;
const PROVENANCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function isMemoryProvenanceV1(value: unknown): value is MemoryProvenanceV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('kind') || !keys.includes('ref')) return false;
  return (
    typeof record.kind === 'string' &&
    (MEMORY_PROVENANCE_KINDS_V1 as readonly string[]).includes(record.kind) &&
    typeof record.ref === 'string' &&
    PROVENANCE_REF.test(record.ref)
  );
}

/** 给主人看的回执。属主不在里面（只回给本人）。 */
export interface ConnectorForgetReceiptV1 {
  schemaVersion: typeof CONNECTOR_FORGET_SCHEMA_VERSION_V1;
  id: string;
  connector: MemoryProvenanceKindV1;
  /** 哪个连接：和 `MemoryProvenanceV1.ref` 同一个值。 */
  connectionRef: string;
  /** 连接的名称，例如 `google-calendar`、`gmail`。可能为空。 */
  connectorLabel: string | null;
  /** 从 `agent_memory` 删掉的条数。 */
  memoriesDeleted: number;
  /** 其中密文被粉碎的条数（开了 A7 加密的那些）。 */
  memoriesShredded: number;
  /** 还在收件箱里等确认、来自这个连接的提议，被一并删掉的条数。 */
  proposalsDropped: number;
  /** 为 true 表示删到一半出错停了：上面的条数是停下之前已经删掉的；再断开一次会接着删完，并另出一份回执。 */
  incomplete: boolean;
  createdAt: string;
}
