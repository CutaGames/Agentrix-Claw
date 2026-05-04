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
import { ApprovalService, CreateApprovalInput, Surface, ApprovalMethod } from './approval.service';

/**
 * 顿领 §5.2 Approval API
 *
 *   POST /api/v1/approval/request
 *   POST /api/v1/approval/:id/approve
 *   POST /api/v1/approval/:id/deny
 *   GET  /api/v1/approval/:id
 *   GET  /api/v1/approval               pending 列表
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/approval')
export class ApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Post('request')
  async createRequest(
    @Req() req: any,
    @Body()
    body: {
      action: CreateApprovalInput['action'];
      risk_level: 0 | 1 | 2 | 3;
      initiator_surface: Surface;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const created = await this.service.create({
      userId,
      action: body.action,
      riskLevel: body.risk_level,
      initiatorSurface: body.initiator_surface,
    });
    return this.service.toDto(created);
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Req() req: any,
    @Body()
    body: {
      surface: Surface;
      device_id: string;
      method: ApprovalMethod;
      trust_level: 0 | 1 | 2 | 3;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const updated = await this.service.approve(id, {
      userId,
      surface: body.surface,
      deviceId: body.device_id,
      method: body.method,
      trustLevel: body.trust_level,
    });
    return this.service.toDto(updated);
  }

  @Post(':id/deny')
  async deny(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { surface: Surface; device_id: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const updated = await this.service.deny(id, userId, body.surface, body.device_id);
    return this.service.toDto(updated);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const r = await this.service.get(id, userId);
    return this.service.toDto(r);
  }

  @Get()
  async listPending(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const list = await this.service.listPending(userId);
    return list.map((r) => this.service.toDto(r));
  }
}
