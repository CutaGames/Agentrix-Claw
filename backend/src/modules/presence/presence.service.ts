import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

/**
 * Cross-Device Presence(跨端 presence)— 净新建,设计 §7.1 / Requirement 8。
 *
 * 沿用 `aeon/plot/geo-presence.service.ts` 与 `aeon/realtime/room-presence.service.ts`
 * 的「内存 TTL map」先例:实时在线态是高频低风险写,首选放内存,重启即由心跳自然重建,
 * 不落库(design Data Models:MVP 优先内存 TTL map)。多实例 fan-out 需 Redis(后续)。
 *
 * 职责(本服务仅聚焦内存 presence 逻辑 + sweep):
 *   - report():心跳上报,刷新某实例某端的 lastSeen / online;offline→online 跃迁时推送(R8.1/R8.2)
 *   - query():返回某实例各端在线列表 + lastSeen(供设备列表展示,R8.5)
 *   - sweep():定时(每 5s)扫描,心跳超 ttl 即「立即」标离线并推送,不删配对(R8.3/R8.6)
 *
 * WS 推送的真正接线由 task 2.2 完成:本服务只暴露一个 push-handler 注入缝
 * (`registerPushHandler`),由 openclaw WS 网关在启动时注册广播回调,
 * 从而把 `presence:update` 推给相关在线端(5s 内同步,R8.4)。本服务不直接依赖任何网关,
 * 保持可单测、可独立编译。
 */

/** 终端类型(移动 / 桌面),设计 §7.1。 */
export type PresenceDevice = 'mobile' | 'desktop';

/**
 * 某实例单个终端的对外在线视图。设计 §7.1:`{ device, online, lastSeen }`。
 *
 * NOTE(task 2.3):跨端(移动/桌面)共享时,本类型应迁移到 `shared/types/`
 * (design Data Models:≥2 端使用按 AGENTS.md 落 shared/types)。届时把此处改为
 * 从 shared 导入,客户端封装与后端共用同一定义。当前先就地定义以使本服务独立编译。
 */
export interface DevicePresence {
  device: PresenceDevice;
  /** 是否在线(已计入 ttl:即使 sweep 尚未跑,读取也即时反映超时离线)。 */
  online: boolean;
  /** 最近一次心跳的 epoch 毫秒。 */
  lastSeen: number;
}

/** 推送负载:某实例当前各端在线快照。 */
export interface PresenceUpdate {
  userId: string;
  instanceId: string;
  presences: DevicePresence[];
}

/**
 * push-handler 注入缝。task 2.2 的 WS 网关注册一个回调,
 * 在 presence 发生变化时把快照广播给相关在线端。
 */
export type PresencePushHandler = (update: PresenceUpdate) => void;

/** 单个终端的内存条目。 */
interface PresenceEntry {
  userId: string;
  /** 最近心跳 epoch ms。 */
  lastSeen: number;
  /** 由 sweep 维护的离线标志;读取时还会叠加 ttl 实时判定。 */
  online: boolean;
  /** 该端心跳允许的最大间隔(毫秒),由 report 写入。 */
  ttlMs: number;
}

const DEFAULT_TTL_SEC = 30;
/** sweep 周期:每 5s 扫描一次(R8.4「5 秒内同步」的服务侧节拍)。 */
const SWEEP_INTERVAL_MS = 5_000;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  /** instanceId -> (device -> entry)。一个实例归属单一用户,各端共享在线态。 */
  private readonly instances = new Map<string, Map<PresenceDevice, PresenceEntry>>();

  /** WS 推送回调(由 task 2.2 注册);未注册时静默不推送,服务逻辑仍可运行。 */
  private pushHandler: PresencePushHandler | null = null;

  /**
   * 注册跨端推送回调(task 2.2:openclaw WS 网关启动时调用)。
   * 注入缝设计:本服务不 import 任何网关,避免环依赖且保持可单测。
   */
  registerPushHandler(handler: PresencePushHandler): void {
    this.pushHandler = handler;
  }

  /**
   * 心跳上报(R8.1/R8.2/R8.3)。刷新该实例该端的 lastSeen 并置在线;
   * 当且仅当该端「此前不在线(从未上报或已超时)」时,视为 offline→online 跃迁并推送,
   * 让该实例其它在线端立即看到此端上线。重复心跳(已在线)不重复推送,避免刷屏。
   */
  report(userId: string, instanceId: string, device: PresenceDevice, ttlSec = DEFAULT_TTL_SEC): void {
    const now = Date.now();
    let ends = this.instances.get(instanceId);
    if (!ends) {
      ends = new Map<PresenceDevice, PresenceEntry>();
      this.instances.set(instanceId, ends);
    }
    const prev = ends.get(device);
    const wasOnline = prev ? this.isLive(prev, now) : false;
    ends.set(device, {
      userId,
      lastSeen: now,
      online: true,
      ttlMs: Math.max(1, ttlSec) * 1000,
    });
    if (!wasOnline) {
      // offline→online(含首次上报)→ 推送当前快照给相关端(R8.1/R8.2)。
      this.emit(userId, instanceId);
    }
  }

  /**
   * 查询某实例各端在线状态 + lastSeen(R8.5)。
   * 读取即时叠加 ttl 判定:即便 sweep 尚未跑到,超时端也立即呈现为离线(R8.6)。
   * 不修改任何状态(只读);离线状态的权威翻转 + 推送由 sweep 负责。
   */
  query(_userId: string, instanceId: string): DevicePresence[] {
    const now = Date.now();
    const ends = this.instances.get(instanceId);
    if (!ends) return [];
    const out: DevicePresence[] = [];
    for (const [device, entry] of ends.entries()) {
      out.push({ device, online: this.isLive(entry, now), lastSeen: entry.lastSeen });
    }
    // 稳定顺序,便于 UI 与测试断言。
    out.sort((a, b) => a.device.localeCompare(b.device));
    return out;
  }

  /**
   * 定时 sweep(每 5s)。心跳超过该端 ttl 即「立即」标记离线并推送,
   * 与该端是否正在尝试重连无关(R8.6);**不删除条目**,即配对关系保留,
   * 重连成功后 report 会把它重新置为在线。
   *
   * 返回发生变化的实例更新列表,便于直接调用方(网关/测试)观察。
   */
  @Interval(SWEEP_INTERVAL_MS)
  sweep(): PresenceUpdate[] {
    const now = Date.now();
    const updates: PresenceUpdate[] = [];
    for (const [instanceId, ends] of this.instances.entries()) {
      let changed = false;
      let userId = '';
      for (const entry of ends.values()) {
        userId = entry.userId;
        if (entry.online && now - entry.lastSeen > entry.ttlMs) {
          entry.online = false; // 立即离线,保留配对(不 delete)
          changed = true;
        }
      }
      if (changed) {
        const update: PresenceUpdate = {
          userId,
          instanceId,
          presences: this.query(userId, instanceId),
        };
        updates.push(update);
        this.dispatch(update);
      }
    }
    return updates;
  }

  /** 测试/诊断用:清空全部内存态。 */
  reset(): void {
    this.instances.clear();
  }

  /** 实时在线判定:既看 sweep 维护的 online,也叠加 ttl,确保读取即时反映超时。 */
  private isLive(entry: PresenceEntry, now: number): boolean {
    return entry.online && now - entry.lastSeen <= entry.ttlMs;
  }

  /** 组装并下发某实例当前快照。 */
  private emit(userId: string, instanceId: string): void {
    this.dispatch({ userId, instanceId, presences: this.query(userId, instanceId) });
  }

  /** 通过注入的 push-handler 下发(未注册则静默)。回调异常不影响 presence 逻辑。 */
  private dispatch(update: PresenceUpdate): void {
    if (!this.pushHandler) return;
    try {
      this.pushHandler(update);
    } catch (err) {
      this.logger.warn(`presence push handler failed for instance ${update.instanceId}: ${(err as Error)?.message}`);
    }
  }
}
