import { Injectable, NotFoundException } from '@nestjs/common';

import { CreationRepository } from '../creation.repository';
import { CreationEntity } from '../entities/creation.entity';
import { AEON_EVENTS } from '../../../../shared/types/aeon-world';
import { AEON_SYNC } from '../../../../shared/types/aeon-sync';

/**
 * Creation 实时加入描述符 —— 客户端据此用既有 `/aeon` Socket.IO 网关连入同框。
 */
export interface CreationPresenceDescriptor {
  /** 实时房间 id(复用 aeon realtime 房间约定)。 */
  roomId: string;
  /** Socket.IO 命名空间(既有 AeonRealtimeGateway)。 */
  namespace: string;
  /** 加入事件名(客户端 emit 该事件 + { roomId } 入场)。 */
  joinEvent: string;
  /** 是否为舞台房(stage/livestream):支持举手/上麦/打赏(StageService)。 */
  isStage: boolean;
  /** 房间容量(MVP 真人+agent 合计)。 */
  capacity: number;
}

/**
 * CreationPresenceService — Creation 实时同框接入(world-creation-feed task 8.2)。
 *
 * spec: 需求 8.5 —— 实时多人(房间/直播/广场)同框/群聊。
 *
 * 设计:**复用既有 Aeon 实时层**(`AeonRealtimeGateway` + `RoomPresenceService` +
 * `StageService`),不新建网关,避免重复实时基建(AGENTS.md hard rule)与模块循环依赖。
 * 本服务只负责把一个 Creation 映射到 aeon 实时房间 id 并产出"加入描述符":
 *   - stage / livestream → 房间 id 用 `aeon-live-<creationId>` 前缀,使
 *     `StageService.isStageRoom` 识别为舞台房(举手/上麦/打赏可用,需求 8.5)。
 *   - 其他类型 → `creation-<creationId>` 普通同框房。
 *
 * 客户端拿到描述符后,经既有 `/aeon` Socket.IO 连接 emit JOIN 入场,即获得与
 * Aeon 一致的实时同框/群聊/舞台能力;在场快照/广播由 AeonRealtimeGateway 处理。
 */
@Injectable()
export class CreationPresenceService {
  constructor(private readonly repo: CreationRepository) {}

  /** 解析某 Creation 的实时加入描述符(不存在抛 NotFound)。 */
  async getDescriptor(creationId: string): Promise<CreationPresenceDescriptor> {
    const creation = await this.repo.findById(creationId);
    if (!creation) throw new NotFoundException(`Creation not found: ${creationId}`);
    return this.describe(creation);
  }

  /** 纯函数:由 Creation 类型派生房间 id 与是否舞台房。 */
  describe(creation: CreationEntity): CreationPresenceDescriptor {
    const isStage = creation.type === 'stage' || creation.type === 'livestream';
    const roomId = isStage
      ? `${AEON_EVENTS.ROOM_PREFIX}${creation.id}`
      : `creation-${creation.id}`;
    return {
      roomId,
      namespace: '/aeon',
      joinEvent: AEON_SYNC.JOIN,
      isStage,
      capacity: AEON_SYNC.ROOM_CAPACITY_MVP,
    };
  }
}
