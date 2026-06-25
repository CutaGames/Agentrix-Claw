import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ModelRouterService } from './model-router.service';

@Module({
  imports: [ConfigModule],
  providers: [ModelRouterService],
  exports: [ModelRouterService],
})
export class ModelRouterModule {}

