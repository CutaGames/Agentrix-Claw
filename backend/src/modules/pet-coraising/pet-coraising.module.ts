import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetCoRaisingInvite } from '../../entities/pet-coraising-invite.entity';
import { PetCoRaisingFeed } from '../../entities/pet-coraising-feed.entity';
import { PetCoRaisingService } from './pet-coraising.service';
import { PetCoRaisingController } from './pet-coraising.controller';
import { AxpModule } from '../axp/axp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PetCoRaisingInvite, PetCoRaisingFeed]),
    AxpModule,
  ],
  controllers: [PetCoRaisingController],
  providers: [PetCoRaisingService],
  exports: [PetCoRaisingService],
})
export class PetCoRaisingModule {}
