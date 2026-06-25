import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product } from '../../entities/product.entity';
import { SearchModule } from '../search/search.module';
import { AiCapabilityModule } from '../ai-capability/ai-capability.module';
import { SkillModule } from '../skill/skill.module';
import { ProductBatchImportController } from './product-batch-import.controller';
import { ProductBatchImportService } from './product-batch-import.service';
import { EcommerceSyncController } from './ecommerce-sync.controller';
import { EcommerceSyncService } from './ecommerce-sync.service';
import { EcommerceConnection } from '../../entities/ecommerce-connection.entity';
import { ProductSyncMapping } from '../../entities/product-sync-mapping.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      EcommerceConnection,
      ProductSyncMapping,
    ]),
    forwardRef(() => SearchModule),
    forwardRef(() => AiCapabilityModule),
    forwardRef(() => SkillModule), // 🔥 添加SkillModule以访问ProductSkillConverterService
  ],
  controllers: [
    ProductController,
    ProductBatchImportController,
    EcommerceSyncController,
  ],
  providers: [
    ProductService,
    ProductBatchImportService,
    EcommerceSyncService,
  ],
  exports: [ProductService, TypeOrmModule],
})
export class ProductModule {}

