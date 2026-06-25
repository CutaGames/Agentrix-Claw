import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerApp } from '../../entities/partner-app.entity';
import { PartnerAppUsage } from '../../entities/partner-app-usage.entity';
import { PartnerAppService } from './partner-app.service';
import { PartnerAppController, PartnerRuntimeController } from './partner-app.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PartnerApp, PartnerAppUsage])],
  providers: [PartnerAppService],
  controllers: [PartnerAppController, PartnerRuntimeController],
  exports: [PartnerAppService],
})
export class PartnerAppModule {}
