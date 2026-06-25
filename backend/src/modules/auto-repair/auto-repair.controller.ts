import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutoRepairService, RepairCommandResult, RepairPatchPlan } from './auto-repair.service';

@ApiTags('Auto Repair')
@Controller('auto-repair')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AutoRepairController {
  constructor(private readonly autoRepairService: AutoRepairService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Parse command output into structured repair diagnostics' })
  @ApiResponse({ status: 201, description: 'Diagnostics parsed' })
  async analyze(@Body() body: RepairCommandResult & { command?: string }) {
    const diagnostics = this.autoRepairService.parseDiagnostics(body || {});
    return {
      diagnostics,
      repairPrompt: this.autoRepairService.buildRepairPrompt(body?.command || 'unknown command', diagnostics),
    };
  }

  @Post('jobs')
  @ApiOperation({ summary: 'Create an auditable auto-repair job' })
  @ApiResponse({ status: 201, description: 'Repair job created' })
  async createJob(@Body() body: {
    userId?: string;
    agentId?: string;
    sessionId?: string;
    command: string;
    workspaceRoot?: string;
    approvalRequired?: boolean;
    createdBy?: string;
    metadata?: Record<string, any>;
  }) {
    if (!body?.command) {
      throw new BadRequestException('command is required');
    }
    return this.autoRepairService.createRepairJob(body);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get repair job timeline with attempts and patches' })
  @ApiResponse({ status: 200, description: 'Repair job returned' })
  async getJob(@Param('jobId') jobId: string) {
    return this.autoRepairService.getRepairJobTimeline(jobId);
  }

  @Post('jobs/:jobId/attempts')
  @ApiOperation({ summary: 'Record a repair attempt for audit and replay' })
  @ApiResponse({ status: 201, description: 'Repair attempt recorded' })
  async recordAttempt(
    @Param('jobId') jobId: string,
    @Body() body: {
      attempt: number;
      commandResult: RepairCommandResult;
      diagnostics?: any[];
      status?: string;
      repairPrompt?: string;
      patchPlan?: RepairPatchPlan;
      metadata?: Record<string, any>;
    },
  ) {
    return this.autoRepairService.recordRepairAttempt(jobId, body || {} as any);
  }

  @Post('jobs/:jobId/patches')
  @ApiOperation({ summary: 'Request approval for an auto-repair patch' })
  @ApiResponse({ status: 201, description: 'Patch request recorded' })
  async requestPatch(
    @Param('jobId') jobId: string,
    @Body() body: {
      attempt: number;
      attemptId?: string;
      patchPlan: RepairPatchPlan;
      requestedBy?: string;
      approvalReason?: string;
      workspaceRoot?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.autoRepairService.requestPatchApproval({ ...(body || {} as any), jobId });
  }

  @Post('patches/:patchId/approve')
  @ApiOperation({ summary: 'Approve or reject a pending repair patch' })
  @ApiResponse({ status: 200, description: 'Patch approval state updated' })
  async approvePatch(
    @Param('patchId') patchId: string,
    @Body() body: { reviewerId?: string; decision?: 'approved' | 'rejected'; reason?: string },
  ) {
    return this.autoRepairService.reviewRepairPatch(patchId, body || {});
  }
}