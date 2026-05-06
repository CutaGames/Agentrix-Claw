import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';
import { PetGenQuotaService } from './pet-gen-quota.service';
import { PetGenQuotaController } from './pet-gen-quota.controller';

/**
 * PetGenQuotaModule — Phase 2 W1 配额账本（骨架）
 * Phase 2 W2 接入：StripeBillingService / PetCreatorService.consume()
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetGenQuota])],
  controllers: [PetGenQuotaController],
  providers: [PetGenQuotaService],
  exports: [PetGenQuotaService],
})
export class PetGenQuotaModule {}
