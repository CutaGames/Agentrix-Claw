import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationTaskService } from '../services/creation-task.service';
import type { SubmitCreationTaskRequest } from '../../../../shared/types/world-creation-api';

/**
 * CreationTaskController — 跨端创作任务队列 (design §8, R8).
 *
 * 路由前缀 `api/v1/world-creation/tasks`。
 * NOTE: Task 1.3 骨架桩，委派给 CreationTaskService (当前抛 NotImplemented)。
 */
@ApiTags('world-creation/creation-task')
@Controller('v1/world-creation/tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationTaskController {
  constructor(private readonly creationTaskService: CreationTaskService) {}

  /** POST /api/v1/world-creation/tasks — 入队并派发 (R8.1/R8.7)。 */
  @Post()
  @ApiOperation({ summary: 'Enqueue a Creation_Task (self / desktop / agent dispatch)' })
  async submit(@Request() req: any, @Body() body: SubmitCreationTaskRequest) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.creationTaskService.submit(userId, body);
  }

  /** GET /api/v1/world-creation/tasks/:taskId — 查询状态 (R8.4)。 */
  @Get(':taskId')
  @ApiOperation({ summary: 'Get Creation_Task status' })
  async get(@Request() req: any, @Param('taskId') taskId: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.creationTaskService.get(userId, taskId);
  }

  /** POST /api/v1/world-creation/tasks/:taskId/retry — 失败重试 (R8.6)。 */
  @Post(':taskId/retry')
  @ApiOperation({ summary: 'Retry a failed Creation_Task (retains input)' })
  async retry(@Request() req: any, @Param('taskId') taskId: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.creationTaskService.retry(userId, taskId);
  }
}
