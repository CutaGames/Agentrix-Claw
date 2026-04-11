import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PluginOwnedRuntimeService } from './plugin-owned-runtime.service';

@ApiTags('plugin-owned')
@Controller('plugin-owned')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PluginOwnedController {
  constructor(
    private readonly pluginOwnedRuntime: PluginOwnedRuntimeService,
  ) {}

  @Get('snapshot')
  @ApiOperation({ summary: 'Get full plugin-owned capability snapshot' })
  async getSnapshot(@Request() req: any) {
    return this.pluginOwnedRuntime.getSnapshot(req.user.id);
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'List owned capabilities by type' })
  async listCapabilities(
    @Request() req: any,
    @Query('type') type?: 'tool' | 'hook' | 'channel' | 'service' | 'memory' | 'protocol' | 'doctor' | 'runtime',
  ) {
    return this.pluginOwnedRuntime.listCapabilities(req.user.id, type);
  }

  @Post('rebuild')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force rebuild plugin runtime snapshot' })
  async rebuild(@Request() req: any) {
    this.pluginOwnedRuntime.invalidate(req.user.id);
    const snap = await this.pluginOwnedRuntime.buildSnapshot(req.user.id);
    return snap.summary;
  }
}
