import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentPresenceService } from './agent-presence.service';
import { PresenceRouterService } from './channel/presence-router.service';
import { ChannelRegistry } from './channel/channel-registry';
import { SessionHandoffService } from './handoff/session-handoff.service';
import { AgentTaskSchedulerService } from './scheduler/agent-task-scheduler.service';
import { OperationsDashboardService } from './scheduler/operations-dashboard.service';
import { UnifiedDeviceService } from './unified-device.service';
import {
  CreateAgentDto,
  UpdateAgentDto,
  BindChannelDto,
  CreateConversationEventDto,
  CreateSharePolicyDto,
  TimelineQueryDto,
} from './dto/agent-presence.dto';
import { MemoryScope } from '../../entities/agent-memory.entity';

/**
 * @deprecated Use /agents/unified for new agent operations.
 * This controller remains for backward compatibility with channel bindings,
 * memories, handoffs, and legacy mobile clients.
 */
@ApiTags('agent-presence')
@Controller('agent-presence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentPresenceController {
  constructor(
    private readonly service: AgentPresenceService,
    private readonly router: PresenceRouterService,
    private readonly channelRegistry: ChannelRegistry,
    private readonly handoffService: SessionHandoffService,
    private readonly taskScheduler: AgentTaskSchedulerService,
    private readonly dashboard: OperationsDashboardService,
    private readonly unifiedDevices: UnifiedDeviceService,
  ) {}

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  @Post('agents')
  @ApiOperation({ summary: 'Create a new Agent' })
  @ApiResponse({ status: 201, description: 'Agent created' })
  async createAgent(@Request() req: any, @Body() dto: CreateAgentDto) {
    return this.service.createAgent(req.user?.id, dto);
  }

  @Get('agents')
  @ApiOperation({ summary: 'List all agents for current user' })
  @ApiResponse({ status: 200, description: 'Agent list' })
  async listAgents(@Request() req: any) {
    return this.service.listAgents(req.user?.id);
  }

  @Get('agents/:agentId')
  @ApiOperation({ summary: 'Get agent details' })
  @ApiResponse({ status: 200, description: 'Agent details' })
  async getAgent(@Request() req: any, @Param('agentId') agentId: string) {
    return this.service.getAgent(req.user?.id, agentId);
  }

  @Put('agents/:agentId')
  @ApiOperation({ summary: 'Update agent' })
  @ApiResponse({ status: 200, description: 'Agent updated' })
  async updateAgent(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.service.updateAgent(req.user?.id, agentId, dto);
  }

  @Delete('agents/:agentId')
  @ApiOperation({ summary: 'Archive agent (soft delete)' })
  @ApiResponse({ status: 200, description: 'Agent archived' })
  async archiveAgent(@Request() req: any, @Param('agentId') agentId: string) {
    return this.service.archiveAgent(req.user?.id, agentId);
  }

  // ── Channel Binding ───────────────────────────────────────────────────────

  @Post('agents/:agentId/channels')
  @ApiOperation({ summary: 'Bind a channel to an agent' })
  @ApiResponse({ status: 201, description: 'Channel bound' })
  async bindChannel(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: BindChannelDto,
  ) {
    return this.service.bindChannel(req.user?.id, agentId, dto);
  }

  @Delete('agents/:agentId/channels/:platform')
  @ApiOperation({ summary: 'Unbind a channel from an agent' })
  @ApiResponse({ status: 200, description: 'Channel unbound' })
  async unbindChannel(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Param('platform') platform: string,
  ) {
    return this.service.unbindChannel(req.user?.id, agentId, platform);
  }

  // ── Unified Timeline ──────────────────────────────────────────────────────

  @Post('agents/:agentId/events')
  @ApiOperation({ summary: 'Create a conversation event' })
  @ApiResponse({ status: 201, description: 'Event created' })
  async createEvent(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Body() dto: CreateConversationEventDto,
  ) {
    dto.agentId = agentId;
    return this.service.createEvent(req.user?.id, dto);
  }

  @Get('agents/:agentId/timeline')
  @ApiOperation({ summary: 'Get unified timeline for an agent' })
  @ApiResponse({ status: 200, description: 'Timeline events' })
  async getTimeline(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.service.getTimeline(req.user?.id, agentId, query);
  }

  @Get('agents/:agentId/timeline/stats')
  @ApiOperation({ summary: 'Get timeline statistics for an agent' })
  @ApiResponse({ status: 200, description: 'Timeline stats' })
  async getTimelineStats(
    @Request() req: any,
    @Param('agentId') agentId: string,
  ) {
    return this.service.getTimelineStats(req.user?.id, agentId);
  }

  // ── Agent Memory ──────────────────────────────────────────────────────────

  @Get('agents/:agentId/memories')
  @ApiOperation({ summary: 'Get agent-level memories' })
  @ApiResponse({ status: 200, description: 'Memories list' })
  async getAgentMemories(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Query('scope') scope?: MemoryScope,
    @Query('limit') limit?: number,
  ) {
    return this.service.getAgentMemories(req.user?.id, agentId, { scope, limit });
  }

  @Post('agents/:agentId/memories/:memoryId/promote')
  @ApiOperation({ summary: 'Promote a session memory to agent-level' })
  @ApiResponse({ status: 200, description: 'Memory promoted' })
  async promoteMemory(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Param('memoryId') memoryId: string,
  ) {
    return this.service.promoteMemoryToAgent(req.user?.id, agentId, memoryId);
  }

  // ── Share Policies ────────────────────────────────────────────────────────

  @Post('share-policies')
  @ApiOperation({ summary: 'Create or update a share policy between agents' })
  @ApiResponse({ status: 201, description: 'Share policy created/updated' })
  async createSharePolicy(@Request() req: any, @Body() dto: CreateSharePolicyDto) {
    return this.service.createSharePolicy(req.user?.id, dto);
  }

  @Get('share-policies')
  @ApiOperation({ summary: 'List share policies' })
  @ApiResponse({ status: 200, description: 'Share policies list' })
  async getSharePolicies(
    @Request() req: any,
    @Query('agentId') agentId?: string,
  ) {
    return this.service.getSharePolicies(req.user?.id, agentId);
  }

  @Delete('share-policies/:policyId')
  @ApiOperation({ summary: 'Delete a share policy' })
  @ApiResponse({ status: 200, description: 'Share policy deleted' })
  async deleteSharePolicy(@Request() req: any, @Param('policyId') policyId: string) {
    await this.service.deleteSharePolicy(req.user?.id, policyId);
    return { success: true };
  }

  // ── Approval Flow ───────────────────────────────────────────────────────

  @Post('approvals/:eventId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending reply draft and send it' })
  @ApiResponse({ status: 200, description: 'Reply sent' })
  async approveReply(
    @Request() req: any,
    @Param('eventId') eventId: string,
    @Body('text') text: string,
  ) {
    const event = await this.router.sendApprovedReply(req.user?.id, eventId, text);
    if (!event) {
      return { success: false, error: 'Event not found or no adapter available' };
    }
    return { success: true, event };
  }

  @Post('approvals/:eventId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a pending reply draft' })
  @ApiResponse({ status: 200, description: 'Reply rejected' })
  async rejectReply(
    @Request() req: any,
    @Param('eventId') eventId: string,
  ) {
    // Just mark the event as rejected — no message sent
    return this.service.rejectApproval(req.user?.id, eventId);
  }

  // ── Channel Health ────────────────────────────────────────────────────

  @Get('channels/health')
  @ApiOperation({ summary: 'Health check for all registered channel adapters' })
  @ApiResponse({ status: 200, description: 'Channel health status' })
  async channelHealth() {
    return this.channelRegistry.healthCheckAll();
  }

  // ── Session Handoff ─────────────────────────────────────────────────────

  @Post('handoffs')
  @ApiOperation({ summary: 'Initiate a cross-device session handoff' })
  @ApiResponse({ status: 201, description: 'Handoff initiated' })
  async initiateHandoff(@Request() req: any, @Body() dto: any) {
    return this.handoffService.initiateHandoff(req.user?.id, dto);
  }

  @Post('handoffs/:handoffId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a session handoff on this device' })
  @ApiResponse({ status: 200, description: 'Handoff accepted' })
  async acceptHandoff(
    @Request() req: any,
    @Param('handoffId') handoffId: string,
    @Body('deviceId') deviceId: string,
  ) {
    return this.handoffService.acceptHandoff(req.user?.id, handoffId, deviceId);
  }

  @Post('handoffs/:handoffId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a session handoff' })
  @ApiResponse({ status: 200, description: 'Handoff rejected' })
  async rejectHandoff(
    @Request() req: any,
    @Param('handoffId') handoffId: string,
  ) {
    return this.handoffService.rejectHandoff(req.user?.id, handoffId);
  }

  @Post('handoffs/:handoffId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark handoff as completed' })
  @ApiResponse({ status: 200, description: 'Handoff completed' })
  async completeHandoff(
    @Request() req: any,
    @Param('handoffId') handoffId: string,
  ) {
    return this.handoffService.completeHandoff(req.user?.id, handoffId);
  }

  // ── Device Presence ─────────────────────────────────────────────────────

  @Post('devices/heartbeat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send device heartbeat' })
  @ApiResponse({ status: 200, description: 'Heartbeat registered' })
  async deviceHeartbeat(@Request() req: any, @Body() dto: any) {
    return this.handoffService.deviceHeartbeat(req.user?.id, dto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'List all registered devices' })
  @ApiResponse({ status: 200, description: 'Devices list' })
  async getAllDevices(@Request() req: any) {
    return this.handoffService.getAllDevices(req.user?.id);
  }

  @Get('devices/online')
  @ApiOperation({ summary: 'List currently online devices' })
  @ApiResponse({ status: 200, description: 'Online devices' })
  async getOnlineDevices(@Request() req: any) {
    return this.handoffService.getOnlineDevices(req.user?.id);
  }

  // ── Unified Devices (Phase 6) ──────────────────────────────────────────

  @Get('devices/unified')
  @ApiOperation({ summary: 'List all devices from both agent-presence and desktop-sync' })
  @ApiResponse({ status: 200, description: 'Unified device list' })
  async getUnifiedDevices(@Request() req: any) {
    return this.unifiedDevices.getAllDevices(req.user?.id);
  }

  @Get('devices/unified/online')
  @ApiOperation({ summary: 'List online devices from both systems' })
  @ApiResponse({ status: 200, description: 'Unified online devices' })
  async getUnifiedOnlineDevices(@Request() req: any) {
    return this.unifiedDevices.getOnlineDevices(req.user?.id);
  }

  @Get('devices/unified/stats')
  @ApiOperation({ summary: 'Get aggregated device stats across both systems' })
  @ApiResponse({ status: 200, description: 'Device stats' })
  async getDeviceStats(@Request() req: any) {
    return this.unifiedDevices.getDeviceStats(req.user?.id);
  }

  // ── Scheduled Tasks (Phase 5) ─────────────────────────────────────────

  @Post('tasks')
  @ApiOperation({ summary: 'Create an agent scheduled task' })
  @ApiResponse({ status: 201, description: 'Task created' })
  async createTask(@Request() req: any, @Body() dto: any) {
    return this.taskScheduler.createTask(req.user?.id, dto);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List scheduled tasks' })
  @ApiResponse({ status: 200, description: 'Tasks list' })
  async getTasks(@Request() req: any, @Query('agentId') agentId?: string) {
    return this.taskScheduler.getTasks(req.user?.id, agentId);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get a scheduled task by ID' })
  @ApiResponse({ status: 200, description: 'Task detail' })
  async getTask(@Request() req: any, @Param('taskId') taskId: string) {
    return this.taskScheduler.getTask(req.user?.id, taskId);
  }

  @Post('tasks/:taskId/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pause a scheduled task' })
  @ApiResponse({ status: 200, description: 'Task paused' })
  async pauseTask(@Request() req: any, @Param('taskId') taskId: string) {
    return this.taskScheduler.pauseTask(req.user?.id, taskId);
  }

  @Post('tasks/:taskId/resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resume a paused task' })
  @ApiResponse({ status: 200, description: 'Task resumed' })
  async resumeTask(@Request() req: any, @Param('taskId') taskId: string) {
    return this.taskScheduler.resumeTask(req.user?.id, taskId);
  }

  @Delete('tasks/:taskId')
  @ApiOperation({ summary: 'Delete a scheduled task' })
  @ApiResponse({ status: 200, description: 'Task deleted' })
  async deleteTask(@Request() req: any, @Param('taskId') taskId: string) {
    await this.taskScheduler.deleteTask(req.user?.id, taskId);
    return { success: true };
  }

  // ── Operations Dashboard (Phase 5) ────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Get operations dashboard overview' })
  @ApiResponse({ status: 200, description: 'Dashboard overview' })
  async getDashboard(@Request() req: any) {
    return this.dashboard.getDashboardOverview(req.user?.id);
  }

  @Get('dashboard/channels')
  @ApiOperation({ summary: 'Get channel volume stats' })
  @ApiResponse({ status: 200, description: 'Channel volume' })
  async getChannelVolume(@Request() req: any) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    return this.dashboard.getChannelVolume(req.user?.id, since);
  }

  @Get('dashboard/agents/:agentId/response-time')
  @ApiOperation({ summary: 'Get response time stats for an agent' })
  @ApiResponse({ status: 200, description: 'Response time stats' })
  async getResponseTime(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Query('days') days?: number,
  ) {
    return this.dashboard.getResponseTimeStats(req.user?.id, agentId, days ?? 7);
  }
}
