import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ClaimDesktopCommandDto,
  CompleteDesktopCommandDto,
  CreateDesktopCommandDto,
  CreateDesktopApprovalDto,
  DesktopHeartbeatDto,
  RespondDesktopApprovalDto,
  UpsertDesktopSessionDto,
  UpsertDesktopTaskDto,
  UploadDeviceMediaDto,
  CreateSharedWorkspaceDto,
  InviteToWorkspaceDto,
  RespondWorkspaceInviteDto,
  ShareSessionToWorkspaceDto,
  DeviceCapabilityDto,
} from './dto/desktop-sync.dto';
import { DesktopSyncService } from './desktop-sync.service';

@ApiTags('Desktop Sync')
@Controller('desktop-sync')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DesktopSyncController {
  constructor(private readonly desktopSyncService: DesktopSyncService) {}

  @Post('heartbeat')
  @ApiOperation({ summary: 'Update desktop presence and current lightweight context' })
  @ApiResponse({ status: 200, description: 'Desktop heartbeat accepted' })
  async heartbeat(@Request() req, @Body() dto: DesktopHeartbeatDto): Promise<any> {
    return this.desktopSyncService.heartbeat(req.user.id, dto);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create or update a desktop task session with timeline state' })
  @ApiResponse({ status: 200, description: 'Desktop task synced' })
  async upsertTask(@Request() req, @Body() dto: UpsertDesktopTaskDto): Promise<any> {
    return this.desktopSyncService.upsertTask(req.user.id, dto);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Create or update a synchronized desktop/mobile chat session snapshot' })
  @ApiResponse({ status: 200, description: 'Desktop session synced' })
  async upsertSession(@Request() req, @Body() dto: UpsertDesktopSessionDto): Promise<any> {
    return this.desktopSyncService.upsertSession(req.user.id, dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List synchronized desktop/mobile session summaries' })
  @ApiResponse({ status: 200, description: 'Desktop session summaries returned' })
  async listSessions(@Request() req): Promise<any> {
    return {
      sessions: await this.desktopSyncService.listSessions(req.user.id),
    };
  }

  @Get('devices/online')
  @ApiOperation({ summary: 'List online desktop devices for the current user' })
  @ApiResponse({ status: 200, description: 'Online devices returned' })
  async listOnlineDevices(@Request() req): Promise<any> {
    return {
      devices: await this.desktopSyncService.listOnlineDevices(req.user.id),
    };
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Fetch a synchronized desktop/mobile session snapshot' })
  @ApiResponse({ status: 200, description: 'Desktop session snapshot returned' })
  async getSession(@Request() req, @Param('sessionId') sessionId: string): Promise<any> {
    return this.desktopSyncService.getSession(req.user.id, sessionId);
  }

  @Post('approvals')
  @ApiOperation({ summary: 'Create a remote approval request for a desktop action' })
  @ApiResponse({ status: 201, description: 'Approval request created' })
  async createApproval(@Request() req, @Body() dto: CreateDesktopApprovalDto): Promise<any> {
    return this.desktopSyncService.createApproval(req.user.id, dto);
  }

  @Post('commands')
  @ApiOperation({ summary: 'Queue a remote desktop command for execution on a paired desktop device' })
  @ApiResponse({ status: 201, description: 'Desktop command queued' })
  async createCommand(@Request() req, @Body() dto: CreateDesktopCommandDto): Promise<any> {
    return this.desktopSyncService.createCommand(req.user.id, dto);
  }

  @Get('commands')
  @ApiOperation({ summary: 'List recent remote desktop commands' })
  @ApiResponse({ status: 200, description: 'Desktop commands returned' })
  async listCommands(@Request() req, @Query('deviceId') deviceId?: string): Promise<any> {
    return {
      commands: await this.desktopSyncService.listCommands(req.user.id, deviceId),
    };
  }

  @Get('commands/pending')
  @ApiOperation({ summary: 'List pending remote desktop commands for a device' })
  @ApiResponse({ status: 200, description: 'Pending desktop commands returned' })
  async getPendingCommands(@Request() req, @Query('deviceId') deviceId?: string): Promise<any> {
    return {
      commands: await this.desktopSyncService.getPendingCommands(req.user.id, deviceId),
    };
  }

  @Post('commands/:commandId/claim')
  @ApiOperation({ summary: 'Claim a pending remote desktop command for execution' })
  @ApiResponse({ status: 200, description: 'Desktop command claimed' })
  async claimCommand(
    @Request() req,
    @Param('commandId') commandId: string,
    @Body() dto: ClaimDesktopCommandDto,
  ): Promise<any> {
    return this.desktopSyncService.claimCommand(req.user.id, commandId, dto);
  }

  @Post('commands/:commandId/complete')
  @ApiOperation({ summary: 'Complete a remote desktop command with a result payload' })
  @ApiResponse({ status: 200, description: 'Desktop command completion accepted' })
  async completeCommand(
    @Request() req,
    @Param('commandId') commandId: string,
    @Body() dto: CompleteDesktopCommandDto,
  ): Promise<any> {
    return this.desktopSyncService.completeCommand(req.user.id, commandId, dto);
  }

  @Post('approvals/:approvalId/respond')
  @ApiOperation({ summary: 'Approve or reject a remote desktop approval request' })
  @ApiResponse({ status: 200, description: 'Approval response accepted' })
  async respondToApproval(
    @Request() req,
    @Param('approvalId') approvalId: string,
    @Body() dto: RespondDesktopApprovalDto,
  ): Promise<any> {
    return this.desktopSyncService.respondToApproval(req.user.id, approvalId, dto);
  }

  @Get('approvals/pending')
  @ApiOperation({ summary: 'List pending remote approvals for the current user' })
  @ApiResponse({ status: 200, description: 'Pending approvals returned' })
  async getPendingApprovals(@Request() req, @Query('deviceId') deviceId?: string): Promise<any> {
    return {
      approvals: await this.desktopSyncService.getPendingApprovals(req.user.id, deviceId),
    };
  }

  @Get('state')
  @ApiOperation({ summary: 'Get current desktop sync snapshot for devices, tasks, and approvals' })
  @ApiResponse({ status: 200, description: 'Desktop sync snapshot returned' })
  async getState(@Request() req): Promise<any> {
    return this.desktopSyncService.getState(req.user.id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P8.1 — Unified Session History
  // ═══════════════════════════════════════════════════════════════════════

  @Get('sessions/unified')
  @ApiOperation({ summary: 'Get unified cross-device session history' })
  @ApiResponse({ status: 200, description: 'Unified session history returned' })
  async getUnifiedSessionHistory(@Request() req, @Query('limit') limit?: string): Promise<any> {
    return {
      sessions: await this.desktopSyncService.getUnifiedSessionHistory(
        req.user.id,
        limit ? parseInt(limit, 10) : undefined,
      ),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P8.2 — Remote Control Enhanced
  // ═══════════════════════════════════════════════════════════════════════

  @Post('notify-completion')
  @ApiOperation({ summary: 'Notify all devices that an agent task is completed' })
  @ApiResponse({ status: 200, description: 'Completion notification sent' })
  async notifyAgentCompletion(
    @Request() req,
    @Body() body: { sessionId: string; deviceId: string; summary: string },
  ): Promise<any> {
    await this.desktopSyncService.notifyAgentCompletion(
      req.user.id, body.sessionId, body.deviceId, body.summary,
    );
    return { ok: true };
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Get all device capabilities for the current user' })
  @ApiResponse({ status: 200, description: 'Device capabilities returned' })
  async getDeviceCapabilities(@Request() req): Promise<any> {
    return {
      devices: await this.desktopSyncService.getDeviceCapabilities(req.user.id),
    };
  }

  @Post('capabilities')
  @ApiOperation({ summary: 'Update device capability context (GPS, sensors)' })
  @ApiResponse({ status: 200, description: 'Capability context updated' })
  async updateDeviceCapabilities(@Request() req, @Body() dto: DeviceCapabilityDto): Promise<any> {
    return this.desktopSyncService.updateDeviceCapabilityContext(
      req.user.id, dto.deviceId, dto.capabilities, dto.gps, dto.sensors,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P8.3 — Device Media Transfer
  // ═══════════════════════════════════════════════════════════════════════

  @Post('media')
  @ApiOperation({ summary: 'Upload media from a device for cross-device sharing' })
  @ApiResponse({ status: 201, description: 'Media transfer created' })
  async uploadDeviceMedia(@Request() req, @Body() dto: UploadDeviceMediaDto): Promise<any> {
    return this.desktopSyncService.uploadDeviceMedia(req.user.id, dto);
  }

  @Get('media')
  @ApiOperation({ summary: 'List recent device media transfers' })
  @ApiResponse({ status: 200, description: 'Media transfers returned' })
  async listDeviceMedia(
    @Request() req,
    @Query('deviceId') deviceId?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    return {
      transfers: await this.desktopSyncService.getDeviceMediaTransfers(
        req.user.id, deviceId, limit ? parseInt(limit, 10) : undefined,
      ),
    };
  }

  @Get('media/:transferId')
  @ApiOperation({ summary: 'Get media transfer data (base64)' })
  @ApiResponse({ status: 200, description: 'Media data returned' })
  async getDeviceMediaData(@Request() req, @Param('transferId') transferId: string): Promise<any> {
    return this.desktopSyncService.getDeviceMediaData(req.user.id, transferId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // P8.4 — Shared Workspace (Team Collaboration)
  // ═══════════════════════════════════════════════════════════════════════

  @Post('workspaces')
  @ApiOperation({ summary: 'Create a shared agent workspace' })
  @ApiResponse({ status: 201, description: 'Shared workspace created' })
  async createSharedWorkspace(@Request() req, @Body() dto: CreateSharedWorkspaceDto): Promise<any> {
    return this.desktopSyncService.createSharedWorkspace(req.user.id, dto.name, dto.description);
  }

  @Get('workspaces')
  @ApiOperation({ summary: 'List shared workspaces the user belongs to' })
  @ApiResponse({ status: 200, description: 'Shared workspaces returned' })
  async listSharedWorkspaces(@Request() req): Promise<any> {
    return {
      workspaces: await this.desktopSyncService.listSharedWorkspaces(req.user.id),
    };
  }

  @Post('workspaces/:workspaceId/invite')
  @ApiOperation({ summary: 'Invite a user to a shared workspace' })
  @ApiResponse({ status: 201, description: 'Invitation sent' })
  async inviteToWorkspace(
    @Request() req,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InviteToWorkspaceDto,
  ): Promise<any> {
    return this.desktopSyncService.inviteToWorkspace(req.user.id, workspaceId, dto.userId, dto.role as any);
  }

  @Post('workspaces/:workspaceId/respond')
  @ApiOperation({ summary: 'Accept or decline a workspace invitation' })
  @ApiResponse({ status: 200, description: 'Invitation response recorded' })
  async respondWorkspaceInvite(
    @Request() req,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RespondWorkspaceInviteDto,
  ): Promise<any> {
    return this.desktopSyncService.respondToWorkspaceInvite(req.user.id, workspaceId, dto.action);
  }

  @Post('workspaces/:workspaceId/sessions')
  @ApiOperation({ summary: 'Share a session to a workspace' })
  @ApiResponse({ status: 201, description: 'Session shared to workspace' })
  async shareSessionToWorkspace(
    @Request() req,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ShareSessionToWorkspaceDto,
  ): Promise<any> {
    return this.desktopSyncService.shareSessionToWorkspace(req.user.id, workspaceId, dto.sessionId, dto.title);
  }

  @Get('workspaces/:workspaceId/sessions')
  @ApiOperation({ summary: 'List sessions shared in a workspace' })
  @ApiResponse({ status: 200, description: 'Workspace sessions returned' })
  async getWorkspaceSessions(
    @Request() req,
    @Param('workspaceId') workspaceId: string,
  ): Promise<any> {
    return {
      sessions: await this.desktopSyncService.getWorkspaceSessions(req.user.id, workspaceId),
    };
  }

  @Get('workspaces/:workspaceId/members')
  @ApiOperation({ summary: 'List workspace members' })
  @ApiResponse({ status: 200, description: 'Workspace members returned' })
  async getWorkspaceMembers(
    @Request() req,
    @Param('workspaceId') workspaceId: string,
  ): Promise<any> {
    return {
      members: await this.desktopSyncService.getWorkspaceMembers(req.user.id, workspaceId),
    };
  }
}