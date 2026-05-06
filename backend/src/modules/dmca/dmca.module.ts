import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DmcaReport } from '../../entities/dmca-report.entity';
import { DmcaService } from './dmca.service';
import { DmcaController } from './dmca.controller';

/**
 * DmcaModule — Phase 2 W2 BE-T2.9.
 * 后续 Phase 3 集成：upheld → PetSkinService.delist; flaggedFalse → claimant 限流。
 */
@Module({
  imports: [TypeOrmModule.forFeature([DmcaReport])],
  controllers: [DmcaController],
  providers: [DmcaService],
  exports: [DmcaService],
})
export class DmcaModule {}
