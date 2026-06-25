import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * AeonMarketplaceController — 世界市场聚合门面(Task 3.9 / R23)。
 *
 * 不另造市场:把现有世界资产市场(`v1/marketplace/world-assets`)+ 皮肤市场
 * (`marketplace/:skinId/royalty-preview`)+ Skill 市场 聚合成"世界市场街区"的入口。
 * 本控制器只做**导航/聚合**(返回各市场入口与市场街区房间元信息);实际 listing/
 * purchase/royalty 仍走现有端点,结算经 AeonEconomyService(AXP/数字货币 + 合规)。
 *
 * 这样满足 R23.1(复用不另造)+ R23.2(市场街区入口),买卖/版税/两阶段提交沿用
 * 现有 marketplace 的成熟实现(R23.3-8)。
 */
@ApiTags('aeon/marketplace')
@Controller('v1/aeon/marketplace')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AeonMarketplaceController {
  /**
   * 市场街区聚合:返回各子市场的入口路径,供客户端在"市场街区"房间内渲染货架。
   * 复用现有后端,不重复实现 listing/purchase。
   */
  @Get('hub')
  @ApiOperation({ summary: '世界市场街区聚合入口' })
  hub(@Request() _req: any) {
    return {
      venueKind: 'market',
      sources: [
        {
          id: 'world-assets',
          label: '世界资产',
          browse: '/v1/marketplace/world-assets',
          listing: '/v1/marketplace/world-assets/listing',
          purchase: '/v1/marketplace/world-assets/:listingId/purchase',
        },
        {
          id: 'skins',
          label: '宠物皮肤',
          browse: '/v1/pet/skins/marketplace',
          royaltyPreview: '/v1/pet/skins/marketplace/:skinId/royalty-preview',
          install: '/v1/pet/skins/marketplace/:skinId/install',
        },
        {
          id: 'skills',
          label: '技能',
          browse: '/skills/marketplace',
          install: '/skills/:id/install',
        },
      ],
      // 结算说明:统一经 AeonEconomyService(AXP 或数字货币,受 Compliance_Gate),
      // 版税拆分复用现有 royalty-splitter;agent 买卖走 Trust3(R23.6/23.7)。
      settlement: { via: 'AeonEconomyService', currencies: ['AXP', 'USDC'], royalty: 'reused' },
    };
  }

  /**
   * 市场街区房间提示:返回该纪元的市场房间约定(客户端可据此进入 kind=market 房间)。
   * 真房间由 RoomService 在地块上创建(kind=market),此处给默认导航语义。
   */
  @Get('venue')
  @ApiOperation({ summary: '市场街区房间约定' })
  venue(@Query('epoch') epoch = 'earth') {
    return { epoch, kind: 'market', hint: '在市场街区房间内浏览货架并购买' };
  }
}
