import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PetScanTask } from '../../../entities/pet-scan-task.entity';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import {
  MeshyScanProvider,
  Tripo3DScanProvider,
  TripoSRScanProvider,
  ScanProviderRouter,
} from './scan-providers';

/**
 * ScanModule — Multi-angle photo scan for 3D pet reconstruction.
 *
 * Provides:
 *   - POST /api/v1/pet-generation/scan          (submit)
 *   - GET  /api/v1/pet-generation/scan/:taskId  (poll)
 *   - POST /api/v1/pet-generation/scan/:taskId/cancel
 *
 * Provider selection via env: SCAN_PROVIDER=meshy|tripo3d|triposr
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PetScanTask]),
  ],
  controllers: [ScanController],
  providers: [
    ScanService,
    MeshyScanProvider,
    Tripo3DScanProvider,
    TripoSRScanProvider,
    ScanProviderRouter,
  ],
  exports: [ScanService, ScanProviderRouter],
})
export class ScanModule {}
