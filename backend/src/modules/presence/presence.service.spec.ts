/**
 * PresenceService — presence 离线即时验证
 * (spec soul-companion-onboarding, task P.5 / Correctness Property 9 / Requirement 8.6).
 *
 * Property 9（presence 离线即时):
 *   心跳超过 ttl 即判离线,与该端是否重连无关;配对关系不因离线删除;重连成功后恢复在线。
 *   **Validates: Requirements 8.6**
 *
 * 设计要点(design §7.1):
 *   - report(userId, instanceId, device, ttlSec) 刷新心跳并置在线;首次/offline→online 推送。
 *   - sweep() 定时扫描,心跳超 ttl「立即」标离线并推送,**不删除条目**(配对保留)。
 *   - query() 只读返回各端 { device, online, lastSeen },读取即时叠加 ttl 判定。
 *
 * 时间控制:PresenceService 内部只用 `Date.now()` 读时钟,这里用 jest 假时钟
 * (useFakeTimers + setSystemTime)确定性地驱动「心跳 → 时间流逝 → sweep」,
 * 全程无真实等待、无真实网络。sweep 虽带 @Interval 装饰器,但 `new PresenceService()`
 * 直接实例化不会启动真实定时器,这里手动调用 sweep() 控制其触发节拍。
 *
 * fast-check 属性测试 numRuns 控制在 20 以内,保证套件快速。
 */
import * as fc from 'fast-check';
import {
  PresenceService,
  PresenceUpdate,
  DevicePresence,
  PresenceDevice,
} from './presence.service';

// 固定基准时刻(2026-06-04 20:00:00 UTC),与诞生时刻文案无关,仅作确定性时钟锚点。
const BASE = Date.UTC(2026, 5, 4, 20, 0, 0);
const USER = 'user-presence-1';
const INSTANCE = 'instance-presence-1';

function setup() {
  const svc = new PresenceService();
  const updates: PresenceUpdate[] = [];
  // 注入推送缝:捕获 offline/online 跃迁推送,验证「并推送」语义。
  svc.registerPushHandler((u) => updates.push(u));
  return { svc, updates };
}

function deviceState(
  presences: DevicePresence[],
  device: PresenceDevice,
): DevicePresence | undefined {
  return presences.find((p) => p.device === device);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PresenceService — presence 离线即时 (Property 9 / R8.6)', () => {
  // ── 例子级确定性单测 ───────────────────────────────────────────────

  it('心跳上报后该端立即在线,query 返回 online + lastSeen', () => {
    const { svc } = setup();
    svc.report(USER, INSTANCE, 'mobile', 30);

    const presences = svc.query(USER, INSTANCE);
    const mobile = deviceState(presences, 'mobile');
    expect(mobile).toBeDefined();
    expect(mobile!.online).toBe(true);
    expect(mobile!.lastSeen).toBe(BASE);
  });

  it('心跳超过 ttl 后 sweep 立即标离线,并推送、且不删除配对条目', () => {
    const { svc, updates } = setup();
    svc.report(USER, INSTANCE, 'desktop', 30); // ttl=30s
    updates.length = 0; // 清掉首次上报的 online 推送,只看离线推送

    // 越过 ttl(30s)再多 1ms。
    jest.setSystemTime(BASE + 30_000 + 1);
    const changed = svc.sweep();

    // sweep 报告该实例发生变化(离线翻转)。
    expect(changed).toHaveLength(1);
    expect(changed[0].instanceId).toBe(INSTANCE);
    expect(deviceState(changed[0].presences, 'desktop')!.online).toBe(false);

    // 离线已推送给相关端(R8.4)。
    expect(updates).toHaveLength(1);
    expect(deviceState(updates[0].presences, 'desktop')!.online).toBe(false);

    // 配对不被删除:query 仍返回该端条目,只是 online=false。
    const presences = svc.query(USER, INSTANCE);
    expect(presences).toHaveLength(1);
    expect(deviceState(presences, 'desktop')!.online).toBe(false);
  });

  it('心跳未超 ttl 时 sweep 不翻转、不推送,仍在线', () => {
    const { svc, updates } = setup();
    svc.report(USER, INSTANCE, 'mobile', 30);
    updates.length = 0;

    // 刚好到 ttl 边界(30s 整),不算超时。
    jest.setSystemTime(BASE + 30_000);
    const changed = svc.sweep();

    expect(changed).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(deviceState(svc.query(USER, INSTANCE), 'mobile')!.online).toBe(true);
  });

  it('离线后重连(再次心跳)恢复在线,lastSeen 更新且重新推送 online', () => {
    const { svc, updates } = setup();
    svc.report(USER, INSTANCE, 'desktop', 30);

    // 超时 → 离线。
    jest.setSystemTime(BASE + 60_000);
    svc.sweep();
    expect(deviceState(svc.query(USER, INSTANCE), 'desktop')!.online).toBe(false);

    // 重连:在更晚的时刻再上报。
    updates.length = 0;
    jest.setSystemTime(BASE + 90_000);
    svc.report(USER, INSTANCE, 'desktop', 30);

    const presences = svc.query(USER, INSTANCE);
    const desktop = deviceState(presences, 'desktop')!;
    expect(desktop.online).toBe(true);
    expect(desktop.lastSeen).toBe(BASE + 90_000);
    // offline→online 跃迁推送。
    expect(updates).toHaveLength(1);
    expect(deviceState(updates[0].presences, 'desktop')!.online).toBe(true);
  });

  it('离线与是否重连无关:超时后反复 sweep(模拟重连尝试期)始终保持离线,直到真正心跳到来', () => {
    const { svc } = setup();
    svc.report(USER, INSTANCE, 'mobile', 30);

    // 越过 ttl,连续多次 sweep(每次代表一段流逝 + 一次扫描)——期间「正在尝试重连」但无成功心跳。
    for (let i = 1; i <= 4; i++) {
      jest.setSystemTime(BASE + 30_000 + i * 5_000);
      svc.sweep();
      const m = deviceState(svc.query(USER, INSTANCE), 'mobile')!;
      expect(m.online).toBe(false); // 始终离线
      expect(m.lastSeen).toBe(BASE); // 没有新心跳,lastSeen 不变
    }

    // 真正重连成功(新心跳)才恢复在线。
    jest.setSystemTime(BASE + 60_000);
    svc.report(USER, INSTANCE, 'mobile', 30);
    expect(deviceState(svc.query(USER, INSTANCE), 'mobile')!.online).toBe(true);
  });

  it('一端离线不影响另一端:仍在心跳的端保持在线,且离线端配对条目保留', () => {
    const { svc } = setup();
    svc.report(USER, INSTANCE, 'mobile', 30);
    svc.report(USER, INSTANCE, 'desktop', 30);

    // desktop 停止心跳;mobile 在 ttl 内续跳。
    jest.setSystemTime(BASE + 20_000);
    svc.report(USER, INSTANCE, 'mobile', 30);

    // 越过 desktop 的 ttl(BASE+30s)但 mobile 刚续过(BASE+20s,未超时)。
    jest.setSystemTime(BASE + 40_000);
    svc.sweep();

    const presences = svc.query(USER, INSTANCE);
    // 两端配对条目都还在(不删配对)。
    expect(presences).toHaveLength(2);
    expect(deviceState(presences, 'mobile')!.online).toBe(true);
    expect(deviceState(presences, 'desktop')!.online).toBe(false);
  });

  // ── 属性级测试(fast-check, numRuns ≤ 20) ─────────────────────────

  it('Property 9: 任意 ttl/设备/流逝时间下,sweep 后离线当且仅当心跳超 ttl,且配对条目恒存 (R8.6)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 120 }), // ttlSec
        fc.constantFrom<PresenceDevice>('mobile', 'desktop'),
        fc.integer({ min: 0, max: 400_000 }), // 流逝毫秒
        (ttlSec, device, elapsedMs) => {
          jest.setSystemTime(BASE);
          const { svc } = setup();
          svc.report(USER, INSTANCE, device, ttlSec);

          // 上报当下必定在线。
          expect(deviceState(svc.query(USER, INSTANCE), device)!.online).toBe(true);

          jest.setSystemTime(BASE + elapsedMs);
          const changed = svc.sweep();

          const ttlMs = ttlSec * 1000;
          const expectedOffline = elapsedMs > ttlMs;

          // 配对条目恒存(无论在线离线都不删除)。
          const presences = svc.query(USER, INSTANCE);
          expect(presences).toHaveLength(1);
          const state = deviceState(presences, device)!;
          expect(state.online).toBe(!expectedOffline);
          // lastSeen 永远等于最后一次心跳时刻(sweep 不改 lastSeen)。
          expect(state.lastSeen).toBe(BASE);

          // sweep 仅在发生离线翻转时报告变化。
          if (expectedOffline) {
            expect(changed).toHaveLength(1);
            expect(deviceState(changed[0].presences, device)!.online).toBe(false);
          } else {
            expect(changed).toHaveLength(0);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it('Property 9: 任意离线后重连(新心跳)都恢复在线且配对未丢失 (R8.6)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }), // ttlSec
        fc.constantFrom<PresenceDevice>('mobile', 'desktop'),
        fc.integer({ min: 1, max: 50 }), // 重连相对偏移秒(在超时之后)
        (ttlSec, device, reconnectOffsetSec) => {
          jest.setSystemTime(BASE);
          const { svc } = setup();
          svc.report(USER, INSTANCE, device, ttlSec);

          // 超时 → 离线。
          const offlineAt = BASE + ttlSec * 1000 + 1;
          jest.setSystemTime(offlineAt);
          svc.sweep();
          expect(deviceState(svc.query(USER, INSTANCE), device)!.online).toBe(false);
          // 离线后配对条目仍在。
          expect(svc.query(USER, INSTANCE)).toHaveLength(1);

          // 重连:更晚时刻新心跳。
          const reconnectAt = offlineAt + reconnectOffsetSec * 1000;
          jest.setSystemTime(reconnectAt);
          svc.report(USER, INSTANCE, device, ttlSec);

          const state = deviceState(svc.query(USER, INSTANCE), device)!;
          expect(state.online).toBe(true);
          expect(state.lastSeen).toBe(reconnectAt);
        },
      ),
      { numRuns: 20 },
    );
  });
});
