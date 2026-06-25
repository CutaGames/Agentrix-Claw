import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DreamingService, StartDreamDto } from './dreaming.service';
import { DreamStatus } from '../../entities/dreaming-session.entity';

@ApiTags('dreaming')
@Controller('dreaming')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DreamingController {
  constructor(private readonly dreamingService: DreamingService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'List dream sessions' })
  async listSessions(
    @Request() req: any,
    @Query('agentId') agentId?: string,
    @Query('status') status?: DreamStatus,
    @Query('limit') limit?: string,
  ) {
    return this.dreamingService.listSessions(req.user.id, {
      agentId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get a dream session' })
  async getSession(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
  ) {
    return this.dreamingService.getSession(req.user.id, sessionId);
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a new dream cycle' })
  async startDream(@Request() req: any, @Body() dto: StartDreamDto) {
    return this.dreamingService.startDream(req.user.id, dto);
  }

  @Post('sessions/:sessionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running dream session' })
  async cancelDream(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
  ) {
    return this.dreamingService.cancelDream(req.user.id, sessionId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dream statistics' })
  async getStats(
    @Request() req: any,
    @Query('agentId') agentId?: string,
  ) {
    return this.dreamingService.getStats(req.user.id, agentId);
  }
}
