import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetSoulTemplate } from '../../entities/pet-soul-template.entity';
import { PetSoulTemplateService } from './pet-soul-template.service';
import { PetSoulTemplateController } from './pet-soul-template.controller';
import { PetGenQuotaModule } from '../pet-gen-quota/pet-gen-quota.module';

/**
 * PetSoulTemplateModule — 灵魂模板（人格 / 族群）
 *
 * Phase 1 W1：A 族群 7 只通过 migration seed 落库。
 * 后续 Phase：B/C/D/E/F 族群陆续按月度 milestone 解锁。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PetSoulTemplate]), PetGenQuotaModule],
  controllers: [PetSoulTemplateController],
  providers: [PetSoulTemplateService],
  exports: [PetSoulTemplateService],
})
export class PetSoulTemplateModule {}
