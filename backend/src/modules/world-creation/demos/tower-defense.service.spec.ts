/**
 * Unit tests for TowerDefenseService — C 级塔防创作派发 + WASM 意图受控应用
 * (task 22.1, R17.1/R17.2)。
 *
 * Verifies:
 *   - Mobile Tier_C creation is FORCED to dispatch as a Creation_Task to
 *     Desktop/Agent and is NOT generated on Mobile (R17.1),
 *   - Desktop/Agent/web creation generates the Tier_C world locally,
 *   - applyTick translates WASM intents and applies them through the sandbox
 *     under deny-by-default: granted scene.* / ui.* calls succeed, and an
 *     ungranted capability is denied (CAP_DENIED) — the host boundary holds (R17.2).
 */

import { TowerDefenseService } from './tower-defense.service';
import { SandboxService } from '../services/sandbox.service';
import { CreationTaskService } from '../services/creation-task.service';
import { EconomyBridgeService } from '../services/economy-bridge.service';
import {
  IdentityResolverService,
  type AssetImportAuthorization,
} from '../services/identity-resolver.service';
import { WorldApiCapability } from '../../../../shared/types/world-creation';
import {
  generateTowerDefense,
  towerUpgradeEntityId,
  TD_CONTINUE_ENTITY_ID,
} from './tower-defense-generator';
import type {
  EconomyBridgeResponse,
  ReadonlyAssetHandle,
} from '../../../../shared/types/world-creation-api';
import type { TowerDefenseTickOutput } from './tower-defense-generator';

/** Build a service with optional dependency stubs. */
function buildService(deps: {
  creationTasks?: Partial<CreationTaskService>;
  sandbox?: SandboxService;
  economyBridge?: Partial<EconomyBridgeService>;
  identityResolver?: Partial<IdentityResolverService>;
}): TowerDefenseService {
  return new TowerDefenseService(
    (deps.creationTasks ?? {}) as CreationTaskService,
    (deps.sandbox ?? ({} as SandboxService)) as SandboxService,
    (deps.economyBridge ?? {}) as EconomyBridgeService,
    (deps.identityResolver ?? {}) as IdentityResolverService,
  );
}

describe('TowerDefenseService', () => {
  // ── R17.1: Mobile Tier_C creation is dispatched, never run on Mobile ──────
  describe('createTowerDefense — Tier_C dispatch routing (R17.1)', () => {
    function makeService(submitSpy: jest.Mock) {
      return buildService({ creationTasks: { submit: submitSpy } });
    }

    it('forces a Mobile Tier_C creation to dispatch to Desktop (R17.1)', async () => {
      const submit = jest.fn().mockResolvedValue({
        task: { taskId: 'task_1', target: 'desktop', status: 'running' },
        effectiveTarget: 'desktop',
      });
      const svc = makeService(submit);

      const result = await svc.createTowerDefense({
        userId: 'user_1',
        surface: 'mobile',
        options: { plotId: 'plot_td' },
      });

      expect(result.outcome).toBe('dispatched');
      expect(result.dispatch.mustDispatch).toBe(true);
      expect(result.dispatch.target).toBe('desktop');
      // Enqueued a Tier_C Creation_Task carrying the generation options.
      expect(submit).toHaveBeenCalledWith('user_1', {
        plotId: 'plot_td',
        target: 'desktop',
        substrateTier: 'C',
        input: { kind: 'tower_defense', options: { plotId: 'plot_td' } },
      });
    });

    it('honors an agent dispatch preference for Mobile Tier_C', async () => {
      const submit = jest.fn().mockResolvedValue({
        task: { taskId: 'task_2', target: 'agent', status: 'running' },
        effectiveTarget: 'agent',
      });
      const svc = makeService(submit);

      const result = await svc.createTowerDefense({
        userId: 'user_1',
        surface: 'mobile',
        options: { plotId: 'plot_td' },
        dispatchTarget: 'agent',
      });

      expect(result.outcome).toBe('dispatched');
      expect(result.dispatch.target).toBe('agent');
      expect(submit).toHaveBeenCalledWith(
        'user_1',
        expect.objectContaining({ target: 'agent', substrateTier: 'C' }),
      );
    });

    it('generates the Tier_C world locally on Desktop (no dispatch)', async () => {
      const submit = jest.fn();
      const svc = makeService(submit);

      const result = await svc.createTowerDefense({
        userId: 'user_1',
        surface: 'desktop',
        options: { plotId: 'plot_td' },
      });

      expect(result.outcome).toBe('generated');
      expect(result.dispatch.mustDispatch).toBe(false);
      if (result.outcome === 'generated') {
        expect(result.ecsWorld.substrateTier).toBe('C');
        expect(result.ecsWorld.plotId).toBe('plot_td');
      }
      expect(submit).not.toHaveBeenCalled();
    });
  });

  // ── R17.2: WASM intents applied through the host sandbox boundary ─────────
  describe('applyTick — host-controlled intent application (R17.2)', () => {
    const output: TowerDefenseTickOutput = {
      spawns: [{ entityId: 'enemy_1', defId: 'goblin', pos: [0, 0, 0] }],
      transforms: [{ entityId: 'enemy_1', pos: [1, 0, 0] }],
      hits: [{ targetId: 'enemy_1', damage: 20, killed: true }],
      coreHpDelta: -1,
      waveCleared: false,
    };

    it('applies granted scene.*/ui.* intents through the sandbox', async () => {
      const sandbox = new SandboxService();
      const { sessionId } = await sandbox.instantiate('plot_td', 'L1', [
        WorldApiCapability.SceneSpawn,
        WorldApiCapability.SceneTransform,
        WorldApiCapability.SceneSetMaterial,
        WorldApiCapability.Ui,
      ]);
      const svc = buildService({ sandbox });

      const applied = await svc.applyTick(sessionId, output);

      expect(applied.length).toBeGreaterThan(0);
      // Every translated call was authorized and applied under the host boundary.
      expect(applied.every((a) => a.ok)).toBe(true);
    });

    it('denies an ungranted capability (deny-by-default CAP_DENIED)', async () => {
      const sandbox = new SandboxService();
      // Grant everything EXCEPT scene.setMaterial — the killed-hit recolor is denied.
      const { sessionId } = await sandbox.instantiate('plot_td', 'L1', [
        WorldApiCapability.SceneSpawn,
        WorldApiCapability.SceneTransform,
        WorldApiCapability.Ui,
      ]);
      const svc = buildService({ sandbox });

      const applied = await svc.applyTick(sessionId, output);

      const setMaterial = applied.find(
        (a) => a.call.cap === WorldApiCapability.SceneSetMaterial,
      );
      expect(setMaterial?.ok).toBe(false);
      expect(setMaterial?.error?.error).toBe('CAP_DENIED');
      // Granted calls still applied.
      expect(
        applied.some((a) => a.call.cap === WorldApiCapability.SceneSpawn && a.ok),
      ).toBe(true);
    });
  });

  // ── R17.4: AXP upgrade / continue executed server-side by Economy_Bridge ──
  describe('requestUpgradeCharge — server-authoritative economy (R17.4)', () => {
    it('forwards a tower upgrade to Economy_Bridge with the authoritative price ref (sandbox amount ignored)', async () => {
      // Bridge returns a server-RECOMPUTED amount that differs from the sandbox hint.
      const requestCharge = jest.fn(
        async (): Promise<EconomyBridgeResponse> => ({
          ok: true,
          authoritativeAmount: 50,
          platformCut: 3,
        }),
      );
      const svc = buildService({ economyBridge: { requestCharge } });

      const res = await svc.requestUpgradeCharge({
        userId: 'user_1',
        plotId: 'plot_td',
        visitorAccountId: 'acct_1',
        kind: 'upgrade',
        towerId: 'arrow',
        signedConfirmation: 'sig',
        displayHintAmount: 99999, // forged sandbox value
      });

      expect(res.ok).toBe(true);
      // Authoritative amount comes from the server, NOT the forged sandbox hint.
      expect(res.authoritativeAmount).toBe(50);
      expect(requestCharge).toHaveBeenCalledTimes(1);
      const [calledUserId, chargeReq] = requestCharge.mock.calls[0];
      expect(calledUserId).toBe('user_1');
      // amountRef references the priceable upgrade entity; no authoritative amount is sent.
      expect(chargeReq).toMatchObject({
        plotId: 'plot_td',
        visitorAccountId: 'acct_1',
        amountRef: towerUpgradeEntityId('arrow'),
        signedConfirmation: 'sig',
        displayHintAmount: 99999,
      });
      // The service never puts an authoritative amount on the request.
      expect((chargeReq as Record<string, unknown>).amount).toBeUndefined();
    });

    it('routes a continue purchase to the continue price entity', async () => {
      const requestCharge = jest.fn(
        async (): Promise<EconomyBridgeResponse> => ({ ok: true, authoritativeAmount: 100 }),
      );
      const svc = buildService({ economyBridge: { requestCharge } });

      await svc.requestUpgradeCharge({
        userId: 'user_1',
        plotId: 'plot_td',
        visitorAccountId: 'acct_1',
        kind: 'continue',
      });

      expect(requestCharge.mock.calls[0][1]).toMatchObject({
        amountRef: TD_CONTINUE_ENTITY_ID,
      });
    });

    it('rejects an upgrade with no towerId without touching the Economy_Bridge', async () => {
      const requestCharge = jest.fn();
      const svc = buildService({ economyBridge: { requestCharge } });

      const res = await svc.requestUpgradeCharge({
        userId: 'user_1',
        plotId: 'plot_td',
        visitorAccountId: 'acct_1',
        kind: 'upgrade',
      });

      expect(res.ok).toBe(false);
      expect(res.error?.error).toBe('ECONOMY_REJECTED');
      expect(requestCharge).not.toHaveBeenCalled();
    });
  });

  // ── R17.5: World_Asset heroes via Cross_Experience_Identity ───────────────
  describe('World_Asset heroes via Cross_Experience_Identity (R17.5)', () => {
    const ownedHandle: ReadonlyAssetHandle = {
      assetId: 'wa_1',
      kind: 'worldAsset',
      name: 'Hero Golem',
    };

    it('exposes only read-only worldAsset handles (no ownership proof)', async () => {
      const resolveReadonlyHandles = jest.fn(async (): Promise<ReadonlyAssetHandle[]> => [
        ownedHandle,
        { assetId: 'pet_1', kind: 'pet', name: 'Soul Pet' },
      ]);
      const svc = buildService({ identityResolver: { resolveReadonlyHandles } });

      const heroes = await svc.listAvailableHeroes('user_1', 'plot_td');

      expect(heroes).toEqual([ownedHandle]); // pet filtered out
      // Handle carries no ownership credential fields.
      expect(Object.keys(heroes[0])).toEqual(
        expect.not.arrayContaining(['ownerId', 'originalCreatorId', 'version']),
      );
    });

    it('authorizes a hero bind for an owned asset', async () => {
      const authorizeAssetImport = jest.fn(
        async (): Promise<AssetImportAuthorization> => ({
          authorized: true,
          handle: ownedHandle,
        }),
      );
      const svc = buildService({ identityResolver: { authorizeAssetImport } });

      const res = await svc.bindHeroAsset('user_1', 'wa_1');
      expect(res.authorized).toBe(true);
      expect(res.handle).toEqual(ownedHandle);
    });

    it('denies a hero bind for an unowned asset (ASSET_NOT_OWNED)', async () => {
      const authorizeAssetImport = jest.fn(
        async (): Promise<AssetImportAuthorization> => ({
          authorized: false,
          error: { error: 'ASSET_NOT_OWNED', detail: 'not owned' },
        }),
      );
      const svc = buildService({ identityResolver: { authorizeAssetImport } });

      const res = await svc.bindHeroAsset('user_1', 'wa_999');
      expect(res.authorized).toBe(false);
      expect(res.error?.error).toBe('ASSET_NOT_OWNED');
    });
  });

  // ── R17.6: Pre-publish static scan + bytecode hash lock ───────────────────
  describe('prepareForPublish — C-tier static scan + hash lock (R17.6)', () => {
    /** A benign WASM-source stand-in that uses only declared, whitelisted behavior. */
    const benignSource = `
      function tick(input) {
        const transforms = [];
        for (let i = 0; i < input.enemies.length; i++) {
          transforms.push({ entityId: input.enemies[i].id, pos: [0, 0, 0] });
        }
        return { spawns: [], transforms, hits: [], coreHpDelta: 0, waveCleared: false };
      }
    `;

    it('locks the bytecode hash and marks reviewStatus=passed on a clean scan', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });
      const moduleId = world.logicModules![0].moduleId;
      // Before publish prep the module is pending with a placeholder hash.
      expect(world.logicModules![0].reviewStatus).toBe('pending');
      expect(world.logicModules![0].hash).toBe('sha256:pending');

      const svc = buildService({});
      const prep = svc.prepareForPublish(world, {
        logicModuleSources: { [moduleId]: benignSource },
      });

      expect(prep.passed).toBe(true);
      if (prep.passed) {
        const locked = prep.world.logicModules![0];
        expect(locked.reviewStatus).toBe('passed');
        expect(locked.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(locked.hash).not.toBe('sha256:pending');
        // Input world is not mutated (pure).
        expect(world.logicModules![0].reviewStatus).toBe('pending');
      }
    });

    it('blocks publish and reports the stage/reason when the scan finds a violation', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });
      const moduleId = world.logicModules![0].moduleId;
      const maliciousSource = `function tick(i){ return eval("doEvil()"); }`;

      const svc = buildService({});
      const prep = svc.prepareForPublish(world, {
        logicModuleSources: { [moduleId]: maliciousSource },
      });

      expect(prep.passed).toBe(false);
      if (!prep.passed) {
        expect(prep.error.error).toBe('MODERATION_REJECTED');
        expect(prep.error.detail).toContain('static_code_scan');
        expect(prep.error.detail).toContain('dynamic_eval');
      }
    });

    it('blocks publish when a logic module has no reviewable source', () => {
      const world = generateTowerDefense({ plotId: 'plot_td' });
      const svc = buildService({});

      const prep = svc.prepareForPublish(world, { logicModuleSources: {} });

      expect(prep.passed).toBe(false);
      if (!prep.passed) {
        expect(prep.error.error).toBe('MODERATION_REJECTED');
        expect(prep.error.detail).toContain('no reviewable source');
      }
    });
  });

  // ── R17.7: Runtime Resource_Watchdog enforcement ──────────────────────────
  describe('recordResourceSample — runtime Resource_Watchdog (R17.7)', () => {
    it('terminates the instance and returns the user to the map on an over-budget sample', async () => {
      const sandbox = new SandboxService();
      const { sessionId } = await sandbox.instantiate('plot_td', 'L1', [
        WorldApiCapability.ComputeRun,
      ]);
      const svc = buildService({ sandbox });

      // A memory bomb far over the full-tier budget (256MB).
      const event = await svc.recordResourceSample(sessionId, {
        memoryBytes: 1024 * 1024 * 1024,
      });

      expect(event).not.toBeNull();
      expect(event?.reason).toBe('MEMORY_EXCEEDED');
      expect(event?.returnToMap).toBe(true);
      expect(event?.error.error).toBe('RESOURCE_EXCEEDED');
    });

    it('keeps the instance alive when the sample is within budget', async () => {
      const sandbox = new SandboxService();
      const { sessionId } = await sandbox.instantiate('plot_td', 'L1', [
        WorldApiCapability.ComputeRun,
      ]);
      const svc = buildService({ sandbox });

      const event = await svc.recordResourceSample(sessionId, {
        memoryBytes: 10 * 1024 * 1024,
        frameMs: 5,
      });

      expect(event).toBeNull();
    });
  });

  // ── R17.8: Mobile device-profile playability (degrade / desktop) ──────────
  describe('resolvePlayability — Mobile Tier_C device adaptation (R17.8)', () => {
    const svc = buildService({});

    it('lets a high-tier Mobile device instantiate the game at full quality', () => {
      const plan = svc.resolvePlayability({
        isMobile: true,
        deviceTier: 'high',
        supports3D: true,
        degradedMode: false,
      });
      expect(plan.canInstantiate).toBe(true);
      expect(plan.mode).toBe('full');
    });

    it('offers a degraded or Desktop alternative on a low-tier Mobile device', () => {
      const plan = svc.resolvePlayability({
        isMobile: true,
        deviceTier: 'low',
        supports3D: false,
        degradedMode: true,
      });
      expect(plan.canInstantiate).toBe(false);
      expect(plan.mode).toBe('desktop');
      expect(plan.offerDesktopAlternative).toBe(true);
      expect(plan.offerDegradedAlternative).toBe(true);
      expect(plan.reason).toBeDefined();
    });

    it('always instantiates on Desktop/web', () => {
      const plan = svc.resolvePlayability({
        isMobile: false,
        deviceTier: 'mid',
        supports3D: false,
        degradedMode: true,
      });
      expect(plan.canInstantiate).toBe(true);
      expect(plan.mode).toBe('full');
    });
  });
});
