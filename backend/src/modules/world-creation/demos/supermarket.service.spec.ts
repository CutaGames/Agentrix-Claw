import type {
  EcsWorld,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import type {
  EconomyBridgeResponse,
  RequestChargeRequest,
} from '../../../../shared/types/world-creation-api';

import { EconomyBridgeService } from '../services/economy-bridge.service';
import { InMemoryPlotSalesStore } from '../economy/plot-sales.store';
import { InMemorySupermarketCartStore } from './supermarket-cart.store';
import { SupermarketEconomyBridgeService } from './supermarket-economy-bridge.service';
import { SupermarketService } from './supermarket.service';
import { generateSupermarket } from './supermarket-generator';

const PLOT = 'plot_market';
const VISITOR_ACCT = 'acct_visitor';
const VISITOR_USER = 'user_visitor';

/** Test subclass exposing the protected cart-aggregation override. */
class TestSupermarketEconomyBridge extends SupermarketEconomyBridgeService {
  public callResolve(world: EcsWorld, req: RequestChargeRequest) {
    return (this as any).resolveProposedLineItems(world, req);
  }
}

describe('SupermarketEconomyBridgeService.resolveProposedLineItems (cart aggregation, R15.3)', () => {
  it('aggregates the visitor cart into proposed line items (no prices read from cart)', () => {
    const cartStore = new InMemorySupermarketCartStore();
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 2);
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_bread', 1);

    const bridge = new TestSupermarketEconomyBridge(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      cartStore,
    );

    const world = generateSupermarket({
      plotId: PLOT,
      goods: [
        { id: 'good_milk', priceAxp: 30 },
        { id: 'good_bread', priceAxp: 20 },
      ],
    });

    const proposed = bridge.callResolve(world, {
      plotId: PLOT,
      visitorAccountId: VISITOR_ACCT,
      amountRef: 'cart.total',
    });

    expect(proposed).toEqual(
      expect.arrayContaining([
        { entityId: 'good_milk', quantity: 2 },
        { entityId: 'good_bread', quantity: 1 },
      ]),
    );
    // line items carry only what/how-many — never a price (Property 2).
    for (const li of proposed) {
      expect(li).not.toHaveProperty('axp');
      expect(li).not.toHaveProperty('unitAxp');
    }
  });

  it('returns an empty proposal for an empty cart (charge will be rejected, R15.6)', () => {
    const bridge = new TestSupermarketEconomyBridge(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      new InMemorySupermarketCartStore(),
    );
    const world = generateSupermarket({ plotId: PLOT });
    expect(bridge.callResolve(world, { plotId: PLOT, visitorAccountId: VISITOR_ACCT, amountRef: 'cart.total' })).toEqual([]);
  });
});

describe('EconomyBridgeService.getSalesReport (state.kv:sales aggregation, R15.5)', () => {
  function makeService(salesStore: InMemoryPlotSalesStore): EconomyBridgeService {
    // getSalesReport only depends on the sales store; other deps are unused here.
    return new EconomyBridgeService(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      salesStore,
    );
  }

  it('aggregates a daily report by total, count, and per-good from state.kv:sales', async () => {
    const salesStore = new InMemoryPlotSalesStore();
    const day = '2026-06-10';
    const ts = Date.parse(`${day}T08:00:00.000Z`);
    salesStore.appendSale(PLOT, {
      plotId: PLOT,
      visitorAccountId: 'a1',
      lineItems: [
        { goodId: 'good_milk', units: 2, axp: 60 },
        { goodId: 'good_bread', units: 1, axp: 20 },
      ],
      totalAxp: 80,
      ts,
    });
    salesStore.appendSale(PLOT, {
      plotId: PLOT,
      visitorAccountId: 'a2',
      lineItems: [{ goodId: 'good_milk', units: 1, axp: 30 }],
      totalAxp: 30,
      ts: ts + 3600_000,
    });

    const report = await makeService(salesStore).getSalesReport('owner', PLOT, day);
    expect(report.plotId).toBe(PLOT);
    expect(report.day).toBe(day);
    expect(report.totalAxp).toBe(110);
    expect(report.saleCount).toBe(2);
    const milk = report.byGood.find((g) => g.goodId === 'good_milk');
    expect(milk).toEqual({ goodId: 'good_milk', units: 3, axp: 90 });
    const bread = report.byGood.find((g) => g.goodId === 'good_bread');
    expect(bread).toEqual({ goodId: 'good_bread', units: 1, axp: 20 });
  });

  it('excludes sales from other days and returns an empty report when none match', async () => {
    const salesStore = new InMemoryPlotSalesStore();
    salesStore.appendSale(PLOT, {
      plotId: PLOT,
      visitorAccountId: 'a1',
      lineItems: [{ goodId: 'good_milk', units: 1, axp: 30 }],
      totalAxp: 30,
      ts: Date.parse('2026-06-09T08:00:00.000Z'),
    });
    const report = await makeService(salesStore).getSalesReport('owner', PLOT, '2026-06-10');
    expect(report.totalAxp).toBe(0);
    expect(report.saleCount).toBe(0);
    expect(report.byGood).toEqual([]);
  });

  it('returns an empty report when no sales store is bound', async () => {
    const svc = new EconomyBridgeService(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );
    const report = await svc.getSalesReport('owner', PLOT, '2026-06-10');
    expect(report).toMatchObject({ plotId: PLOT, totalAxp: 0, saleCount: 0, byGood: [] });
  });
});

describe('SupermarketService checkout closed loop (R15.4/R15.5/R15.6)', () => {
  /** Build a fake economy bridge whose charge result is scripted. */
  function fakeBridge(result: EconomyBridgeResponse) {
    const calls: Array<{ userId: string; req: RequestChargeRequest }> = [];
    const bridge = {
      requestCharge: jest.fn(async (userId: string, req: RequestChargeRequest) => {
        calls.push({ userId, req });
        return result;
      }),
    } as unknown as SupermarketEconomyBridgeService;
    return { bridge, calls };
  }

  it('on success appends an authoritative sale to state.kv:sales and clears the cart', async () => {
    const cartStore = new InMemorySupermarketCartStore();
    const salesStore = new InMemoryPlotSalesStore();
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 2);

    const { bridge, calls } = fakeBridge({
      ok: true,
      authoritativeAmount: 60,
      platformCut: 3,
      lineItems: [{ entityId: 'good_milk', quantity: 2, unitAxp: 30, lineAxp: 60 }],
    });

    const svc = new SupermarketService(bridge, cartStore, salesStore);
    const result = await svc.checkout({
      plotId: PLOT,
      visitorUserId: VISITOR_USER,
      visitorAccountId: VISITOR_ACCT,
      signedConfirmation: 'sig',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authoritativeAmount).toBe(60);
      expect(result.platformCut).toBe(3);
      expect(result.sale.lineItems).toEqual([{ goodId: 'good_milk', units: 2, axp: 60 }]);
    }
    // sale persisted to the shared sales store (closed loop with getSalesReport).
    const sales = salesStore.getSales(PLOT);
    expect(sales).toHaveLength(1);
    expect(sales[0].totalAxp).toBe(60);
    // cart cleared after a successful checkout.
    expect(cartStore.getCart(PLOT, VISITOR_ACCT)).toEqual([]);
    // the charge passed only an amountRef, never an amount (Property 2).
    expect(calls[0].req.amountRef).toBe('cart.total');
    expect(calls[0].userId).toBe(VISITOR_USER);
  });

  it('on failure informs the visitor without writing a sale or clearing the cart (R15.6)', async () => {
    const cartStore = new InMemorySupermarketCartStore();
    const salesStore = new InMemoryPlotSalesStore();
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 2);

    const error: WorldCreationError = { error: 'ECONOMY_REJECTED', detail: 'insufficient balance' };
    const { bridge } = fakeBridge({ ok: false, error });

    const svc = new SupermarketService(bridge, cartStore, salesStore);
    const result = await svc.checkout({
      plotId: PLOT,
      visitorUserId: VISITOR_USER,
      visitorAccountId: VISITOR_ACCT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(error);
      expect(result.message).toContain('购买未完成');
    }
    // no sale written, cart preserved — balance unchanged (guaranteed by Economy_Bridge).
    expect(salesStore.getSales(PLOT)).toEqual([]);
    expect(cartStore.getCart(PLOT, VISITOR_ACCT)).toEqual([{ goodId: 'good_milk', quantity: 2 }]);
  });
});

// ============================================================
// Task 18.2 — Supermarket checkout closed-loop INTEGRATION test.
//
// Wires the REAL server-authoritative stack end-to-end:
//   SupermarketService
//     → SupermarketEconomyBridgeService  (real cart-aggregation override)
//       → EconomyBridgeService           (real authoritative pricing + Trust gate)
//         → TrustGateService             (real HMAC Trust_Level-3 signing)
//         → AxpService.spend/earn        (mocked wallet, tracks balances)
//         → plotRepo / agentAccountRepo / costRecordRepo (mocked TypeORM repos)
//         → EcsWorldService.loadWorldAtVersion (mocked → supermarket world)
//   real InMemorySupermarketCartStore + InMemoryPlotSalesStore (shared)
//
// Covers (R15.3 / R15.4 / R15.6, Property 2):
//   (1) authoritative checkout total = server recompute from `price.axp`,
//       ignoring any sandbox-supplied amount,
//   (2) owner net credit = authoritative total − platform cut (spend debits
//       buyer, earn credits owner net),
//   (3) success → state.kv:sales aggregation → getSalesReport daily report,
//   (4) checkout fails (spend throws) → purchase not completed, cart preserved,
//       balance unchanged (earn never called).
// ============================================================

import { REVENUE_SHARE_FIRST_SALE } from '../../../../shared/types/world-creation';
import { TrustGateService } from '../economy/trust-gate.service';

describe('SupermarketService checkout integration (server-authoritative wiring, R15.3/R15.4/R15.6)', () => {
  const OWNER_ACCT = 'acct_owner';
  const OWNER_USER = 'user_owner';
  const ECS_VERSION_ID = 'ecs_v1';

  /** Trust gate backed by a fixed secret (no NestJS config needed). */
  function makeTrustGate(): TrustGateService {
    return new TrustGateService({ get: () => 'integration-test-secret' } as any);
  }

  /** Mint a valid Trust_Level-3 confirmation bound to (user, plot, amountRef). */
  function signConfirmation(
    trustGate: TrustGateService,
    userId: string,
    amountRef = 'cart.total',
  ): string {
    return trustGate.signConfirmation({
      userId,
      plotId: PLOT,
      amountRef,
      trustLevel: 3,
      exp: Date.now() + 60_000,
    });
  }

  /** A mocked AXP wallet that tracks per-user balances through spend/earn. */
  function makeAxpWallet(initial: Record<string, number>) {
    const balances = new Map<string, number>(Object.entries(initial));
    const axp = {
      spend: jest.fn(async ({ userId, amount }: { userId: string; amount: number }) => {
        const cur = balances.get(userId) ?? 0;
        if (cur < amount) {
          throw new Error(`insufficient AXP balance (have ${cur}, need ${amount})`);
        }
        balances.set(userId, cur - amount);
        return { ledger_id: 'led_spend', balance: cur - amount };
      }),
      earn: jest.fn(async ({ userId, amount }: { userId: string; amount: number }) => {
        const cur = balances.get(userId) ?? 0;
        balances.set(userId, cur + amount);
        return { ledger_id: 'led_earn', balance: cur + amount };
      }),
    };
    return { axp, balances };
  }

  /**
   * Build the full real stack. `goods` define the authoritative ECS_World
   * (each good carries a declarative `price.axp`); only AxpService + repos +
   * EcsWorldService are mocked.
   */
  function makeStack(opts: {
    goods: Array<{ id: string; priceAxp: number }>;
    initialBalances: Record<string, number>;
  }) {
    const cartStore = new InMemorySupermarketCartStore();
    const salesStore = new InMemoryPlotSalesStore();
    const trustGate = makeTrustGate();
    const { axp, balances } = makeAxpWallet(opts.initialBalances);

    const world = generateSupermarket({ plotId: PLOT, goods: opts.goods });

    const plotRepo = {
      findOne: jest.fn(async () => ({
        id: PLOT,
        ownerAccountId: OWNER_ACCT,
        ecsVersionId: ECS_VERSION_ID,
        title: '超市',
      })),
    };
    const agentAccountRepo = {
      findOne: jest.fn(async ({ where: { id } }: { where: { id: string } }) =>
        id === OWNER_ACCT ? { id: OWNER_ACCT, ownerId: OWNER_USER } : null,
      ),
    };
    const costRecordRepo = {
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: unknown) => x),
    };
    const ecsWorldService = {
      loadWorldAtVersion: jest.fn(async () => world),
    };

    const bridge = new SupermarketEconomyBridgeService(
      plotRepo as any,
      agentAccountRepo as any,
      costRecordRepo as any,
      ecsWorldService as any,
      axp as any,
      trustGate,
      cartStore,
      salesStore,
    );

    const svc = new SupermarketService(bridge, cartStore, salesStore);

    return { svc, bridge, cartStore, salesStore, trustGate, axp, balances, costRecordRepo, world };
  }

  it('(1) recomputes the authoritative checkout total server-side from price.axp, ignoring sandbox amounts (Property 2, R15.3)', async () => {
    const { bridge, cartStore, trustGate } = makeStack({
      goods: [
        { id: 'good_milk', priceAxp: 30 },
        { id: 'good_bread', priceAxp: 20 },
      ],
      initialBalances: { [VISITOR_USER]: 1000, [OWNER_USER]: 0 },
    });
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 2);
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_bread', 1);

    // Call the bridge directly with a forged sandbox display hint — it must be ignored.
    const result = await bridge.requestCharge(VISITOR_USER, {
      plotId: PLOT,
      visitorAccountId: VISITOR_ACCT,
      amountRef: 'cart.total',
      displayHintAmount: 999_999, // forged sandbox value — must NOT be charged
      signedConfirmation: signConfirmation(trustGate, VISITOR_USER),
    });

    expect(result.ok).toBe(true);
    // 2*30 + 1*20 = 80 — recomputed from the authoritative price components.
    expect(result.authoritativeAmount).toBe(80);
    expect(result.lineItems).toEqual(
      expect.arrayContaining([
        { entityId: 'good_milk', quantity: 2, unitAxp: 30, lineAxp: 60 },
        { entityId: 'good_bread', quantity: 1, unitAxp: 20, lineAxp: 20 },
      ]),
    );
  });

  it('(2) credits the owner the authoritative total net of the platform cut (R15.4)', async () => {
    const { bridge, cartStore, trustGate, axp, balances } = makeStack({
      goods: [{ id: 'good_milk', priceAxp: 30 }],
      initialBalances: { [VISITOR_USER]: 1000, [OWNER_USER]: 0 },
    });
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 4); // total = 120

    const result = await bridge.requestCharge(VISITOR_USER, {
      plotId: PLOT,
      visitorAccountId: VISITOR_ACCT,
      amountRef: 'cart.total',
      signedConfirmation: signConfirmation(trustGate, VISITOR_USER),
    });

    const total = 120;
    const cut = Math.round(total * REVENUE_SHARE_FIRST_SALE); // 6
    const ownerCredit = total - cut; // 114

    expect(result.ok).toBe(true);
    expect(result.authoritativeAmount).toBe(total);
    expect(result.platformCut).toBe(cut);

    // buyer debited the full authoritative total; owner credited the net.
    expect(axp.spend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VISITOR_USER, amount: total }),
    );
    expect(axp.earn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER_USER, amount: ownerCredit }),
    );
    expect(balances.get(VISITOR_USER)).toBe(1000 - total);
    expect(balances.get(OWNER_USER)).toBe(ownerCredit);
  });

  it('(3) aggregates a successful sale into state.kv:sales and surfaces it in the daily report (R15.5)', async () => {
    const { svc, cartStore, salesStore, trustGate } = makeStack({
      goods: [
        { id: 'good_milk', priceAxp: 30 },
        { id: 'good_bread', priceAxp: 20 },
      ],
      initialBalances: { [VISITOR_USER]: 1000, [OWNER_USER]: 0 },
    });
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 2);
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_bread', 1);

    const checkout = await svc.checkout({
      plotId: PLOT,
      visitorUserId: VISITOR_USER,
      visitorAccountId: VISITOR_ACCT,
      signedConfirmation: signConfirmation(trustGate, VISITOR_USER),
    });

    expect(checkout.ok).toBe(true);
    // sale persisted to the shared sales store + cart cleared.
    expect(salesStore.getSales(PLOT)).toHaveLength(1);
    expect(cartStore.getCart(PLOT, VISITOR_ACCT)).toEqual([]);

    // closed loop: getDailySalesReport reads the same state.kv:sales aggregation.
    const today = new Date().toISOString().slice(0, 10);
    const report = await svc.getDailySalesReport(OWNER_USER, PLOT, today);
    expect(report.totalAxp).toBe(80);
    expect(report.saleCount).toBe(1);
    expect(report.byGood).toEqual(
      expect.arrayContaining([
        { goodId: 'good_milk', units: 2, axp: 60 },
        { goodId: 'good_bread', units: 1, axp: 20 },
      ]),
    );
  });

  it('(4) on a failed charge (insufficient balance) the purchase does not complete, cart is preserved, and no balance changes (R15.6)', async () => {
    const { svc, cartStore, salesStore, trustGate, axp, balances } = makeStack({
      goods: [{ id: 'good_milk', priceAxp: 30 }],
      initialBalances: { [VISITOR_USER]: 10, [OWNER_USER]: 0 }, // too low for 60
    });
    cartStore.addToCart(PLOT, VISITOR_ACCT, 'good_milk', 2); // total = 60 > 10

    const result = await svc.checkout({
      plotId: PLOT,
      visitorUserId: VISITOR_USER,
      visitorAccountId: VISITOR_ACCT,
      signedConfirmation: signConfirmation(trustGate, VISITOR_USER),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toBe('ECONOMY_REJECTED');
      expect(result.message).toContain('购买未完成');
    }
    // spend attempted and threw; owner credit (earn) NEVER ran (R15.6).
    expect(axp.spend).toHaveBeenCalledTimes(1);
    expect(axp.earn).not.toHaveBeenCalled();
    // balances unchanged, cart preserved, no sale written.
    expect(balances.get(VISITOR_USER)).toBe(10);
    expect(balances.get(OWNER_USER)).toBe(0);
    expect(cartStore.getCart(PLOT, VISITOR_ACCT)).toEqual([{ goodId: 'good_milk', quantity: 2 }]);
    expect(salesStore.getSales(PLOT)).toEqual([]);
  });
});
