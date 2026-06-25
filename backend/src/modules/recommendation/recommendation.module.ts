import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationService } from './recommendation.service';
import { Product } from '../../entities/product.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { ProductModule } from '../product/product.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, UserProfile, AgentSession]),
    forwardRef(() => ProductModule),
    forwardRef(() => SearchModule),
  ],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}

