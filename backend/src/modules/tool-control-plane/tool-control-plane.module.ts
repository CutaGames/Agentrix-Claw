import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ToolRegistryModule } from '../tool-registry/tool-registry.module';
import { ToolControlPlaneController } from './tool-control-plane.controller';
import { ToolControlPlaneService } from './tool-control-plane.service';

@Module({
  imports: [ConfigModule, ToolRegistryModule],
  controllers: [ToolControlPlaneController],
  providers: [ToolControlPlaneService],
  exports: [ToolControlPlaneService],
})
export class ToolControlPlaneModule {}