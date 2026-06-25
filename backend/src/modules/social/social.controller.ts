import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { SocialService, CreatePostDto, CreateCommentDto, GetFeedQuery } from './social.service';
import {
  SocialPostType,
  SocialEventPlatform,
  SocialReplyStatus,
  ReplyStrategy,
} from '../../entities/social.entity';
import { TelegramBotService } from '../openclaw-connection/telegram-bot.service';
import { ChannelRegistry } from '../agent-presence/channel/channel-registry';

@ApiTags('social')
@Controller('social')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly telegramBotService: TelegramBotService,
    private readonly channelRegistry: ChannelRegistry,
  ) {}

  // ===== Feed =====

  @Get('posts')
  @ApiOperation({ summary: 'Get social feed (hot / latest / following)' })
  @ApiQuery({ name: 'sort', required: false, enum: ['hot', 'latest', 'following'] })
  @ApiQuery({ name: 'type', required: false, enum: SocialPostType })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFeed(
    @Request() req: any,
    @Query('sort') sort?: 'hot' | 'latest' | 'following',
    @Query('type') type?: SocialPostType,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.socialService.getFeed(req.user.id, { sort, type, page, limit });
  }

  // ===== Create Post =====

  @Post('posts')
  @ApiOperation({ summary: 'Create a social post' })
  async createPost(@Request() req: any, @Body() dto: CreatePostDto) {
    return this.socialService.createPost(
      req.user.id,
      req.user.name || req.user.email || 'User',
      req.user.avatar,
      dto,
    );
  }

  // ===== Single Post =====

  @Get('posts/:postId')
  @Public()
  @ApiOperation({ summary: 'Get a post by ID (public)' })
  async getPost(@Request() req: any, @Param('postId') postId: string) {
    return this.socialService.getPostById(postId, req.user?.id);
  }

  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own post' })
  async deletePost(@Request() req: any, @Param('postId') postId: string) {
    await this.socialService.deletePost(req.user.id, postId);
  }

  // ===== Comments =====

  @Get('posts/:postId/comments')
  @Public()
  @ApiOperation({ summary: 'List comments on a post' })
  async getComments(
    @Request() req: any,
    @Param('postId') postId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.socialService.getComments(postId, page, limit, req.user?.id);
  }

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'Add a comment to a post' })
  async addComment(
    @Request() req: any,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.socialService.addComment(
      req.user.id,
      req.user.name || req.user.email || 'User',
      postId,
      dto,
    );
  }

  // ===== Likes =====

  @Post('posts/:postId/like')
  @ApiOperation({ summary: 'Toggle like on a post' })
  async togglePostLike(@Request() req: any, @Param('postId') postId: string) {
    return this.socialService.toggleLike(req.user.id, postId, 'post');
  }

  @Post('posts/:postId/share')
  @ApiOperation({ summary: 'Record a successful post share' })
  async sharePost(@Param('postId') postId: string) {
    return this.socialService.incrementPostShare(postId);
  }

  @Post('comments/:commentId/like')
  @ApiOperation({ summary: 'Toggle like on a comment' })
  async toggleCommentLike(@Request() req: any, @Param('commentId') commentId: string) {
    return this.socialService.toggleLike(req.user.id, commentId, 'comment');
  }

  // ===== User Profiles =====

  @Get('users/:userId')
  @Public()
  @ApiOperation({ summary: 'Get a user public profile' })
  async getUserProfile(@Request() req: any, @Param('userId') userId: string) {
    return this.socialService.getUserProfile(userId, req.user?.id);
  }

  @Get('users/:userId/posts')
  @Public()
  @ApiOperation({ summary: "Get a user's public posts" })
  async getUserPosts(
    @Request() req: any,
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.socialService.getUserPosts(userId, page, limit, req.user?.id);
  }

  @Get('users/:userId/skills')
  @Public()
  @ApiOperation({ summary: "Get a user's published skills" })
  async getUserSkills(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.socialService.getUserSkills(userId, page, limit);
  }

  @Get('users/:userId/followers')
  @Public()
  @ApiOperation({ summary: "Get user's followers" })
  async getFollowers(@Param('userId') userId: string) {
    return this.socialService.getFollowers(userId);
  }

  @Get('users/:userId/following')
  @Public()
  @ApiOperation({ summary: 'Get accounts a user is following' })
  async getFollowing(@Param('userId') userId: string) {
    return this.socialService.getFollowing(userId);
  }

  // ===== Follow =====

  @Post('users/:userId/follow')
  @ApiOperation({ summary: 'Toggle follow / unfollow a user' })
  async toggleFollow(@Request() req: any, @Param('userId') userId: string) {
    return this.socialService.toggleFollow(req.user.id, userId);
  }

  @Get('users/:userId/is-following')
  @ApiOperation({ summary: 'Check if current user follows someone' })
  async isFollowing(@Request() req: any, @Param('userId') userId: string) {
    const following = await this.socialService.isFollowing(req.user.id, userId);
    return { following };
  }

  // ===== Agent Reputation =====

  @Get('users/:userId/reputation')
  @Public()
  @ApiOperation({ summary: 'Get agent reputation stats for a user' })
  async getAgentReputation(@Param('userId') userId: string) {
    const reputation = await this.socialService.getAgentReputation(userId);
    return { ok: true, data: reputation };
  }

  // ===== Agent Showcase Feed =====

  @Get('showcase')
  @ApiOperation({ summary: 'Get Agent Showcase feed (agent-generated content prioritized)' })
  @ApiQuery({ name: 'sort', required: false, enum: ['hot', 'latest', 'following'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getShowcaseFeed(
    @Request() req: any,
    @Query('sort') sort?: 'hot' | 'latest' | 'following',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.socialService.getShowcaseFeed(req.user.id, { sort, page, limit });
  }

  @Post('showcase/auto')
  @ApiOperation({ summary: 'Create an auto-generated showcase post (internal / webhook)' })
  async createAutoPost(@Request() req: any, @Body() body: {
    type: SocialPostType;
    content: string;
    referenceId?: string;
    referenceName?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  }) {
    return this.socialService.createAutoPost({
      userId: req.user.id,
      authorName: req.user.name || req.user.email || 'Agent',
      authorAvatar: req.user.avatar,
      ...body,
    });
  }

  // ===== Social Events =====

  @Get('events')
  @ApiOperation({ summary: 'Get social listener events for current user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEvents(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const events = await this.socialService.getSocialEvents(req.user.id, limit);
    return { ok: true, events };
  }

  @Get('events/pending')
  @ApiOperation({ summary: 'Get events pending reply approval' })
  async getPendingApprovals(@Request() req: any) {
    const events = await this.socialService.getPendingApprovals(req.user.id);
    return { ok: true, events };
  }

  @Post('events/:eventId/approve')
  @ApiOperation({ summary: 'Approve an agent draft reply' })
  async approveReply(
    @Request() req: any,
    @Param('eventId') eventId: string,
    @Body() body: { finalReply?: string },
  ) {
    const updated = await this.socialService.updateEventReply(eventId, {
      replyStatus: SocialReplyStatus.APPROVED,
      finalReply: body.finalReply,
    });

    const replyText = body.finalReply?.trim() || updated?.agentDraftReply || updated?.finalReply;
    if (!updated || !replyText) {
      return updated;
    }

    // Send reply via the appropriate platform adapter
    try {
      if (updated.platform === SocialEventPlatform.TELEGRAM) {
        await this.telegramBotService.send(Number(updated.senderId), replyText);
      } else {
        const adapter = this.channelRegistry.get(updated.platform);
        if (adapter) {
          await adapter.sendOutbound(updated.senderId, {
            content: replyText,
            replyToMessageId: updated.rawPayload?.id_str ?? updated.rawPayload?.id,
          });
        }
      }
      return this.socialService.updateEventReply(eventId, {
        replyStatus: SocialReplyStatus.SENT,
        finalReply: replyText,
        repliedAt: new Date(),
      });
    } catch {
      return this.socialService.updateEventReply(eventId, {
        replyStatus: SocialReplyStatus.FAILED,
        finalReply: replyText,
      });
    }
  }

  @Post('events/:eventId/reject')
  @ApiOperation({ summary: 'Reject an agent draft reply' })
  async rejectReply(@Param('eventId') eventId: string) {
    return this.socialService.updateEventReply(eventId, {
      replyStatus: SocialReplyStatus.REJECTED,
    });
  }

  // ===== Reply Config =====

  @Get('reply-config')
  @ApiOperation({ summary: 'Get social auto-reply configs for all platforms' })
  async getReplyConfigs(@Request() req: any) {
    const configs = await this.socialService.getReplyConfigs(req.user.id);
    return { ok: true, configs };
  }

  @Post('reply-config/:platform')
  @ApiOperation({ summary: 'Save auto-reply config for a platform' })
  async saveReplyConfig(
    @Request() req: any,
    @Param('platform') platform: SocialEventPlatform,
    @Body() body: {
      strategy?: ReplyStrategy;
      replyPrompt?: string;
      replyLanguage?: string;
      enabled?: boolean;
    },
  ) {
    const config = await this.socialService.saveReplyConfig(req.user.id, platform, body);
    return { ok: true, config };
  }
}
