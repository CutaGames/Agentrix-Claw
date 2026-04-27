import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutoRepairService, RepairCommandResult } from './auto-repair.service';

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
}