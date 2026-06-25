import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserTokenQuota } from '../../entities/user-token-quota.entity';
import { TokenQuotaService } from './token-quota.service';
import { TokenQuotaController } from './token-quota.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserTokenQuota])],
  providers: [TokenQuotaService],
  controllers: [TokenQuotaController],
  exports: [TokenQuotaService],
})
export class TokenQuotaModule {}
