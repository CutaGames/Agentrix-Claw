import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginController } from './plugin.controller';
import { PluginOwnedController } from './plugin-owned.controller';
import { PluginService } from './plugin.service';
import { PluginOwnedRuntimeService } from './plugin-owned-runtime.service';
import { Plugin } from '../../entities/plugin.entity';
import { UserPlugin } from '../../entities/user-plugin.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Plugin, UserPlugin, User])],
  controllers: [PluginController, PluginOwnedController],
  providers: [PluginService, PluginOwnedRuntimeService],
  exports: [PluginService, PluginOwnedRuntimeService],
})
export class PluginModule {}

