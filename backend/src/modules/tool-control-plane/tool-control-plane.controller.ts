import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProgrammaticToolPlanRequest, ToolControlPlaneService, ToolsetSnapshot } from './tool-control-plane.service';

@ApiTags('Tool Control Plane')
@Controller('tool-control-plane')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ToolControlPlaneController {
  constructor(private readonly toolControlPlaneService: ToolControlPlaneService) {}

  @Get('report')
  @ApiOperation({ summary: 'Return tool naming, collision, risk, and safe-bin policy report' })
  @ApiResponse({ status: 200, description: 'Tool policy report returned' })
  getReport() {
    return this.toolControlPlaneService.buildPolicyReport();
  }

  @Post('report')
  @ApiOperation({ summary: 'Return a tool policy report for additional runtime toolsets' })
  @ApiResponse({ status: 201, description: 'Tool policy report returned' })
  getReportForToolsets(@Body() body: { toolsets?: ToolsetSnapshot[] }) {
    return this.toolControlPlaneService.buildPolicyReport(Array.isArray(body?.toolsets) ? body.toolsets : []);
  }

  @Post('browser-policy/check')
  @ApiOperation({ summary: 'Check whether a browser automation URL is allowed by fail-closed SSRF policy' })
  @ApiResponse({ status: 201, description: 'Browser target policy decision returned' })
  checkBrowserTarget(@Body() body: { url?: string }) {
    return this.toolControlPlaneService.checkBrowserTarget(body?.url || '');
  }

  @Post('ptc/run')
  @ApiOperation({ summary: 'Execute a restricted Programmatic Tool Calling plan against registered Agentrix tools' })
  @ApiResponse({ status: 201, description: 'PTC plan decision and execution results returned' })
  runProgrammaticToolPlan(@Request() req: any, @Body() body: ProgrammaticToolPlanRequest) {
    return this.toolControlPlaneService.executeProgrammaticToolPlan(req.user.id, body || { toolCalls: [] });
  }
}