import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationSocialService } from './creation-social.service';
import type {
  CommentCreationRequest,
  CommentCreationResponse,
  LikeCreationRequest,
  LikeCreationResponse,
  FollowCreatorRequest,
  FollowCreatorResponse,
  ShareCreationResponse,
  CreationComment,
} from '../../../../shared/types/creation-api';

/**
 * CreationSocialController — Creation 社交 REST 入口(world-creation-feed task 8.1)。
 *
 * spec: design §Components and Interfaces / 需求 8.1–8.4。
 *   - POST /v1/creations/:id/comment   留言(需求 8.1)
 *   - GET  /v1/creations/:id/comments  留言列表
 *   - POST /v1/creations/:id/like      点赞/取消(幂等,需求 8.2)
 *   - POST /v1/creations/:id/follow    关注/取关创作者(需求 8.3)
 *   - POST /v1/creations/:id/share     分享深链 + Web 预览兜底(需求 8.4)
 *
 * 鉴权 JwtAuthGuard;作者/点赞/关注主体一律取认证用户(防伪冒)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationSocialController {
  constructor(private readonly social: CreationSocialService) {}

  @Post(':id/comment')
  @ApiOperation({ summary: 'Comment on a Creation' })
  async comment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: CommentCreationRequest,
  ): Promise<CommentCreationResponse> {
    const accountId = req.user?.id ?? req.user?.sub;
    return this.social.comment(id, accountId, body.text, body.parentCommentId);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'List a Creation comments' })
  async comments(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: CreationComment[] }> {
    const items = await this.social.listComments(id, limit ? Number(limit) : undefined);
    return { items };
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like / unlike a Creation (idempotent)' })
  async like(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: LikeCreationRequest,
  ): Promise<LikeCreationResponse> {
    const accountId = req.user?.id ?? req.user?.sub;
    return this.social.like(id, accountId, body.liked);
  }

  @Post(':id/follow')
  @ApiOperation({ summary: 'Follow / unfollow the creator' })
  async follow(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: FollowCreatorRequest,
  ): Promise<FollowCreatorResponse> {
    const accountId = req.user?.id ?? req.user?.sub;
    return this.social.follow(id, accountId, body.following);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share a Creation (deep link + web preview fallback)' })
  async share(@Param('id') id: string): Promise<ShareCreationResponse> {
    return this.social.share(id);
  }

  @Post(':id/tip')
  @ApiOperation({ summary: 'Tip the creation owner (AXP, server-authoritative)' })
  async tip(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { amount?: number },
  ): Promise<{ ok: boolean; amount: number; toAccountId: string }> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.social.tip(id, userId, Number(body?.amount));
  }

  @Post(':id/purchase')
  @ApiOperation({ summary: 'Buy a shop offering (AXP, server-authoritative price)' })
  async purchase(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { offeringId?: string; qty?: number },
  ): Promise<{ ok: boolean; amount: number; offeringId: string; toAccountId: string }> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.social.purchase(id, userId, String(body?.offeringId ?? ''), Number(body?.qty ?? 1));
  }
}
