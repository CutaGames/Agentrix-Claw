import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentIntelligenceService, PlanStatus } from './agent-intelligence.service';
import { MemoryScope } from '../../entities/agent-memory.entity';

@ApiTags('agent-intelligence')
@Controller('agent-intelligence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentIntelligenceController {
  constructor(private readonly intelligenceService: AgentIntelligenceService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // Plan Mode APIs
  // ═══════════════════════════════════════════════════════════════════════

  @Get('plan/:sessionId')
  @ApiOperation({ summary: 'Get active plan for a session' })
  async getActivePlan(@Param('sessionId') sessionId: string) {
    const plan = this.intelligenceService.getActivePlan(sessionId);
    return { plan };
  }

  @Post('plan/:sessionId/approve')
  @ApiOperation({ summary: 'Approve the active plan' })
  @HttpCode(HttpStatus.OK)
  async approvePlan(@Param('sessionId') sessionId: string) {
    const plan = this.intelligenceService.approvePlan(sessionId);
    if (!plan) return { error: 'No plan awaiting approval' };
    return { plan };
  }

  @Post('plan/:sessionId/reject')
  @ApiOperation({ summary: 'Reject the active plan' })
  @HttpCode(HttpStatus.OK)
  async rejectPlan(
    @Param('sessionId') sessionId: string,
    @Body() body: { feedback?: string },
  ) {
    const plan = this.intelligenceService.rejectPlan(sessionId, body.feedback);
    if (!plan) return { error: 'No active plan' };
    return { plan };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Session APIs (P4.4 Session Resume)
  // ═══════════════════════════════════════════════════════════════════════

  @Get('sessions')
  @ApiOperation({ summary: 'List user chat sessions' })
  async listSessions(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.intelligenceService.listSessions(req.user.id, {
      status: status as any,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('sessions/:sessionId/resume')
  @ApiOperation({ summary: 'Load a session for resume (messages + memories + plan)' })
  async resumeSession(@Request() req: any, @Param('sessionId') sessionId: string) {
    const data = await this.intelligenceService.loadSessionForResume(req.user.id, sessionId);
    if (!data) return { error: 'Session not found' };
    return data;
  }

  @Post('sessions/:sessionId/archive')
  @ApiOperation({ summary: 'Archive a session' })
  @HttpCode(HttpStatus.OK)
  async archiveSession(@Param('sessionId') sessionId: string) {
    await this.intelligenceService.archiveSession(sessionId);
    return { ok: true };
  }

  @Get('sessions/:sessionId/context-usage')
  @ApiOperation({ summary: 'Get context window usage for a session' })
  async getContextUsage(
    @Param('sessionId') sessionId: string,
    @Query('instanceId') instanceId?: string,
  ) {
    return this.intelligenceService.getContextUsage(sessionId, instanceId || '');
  }

  @Post('sessions/:sessionId/compact')
  @ApiOperation({ summary: 'Trigger conversation compaction' })
  @HttpCode(HttpStatus.OK)
  async compactSession(@Param('sessionId') sessionId: string) {
    await this.intelligenceService.persistCompaction(sessionId, '');
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Memory APIs
  // ═══════════════════════════════════════════════════════════════════════

  @Get('memories')
  @ApiOperation({ summary: 'List memories for user/agent' })
  async listMemories(
    @Request() req: any,
    @Query('agentId') agentId?: string,
    @Query('scope') scope?: string,
  ) {
    return this.intelligenceService.listMemories(
      req.user.id,
      agentId,
      scope as MemoryScope | undefined,
    );
  }

  @Delete('memories/:memoryId')
  @ApiOperation({ summary: 'Delete a memory' })
  @HttpCode(HttpStatus.OK)
  async deleteMemory(@Param('memoryId') memoryId: string) {
    await this.intelligenceService.deleteMemory(memoryId);
    return { ok: true };
  }

  @Put('memories/:memoryId')
  @ApiOperation({ summary: 'Update a memory' })
  async updateMemory(
    @Param('memoryId') memoryId: string,
    @Body() body: { key?: string; value?: any },
  ) {
    const mem = await this.intelligenceService.updateMemory(memoryId, body);
    if (!mem) return { error: 'Memory not found' };
    return mem;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Subtask APIs (P5.2)
  // ═══════════════════════════════════════════════════════════════════════

  @Get('subtasks/:parentSessionId')
  @ApiOperation({ summary: 'List subtasks for a session' })
  async listSubtasks(@Param('parentSessionId') parentSessionId: string) {
    return this.intelligenceService.getSubtasks(parentSessionId);
  }

  @Post('subtasks/:parentSessionId')
  @ApiOperation({ summary: 'Create a subtask' })
  async createSubtask(
    @Request() req: any,
    @Param('parentSessionId') parentSessionId: string,
    @Body() body: { title: string; description: string; assignedDeviceType?: string },
  ) {
    return this.intelligenceService.createSubtask(
      parentSessionId,
      req.user.id,
      body.title,
      body.description,
      body.assignedDeviceType,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Agent Team APIs (P5.4)
  // ═══════════════════════════════════════════════════════════════════════

  @Get('teams/:parentSessionId')
  @ApiOperation({ summary: 'Get team for a session' })
  async getTeam(@Param('parentSessionId') parentSessionId: string) {
    return this.intelligenceService.getTeam(parentSessionId);
  }

  @Post('teams/:parentSessionId')
  @ApiOperation({ summary: 'Create an agent team' })
  async createTeam(
    @Param('parentSessionId') parentSessionId: string,
    @Body() body: { name: string; task: string; members: Array<{ agentId: string; role: 'leader' | 'worker'; model?: string; specialization?: string }> },
  ) {
    return this.intelligenceService.createTeam(parentSessionId, body.name, body.task, body.members);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P7.4 Session Export / Fork / Search
  // ═══════════════════════════════════════════════════════════════════════

  @Get('sessions/:sessionId/export')
  @ApiOperation({ summary: 'Export session as markdown or JSON' })
  async exportSession(
    @Param('sessionId') sessionId: string,
    @Query('format') format?: string,
  ) {
    if (format === 'json') {
      return this.intelligenceService.exportSessionAsJSON(sessionId);
    }
    const markdown = await this.intelligenceService.exportSessionAsMarkdown(sessionId);
    return { markdown, format: 'markdown' };
  }

  @Post('sessions/:sessionId/fork')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fork a session (copy messages up to a given point)' })
  async forkSession(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: { fromMessageIndex?: number },
  ) {
    return this.intelligenceService.forkSession(sessionId, req.user.id, body.fromMessageIndex);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search across all sessions' })
  async searchMessages(
    @Request() req: any,
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!query) return { results: [], total: 0 };
    return this.intelligenceService.searchMessages(req.user.id, query, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
