import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Request,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OpenClawProxyService, ChatMessageDto, UnifiedChatRequestDto } from './openclaw-proxy.service';

@ApiTags('openclaw/proxy')
@Controller('openclaw/proxy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OpenClawProxyController {
  constructor(private readonly proxyService: OpenClawProxyService) {}

  // ===== Status =====

  @Get(':instanceId/status')
  @ApiOperation({ summary: 'Check liveness of instance' })
  async getStatus(@Request() req: any, @Param('instanceId') instanceId: string) {
    return this.proxyService.getInstanceStatus(req.user.id, instanceId);
  }

  // ===== Chat =====

  @Post('chat')
  @ApiOperation({ summary: 'Send a chat message using the user default OpenClaw instance' })
  async sendDefaultChat(
    @Request() req: any,
    @Body() body: UnifiedChatRequestDto,
  ) {
    return this.proxyService.sendDefaultChat(req.user.id, body);
  }

  @Post('stream')
  @ApiOperation({ summary: 'Stream a chat response using the user default OpenClaw instance' })
  async streamDefaultChat(
    @Request() req: any,
    @Body() body: UnifiedChatRequestDto,
    @Res() res: Response,
  ) {
    await this.proxyService.streamDefaultChat(req.user.id, body, res);
  }

  @Post(':instanceId/chat')
  @ApiOperation({ summary: 'Send a chat message (non-streaming)' })
  async sendChat(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Body() dto: ChatMessageDto,
  ) {
    return this.proxyService.sendChat(req.user.id, instanceId, dto);
  }

  @Post(':instanceId/stream')
  @ApiOperation({ summary: 'Stream a chat response (SSE)' })
  async streamChat(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ) {
    await this.proxyService.streamChat(req.user.id, instanceId, dto, res);
  }

  // ===== Session History =====

  @Get(':instanceId/history')
  @ApiOperation({ summary: 'Get chat history / sessions' })
  async getHistory(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.proxyService.getChatHistory(req.user.id, instanceId, sessionId);
  }

  // ===== Skills =====

  @Get(':instanceId/skills')
  @ApiOperation({ summary: 'Get installed skills on the instance' })
  async getSkills(@Request() req: any, @Param('instanceId') instanceId: string) {
    return this.proxyService.getInstanceSkills(req.user.id, instanceId);
  }

  @Put(':instanceId/skills/:skillId/toggle')
  @ApiOperation({ summary: 'Enable or disable a skill' })
  async toggleSkill(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Param('skillId') skillId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.proxyService.toggleSkill(req.user.id, instanceId, skillId, body.enabled);
  }

  @Post(':instanceId/skills/install')
  @ApiOperation({ summary: 'Push-install a skill package to the instance' })
  async installSkill(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Body() body: { skillPackageUrl: string; skillId: string },
  ) {
    return this.proxyService.installSkill(req.user.id, instanceId, body.skillPackageUrl, body.skillId);
  }

  // ===== Administration =====

  @Post(':instanceId/restart')
  @ApiOperation({ summary: 'Restart the OpenClaw instance' })
  @HttpCode(HttpStatus.ACCEPTED)
  async restartInstance(@Request() req: any, @Param('instanceId') instanceId: string) {
    return this.proxyService.restartInstance(req.user.id, instanceId);
  }

  // ===== Platform Tools (Agentrix skill execution for claws) =====

  @Get(':instanceId/platform-tools')
  @ApiOperation({ summary: 'Get available platform tools for this claw' })
  async getPlatformTools(@Request() req: any, @Param('instanceId') instanceId: string) {
    return this.proxyService.getAvailablePlatformTools(req.user.id, instanceId);
  }

  @Post(':instanceId/platform-tools/execute')
  @ApiOperation({ summary: 'Execute a platform tool (skill_search, skill_install, etc.)' })
  async executePlatformTool(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Body() body: { tool: string; params: Record<string, any> },
  ) {
    return this.proxyService.executePlatformTool(req.user.id, instanceId, body.tool, body.params);
  }

  @Post(':instanceId/platform-tools/batch')
  @ApiOperation({ summary: 'Batch-execute multiple platform tools' })
  async executePlatformToolBatch(
    @Request() req: any,
    @Param('instanceId') instanceId: string,
    @Body() body: { calls: Array<{ tool: string; params: Record<string, any> }> },
  ) {
    return this.proxyService.executePlatformToolBatch(req.user.id, instanceId, body.calls);
  }

  // ===== Local Model Conversation Sync =====

  @Post('sync-local-messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync local model conversation messages to backend for memory persistence' })
  async syncLocalMessages(
    @Request() req: any,
    @Body() body: {
      sessionId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      model?: string;
      platform?: string;
      deviceId?: string;
    },
  ) {
    return this.proxyService.syncLocalConversation(req.user.id, body);
  }
}
