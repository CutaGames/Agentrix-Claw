import { Module } from '@nestjs/common';
import { SkillListingsService } from './skill-listings.service';
import { SkillListingsController } from './skill-listings.controller';

/** SkillListingsModule — 顿领 §11 Skill Marketplace (P2-6) */
@Module({
  controllers: [SkillListingsController],
  providers: [SkillListingsService],
  exports: [SkillListingsService],
})
export class SkillListingsModule {}
