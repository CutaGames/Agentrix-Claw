import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { Workspace } from '../../entities/workspace.entity';
import { PetTeamService } from './pet-team.service';
import { PetTeamController } from './pet-team.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PetTeamMember, LivingPet, Workspace])],
  providers: [PetTeamService],
  controllers: [PetTeamController],
  exports: [PetTeamService],
})
export class PetTeamModule {}
