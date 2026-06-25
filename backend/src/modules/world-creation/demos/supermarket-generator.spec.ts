import {
  SupermarketGoodSpec,
  generateSupermarket,
} from './supermarket-generator';
import { validateTier } from '../ecs/tier-validator';
import { buildAxpPriceIndex } from '../economy/authoritative-pricing';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

describe('generateSupermarket', () => {
  it('produces a Tier_B-compliant ECS_World (passes validateTier)', () => {
    const world = generateSupermarket({ plotId: 'plot_1' });
    expect(world.substrateTier).toBe('B');
    expect(validateTier(world)).toBeNull();
  });

  it('emits no Tier_C logic modules or logicModuleRef components (no arbitrary code)', () => {
    const world = generateSupermarket({ plotId: 'plot_1' });
    expect(world.logicModules ?? []).toHaveLength(0);
    for (const entity of world.entities) {
      expect(entity.components.logicModuleRef).toBeUndefined();
    }
  });

  it('includes store shell, checkout button, and cart UI layout entities', () => {
    const world = generateSupermarket({ plotId: 'plot_1' });
    const ids = world.entities.map((e) => e.id);
    expect(ids).toContain('store');
    expect(ids).toContain('checkout_desk');
    expect(ids).toContain('checkout_btn');
    expect(ids).toContain('cart_ui');

    const checkoutBtn = world.entities.find((e) => e.id === 'checkout_btn');
    expect(checkoutBtn?.components.affordance?.tags).toContain('checkout');
    expect(checkoutBtn?.components.ui?.button).toBe('结账');

    const cartUi = world.entities.find((e) => e.id === 'cart_ui');
    expect(cartUi?.components.ui?.kvKey).toBe('cart');
  });

  it('assigns each good a declarative AXP price stored as data (R15.2)', () => {
    const goods: SupermarketGoodSpec[] = [
      { id: 'good_milk', displayName: '牛奶', priceAxp: 30 },
      { id: 'good_bread', displayName: '面包', priceAxp: 20 },
    ];
    const world = generateSupermarket({ plotId: 'plot_1', goods });

    const milk = world.entities.find((e) => e.id === 'good_milk');
    expect(milk?.components.price?.axp).toBe(30);
    expect(milk?.components.affordance?.tags).toEqual(
      expect.arrayContaining(['pickable', 'good']),
    );

    // The declarative price index (used by server-side authoritative pricing)
    // resolves every good's AXP price from the price components.
    const index = buildAxpPriceIndex(world);
    expect(index.get('good_milk')).toBe(30);
    expect(index.get('good_bread')).toBe(20);
  });

  it('records the goods manifest with prices in defs (declarative data)', () => {
    const world = generateSupermarket({
      plotId: 'plot_1',
      goods: [{ id: 'good_egg', priceAxp: 50 }],
    });
    const goods = (world.defs?.goods ?? []) as Array<{ id: string; priceAxp: number }>;
    expect(goods).toEqual([{ id: 'good_egg', priceAxp: 50 }]);
    expect(world.defs?.currency).toBe('AXP');
  });

  it('generates a default goods roster when none is supplied', () => {
    const world = generateSupermarket({ plotId: 'plot_1' });
    const goods = (world.defs?.goods ?? []) as Array<{ id: string }>;
    expect(goods.length).toBeGreaterThan(0);
    // every default good carries a price component.
    for (const g of goods) {
      const entity = world.entities.find((e) => e.id === g.id);
      expect(typeof entity?.components.price?.axp).toBe('number');
    }
  });

  it('emits an add-to-cart rule per good that only appends to state.kv (no amount)', () => {
    const goods: SupermarketGoodSpec[] = [
      { id: 'good_milk', priceAxp: 30 },
      { id: 'good_bread', priceAxp: 20 },
    ];
    const world = generateSupermarket({ plotId: 'plot_1', goods });
    const rules = world.rules ?? [];

    for (const good of goods) {
      const rule = rules.find((r) => r.id === `rule_add_${good.id}`);
      expect(rule?.on.event).toBe('pickup');
      expect(rule?.on.target).toBe(good.id);
      expect(rule?.do).toHaveLength(1);
      expect(rule?.do[0].cap).toBe(WorldApiCapability.StateKv);
      expect(rule?.do[0].args).toMatchObject({ op: 'append', key: 'cart', valueRef: good.id });
      // no price/amount is ever embedded in the cart rule.
      expect(JSON.stringify(rule)).not.toMatch(/axp|price|amount/i);
    }
  });

  it('emits a checkout rule: requestCharge + state.kv sales append + ui toast', () => {
    const world = generateSupermarket({ plotId: 'plot_1' });
    const checkout = (world.rules ?? []).find((r) => r.id === 'rule_checkout');

    expect(checkout?.on.event).toBe('click');
    expect(checkout?.on.target).toBe('checkout_btn');
    expect(checkout?.when?.[0]).toMatchObject({ kv: 'cart.count', op: '>', value: 0 });

    const caps = checkout?.do.map((a) => a.cap) ?? [];
    expect(caps).toEqual([
      WorldApiCapability.EconomyRequestCharge,
      WorldApiCapability.StateKv,
      WorldApiCapability.Ui,
    ]);

    // the charge carries only an amountRef — never a computed amount (Property 2, R15.3).
    const chargeAction = checkout?.do.find((a) => a.cap === WorldApiCapability.EconomyRequestCharge);
    expect(chargeAction?.args).toMatchObject({ amountRef: 'cart.total' });
    expect(chargeAction?.args).not.toHaveProperty('amount');
    expect(chargeAction?.args).not.toHaveProperty('total');

    // sales append targets the plot-scoped sales aggregation (R15.5).
    const salesAction = checkout?.do.find((a) => a.cap === WorldApiCapability.StateKv);
    expect(salesAction?.args).toMatchObject({ op: 'append', scope: 'plot', key: 'sales' });
  });

  it('is deterministic for identical options', () => {
    const a = generateSupermarket({ plotId: 'plot_1', goods: [{ id: 'g', priceAxp: 10 }] });
    const b = generateSupermarket({ plotId: 'plot_1', goods: [{ id: 'g', priceAxp: 10 }] });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
