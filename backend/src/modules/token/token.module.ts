import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';
import { Token } from '../../entities/token.entity';
import { ProductModule } from '../product/product.module';
import { ContractModule } from '../contract/contract.module';
import { MetadataModule } from '../metadata/metadata.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    forwardRef(() => ProductModule),
    ContractModule,
    MetadataModule,
  ],
  controllers: [TokenController],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}

