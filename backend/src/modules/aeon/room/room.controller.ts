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
import { RoomService } from './room.service';
import type { AeonRoomKind } from '../../../../../shared/types/aeon-world';

/**
 * RoomController — 房间 CRUD + 进入查询(Task 1.5 / R5)。
 * 实时同步走 /aeon Socket.IO 网关(Phase 0),本 REST 仅管房间元数据 + 在场态查询。
 */
@ApiTags('aeon/rooms')
@Controller('v1/aeon/rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  /** 创建房间(原语组合配置)。 */
  @Post()
  @ApiOperation({ summary: '在地块上创建房间' })
  async create(
    @Request() req: any,
    @Body()
    body: {
      plotId: string;
      kind?: AeonRoomKind;
      displayName?: string;
      capacity?: number;
      config?: Record<string, unknown>;
      orgId?: string | null;
    },
  ) {
    const userId = req.user?.id || req.user?.sub;
    if (!body?.plotId) throw new BadRequestException('plotId 必填');
    return this.rooms.create(userId, body);
  }

  /** 列出某地块的房间。 */
  @Get()
  @ApiOperation({ summary: '列出地块的房间' })
  async listByPlot(@Query('plotId') plotId: string) {
    if (!plotId) throw new BadRequestException('plotId 必填');
    return { items: await this.rooms.listByPlot(plotId) };
  }

  /** 房间详情 + 当前在场态。 */
  @Get(':id')
  @ApiOperation({ summary: '房间详情 + 在场态' })
  async getWithPresence(@Param('id') id: string) {
    return this.rooms.getWithPresence(id);
  }

  /** 进入前容量校验。 */
  @Get(':id/can-enter')
  @ApiOperation({ summary: '进入前容量校验' })
  async canEnter(@Param('id') id: string) {
    return this.rooms.canEnter(id);
  }
}
