import { Injectable, Logger } from '@nestjs/common';
import { haversineMeters, AEON_GEO, type AeonNearbyPerson } from '../../../../../shared/types/aeon-world';

interface GeoPing {
  userId: string;
  displayName: string;
  clan?: string;
  lat: number;
  lng: number;
  ts: number;
  plotId?: string | null;
}

/**
 * GeoPresenceService — "附近的人"实时位置(在场玩家按 GPS 聚合,不只地块)。
 *
 * 纯内存(同 RoomPresenceService 理念:高频低风险位置不落库)。客户端节流上报当前 GPS,
 * 服务器保留 PRESENCE_TTL_MS 窗口;查询某点附近时返回 TTL 内、半径内的其他玩家。
 * 重启即清空(可接受;位置是瞬时态)。多实例需 Redis fan-out(后续)。
 */
@Injectable()
export class GeoPresenceService {
  private readonly logger = new Logger(GeoPresenceService.name);
  /** userId -> 最近一次 GPS ping。 */
  private readonly pings = new Map<string, GeoPing>();

  /** 上报我的当前位置(节流由客户端控制)。 */
  report(userId: string, displayName: string, lat: number, lng: number, opts: { clan?: string; plotId?: string | null } = {}): void {
    this.pings.set(userId, {
      userId,
      displayName,
      clan: opts.clan,
      lat,
      lng,
      ts: Date.now(),
      plotId: opts.plotId ?? null,
    });
  }

  /** 主动下线(退出地图/登出)。 */
  clear(userId: string): void {
    this.pings.delete(userId);
  }

  /** 查询某点附近的人(排除自己,排除过期)。 */
  nearby(userId: string, lat: number, lng: number, radiusM: number): AeonNearbyPerson[] {
    const now = Date.now();
    const r = Math.min(Math.max(radiusM, 100), AEON_GEO.NEARBY_MAX_RADIUS_M);
    const out: AeonNearbyPerson[] = [];
    for (const p of this.pings.values()) {
      if (p.userId === userId) continue;
      if (now - p.ts > AEON_GEO.PRESENCE_TTL_MS) continue;
      const d = haversineMeters(lat, lng, p.lat, p.lng);
      if (d > r) continue;
      out.push({
        userId: p.userId,
        displayName: p.displayName,
        clan: p.clan,
        distanceM: Math.round(d),
        lastSeen: p.ts,
        plotId: p.plotId,
      });
    }
    out.sort((a, b) => a.distanceM - b.distanceM);
    return out.slice(0, AEON_GEO.NEARBY_LIMIT);
  }

  /** 周期清理过期 ping(网关/定时调用)。 */
  sweep(): number {
    const now = Date.now();
    let removed = 0;
    for (const [uid, p] of this.pings.entries()) {
      if (now - p.ts > AEON_GEO.PRESENCE_TTL_MS) {
        this.pings.delete(uid);
        removed++;
      }
    }
    return removed;
  }
}
