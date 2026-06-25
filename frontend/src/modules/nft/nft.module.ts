import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NFTController } from './nft.controller';
import { NFTService } from './nft.service';
import { NFTCollection } from '../../entities/nft-collection.entity';
import { NFT } from '../../entities/nft.entity';
import { ProductModule } from '../product/product.module';
import { ContractModule } from '../contract/contract.module';
import { MetadataModule } from '../metadata/metadata.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NFTCollection, NFT]),
    forwardRef(() => ProductModule),
    ContractModule,
    MetadataModule,
  ],
  controllers: [NFTController],
  providers: [NFTService],
  exports: [NFTService],
})
export class NFTModule {}

