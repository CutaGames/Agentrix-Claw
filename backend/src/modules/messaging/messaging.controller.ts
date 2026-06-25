import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Patch,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService, SendDMDto } from './messaging.service';
import { AgentSpaceService } from './agent-space.service';
import { SpaceType } from '../../entities/agent-space.entity';

@ApiTags('Messaging')
@Controller('messaging')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly agentSpaceService: AgentSpaceService,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get all DM conversations for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of conversation summaries' })
  async getConversations(@Request() req) {
    const conversations = await this.messagingService.getConversations(req.user.id);
    return { success: true, data: conversations };
  }

  @Get('dm/:partnerId')
  @ApiOperation({ summary: 'Get messages in a DM conversation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getConversation(
    @Request() req,
    @Param('partnerId') partnerId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const result = await this.messagingService.getConversation(
      req.user.id,
      partnerId,
      Number(page),
      Number(limit),
    );
    return { success: true, ...result };
  }

  @Post('dm/:receiverId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a direct message' })
  async sendDM(
    @Request() req,
    @Param('receiverId') receiverId: string,
    @Body() body: { content: string },
  ) {
    const dto: SendDMDto = {
      receiverId,
      content: body.content,
    };
    const message = await this.messagingService.sendDM(req.user.id, dto);
    return { success: true, data: message };
  }

  @Patch('dm/:partnerId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all messages in a conversation as read' })
  async markAsRead(@Request() req, @Param('partnerId') partnerId: string) {
    await this.messagingService.markAsRead(req.user.id, partnerId);
    return { success: true };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread DM count' })
  async getUnreadCount(@Request() req) {
    const count = await this.messagingService.getUnreadCount(req.user.id);
    return { success: true, data: { count } };
  }

  // ── Agent Spaces (DB-persisted collaboration rooms) ─────────────────

  @Get('spaces')
  @ApiOperation({ summary: 'Get all agent spaces for current user' })
  async getSpaces(@Request() req) {
    const spaces = await this.agentSpaceService.getSpacesForUser(req.user.id);
    return { success: true, data: spaces };
  }

  @Post('spaces')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new agent space' })
  async createSpace(
    @Request() req,
    @Body() body: { name: string; description?: string; type?: string; taskId?: string; agentInstanceId?: string },
  ) {
    const space = await this.agentSpaceService.createSpace({
      name: body.name,
      description: body.description,
      ownerId: req.user.id,
      type: (body.type as SpaceType) || SpaceType.GENERAL,
      taskId: body.taskId,
      agentInstanceId: body.agentInstanceId,
    });
    return { success: true, data: space };
  }

  @Get('spaces/:spaceId')
  @ApiOperation({ summary: 'Get a specific agent space' })
  async getSpace(@Request() req, @Param('spaceId') spaceId: string) {
    const space = await this.agentSpaceService.getSpaceForUser(spaceId, req.user.id);
    return { success: true, data: space };
  }

  @Delete('spaces/:spaceId')
  @ApiOperation({ summary: 'Archive an agent space' })
  async archiveSpace(@Request() req, @Param('spaceId') spaceId: string) {
    await this.agentSpaceService.archiveSpace(spaceId, req.user.id);
    return { success: true };
  }

  @Post('spaces/:spaceId/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a member to an agent space' })
  async addMember(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Body() body: { userId: string },
  ) {
    await this.agentSpaceService.addMember(spaceId, req.user.id, body.userId);
    return { success: true };
  }

  @Delete('spaces/:spaceId/members/:userId')
  @ApiOperation({ summary: 'Remove a member from an agent space' })
  async removeMember(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Param('userId') userId: string,
  ) {
    await this.agentSpaceService.removeMember(spaceId, req.user.id, userId);
    return { success: true };
  }

  @Get('spaces/:spaceId/messages')
  @ApiOperation({ summary: 'Get messages in an agent space' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSpaceMessages(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const result = await this.agentSpaceService.getMessages(spaceId, req.user.id, Number(page), Number(limit));
    return { success: true, data: result.messages, total: result.total };
  }

  @Post('spaces/:spaceId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message to an agent space' })
  async sendSpaceMessage(
    @Request() req,
    @Param('spaceId') spaceId: string,
    @Body() body: { content: string; type?: string; metadata?: Record<string, any> },
  ) {
    const msg = await this.agentSpaceService.sendMessage({
      spaceId,
      senderId: req.user.id,
      senderName: req.user.nickname || req.user.email || req.user.id.substring(0, 8),
      content: body.content,
      type: body.type as any,
      metadata: body.metadata,
    });
    return { success: true, data: msg };
  }

  // Legacy group endpoint — redirects to Agent Space
  @Get('groups/:groupId/messages')
  @ApiOperation({ summary: '[Legacy] Get messages in a group chat — proxies to Agent Space' })
  async getGroupMessages(
    @Request() req,
    @Param('groupId') groupId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const result = await this.agentSpaceService.getMessages(groupId, req.user.id, Number(page), Number(limit));
    return { success: true, data: result.messages, total: result.total };
  }

  @Post('groups/:groupId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Legacy] Send a group message — proxies to Agent Space' })
  async sendGroupMessage(
    @Request() req,
    @Param('groupId') groupId: string,
    @Body() body: { content: string; type?: string },
  ) {
    const msg = await this.agentSpaceService.sendMessage({
      spaceId: groupId,
      senderId: req.user.id,
      senderName: req.user.nickname || req.user.email || req.user.id.substring(0, 8),
      content: body.content,
      type: body.type as any,
    });
    return { success: true, data: msg };
  }
}
