import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WearableTelemetryService } from './wearable-telemetry.service';
import {
  CreateAutomationRuleDto,
  QueryTelemetryDto,
  RegisterWearableVerificationDto,
  UpdateAutomationRuleDto,
  UploadTelemetryDto,
} from './dto/wearable-telemetry.dto';

@ApiTags('Wearable Telemetry')
@Controller('wearable-telemetry')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WearableTelemetryController {
  constructor(private readonly service: WearableTelemetryService) {}

  // ── Telemetry Data ─────────────────────────────────────────────────────────

  @Post('upload')
  @ApiOperation({ summary: 'Upload buffered telemetry samples from a wearable device' })
  @ApiResponse({ status: 201, description: 'Samples uploaded and rules evaluated' })
  async uploadSamples(@Request() req, @Body() dto: UploadTelemetryDto) {
    return this.service.uploadSamples(req.user.id, dto);
  }

  @Post('verification')
  @ApiOperation({ summary: 'Register a paired wearable verification event for agent routing' })
  @ApiResponse({ status: 201, description: 'Verification event registered' })
  async registerVerification(@Request() req, @Body() dto: RegisterWearableVerificationDto) {
    return this.service.registerVerificationEvent(req.user.id, dto);
  }

  @Get('samples')
  @ApiOperation({ summary: 'Query historical telemetry samples' })
  @ApiResponse({ status: 200, description: 'Telemetry samples returned' })
  async querySamples(@Request() req, @Query() query: QueryTelemetryDto) {
    return this.service.querySamples(req.user.id, query);
  }

  @Get('devices/:deviceId/latest')
  @ApiOperation({ summary: 'Get latest reading per channel for a device' })
  @ApiResponse({ status: 200, description: 'Latest readings returned' })
  async getLatest(@Request() req, @Param('deviceId') deviceId: string) {
    return this.service.getLatestByDevice(req.user.id, deviceId);
  }

  @Get('devices/:deviceId/stats')
  @ApiOperation({ summary: 'Get telemetry statistics for a device' })
  @ApiResponse({ status: 200, description: 'Telemetry stats returned' })
  async getStats(@Request() req, @Param('deviceId') deviceId: string) {
    return this.service.getStats(req.user.id, deviceId);
  }

  // ── Automation Rules ───────────────────────────────────────────────────────

  @Post('rules')
  @ApiOperation({ summary: 'Create an automation rule for wearable data triggers' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  async createRule(@Request() req, @Body() dto: CreateAutomationRuleDto) {
    return this.service.createRule(req.user.id, dto);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List all automation rules, optionally filtered by device' })
  @ApiResponse({ status: 200, description: 'Rules returned' })
  async listRules(@Request() req, @Query('deviceId') deviceId?: string) {
    return this.service.listRules(req.user.id, deviceId);
  }

  @Patch('rules/:ruleId')
  @ApiOperation({ summary: 'Update an automation rule' })
  @ApiResponse({ status: 200, description: 'Rule updated' })
  async updateRule(@Request() req, @Param('ruleId') ruleId: string, @Body() dto: UpdateAutomationRuleDto) {
    return this.service.updateRule(req.user.id, ruleId, dto);
  }

  @Post('rules/:ruleId/toggle')
  @ApiOperation({ summary: 'Toggle an automation rule on/off' })
  @ApiResponse({ status: 200, description: 'Rule toggled' })
  async toggleRule(@Request() req, @Param('ruleId') ruleId: string) {
    return this.service.toggleRule(req.user.id, ruleId);
  }

  @Delete('rules/:ruleId')
  @ApiOperation({ summary: 'Delete an automation rule' })
  @ApiResponse({ status: 200, description: 'Rule deleted' })
  async deleteRule(@Request() req, @Param('ruleId') ruleId: string) {
    const deleted = await this.service.deleteRule(req.user.id, ruleId);
    return { deleted };
  }

  // ── Trigger Events ─────────────────────────────────────────────────────────

  @Get('triggers')
  @ApiOperation({ summary: 'List recent trigger events' })
  @ApiResponse({ status: 200, description: 'Trigger events returned' })
  async listTriggers(@Request() req, @Query('limit') limit?: number) {
    return this.service.listTriggerEvents(req.user.id, limit || 50);
  }

  @Post('triggers/:eventId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a trigger event' })
  @ApiResponse({ status: 200, description: 'Trigger acknowledged' })
  async acknowledgeTrigger(@Request() req, @Param('eventId') eventId: string) {
    const acknowledged = await this.service.acknowledgeTrigger(req.user.id, eventId);
    return { acknowledged };
  }

  @Get('triggers/unacknowledged/count')
  @ApiOperation({ summary: 'Get count of unacknowledged trigger events' })
  @ApiResponse({ status: 200, description: 'Count returned' })
  async getUnacknowledgedCount(@Request() req) {
    const count = await this.service.getUnacknowledgedCount(req.user.id);
    return { count };
  }
}
