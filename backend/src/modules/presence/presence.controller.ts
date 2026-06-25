import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import {
  PresenceService,
  PresenceDevice,
  DevicePresence,
} from './presence.service';

/** 心跳上报请求体(设计 §7.2:`POST /v1/presence/heartbeat { instanceId, device }`)。 */
interface HeartbeatBody {
  instanceId?: string;
  device?: string;
  /** 可选:自定义心跳 ttl(秒),默认走 service 默认值(30s)。 */
  ttlSec?: number;
}

/** 合法终端类型集合,用于校验请求体 device。 */
const VALID_DEVICES: PresenceDevice[] = ['mobile', 'desktop'];

/**
 * PresenceController — 跨端 presence 端点(净新建,设计 §7.2 / Requirement 8)。
 *
 * 两个端点均挂 `JwtAuthGuard`,且**仅限本人 instance**:每次都用
 * 鉴权用户 id 对 `openclaw_instances.userId` 做归属校验,非本人实例一律 403,
 * 避免他人借 instanceId 上报/窥探在线态(design Security Considerations)。
 *
 * 状态变化的跨端推送由 `PresenceService` 通过注入的 push-handler 完成
 * (见 `PresenceModule` 在启动时注册的回调):presence 变化经现有 WS 广播
 * 通道以 `presence:update` 事件下发给该用户的在线端,满足 5s 内同步(R8.4)。
 * 本控制器只负责「鉴权 + 归属校验 + 调用 service」,不直接接触 WS。
 */
@ApiTags('presence')
@Controller('v1/presence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
  ) {}

  /**
   * POST /v1/presence/heartbeat — 心跳上报(R8.1/R8.2/R8.3)。
   *
   * Body: `{ instanceId, device }`(device ∈ mobile|desktop)。
   * 刷新该实例该端的在线态;offline→online 跃迁时由 service 推送 `presence:update`。
   * 返回该实例当前各端在线快照,便于上报端即时拿到最新设备列表。
   */
  @Post('heartbeat')
  @ApiOperation({ summary: '上报某实例某端的在线心跳(仅限本人 instance)' })
  async heartbeat(
    @Request() req: any,
    @Body() body: HeartbeatBody,
  ): Promise<{ instanceId: string; presences: DevicePresence[] }> {
    const userId = this.requireUserId(req);
    const instanceId = this.requireInstanceId(body?.instanceId);
    const device = this.requireDevice(body?.device);

    await this.assertOwnInstance(userId, instanceId);

    this.presenceService.report(userId, instanceId, device, body?.ttlSec);
    return {
      instanceId,
      presences: this.presenceService.query(userId, instanceId),
    };
  }

  /**
   * GET /v1/presence/:instanceId — 查询某实例各端在线列表(R8.5)。
   *
   * 返回 `{ device, online, lastSeen }[]`(读取即时叠加 ttl 判定,
   * 超时端即便 sweep 尚未跑到也呈现为离线)。仅限本人 instance。
   */
  @Get(':instanceId')
  @ApiOperation({ summary: '查询某实例各端在线状态(仅限本人 instance)' })
  async getPresence(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
  ): Promise<{ instanceId: string; presences: DevicePresence[] }> {
    const userId = this.requireUserId(req);
    const id = this.requireInstanceId(instanceId);

    await this.assertOwnInstance(userId, id);

    return {
      instanceId: id,
      presences: this.presenceService.query(userId, id),
    };
  }

  // ── 内部校验工具 ──────────────────────────────────────────────────

  /** 从 JWT 解出用户 id(沿用既有控制器 `id ?? sub` 约定)。 */
  private requireUserId(req: any): string {
    const userId = req?.user?.id ?? req?.user?.sub;
    if (!userId) {
      // JwtAuthGuard 正常会拦住未鉴权请求;这里是防御性兜底。
      throw new ForbiddenException('未鉴权用户');
    }
    return String(userId);
  }

  private requireInstanceId(instanceId?: string): string {
    if (!instanceId || typeof instanceId !== 'string' || !instanceId.trim()) {
      throw new BadRequestException('instanceId 不能为空');
    }
    return instanceId.trim();
  }

  private requireDevice(device?: string): PresenceDevice {
    if (!device || !VALID_DEVICES.includes(device as PresenceDevice)) {
      throw new BadRequestException(
        `device 必须是 ${VALID_DEVICES.join(' | ')} 之一`,
      );
    }
    return device as PresenceDevice;
  }

  /**
   * 归属校验:实例必须属于当前鉴权用户(仅限本人 instance)。
   * 用 `{ id, userId }` 联合查询,查不到一律 403(不区分「不存在」与「他人的」,
   * 避免实例 id 枚举泄露,design Security Considerations)。
   */
  private async assertOwnInstance(userId: string, instanceId: string): Promise<void> {
    const owned = await this.instanceRepo.findOne({
      where: { id: instanceId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new ForbiddenException('无权访问该实例的 presence');
    }
  }
}
