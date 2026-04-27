import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OperationsControlPlaneService, OperationsFollowUpRequest } from './operations-control-plane.service';

@ApiTags('Operations Control Plane')
@Controller('operations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OperationsControlPlaneController {
  constructor(private readonly operationsControlPlaneService: OperationsControlPlaneService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get cross-runtime operations overview for lanes, repair, desktop sync, approvals, and tools' })
  @ApiResponse({ status: 200, description: 'Operations overview returned' })
  getOverview(@Request() req: any) {
    return this.operationsControlPlaneService.getOverview(req.user.id);
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Get unified operations timeline across agent lanes, repair jobs, desktop tasks, approvals, and commands' })
  @ApiResponse({ status: 200, description: 'Operations timeline returned' })
  getTimeline(@Request() req: any, @Query('limit') limit?: string) {
    return this.operationsControlPlaneService.getTimeline(req.user.id, limit ? Number(limit) : undefined);
  }

  @Get('continuity')
  @ApiOperation({ summary: 'Get cross-device task continuity state for desktop, mobile, web, and wearables' })
  @ApiResponse({ status: 200, description: 'Task continuity state returned' })
  getContinuity(@Request() req: any) {
    return this.operationsControlPlaneService.getContinuity(req.user.id);
  }

  @Post('follow-up')
  @ApiOperation({ summary: 'Create a cross-device follow-up command for a session or active task' })
  @ApiResponse({ status: 201, description: 'Follow-up command created' })
  createFollowUp(@Request() req: any, @Body() body: OperationsFollowUpRequest) {
    return this.operationsControlPlaneService.createFollowUp(req.user.id, body);
  }
}