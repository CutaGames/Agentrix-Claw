/**
 * aggregatedMarket — 桌面端「全网机会」聚合检索 + 围栏内代成交 client。
 *
 * 把对话内「检索 → 结果卡片 → 接单/下单」接到既有后端：
 *  - 检索：`POST {API_BASE}/ard/search`（@Public，内部 + 聚合外部混合，带来源/品类/能力位/GMV）；
 *  - 代成交：`POST {API_BASE}/ard/participate`（JwtAuthGuard，携带用户 token；服务端从 JWT 解析
 *    AgentAccount 做 spendingLimits 围栏 + L4 结算）。
 *
 * 与移动端 aggregatedMarket.api / web assistant 同义最小版（桌面用 fetch + useAuthStore token）。
 */
import { API_BASE, useAuthStore } from "./store";

export type AggCategory = "task" | "prediction" | "skill" | "agent_rental" | "resource";
export const AGG_CATEGORY_ORDER: AggCategory[] = ["task", "prediction", "skill", "agent_rental", "resource"];
export const CATEGORY_LABEL_ZH: Record<AggCategory, string> = {
  task: "任务",
  prediction: "预测",
  skill: "技能",
  agent_rental: "Agent",
  resource: "资源",
};

export interface OpportunityListing {
  identifier: string;
  displayName: string;
  description?: string;
  source: string;
  internal: boolean;
  category: AggCategory | null;
  canAccept: boolean;
  gmv: number;
  currency: string;
  externalUrl?: string;
  externalId: string;
  connectorSource: string;
}

export interface ParticipateResult {
  ok: boolean;
  status?: string;
  reason?: string;
  mode?: string;
}

const ACTION_FOR: Record<AggCategory, { action: string; label: string }> = {
  task: { action: "accept", label: "接单" },
  prediction: { action: "purchase", label: "下注" },
  skill: { action: "purchase", label: "购买" },
  resource: { action: "subscribe", label: "订阅" },
  agent_rental: { action: "subscribe", label: "雇佣" },
};

export function actionFor(c: AggCategory | null) {
  return ACTION_FOR[c ?? "task"];
}

/** 极简意图：从自然语言猜品类（命中关键词），否则 null（全部）。 */
export function guessCategory(text: string): AggCategory | null {
  const s = text.toLowerCase();
  if (/(任务|接单|赏金|外包|bounty|gig|\btask\b)/.test(s)) return "task";
  if (/(预测|赔率|下注|polymarket|kalshi|predict|odds)/.test(s)) return "prediction";
  if (/(技能|工具|\bskill\b|\btool\b)/.test(s)) return "skill";
  if (/(租|雇|\bagent\b|助理)/.test(s)) return "agent_rental";
  if (/(资源|数据源|订阅|\bapi\b|\bresource\b|feed)/.test(s)) return "resource";
  return null;
}

/** 对话内「全网机会」检索意图识别（slash 命令 或 动作词+品类词）。 */
export function detectMarketIntent(raw: string): { matched: boolean; query: string; category: AggCategory | null } {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const slash = text.match(/^\/(找|搜|搜索|机会|market|find|search)\s*(.*)$/i);
  if (slash) {
    const q = slash[2].trim();
    return { matched: true, query: q, category: guessCategory(q.toLowerCase()) };
  }
  const hasAction = /(找|搜|检索|有什么|推荐|find|search|look for|browse)/.test(lower);
  const category = guessCategory(lower);
  const hasAirdrop = /(空投|airdrop|未发币|撸毛)/.test(lower);
  if (hasAction && (category || hasAirdrop)) {
    return { matched: true, query: text, category };
  }
  return { matched: false, query: text, category: null };
}

function normalize(entry: any): OpportunityListing {
  const d = entry?.data ?? {};
  const idParts = String(entry?.identifier || "").split(":");
  const ns = (idParts[3] || "").toLowerCase();
  const dc = String(d.category || "").toLowerCase();
  const category = (AGG_CATEGORY_ORDER.includes(ns as AggCategory)
    ? ns
    : AGG_CATEGORY_ORDER.includes(dc as AggCategory)
      ? dc
      : entry?.type === "application/ai-skill"
        ? "skill"
        : null) as AggCategory | null;
  const src = String(d.source ?? entry?.aggregatedSource ?? entry?.source ?? "internal");
  const internal = src === "internal" || !entry?.aggregated;
  const canAccept = d.canAccept === true ? true : d.canAccept === false ? false : internal;
  return {
    identifier: String(entry?.identifier ?? ""),
    displayName: String(entry?.displayName ?? entry?.identifier ?? ""),
    description: entry?.description ? String(entry.description) : undefined,
    source: internal ? "自营" : src,
    internal,
    category,
    canAccept,
    gmv: Number(d.gmv ?? d.amount ?? 0) || 0,
    currency: String(d.currency ?? "USDC"),
    externalUrl: typeof d.externalUrl === "string" ? d.externalUrl : (typeof entry?.externalUrl === "string" ? entry.externalUrl : undefined),
    externalId: String(d.externalId ?? entry?.identifier ?? ""),
    connectorSource: String(d.source ?? (internal ? "internal" : src)),
  };
}

/** 检索全网机会（内部 + 聚合外部）。失败返回空集。 */
export async function searchOpportunities(text: string, category: AggCategory | null, pageSize = 8): Promise<OpportunityListing[]> {
  const filter: Record<string, string[]> = {};
  if (category) filter.category = [category];
  try {
    const res = await fetch(`${API_BASE}/ard/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: { text: text || (category ? CATEGORY_LABEL_ZH[category] : "全网可接机会"), ...(Object.keys(filter).length ? { filter } : {}) },
        federation: "auto",
        pageSize,
      }),
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const results: any[] = Array.isArray(raw) ? raw : raw?.results ?? [];
    return results.map(normalize).filter((l) => (category ? l.category === category : true));
  } catch {
    return [];
  }
}

/** 围栏内代成交（接单/购买/订阅）。仅链接发现条目由调用方负责跳转外部。 */
export async function participate(listing: OpportunityListing): Promise<ParticipateResult> {
  if (!listing.canAccept) {
    return { ok: false, status: "external", reason: "link-discovery-only", mode: "external" };
  }
  const cat = listing.category ?? "task";
  const token = useAuthStore.getState().token;
  try {
    const res = await fetch(`${API_BASE}/ard/participate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        listing: {
          source: listing.connectorSource,
          externalId: listing.externalId,
          category: cat,
          gmv: listing.gmv,
          currency: listing.currency,
          canAccept: listing.canAccept,
          aggregated: !listing.internal,
          externalUrl: listing.externalUrl,
        },
        action: ACTION_FOR[cat].action,
        idempotencyKey: `desktop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      }),
    });
    if (res.status === 401) return { ok: false, status: "unauthenticated", reason: "请先登录并绑定 agent" };
    const data = await res.json().catch(() => ({}));
    return {
      ok: !!data?.ok,
      status: data?.status ?? (data?.mode === "external" ? "external" : data?.code),
      reason: data?.message || data?.error || data?.reason,
      mode: data?.mode,
    };
  } catch (e: any) {
    return { ok: false, status: "error", reason: String(e?.message || "failed") };
  }
}
