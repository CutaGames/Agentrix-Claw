import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../../entities/product.entity';
import { GroqIntegrationService } from './groq-integration.service';
import { GroqIntegrationController } from './groq-integration.controller';
import { AiCapabilityModule } from '../../ai-capability/ai-capability.module';

/**
 * Groq集成模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    forwardRef(() => AiCapabilityModule),
  ],
  controllers: [GroqIntegrationController],
  providers: [GroqIntegrationService],
  exports: [GroqIntegrationService],
})
export class GroqIntegrationModule {}

