import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetGreetingCard } from '../../entities/pet-greeting-card.entity';
import { PetGreetingService } from './pet-greeting.service';
import { PetGreetingController } from './pet-greeting.controller';
import { AxpModule } from '../axp/axp.module';

@Module({
  imports: [TypeOrmModule.forFeature([PetGreetingCard]), AxpModule],
  controllers: [PetGreetingController],
  providers: [PetGreetingService],
  exports: [PetGreetingService],
})
export class PetGreetingModule {}
