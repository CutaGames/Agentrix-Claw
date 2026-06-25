import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EventService } from './event.service';
import type { AeonEventCreateInput } from '../../../../../shared/types/aeon-world';

/**
 * EventController — 现场活动/演出排期 API(社交场所 Step 3)。`v1/aeon/events`。
 *
 * 实时进场仍走 /aeon Socket.IO(房间 id = aeon-live-<eventId>),本 REST 管活动元数据 + 预约。
 */
@ApiTags('aeon/events')
@Controller('v1/aeon/events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EventController {
  constructor(private readonly events: EventService) {}

  private uid(req: any): string {
    return req.user?.id || req.user?.sub;
  }
  private uname(req: any): string {
    return req.user?.name || req.user?.displayName || req.user?.email || '主办方';
  }

  @Post()
  @ApiOperation({ summary: '创建活动(创建者即主办方)' })
  async create(@Request() req: any, @Body() body: AeonEventCreateInput) {
    if (!body?.title) throw new BadRequestException('title 必填');
    return this.events.create(this.uid(req), this.uname(req), body);
  }

  @Get()
  @ApiOperation({ summary: '即将开始/进行中的活动(?plotId= 可选)' })
  async listUpcoming(@Request() req: any, @Query('plotId') plotId?: string) {
    return { items: await this.events.listUpcoming(this.uid(req), plotId) };
  }

  @Get(':id')
  @ApiOperation({ summary: '活动详情' })
  async get(@Request() req: any, @Param('id') id: string) {
    return this.events.get(id, this.uid(req));
  }

  @Post(':id/rsvp')
  @ApiOperation({ summary: '预约/取消预约(幂等切换)' })
  async rsvp(@Request() req: any, @Param('id') id: string) {
    return this.events.toggleRsvp(id, this.uid(req), this.uname(req));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '主办方取消活动' })
  async cancel(@Request() req: any, @Param('id') id: string) {
    return this.events.cancel(id, this.uid(req));
  }
}
