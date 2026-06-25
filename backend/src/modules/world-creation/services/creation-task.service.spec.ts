import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreationTaskService } from './creation-task.service';
import { CreationTask } from '../entities/creation-task.entity';
import {
  CREATION_TASK_DISPATCHER,
  type CreationTaskDispatcher,
} from './creation-task.dispatcher';
import { NotificationService } from '../../notification/notification.service';
import type { SubmitCreationTaskRequest } from '../../../../shared/types/world-creation-api';
import type { CreationTaskStatus } from '../../../../shared/types/world-creation';

/**
 * Unit tests for CreationTaskService task 20.2 (R8.5 / R8.6 / R8.7).
 *
 * Focus:
 *  - R8.5 completion notification: a completed transition notifies the
 *    originating user with the resulting ECS_World artifact reference.
 *  - R8.6 failure retry: retry of a failed task retains the original input,
 *    clears the failure reason, re-queues, and re-dispatches.
 *  - R8.7 Mobile Tier_C forced routing: a Mobile-originated Tier_C task is
 *    routed to desktop / agent and never executed on Mobile (self).
 *
 * The repository is an in-memory fake; the dispatcher and NotificationService
 * are jest mocks — no DB, no network.
 */
describe('CreationTaskService (task 20.2)', () => {
  let service: CreationTaskService;
  let store: Map<string, CreationTask>;
  let idSeq: number;
  let dispatcher: jest.Mocked<CreationTaskDispatcher>;
  let notificationService: { createNotification: jest.Mock };

  const USER_ID = 'user-1';

  const makeReq = (
    over: Partial<SubmitCreationTaskRequest> = {},
  ): SubmitCreationTaskRequest => ({
    plotId: 'plot-1',
    target: 'desktop',
    substrateTier: 'B',
    input: { prompt: 'build a shop' },
    ...over,
  });

  beforeEach(async () => {
    store = new Map();
    idSeq = 0;

    const taskRepo = {
      create: jest.fn((dto: Partial<CreationTask>) => ({ ...dto }) as CreationTask),
      save: jest.fn(async (entity: CreationTask) => {
        if (!entity.id) {
          entity.id = `task-${++idSeq}`;
          entity.createdAt = new Date('2026-06-01T00:00:00.000Z');
        }
        entity.updatedAt = new Date('2026-06-01T00:00:01.000Z');
        store.set(entity.id, { ...entity });
        return { ...entity };
      }),
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
        const found = store.get(where.id);
        return found ? { ...found } : null;
      }),
    };

    dispatcher = {
      dispatchToDesktop: jest.fn().mockResolvedValue({ accepted: true }),
      dispatchToAgent: jest.fn().mockResolvedValue({ accepted: true }),
    };

    notificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreationTaskService,
        { provide: getRepositoryToken(CreationTask), useValue: taskRepo },
        { provide: CREATION_TASK_DISPATCHER, useValue: dispatcher },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get(CreationTaskService);
  });

  // ============================================================
  // R8.7 — Mobile Tier_C forced routing
  // ============================================================
  describe('R8.7 Mobile Tier_C forced routing', () => {
    it('forces a Mobile Tier_C self request to desktop (never self)', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'mobile', substrateTier: 'C', target: 'self' }),
      );

      expect(res.effectiveTarget).toBe('desktop');
      expect(res.task.target).toBe('desktop');
      expect(res.task.status).toBe('running');
      expect(dispatcher.dispatchToDesktop).toHaveBeenCalledTimes(1);
    });

    it('honors an explicit agent preference for Mobile Tier_C', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'mobile', substrateTier: 'C', target: 'agent' }),
      );

      expect(res.effectiveTarget).toBe('agent');
      expect(dispatcher.dispatchToAgent).toHaveBeenCalledTimes(1);
    });

    it('does not force routing for Mobile Tier_A/B (self stays self)', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'mobile', substrateTier: 'B', target: 'self' }),
      );

      expect(res.effectiveTarget).toBe('self');
      expect(res.task.status).toBe('queued');
      expect(dispatcher.dispatchToDesktop).not.toHaveBeenCalled();
      expect(dispatcher.dispatchToAgent).not.toHaveBeenCalled();
    });

    it('does not force routing for Desktop Tier_C', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'desktop', substrateTier: 'C', target: 'self' }),
      );

      expect(res.effectiveTarget).toBe('self');
    });
  });

  // ============================================================
  // R8.5 — completion notification with artifact reference
  // ============================================================
  describe('R8.5 completion notification', () => {
    it('notifies the originating user with the ECS_World artifact reference', async () => {
      const { task } = await service.submit(USER_ID, makeReq({ target: 'desktop' }));
      // desktop dispatch accepted → running; now complete it with an artifact ref.
      await service.transitionStatus(task.taskId, 'completed', {
        resultRef: 'v42',
      });

      expect(notificationService.createNotification).toHaveBeenCalledTimes(1);
      const [notifiedUserId, payload] =
        notificationService.createNotification.mock.calls[0];
      expect(notifiedUserId).toBe(USER_ID);
      expect(payload.metadata.kind).toBe('creation_task_completed');
      expect(payload.metadata.artifactRef).toBe('v42');
      expect(payload.metadata.taskId).toBe(task.taskId);
    });

    it('requires a resultRef to transition to completed', async () => {
      const { task } = await service.submit(USER_ID, makeReq({ target: 'desktop' }));
      await expect(
        service.transitionStatus(task.taskId, 'completed'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ============================================================
  // R8.6 — failure retry retains input + clears reason
  // ============================================================
  describe('R8.6 failure retry', () => {
    it('retries a failed task, retaining input and clearing the failure reason', async () => {
      // First dispatch fails → task lands in failed with a reason.
      dispatcher.dispatchToDesktop.mockResolvedValueOnce({
        accepted: false,
        detail: 'desktop offline',
      });
      const { task } = await service.submit(USER_ID, makeReq({ target: 'desktop' }));
      expect(task.status).toBe('failed');
      expect(task.failReason).toContain('desktop offline');

      // Retry: re-dispatch accepted → running, input retained, reason cleared.
      const res = await service.retry(USER_ID, task.taskId);
      expect(res.task.status).toBe('running');
      expect(res.task.failReason).toBeNull();

      const persisted = store.get(task.taskId)!;
      expect(persisted.inputJson).toEqual({ prompt: 'build a shop' });
    });

    it('rejects retry of a task that is not failed', async () => {
      const { task } = await service.submit(USER_ID, makeReq({ target: 'desktop' }));
      // task is running (dispatch accepted), not failed.
      await expect(service.retry(USER_ID, task.taskId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('hides another user\'s task behind a 404 on retry', async () => {
      const { task } = await service.submit(USER_ID, makeReq({ target: 'desktop' }));
      await expect(
        service.retry('someone-else', task.taskId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ============================================================
  // task 20.3 additions
  // ============================================================

  /**
   * Helper: enqueue a `self` task so it stays `queued` (no dispatch), giving a
   * clean starting point to drive the state machine directly via
   * transitionStatus. Returns the persisted task id.
   */
  const enqueueQueued = async (
    over: Partial<SubmitCreationTaskRequest> = {},
  ): Promise<string> => {
    const { task } = await service.submit(
      USER_ID,
      makeReq({ target: 'self', substrateTier: 'B', ...over }),
    );
    expect(task.status).toBe('queued');
    return task.taskId;
  };

  // ============================================================
  // R8.4 — state machine transition completeness
  // ============================================================
  describe('R8.4 state machine transitions', () => {
    it('allows queued → running', async () => {
      const id = await enqueueQueued();
      const t = await service.transitionStatus(id, 'running');
      expect(t.status).toBe('running');
    });

    it('allows queued → failed (with reason)', async () => {
      const id = await enqueueQueued();
      const t = await service.transitionStatus(id, 'failed', {
        failReason: 'generator crashed',
      });
      expect(t.status).toBe('failed');
      expect(t.failReason).toBe('generator crashed');
    });

    it('allows running → completed (with resultRef)', async () => {
      const id = await enqueueQueued();
      await service.transitionStatus(id, 'running');
      const t = await service.transitionStatus(id, 'completed', {
        resultRef: 'v7',
      });
      expect(t.status).toBe('completed');
      expect(t.resultRef).toBe('v7');
    });

    it('allows running → failed (with reason)', async () => {
      const id = await enqueueQueued();
      await service.transitionStatus(id, 'running');
      const t = await service.transitionStatus(id, 'failed', {
        failReason: 'runtime error',
      });
      expect(t.status).toBe('failed');
      expect(t.failReason).toBe('runtime error');
    });

    it('allows failed → queued (retry re-queue, clears reason)', async () => {
      const id = await enqueueQueued();
      await service.transitionStatus(id, 'failed', { failReason: 'boom' });
      const t = await service.transitionStatus(id, 'queued');
      expect(t.status).toBe('queued');
      expect(t.failReason).toBeNull();
    });

    // ---- illegal transitions are rejected with BadRequest ----
    it.each<[CreationTaskStatus, CreationTaskStatus]>([
      ['queued', 'completed'],
      ['queued', 'queued'],
      ['running', 'queued'],
      ['running', 'running'],
      ['failed', 'running'],
      ['failed', 'completed'],
      ['failed', 'failed'],
      ['completed', 'running'],
      ['completed', 'failed'],
      ['completed', 'queued'],
      ['completed', 'completed'],
    ])('rejects illegal transition %s → %s', async (from, to) => {
      const id = await enqueueQueued();
      // Drive the task into `from` via legal steps.
      if (from === 'running') {
        await service.transitionStatus(id, 'running');
      } else if (from === 'failed') {
        await service.transitionStatus(id, 'failed', { failReason: 'x' });
      } else if (from === 'completed') {
        await service.transitionStatus(id, 'running');
        await service.transitionStatus(id, 'completed', { resultRef: 'v1' });
      }
      // `from === 'queued'` needs no driving.

      await expect(
        service.transitionStatus(id, to, { resultRef: 'v9', failReason: 'r' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 404 when transitioning a non-existent task', async () => {
      await expect(
        service.transitionStatus('task-does-not-exist', 'running'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires a failReason to transition to failed', async () => {
      const id = await enqueueQueued();
      await expect(
        service.transitionStatus(id, 'failed'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ============================================================
  // R8.6 — failed task retains input across the retry lifecycle
  // ============================================================
  describe('R8.6 failed input retention', () => {
    it('retains inputJson and leaves resultRef null when a task fails', async () => {
      const id = await enqueueQueued({ input: { prompt: 'paint a mural' } });
      await service.transitionStatus(id, 'failed', { failReason: 'oom' });

      const persisted = store.get(id)!;
      expect(persisted.inputJson).toEqual({ prompt: 'paint a mural' });
      expect(persisted.failReason).toBe('oom');
      expect(persisted.resultRef).toBeNull();
    });

    it('keeps the original input intact across repeated fail → retry cycles', async () => {
      // First dispatch fails, then a retry fails again — input must survive both.
      dispatcher.dispatchToDesktop
        .mockResolvedValueOnce({ accepted: false, detail: 'offline #1' })
        .mockResolvedValueOnce({ accepted: false, detail: 'offline #2' });

      const { task } = await service.submit(
        USER_ID,
        makeReq({ target: 'desktop', input: { prompt: 'forge a sword' } }),
      );
      expect(task.status).toBe('failed');

      const after1 = await service.retry(USER_ID, task.taskId);
      expect(after1.task.status).toBe('failed');
      expect(after1.task.failReason).toContain('offline #2');

      const persisted = store.get(task.taskId)!;
      expect(persisted.inputJson).toEqual({ prompt: 'forge a sword' });
    });
  });

  // ============================================================
  // R8.7 — additional surface / target routing combinations
  // ============================================================
  describe('R8.7 forced routing — additional combinations', () => {
    it('does not force routing for web Tier_C (self stays self)', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'web', substrateTier: 'C', target: 'self' }),
      );
      expect(res.effectiveTarget).toBe('self');
      expect(res.task.status).toBe('queued');
    });

    it('keeps an explicit desktop target for Mobile Tier_C', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'mobile', substrateTier: 'C', target: 'desktop' }),
      );
      expect(res.effectiveTarget).toBe('desktop');
      expect(dispatcher.dispatchToDesktop).toHaveBeenCalledTimes(1);
      expect(dispatcher.dispatchToAgent).not.toHaveBeenCalled();
    });

    it('does not force routing for Mobile Tier_A (self stays self)', async () => {
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'mobile', substrateTier: 'A', target: 'self' }),
      );
      expect(res.effectiveTarget).toBe('self');
      expect(res.task.status).toBe('queued');
    });

    it('preserves the forced target through a retry of a Mobile Tier_C task', async () => {
      // Mobile Tier_C self → forced to desktop; first dispatch fails → failed.
      dispatcher.dispatchToDesktop.mockResolvedValueOnce({
        accepted: false,
        detail: 'desktop asleep',
      });
      const res = await service.submit(
        USER_ID,
        makeReq({ surface: 'mobile', substrateTier: 'C', target: 'self' }),
      );
      expect(res.effectiveTarget).toBe('desktop');
      expect(res.task.status).toBe('failed');

      // Retry re-dispatches to desktop (never self/mobile) and succeeds → running.
      const retried = await service.retry(USER_ID, res.task.taskId);
      expect(retried.task.target).toBe('desktop');
      expect(retried.task.status).toBe('running');
    });
  });
});
