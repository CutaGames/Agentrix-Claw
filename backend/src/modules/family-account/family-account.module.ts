import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyAccountEntity } from '../../entities/family-account.entity';
import { FamilyInvitationEntity } from '../../entities/family-invitation.entity';
import { FamilyMemberEntity } from '../../entities/family-member.entity';
import { FamilyPetEntity } from '../../entities/family-pet.entity';
import { HouseholdAgentEntity } from '../../entities/household-agent.entity';
import { FamilyAccountService } from './family-account.service';
import { FamilyAccountController } from './family-account.controller';

/** FamilyAccountModule — 顿领 §3.9 §12 (P3-5) */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FamilyAccountEntity,
      FamilyMemberEntity,
      FamilyInvitationEntity,
      FamilyPetEntity,
      HouseholdAgentEntity,
    ]),
  ],
  controllers: [FamilyAccountController],
  providers: [FamilyAccountService],
  exports: [FamilyAccountService],
})
export class FamilyAccountModule {}
