import {
  Controller,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreationPublishService } from './creation-publish.service';
import type {
  PublishCreationRequest,
  PublishCreationResponse,
} from '../../../shared/types/creation-api';

/**
 * CreationPublishController — 发布 REST 入口(world-creation-feed task 2.3 接线)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - design §Components and Interfaces — `POST /v1/creations/:id/publish`
 *   - 需求 3.1(审核前置)/ 3.2(预览物必备)/ 3.6(shareCode)/ 1.11(派生 manifest)
 *
 * 编排逻辑全在 {@link CreationPublishService.publish}(审核门控 → 预览物 → offering/
 * manifest 派生 → 状态流转 → shareCode);控制器仅鉴权与透传。
 *
 * cn-region 增量审核:从请求头 `x-agentrix-region` 推断是否中国区,透传 opts.isChineseRegion。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationPublishController {
  constructor(private readonly publishService: CreationPublishService) {}

  /** POST /v1/creations/:id/publish — 审核→发布→shareCode + 派生 manifest。 */
  @Post(':id/publish')
  @ApiOperation({
    summary: 'Publish a Creation: moderation gate → require preview → derive offerings/manifest → shareCode',
  })
  async publish(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: PublishCreationRequest = {},
  ): Promise<PublishCreationResponse> {
    const region = (req.headers?.['x-agentrix-region'] ?? '').toString().toLowerCase();
    const isChineseRegion = region === 'cn' || region === 'china';
    return this.publishService.publish(id, body, { isChineseRegion });
  }
}
