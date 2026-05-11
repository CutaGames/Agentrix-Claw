import { Module } from '@nestjs/common';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { TierRouterService } from './tier-router.service';
import { TierRouterController } from './tier-router.controller';

/**
 * Cross-Device Compute Mesh — tier routing (Phase 1).
 * See docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05 §D-MESH.
 */
@Module({
  imports: [DesktopSyncModule],
  providers: [TierRouterService],
  controllers: [TierRouterController],
  exports: [TierRouterService],
})
export class TierRouterModule {}
