/**
 * Authoritative pricing — pure, server-side price recomputation (design §6, R7.3).
 *
 * 不可协商不变量 (Property 2: 经济服务端权威)：金额唯一来源是服务端按 Plot 的
 * 权威 ECS_World 商品定价重算。沙箱传入的 `price` / `displayHintAmount` / `cart.total`
 * 仅作展示 hint，**绝不参与记账**。
 *
 * 沙箱只能提议 *买什么* (line items: entityId + quantity)；*多少钱* 永远由这里
 * 按声明式 `price` 组件 (EcsComponent.price.axp) 重新定价。
 *
 * 纯函数、无副作用、无三方依赖 → 直接被 Property 2 属性测试 (task 7.3) 驱动。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §6 Economy_Bridge
 */

import type { EcsWorld } from '../../../../shared/types/world-creation';

/** A proposed line item from the sandbox (the *what*, never the *how much*). */
export interface ProposedLineItem {
  /** ECS entity id of the good being purchased (must carry a `price` component). */
  entityId: string;
  /** Proposed quantity (clamped to a positive integer server-side). */
  quantity: number;
}

/** A re-priced line item — `unitAxp` is the authoritative server-side price. */
export interface AuthoritativeLineItem {
  entityId: string;
  quantity: number;
  /** Authoritative per-unit AXP price looked up from the ECS_World. */
  unitAxp: number;
  /** Authoritative line total = unitAxp * quantity. */
  lineAxp: number;
}

/** Result of authoritative pricing — total plus the per-line breakdown. */
export interface AuthoritativePricing {
  totalAxp: number;
  lineItems: AuthoritativeLineItem[];
}

/**
 * Build an authoritative AXP price index from a Plot's ECS_World.
 *
 * Indexes every entity that declares a `price` component, keyed by entity id.
 * Only the declarative `price.axp` value is authoritative; any sandbox-supplied
 * amount is irrelevant here.
 */
export function buildAxpPriceIndex(world: EcsWorld): Map<string, number> {
  const index = new Map<string, number>();
  for (const entity of world.entities ?? []) {
    const axp = entity.components?.price?.axp;
    if (typeof axp === 'number' && Number.isFinite(axp) && axp >= 0) {
      index.set(entity.id, axp);
    }
  }
  return index;
}

/**
 * Coerce a sandbox-proposed quantity into a safe positive integer.
 * Non-finite / <= 0 quantities collapse to 0 (the line contributes nothing).
 */
function safeQuantity(quantity: unknown): number {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Re-price a set of proposed line items against the authoritative ECS_World.
 *
 * Returns `null` if no line item resolves to an authoritative price (e.g., the
 * proposed entities don't exist or carry no `price` component) — the caller
 * must then reject the economic action rather than charge an unpriced amount.
 *
 * Sandbox-proposed prices are *never* read; only `quantity` and `entityId` are
 * taken from the proposal, and every unit price is looked up from `world`.
 */
export function priceLineItems(
  world: EcsWorld,
  proposed: ProposedLineItem[],
): AuthoritativePricing | null {
  const index = buildAxpPriceIndex(world);
  const lineItems: AuthoritativeLineItem[] = [];
  let totalAxp = 0;

  for (const item of proposed ?? []) {
    const unitAxp = index.get(item.entityId);
    if (unitAxp === undefined) continue; // unpriced / unknown entity → skip
    const quantity = safeQuantity(item.quantity);
    if (quantity === 0) continue;
    const lineAxp = unitAxp * quantity;
    lineItems.push({ entityId: item.entityId, quantity, unitAxp, lineAxp });
    totalAxp += lineAxp;
  }

  if (lineItems.length === 0) return null;
  return { totalAxp: Math.round(totalAxp), lineItems };
}
