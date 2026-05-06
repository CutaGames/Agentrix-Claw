import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmcaReport } from '../../entities/dmca-report.entity';
import { DmcaService } from './dmca.service';
import { DmcaController } from './dmca.controller';
import { DmcaAbuseLimiterService } from './dmca-abuse-limiter.service';
import { PetSkinModule } from '../pet-skin/pet-skin.module';

/**
 * DmcaModule — Phase 2 W2 BE-T2.9 + W3 upheld→delist hookup + Phase 3 W3 abuse limiter (SC-T3.4)
 */
@Module({
  imports: [TypeOrmModule.forFeature([DmcaReport]), PetSkinModule],
  controllers: [DmcaController],
  providers: [DmcaService, DmcaAbuseLimiterService],
  exports: [DmcaService, DmcaAbuseLimiterService],
})
export class DmcaModule {}
