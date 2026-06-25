import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { EconomyBridgeService } from './economy-bridge.service';
import { EcsWorldService } from './ecs-world.service';
import { TrustGateService } from '../economy/trust-gate.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import { AxpService } from '../../axp/axp.service';

import type { EcsWorld } from '../../../../shared/types/world-creation';
import {
  REVENUE_SHARE_FIRST_SALE,
  TRUST_LEVEL_PURCHASE,
} from '../../../../shared/types/world-creation';
import type { RequestChargeRequest } from '../../../../shared/types/world-creation-api';

/**
 * Economy_Bridge security regression tests (Task 7.4, R7.4 / R7.6).
 *
 * These tests lock the non-negotiable server-authoritative economy invariants
 * against regression:
 *
 *  1. A forged sandbox amount (`displayHintAmount`) NEVER influences the actual
 *     charge — the spent amount equals the server-side authoritative recompute
 *     of the Plot's declarative ECS_World pricing.
 *  2. A missing Trust_Level 3 signed confirmation is rejected BEFORE any wallet
 *     touch — `spend`/`earn` are never called.
 *  3. An invalid signature or insufficient Trust level is rejected and no
 *     balance is altered.
 *  4. A valid Trust-3 signature with sufficient balance succeeds and charges
 *     exactly the authoritative amount.
 *
 * A REAL {@link TrustGateService} is used (driven by {@link TrustGateService.signConfirmation}
 * to mint valid / invalid tokens); all other collaborators are mocked so the
 * assertions observe whether the wallet (`AxpService`) was touched and with
 * what amount.
 */
describe('EconomyBridgeService — security regression (Task 7.4)', () => {
  let service: EconomyBridgeService;
  let trustGate: TrustGateService;

  let axpService: { spend: jest.Mock; earn: jest.Mock };
  let plotRepo: { findOne: jest.Mock };
  let agentAccountRepo: { findOne: jest.Mock };
  let costRecordRepo: { create: jest.Mock; save: jest.Mock };
  let ecsWorldService: { loadWorldAtVersion: jest.Mock };

  const TRUST_SECRET = 'test-trust-secret-7.4';

  const USER_ID = 'payer-user-1';
  const PLOT_ID = 'plot-shop-1';
  const ECS_VERSION_ID = 'ecs-v1';
  const OWNER_ACCOUNT_ID = 'acc-owner-1';
  const OWNER_USER_ID = 'owner-user-1';

  const GOOD_ID = 'good_milk';
  /** Authoritative declarative price for the good (AXP). */
  const AUTHORITATIVE_AXP = 100;
  /** A wildly forged sandbox display hint the server MUST ignore. */
  const FORGED_HINT = 999_999;

  const expectedPlatformCut = Math.round(AUTHORITATIVE_AXP * REVENUE_SHARE_FIRST_SALE); // 5
  const expectedOwnerCredit = AUTHORITATIVE_AXP - expectedPlatformCut; // 95

  /** Plot whose owner AgentAccount resolves to a distinct owner user. */
  const plot: WorldPlot = {
    id: PLOT_ID,
    ownerAccountId: OWNER_ACCOUNT_ID,
    substrateTier: 'B',
    ecsVersionId: ECS_VERSION_ID,
    mapX: 1,
    mapY: 2,
    status: 'published',
    title: 'Corner Shop',
    boundAgentId: null,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as WorldPlot;

  /** Authoritative ECS_World: the good carries the only trusted price. */
  const world: EcsWorld = {
    ecsVersion: '1.0',
    plotId: PLOT_ID,
    substrateTier: 'B',
    entities: [
      {
        id: GOOD_ID,
        components: { price: { axp: AUTHORITATIVE_AXP } } as any,
      },
    ],
  };

  /** Mint a valid Trust-3 confirmation bound to (user, plot, amountRef). */
  function validConfirmation(
    overrides: Partial<{
      userId: string;
      plotId: string;
      amountRef: string;
      trustLevel: number;
      exp: number;
    }> = {},
  ): string {
    return trustGate.signConfirmation({
      userId: overrides.userId ?? USER_ID,
      plotId: overrides.plotId ?? PLOT_ID,
      amountRef: overrides.amountRef ?? GOOD_ID,
      trustLevel: overrides.trustLevel ?? TRUST_LEVEL_PURCHASE,
      exp: overrides.exp ?? Date.now() + 60_000,
    });
  }

  function chargeReq(overrides: Partial<RequestChargeRequest> = {}): RequestChargeRequest {
    return {
      plotId: PLOT_ID,
      visitorAccountId: USER_ID,
      amountRef: GOOD_ID,
      displayHintAmount: FORGED_HINT,
      ...overrides,
    };
  }

  beforeEach(async () => {
    axpService = {
      spend: jest.fn().mockResolvedValue({ ledger_id: 'led-1', balance: 0 }),
      earn: jest.fn().mockResolvedValue({ ledger_id: 'led-2', balance: 0 }),
    };
    plotRepo = { findOne: jest.fn().mockResolvedValue(plot) };
    agentAccountRepo = {
      findOne: jest.fn().mockResolvedValue({ id: OWNER_ACCOUNT_ID, ownerId: OWNER_USER_ID }),
    };
    costRecordRepo = {
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };
    ecsWorldService = { loadWorldAtVersion: jest.fn().mockResolvedValue(world) };

    // Real TrustGateService with a fixed secret so signConfirmation produces
    // tokens this same instance verifies (sandbox has no secret → cannot forge).
    trustGate = new TrustGateService({
      get: (_key: string) => TRUST_SECRET,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EconomyBridgeService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(AgentAccount), useValue: agentAccountRepo },
        { provide: getRepositoryToken(AgentCostRecord), useValue: costRecordRepo },
        { provide: EcsWorldService, useValue: ecsWorldService },
        { provide: AxpService, useValue: axpService },
        { provide: TrustGateService, useValue: trustGate },
      ],
    }).compile();

    service = module.get(EconomyBridgeService);
  });

  // ──────────────────────────────────────────────────────────
  // (1) Forged sandbox amount is ignored — authoritative recompute wins.
  // ──────────────────────────────────────────────────────────
  it('ignores the forged sandbox displayHintAmount and charges the authoritative amount', async () => {
    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: validConfirmation() }));

    expect(res.ok).toBe(true);
    expect(res.authoritativeAmount).toBe(AUTHORITATIVE_AXP);
    expect(res.platformCut).toBe(expectedPlatformCut);

    // The payer is charged the SERVER amount, never the forged hint.
    expect(axpService.spend).toHaveBeenCalledTimes(1);
    const spendArg = axpService.spend.mock.calls[0][0];
    expect(spendArg.userId).toBe(USER_ID);
    expect(spendArg.amount).toBe(AUTHORITATIVE_AXP);
    expect(spendArg.amount).not.toBe(FORGED_HINT);
    // The forged hint is recorded only as an ignored, non-authoritative trace.
    expect(spendArg.metadata.ignoredSandboxHint).toBe(FORGED_HINT);
    expect(spendArg.metadata.authoritativeAmount).toBe(AUTHORITATIVE_AXP);

    // Owner is credited the net authoritative amount (gross − platform cut).
    expect(axpService.earn).toHaveBeenCalledTimes(1);
    const earnArg = axpService.earn.mock.calls[0][0];
    expect(earnArg.userId).toBe(OWNER_USER_ID);
    expect(earnArg.amount).toBe(expectedOwnerCredit);
  });

  // ──────────────────────────────────────────────────────────
  // (2) Missing signed confirmation → rejected, balance untouched.
  // ──────────────────────────────────────────────────────────
  it('rejects a charge with a missing signed confirmation without touching any balance', async () => {
    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: undefined }));

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('ECONOMY_REJECTED');
    expect(axpService.spend).not.toHaveBeenCalled();
    expect(axpService.earn).not.toHaveBeenCalled();
    // Rejected before resolving any authoritative world/pricing.
    expect(ecsWorldService.loadWorldAtVersion).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────
  // (3a) Invalid / forged signature → rejected, balance untouched.
  // ──────────────────────────────────────────────────────────
  it('rejects a charge with a tampered signature without altering any balance', async () => {
    const tampered = validConfirmation() + 'deadbeef';

    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: tampered }));

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('ECONOMY_REJECTED');
    expect(axpService.spend).not.toHaveBeenCalled();
    expect(axpService.earn).not.toHaveBeenCalled();
  });

  it('rejects a confirmation signed for a different charge context (replay) without altering balance', async () => {
    // Valid HMAC, but bound to a different amountRef → context mismatch.
    const wrongContext = validConfirmation({ amountRef: 'good_other' });

    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: wrongContext }));

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('ECONOMY_REJECTED');
    expect(axpService.spend).not.toHaveBeenCalled();
    expect(axpService.earn).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────
  // (3b) Trust level below 3 → rejected, balance untouched.
  // ──────────────────────────────────────────────────────────
  it('rejects a charge whose confirmation asserts Trust_Level below 3 without altering balance', async () => {
    const lowTrust = validConfirmation({ trustLevel: TRUST_LEVEL_PURCHASE - 1 });

    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: lowTrust }));

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('ECONOMY_REJECTED');
    expect(axpService.spend).not.toHaveBeenCalled();
    expect(axpService.earn).not.toHaveBeenCalled();
  });

  it('rejects an expired confirmation without altering balance', async () => {
    const expired = validConfirmation({ exp: Date.now() - 1 });

    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: expired }));

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('ECONOMY_REJECTED');
    expect(axpService.spend).not.toHaveBeenCalled();
    expect(axpService.earn).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────
  // (4) Valid Trust-3 signature + sufficient balance → success.
  // ──────────────────────────────────────────────────────────
  it('accepts a valid Trust-3 confirmation and charges exactly the authoritative amount', async () => {
    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: validConfirmation() }));

    expect(res.ok).toBe(true);
    expect(res.authoritativeAmount).toBe(AUTHORITATIVE_AXP);
    expect(axpService.spend).toHaveBeenCalledTimes(1);
    expect(axpService.spend.mock.calls[0][0].amount).toBe(AUTHORITATIVE_AXP);
    // A cost record is written for the committed economic action (R7.7).
    expect(costRecordRepo.save).toHaveBeenCalledTimes(1);
  });

  it('leaves balances unchanged when an insufficient-balance spend throws', async () => {
    axpService.spend.mockRejectedValueOnce(new Error('insufficient AXP balance (have 0, need 100)'));

    const res = await service.requestCharge(USER_ID, chargeReq({ signedConfirmation: validConfirmation() }));

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('ECONOMY_REJECTED');
    // spend was attempted (atomic balance pre-check inside spend), but the
    // owner was never credited → no balance moved.
    expect(axpService.earn).not.toHaveBeenCalled();
  });
});
