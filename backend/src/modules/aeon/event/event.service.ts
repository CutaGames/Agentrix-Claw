import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AeonEvent } from '../entities/aeon-event.entity';
import { AeonEventRsvp } from '../entities/aeon-event-rsvp.entity';
import { RoomPresenceService } from '../realtime/room-presence.service';
import {
  AEON_EVENTS,
  aeonEventRoomId,
  type AeonEventDto,
  type AeonEventCreateInput,
  type AeonEventKind,
  type AeonEventStatus,
} from '../../../../../shared/types/aeon-world';

/**
 * EventService — 现场活动/演出排期(社交场所 Step 3 / Stage 调度层)。
 *
 * 职责:活动 CRUD、预约(RSVP)、派生状态(scheduled/live/ended/cancelled)、列出
 * 即将开始/进行中的活动。每场活动派生一个独立实时舞台房间 `aeon-live-<id>`,因此
 * 多场活动天然并行(parallel halls)——StageService 以前缀 `aeon-live-` 识别为舞台房间。
 *
 * 实时在场人数由 RoomPresenceService 提供(进行中活动展示热度)。
 */
@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @InjectRepository(AeonEvent)
    private readonly eventRepo: Repository<AeonEvent>,
    @InjectRepository(AeonEventRsvp)
    private readonly rsvpRepo: Repository<AeonEventRsvp>,
    private readonly presence: RoomPresenceService,
  ) {}

  /** 派生展示状态:cancelled > live(开演前 10min ~ 结束/开演后 1h)> ended > scheduled。 */
  private statusOf(e: AeonEvent, now = Date.now()): AeonEventStatus {
    if (e.cancelled) return 'cancelled';
    const start = e.startsAt.getTime();
    const end = e.endsAt ? e.endsAt.getTime() : start + AEON_EVENTS.GRACE_LIVE_AFTER_MS;
    if (now < start - AEON_EVENTS.GRACE_LIVE_BEFORE_MS) return 'scheduled';
    if (now > end) return 'ended';
    return 'live';
  }

  private toDto(e: AeonEvent, extra?: { rsvpCount?: number; rsvpedByMe?: boolean; liveCount?: number }): AeonEventDto {
    const roomId = aeonEventRoomId(e.id);
    return {
      id: e.id,
      epoch: e.epoch as any,
      kind: e.kind as AeonEventKind,
      title: e.title,
      description: e.description,
      hostUserId: e.hostUserId,
      hostName: e.hostName,
      startsAt: e.startsAt.getTime(),
      endsAt: e.endsAt ? e.endsAt.getTime() : null,
      plotId: e.plotId,
      buildItemId: e.buildItemId,
      coverUrl: e.coverUrl,
      status: this.statusOf(e),
      roomId,
      rsvpCount: extra?.rsvpCount ?? 0,
      rsvpedByMe: extra?.rsvpedByMe,
      liveCount: extra?.liveCount ?? this.presence.occupancy(roomId),
      createdAt: e.createdAt.getTime(),
    };
  }

  /** 创建活动(任何登录用户都可办;创建者即主办方/host)。 */
  async create(userId: string, hostName: string, input: AeonEventCreateInput): Promise<AeonEventDto> {
    if (!input?.title?.trim()) throw new BadRequestException('活动标题必填');
    if (!Number.isFinite(input.startsAt)) throw new BadRequestException('开始时间无效');
    const start = new Date(input.startsAt);
    const end = input.endsAt ? new Date(input.endsAt) : null;
    if (end && end.getTime() <= start.getTime()) {
      throw new BadRequestException('结束时间需晚于开始时间');
    }
    const ev = this.eventRepo.create({
      epoch: 'earth',
      kind: input.kind ?? 'talk_show',
      title: input.title.trim().slice(0, 80),
      description: (input.description ?? '').slice(0, 500),
      hostUserId: userId,
      hostName: hostName?.slice(0, 64) || '主办方',
      startsAt: start,
      endsAt: end,
      plotId: input.plotId ?? null,
      buildItemId: input.buildItemId ?? null,
      coverUrl: input.coverUrl ?? null,
      cancelled: false,
    });
    const saved = await this.eventRepo.save(ev);
    this.logger.log(`Aeon event created: ${saved.id} "${saved.title}" by ${userId}`);
    return this.toDto(saved, { rsvpCount: 0, rsvpedByMe: false });
  }

  /** 列出即将开始/进行中的活动(默认时间窗内,未取消),按开始时间升序。 */
  async listUpcoming(viewerUserId?: string, plotId?: string): Promise<AeonEventDto[]> {
    const now = Date.now();
    const from = new Date(now - AEON_EVENTS.GRACE_LIVE_AFTER_MS);
    const to = new Date(now + AEON_EVENTS.UPCOMING_WINDOW_MS);
    const where: any = { cancelled: false, startsAt: Between(from, to) };
    if (plotId) where.plotId = plotId;
    const events = await this.eventRepo.find({ where, order: { startsAt: 'ASC' } });
    return this.decorate(events, viewerUserId);
  }

  /** 列出某地块挂的活动(从地图建筑进场用)。 */
  async listByPlot(plotId: string, viewerUserId?: string): Promise<AeonEventDto[]> {
    const events = await this.eventRepo.find({
      where: { plotId, cancelled: false },
      order: { startsAt: 'ASC' },
    });
    return this.decorate(events, viewerUserId);
  }

  /** 批量填充 rsvpCount / rsvpedByMe。 */
  private async decorate(events: AeonEvent[], viewerUserId?: string): Promise<AeonEventDto[]> {
    if (events.length === 0) return [];
    const ids = events.map((e) => e.id);
    const counts = await this.rsvpRepo
      .createQueryBuilder('r')
      .select('r.event_id', 'eventId')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.event_id IN (:...ids)', { ids })
      .groupBy('r.event_id')
      .getRawMany();
    const countMap = new Map<string, number>(counts.map((c) => [c.eventId, Number(c.cnt)]));
    let mine = new Set<string>();
    if (viewerUserId) {
      const rows = await this.rsvpRepo.find({ where: { userId: viewerUserId } });
      mine = new Set(rows.map((r) => r.eventId));
    }
    return events.map((e) =>
      this.toDto(e, { rsvpCount: countMap.get(e.id) ?? 0, rsvpedByMe: mine.has(e.id) }),
    );
  }

  async get(id: string, viewerUserId?: string): Promise<AeonEventDto> {
    const e = await this.eventRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('活动不存在');
    const rsvpCount = await this.rsvpRepo.count({ where: { eventId: id } });
    const rsvpedByMe = viewerUserId
      ? (await this.rsvpRepo.count({ where: { eventId: id, userId: viewerUserId } })) > 0
      : undefined;
    return this.toDto(e, { rsvpCount, rsvpedByMe });
  }

  /** 预约/取消预约(幂等切换)。返回最新 rsvp 状态 + 人数。 */
  async toggleRsvp(
    eventId: string,
    userId: string,
    userName: string,
  ): Promise<{ rsvped: boolean; rsvpCount: number }> {
    const e = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!e) throw new NotFoundException('活动不存在');
    const existing = await this.rsvpRepo.findOne({ where: { eventId, userId } });
    if (existing) {
      await this.rsvpRepo.remove(existing);
    } else {
      await this.rsvpRepo.save(
        this.rsvpRepo.create({ eventId, userId, userName: userName?.slice(0, 64) || '居民' }),
      );
    }
    const rsvpCount = await this.rsvpRepo.count({ where: { eventId } });
    return { rsvped: !existing, rsvpCount };
  }

  /** 主办方取消活动。 */
  async cancel(id: string, userId: string): Promise<AeonEventDto> {
    const e = await this.eventRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('活动不存在');
    if (e.hostUserId !== userId) throw new ForbiddenException('只有主办方可取消活动');
    e.cancelled = true;
    await this.eventRepo.save(e);
    return this.toDto(e);
  }
}
