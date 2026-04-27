import { Module } from '@nestjs/common';
import { AutoRepairController } from './auto-repair.controller';
import { AutoRepairService } from './auto-repair.service';

@Module({
  controllers: [AutoRepairController],
  providers: [AutoRepairService],
  exports: [AutoRepairService],
})
export class AutoRepairModule {}