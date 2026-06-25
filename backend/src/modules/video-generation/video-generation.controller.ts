import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VideoGenerationService } from './video-generation.service';

/**
 * Direct REST surface for the desktop Video Studio panel.
 *
 * The same `video_generate` tool is also reachable via the LLM tool path
 * (skill-executor / claude-integration / openclaw-proxy). This controller
 * lets the desktop panel submit + poll without requiring a chat turn.
 */
@ApiTags('video-generation')
@Controller('video-generation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VideoGenerationController {
  constructor(private readonly service: VideoGenerationService) {}

  @Post('submit')
  @ApiOperation({ summary: 'Submit a new video generation task' })
  async submit(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.service.executeTool(body as any, {
      userId: req.user.id,
      sessionId: typeof body?.sessionId === 'string' ? (body.sessionId as string) : undefined,
      platform: 'desktop',
      metadata: {
        deviceId: typeof body?.deviceId === 'string' ? (body.deviceId as string) : undefined,
        source: 'video-studio-panel',
      },
    } as any);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List recent video generation tasks for the current user' })
  async list(@Request() req: any, @Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 30;
    const tasks = await this.service.listUserTasks(req.user.id, lim);
    return {
      tasks: tasks.map((t) => ({
        taskId: t.taskId,
        status: t.status,
        provider: t.provider,
        model: t.model,
        title: t.title,
        prompt: t.prompt,
        outputUrl: t.outputUrl,
        thumbnailUrl: t.thumbnailUrl,
        error: t.error,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
    };
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get / poll a single video generation task' })
  async get(@Request() req: any, @Param('taskId') taskId: string) {
    return this.service.executeTool({ taskId } as any, {
      userId: req.user.id,
      platform: 'desktop',
      metadata: {},
    } as any);
  }
}
