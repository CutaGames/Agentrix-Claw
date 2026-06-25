import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CreationContinuumService } from './creation-continuum.service';
import { EcsWorldService } from './ecs-world.service';
import { AgentBuilderService } from './agent-builder.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { ECS_VERSION } from '../../../../shared/types/world-creation';
import type { EcsWorld } from '../../../../shared/types/world-creation';

/**
 * Unit tests for CreationContinuumService — creation continuum (Task 14.4,
 * R3.4 / R3.5 / R3.6 / R3.7).
 *
 * The service is a thin orchestrator over the SAME ECS_World diff/version
 * channel: prompt-drive delegates to AgentBuilderService.generateDraft, co-edit
 * (NL) / co-edit (ops) / hand-build delegate to EcsWorldService.applyNlEdit /
 * applyDirectEdit, and revert delegates to EcsWorldService.revert. Switching
 * modes is lossless because every mode reads the Plot's latest committed version
 * and the current-version pointer is advanced after each commit. These tests
 * verify, with the underlying services mocked:
 *
 *  1. all three modes delegate to the shared diff channel and advance the pointer;
 *  2. Mobile + Tier_C returns outcome='dispatched' WITHOUT any local edit;
 *  3. revert delegates to EcsWorldService.revert and advances the pointer;
 *  4. an out-of-tier rejection from the underlying edit (TIER_VIOLATION) is
 *     passed through and the pointer is NOT advanced.
 */
describe('CreationContinuumService — creation continuum (R3.4/R3.5/R3.6/R3.7)', () => {
  let service: CreationContinuumService;

  let plotRepo: { findOne: jest.Mock; update: jest.Mock };
  let ecsWorldService: {
    getCurrentVersion: jest.Mock;
    applyNlEdit: jest.Mock;
    applyDirectEdit: jest.Mock;
    revert: jest.Mock;
  };
  let agentBuilderService: { generateDraft: jest.Mock };

  const USER_ID = 'user-1';
  const PLOT_ID = 'plot-1';

  const world = (tier: EcsWorld['substrateTier'] = 'B'): EcsWorld => ({
    ecsVersion: ECS_VERSION,
    plotId: PLOT_ID,
    substrateTier: tier,
    entities: [{ id: 'e1', components: { transform: { pos: [0, 0, 0] } } }],
  });

  const plot = (overrides: Partial<WorldPlot> = {}) => ({
    id: PLOT_ID,
    substrateTier: 'B',
    ecsVersionId: 'v1',
    ...overrides,
  });

  beforeEach(async () => {
    plotRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    ecsWorldService = {
      getCurrentVersion: jest.fn().mockResolvedValue({ id: 'v1' }),
      applyNlEdit: jest.fn(),
      applyDirectEdit: jest.fn(),
      revert: jest.fn(),
    };
    agentBuilderService = { generateDraft: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreationContinuumService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: EcsWorldService, useValue: ecsWorldService },
        { provide: AgentBuilderService, useValue: agentBuilderService },
      ],
    }).compile();

    service = module.get(CreationContinuumService);
  });

  // ============================================================
  // (1) Three modes delegate to the same diff channel + advance pointer (R3.4)
  // ============================================================

  describe('mode switching is lossless on the shared ECS_World (R3.4)', () => {
    it('promptDrive delegates to AgentBuilderService.generateDraft on the latest version', async () => {
      // Pointer lags behind the latest committed version → syncPointerToLatest
      // advances it so the generation builds on the most recent work.
      plotRepo.findOne.mockResolvedValue(plot({ ecsVersionId: 'v0' }));
      ecsWorldService.getCurrentVersion.mockResolvedValue({ id: 'v1' });
      agentBuilderService.generateDraft.mockResolvedValue({
        versionId: 'v2',
        ecsWorld: world(),
      });

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'promptDrive',
        surface: 'desktop',
        prompt: 'a marble palace',
      });

      expect(agentBuilderService.generateDraft).toHaveBeenCalledWith(USER_ID, PLOT_ID, {
        prompt: 'a marble palace',
      });
      // Pointer synced to the latest committed version before generating (no loss).
      expect(plotRepo.update).toHaveBeenCalledWith({ id: PLOT_ID }, { ecsVersionId: 'v1' });
      expect(res.outcome).toBe('applied');
      expect(res.mode).toBe('promptDrive');
      expect(res.versionId).toBe('v2');
      // Did not touch the diff-edit channel.
      expect(ecsWorldService.applyNlEdit).not.toHaveBeenCalled();
      expect(ecsWorldService.applyDirectEdit).not.toHaveBeenCalled();
    });

    it('coEdit (instruction) delegates to applyNlEdit and advances the pointer', async () => {
      plotRepo.findOne.mockResolvedValue(plot());
      ecsWorldService.applyNlEdit.mockResolvedValue({
        diff: { versionId: 'v2', parent: 'v1', plotId: PLOT_ID, ops: [], ts: 1 },
        ecsWorld: world(),
      });

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'coEdit',
        surface: 'desktop',
        instruction: 'make the walls red',
        baseVersionId: 'v1',
      });

      expect(ecsWorldService.applyNlEdit).toHaveBeenCalledWith(PLOT_ID, {
        instruction: 'make the walls red',
        baseVersionId: 'v1',
      });
      expect(ecsWorldService.applyDirectEdit).not.toHaveBeenCalled();
      // Pointer advanced to the newly committed version.
      expect(plotRepo.update).toHaveBeenCalledWith({ id: PLOT_ID }, { ecsVersionId: 'v2' });
      expect(res.outcome).toBe('applied');
      expect(res.mode).toBe('coEdit');
      expect(res.versionId).toBe('v2');
    });

    it('coEdit (ops) delegates to applyDirectEdit and advances the pointer', async () => {
      plotRepo.findOne.mockResolvedValue(plot());
      ecsWorldService.applyDirectEdit.mockResolvedValue({
        diff: { versionId: 'v2', parent: 'v1', plotId: PLOT_ID, ops: [], ts: 1 },
        ecsWorld: world(),
      });

      const ops = [{ op: 'replace', path: '/entities/0/components/transform/pos', value: [1, 0, 0] }];
      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'coEdit',
        surface: 'desktop',
        ops,
        baseVersionId: 'v1',
      });

      expect(ecsWorldService.applyDirectEdit).toHaveBeenCalledWith(PLOT_ID, {
        ops,
        baseVersionId: 'v1',
      });
      expect(ecsWorldService.applyNlEdit).not.toHaveBeenCalled();
      expect(plotRepo.update).toHaveBeenCalledWith({ id: PLOT_ID }, { ecsVersionId: 'v2' });
      expect(res.versionId).toBe('v2');
    });

    it('handBuild delegates to applyDirectEdit and advances the pointer', async () => {
      plotRepo.findOne.mockResolvedValue(plot());
      ecsWorldService.applyDirectEdit.mockResolvedValue({
        diff: { versionId: 'v3', parent: 'v1', plotId: PLOT_ID, ops: [], ts: 1 },
        ecsWorld: world(),
      });

      const ops = [{ op: 'add', path: '/entities/-', value: { id: 'e2', components: {} } }];
      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'handBuild',
        surface: 'desktop',
        ops,
        baseVersionId: 'v1',
      });

      expect(ecsWorldService.applyDirectEdit).toHaveBeenCalledWith(PLOT_ID, {
        ops,
        baseVersionId: 'v1',
      });
      expect(plotRepo.update).toHaveBeenCalledWith({ id: PLOT_ID }, { ecsVersionId: 'v3' });
      expect(res.mode).toBe('handBuild');
      expect(res.versionId).toBe('v3');
    });

    it('falls back to the latest committed version as the base when none is supplied (continuity)', async () => {
      plotRepo.findOne.mockResolvedValue(plot());
      ecsWorldService.getCurrentVersion.mockResolvedValue({ id: 'v5' });
      ecsWorldService.applyDirectEdit.mockResolvedValue({
        diff: { versionId: 'v6', parent: 'v5', plotId: PLOT_ID, ops: [], ts: 1 },
        ecsWorld: world(),
      });

      await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'handBuild',
        surface: 'desktop',
        ops: [],
      });

      // The edit builds on the Plot's latest committed version (no data loss).
      expect(ecsWorldService.applyDirectEdit).toHaveBeenCalledWith(PLOT_ID, {
        ops: [],
        baseVersionId: 'v5',
      });
    });
  });

  // ============================================================
  // (2) Mobile + Tier_C → dispatched, no local edit (R3.7)
  // ============================================================

  describe('Mobile Tier_C creation is dispatched off-device (R3.7)', () => {
    it('returns outcome="dispatched" to desktop and runs no local edit', async () => {
      plotRepo.findOne.mockResolvedValue(plot({ substrateTier: 'C' }));

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'promptDrive',
        surface: 'mobile',
        prompt: 'a tower defense level',
      });

      expect(res.outcome).toBe('dispatched');
      expect(res.mode).toBe('promptDrive');
      expect(res.dispatch?.mustDispatch).toBe(true);
      expect(res.dispatch?.target).toBe('desktop');
      // None of the local edit channels were invoked.
      expect(agentBuilderService.generateDraft).not.toHaveBeenCalled();
      expect(ecsWorldService.applyNlEdit).not.toHaveBeenCalled();
      expect(ecsWorldService.applyDirectEdit).not.toHaveBeenCalled();
      // The Plot pointer was not advanced (nothing committed locally).
      expect(plotRepo.update).not.toHaveBeenCalled();
    });

    it('honors a preferred agent dispatch target', async () => {
      plotRepo.findOne.mockResolvedValue(plot({ substrateTier: 'C' }));

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'handBuild',
        surface: 'mobile',
        ops: [],
        dispatchTarget: 'agent',
      });

      expect(res.outcome).toBe('dispatched');
      expect(res.dispatch?.target).toBe('agent');
      expect(ecsWorldService.applyDirectEdit).not.toHaveBeenCalled();
    });

    it('runs locally for Mobile Tier_A/B (not dispatched)', async () => {
      plotRepo.findOne.mockResolvedValue(plot({ substrateTier: 'A' }));
      ecsWorldService.applyDirectEdit.mockResolvedValue({
        diff: { versionId: 'v2', parent: 'v1', plotId: PLOT_ID, ops: [], ts: 1 },
        ecsWorld: world('A'),
      });

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'handBuild',
        surface: 'mobile',
        ops: [],
        baseVersionId: 'v1',
      });

      expect(res.outcome).toBe('applied');
      expect(ecsWorldService.applyDirectEdit).toHaveBeenCalled();
    });
  });

  // ============================================================
  // (3) revert delegates to EcsWorldService.revert + advances pointer (R3.5)
  // ============================================================

  describe('revert restores a prior ECS_World state (R3.5)', () => {
    it('delegates to EcsWorldService.revert and advances the current-version pointer', async () => {
      ecsWorldService.revert.mockResolvedValue({ versionId: 'v9', ecsWorld: world() });

      const res = await service.revert(PLOT_ID, { targetVersionId: 'v3' });

      expect(ecsWorldService.revert).toHaveBeenCalledWith(PLOT_ID, { targetVersionId: 'v3' });
      // Pointer moved to the replayed revert version so later edits continue from it.
      expect(plotRepo.update).toHaveBeenCalledWith({ id: PLOT_ID }, { ecsVersionId: 'v9' });
      expect(res.versionId).toBe('v9');
    });
  });

  // ============================================================
  // (4) Out-of-tier rejection passed through, pointer not advanced (R3.6)
  // ============================================================

  describe('out-of-tier rejection from the underlying edit is passed through (R3.6)', () => {
    it('passes through TIER_VIOLATION from applyDirectEdit without advancing the pointer', async () => {
      plotRepo.findOne.mockResolvedValue(plot());
      ecsWorldService.applyDirectEdit.mockResolvedValue({
        diff: { versionId: '', parent: 'v1', plotId: PLOT_ID, ops: [], ts: 1 },
        ecsWorld: world(),
        error: { error: 'TIER_VIOLATION', detail: 'Tier_B may not declare logicModules' },
      });

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'handBuild',
        surface: 'desktop',
        ops: [{ op: 'add', path: '/logicModules/-', value: { moduleId: 'm' } }],
        baseVersionId: 'v1',
      });

      expect(res.outcome).toBe('applied');
      expect(res.error?.error).toBe('TIER_VIOLATION');
      expect(res.versionId).toBeUndefined();
      // Rejected edit must NOT advance the Plot pointer.
      expect(plotRepo.update).not.toHaveBeenCalled();
    });

    it('passes through a generation tier violation from promptDrive', async () => {
      plotRepo.findOne.mockResolvedValue(plot());
      agentBuilderService.generateDraft.mockResolvedValue({
        versionId: '',
        ecsWorld: world(),
        error: { error: 'TIER_VIOLATION', detail: 'generation exceeded declared tier' },
      });

      const res = await service.continueEditing(USER_ID, PLOT_ID, {
        mode: 'promptDrive',
        surface: 'desktop',
        prompt: 'add executable code',
      });

      expect(res.error?.error).toBe('TIER_VIOLATION');
      expect(res.versionId).toBeUndefined();
    });
  });
});
