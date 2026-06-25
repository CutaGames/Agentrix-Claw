import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../entities/product.entity';
import { RAGAPIService } from './services/rag-api.service';
import { AIRAGController } from './ai-rag.controller';
import { SearchModule } from '../search/search.module';
import { RecommendationModule } from '../recommendation/recommendation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    forwardRef(() => SearchModule),
    forwardRef(() => RecommendationModule),
  ],
  controllers: [AIRAGController],
  providers: [RAGAPIService],
  exports: [RAGAPIService],
})
export class AIRAGModule {}

