/**
 * A2A (Agent-to-Agent) Controller
 * 
 * REST API endpoints for agent-to-agent task management,
 * reputation queries, and webhook management.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { A2AService, CreateA2ATaskDto, AcceptA2ATaskDto, DeliverA2ATaskDto, ReviewA2ATaskDto, NegotiateA2ATaskDto } from './a2a.service';
import { A2ATaskStatus } from '../../entities/a2a-task.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Standard API response wrapper */
function ok<T>(data: T) {
  return { success: true, data };
}

@ApiTags('A2A - Agent to Agent')
@Controller('api/a2a')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class A2AController {
  private readonly logger = new Logger(A2AController.name);

  constructor(private readonly a2aService: A2AService) {}

  // ==================== Task Lifecycle ====================

  @Post('tasks')
  @ApiOperation({ summary: 'Create a new A2A task (agent_invoke)' })
  @ApiResponse({ status: 201, description: 'Task created' })
  async createTask(@Body() dto: CreateA2ATaskDto) {
    return ok(await this.a2aService.createTask(dto));
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List A2A tasks with filters' })
  async listTasks(
    @Query('agentId') agentId?: string,
    @Query('role') role?: 'requester' | 'target',
    @Query('status') status?: string,
    @Query('taskType') taskType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const statusArray = status?.split(',') as A2ATaskStatus[];
    const result = await this.a2aService.listTasks({
      agentId,
      role,
      status: statusArray?.length === 1 ? statusArray[0] : statusArray,
      taskType,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    return ok(result);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get A2A task by ID' })
  async getTask(@Param('taskId') taskId: string) {
    return ok(await this.a2aService.getTask(taskId));
  }

  @Post('tasks/:taskId/accept')
  @ApiOperation({ summary: 'Accept a task (target agent)' })
  async acceptTask(
    @Param('taskId') taskId: string,
    @Body() body: { agentId: string } & AcceptA2ATaskDto,
  ) {
    const { agentId, ...dto } = body;
    return ok(await this.a2aService.acceptTask(taskId, agentId, dto));
  }

  @Post('tasks/:taskId/start')
  @ApiOperation({ summary: 'Start working on a task (target agent)' })
  async startTask(
    @Param('taskId') taskId: string,
    @Body('agentId') agentId: string,
  ) {
    return ok(await this.a2aService.startTask(taskId, agentId));
  }

  @Post('tasks/:taskId/deliver')
  @ApiOperation({ summary: 'Submit deliverables (target agent)' })
  async deliverTask(
    @Param('taskId') taskId: string,
    @Body() body: { agentId: string } & DeliverA2ATaskDto,
  ) {
    const { agentId, ...dto } = body;
    return ok(await this.a2aService.deliverTask(taskId, agentId, dto));
  }

  @Post('tasks/:taskId/review')
  @ApiOperation({ summary: 'Review and approve/reject deliverables (requester agent)' })
  async reviewTask(
    @Param('taskId') taskId: string,
    @Body() body: { agentId: string } & ReviewA2ATaskDto,
  ) {
    const { agentId, ...dto } = body;
    return ok(await this.a2aService.reviewTask(taskId, agentId, dto));
  }

  @Post('tasks/:taskId/auto-assess')
  @ApiOperation({ summary: 'Auto-assess quality of deliverables' })
  async autoAssess(@Param('taskId') taskId: string) {
    return ok(await this.a2aService.autoAssessQuality(taskId));
  }

  @Post('tasks/:taskId/auto-approve')
  @ApiOperation({ summary: 'Auto-approve if quality meets threshold' })
  async autoApprove(
    @Param('taskId') taskId: string,
    @Body('threshold') threshold?: number,
  ) {
    return ok(await this.a2aService.autoApproveIfQualified(taskId, threshold || 70));
  }

  @Post('tasks/:taskId/cancel')
  @ApiOperation({ summary: 'Cancel a task' })
  async cancelTask(
    @Param('taskId') taskId: string,
    @Body() body: { agentId: string; reason?: string },
  ) {
    return ok(await this.a2aService.cancelTask(taskId, body.agentId, body.reason));
  }

  @Post('tasks/:taskId/negotiate')
  @ApiOperation({ summary: 'Negotiate task terms (price, deadline, SLA)' })
  async negotiate(
    @Param('taskId') taskId: string,
    @Body() body: { agentId: string } & NegotiateA2ATaskDto,
  ) {
    const { agentId, ...dto } = body;
    return ok(await this.a2aService.negotiate(taskId, agentId, dto));
  }

  // ==================== Reputation ====================

  @Get('reputation/:agentId')
  @ApiOperation({ summary: 'Get agent reputation score and metrics' })
  async getReputation(@Param('agentId') agentId: string) {
    return ok(await this.a2aService.getReputation(agentId));
  }
}
