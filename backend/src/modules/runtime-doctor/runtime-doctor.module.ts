import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DesktopUpdateModule } from '../desktop-update/desktop-update.module';
import { ToolControlPlaneModule } from '../tool-control-plane/tool-control-plane.module';
import { RuntimeDoctorController } from './runtime-doctor.controller';
import { RuntimeDoctorService } from './runtime-doctor.service';

@Module({
  imports: [ConfigModule, DesktopUpdateModule, ToolControlPlaneModule],
  controllers: [RuntimeDoctorController],
  providers: [RuntimeDoctorService],
  exports: [RuntimeDoctorService],
})
export class RuntimeDoctorModule {}