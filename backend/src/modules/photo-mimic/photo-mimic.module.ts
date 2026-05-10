import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhotoMimicSeason } from '../../entities/photo-mimic-season.entity';
import { PhotoMimicEntry } from '../../entities/photo-mimic-entry.entity';
import { PhotoMimicVote } from '../../entities/photo-mimic-vote.entity';
import { PhotoMimicService } from './photo-mimic.service';
import { PhotoMimicController } from './photo-mimic.controller';
import { AxpModule } from '../axp/axp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhotoMimicSeason, PhotoMimicEntry, PhotoMimicVote]),
    AxpModule,
  ],
  controllers: [PhotoMimicController],
  providers: [PhotoMimicService],
  exports: [PhotoMimicService],
})
export class PhotoMimicModule {}
