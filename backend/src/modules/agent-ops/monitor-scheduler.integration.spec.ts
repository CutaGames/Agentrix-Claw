import { MonitorScheduler } from './monitor-scheduler.service';
import { MonitorService } from './monitor.service';
import { MonitorAlertDispatcher } from './monitor-alert-dispatcher.service';
import { ReadOnlyMonitorChecker } from './read-only-monitor-checker';
import { MONITOR_ALERT_EVENT } from './monitor.types';
import { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';

/**
 * MonitorScheduler 集成测(crypto-native-agent-ops 任务 16)。
 *
 * 集成路径(真实组件 + 边界 mock):
 *   ReadOnlyFetcher(mock) → ReadOnlyMonitorChecker(真) → MonitorScheduler.runCheck(真)
 *   → MonitorService.recordCheckResult(真,mock repo) + MonitorAlertDispatcher(真)
 *   → SessionFabricService(mock) + OutputDispatcherService(spy)。
 *
 * 覆盖需求 9:
 *   - 9.1 周期只读检查 + 命中即推送;
 *   - 9.3 多端送达(至少桌面 + 移动);
 *   - 9.4 回写 lastCheckedAt/lastResult,暂停/删除订阅不再检查。
 *
 * 禁用 BullMQ 队列(env)以避免测试依赖 Redis;runCheck 为队列 Worker / 内联回退共用入口。
 */
describe('MonitorScheduler 集成 — 周期只读检查 + 多端推送 (需求 9)', () => {
  const OLD_ENV = process.env.AGENT_OPS_MONITOR_SCHEDULER_DISABLED;

  // ── 边界 mock ──
  const fetcher = { fetch: jest.fn() };
  const fabric = {
    getUserSessions: jest.fn(),
    getSessionDevices: jest.fn(),
  };
  const outputDispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const monitorRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  let scheduler: MonitorScheduler;
  let monitorService: MonitorService;

  const sub = (over: Partial<MonitorSubscriptionEntity> = {}): MonitorSubscriptionEntity =>
    ({
      id: 'm1',
      ownerId: 'owner-1',
      agentId: 'agent-1',
      monitorType: 'price',
      condition: {
        url: 'https://price.example/eth',
        extract: 'document.querySelector("#p").innerText',
        metric: 'price',
        operator: 'gt',
        value: 2000,
      },
      interval: 60,
      lastCheckedAt: null,
      lastResult: null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as MonitorSubscriptionEntity;

  beforeAll(() => {
    process.env.AGENT_OPS_MONITOR_SCHEDULER_DISABLED = '1';
  });
  afterAll(() => {
    process.env.AGENT_OPS_MONITOR_SCHEDULER_DISABLED = OLD_ENV;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const checker = new ReadOnlyMonitorChecker(fetcher as any);
    const alertDispatcher = new MonitorAlertDispatcher(
      fabric as any,
      outputDispatcher as any,
    );
    monitorService = new MonitorService(monitorRepo as any);
    scheduler = new MonitorScheduler(
      { get: (_k: string, d: any) => d } as any,
      monitorService,
      alertDispatcher,
      [checker],
    );

    // 默认:owner 有一个会话,会话含桌面 + 移动设备。
    fabric.getUserSessions.mockResolvedValue(['session-1']);
    fabric.getSessionDevices.mockResolvedValue([
      { deviceType: 'desktop', socketId: 'sock-desktop' },
      { deviceType: 'phone', socketId: 'sock-phone' },
    ]);
  });

  it('命中触发条件 → 回写 lastResult 且多端推送(桌面 + 移动)', async () => {
    monitorRepo.findOne.mockResolvedValue(sub());
    // 只读采集返回 price=2500 > 2000 → 命中。
    fetcher.fetch.mockResolvedValue({ success: true, data: { price: 2500 } });

    const outcome = await scheduler.runCheck('m1');

    expect(outcome?.triggered).toBe(true);
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);

    // 9.4:回写 lastCheckedAt/lastResult。
    expect(monitorRepo.update).toHaveBeenCalledWith(
      { id: 'm1' },
      expect.objectContaining({
        lastResult: expect.objectContaining({ triggered: true, observedValue: 2500 }),
      }),
    );

    // 9.1/9.3:多端推送,经 voice output-dispatcher(notification)。
    expect(outputDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        event: MONITOR_ALERT_EVENT,
        kind: 'notification',
        data: expect.objectContaining({
          type: 'monitor_alert',
          monitorType: 'price',
        }),
      }),
    );
  });

  it('多端送达汇总包含桌面 + 移动(需求 9.3)', async () => {
    monitorRepo.findOne.mockResolvedValue(sub());
    fetcher.fetch.mockResolvedValue({ success: true, data: { price: 2500 } });

    // 直接验证 dispatcher 汇总(多端覆盖)。
    const alertDispatcher = new MonitorAlertDispatcher(
      fabric as any,
      outputDispatcher as any,
    );
    const result = await alertDispatcher.deliverAlert('owner-1', {
      subscriptionId: 'm1',
      agentId: 'agent-1',
      monitorType: 'price',
      title: '价格告警',
      body: '命中',
      observations: { price: 2500 },
      triggeredAt: new Date().toISOString(),
    });

    expect(result.delivered).toBe(true);
    expect(result.sessionsReached).toBe(1);
    expect(result.deviceTypes).toEqual(
      expect.arrayContaining(['desktop', 'phone']),
    );
    expect(result.deviceCount).toBe(2);
  });

  it('未命中 → 回写结果但不推送', async () => {
    monitorRepo.findOne.mockResolvedValue(sub());
    fetcher.fetch.mockResolvedValue({ success: true, data: { price: 1500 } });

    const outcome = await scheduler.runCheck('m1');

    expect(outcome?.triggered).toBe(false);
    expect(monitorRepo.update).toHaveBeenCalled();
    expect(outputDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('只读采集失败 → 记录错误、不命中、不编造、不推送', async () => {
    monitorRepo.findOne.mockResolvedValue(sub());
    fetcher.fetch.mockResolvedValue({
      success: false,
      failureReason: 'timeout',
      error: 'navigate timed out',
    });

    const outcome = await scheduler.runCheck('m1');

    expect(outcome?.triggered).toBe(false);
    expect(outcome?.observations).toBeNull();
    expect(outcome?.error).toBeDefined();
    expect(outputDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('暂停的订阅 → runCheck 跳过(不检查/不推送)', async () => {
    monitorRepo.findOne.mockResolvedValue(sub({ status: 'paused' }));

    const outcome = await scheduler.runCheck('m1');

    expect(outcome).toBeNull();
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(monitorRepo.update).not.toHaveBeenCalled();
    expect(outputDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('无活跃会话 → 命中也安全降级(delivered=false,不抛错)', async () => {
    monitorRepo.findOne.mockResolvedValue(sub());
    fetcher.fetch.mockResolvedValue({ success: true, data: { price: 2500 } });
    fabric.getUserSessions.mockResolvedValue([]);

    const outcome = await scheduler.runCheck('m1');

    expect(outcome?.triggered).toBe(true);
    expect(outputDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('handleTick 内联回退:到期订阅被检查(无队列时)', async () => {
    // 无 Redis/队列 → onModuleInit 因 env 禁用未建队列;handleTick 走内联。
    const due = sub({ id: 'due-1' });
    monitorRepo.find.mockResolvedValue([due]); // never-checked
    monitorRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    // runCheck 内 findById 用 findOne
    monitorRepo.findOne.mockResolvedValue(due);
    fetcher.fetch.mockResolvedValue({ success: true, data: { price: 2500 } });

    // env 禁用时 handleTick 直接 return;为测内联回退,临时清除禁用并确保无队列。
    process.env.AGENT_OPS_MONITOR_SCHEDULER_DISABLED = '0';
    try {
      await scheduler.handleTick();
    } finally {
      process.env.AGENT_OPS_MONITOR_SCHEDULER_DISABLED = '1';
    }

    expect(monitorRepo.update).toHaveBeenCalledWith(
      { id: 'due-1' },
      expect.objectContaining({
        lastResult: expect.objectContaining({ triggered: true }),
      }),
    );
    expect(outputDispatcher.dispatch).toHaveBeenCalled();
  });
});
