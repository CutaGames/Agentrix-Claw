import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MerchantTaskService, CreateTaskDto, UpdateTaskProgressDto } from './merchant-task.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('merchant-tasks')
@Controller('merchant-tasks')
export class MerchantTaskController {
  constructor(private readonly taskService: MerchantTaskService) {}

  @Post()
  @ApiOperation({ summary: '创建任务（Agent→商户协作）' })
  @ApiResponse({ status: 201, description: '返回创建的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createTask(
    @Request() req: any,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.createTask(req.user?.id, dto);
  }

  @Put(':taskId/accept')
  @ApiOperation({ summary: '商户接受任务' })
  @ApiResponse({ status: 200, description: '返回更新的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async acceptTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.acceptTask(req.user?.id, taskId);
  }

  @Put(':taskId/progress')
  @ApiOperation({ summary: '更新任务进度' })
  @ApiResponse({ status: 200, description: '返回更新的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updateProgress(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskProgressDto,
  ) {
    return this.taskService.updateTaskProgress(req.user?.id, taskId, dto);
  }

  @Put(':taskId/complete')
  @ApiOperation({ summary: '完成任务' })
  @ApiResponse({ status: 200, description: '返回完成的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async completeTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.completeTask(req.user?.id, taskId);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: '获取我的任务列表（用户）' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMyTasks(@Request() req: any) {
    return this.taskService.getUserTasks(req.user?.id);
  }

  @Get('merchant-tasks')
  @ApiOperation({ summary: '获取商户任务列表' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMerchantTasks(@Request() req: any) {
    return this.taskService.getMerchantTasks(req.user?.id);
  }

  @Get(':taskId')
  @ApiOperation({ summary: '获取任务详情' })
  @ApiResponse({ status: 200, description: '返回任务详情' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.getTask(taskId, req.user?.id);
  }
}

