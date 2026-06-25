/**
 * Tower-defense END-TO-END integration tests (task 22.3, R17.2 / R17.4 / R17.8).
 *
 * Where the *unit* specs (`tower-defense.service.spec.ts`,
 * `tower-defense-generator.spec.ts`, `tower-defense-playability.spec.ts`) drive
 * each collaborator behind stubs, these tests wire the **real** pieces together
 * and assert the cross-component invariants of the Tier_C tower-defense demo:
 *
 *  1. WASM tick intents → controlled application (R17.2): a real
 *     {@link generateTowerDefense} world drives a real WASM-style
 *     {@link TowerDefenseTickOutput}; the host runs it through the real
 *     {@link translateTickIntents} + the real {@link SandboxService} so that
 *     EVERY side effect flows through a whitelisted `scene.*` / `ui.*` capability
 *     under deny-by-default. The untrusted module never touches the scene; a
 *     capability outside the granted subset is denied (CAP_DENIED).
 *
 *  2. Upgrade economy executed server-side (R17.4 / Property 2): a forged
 *     in-sandbox amount is routed through {@link TowerDefenseService.requestUpgradeCharge}
 *     into a REAL {@link EconomyBridgeService} (real {@link TrustGateService}),
 *     which recomputes the authoritative AXP price from the generated world's
 *     declarative `price` component — the forged amount is ignored, and a missing
 *     Trust-3 signature is rejected before any wallet is touched.
 *
 *  3. Device-downgrade path (R17.8): the device-profile matrix end-to-end via
 *     {@link TowerDefenseService.resolvePlayability} — a low/mid Mobile device
 *     cannot instantiate and is offered degraded + Desktop alternatives, while a
 *     capable Mobile device and any Desktop/web shell instantiate at full quality.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §11.2 Tower Defense
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TowerDefenseService } from './tower-defense.service';
import { SandboxService } from '../services/sandbox.service';
import { CreationTaskService } from '../services/creation-task.service';
import { EconomyBridgeService } from '../services/economy-bridge.service';
import { IdentityResolverService } from '../services/identity-resolver.service';
import { EcsWorldService } from '../services/ecs-world.service';
import { TrustGateService } from '../economy/trust-gate.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import { AxpService } from '../../axp/axp.service';

import {
  generateTowerDefense,
  translateTickIntents,
  towerUpgradeEntityId,
  TD_CONTINUE_ENTITY_ID,
  type TowerDefenseTickOutput,
} from './tower-defense-generator';
import { WorldApiCapability } from '../../../../shared/types/world-creation';
import { TRUST_LEVEL_PURCHASE } from '../../../../shared/types/world-creation';

describe('Tower-defense integration (task 22.3)', () => {
  // ════════════════════════════════════════════════════════════════════════
  // (1) R17.2 — WASM tick intents applied through the REAL host sandbox boundary
  // ════════════════════════════════════════════════════════════════════════
  describe('WASM tick → host-controlled application (R17.2)', () => {
    /**
     * A representative full WASM tick output: enemy spawn + advance, a killed
     * hit (recolor + float text), core-HP HUD, and a wave-cleared toast. This is
     * the *only* channel through which the untrusted module affects the world.
     */
    const tickOutput: TowerDefenseTickOutput = {
      spawns: [{ entityId: 'enemy_7', defId: 'goblin', pos: [0, 0, 0] }],
      transforms: [{ entityId: 'enemy_7', pos: [1, 0, 0] }],
      hits: [{ targetId: 'enemy_7', damage: 20, killed: true }],
      coreHpDelta: -2,
      waveCleared: true,
      ui: [{ toast: 'Boss 来袭' }, { hud: { score: 1500 } }],
    };

    /** The complete whitelisted capability subset the host may emit (R17.2). */
    const SCENE_UI_CAPS: WorldApiCapability[] = [
      WorldApiCapability.SceneSpawn,
      WorldApiCapability.SceneTransform,
      WorldApiCapability.SceneSetMaterial,
      WorldApiCapability.Ui,
    ];

    it('flows every WASM side effect through a whitelisted scene.*/ui.* sandbox dispatch (no direct scene access)', async () => {
      // Real generator world → real WASM-style tick → real translation → real sandbox.
      const world = generateTowerDefense({ plotId: 'plot_td' });
      const controller = world.entities.find(
        (e) => e.components.logicModuleRef !== undefined,
      );
      expect(controller?.components.logicModuleRef?.entry).toBe('tick');

      const sandbox = new SandboxService();
      // Grant exactly the WASM module's scene/ui subset (deny-by-default for the rest).
      const { sessionId } = await sandbox.instantiate('plot_td', 'L1', SCENE_UI_CAPS);
      const svc = new TowerDefenseService(
        {} as CreationTaskService,
        sandbox,
        {} as EconomyBridgeService,
        {} as IdentityResolverService,
      );

      // Independently translate to know exactly which calls SHOULD be applied.
      const expectedCalls = translateTickIntents(tickOutput);
      expect(expectedCalls.length).toBeGreaterThan(0);

      const applied = await svc.applyTick(sessionId, tickOutput);

      // Every translated intent reached the sandbox and was authorized + applied.
      expect(applied).toHaveLength(expectedCalls.length);
      expect(applied.every((a) => a.ok)).toBe(true);
      // ...and ONLY ever as whitelisted scene.* / ui.* capabilities — the
      // untrusted module can never reach economy / compute / net directly.
      const allowed = new Set(SCENE_UI_CAPS);
      for (const a of applied) {
        expect(allowed.has(a.call.cap as WorldApiCapability)).toBe(true);
      }
      const caps = applied.map((a) => a.call.cap);
      expect(caps).toContain(WorldApiCapability.SceneSpawn);
      expect(caps).toContain(WorldApiCapability.SceneTransform);
      expect(caps).toContain(WorldApiCapability.SceneSetMaterial);
      expect(caps).toContain(WorldApiCapability.Ui);
      expect(caps).not.toContain(WorldApiCapability.EconomyRequestCharge);
      expect(caps).not.toContain(WorldApiCapability.ComputeRun);
      expect(caps).not.toContain(WorldApiCapability.NetFetch);
      // The wave-cleared toast surfaced through the UI capability.
      expect(
        applied.some(
          (a) =>
            a.call.cap === WorldApiCapability.Ui &&
            (a.call.args as Record<string, unknown>).toast === '波次清除',
        ),
      ).toBe(true);
    });

    it('denies an intent whose capability is outside the granted subset (deny-by-default CAP_DENIED)', async () => {
      const sandbox = new SandboxService();
      // Grant everything EXCEPT scene.setMaterial — the killed-hit recolor is denied.
      const { sessionId } = await sandbox.instantiate('plot_td', 'L1', [
        WorldApiCapability.SceneSpawn,
        WorldApiCapability.SceneTransform,
        WorldApiCapability.Ui,
      ]);
      const svc = new TowerDefenseService(
        {} as CreationTaskService,
        sandbox,
        {} as EconomyBridgeService,
        {} as IdentityResolverService,
      );

      const applied = await svc.applyTick(sessionId, tickOutput);

      const recolor = applied.find(
        (a) => a.call.cap === WorldApiCapability.SceneSetMaterial,
      );
      expect(recolor?.ok).toBe(false);
      expect(recolor?.error?.error).toBe('CAP_DENIED');
      // Granted scene/ui calls still applied — the boundary denies only the ungranted one.
      expect(
        applied.some((a) => a.call.cap === WorldApiCapability.SceneSpawn && a.ok),
      ).toBe(true);
      expect(
        applied.some((a) => a.call.cap === WorldApiCapability.Ui && a.ok),
      ).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // (2) R17.4 — AXP upgrade charge executed server-side by a REAL Economy_Bridge
  // ════════════════════════════════════════════════════════════════════════
  describe('upgrade economy → server-authoritative Economy_Bridge (R17.4, Property 2)', () => {
    const USER_ID = 'player-1';
    const PLOT_ID = 'plot_td';
    const ECS_VERSION_ID = 'ecs-td-v1';
    const OWNER_ACCOUNT_ID = 'acc-owner-td';
    const OWNER_USER_ID = 'owner-user-td';
    const VISITOR_ACCOUNT_ID = 'acct-player-1';
    const TRUST_SECRET = 'test-trust-secret-22.3';

    /** Authoritative declarative upgrade price baked into the generated world. */
    const ARROW_UPGRADE_AXP = 75;
    /** A wildly forged in-sandbox amount the server MUST ignore (Property 2). */
    const FORGED_HINT = 999_999;

    let towerDefense: TowerDefenseService;
    let economyBridge: EconomyBridgeService;
    let trustGate: TrustGateService;
    let axpService: { spend: jest.Mock; earn: jest.Mock };
    let costRecordRepo: { create: jest.Mock; save: jest.Mock };

    /** The REAL generated Tier_C world is the single authoritative price source. */
    const world = generateTowerDefense({
      plotId: PLOT_ID,
      towers: [{ id: 'arrow', cost: 50, range: 3, dps: 20, upgradeCost: ARROW_UPGRADE_AXP }],
      continueCost: 120,
    });

    const plot = {
      id: PLOT_ID,
      ownerAccountId: OWNER_ACCOUNT_ID,
      substrateTier: 'C',
      ecsVersionId: ECS_VERSION_ID,
      status: 'published',
      title: 'Tower Defense',
    } as WorldPlot;

    function signUpgradeConfirmation(amountRef: string): string {
      return trustGate.signConfirmation({
        userId: USER_ID,
        plotId: PLOT_ID,
        amountRef,
        trustLevel: TRUST_LEVEL_PURCHASE,
        exp: Date.now() + 60_000,
      });
    }

    beforeEach(async () => {
      axpService = {
        spend: jest.fn().mockResolvedValue({ ledger_id: 'led-1', balance: 0 }),
        earn: jest.fn().mockResolvedValue({ ledger_id: 'led-2', balance: 0 }),
      };
      costRecordRepo = {
        create: jest.fn((v) => v),
        save: jest.fn().mockResolvedValue(undefined),
      };
      trustGate = new TrustGateService({ get: () => TRUST_SECRET } as any);

      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          EconomyBridgeService,
          {
            provide: getRepositoryToken(WorldPlot),
            useValue: { findOne: jest.fn().mockResolvedValue(plot) },
          },
          {
            provide: getRepositoryToken(AgentAccount),
            useValue: {
              findOne: jest
                .fn()
                .mockResolvedValue({ id: OWNER_ACCOUNT_ID, ownerId: OWNER_USER_ID }),
            },
          },
          { provide: getRepositoryToken(AgentCostRecord), useValue: costRecordRepo },
          {
            provide: EcsWorldService,
            useValue: { loadWorldAtVersion: jest.fn().mockResolvedValue(world) },
          },
          { provide: AxpService, useValue: axpService },
          { provide: TrustGateService, useValue: trustGate },
        ],
      }).compile();

      economyBridge = moduleRef.get(EconomyBridgeService);
      // Real orchestration service wired to the REAL Economy_Bridge.
      towerDefense = new TowerDefenseService(
        {} as CreationTaskService,
        {} as SandboxService,
        economyBridge,
        {} as IdentityResolverService,
      );
    });

    it('charges the authoritative price from the generated world and ignores the forged sandbox amount', async () => {
      const res = await towerDefense.requestUpgradeCharge({
        userId: USER_ID,
        plotId: PLOT_ID,
        visitorAccountId: VISITOR_ACCOUNT_ID,
        kind: 'upgrade',
        towerId: 'arrow',
        signedConfirmation: signUpgradeConfirmation(towerUpgradeEntityId('arrow')),
        displayHintAmount: FORGED_HINT,
      });

      expect(res.ok).toBe(true);
      // The amount comes from the world's declarative price.axp, NOT the forged hint.
      expect(res.authoritativeAmount).toBe(ARROW_UPGRADE_AXP);
      expect(axpService.spend).toHaveBeenCalledTimes(1);
      const spendArg = axpService.spend.mock.calls[0][0];
      expect(spendArg.userId).toBe(USER_ID);
      expect(spendArg.amount).toBe(ARROW_UPGRADE_AXP);
      expect(spendArg.amount).not.toBe(FORGED_HINT);
      // Forged hint is recorded only as an ignored, non-authoritative trace.
      expect(spendArg.metadata.ignoredSandboxHint).toBe(FORGED_HINT);
      expect(spendArg.metadata.authoritativeAmount).toBe(ARROW_UPGRADE_AXP);
      // Owner credited the net authoritative amount; cost record written (R7.7).
      expect(axpService.earn).toHaveBeenCalledTimes(1);
      expect(axpService.earn.mock.calls[0][0].userId).toBe(OWNER_USER_ID);
      expect(costRecordRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects an upgrade charge missing the Trust-3 signed confirmation before any wallet touch', async () => {
      const res = await towerDefense.requestUpgradeCharge({
        userId: USER_ID,
        plotId: PLOT_ID,
        visitorAccountId: VISITOR_ACCOUNT_ID,
        kind: 'upgrade',
        towerId: 'arrow',
        displayHintAmount: FORGED_HINT,
        // signedConfirmation intentionally omitted
      });

      expect(res.ok).toBe(false);
      expect(res.error?.error).toBe('ECONOMY_REJECTED');
      // No balance was touched — gating happens before any spend/earn.
      expect(axpService.spend).not.toHaveBeenCalled();
      expect(axpService.earn).not.toHaveBeenCalled();
    });

    it('routes a continue purchase to the authoritative continue price entity', async () => {
      const res = await towerDefense.requestUpgradeCharge({
        userId: USER_ID,
        plotId: PLOT_ID,
        visitorAccountId: VISITOR_ACCOUNT_ID,
        kind: 'continue',
        signedConfirmation: signUpgradeConfirmation(TD_CONTINUE_ENTITY_ID),
        displayHintAmount: FORGED_HINT,
      });

      expect(res.ok).toBe(true);
      // continueCost: 120 in the generated world — server-authoritative.
      expect(res.authoritativeAmount).toBe(120);
      expect(axpService.spend.mock.calls[0][0].amount).toBe(120);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // (3) R17.8 — Mobile device-profile playability matrix end-to-end
  // ════════════════════════════════════════════════════════════════════════
  describe('device-downgrade path → resolvePlayability matrix (R17.8)', () => {
    const svc = new TowerDefenseService(
      {} as CreationTaskService,
      {} as SandboxService,
      {} as EconomyBridgeService,
      {} as IdentityResolverService,
    );

    it('instantiates at full quality on a capable (high + 3D, not degraded) Mobile device', () => {
      const plan = svc.resolvePlayability({
        isMobile: true,
        deviceTier: 'high',
        supports3D: true,
        degradedMode: false,
      });
      expect(plan.canInstantiate).toBe(true);
      expect(plan.mode).toBe('full');
      expect(plan.offerDesktopAlternative).toBe(false);
      expect(plan.offerDegradedAlternative).toBe(false);
    });

    it.each([
      ['low tier', { isMobile: true, deviceTier: 'low' as const, supports3D: false, degradedMode: true }],
      ['mid tier', { isMobile: true, deviceTier: 'mid' as const, supports3D: true, degradedMode: false }],
      ['degraded flagged', { isMobile: true, deviceTier: 'high' as const, supports3D: true, degradedMode: true }],
      ['no 3D', { isMobile: true, deviceTier: 'high' as const, supports3D: false, degradedMode: false }],
    ])('cannot instantiate on an incapable Mobile device (%s) and offers degraded + Desktop alternatives', (_label, profile) => {
      const plan = svc.resolvePlayability(profile);
      expect(plan.canInstantiate).toBe(false);
      expect(plan.mode).toBe('desktop');
      expect(plan.offerDesktopAlternative).toBe(true);
      expect(plan.offerDegradedAlternative).toBe(true);
      expect(plan.reason).toBeDefined();
    });

    it('always instantiates at full quality on Desktop/web regardless of tier', () => {
      const plan = svc.resolvePlayability({
        isMobile: false,
        deviceTier: 'low',
        supports3D: false,
        degradedMode: true,
      });
      expect(plan.canInstantiate).toBe(true);
      expect(plan.mode).toBe('full');
      expect(plan.offerDesktopAlternative).toBe(false);
    });
  });
});
