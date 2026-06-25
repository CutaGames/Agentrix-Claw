/**
 * Property 2: 经济服务端权威 (Economy server-authoritative) — fast-check.
 *
 * 不可协商安全不变量 (design §6, Correctness Property 2)：
 *   任何沙箱传入金额都不影响实际记账，金额唯一来源是服务端重算。
 *
 * 沙箱只能提议 *买什么* (entityId + quantity)；*多少钱* 永远由服务端按 Plot 权威
 * ECS_World 的声明式 `price` 组件重算。本测试在两层验证该不变量：
 *
 *   1. 纯函数层 (priceLineItems / buildAxpPriceIndex) — 主断言，最稳：
 *      对任意随机 ECS_World 与任意随机沙箱提议（含注入的恶意金额字段），权威总额
 *      只来自 world 的 `price` 组件，与任何沙箱传入金额完全无关。
 *
 *   2. 服务层 (EconomyBridgeService.requestCharge with mocked AxpService) — 附加：
 *      对任意随机 displayHintAmount，实际入账 (axpService.spend) 的金额恒等于
 *      priceLineItems 的权威重算结果，与 displayHintAmount 无关。
 *
 * **Validates: Requirements 7.2, 7.3, 15.3**
 */

import * as fc from 'fast-check';

import {
  buildAxpPriceIndex,
  priceLineItems,
  type ProposedLineItem,
} from './authoritative-pricing';
import { EconomyBridgeService } from '../services/economy-bridge.service';
import { TrustGateService } from './trust-gate.service';
import type { EcsWorld } from '../../../../shared/types/world-creation';
import type { RequestChargeRequest } from '../../../../shared/types/world-creation-api';
import type { ConfigService } from '@nestjs/config';

// ============================================================
// Generators
// ============================================================

/** A finite, non-negative AXP price the server would store declaratively. */
const arbAxpPrice = fc.oneof(
  fc.integer({ min: 0, max: 1_000_000 }),
  fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
);

/** An arbitrary, attacker-controlled "money-like" value a sandbox might inject. */
const arbMaliciousAmount = fc.oneof(
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.double({ noNaN: false }), // includes NaN / Infinity
  fc.constant(Number.MAX_SAFE_INTEGER),
  fc.constant(-0),
);

/**
 * Generate an ECS_World whose entities carry a mix of priced / unpriced /
 * malformed `price` components, plus the set of entity ids that resolve to an
 * authoritative price.
 */
const arbWorldWithGoods = fc
  .uniqueArray(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,11}$/),
    { minLength: 1, maxLength: 8 },
  )
  .chain((ids) =>
    fc.tuple(
      fc.constant(ids),
      // For each id, decide its price component shape.
      fc.array(
        fc.oneof(
          arbAxpPrice.map((axp) => ({ kind: 'priced' as const, axp })),
          fc.constant({ kind: 'unpriced' as const }),
          // malformed / non-authoritative prices the index must reject:
          fc.constant({ kind: 'negative' as const }),
          fc.constant({ kind: 'nan' as const }),
        ),
        { minLength: ids.length, maxLength: ids.length },
      ),
      fc.constantFrom('A', 'B', 'C') as fc.Arbitrary<'A' | 'B' | 'C'>,
    ),
  )
  .map(([ids, priceShapes, tier]) => {
    const entities = ids.map((id, i) => {
      const shape = priceShapes[i];
      switch (shape.kind) {
        case 'priced':
          return { id, components: { price: { axp: shape.axp } } };
        case 'negative':
          return { id, components: { price: { axp: -42 } } };
        case 'nan':
          return { id, components: { price: { axp: Number.NaN } } };
        default:
          return { id, components: { mesh: { preset: 'shelf' } } };
      }
    });
    const world: EcsWorld = {
      ecsVersion: '1.0',
      plotId: 'plot_pbt',
      substrateTier: tier,
      entities,
    };
    const pricedIds = ids.filter(
      (_, i) => priceShapes[i].kind === 'priced',
    );
    return { world, pricedIds, allIds: ids };
  });

/** Generate proposed line items referencing arbitrary (maybe-unknown) entity ids. */
function arbProposed(allIds: string[]) {
  const idArb =
    allIds.length > 0
      ? fc.oneof(fc.constantFrom(...allIds), fc.string()) // known + unknown ids
      : fc.string();
  return fc.array(
    fc.record({
      entityId: idArb,
      quantity: fc.oneof(
        fc.integer({ min: -5, max: 50 }),
        fc.double({ noNaN: false }),
      ),
    }),
    { maxLength: 10 },
  );
}

// ============================================================
// Property 2 — pure pricing layer (primary, most stable)
// ============================================================

describe('Property 2: 经济服务端权威 — pure pricing layer', () => {
  it('authoritative unit prices come ONLY from the ECS_World price components', () => {
    fc.assert(
      fc.property(
        arbWorldWithGoods.chain((g) =>
          fc.tuple(fc.constant(g), arbProposed(g.allIds)),
        ),
        ([{ world }, proposed]) => {
          const index = buildAxpPriceIndex(world);
          const pricing = priceLineItems(world, proposed as ProposedLineItem[]);
          if (pricing === null) return; // nothing resolved → no charge possible

          let expectedTotal = 0;
          for (const line of pricing.lineItems) {
            // Each unit price must equal the world's declarative price — never
            // anything supplied by the sandbox proposal.
            expect(line.unitAxp).toBe(index.get(line.entityId));
            expect(line.lineAxp).toBe(line.unitAxp * line.quantity);
            expect(Number.isInteger(line.quantity)).toBe(true);
            expect(line.quantity).toBeGreaterThan(0);
            expectedTotal += line.lineAxp;
          }
          expect(pricing.totalAxp).toBe(Math.round(expectedTotal));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('injecting malicious price/amount fields into the proposal cannot change the authoritative result', () => {
    fc.assert(
      fc.property(
        arbWorldWithGoods.chain((g) =>
          fc.tuple(
            fc.constant(g),
            arbProposed(g.allIds),
            fc.array(arbMaliciousAmount, { maxLength: 10 }),
          ),
        ),
        ([{ world }, proposed, evilAmounts]) => {
          const clean = proposed as ProposedLineItem[];
          // A tampered proposal carrying attacker-controlled monetary fields on
          // every line item (price, axp, unitAxp, lineAxp, total, amount, ...).
          const tampered = clean.map((item, i) => ({
            entityId: item.entityId,
            quantity: item.quantity,
            // Sandbox-forged amounts — must be completely ignored by the server:
            price: evilAmounts[i % Math.max(evilAmounts.length, 1)] ?? 999_999,
            axp: evilAmounts[i % Math.max(evilAmounts.length, 1)] ?? 1,
            usd: 999_999,
            unitAxp: 0,
            lineAxp: 0,
            total: -1,
            amount: Number.MAX_SAFE_INTEGER,
            displayHintAmount: 0,
          })) as unknown as ProposedLineItem[];

          const a = priceLineItems(world, clean);
          const b = priceLineItems(world, tampered);
          // Identical authoritative result regardless of injected money fields.
          expect(b).toEqual(a);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ============================================================
// Property 2 — service layer (mocked AxpService captures actual accounting)
// ============================================================

describe('Property 2: 经济服务端权威 — EconomyBridgeService.requestCharge', () => {
  const PAYER = 'user_payer';
  const OWNER = 'user_owner';
  const OWNER_ACCOUNT = 'acct_owner';
  const VERSION_ID = 'ecsver_1';

  /** A TrustGateService with a fixed dev secret so the test can mint tokens. */
  function buildTrustGate(): TrustGateService {
    const fakeConfig = {
      get: (_key: string) => 'pbt-trust-secret',
    } as unknown as ConfigService;
    return new TrustGateService(fakeConfig);
  }

  it('credits exactly the server-recomputed amount, independent of any sandbox displayHintAmount', async () => {
    await fc.assert(
      fc.asyncProperty(
        // World with at least one priced good + the chosen good id.
        fc
          .uniqueArray(fc.stringMatching(/^[a-z][a-z0-9_]{0,11}$/), {
            minLength: 1,
            maxLength: 5,
          })
          .chain((ids) =>
            fc.tuple(
              fc.constant(ids),
              fc.array(arbAxpPrice, { minLength: ids.length, maxLength: ids.length }),
              fc.integer({ min: 0, max: ids.length - 1 }),
            ),
          ),
        // An arbitrary, hostile sandbox display hint that must be ignored.
        arbMaliciousAmount,
        async ([ids, prices, pickIdx], displayHint) => {
          const entities = ids.map((id, i) => ({
            id,
            components: { price: { axp: prices[i] } },
          }));
          const world: EcsWorld = {
            ecsVersion: '1.0',
            plotId: 'plot_svc',
            substrateTier: 'B',
            entities,
          };
          const amountRef = ids[pickIdx];

          const expected = priceLineItems(world, [
            { entityId: amountRef, quantity: 1 },
          ]);
          expect(expected).not.toBeNull();
          const authoritative = expected!.totalAxp;

          // Capture the amount actually debited from the payer.
          let spentAmount: number | undefined;
          const axpServiceMock = {
            spend: jest.fn(async (args: { amount: number }) => {
              spentAmount = args.amount;
            }),
            earn: jest.fn(async () => undefined),
          };

          const plotRepoMock = {
            findOne: jest.fn(async () => ({
              id: world.plotId,
              ecsVersionId: VERSION_ID,
              ownerAccountId: OWNER_ACCOUNT,
              title: 'PBT Plot',
            })),
          };
          const agentAccountRepoMock = {
            findOne: jest.fn(async () => ({ id: OWNER_ACCOUNT, ownerId: OWNER })),
          };
          const costRecordRepoMock = {
            create: jest.fn((x: unknown) => x),
            save: jest.fn(async (x: unknown) => x),
          };
          const ecsWorldServiceMock = {
            loadWorldAtVersion: jest.fn(async () => world),
          };

          const trustGate = buildTrustGate();
          const signedConfirmation = trustGate.signConfirmation({
            userId: PAYER,
            plotId: world.plotId,
            amountRef,
            trustLevel: 3,
            exp: Date.now() + 60_000,
          });

          const service = new EconomyBridgeService(
            plotRepoMock as never,
            agentAccountRepoMock as never,
            costRecordRepoMock as never,
            ecsWorldServiceMock as never,
            axpServiceMock as never,
            trustGate,
          );

          const req: RequestChargeRequest = {
            plotId: world.plotId,
            visitorAccountId: 'acct_payer',
            amountRef,
            displayHintAmount: displayHint, // hostile / nonsense value
            signedConfirmation,
          };

          const res = await service.requestCharge(PAYER, req);

          // The charge commits with the server-authoritative amount, and the
          // amount actually debited equals the recomputed total — never the
          // sandbox-supplied displayHintAmount.
          expect(res.ok).toBe(true);
          expect(res.authoritativeAmount).toBe(authoritative);
          expect(spentAmount).toBe(authoritative);
        },
      ),
      { numRuns: 200 },
    );
  });
});
