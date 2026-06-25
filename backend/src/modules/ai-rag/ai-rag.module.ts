import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../entities/product.entity';
import { RAGAPIService } from './services/rag-api.service';
import { AiRagService } from './ai-rag.service';
import { AIRAGController } from './ai-rag.controller';
import { KnowledgeController } from './knowledge.controller';
import { SearchModule } from '../search/search.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { GeminiIntegrationModule } from '../ai-integration/gemini/gemini-integration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    forwardRef(() => SearchModule),
    forwardRef(() => RecommendationModule),
    GeminiIntegrationModule,
  ],
  controllers: [AIRAGController, KnowledgeController],
  providers: [RAGAPIService, AiRagService],
  exports: [RAGAPIService, AiRagService],
})
export class AIRAGModule {}

