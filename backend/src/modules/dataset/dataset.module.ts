import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [DatasetController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
