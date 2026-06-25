import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { AeonPlot } from '../entities/aeon-plot.entity';
import { AeonRoom } from '../entities/aeon-room.entity';
import { AeonPlotCheckin } from '../entities/aeon-plot-checkin.entity';
import { EpochService } from '../epoch/epoch.service';
import { RealityLoopService } from '../reality/reality-loop.service';
import { GeoPresenceService } from './geo-presence.service';
import {
  toGridCell,
  haversineMeters,
  AEON_WORLD,
  AEON_GEO,
  AEON_ACTIVE_EPOCH,
  type AeonEpoch,
  type AeonPlotDto,
  type AeonPlotMarker,
  type AeonNearbyPlot,
  type AeonCheckinResult,
  type AeonNearbyPerson,
  type AeonCheckinLeaderEntry,
} from '../../../../../shared/types/aeon-world';

/**
 * PlotService — 地块圈定/唯一性/休眠回收(Task 1.2 / R4)+ 地理社交(附近/签到/连续/排行/附近的人)。
 */
@Injectable()
export class PlotService {
  private readonly logger = new Logger(PlotService.name);

  constructor(
    @InjectRepository(AeonPlot)
    private readonly plotRepo: Repository<AeonPlot>,
    @InjectRepository(AeonRoom)
    private readonly roomRepo: Repository<AeonRoom>,
    @InjectRepository(AeonPlotCheckin)
    private readonly checkinRepo: Repository<AeonPlotCheckin>,
    private readonly epoch: EpochService,
    private readonly reality: RealityLoopService,
    private readonly geoPresence: GeoPresenceService,
  ) {}

  /**
   * 圈地:把 (lat,lng) 量化到网格,校验纪元可进入 + 格子唯一,创建 Plot(R4.2/4.3)。
   * 已占用 → 409。未发布纪元 → 400(由 epoch.assertEnterable)。
   */
  async claim(
    ownerUserId: string,
    lat: number,
    lng: number,
    opts: { epoch?: AeonEpoch; displayName?: string } = {},
  ): Promise<AeonPlotDto> {
    const epoch = opts.epoch ?? AEON_ACTIVE_EPOCH;
    this.epoch.assertEnterable(epoch);

    const gridCell = toGridCell(lat, lng);

    // 先查重(友好提示);唯一约束兜底防并发竞态。
    const existing = await this.plotRepo.findOne({ where: { epoch, gridCell } });
    if (existing) {
      throw new ConflictException('该位置已被占用,请选择其它地点');
    }

    const plot = this.plotRepo.create({
      ownerUserId,
      epoch,
      lat,
      lng,
      gridCell,
      status: 'active',
      displayName: opts.displayName ?? '我的领地',
      lastActivityAt: String(Date.now()),
    });

    try {
      const saved = await this.plotRepo.save(plot);
      this.logger.log(`Plot claimed: ${saved.id} by ${ownerUserId} @ ${gridCell} (${epoch})`);
      // 圈地即自带一个默认广场房间,保证"进入领地就有得玩"(否则场景空转无房间)。
      await this.ensureDefaultRoom(saved.id, epoch, opts.displayName);
      return this.toDto(saved);
    } catch (err) {
      // 并发下唯一约束冲突 → 409
      if (err instanceof QueryFailedError && /unique|duplicate/i.test(err.message)) {
        throw new ConflictException('该位置已被占用,请选择其它地点');
      }
      throw err;
    }
  }

  /**
   * 确保地块有一个默认广场房间(R5)。圈地时调用,使"进入领地"立刻有可进入的场景。
   * 已有房间则跳过(幂等)。
   */
  async ensureDefaultRoom(plotId: string, epoch: AeonEpoch, plotName?: string): Promise<AeonRoom> {
    const existing = await this.roomRepo.findOne({ where: { plotId } });
    if (existing) return existing;
    const room = this.roomRepo.create({
      plotId,
      orgId: null,
      epoch,
      kind: 'public',
      capacity: AEON_WORLD.DEFAULT_ROOM_CAPACITY,
      displayName: plotName ? `${plotName} · 广场` : '中央广场',
      config: { primitives: ['social', 'build'], autoCreated: true },
    });
    const saved = await this.roomRepo.save(room);
    this.logger.log(`Default room ${saved.id} auto-created for plot ${plotId}`);
    return saved;
  }

  /** 列出某纪元已圈地块作为地图 markers(R4.5)。 */
  async listMarkers(epoch: AeonEpoch = AEON_ACTIVE_EPOCH): Promise<AeonPlotMarker[]> {
    const plots = await this.plotRepo.find({ where: { epoch } });
    if (plots.length === 0) return [];
    const nameById = await this.ownerNames(plots.map((p) => p.ownerUserId));
    return plots.map((p) => ({
      id: p.id,
      ownerUserId: p.ownerUserId,
      ownerName: nameById.get(p.ownerUserId) || '匿名居民',
      lat: p.lat,
      lng: p.lng,
      displayName: p.displayName,
      status: p.status as AeonPlotMarker['status'],
      poiName: (p.poi as any)?.name ?? null,
      poiCategory: (p.poi as any)?.category ?? null,
    }));
  }

  /** 取单个地块。 */
  async getById(id: string): Promise<AeonPlotDto> {
    const plot = await this.plotRepo.findOne({ where: { id } });
    if (!plot) throw new NotFoundException('地块不存在');
    return this.toDto(plot);
  }

  /**
   * 附近的地块(基于实时 GPS 的地理社交):返回半径内地块,按距离升序,带距离 + 是否自己的。
   * 用网格预筛(lat/lng 边界框)+ Haversine 精算,避免全表 Haversine。
   */
  async findNearby(
    userId: string,
    lat: number,
    lng: number,
    radiusM: number = AEON_GEO.NEARBY_DEFAULT_RADIUS_M,
    epoch: AeonEpoch = AEON_ACTIVE_EPOCH,
  ): Promise<AeonNearbyPlot[]> {
    const r = Math.min(Math.max(radiusM, 100), AEON_GEO.NEARBY_MAX_RADIUS_M);
    // 经纬度边界框预筛(1 纬度≈111km;经度按纬度收缩)。
    const dLat = r / 111000;
    const dLng = r / (111000 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
    const rows = await this.plotRepo
      .createQueryBuilder('p')
      .where('p.epoch = :epoch', { epoch })
      .andWhere('p.lat BETWEEN :latMin AND :latMax', { latMin: lat - dLat, latMax: lat + dLat })
      .andWhere('p.lng BETWEEN :lngMin AND :lngMax', { lngMin: lng - dLng, lngMax: lng + dLng })
      .limit(500)
      .getMany();

    const nameById = await this.ownerNames(rows.map((p) => p.ownerUserId));
    const withDist = rows
      .map((p) => ({
        id: p.id,
        ownerUserId: p.ownerUserId,
        ownerName: nameById.get(p.ownerUserId) || '匿名居民',
        lat: p.lat,
        lng: p.lng,
        displayName: p.displayName,
        status: p.status as AeonPlotMarker['status'],
        poiName: (p.poi as any)?.name ?? null,
        poiCategory: (p.poi as any)?.category ?? null,
        distanceM: Math.round(haversineMeters(lat, lng, p.lat, p.lng)),
        mine: p.ownerUserId === userId,
      }))
      .filter((p) => p.distanceM <= r)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, AEON_GEO.NEARBY_LIMIT);
    return withDist;
  }

  /**
   * 地理签到(到访真实地点的领地 → 奖励 AXP)。校验实测坐标在地块 CHECKIN_RADIUS_M 内,
   * 每地块每用户每天一次。奖励经 RealityLoopService 出金到全局钱包(aeon_reality_reward)。
   */
  async checkIn(userId: string, plotId: string, lat: number, lng: number): Promise<AeonCheckinResult> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    const dist = haversineMeters(lat, lng, plot.lat, plot.lng);
    if (dist > AEON_GEO.CHECKIN_RADIUS_M) {
      throw new BadRequestException(`离这块地还有 ${Math.round(dist)} 米,走近到 ${AEON_GEO.CHECKIN_RADIUS_M} 米内才能签到`);
    }
    const day = new Date().toISOString().slice(0, 10);
    const existing = await this.checkinRepo.findOne({ where: { plotId, userId, day } });
    if (existing) {
      return {
        ok: true,
        plotId,
        rewardAxp: 0,
        alreadyCheckedInToday: true,
        bridged: false,
        message: '今天已经在这里签到过啦,明天再来。',
      };
    }
    const reward = AEON_GEO.CHECKIN_REWARD_AXP;
    // 连续签到加成:基于该用户全局签到日(不限本地块)算连续天数;每多一天 +STREAK_BONUS_PER_DAY,封顶。
    const streakDays = await this.computeStreakDays(userId, day);
    const streakBonus = Math.min(
      AEON_GEO.STREAK_BONUS_CAP,
      Math.max(0, streakDays - 1) * AEON_GEO.STREAK_BONUS_PER_DAY,
    );
    const total = reward + streakBonus;
    await this.checkinRepo.save(
      this.checkinRepo.create({ plotId, userId, day, lat, lng, rewardAxp: total }),
    );
    const credit = await this.reality.creditWallet(userId, total, 'aeon_reality_reward', `checkin-${plotId}-${day}`);
    return {
      ok: true,
      plotId,
      rewardAxp: total,
      alreadyCheckedInToday: false,
      bridged: credit.bridged,
      balance: credit.balance,
      streakDays,
      message:
        streakBonus > 0
          ? `📍 在「${plot.displayName}」签到成功!连续 ${streakDays} 天,赚得 ${reward}+${streakBonus} = ${total} AXP!`
          : `📍 在「${plot.displayName}」签到成功,赚得 ${total} AXP!`,
    };
  }

  /**
   * 计算用户截至 today 的连续签到天数(任意地块的签到都算"今天到过")。
   * 从 today 往前逐日检查是否有签到记录,断了即停。最多回看 60 天。
   */
  private async computeStreakDays(userId: string, today: string): Promise<number> {
    const rows = await this.checkinRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.day', 'day')
      .where('c.user_id = :userId', { userId })
      .orderBy('c.day', 'DESC')
      .limit(70)
      .getRawMany();
    const daysSet = new Set<string>(rows.map((r) => r.day));
    daysSet.add(today); // 本次签到当天
    let streak = 0;
    const cursor = new Date(`${today}T00:00:00Z`);
    for (let i = 0; i < 60; i++) {
      const d = cursor.toISOString().slice(0, 10);
      if (daysSet.has(d)) {
        streak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  /** 签到打卡排行(近 N 天)。按签到次数降序;附 distinctPlots + 当前连续天数。 */
  async checkinLeaderboard(days = 30, limit = 20): Promise<AeonCheckinLeaderEntry[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows: Array<{ user_id: string; checkins: string; distinct_plots: string }> =
      await this.checkinRepo
        .createQueryBuilder('c')
        .select('c.user_id', 'user_id')
        .addSelect('COUNT(*)', 'checkins')
        .addSelect('COUNT(DISTINCT c.plot_id)', 'distinct_plots')
        .where('c.day >= :since', { since })
        .groupBy('c.user_id')
        .orderBy('checkins', 'DESC')
        .limit(limit)
        .getRawMany();
    if (rows.length === 0) return [];
    const nameById = await this.ownerNames(rows.map((r) => r.user_id));
    const today = new Date().toISOString().slice(0, 10);
    const out: AeonCheckinLeaderEntry[] = [];
    for (const r of rows) {
      out.push({
        userId: r.user_id,
        displayName: nameById.get(r.user_id) || '匿名居民',
        checkins: Number(r.checkins),
        distinctPlots: Number(r.distinct_plots),
        streakDays: await this.computeStreakDays(r.user_id, today),
      });
    }
    return out;
  }

  // ── 附近的人(在场玩家按 GPS 聚合)──────────────────────────────
  /** 上报我的实时位置 + 返回附近的人(一次往返完成"上报+查询")。 */
  reportAndFindPeople(
    userId: string,
    displayName: string,
    lat: number,
    lng: number,
    radiusM: number,
    opts: { clan?: string; plotId?: string | null } = {},
  ): AeonNearbyPerson[] {
    this.geoPresence.report(userId, displayName, lat, lng, opts);
    return this.geoPresence.nearby(userId, lat, lng, radiusM);
  }

  /** 主动下线(退出地图)。 */
  clearPresence(userId: string): void {
    this.geoPresence.clear(userId);
  }

  /**
   * 商家入驻:把自己的地块绑定一个真实 POI(店名/类目/地址/门店入口)。仅地块 owner。
   * verified 由后续 KYC/营业执照审核置位;此处先记录绑定(MVP)。
   */
  async bindPoi(
    plotId: string,
    ownerUserId: string,
    poi: {
      name: string;
      category?: string;
      externalPoiId?: string | null;
      storeUrl?: string | null;
      address?: string | null;
    },
  ): Promise<AeonPlotDto> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    if (plot.ownerUserId !== ownerUserId) throw new ForbiddenException('只有地块 owner 可入驻商家');
    if (!poi?.name?.trim()) throw new BadRequestException('店名必填');
    plot.poi = {
      name: poi.name.trim().slice(0, 64),
      category: poi.category || 'other',
      externalPoiId: poi.externalPoiId ?? null,
      merchantUserId: ownerUserId,
      verified: false,
      storeUrl: poi.storeUrl ?? null,
      address: poi.address ?? null,
    };
    await this.plotRepo.save(plot);
    this.logger.log(`Plot ${plotId} bound POI "${poi.name}" by ${ownerUserId}`);
    return this.toDto(plot);
  }

  /** 批量取地主昵称(复用在 listMarkers / findNearby)。 */
  private async ownerNames(ownerIds: string[]): Promise<Map<string, string>> {
    const nameById = new Map<string, string>();
    const ids = Array.from(new Set(ownerIds));
    if (ids.length === 0) return nameById;
    try {
      const rows: Array<{ id: string; nickname: string | null; paymind_id: string | null }> =
        await this.plotRepo.manager.query(
          `SELECT id, nickname, paymind_id FROM users WHERE id = ANY($1)`,
          [ids],
        );
      for (const r of rows) nameById.set(r.id, r.nickname || r.paymind_id || '匿名居民');
    } catch (e) {
      this.logger.warn(`ownerNames lookup failed: ${(e as Error).message}`);
    }
    return nameById;
  }

  /** 列出某用户的地块。 */
  async listMine(ownerUserId: string): Promise<AeonPlotDto[]> {
    const plots = await this.plotRepo.find({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
    return plots.map((p) => this.toDto(p));
  }

  /** 进入地块时刷新活动时间(防被休眠回收);非 owner 拜访不刷新。 */
  async touchActivity(id: string, userId: string): Promise<void> {
    const plot = await this.plotRepo.findOne({ where: { id } });
    if (!plot) throw new NotFoundException('地块不存在');
    if (plot.ownerUserId !== userId) return;
    plot.lastActivityAt = String(Date.now());
    if (plot.status === 'dormant') plot.status = 'active';
    await this.plotRepo.save(plot);
    // 兜底:老地块(本次修复前圈的)可能没有房间,owner 进入时补一个,保证有得玩。
    await this.ensureDefaultRoom(plot.id, plot.epoch as AeonEpoch, plot.displayName);
  }

  /**
   * 休眠扫描:超过保留期无活动 → 标记 dormant(R4.6)。
   * 真正回收(释放格子)需 owner 通知后另行执行,这里只做标记。
   */
  async markDormant(now = Date.now()): Promise<number> {
    const threshold = now - AEON_WORLD.PLOT_DORMANT_MS;
    const candidates = await this.plotRepo
      .createQueryBuilder('p')
      .where('p.status = :active', { active: 'active' })
      .andWhere('p.last_activity_at IS NOT NULL')
      .andWhere('CAST(p.last_activity_at AS BIGINT) < :threshold', { threshold })
      .getMany();
    for (const p of candidates) {
      p.status = 'dormant';
    }
    if (candidates.length) await this.plotRepo.save(candidates);
    return candidates.length;
  }

  private toDto(p: AeonPlot): AeonPlotDto {
    return {
      id: p.id,
      ownerUserId: p.ownerUserId,
      epoch: p.epoch as AeonEpoch,
      lat: p.lat,
      lng: p.lng,
      gridCell: p.gridCell,
      status: p.status as AeonPlotDto['status'],
      displayName: p.displayName,
      lastActivityAt: p.lastActivityAt ? Number(p.lastActivityAt) : 0,
      createdAt: p.createdAt.getTime(),
      poi: (p.poi as any) ?? null,
    };
  }
}
