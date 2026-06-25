/**
 * Supermarket_Generator — Tier_B ECS_World generation for the flagship
 * "checkout-capable supermarket" demo (design §3.2 / §6 / §11.3, R15.1/R15.2).
 *
 * The supermarket is the flagship demonstration of the **server-authoritative
 * Economy_Bridge** (design §6): visitors pick goods, add them to a cart, and
 * check out paying AXP to the supermarket owner — and the charged amount is
 * NEVER computed inside the sandbox. This generator produces the canonical
 * ECS_World; the authoritative checkout settlement is handled server-side by
 * {@link SupermarketEconomyBridgeService} + {@link SupermarketService}.
 *
 * This module exports a PURE function {@link generateSupermarket} that an
 * AgentBuilderService prompt flow calls to produce the supermarket's canonical
 * ECS_World. The result is a strict **Tier_B** world:
 *
 *   - declarative scene-graph layout entities (store shell, shelves, checkout
 *     desk, cart/checkout UI),
 *   - goods entities, each carrying a declarative `price` component holding its
 *     AXP price as **declarative data** (R15.2) — non-authoritative display data,
 *     the authoritative amount is recomputed server-side at checkout (design §6),
 *   - Substrate_DSL rules with NO arbitrary code:
 *       click/pickup a good   → `state.kv` append the good to the visitor cart,
 *       click `checkout_btn`   → `economy.requestCharge` (cart total recomputed
 *                                 server-side) + `state.kv` append the sale to the
 *                                 plot `sales` aggregation + `ui.*` confirmation toast.
 *
 * Every rule action maps to a whitelisted {@link WorldApiCapability}; no
 * `logicModules` and no `logicModuleRef` components are emitted, so the world is
 * Tier_B-compliant **by construction** and passes `validateTier`.
 *
 * IMPORTANT — Economy invariant (Property 2, R15.3): the `economy.requestCharge`
 * action carries only an `amountRef` ("cart.total") referencing sandbox state.
 * The generator NEVER emits a computed total; the Economy_Bridge recomputes the
 * authoritative total from these `price` components server-side.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §3.2 Substrate_DSL, §6 Economy_Bridge
 */

import {
  ECS_VERSION,
  EcsEntity,
  EcsWorld,
  SubstrateRule,
  WorldApiCapability,
} from '../../../../shared/types/world-creation';

// ============================================================
// Generation options
// ============================================================

/**
 * Declaration of a single good sold in the supermarket. Kept declarative — a
 * good is just data the cart/checkout rules reference; its `priceAxp` becomes
 * a declarative `price.axp` component (R15.2) and is NOT authoritative.
 */
export interface SupermarketGoodSpec {
  /** Unique good entity id within the world (e.g., "good_milk"). */
  id: string;
  /** Human-readable display name (e.g., "牛奶"). */
  displayName?: string;
  /** Declarative AXP price stored on the good's `price` component (R15.2). */
  priceAxp: number;
  /** Built-in mesh preset for the good (defaults to "product_box"). */
  meshPreset?: string;
  /** World_Asset id rendered for this good (optional, display-only). */
  assetRef?: string;
}

/** Options driving {@link generateSupermarket}. */
export interface SupermarketGeneratorOptions {
  /** Owning Plot id (becomes {@link EcsWorld.plotId}). */
  plotId: string;
  /** Human-readable store title (defaults to "超市"). */
  title?: string;
  /** Store-shell mesh preset (defaults to "store_aisle"). */
  storePreset?: string;
  /**
   * Goods roster to stock. When omitted, a small default roster is generated so
   * the supermarket is shoppable out of the box.
   */
  goods?: SupermarketGoodSpec[];
}

// ============================================================
// Defaults
// ============================================================

const DEFAULT_TITLE = '超市';
const DEFAULT_STORE_PRESET = 'store_aisle';
const DEFAULT_GOOD_MESH_PRESET = 'product_box';

/** Affordance tag marking an entity as a pickable, cart-addable good. */
const GOOD_AFFORDANCE_TAG = 'good';
const PICKABLE_AFFORDANCE_TAG = 'pickable';
/** Affordance tag marking the checkout trigger entity. */
const CHECKOUT_AFFORDANCE_TAG = 'checkout';

/** state.kv keys used by the supermarket experience. */
const KV_CART_KEY = 'cart';
const KV_SALES_KEY = 'sales';
/** amountRef the checkout charge references — recomputed server-side (§6). */
const CART_TOTAL_REF = 'cart.total';

/** The default goods roster generated when none is supplied. */
function defaultGoodsRoster(): SupermarketGoodSpec[] {
  return [
    { id: 'good_milk', displayName: '牛奶', priceAxp: 30 },
    { id: 'good_bread', displayName: '面包', priceAxp: 20 },
    { id: 'good_egg', displayName: '鸡蛋', priceAxp: 50 },
  ];
}

// ============================================================
// Entity builders
// ============================================================

/** Build the declarative store-shell layout entity. */
function buildStoreShell(storePreset: string): EcsEntity {
  return {
    id: 'store',
    components: {
      mesh: { preset: storePreset },
      light: { type: 'ambient' },
      collider: { shape: 'box', walkable: true },
    },
  };
}

/**
 * Build a declarative good entity. Carries a `price` component holding the AXP
 * price as declarative data (R15.2) plus pickable/good affordance tags so the
 * cart rules can target it. The price here is display data — never authoritative.
 */
function buildGoodEntity(good: SupermarketGoodSpec): EcsEntity {
  return {
    id: good.id,
    components: {
      mesh: good.assetRef
        ? { assetRef: good.assetRef }
        : { preset: good.meshPreset ?? DEFAULT_GOOD_MESH_PRESET },
      affordance: { tags: [PICKABLE_AFFORDANCE_TAG, GOOD_AFFORDANCE_TAG] },
      // Declarative AXP price (R15.2). Non-authoritative — server recomputes at checkout.
      price: { axp: good.priceAxp },
      ...(good.displayName ? { ui: { text: good.displayName } } : {}),
    },
  };
}

/** Build the checkout desk + checkout button + cart UI layout entities. */
function buildCheckoutEntities(): EcsEntity[] {
  return [
    {
      id: 'checkout_desk',
      components: {
        mesh: { preset: 'checkout_desk' },
        collider: { shape: 'box', walkable: false },
      },
    },
    {
      id: 'checkout_btn',
      components: {
        affordance: { tags: [CHECKOUT_AFFORDANCE_TAG] },
        ui: { panel: 'checkout', button: '结账' },
      },
    },
    {
      id: 'cart_ui',
      components: {
        ui: { panel: 'cart', kvKey: KV_CART_KEY },
      },
    },
  ];
}

// ============================================================
// Substrate_DSL rules (Tier_B — no arbitrary code)
// ============================================================

/**
 * Build the supermarket Substrate_DSL rules. Every action maps to a whitelisted
 * World_API capability (Tier_B compliant). No control flow — only event anchors,
 * read-only guards, and finite ordered action lists.
 */
function buildSupermarketRules(goods: SupermarketGoodSpec[]): SubstrateRule[] {
  const rules: SubstrateRule[] = [];

  // One add-to-cart rule per good: pick up / click the good → append it to the
  // visitor-scoped cart in state.kv. No price is computed here (declarative only).
  for (const good of goods) {
    rules.push({
      id: `rule_add_${good.id}`,
      on: { event: 'pickup', target: good.id },
      do: [
        {
          cap: WorldApiCapability.StateKv,
          args: { op: 'append', scope: 'visitor', key: KV_CART_KEY, valueRef: good.id },
        },
      ],
    });
  }

  // Checkout rule: click the checkout button while the cart is non-empty →
  //   1. economy.requestCharge — server recomputes the authoritative total from
  //      the goods' `price` components (Property 2, R15.3); the sandbox passes
  //      only `amountRef:"cart.total"`, never a computed amount.
  //   2. state.kv append the sale into the plot-scoped `sales` aggregation (R15.5).
  //   3. ui toast confirming the purchase.
  rules.push({
    id: 'rule_checkout',
    on: { event: 'click', target: 'checkout_btn' },
    when: [{ kv: 'cart.count', op: '>', value: 0 }],
    do: [
      {
        cap: WorldApiCapability.EconomyRequestCharge,
        args: { visitorRef: 'visitor', amountRef: CART_TOTAL_REF },
      },
      {
        cap: WorldApiCapability.StateKv,
        args: { op: 'append', scope: 'plot', key: KV_SALES_KEY, valueRef: KV_CART_KEY },
      },
      {
        cap: WorldApiCapability.Ui,
        args: { toast: '购买成功' },
      },
    ],
  });

  return rules;
}

// ============================================================
// Generator
// ============================================================

/**
 * Generate the Tier_B ECS_World for a checkout-capable supermarket (R15.1).
 *
 * Pure function — deterministic given its options, no I/O and no mutation of
 * inputs. The returned world is Tier_B-compliant by construction (declarative
 * layout + goods with declarative `price` components + Substrate_DSL cart/checkout
 * rules whose actions all map to whitelisted World_API capabilities; no
 * `logicModules`/`logicModuleRef`) and therefore passes `validateTier`.
 *
 * The generated world contains the LAYOUT, the GOODS (each with a declarative
 * AXP `price`, R15.2), the Substrate_DSL RULES, and the ECONOMY HOOKS
 * (`economy.requestCharge` at checkout, R15.1). The authoritative checkout total
 * is recomputed server-side from the `price` components — never in the sandbox
 * (R15.3, Property 2).
 *
 * @param opts supermarket generation options (plot id, title, goods roster)
 * @returns a Tier_B {@link EcsWorld} ready for diff/version persistence
 */
export function generateSupermarket(opts: SupermarketGeneratorOptions): EcsWorld {
  const plotId = opts.plotId;
  const title = opts.title ?? DEFAULT_TITLE;
  const storePreset = opts.storePreset ?? DEFAULT_STORE_PRESET;
  const goods =
    opts.goods && opts.goods.length > 0 ? opts.goods : defaultGoodsRoster();

  const entities: EcsEntity[] = [
    buildStoreShell(storePreset),
    ...goods.map(buildGoodEntity),
    ...buildCheckoutEntities(),
  ];

  const rules = buildSupermarketRules(goods);

  return {
    ecsVersion: ECS_VERSION,
    plotId,
    substrateTier: 'B',
    entities,
    rules,
    // Declarative goods manifest — each good's AXP price is declarative data (R15.2).
    defs: {
      goods: goods.map((good) => ({
        id: good.id,
        priceAxp: good.priceAxp,
        ...(good.displayName ? { displayName: good.displayName } : {}),
      })),
      currency: 'AXP',
      cartKvKey: KV_CART_KEY,
      salesKvKey: KV_SALES_KEY,
    },
    meta: {
      createdBy: 'agent',
      title,
      kind: 'supermarket',
    },
  };
}
