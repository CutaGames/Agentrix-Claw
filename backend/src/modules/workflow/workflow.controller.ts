import {
  Controller, Get, Post, Patch, Delete, Param,
  Body, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowService, CreateWorkflowDto, UpdateWorkflowDto } from './workflow.service';

@ApiTags('Workflows')
@Controller('workflows')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkflowController {
  constructor(private readonly svc: WorkflowService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflows for the current user' })
  findAll(@Request() req: any) {
    return this.svc.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single workflow' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.svc.findOne(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workflow' })
  create(@Request() req: any, @Body() dto: CreateWorkflowDto) {
    return this.svc.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workflow' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateWorkflowDto) {
    return this.svc.update(id, req.user.id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Enable or disable a workflow' })
  toggle(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { enabled: boolean },
  ) {
    return this.svc.toggle(id, req.user.id, body.enabled);
  }

  @Post(':id/run')
  @ApiOperation({ summary: 'Manually trigger a workflow run' })
  run(@Param('id') id: string, @Request() req: any) {
    return this.svc.run(id, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workflow' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.id);
  }
}

/** Public webhook endpoint — no JWT, token in path */
@ApiTags('Workflows')
@Controller('webhooks/workflow')
export class WorkflowWebhookController {
  constructor(private readonly svc: WorkflowService) {}

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a workflow via webhook token' })
  async trigger(@Param('token') token: string) {
    const result = await this.svc.runByWebhook(token);
    if (!result) return { ok: false, message: 'Invalid or disabled webhook' };
    return { ok: true, ...result };
  }
}
