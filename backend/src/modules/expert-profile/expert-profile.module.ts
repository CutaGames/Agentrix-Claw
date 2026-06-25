import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpertProfileController } from './expert-profile.controller';
import { ExpertProfileService } from './expert-profile.service';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [ExpertProfileController],
  providers: [ExpertProfileService],
  exports: [ExpertProfileService],
})
export class ExpertProfileModule {}
