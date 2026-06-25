import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { EmbeddingService } from './embedding.service';
import { VectorDbService } from './vector-db.service';
import { CacheModule } from '../cache/cache.module';
import { Payment } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import { Product } from '../../entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, Product]),
    CacheModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, EmbeddingService, VectorDbService],
  exports: [SearchService, EmbeddingService, VectorDbService],
})
export class SearchModule {}

