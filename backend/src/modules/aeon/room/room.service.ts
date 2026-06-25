import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AeonRoom } from '../entities/aeon-room.entity';
import { AeonPlot } from '../entities/aeon-plot.entity';
import { EpochService } from '../epoch/epoch.service';
import { RoomPresenceService } from '../realtime/room-presence.service';
import {
  AEON_WORLD,
  type AeonEpoch,
  type AeonRoomDto,
  type AeonRoomKind,
} from '../../../../../shared/types/aeon-world';

/**
 * RoomService — 房间引擎(Task 1.4 / R5)。
 *
 * 房间 = 共同在场容器,用途由 kind + config 原语组合声明(不写死场景,R5.3)。
 * 进入房间时对接 RoomPresenceService 取实时在场态(实时轨)或返回空(异步兜底)。
 * 室内静态背景 + 站位由客户端渲染(R5.8),后端只管房间元数据 + 在场态。
 */
@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    @InjectRepository(AeonRoom)
    private readonly roomRepo: Repository<AeonRoom>,
    @InjectRepository(AeonPlot)
    private readonly plotRepo: Repository<AeonPlot>,
    private readonly epoch: EpochService,
    private readonly presence: RoomPresenceService,
  ) {}

  /** 在某地块创建房间(R5.1/5.3)。仅地块 owner 可建(简化:MVP)。 */
  async create(
    userId: string,
    input: {
      plotId: string;
      kind?: AeonRoomKind;
      displayName?: string;
      capacity?: number;
      config?: Record<string, unknown>;
      orgId?: string | null;
    },
  ): Promise<AeonRoomDto> {
    const plot = await this.plotRepo.findOne({ where: { id: input.plotId } });
    if (!plot) throw new NotFoundException('地块不存在');
    this.epoch.assertEnterable(plot.epoch as AeonEpoch);
    if (plot.ownerUserId !== userId) {
      throw new ForbiddenException('只能在自己的地块上建造房间');
    }

    const room = this.roomRepo.create({
      plotId: input.plotId,
      orgId: input.orgId ?? null,
      epoch: plot.epoch,
      kind: input.kind ?? 'public',
      capacity: input.capacity ?? AEON_WORLD.DEFAULT_ROOM_CAPACITY,
      displayName: input.displayName ?? '房间',
      config: input.config ?? null,
    });
    const saved = await this.roomRepo.save(room);
    this.logger.log(`Room created: ${saved.id} (${saved.kind}) on plot ${input.plotId}`);
    return this.toDto(saved);
  }

  /** 列出某地块的房间(R5,进入地块后展示)。 */
  async listByPlot(plotId: string): Promise<AeonRoomDto[]> {
    const rooms = await this.roomRepo.find({ where: { plotId }, order: { createdAt: 'ASC' } });
    return rooms.map((r) => this.toDto(r));
  }

  /** 取房间 + 当前在场态(实时轨;异步兜底时 occupants 可能为空)。 */
  async getWithPresence(id: string): Promise<AeonRoomDto & { occupancy: number; occupants: ReturnType<RoomPresenceService['snapshot']> }> {
    const room = await this.roomRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('房间不存在');
    return {
      ...this.toDto(room),
      occupancy: this.presence.occupancy(id),
      occupants: this.presence.snapshot(id),
    };
  }

  /** 容量校验:进入前判断是否已满(R5.5)。实时在场态优先,回退到 DB 容量。 */
  async canEnter(id: string): Promise<{ ok: boolean; capacity: number; occupancy: number }> {
    const room = await this.roomRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException('房间不存在');
    const occupancy = this.presence.occupancy(id);
    return { ok: occupancy < room.capacity, capacity: room.capacity, occupancy };
  }

  private toDto(r: AeonRoom): AeonRoomDto {
    return {
      id: r.id,
      plotId: r.plotId,
      orgId: r.orgId,
      kind: r.kind as AeonRoomKind,
      capacity: r.capacity,
      config: r.config ?? {},
      displayName: r.displayName,
    };
  }
}
