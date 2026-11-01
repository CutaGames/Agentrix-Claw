/**
 * L9 P3-4（F 线）：客户口碑的公开核验和导出。
 *
 * 口碑（`shared/types/client-endorsement.ts`）在主人批准、而且订单是真钱订单时由平台签成凭证。本文件加两样东西：
 * - 公开核验（免登录）：`GET /v1/public/client-endorsements/agents/:agentId/verify`。只回答「这位主人有几位客户的推荐经得起核验」
 *   和这几条推荐的原话、月份。一条推荐要同时满足才算：主人批准了、真钱订单、订单已经结清（`settled`，不是只付了款）、
 *   订单没有退款或争议、平台签名验得过、签名里的摘要和原话对得上、分身的身份没有被撤销。不回任何客户身份、主人 id、钱包地址、
 *   订单号、预约号或凭证编号。分身不存在、没上线、主人不在 L9 名单里、一条经得起核验的都没有：同一个 404，防枚举。
 *   限频：每个分身每分钟 ≤30 次，每个网络地址每分钟 ≤60 次。
 * - 导出（主人，登录，最近 10 分钟登录过，在 L9 名单里）：`GET /client-endorsements/agents/:agentId/export`，
 *   一份 JSON：每条经得起核验的推荐带上完整的签名凭证，拿到文件的人不用问我们就能离线验签（方法见 `howToVerify`）。
 *
 * 开关：后端 `CLIENT_ENDORSEMENT_VERIFY_V1_ENABLED`（还要 `CLIENT_ENDORSEMENTS_V1_ENABLED`），只认精确的 `'1'`，关着时两条路由 404、
 * 不读库。网页 `NEXT_PUBLIC_CLIENT_ENDORSEMENT_VERIFY_ENABLED`（编译期），关着时核对页 404、主人页上没有这一栏。不写任何链。
 */
export const CLIENT_ENDORSEMENT_VERIFY_FLAG_V1 = 'CLIENT_ENDORSEMENT_VERIFY_V1_ENABLED' as const;
export const CLIENT_ENDORSEMENT_VERIFY_WEB_FLAG_V1 = 'NEXT_PUBLIC_CLIENT_ENDORSEMENT_VERIFY_ENABLED' as const;
export const CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1 = 1 as const;
export const CLIENT_ENDORSEMENT_VERIFY_RATE_V1 = { perAgentPerMinute: 30, perAddressPerMinute: 60 } as const;
/** 公开回答里最多几条原话。 */
export const CLIENT_ENDORSEMENT_VERIFY_MAX_ITEMS_V1 = 50;
/** 一份导出里最多几条。 */
export const CLIENT_ENDORSEMENT_EXPORT_MAX_ITEMS_V1 = 500;
export const CLIENT_ENDORSEMENT_EXPORT_KIND_V1 = 'agentrix.client-endorsements.export' as const;
/** 签名凭证的类型和上下文，和 `AgentReputationVcService.issueEndorsementCredential` 签名时用的一样（spec 用真签名钉住）。 */
export const CLIENT_ENDORSEMENT_VC_TYPE_V1 = ['VerifiableCredential', 'AgentClientEndorsementCredential'] as const;
export const CLIENT_ENDORSEMENT_VC_CONTEXT_V1 = ['https://www.w3.org/2018/credentials/v1'] as const;
/** 网页上的公开核对页（分身的公开 id 放在 `?agent=` 里，它本来就印在名片链接上）。 */
export const CLIENT_ENDORSEMENT_VERIFY_PAGE_PATH_V1 = '/trust/verify/endorsements' as const;
/** 分身公开 id 的格式（`agentUniqueId` 或账户 uuid）。 */
export const CLIENT_ENDORSEMENT_VERIFY_AGENT_ID_PATTERN_V1 = /^[A-Za-z0-9_-]{1,120}$/;

export const CLIENT_ENDORSEMENT_VERIFY_HOW_TO_V1 =
  'For each item: ethers.verifyMessage(stableStringify({ c: credential["@context"], t: credential.type, iss: credential.issuer, ' +
  'sub: credential.credentialSubject }), credential.proof.jws) must recover the address at the end of credential.issuer ' +
  '(or one listed in issuerKeyHistory); stableStringify sorts object keys and drops undefined values. ' +
  'keccak256(utf8(item.text)) must equal credentialSubject.textDigest. No Agentrix API call is needed.';

export function clientEndorsementPublicVerifyPathV1(agentId: string): string {
  return `/v1/public/client-endorsements/agents/${encodeURIComponent(agentId)}/verify`;
}
export function clientEndorsementExportPathV1(agentId: string): string {
  return `/client-endorsements/agents/${encodeURIComponent(agentId)}/export`;
}
export function clientEndorsementVerifyPageUrlV1(webBase: string, agentId: string): string {
  return `${webBase.replace(/\/+$/, '')}${CLIENT_ENDORSEMENT_VERIFY_PAGE_PATH_V1}?agent=${encodeURIComponent(agentId)}`;
}

export interface ClientEndorsementVerifiedItemV1 {
  /** 客户的原话（主人批准过才公开）。 */
  text: string;
  /** `YYYY-MM`，不给具体日期。 */
  month: string;
}

/** 公开核验的回答（`{ success: true, data }` 里的 `data`）。 */
export interface ClientEndorsementPublicVerifyV1 {
  schemaVersion: typeof CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1;
  /** 经得起核验的推荐来自几位不同的客户。 */
  verifiedClients: number;
  items: ClientEndorsementVerifiedItemV1[];
  /** 核验的依据：只认结清的真钱订单。 */
  basis: 'settled_order';
  checkedAt: string;
}

export interface ClientEndorsementCredentialV1 {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: Record<string, unknown>;
  proof: { type: 'EcdsaSecp256k1Signature2019'; jws: string; verificationMethod: string };
}

export interface ClientEndorsementExportItemV1 {
  text: string;
  month: string;
  credential: ClientEndorsementCredentialV1;
}

/** 主人导出的文件（`{ success: true, data }` 里的 `data`）。 */
export interface ClientEndorsementExportV1 {
  schemaVersion: typeof CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1;
  kind: typeof CLIENT_ENDORSEMENT_EXPORT_KIND_V1;
  /** 分身的公开 id。 */
  agentId: string;
  exportedAt: string;
  issuer: string;
  issuerKeyHistory: Array<{ version: string; address: string }>;
  howToVerify: string;
  items: ClientEndorsementExportItemV1[];
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TEXT_MAX = 280;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= TEXT_MAX;
}
function dataOf(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || !sameKeys(body, ['success', 'data']) || body.success !== true || !isRecord(body.data)) return null;
  return body.data;
}

/**
 * 公开回答的解码。失败返回 `null`。多一个字段就拒收（公开回答里不能悄悄混进客户或主人的数据）；条数和人数要对得上：
 * 有条目才有人数，人数不能多于条数。
 */
export function decodeClientEndorsementPublicVerifyV1(body: unknown): ClientEndorsementPublicVerifyV1 | null {
  const data = dataOf(body);
  if (!data || !sameKeys(data, ['schemaVersion', 'verifiedClients', 'items', 'basis', 'checkedAt'])) return null;
  if (data.schemaVersion !== CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1 || data.basis !== 'settled_order' || !isIso(data.checkedAt)) return null;
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > CLIENT_ENDORSEMENT_VERIFY_MAX_ITEMS_V1) return null;
  const count = data.verifiedClients;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null;
  const items: ClientEndorsementVerifiedItemV1[] = [];
  for (const raw of data.items) {
    if (!isRecord(raw) || !sameKeys(raw, ['text', 'month']) || !isText(raw.text) || typeof raw.month !== 'string' || !MONTH.test(raw.month)) return null;
    items.push({ text: raw.text, month: raw.month });
  }
  // Fewer people than lines is fine (one client may have recommended twice); more people than lines shown is only possible
  // when the list was cut at its maximum.
  if (count > items.length && items.length < CLIENT_ENDORSEMENT_VERIFY_MAX_ITEMS_V1) return null;
  return { schemaVersion: CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1, verifiedClients: count, items, basis: 'settled_order', checkedAt: data.checkedAt };
}

function decodeCredential(value: unknown): ClientEndorsementCredentialV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['@context', 'type', 'issuer', 'issuanceDate', 'credentialSubject', 'proof'])) return null;
  const context = value['@context'];
  const type = value.type;
  if (!Array.isArray(context) || context.join('|') !== CLIENT_ENDORSEMENT_VC_CONTEXT_V1.join('|')) return null;
  if (!Array.isArray(type) || type.join('|') !== CLIENT_ENDORSEMENT_VC_TYPE_V1.join('|')) return null;
  if (typeof value.issuer !== 'string' || !/^did:pkh:eip155:\d+:0x[0-9a-fA-F]{40}$/.test(value.issuer) || !isIso(value.issuanceDate)) return null;
  const subject = value.credentialSubject;
  if (!isRecord(subject) || subject.kind !== 'client_endorsement' || typeof subject.textDigest !== 'string' || !/^0x[0-9a-f]{64}$/.test(subject.textDigest)) return null;
  const proof = value.proof;
  if (!isRecord(proof) || !sameKeys(proof, ['type', 'jws', 'verificationMethod']) || proof.type !== 'EcdsaSecp256k1Signature2019') return null;
  if (typeof proof.jws !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(proof.jws) || typeof proof.verificationMethod !== 'string') return null;
  return {
    '@context': [...CLIENT_ENDORSEMENT_VC_CONTEXT_V1],
    type: [...CLIENT_ENDORSEMENT_VC_TYPE_V1],
    issuer: value.issuer,
    issuanceDate: value.issuanceDate,
    credentialSubject: subject,
    proof: { type: 'EcdsaSecp256k1Signature2019', jws: proof.jws, verificationMethod: proof.verificationMethod },
  };
}

/** 导出文件的解码（网页下载前先解一遍，解不出来就不下载）。失败返回 `null`。 */
export function decodeClientEndorsementExportV1(body: unknown): ClientEndorsementExportV1 | null {
  const data = dataOf(body);
  if (!data || !sameKeys(data, ['schemaVersion', 'kind', 'agentId', 'exportedAt', 'issuer', 'issuerKeyHistory', 'howToVerify', 'items'])) return null;
  if (data.schemaVersion !== CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1 || data.kind !== CLIENT_ENDORSEMENT_EXPORT_KIND_V1) return null;
  if (typeof data.agentId !== 'string' || !CLIENT_ENDORSEMENT_VERIFY_AGENT_ID_PATTERN_V1.test(data.agentId) || !isIso(data.exportedAt)) return null;
  if (typeof data.issuer !== 'string' || typeof data.howToVerify !== 'string' || !Array.isArray(data.issuerKeyHistory) || !Array.isArray(data.items)) return null;
  if (data.items.length > CLIENT_ENDORSEMENT_EXPORT_MAX_ITEMS_V1) return null;
  const history: Array<{ version: string; address: string }> = [];
  for (const raw of data.issuerKeyHistory) {
    if (!isRecord(raw) || typeof raw.version !== 'string' || typeof raw.address !== 'string') return null;
    history.push({ version: raw.version, address: raw.address });
  }
  const items: ClientEndorsementExportItemV1[] = [];
  for (const raw of data.items) {
    if (!isRecord(raw) || !sameKeys(raw, ['text', 'month', 'credential']) || !isText(raw.text) || typeof raw.month !== 'string' || !MONTH.test(raw.month)) return null;
    const credential = decodeCredential(raw.credential);
    if (!credential || credential.issuer !== data.issuer) return null;
    items.push({ text: raw.text, month: raw.month, credential });
  }
  return {
    schemaVersion: CLIENT_ENDORSEMENT_VERIFY_SCHEMA_VERSION_V1,
    kind: CLIENT_ENDORSEMENT_EXPORT_KIND_V1,
    agentId: data.agentId,
    exportedAt: data.exportedAt,
    issuer: data.issuer,
    issuerKeyHistory: history,
    howToVerify: data.howToVerify,
    items,
  };
}
