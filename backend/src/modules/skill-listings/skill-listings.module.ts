import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillInvokeEntity } from '../../entities/skill-invoke.entity';
import { SkillListingEntity } from '../../entities/skill-listing.entity';
import { SkillListingsService } from './skill-listings.service';
import { SkillListingsController } from './skill-listings.controller';

/** SkillListingsModule — 顿领 §11 Skill Marketplace (P2-6) */
@Module({
  imports: [TypeOrmModule.forFeature([SkillListingEntity, SkillInvokeEntity])],
  controllers: [SkillListingsController],
  providers: [SkillListingsService],
  exports: [SkillListingsService],
})
export class SkillListingsModule {}
