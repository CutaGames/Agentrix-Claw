import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';
import { Plugin } from '../../entities/plugin.entity';
import { UserPlugin } from '../../entities/user-plugin.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Plugin, UserPlugin, User])],
  controllers: [PluginController],
  providers: [PluginService],
  exports: [PluginService],
})
export class PluginModule {}

