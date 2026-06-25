import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentRuntimeConfig, RuntimeDoctorService } from './runtime-doctor.service';

@ApiTags('Runtime Doctor')
@Controller('runtime-doctor')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RuntimeDoctorController {
  constructor(private readonly runtimeDoctorService: RuntimeDoctorService) {}

  @Get()
  @ApiOperation({ summary: 'Run release readiness checks for runtime, chat parity, signing, and updater' })
  @ApiResponse({ status: 200, description: 'Runtime doctor report returned' })
  async getDoctorReport() {
    return this.runtimeDoctorService.runDoctor();
  }

  @Post('check')
  @ApiOperation({ summary: 'Run runtime doctor against an explicit runtime config' })
  @ApiResponse({ status: 201, description: 'Runtime doctor report returned' })
  async checkRuntime(@Body() body: { runtimeConfig?: AgentRuntimeConfig; currentDesktopVersion?: string }) {
    return this.runtimeDoctorService.runDoctor(body || {});
  }
}