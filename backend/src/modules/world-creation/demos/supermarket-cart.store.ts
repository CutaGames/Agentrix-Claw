/**
 * SupermarketCartStore — `state.kv:cart` (scope=visitor) 购物车抽象 (design §3.2 / §6, R15.3)。
 *
 * 超市访客拾取商品时把商品 **append** 进沙箱的 `state.kv` (scope=visitor, key="cart")。
 * 结账时服务端要把该访客的购物车聚合成 line items 交给 Economy_Bridge 按权威 `price`
 * 组件重算金额 —— **购物车里只存"买了什么/几个",绝不存金额** (Property 2, R15.3)。
 *
 * 本接口把"读写访客购物车"抽象为一个**可注入的 KV store**，使
 * {@link SupermarketEconomyBridgeService} 能在 `resolveProposedLineItems` 中
 * **同步**读取访客购物车并聚合为 line items（服务端权威定价），并使
 * {@link SupermarketService} 能在加购 / 结账成功清空时落库。生产可替换为接
 * state.kv/Redis 的实现并绑定到 {@link SUPERMARKET_CART_STORE} 令牌。
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §6 Economy_Bridge
 */

/** DI 令牌：注入一个 {@link SupermarketCartStore} 实现。 */
export const SUPERMARKET_CART_STORE = Symbol('SUPERMARKET_CART_STORE');

/**
 * 一条购物车明细：买的商品 entity id + 数量。**绝不含价格** —— 价格永远由服务端
 * 从权威 ECS_World 的 `price` 组件重算 (Property 2, R15.3)。
 */
export interface SupermarketCartLine {
  /** 商品 ECS entity id（须在权威 ECS_World 中带 `price` 组件）。 */
  goodId: string;
  /** 数量（>= 1 的正整数）。 */
  quantity: number;
}

/**
 * 访客购物车存储抽象 (`state.kv:cart`, scope=visitor)。
 *
 * `getCart` 必须**同步**返回，以便在 {@link EconomyBridgeService} 的同步
 * `resolveProposedLineItems` override 中读取（购物车存于实例内存，同步可达 —
 * design §地图分层一致性："实例内存 + state.kv 落库"）。写操作允许异步。
 */
export interface SupermarketCartStore {
  /** 同步读取某访客在某 Plot 的当前购物车（按聚合后的 line items 返回）。 */
  getCart(plotId: string, visitorAccountId: string): SupermarketCartLine[];

  /** 向某访客购物车追加一个商品（默认数量 1；同一商品累加数量）。 */
  addToCart(
    plotId: string,
    visitorAccountId: string,
    goodId: string,
    quantity?: number,
  ): Promise<void> | void;

  /** 结账成功后清空某访客购物车。 */
  clearCart(plotId: string, visitorAccountId: string): Promise<void> | void;
}

/** 把数量强制为安全的正整数（非法 / <=0 → 视为 0，不计入）。 */
function safeQuantity(quantity: unknown): number {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** 购物车存储的复合键：plotId + visitorAccountId。 */
function cartKey(plotId: string, visitorAccountId: string): string {
  return `${plotId}::${visitorAccountId}`;
}

/**
 * 内存实现：按 (plotId, visitorAccountId) 维护一个 goodId→quantity 的购物车。
 * 用于开发/测试与无外部依赖运行；生产应替换为接 state.kv/Redis 的实现
 * （同样绑定到 {@link SUPERMARKET_CART_STORE}）。
 */
export class InMemorySupermarketCartStore implements SupermarketCartStore {
  private readonly cartsByKey = new Map<string, Map<string, number>>();

  getCart(plotId: string, visitorAccountId: string): SupermarketCartLine[] {
    const cart = this.cartsByKey.get(cartKey(plotId, visitorAccountId));
    if (!cart) return [];
    return [...cart.entries()].map(([goodId, quantity]) => ({ goodId, quantity }));
  }

  addToCart(
    plotId: string,
    visitorAccountId: string,
    goodId: string,
    quantity = 1,
  ): void {
    const qty = safeQuantity(quantity);
    if (!goodId || qty === 0) return;
    const key = cartKey(plotId, visitorAccountId);
    const cart = this.cartsByKey.get(key) ?? new Map<string, number>();
    cart.set(goodId, (cart.get(goodId) ?? 0) + qty);
    this.cartsByKey.set(key, cart);
  }

  clearCart(plotId: string, visitorAccountId: string): void {
    this.cartsByKey.delete(cartKey(plotId, visitorAccountId));
  }
}
