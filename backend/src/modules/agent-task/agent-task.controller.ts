import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentTaskService } from './agent-task.service';

interface CreateTaskBody {
  title: string;
  prompt: string;
  agentId?: string;
  instanceId?: string;
  tier?: string;
}

@Controller('agent-tasks')
@UseGuards(JwtAuthGuard)
export class AgentTaskController {
  constructor(private readonly service: AgentTaskService) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post()
  @HttpCode(201)
  async create(@Req() req: any, @Body() body: CreateTaskBody) {
    const userId = this.uid(req);
    return this.service.create({
      userId,
      title: body.title,
      prompt: body.prompt,
      agentId: body.agentId,
      instanceId: body.instanceId,
      tier: body.tier,
    });
  }

  @Get()
  list(@Req() req: any, @Query('limit') limit?: string) {
    const userId = this.uid(req);
    const n = limit ? parseInt(limit, 10) : 50;
    return this.service.list(userId, Number.isFinite(n) ? n : 50);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    const userId = this.uid(req);
    const task = await this.service.get(id);
    if (!task || task.userId !== userId) return null;
    return task;
  }

  @Get(':id/log')
  async log(@Req() req: any, @Param('id') id: string, @Query('limit') limit?: string) {
    const userId = this.uid(req);
    const task = await this.service.get(id);
    if (!task || task.userId !== userId) return [];
    const n = limit ? parseInt(limit, 10) : 200;
    return this.service.listLogs(id, Number.isFinite(n) ? n : 200);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = this.uid(req);
    const task = await this.service.get(id);
    if (!task || task.userId !== userId) return { ok: false };
    await this.service.cancel(id);
    return { ok: true };
  }
}
