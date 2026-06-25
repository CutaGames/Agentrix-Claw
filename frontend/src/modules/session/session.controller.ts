import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { CreateSessionDto, RevokeSessionDto } from './dto/session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('sessions')
@Controller('sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @ApiOperation({ summary: '创建 Session（ERC-8004）' })
  @ApiResponse({ status: 201, description: 'Session 创建成功' })
  async createSession(@Request() req, @Body() dto: CreateSessionDto) {
    return this.sessionService.createSession(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取用户的所有 Session' })
  @ApiResponse({ status: 200, description: '返回 Session 列表' })
  async getSessions(@Request() req) {
    return this.sessionService.getUserSessions(req.user.id);
  }

  @Get('/active')
  @ApiOperation({ summary: '获取活跃的 Session' })
  @ApiResponse({ status: 200, description: '返回活跃 Session' })
  async getActiveSession(@Request() req) {
    const session = await this.sessionService.getActiveSession(req.user.id);
    // 确保返回有效的 JSON（即使是 null 也要返回）
    // 使用显式的 JSON 响应，避免空字符串
    if (!session) {
      return { data: null };
    }
    return { data: session };
  }

  @Delete(':sessionId')
  @ApiOperation({ summary: '撤销 Session' })
  @ApiResponse({ status: 200, description: 'Session 撤销成功' })
  async revokeSession(
    @Request() req,
    @Param('sessionId') sessionId: string,
  ) {
    return this.sessionService.revokeSession(req.user.id, sessionId);
  }
}

