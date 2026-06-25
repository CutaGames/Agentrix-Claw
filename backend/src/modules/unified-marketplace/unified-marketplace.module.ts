/**
 * Unified Marketplace Module
 * 
 * V2.0: 统一市场模块 (Skill + Task)
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from '../../entities/skill.entity';
import { ExternalSkillMapping } from '../../entities/external-skill-mapping.entity';
import { SkillAnalytics } from '../../entities/skill-analytics.entity';
import { Cart } from '../../entities/cart.entity';
import { MerchantTask } from '../../entities/merchant-task.entity';
import { TaskBid } from '../../entities/task-bid.entity';
import { UnifiedMarketplaceService } from './unified-marketplace.service';
import { UnifiedMarketplaceController } from './unified-marketplace.controller';
import { SearchFallbackService } from './search-fallback.service';
import { CartService } from './cart.service';
import { SkillModule } from '../skill/skill.module';
import { UCPModule } from '../ucp/ucp.module';
import { AuthModule } from '../auth/auth.module';
import { MerchantTaskModule } from '../merchant-task/merchant-task.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Skill,
      ExternalSkillMapping,
      SkillAnalytics,
      Cart,
      MerchantTask,
      TaskBid,
    ]),
    forwardRef(() => SkillModule),
    forwardRef(() => UCPModule),
    forwardRef(() => AuthModule),
    forwardRef(() => MerchantTaskModule),
    forwardRef(() => CommissionModule),
  ],
  controllers: [UnifiedMarketplaceController],
  providers: [UnifiedMarketplaceService, SearchFallbackService, CartService],
  exports: [UnifiedMarketplaceService, SearchFallbackService, CartService],
})
export class UnifiedMarketplaceModule {}
