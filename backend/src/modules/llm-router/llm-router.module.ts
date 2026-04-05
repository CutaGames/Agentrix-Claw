import { Module } from '@nestjs/common';
import { LlmRouterService } from './llm-router.service';
import { LlmRouterController } from './llm-router.controller';

@Module({
  controllers: [LlmRouterController],
  providers: [LlmRouterService],
  exports: [LlmRouterService],
})
export class LlmRouterModule {}
