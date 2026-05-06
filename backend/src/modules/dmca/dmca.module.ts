import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmcaReport } from '../../entities/dmca-report.entity';
import { DmcaService } from './dmca.service';
import { DmcaController } from './dmca.controller';
import { PetSkinModule } from '../pet-skin/pet-skin.module';

/**
 * DmcaModule — Phase 2 W2 BE-T2.9 + W3 upheld→delist hookup
 */
@Module({
  imports: [TypeOrmModule.forFeature([DmcaReport]), PetSkinModule],
  controllers: [DmcaController],
  providers: [DmcaService],
  exports: [DmcaService],
})
export class DmcaModule {}
