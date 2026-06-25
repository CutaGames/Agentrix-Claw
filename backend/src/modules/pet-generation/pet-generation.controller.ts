import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetGenerationService } from './pet-generation.service';

/**
 * Controller for the desktop Pet Creator panel.
 *
 * The same `pet_generate` tool is also reachable from the LLM via
 * skill-executor / claude-integration / openclaw-proxy. These endpoints are
 * the direct UI entry points so the panel can submit and poll without going
 * through a chat turn.
 */
@ApiTags('pet-generation')
@Controller('pet-generation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PetGenerationController {
  constructor(private readonly service: PetGenerationService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit a new 3D pet generation task' })
  async submit(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.service.executeTool(body as any, {
      userId: req.user.id,
      sessionId: typeof body?.sessionId === 'string' ? (body.sessionId as string) : undefined,
      platform: 'desktop',
      metadata: {
        deviceId: typeof body?.deviceId === 'string' ? (body.deviceId as string) : undefined,
        source: 'pet-creator-panel',
      },
    } as any);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List recent pet generation tasks for the current user' })
  async list(@Request() req: any, @Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 30;
    const tasks = await this.service.listUserTasks(req.user.id, lim);
    return {
      tasks: tasks.map((t) => ({
        taskId: t.taskId,
        status: t.status,
        provider: t.provider,
        mode: t.mode,
        style: t.style,
        title: t.title,
        prompt: t.prompt,
        outputUrl: t.outputUrl,
        vrmUrl: t.vrmUrl,
        thumbnailUrl: t.thumbnailUrl,
        referenceImageUrl: t.referenceImageUrl,
        error: t.error,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
    };
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get / poll a single pet generation task' })
  async get(@Request() req: any, @Param('taskId') taskId: string) {
    return this.service.executeTool({ taskId } as any, {
      userId: req.user.id,
      platform: 'desktop',
      metadata: {},
    } as any);
  }
}
