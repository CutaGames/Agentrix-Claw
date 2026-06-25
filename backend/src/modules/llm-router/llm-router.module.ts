import { Module } from '@nestjs/common';
import { LlmRouterService } from './llm-router.service';
import { LlmRouterController } from './llm-router.controller';
import { TierResolverService } from './tier-resolver.service';

@Module({
  controllers: [LlmRouterController],
  providers: [LlmRouterService, TierResolverService],
  exports: [LlmRouterService, TierResolverService],
})
export class LlmRouterModule {}
