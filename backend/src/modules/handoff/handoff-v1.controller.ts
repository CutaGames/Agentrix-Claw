import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SessionHandoffService } from '../agent-presence/handoff/session-handoff.service';
import { HandoffStatus } from '../../entities/session-handoff.entity';

/**
 * 顿领 §5.1 Handoff v1 API
 *
 *   POST /api/v1/handoff/create     起始端发起（接力 / 镜像 / 忽略 三选项）
 *   POST /api/v1/handoff/:id/accept 目标端接受
 *   POST /api/v1/handoff/:id/cancel
 *   GET  /api/v1/handoff/:id        read-only poll
 *
 * 三选项 mode:
 *   handoff  接力（当前端转 read-only）
 *   mirror   镜像（双端实时观看）
 *   ignore   忽略（10s 自动消失）— 客户端层处理，不入服务端
 */
@UseGuards(JwtAuthGuard)
@Controller('api/v1/handoff')
export class HandoffV1Controller {
  constructor(private readonly handoff: SessionHandoffService) {}

  @Post('create')
  async create(
    @Req() req: any,
    @Body()
    body: {
      agent_id: string;
      session_id?: string;
      origin_device_id: string;
      origin_surface?: string;
      target_device_id?: string;
      target_surface?: string;
      task_kind?: string;
      mode: 'handoff' | 'mirror';
      context_ref?: string;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const created = await this.handoff.initiateHandoff(userId, {
      agentId: body.agent_id,
      sessionId: body.session_id,
      sourceDeviceId: body.origin_device_id,
      sourceDeviceType: body.origin_surface,
      targetDeviceId: body.target_device_id,
      targetDeviceType: body.target_surface,
      contextSnapshot: body.context_ref
        ? ({ contextRef: body.context_ref, mode: body.mode } as any)
        : ({ mode: body.mode } as any),
    });
    return this.toDto(created, body.mode);
  }

  @Post(':id/accept')
  async accept(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { device_id: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const updated = await this.handoff.acceptHandoff(userId, id, body.device_id);
    return this.toDto(updated);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const updated = await this.handoff.rejectHandoff(userId, id);
    return this.toDto(updated);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    // SessionHandoffService 没有暴露 getById；用 listActive 兜底（保持最小改动）
    // 实际生产应在服务层补 getById。这里用 controller 直接走 repo 的方式。
    return { request_id: id, note: 'use accept/cancel; full GET TBD' };
  }

  private toDto(h: any, modeOverride?: 'handoff' | 'mirror') {
    return {
      session_id: h.id,
      user_id: h.userId,
      origin_surface: h.sourceDeviceType,
      origin_device_id: h.sourceDeviceId,
      target_surface: h.targetDeviceType,
      target_device_id: h.targetDeviceId,
      task_kind: 'chat',
      task_context_ref: h.contextSnapshot?.contextRef || null,
      handoff_mode: modeOverride || h.contextSnapshot?.mode || null,
      status: this.mapStatus(h.status),
      started_at: h.createdAt ? new Date(h.createdAt).getTime() : Date.now(),
      last_heartbeat_at: h.updatedAt ? new Date(h.updatedAt).getTime() : Date.now(),
    };
  }

  private mapStatus(s: HandoffStatus | string): string {
    switch (s) {
      case HandoffStatus.INITIATED:
        return 'pending';
      case HandoffStatus.ACCEPTED:
        return 'accepted';
      case HandoffStatus.REJECTED:
        return 'cancelled';
      case HandoffStatus.EXPIRED:
        return 'expired';
      case HandoffStatus.COMPLETED:
        return 'completed';
      default:
        return String(s);
    }
  }
}
