import { Injectable } from '@nestjs/common';
import { MAP_PRESENCE_REFRESH_MS } from '../../../../shared/types/world-creation';

/**
 * Map_Presence 轻状态在场同步 (design §1.1 状态分层, R1.2)。
 *
 * 外层 World_Map 只承载 MMO-lite 「轻状态」：谁在哪个坐标 / 谁在哪个 Plot。
 * 这是高频低风险写，刷新间隔 ≤ {@link MAP_PRESENCE_REFRESH_MS}ms (R1.2)，
 * 心跳超时即自然过期 (TTL 数秒)，无需落库。
 *
 * 仓库现状：`CacheService` 当前为 memory-only (ioredis 被注释)，且既有
 * `presence/`、`quota`、`rate-limiter` 等服务一致采用「内存 TTL map，生产换 Redis」
 * 的先例。为保持一致 **且可单测**，本模块把 presence 读写收敛到一个 **可注入接口**
 * {@link MapPresenceStore} 后面，默认实现为内存 TTL map ({@link InMemoryMapPresenceStore})；
 * 多实例 fan-out 落地时只需提供一个 ioredis 实现并替换 provider，调用方无感。
 */

/** 注入令牌：MapPresenceStore 的 DI 句柄。 */
export const MAP_PRESENCE_STORE = Symbol('MAP_PRESENCE_STORE');

/** Presence 轻状态写入负载 (仅坐标 / 所在 Plot，不含任何重交互状态)。 */
export interface PresenceWrite {
  userId: string;
  displayName: string;
  /** 连续地图坐标。 */
  x: number;
  y: number;
  /** 当前所在 Plot (进入内层时)，未进入为 null。 */
  inPlotId?: string | null;
}

/** Presence 存储的一条活跃记录。 */
export interface PresenceRecord extends PresenceWrite {
  /** 过期 epoch ms (lastSeen + ttl)；读取时惰性判活。 */
  expiresAt: number;
}

/** 视口窗口 (闭区间)。 */
export interface ViewportBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Presence 存储接口 — 写自己的轻状态、读他人 (可按视口过滤)。
 * 默认内存实现见 {@link InMemoryMapPresenceStore}；生产可替换为 ioredis 实现。
 */
export interface MapPresenceStore {
  /** 写入 / 刷新某用户的轻状态，并续期 TTL。 */
  set(write: PresenceWrite, ttlMs: number): Promise<void>;
  /** 读取某用户的活跃 presence；已过期或不存在返回 null。 */
  get(userId: string): Promise<PresenceRecord | null>;
  /** 列出全部活跃 presence (可排除某用户)。 */
  list(excludeUserId?: string): Promise<PresenceRecord[]>;
  /** 列出落在视口内的活跃 presence (可排除某用户)。 */
  listInViewport(box: ViewportBox, excludeUserId?: string): Promise<PresenceRecord[]>;
}

/**
 * presence TTL：取刷新间隔的 3 倍 (~6s)，确保短暂丢一两次心跳的用户仍短时可见，
 * 长时间离线后自然消失 (design §1.1「最终一致」)。
 */
export const MAP_PRESENCE_TTL_MS = MAP_PRESENCE_REFRESH_MS * 3;

/**
 * 内存 TTL map 实现 (单实例 MVP)。惰性过期 + 按需 sweep，无后台计时器，
 * 保持可单测、可独立编译。多实例部署时替换为 ioredis 实现 (key: `wc:presence:{userId}`，
 * `SET ... PX ttl` + `SCAN`)。
 */
@Injectable()
export class InMemoryMapPresenceStore implements MapPresenceStore {
  private readonly entries = new Map<string, PresenceRecord>();

  async set(write: PresenceWrite, ttlMs: number): Promise<void> {
    this.entries.set(write.userId, {
      userId: write.userId,
      displayName: write.displayName,
      x: write.x,
      y: write.y,
      inPlotId: write.inPlotId ?? null,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
  }

  async get(userId: string): Promise<PresenceRecord | null> {
    const rec = this.entries.get(userId);
    if (!rec) return null;
    if (this.isExpired(rec)) {
      this.entries.delete(userId);
      return null;
    }
    return rec;
  }

  async list(excludeUserId?: string): Promise<PresenceRecord[]> {
    return this.liveRecords().filter((r) => r.userId !== excludeUserId);
  }

  async listInViewport(box: ViewportBox, excludeUserId?: string): Promise<PresenceRecord[]> {
    const minX = Math.min(box.minX, box.maxX);
    const maxX = Math.max(box.minX, box.maxX);
    const minY = Math.min(box.minY, box.maxY);
    const maxY = Math.max(box.minY, box.maxY);
    return this.liveRecords().filter(
      (r) =>
        r.userId !== excludeUserId &&
        r.x >= minX &&
        r.x <= maxX &&
        r.y >= minY &&
        r.y <= maxY,
    );
  }

  /** 测试 / 诊断：清空全部 presence。 */
  reset(): void {
    this.entries.clear();
  }

  /** 返回全部仍存活的记录，并顺带 sweep 掉过期项。 */
  private liveRecords(): PresenceRecord[] {
    const now = Date.now();
    const out: PresenceRecord[] = [];
    for (const [userId, rec] of this.entries.entries()) {
      if (rec.expiresAt <= now) {
        this.entries.delete(userId);
        continue;
      }
      out.push(rec);
    }
    // 稳定顺序，便于 UI 与测试断言。
    out.sort((a, b) => a.userId.localeCompare(b.userId));
    return out;
  }

  private isExpired(rec: PresenceRecord): boolean {
    return rec.expiresAt <= Date.now();
  }
}
