/**
 * Authoritative pricing unit tests (task 7.1, design §6).
 *
 * Focused coverage of the pure server-side price recomputation that backs the
 * Economy_Bridge's server-authoritative invariant: amounts come only from the
 * Plot's declarative `price` components, never from sandbox-supplied values.
 *
 * (The fast-check Property 2 — "经济服务端权威" at the service level — is the
 * dedicated task 7.3; these are example-based unit tests of the pricing core.)
 */

import {
  buildAxpPriceIndex,
  priceLineItems,
} from './authoritative-pricing';
import type { EcsWorld } from '../../../../shared/types/world-creation';

function worldWithGoods(): EcsWorld {
  return {
    ecsVersion: '1.0',
    plotId: 'plot_test',
    substrateTier: 'B',
    entities: [
      { id: 'milk', components: { price: { axp: 3 } } },
      { id: 'bread', components: { price: { axp: 5 } } },
      { id: 'shelf', components: { mesh: { preset: 'shelf_wood' } } }, // unpriced
    ],
  };
}

describe('buildAxpPriceIndex', () => {
  it('indexes only entities with a numeric price.axp component', () => {
    const index = buildAxpPriceIndex(worldWithGoods());
    expect(index.get('milk')).toBe(3);
    expect(index.get('bread')).toBe(5);
    expect(index.has('shelf')).toBe(false);
  });

  it('ignores negative / non-finite prices', () => {
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'p',
      substrateTier: 'A',
      entities: [
        { id: 'bad', components: { price: { axp: -10 } } },
        { id: 'nan', components: { price: { axp: Number.NaN } } },
      ],
    };
    const index = buildAxpPriceIndex(world);
    expect(index.size).toBe(0);
  });
});

describe('priceLineItems', () => {
  it('recomputes the authoritative total from the ECS_World, not from any proposed price', () => {
    const world = worldWithGoods();
    // The proposed line items carry only entityId + quantity; prices come from the world.
    const pricing = priceLineItems(world, [
      { entityId: 'milk', quantity: 2 },
      { entityId: 'bread', quantity: 1 },
    ]);
    expect(pricing).not.toBeNull();
    expect(pricing!.totalAxp).toBe(2 * 3 + 5); // 11 AXP
    expect(pricing!.lineItems).toEqual([
      { entityId: 'milk', quantity: 2, unitAxp: 3, lineAxp: 6 },
      { entityId: 'bread', quantity: 1, unitAxp: 5, lineAxp: 5 },
    ]);
  });

  it('skips unknown / unpriced entities and clamps non-positive quantities', () => {
    const world = worldWithGoods();
    const pricing = priceLineItems(world, [
      { entityId: 'milk', quantity: 1 },
      { entityId: 'shelf', quantity: 1 }, // unpriced → skipped
      { entityId: 'ghost', quantity: 5 }, // unknown → skipped
      { entityId: 'bread', quantity: 0 }, // zero qty → skipped
    ]);
    expect(pricing).not.toBeNull();
    expect(pricing!.totalAxp).toBe(3);
    expect(pricing!.lineItems).toHaveLength(1);
  });

  it('floors fractional quantities to a safe integer', () => {
    const world = worldWithGoods();
    const pricing = priceLineItems(world, [{ entityId: 'milk', quantity: 2.9 }]);
    expect(pricing!.totalAxp).toBe(2 * 3);
  });

  it('returns null when no line item resolves to an authoritative price', () => {
    const world = worldWithGoods();
    expect(priceLineItems(world, [{ entityId: 'ghost', quantity: 1 }])).toBeNull();
    expect(priceLineItems(world, [])).toBeNull();
  });
});
