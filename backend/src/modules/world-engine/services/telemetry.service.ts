import { Injectable, Logger } from '@nestjs/common';

/**
 * Core funnel events for World Engine telemetry (Task 21.1).
 */
export type WorldEngineEvent =
  | 'scan_started'
  | 'scan_completed'
  | 'generation_started'
  | 'generation_completed'
  | 'character_regenerated'
  | 'asset_listed'
  | 'listing_purchased'
  | 'battle_started'
  | 'battle_completed'
  | 'share_card_generated'
  | 'deep_link_opened'
  | 'web_preview_loaded'
  | 'moderation_rejected'
  | 'quota_exceeded';

/**
 * Event payload with common fields + event-specific data.
 */
export interface TelemetryPayload {
  event: WorldEngineEvent;
  userId?: string;
  assetId?: string;
  sessionId?: string;
  /** Feature flag cohort tag (Task 21.3) */
  worldEngineFlagCohort?: string;
  /** Event-specific metadata */
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * TelemetryService — Core funnel event emission for World Engine.
 *
 * Implements:
 * - 21.1: Define and emit core funnel events
 * - 21.3: Wire feature flag cohort tagging into events
 *
 * Phase 1: Logs events to stdout (structured JSON).
 * Production: Wire into existing telemetry pipeline (Mixpanel/Amplitude/custom).
 *
 * Requirements: (cross-cutting)
 */
@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  /** Feature flag cohort for the current deployment (set by feature flag service) */
  private currentCohort: string = 'unknown';

  /**
   * Set the current feature flag cohort for event tagging (Task 21.3).
   */
  setCohort(cohort: string): void {
    this.currentCohort = cohort;
  }

  /**
   * Emit a telemetry event.
   *
   * Phase 1: Structured JSON log.
   * Production: Forward to telemetry pipeline.
   */
  emit(
    event: WorldEngineEvent,
    params?: {
      userId?: string;
      assetId?: string;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    },
  ): void {
    const payload: TelemetryPayload = {
      event,
      userId: params?.userId,
      assetId: params?.assetId,
      sessionId: params?.sessionId,
      worldEngineFlagCohort: this.currentCohort,
      metadata: params?.metadata,
      timestamp: new Date().toISOString(),
    };

    // Phase 1: Structured log output
    this.logger.log(`[TELEMETRY] ${JSON.stringify(payload)}`);
  }

  // ─── Convenience methods for common events ─────────────────────────

  emitScanStarted(userId: string, sessionId: string, scanMode: string): void {
    this.emit('scan_started', { userId, sessionId, metadata: { scanMode } });
  }

  emitScanCompleted(userId: string, sessionId: string, frameCount: number): void {
    this.emit('scan_completed', { userId, sessionId, metadata: { frameCount } });
  }

  emitGenerationStarted(userId: string, assetId: string, provider: string): void {
    this.emit('generation_started', { userId, assetId, metadata: { provider } });
  }

  emitGenerationCompleted(userId: string, assetId: string, latencyMs: number): void {
    this.emit('generation_completed', { userId, assetId, metadata: { latencyMs } });
  }

  emitCharacterRegenerated(userId: string, assetId: string, target: string): void {
    this.emit('character_regenerated', { userId, assetId, metadata: { target } });
  }

  emitAssetListed(userId: string, assetId: string, price: number, currency: string): void {
    this.emit('asset_listed', { userId, assetId, metadata: { price, currency } });
  }

  emitListingPurchased(userId: string, assetId: string, price: number, sellerId: string): void {
    this.emit('listing_purchased', { userId, assetId, metadata: { price, sellerId } });
  }

  emitBattleStarted(userId: string, challengerAssetId: string, defenderAssetId: string): void {
    this.emit('battle_started', { userId, metadata: { challengerAssetId, defenderAssetId } });
  }

  emitBattleCompleted(userId: string, battleId: string, winnerSide: string, rounds: number): void {
    this.emit('battle_completed', { userId, metadata: { battleId, winnerSide, rounds } });
  }

  emitShareCardGenerated(userId: string, assetId: string, cardType: string): void {
    this.emit('share_card_generated', { userId, assetId, metadata: { cardType } });
  }

  emitDeepLinkOpened(assetId: string, linkType: string): void {
    this.emit('deep_link_opened', { assetId, metadata: { linkType } });
  }

  emitWebPreviewLoaded(assetId: string): void {
    this.emit('web_preview_loaded', { assetId });
  }

  emitModerationRejected(userId: string, assetId: string, stage: string, reason: string): void {
    this.emit('moderation_rejected', { userId, assetId, metadata: { stage, reason } });
  }

  emitQuotaExceeded(userId: string, quotaType: string, limit: number): void {
    this.emit('quota_exceeded', { userId, metadata: { quotaType, limit } });
  }
}
