/**
 * shopQuickOrder — shop 卡「流内快捷下单」的纯逻辑(World Creation & Feed · task 3.5)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design,ui-design}.md
 *   - 对照 ui-design.md §3「shop 卡的流内快捷下单」:🛒 美式 ¥18 [－] 1 [＋] [下单]。
 *   - _Requirements:
 *       5.7 —— 用户停留在 shop 类卡片时,允许直接在流内发起下单(走需求 7 的权威交易),
 *             无需先进入完整体验。
 *       7.1 —— 下单经服务端权威的 Economy_Bridge 计算并扣款;客户端展示价仅为提示。
 *       7.2 —— 交易被拒/失败时余额不变,返回结构化原因(ECONOMY_REJECTED)。
 *
 * 设计要点(为什么是纯模块):
 *   - 把"选可下单的 offering、数量步进与库存夹取、展示价(仅提示)、构造权威下单
 *     请求、解析结构化结果"全部抽成**无 React/RN 依赖**的纯函数,既让 `ShopQuickOrder`
 *     组件保持轻薄,又能在现有 node 环境 jest(`src/services/__tests__`)下被单测覆盖。
 *   - **绝不在客户端计算成交金额**:展示价(`displayLineTotal` / `formatDisplayPrice`)
 *     一律标注 NON-AUTHORITATIVE,仅用于 UI 提示;权威金额来自服务端
 *     `InvokeCreationResponse.authoritativeAmount`(需求 7.1)。
 *
 * 权威下单路径(接缝说明):
 *   人端流内快捷下单的"专用人端下单端点"尚未落地(后端交易端点为阶段 10,Agent 网关
 *   为阶段 9)。本任务**对接当前可用的最近权威路径**——统一 `invokeCreation`(标准动词
 *   `order`),由服务端网关经 Economy_Bridge 权威结算(需求 13.7「人机同源」:人端与
 *   Agent 端走同一份 offering/ECS 与同一个 Economy_Bridge,无机器旁路)。
 *   `onBehalfOfAccountId` 在此即为下单本人(人类用户自己),而非代付场景。
 *   待阶段 10 的专用人端结账端点就绪后,只需替换 `buildOrderInvokeRequest` 的目标路径。
 */

import type { CreationDiscoveryItem, Offering } from '../../shared/types/creation';
import type {
  InvokeCreationRequest,
  InvokeCreationResponse,
} from '../../shared/types/creation-api';
import type { WorldCreationErrorCode } from '../../shared/types/world-creation';

/** 流内快捷下单走的标准动词(需求 7 / 13.2)。 */
export const ORDER_VERB = 'order' as const;

/** 数量下限(至少 1 件)。 */
export const MIN_QUANTITY = 1;

// ============================================================
// §1 可下单 offering 的筛选与默认选择
// ============================================================

/**
 * 从发现投影项中筛出"流内可下单"的 offering:支持 `order` 标准动词者(需求 5.7)。
 * 发现接口已随卡片返回 offerings(需求 1.8),无需二次请求。
 */
export function selectOrderableOfferings(item: CreationDiscoveryItem): Offering[] {
  const offerings = item.offerings ?? [];
  return offerings.filter((o) => Array.isArray(o.verbs) && o.verbs.includes(ORDER_VERB));
}

/** 默认选中的 offering(可下单列表的第一项;无则 null)。 */
export function pickDefaultOffering(offerings: Offering[]): Offering | null {
  return offerings.length > 0 ? offerings[0] : null;
}

/** 该 offering 的库存上限(无库存约束时返回 undefined)。 */
export function offeringMaxQuantity(offering: Offering | null | undefined): number | undefined {
  const stock = offering?.availability?.stock;
  return typeof stock === 'number' && Number.isFinite(stock) ? stock : undefined;
}

// ============================================================
// §2 数量步进与库存夹取
// ============================================================

/**
 * 把数量夹取到合法区间 `[MIN_QUANTITY, stock]`。
 * - 非有限数 → MIN_QUANTITY;小数向下取整。
 * - stock 为 0(售罄)→ 夹到 0(由调用方据此禁用下单)。
 */
export function clampQuantity(qty: number, stock?: number): number {
  if (!Number.isFinite(qty)) return MIN_QUANTITY;
  let q = Math.floor(qty);
  if (q < MIN_QUANTITY) q = MIN_QUANTITY;
  if (typeof stock === 'number' && Number.isFinite(stock) && q > stock) {
    q = Math.max(0, stock);
  }
  return q;
}

/** 是否可减少数量(> 下限)。 */
export function canDecrement(qty: number): boolean {
  return qty > MIN_QUANTITY;
}

/** 是否可增加数量(无库存约束或仍低于库存)。 */
export function canIncrement(qty: number, stock?: number): boolean {
  if (typeof stock === 'number' && Number.isFinite(stock)) return qty < stock;
  return true;
}

/** offering 是否售罄(库存为 0)。 */
export function isSoldOut(offering: Offering | null | undefined): boolean {
  return offeringMaxQuantity(offering) === 0;
}

// ============================================================
// §3 展示价(仅提示,NON-AUTHORITATIVE)
// design: 需求 7.1 —— 客户端展示价仅为提示,权威金额由 Economy_Bridge 服务端计算。
// ============================================================

/** 展示价(AXP/USD,可空)—— 仅用于 UI 提示,不参与扣款。 */
export interface DisplayPrice {
  axp?: number;
  usd?: number;
  /** 是否有任一可展示价格(无价时展示 "—")。 */
  hasPrice: boolean;
}

/** 取 offering 的单价(展示用,NON-AUTHORITATIVE)。 */
export function offeringUnitDisplayPrice(offering: Offering | null | undefined): DisplayPrice {
  const p = offering?.price;
  const axp = typeof p?.axp === 'number' ? p.axp : undefined;
  const usd = typeof p?.usd === 'number' ? p.usd : undefined;
  return { axp, usd, hasPrice: axp !== undefined || usd !== undefined };
}

/**
 * 展示用的行小计 = 单价 × 数量(NON-AUTHORITATIVE)。
 * **仅用于 UI 提示**;真实成交金额一律以服务端 `authoritativeAmount` 为准(需求 7.1)。
 */
export function displayLineTotal(
  offering: Offering | null | undefined,
  qty: number,
): DisplayPrice {
  const unit = offeringUnitDisplayPrice(offering);
  const q = Math.max(0, Math.floor(Number.isFinite(qty) ? qty : 0));
  return {
    axp: unit.axp !== undefined ? unit.axp * q : undefined,
    usd: unit.usd !== undefined ? unit.usd * q : undefined,
    hasPrice: unit.hasPrice,
  };
}

/** 把展示价格式化为简短文案(AXP 优先,其次 USD;无价显示 "—")。 */
export function formatDisplayPrice(dp: DisplayPrice): string {
  if (!dp.hasPrice) return '—';
  if (dp.axp !== undefined) return `${formatNumber(dp.axp)} AXP`;
  if (dp.usd !== undefined) return `$${formatNumber(dp.usd)}`;
  return '—';
}

/** 数字格式化:整数不带小数,小数最多两位且去掉末尾 0。 */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

// ============================================================
// §4 构造权威下单请求 + 解析结构化结果
// ============================================================

/** 构造权威下单请求的入参。 */
export interface BuildOrderRequestParams {
  /** 目标 offering id。 */
  offeringId: string;
  /** 下单数量(应已夹取至合法区间)。 */
  quantity: number;
  /** 下单本人账户 id(人端快捷下单即用户自己;鉴权/结算主体)。 */
  onBehalfOfAccountId: string;
}

/**
 * 构造统一 `invoke(order)` 请求(权威路径)。
 * 服务端网关据此经 Economy_Bridge 权威结算(需求 7.1 / 13.7)。
 */
export function buildOrderInvokeRequest(
  params: BuildOrderRequestParams,
): InvokeCreationRequest {
  return {
    verb: ORDER_VERB,
    toolName: ORDER_VERB,
    offeringId: params.offeringId,
    args: { offeringId: params.offeringId, qty: params.quantity },
    onBehalfOfAccountId: params.onBehalfOfAccountId,
  };
}

/** 流内下单的归一化结果(供 UI 渲染成功/失败态)。 */
export type ShopOrderResult =
  | {
      ok: true;
      /** 服务端权威成交金额(需求 7.1;可能缺省)。 */
      authoritativeAmount?: number;
      /** 平台抽成(成交时,可空)。 */
      platformCut?: number;
      /** 工具返回的业务数据(下单凭证等)。 */
      result?: Record<string, unknown>;
      invocationId: string;
    }
  | {
      ok: false;
      /** 结构化错误码(默认 ECONOMY_REJECTED,需求 7.2)。 */
      code: WorldCreationErrorCode;
      /** 人类可读原因。 */
      detail: string;
      invocationId?: string;
    };

/**
 * 解析网关响应为归一化下单结果。
 * - `outcome === 'ok'` 且无 error → 成功(携带权威金额)。
 * - 否则 → 失败,透出结构化错误码(无 error 时兜底 ECONOMY_REJECTED,需求 7.2)。
 */
export function interpretInvokeResponse(res: InvokeCreationResponse): ShopOrderResult {
  if (res.outcome === 'ok' && !res.error) {
    return {
      ok: true,
      authoritativeAmount: res.authoritativeAmount,
      platformCut: res.platformCut,
      result: res.result,
      invocationId: res.invocationId,
    };
  }
  return {
    ok: false,
    code: res.error?.error ?? 'ECONOMY_REJECTED',
    detail: res.error?.detail ?? '',
    invocationId: res.invocationId,
  };
}
