import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HookConfig } from '../../entities/hook-config.entity';
import { HookService } from './hook.service';
import { HookController } from './hook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HookConfig])],
  providers: [HookService],
  controllers: [HookController],
  exports: [HookService],
})
export class HookModule {}
