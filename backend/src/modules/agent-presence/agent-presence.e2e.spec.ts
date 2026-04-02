/**
 * Agent Presence E2E Integration Tests
 *
 * Tests the full request chain: Controller → Service → Mock Repository
 * Covers all 5 phases of the Agent Presence module.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AgentPresenceController } from './agent-presence.controller';
import { AgentPresenceService } from './agent-presence.service';
import { PresenceRouterService } from './channel/presence-router.service';
import { ChannelRegistry } from './channel/channel-registry';
import { SessionHandoffService } from './handoff/session-handoff.service';
import { AgentTaskSchedulerService } from './scheduler/agent-task-scheduler.service';
import { OperationsDashboardService } from './scheduler/operations-dashboard.service';
import { UnifiedDeviceService } from './unified-device.service';

import { UserAgent, UserAgentStatus } from '../../entities/user-agent.entity';
import { ConversationEvent } from '../../entities/conversation-event.entity';
import { AgentSharePolicy } from '../../entities/agent-share-policy.entity';
import { AgentMemory } from '../../entities/agent-memory.entity';
import { SessionHandoff, HandoffStatus } from '../../entities/session-handoff.entity';
import { DevicePresence } from '../../entities/device-presence.entity';
import { AgentScheduledTask, ScheduledTaskStatus, TaskTriggerType, TaskActionType } from '../../entities/agent-scheduled-task.entity';
import { DelegationLevel } from '../../entities/user-agent.entity';

// ── Mock user injection ───────────────────────────────────────────────────
const TEST_USER_ID = 'e2e-user-uuid-001';

const mockJwtGuard = {
  canActivate: (ctx: any) => {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: TEST_USER_ID };
    return true;
  },
};

// ── Mock repositories ─────────────────────────────────────────────────────
// Simple UUID v4 generator for tests
function testUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeMockRepo() {
  const store: any[] = [];

  return {
    _store: store,
    create: jest.fn((dto: any) => {
      const entity = { id: testUuid(), createdAt: new Date(), updatedAt: new Date(), ...dto };
      return entity;
    }),
    save: jest.fn((entity: any) => {
      const idx = store.findIndex((e) => e.id === entity.id);
      if (idx >= 0) store[idx] = entity;
      else store.push(entity);
      return Promise.resolve(entity);
    }),
    find: jest.fn(({ where } = {} as any) => {
      if (!where) return Promise.resolve(store);
      return Promise.resolve(
        store.filter((e) => {
          for (const [k, v] of Object.entries(where)) {
            if (e[k] !== v) return false;
          }
          return true;
        }),
      );
    }),
    findOne: jest.fn(({ where } = {} as any) => {
      if (!where) return Promise.resolve(null);
      const found = store.find((e) => {
        for (const [k, v] of Object.entries(where)) {
          if (e[k] !== v) return false;
        }
        return true;
      });
      return Promise.resolve(found ?? null);
    }),
    count: jest.fn(() => Promise.resolve(store.length)),
    update: jest.fn((criteria: any, partial: any) => {
      let affected = 0;
      for (const e of store) {
        let match = true;
        for (const [k, v] of Object.entries(criteria)) {
          if (e[k] !== v) { match = false; break; }
        }
        if (match) {
          Object.assign(e, partial);
          affected++;
        }
      }
      return Promise.resolve({ affected });
    }),
    remove: jest.fn((entity: any) => {
      const idx = store.findIndex((e) => e.id === entity.id);
      if (idx >= 0) store.splice(idx, 1);
      return Promise.resolve(entity);
    }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ total: 0, inbound: 0, outbound: 0 }),
    })),
  };
}

describe('Agent Presence E2E', () => {
  let app: INestApplication;
  let agentRepo: ReturnType<typeof makeMockRepo>;
  let eventRepo: ReturnType<typeof makeMockRepo>;
  let sharePolicyRepo: ReturnType<typeof makeMockRepo>;
  let memoryRepo: ReturnType<typeof makeMockRepo>;
  let handoffRepo: ReturnType<typeof makeMockRepo>;
  let deviceRepo: ReturnType<typeof makeMockRepo>;
  let taskRepo: ReturnType<typeof makeMockRepo>;

  beforeAll(async () => {
    agentRepo = makeMockRepo();
    eventRepo = makeMockRepo();
    sharePolicyRepo = makeMockRepo();
    memoryRepo = makeMockRepo();
    handoffRepo = makeMockRepo();
    deviceRepo = makeMockRepo();
    taskRepo = makeMockRepo();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AgentPresenceController],
      providers: [
        AgentPresenceService,
        ChannelRegistry,
        {
          provide: PresenceRouterService,
          useValue: {
            routeInbound: jest.fn().mockResolvedValue({}),
            approveReply: jest.fn().mockResolvedValue({ success: true }),
            sendApprovedReply: jest.fn().mockResolvedValue({ id: 'approved-evt', approvalStatus: 'approved' }),
          },
        },
        SessionHandoffService,
        AgentTaskSchedulerService,
        OperationsDashboardService,
        {
          provide: UnifiedDeviceService,
          useValue: {
            getAllDevices: jest.fn().mockResolvedValue([]),
            getOnlineDevices: jest.fn().mockResolvedValue([]),
            getDeviceStats: jest.fn().mockResolvedValue({
              totalDevices: 0,
              onlineDevices: 0,
              offlineDevices: 0,
              bySource: { agentPresence: 0, desktopSync: 0 },
            }),
            syncDesktopHeartbeat: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
        { provide: getRepositoryToken(UserAgent), useValue: agentRepo },
        { provide: getRepositoryToken(ConversationEvent), useValue: eventRepo },
        { provide: getRepositoryToken(AgentSharePolicy), useValue: sharePolicyRepo },
        { provide: getRepositoryToken(AgentMemory), useValue: memoryRepo },
        { provide: getRepositoryToken(SessionHandoff), useValue: handoffRepo },
        { provide: getRepositoryToken(DevicePresence), useValue: deviceRepo },
        { provide: getRepositoryToken(AgentScheduledTask), useValue: taskRepo },
      ],
    })
      .overrideGuard(require('../../modules/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── Phase 1: Agent CRUD + Events ────────────────────────────────────────

  let agentId: string;

  it('E2E-01: POST /agent-presence/agents — create agent', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent-presence/agents')
      .send({ name: 'E2E Test Agent', personality: 'helpful', delegationLevel: 'assistant' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('E2E Test Agent');
    expect(res.body.delegationLevel).toBe(DelegationLevel.ASSISTANT);
    agentId = res.body.id;
  });

  it('E2E-02: GET /agent-presence/agents — list agents', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/agents')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('E2E-03: GET /agent-presence/agents/:id — get agent', async () => {
    const res = await request(app.getHttpServer())
      .get(`/agent-presence/agents/${agentId}`)
      .expect(200);

    expect(res.body.id).toBe(agentId);
  });

  it('E2E-04: PUT /agent-presence/agents/:id — update agent', async () => {
    const res = await request(app.getHttpServer())
      .put(`/agent-presence/agents/${agentId}`)
      .send({ personality: 'updated personality' })
      .expect(200);

    expect(res.body.personality).toBe('updated personality');
  });

  it('E2E-05: POST /agent-presence/agents/:id/channels — bind channel', async () => {
    const res = await request(app.getHttpServer())
      .post(`/agent-presence/agents/${agentId}/channels`)
      .send({ platform: 'telegram', channelId: 'tg_chat_123' })
      .expect(201);

    expect(res.body.channelBindings).toBeDefined();
  });

  it('E2E-06: DELETE /agent-presence/agents/:id/channels/telegram — unbind', async () => {
    await request(app.getHttpServer())
      .delete(`/agent-presence/agents/${agentId}/channels/telegram`)
      .expect(200);
  });

  it('E2E-07: POST /agent-presence/agents/:id/events — create event', async () => {
    const res = await request(app.getHttpServer())
      .post(`/agent-presence/agents/${agentId}/events`)
      .send({
        agentId,
        channel: 'mobile',
        direction: 'inbound',
        role: 'user',
        content: 'Hello from E2E test',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.content).toBe('Hello from E2E test');
  });

  it('E2E-08: GET /agent-presence/agents/:id/timeline — query timeline', async () => {
    const res = await request(app.getHttpServer())
      .get(`/agent-presence/agents/${agentId}/timeline`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── Phase 2: Channel health + approvals ─────────────────────────────────

  it('E2E-09: GET /agent-presence/channels/health — channel health', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/channels/health')
      .expect(200);

    expect(typeof res.body).toBe('object');
  });

  it('E2E-10: POST /agent-presence/approvals/:id/approve — approve reply', async () => {
    // sendApprovedReply is mocked to return a result
    const res = await request(app.getHttpServer())
      .post('/agent-presence/approvals/some-event-id/approve')
      .send({ text: 'approved text' })
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
  });

  it('E2E-11: POST /agent-presence/approvals/:id/reject — reject reply', async () => {
    // Create an event with agentId in the body so validation passes
    const evt = await request(app.getHttpServer())
      .post(`/agent-presence/agents/${agentId}/events`)
      .send({ agentId, channel: 'telegram', direction: 'outbound', role: 'agent', content: 'draft reply' });

    const res = await request(app.getHttpServer())
      .post(`/agent-presence/approvals/${evt.body.id}/reject`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
  });

  // ── Phase 3: Session Handoff + Device Presence ──────────────────────────

  let handoffId: string;

  it('E2E-12: POST /agent-presence/handoffs — initiate handoff', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent-presence/handoffs')
      .send({
        agentId,
        sourceDeviceId: 'mobile-001',
        sourceDeviceType: 'mobile',
        contextSnapshot: { lastMessages: [] },
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe(HandoffStatus.INITIATED);
    handoffId = res.body.id;
  });

  it('E2E-13: POST /agent-presence/handoffs/:id/accept — accept handoff', async () => {
    const res = await request(app.getHttpServer())
      .post(`/agent-presence/handoffs/${handoffId}/accept`)
      .send({ deviceId: 'desktop-001' })
      .expect(200);

    expect(res.body.status).toBe(HandoffStatus.ACCEPTED);
  });

  it('E2E-14: POST /agent-presence/handoffs/:id/reject — reject handoff', async () => {
    const h = await request(app.getHttpServer())
      .post('/agent-presence/handoffs')
      .send({ agentId, sourceDeviceId: 'mobile-002' });

    const res = await request(app.getHttpServer())
      .post(`/agent-presence/handoffs/${h.body.id}/reject`)
      .expect(200);

    expect(res.body.status).toBe(HandoffStatus.REJECTED);
  });

  it('E2E-15: POST /agent-presence/devices/heartbeat — device heartbeat', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent-presence/devices/heartbeat')
      .send({
        deviceId: 'desktop-e2e',
        deviceType: 'desktop',
        deviceName: 'E2E Desktop',
        platform: 'windows',
      })
      .expect(200);

    expect(res.body.isOnline).toBe(true);
  });

  it('E2E-16: GET /agent-presence/devices/online — online devices', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/devices/online')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('E2E-17: GET /agent-presence/devices — all devices', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/devices')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── Phase 5: Scheduled Tasks + Dashboard ────────────────────────────────

  let taskId: string;

  it('E2E-18: POST /agent-presence/tasks — create task', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent-presence/tasks')
      .send({
        agentId,
        name: 'E2E Daily Digest',
        triggerType: 'cron',
        cronExpression: '0 9 * * *',
        actionType: 'digest_summary',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe(ScheduledTaskStatus.ACTIVE);
    taskId = res.body.id;
  });

  it('E2E-19: GET /agent-presence/tasks — list tasks', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/tasks')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('E2E-20: GET /agent-presence/tasks/:id — get task', async () => {
    const res = await request(app.getHttpServer())
      .get(`/agent-presence/tasks/${taskId}`)
      .expect(200);

    expect(res.body.id).toBe(taskId);
  });

  it('E2E-21: POST /agent-presence/tasks/:id/pause — pause task', async () => {
    const res = await request(app.getHttpServer())
      .post(`/agent-presence/tasks/${taskId}/pause`)
      .expect(200);

    expect(res.body.status).toBe(ScheduledTaskStatus.PAUSED);
  });

  it('E2E-22: POST /agent-presence/tasks/:id/resume — resume task', async () => {
    const res = await request(app.getHttpServer())
      .post(`/agent-presence/tasks/${taskId}/resume`)
      .expect(200);

    expect(res.body.status).toBe(ScheduledTaskStatus.ACTIVE);
  });

  it('E2E-23: GET /agent-presence/dashboard — dashboard overview', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/dashboard')
      .expect(200);

    expect(res.body).toHaveProperty('totalAgents');
    expect(res.body).toHaveProperty('onlineDevices');
    expect(res.body).toHaveProperty('channelVolume');
    expect(res.body).toHaveProperty('agentActivity');
  });

  it('E2E-24: GET /agent-presence/dashboard/channels — channel volume', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent-presence/dashboard/channels')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('E2E-25: GET /agent-presence/dashboard/agents/:id/response-time — response stats', async () => {
    const res = await request(app.getHttpServer())
      .get(`/agent-presence/dashboard/agents/${agentId}/response-time`)
      .expect(200);

    expect(res.body).toHaveProperty('avgMs');
    expect(res.body).toHaveProperty('p95Ms');
    expect(res.body).toHaveProperty('count');
  });

  it('E2E-26: DELETE /agent-presence/tasks/:id — delete task', async () => {
    await request(app.getHttpServer())
      .delete(`/agent-presence/tasks/${taskId}`)
      .expect(200);
  });

  it('E2E-27: POST /agent-presence/handoffs/:id/complete — complete handoff', async () => {
    const handoff = await request(app.getHttpServer())
      .post('/agent-presence/handoffs')
      .send({
        agentId,
        sourceDeviceId: 'mobile-complete-001',
        sourceDeviceType: 'mobile',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/agent-presence/handoffs/${handoff.body.id}/accept`)
      .send({ deviceId: 'desktop-complete-001' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/agent-presence/handoffs/${handoff.body.id}/complete`)
      .expect(200);

    expect(res.body.status).toBe(HandoffStatus.COMPLETED);
  });

  it('E2E-28: DELETE /agent-presence/agents/:id — archive agent', async () => {
    await request(app.getHttpServer())
      .delete(`/agent-presence/agents/${agentId}`)
      .expect(200);
  });
});
