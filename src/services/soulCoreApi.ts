/**
 * 元神 Soul Core L0 · mobile API 客户端（soul-core-l0 / M1）。
 *
 * 复用共享 `apiFetch`（token + baseURL 已处理）——不新建 HTTP 客户端。
 * 后端 `GET /agent-accounts/:id/soul-core` 由 `SOUL_CORE_VIEW_ENABLED` 门控：
 * flag 关 → 404 → 调用方回退既有经济身份卡（零回归）。
 */
import { apiFetch } from './api';

/**
 * 前端入口开关（MVP：本地常量，默认关；后续接远程灰度）。
 * 关闭时 Me 页不显示"元神"入口，用户走既有经济身份状态屏。
 */
export const SOUL_CORE_VIEW_ENABLED = true;

/** M2 前端入口开关：身份锚 DID / 信誉锚 VC（放量开启；后端端点 flag 关时前端自动回退占位）。 */
export const SOUL_CORE_DID_ENABLED = true;
export const SOUL_CORE_VC_ENABLED = true;
/** W3/W4 · 开放复验材料入口(与 web console 对齐；后端 flag 关 → 404 → 回退)。 */
export const SOUL_CORE_VERIFY_ENABLED = true;

export type EnforcedBy = 'software' | 'onchain-AA' | 'SE';
export type AnchorState = 'enabled' | 'pending' | 'failed' | 'not_enabled' | 'roadmap';

export interface AuthorityItem {
  kind: string;
  label: string;
  value?: string;
  enforcedBy: EnforcedBy;
  hard: boolean;
  note?: string;
}

export interface SoulCoreAnchor {
  key: 'identity' | 'vault' | 'authority' | 'reputation' | 'soulKey' | 'ownership';
  title: string;
  state: AnchorState;
  summary: Record<string, any>;
  roadmap?: boolean;
  roadmapNote?: string;
}

export interface SoulCoreViewDTO {
  agentUniqueId: string;
  ownerId?: string;
  sovereignty: { tier: string; trustModel: string; stillTrusts: string; note: string };
  anchors: SoulCoreAnchor[];
  authority: AuthorityItem[];
  compliance: { disclosures: string[] };
  roadmap: Record<string, string>;
}

interface Envelope<T> { success: boolean; data: T; message?: string }
function unwrap<T>(res: Envelope<T> | T): T {
  if (res && typeof res === 'object' && 'success' in (res as any) && 'data' in (res as any)) {
    return (res as Envelope<T>).data;
  }
  return res as T;
}

/**
 * 拉取元神视图。flag 关时后端返回 404 → `apiFetch` 抛错 → 调用方 catch 后回退既有卡片。
 */
export async function fetchSoulCoreView(agentId: string): Promise<SoulCoreViewDTO> {
  return unwrap<SoulCoreViewDTO>(await apiFetch(`/agent-accounts/${agentId}/soul-core`));
}

// ── M2：DID / 信誉 VC ────────────────────────────────────────────────

export interface AgentDidDto { did: string; didDocument: Record<string, any> }
export interface ReputationVcItem {
  credentialSubject: { id: string; kind: 'settlement' | 'fulfillment'; amount?: string; counterparty?: string; settlementRef?: string; attestation: null };
  issuer: string;
  verified: boolean;
  anchor: { status: string; txHash?: string };
}

/** 拉取可导出 DID（flag `SOUL_CORE_DID_ENABLED` 关 → 404 抛错 → 调用方回退占位）。 */
export async function fetchAgentDid(agentId: string): Promise<AgentDidDto> {
  return unwrap<AgentDidDto>(await apiFetch(`/agent-accounts/${agentId}/did`));
}

/** 拉取信誉 VC 列表（flag `SOUL_CORE_VC_ENABLED` 关 → 404 抛错 → 调用方回退占位）。 */
export async function fetchReputationVcs(agentId: string): Promise<{ did: string | null; items: ReputationVcItem[] }> {
  return unwrap<{ did: string | null; items: ReputationVcItem[] }>(
    await apiFetch(`/agent-accounts/${agentId}/reputation-vcs`),
  );
}

// ── W3/W4：开放复验材料(与 tools/verify-reputation + web VerifyDrawer 对齐) ──

export interface VerificationMaterial {
  did: string;
  issuer: string;
  issuerKeyHistory: Array<{ version: string; address: string }>;
  anchorStatus: 'anchored' | 'pending' | 'not_anchored';
  batchId?: string;
  anchorTxHash?: string;
  merkleProof?: string[];
  leaf?: string;
  anchorContract?: string;
  chainId: number;
  publicCredential: Record<string, any>;
  proofJws: string;
  howToVerify: string;
}
export interface ReputationVerificationDto {
  did: string | null;
  issuerKeyHistory: Array<{ version: string; address: string }>;
  items: VerificationMaterial[];
}

/**
 * 拉取开放复验材料(公开 claim + 签名 + 锚点引用 + issuer 公钥历史)。
 * flag `SOUL_CORE_VC_ENABLED` 关 → 404 抛错 → 调用方回退(不显示复验入口)。
 * 第三方仅凭这些 + 公共 RPC 即可离线复验(见 tools/verify-reputation),不依赖平台。
 */
export async function fetchReputationVerification(agentId: string): Promise<ReputationVerificationDto> {
  return unwrap<ReputationVerificationDto>(
    await apiFetch(`/agent-accounts/${agentId}/reputation-verification`),
  );
}

/** BNB 测试网区块浏览器 tx 链接(锚点 tx 可视化)。 */
export function txExplorerUrl(chainId: number, txHash?: string): string | undefined {
  if (!txHash) return undefined;
  if (chainId === 97) return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chainId === 56) return `https://bscscan.com/tx/${txHash}`;
  return undefined;
}
