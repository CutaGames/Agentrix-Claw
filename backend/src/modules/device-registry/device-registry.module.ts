import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../../entities/device.entity';
import { OtaPackage } from '../../entities/ota-package.entity';
import { DeviceRegistryService } from './device-registry.service';
import { OtaService } from './ota.service';
import { DeviceRegistryController } from './device-registry.controller';
import { MqttAuthnController } from './mqtt-authn.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Device, OtaPackage])],
  providers: [DeviceRegistryService, OtaService],
  controllers: [DeviceRegistryController, MqttAuthnController],
  exports: [DeviceRegistryService, OtaService],
})
export class DeviceRegistryModule {}
