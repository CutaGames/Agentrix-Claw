import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PlotModerationService } from './plot-moderation.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { EcsWorldVersion } from '../entities/ecs-world-version.entity';
import { PlotModerationDecision } from '../entities/plot-moderation-decision.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { ModerationService } from '../../world-engine/services/moderation.service';
import { NotificationService } from '../../notification/notification.service';
import { WorldApiCapability } from '../../../../shared/types/world-creation';

/**
 * Unit tests for PlotModerationService (Task 16.3, R10.3 / R10.5 / R10.6).
 *
 * Focus:
 *  - runPrePublish: a moderation hit returns a structured MODERATION_REJECTED
 *    error carrying the specific stage + reason and writes a `rejected` audit
 *    decision; a clean pass writes an `approved` decision and returns passed.
 *  - takedown: flips the Plot to `suspended` (removed from map discovery) and
 *    notifies the owner.
 *
 * All collaborators (repos, v5 ModerationService, NotificationService) are
 * mocked — no DB, no network.
 */
describe('PlotModerationService', () => {
  let service: PlotModerationService;
  let plotRepo: { findOne: jest.Mock; save: jest.Mock };
  let versionRepo: { findOne: jest.Mock };
  let decisionRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let accountRepo: { findOne: jest.Mock };
  let moderationService: {
    checkCopyrightedCharacter: jest.Mock;
    checkProhibitedWords: jest.Mock;
    applyCnRegionModeration: jest.Mock;
  };
  let notificationService: { createNotification: jest.Mock };

  const PLOT_ID = 'plot-1';
  const OWNER_ACCOUNT_ID = 'acc-owner-1';
  const OWNER_USER_ID = 'user-owner-1';

  const basePlot: WorldPlot = {
    id: PLOT_ID,
    ownerAccountId: OWNER_ACCOUNT_ID,
    originalCreatorAccountId: OWNER_ACCOUNT_ID,
    substrateTier: 'B',
    ecsVersionId: null,
    mapX: 1,
    mapY: 2,
    status: 'draft',
    title: 'My Arena',
    boundAgentId: null,
    shareCode: null,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:01.000Z'),
  } as WorldPlot;

  beforeEach(async () => {
    plotRepo = {
      findOne: jest.fn().mockResolvedValue({ ...basePlot }),
      save: jest.fn().mockImplementation(async (p) => p),
    };
    versionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    decisionRepo = {
      // create echoes the partial; save assigns a deterministic id.
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
      save: jest
        .fn()
        .mockImplementation(async (rec) => ({ id: 'decision-1', ...rec })),
      find: jest.fn().mockResolvedValue([]),
    };
    accountRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: OWNER_ACCOUNT_ID, ownerId: OWNER_USER_ID }),
    };
    moderationService = {
      checkCopyrightedCharacter: jest
        .fn()
        .mockResolvedValue({ passed: true }),
      checkProhibitedWords: jest
        .fn()
        .mockResolvedValue({ passed: true, offendingTerms: [] }),
      applyCnRegionModeration: jest.fn().mockResolvedValue({ passed: true }),
    };
    notificationService = { createNotification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlotModerationService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(EcsWorldVersion), useValue: versionRepo },
        {
          provide: getRepositoryToken(PlotModerationDecision),
          useValue: decisionRepo,
        },
        { provide: getRepositoryToken(AgentAccount), useValue: accountRepo },
        { provide: ModerationService, useValue: moderationService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get(PlotModerationService);
  });

  /** Helper: find the decision record persisted with a given stage/decision. */
  const savedDecisions = () =>
    decisionRepo.save.mock.calls.map(([rec]) => rec);

  // ============================================================
  // R10.3 — pre-publish rejection reports stage + reason
  // ============================================================
  describe('runPrePublish', () => {
    it('passes clean content and records an approved pre_publish decision', async () => {
      const res = await service.runPrePublish(PLOT_ID);

      expect(res.passed).toBe(true);
      const approved = savedDecisions().find(
        (d) => d.stage === 'pre_publish' && d.decision === 'approved',
      );
      expect(approved).toBeDefined();
    });

    it('rejects on a copyright (stage 1) hit with MODERATION_REJECTED carrying the stage and reason', async () => {
      moderationService.checkCopyrightedCharacter.mockResolvedValue({
        passed: false,
        reason: 'this character is not eligible',
      });

      const res = await service.runPrePublish(PLOT_ID);

      expect(res.passed).toBe(false);
      if (res.passed) throw new Error('expected rejection');
      expect(res.error.error).toBe('MODERATION_REJECTED');
      // detail embeds the specific stage + reason (R10.3).
      expect(res.error.detail).toContain('pre_publish');
      expect(res.error.detail).toContain('this character is not eligible');

      // A rejected decision is persisted to the audit log (R10.6).
      const rejected = savedDecisions().find(
        (d) => d.stage === 'pre_publish' && d.decision === 'rejected',
      );
      expect(rejected).toBeDefined();
      expect(rejected.reason).toContain('this character is not eligible');

      // Short-circuits: later stages are not consulted.
      expect(moderationService.checkProhibitedWords).not.toHaveBeenCalled();
    });

    it('rejects on a prohibited-words (stage 2) hit reporting the offending terms', async () => {
      moderationService.checkProhibitedWords.mockResolvedValue({
        passed: false,
        offendingTerms: ['badword'],
      });

      const res = await service.runPrePublish(PLOT_ID);

      expect(res.passed).toBe(false);
      if (res.passed) throw new Error('expected rejection');
      expect(res.error.error).toBe('MODERATION_REJECTED');
      expect(res.error.detail).toContain('pre_publish');
      expect(res.error.detail).toContain('badword');
    });

    it('rejects on a cn_region (stage 3) hit reporting the cn_region stage', async () => {
      moderationService.applyCnRegionModeration.mockResolvedValue({
        passed: false,
        reason: 'cn-region banned topic',
      });

      const res = await service.runPrePublish(PLOT_ID, {
        isChineseRegion: true,
      });

      expect(res.passed).toBe(false);
      if (res.passed) throw new Error('expected rejection');
      expect(res.error.detail).toContain('cn_region');
      expect(res.error.detail).toContain('cn-region banned topic');
      expect(moderationService.applyCnRegionModeration).toHaveBeenCalled();
    });

    it('throws NotFound when the Plot does not exist', async () => {
      plotRepo.findOne.mockResolvedValue(null);
      await expect(service.runPrePublish('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ============================================================
  // R10.2 — Stage 4 Tier_C static code scan integration
  // ============================================================
  describe('runPrePublish — Stage 4 Tier_C static code scan', () => {
    const VERSION_ID = 'ecs-v1';
    const MODULE_ID = 'mod-td';

    /** A Tier_C plot whose ECS version snapshot declares one logic module. */
    const tierCPlot = { ...basePlot, ecsVersionId: VERSION_ID };

    /** Build an EcsWorld snapshot with a single Tier_C logic module ref. */
    const ecsWorldWith = (capabilities: WorldApiCapability[], hash = '') => ({
      meta: { title: 'TD World' },
      entities: [],
      logicModules: [
        {
          moduleId: MODULE_ID,
          runtime: 'js',
          entry: 'tick',
          capabilities,
          hash,
          reviewStatus: 'passed',
        },
      ],
    });

    beforeEach(() => {
      plotRepo.findOne.mockResolvedValue({ ...tierCPlot });
    });

    it('passes a clean Tier_C module and records an approved static_code_scan decision', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        snapshotJson: ecsWorldWith([WorldApiCapability.Ui]),
      });

      const res = await service.runPrePublish(PLOT_ID, {
        logicModuleSources: {
          [MODULE_ID]: `api.call('ui.toast', { text: 'hi' });`,
        },
      });

      expect(res.passed).toBe(true);
      const approved = savedDecisions().find(
        (d) => d.stage === 'static_code_scan' && d.decision === 'approved',
      );
      expect(approved).toBeDefined();
    });

    it('blocks publish when a logic module fails the static scan (undeclared capability)', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        snapshotJson: ecsWorldWith([WorldApiCapability.Ui]),
      });

      const res = await service.runPrePublish(PLOT_ID, {
        logicModuleSources: {
          // Calls economy.requestCharge but only ui.* is declared.
          [MODULE_ID]: `api.call('economy.requestCharge', { amount: 1 });`,
        },
      });

      expect(res.passed).toBe(false);
      if (res.passed) throw new Error('expected rejection');
      expect(res.error.error).toBe('MODERATION_REJECTED');
      expect(res.error.detail).toContain('static_code_scan');
      expect(res.error.detail).toContain('capability_abuse');

      const rejected = savedDecisions().find(
        (d) => d.stage === 'static_code_scan' && d.decision === 'rejected',
      );
      expect(rejected).toBeDefined();
    });

    it('blocks publish on a hash mismatch (post-publish bytecode swap)', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        snapshotJson: ecsWorldWith(
          [WorldApiCapability.Ui],
          'sha256:deadbeef', // locked hash that won't match the supplied source
        ),
      });

      const res = await service.runPrePublish(PLOT_ID, {
        logicModuleSources: {
          [MODULE_ID]: `api.call('ui.toast', { text: 'swapped' });`,
        },
      });

      expect(res.passed).toBe(false);
      if (res.passed) throw new Error('expected rejection');
      expect(res.error.detail).toContain('static_code_scan');
      expect(res.error.detail).toContain('hash mismatch');
    });

    it('blocks publish when a Tier_C module has no reviewable source', async () => {
      versionRepo.findOne.mockResolvedValue({
        id: VERSION_ID,
        snapshotJson: ecsWorldWith([WorldApiCapability.Ui]),
      });

      const res = await service.runPrePublish(PLOT_ID, {
        logicModuleSources: {}, // no source for MODULE_ID
      });

      expect(res.passed).toBe(false);
      if (res.passed) throw new Error('expected rejection');
      expect(res.error.detail).toContain('static_code_scan');
      expect(res.error.detail).toContain('no reviewable source');
    });
  });

  // ============================================================
  // R10.5 / R10.6 — takedown suspends the Plot and notifies the owner
  // ============================================================
  describe('takedown', () => {
    it('suspends the Plot, notifies the owner, and records a rejected decision', async () => {
      const res = await service.takedown(PLOT_ID, 'violates policy', 'rev-1');

      expect(res.taken).toBe(true);
      expect(res.status).toBe('suspended');

      // Plot persisted with suspended status (removed from map discovery).
      const savedPlot = plotRepo.save.mock.calls[0][0];
      expect(savedPlot.status).toBe('suspended');

      // Owner notified with the takedown reason (R10.5).
      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
      const [notifiedUserId, payload] =
        notificationService.createNotification.mock.calls[0];
      expect(notifiedUserId).toBe(OWNER_USER_ID);
      expect(payload.metadata.kind).toBe('plot_takedown');
      expect(payload.metadata.reason).toBe('violates policy');

      // Audit decision recorded as rejected (R10.6).
      const rejected = savedDecisions().find(
        (d) => d.stage === 'post_publish_report' && d.decision === 'rejected',
      );
      expect(rejected).toBeDefined();
      expect(rejected.reviewerId).toBe('rev-1');
    });

    it('is idempotent on an already-suspended Plot: records audit but does not re-notify', async () => {
      plotRepo.findOne.mockResolvedValue({ ...basePlot, status: 'suspended' });

      const res = await service.takedown(PLOT_ID, 'again');

      expect(res.status).toBe('suspended');
      // No status flip persisted.
      expect(plotRepo.save).not.toHaveBeenCalled();
      // No duplicate owner notification.
      expect(notificationService.createNotification).not.toHaveBeenCalled();
      // Still appends an audit decision.
      expect(savedDecisions().length).toBeGreaterThan(0);
    });

    it('throws NotFound when the Plot does not exist', async () => {
      plotRepo.findOne.mockResolvedValue(null);
      await expect(
        service.takedown('missing', 'reason'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
