import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnChainIndexerService } from './onchain-indexer.service';
import { OnChainIndexerController } from './onchain-indexer.controller';
import { Product } from '../../entities/product.entity';
import { ProductModule } from '../product/product.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    ProductModule,
    SearchModule,
  ],
  controllers: [OnChainIndexerController],
  providers: [OnChainIndexerService],
  exports: [OnChainIndexerService],
})
export class OnChainIndexerModule {}

