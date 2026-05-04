import { Module } from '@nestjs/common';
import { FamilyAccountService } from './family-account.service';
import { FamilyAccountController } from './family-account.controller';

/** FamilyAccountModule — 顿领 §3.9 §12 (P3-5) */
@Module({
  controllers: [FamilyAccountController],
  providers: [FamilyAccountService],
  exports: [FamilyAccountService],
})
export class FamilyAccountModule {}
