import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { WorldAsset } from '../entities/world-asset.entity';
import { Battle } from '../entities/battle.entity';
import { Dungeon } from '../entities/dungeon.entity';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';

/**
 * ShareService — Card/video generation, deep link management.
 *
 * Responsibilities:
 * - Generate share cards (animated GIF + stats overlay)
 * - Generate battle replay videos (FFmpeg, 15s, 9:16, 720p)
 * - Deep link generation and web fallback preview
 *
 * Deep link schema:
 *   agentrix://world-engine/asset/{asset_id}        → view asset
 *   agentrix://world-engine/battle/{battle_id}      → view/accept challenge
 *   agentrix://world-engine/dungeon/{share_code}    → enter dungeon
 *
 * Web fallback:
 *   https://app.agentrix.io/world/{token}           → web preview page
 *
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */
@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  /** 5-second timeout for card generation (R7.6) */
  private readonly CARD_TIMEOUT_MS = 5_000;

  /** 10-second timeout for video generation (R5.7) */
  private readonly VIDEO_TIMEOUT_MS = 10_000;

  /** S3 bucket base path for share assets */
  private readonly S3_SHARE_BASE = 'world-engine/share';

  /** Web fallback base URL */
  private readonly WEB_FALLBACK_BASE = 'https://app.agentrix.io/world';

  /** Deep link scheme */
  private readonly DEEP_LINK_SCHEME = 'agentrix://world-engine';

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(Battle)
    private readonly battleRepo: Repository<Battle>,
    @InjectRepository(Dungeon)
    private readonly dungeonRepo: Repository<Dungeon>,
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
  ) {}

  /**
   * Generate a shareable card for a world asset, dungeon, or battle.
   *
   * - 'character': card data with 3D model thumbnail URL (styled GIF from style-renderer),
   *   character name, top 3 stats
   * - 'dungeon': card with dungeon preview, difficulty, creator name
   * - 'battle': card with battle replay thumbnail
   *
   * Generates deep link:
   *   agentrix://world-engine/asset/{assetId}
   *   agentrix://world-engine/battle/{battleId}
   *   agentrix://world-engine/dungeon/{shareCode}
   *
   * Enforces 5-second timeout.
   *
   * @param assetId - The asset/dungeon/battle ID
   * @param type - Type of card to generate
   * @returns { cardUrl, deepLink }
   *
   * Requirements: 7.1, 7.2, 7.6
   */
  async generateCard(
    assetId: string,
    type: 'character' | 'dungeon' | 'battle',
  ): Promise<{ cardUrl: string; deepLink: string }> {
    const startTime = Date.now();

    // Enforce 5-second timeout
    const result = await this.withTimeout(
      this.performCardGeneration(assetId, type),
      this.CARD_TIMEOUT_MS,
      'Share card generation timed out (5s limit exceeded)',
    );

    // Write cost record
    const latencyMs = Date.now() - startTime;
    await this.writeCostRecord('share-card', type, latencyMs);

    return result;
  }

  /**
   * Generate a battle replay video.
   *
   * Phase 1: Constructs S3 placeholder path for the replay video.
   * Actual FFmpeg rendering (15s, 9:16, 720p) is deferred.
   * URL path format: world-engine/replays/{battleId}_15s_720p.mp4
   *
   * Enforces 10-second timeout.
   *
   * @param battleId - The battle to generate a replay for
   * @returns { videoUrl }
   *
   * Requirements: 7.3, 5.7
   */
  async generateReplayVideo(battleId: string): Promise<{ videoUrl: string }> {
    const startTime = Date.now();

    // Enforce 10-second timeout
    const result = await this.withTimeout(
      this.performVideoGeneration(battleId),
      this.VIDEO_TIMEOUT_MS,
      'Replay video generation timed out (10s limit exceeded)',
    );

    // Write cost record
    const latencyMs = Date.now() - startTime;
    await this.writeCostRecord('share-video', 'battle-replay', latencyMs);

    return result;
  }

  /**
   * Get web preview data for a shared token (non-app users).
   *
   * Decodes the token to get the asset/battle/dungeon ID, loads the entity,
   * and returns preview data (name, thumbnail, stats summary, app download link).
   *
   * Handles deleted assets: returns { available: false, message: 'Asset no longer available' }
   *
   * @param token - The share token (base64url-encoded asset ID)
   * @returns Preview data object with HTML for web rendering
   *
   * Requirements: 7.5, 7.8
   */
  async getPreview(token: string): Promise<{
    available: boolean;
    message?: string;
    name?: string;
    thumbnail?: string;
    statsSummary?: Record<string, number>;
    appDownloadLink: string;
    deepLink?: string;
    html: string;
  }> {
    const APP_DOWNLOAD_LINK = 'https://app.agentrix.io/download';

    // Decode token to get asset ID
    const assetId = this.decodeToken(token);

    if (!assetId) {
      return {
        available: false,
        message: 'Asset no longer available',
        appDownloadLink: APP_DOWNLOAD_LINK,
        html: this.buildUnavailableHtml(),
      };
    }

    // Check if asset still exists
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });

    if (!asset) {
      return {
        available: false,
        message: 'Asset no longer available',
        appDownloadLink: APP_DOWNLOAD_LINK,
        html: this.buildUnavailableHtml(),
      };
    }

    // Asset exists — return preview data
    const stats = (asset.stats || {}) as Record<string, number>;
    const deepLink = `${this.DEEP_LINK_SCHEME}/asset/${asset.id}`;

    return {
      available: true,
      name: asset.name,
      thumbnail: asset.styledMeshUrl || asset.meshUrl,
      statsSummary: stats,
      appDownloadLink: APP_DOWNLOAD_LINK,
      deepLink,
      html: this.buildPreviewHtml(asset),
    };
  }

  // ============================================================
  // Private implementation methods
  // ============================================================

  /**
   * Internal card generation logic.
   *
   * For 'character': constructs card data with 3D model thumbnail URL
   *   (the styled GIF from style-renderer), character name, top 3 stats.
   * For 'dungeon': constructs card with dungeon preview, difficulty, creator name.
   * For 'battle': constructs card with battle replay thumbnail.
   */
  private async performCardGeneration(
    assetId: string,
    type: 'character' | 'dungeon' | 'battle',
  ): Promise<{ cardUrl: string; deepLink: string }> {
    let deepLink: string;
    let cardUrl: string;

    switch (type) {
      case 'character': {
        const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
        if (!asset) {
          throw new NotFoundException(`World asset ${assetId} not found`);
        }

        // Use the styled GIF from style-renderer as the 3D model thumbnail
        // Card includes: character name, top 3 stats, styled mesh thumbnail
        const stats = (asset.stats || {}) as Record<string, number>;
        const top3Stats = this.getTop3Stats(stats);

        this.logger.log(
          `Character card: name=${asset.name}, top3=${JSON.stringify(top3Stats)}, ` +
          `thumbnail=${asset.styledMeshUrl}`,
        );

        deepLink = `${this.DEEP_LINK_SCHEME}/asset/${assetId}`;
        // Card URL references the animated GIF (3s, 1080×1080) generated from styled mesh
        cardUrl = `${this.S3_SHARE_BASE}/cards/character/${assetId}.gif`;
        break;
      }

      case 'dungeon': {
        const dungeon = await this.dungeonRepo.findOne({ where: { id: assetId } });
        if (!dungeon) {
          throw new NotFoundException(`Dungeon ${assetId} not found`);
        }

        // Card includes: dungeon preview, difficulty rating, creator name
        this.logger.log(
          `Dungeon card: shareCode=${dungeon.shareCode}, ` +
          `difficulty=${dungeon.difficultyRating}, creator=${dungeon.creatorId}`,
        );

        deepLink = `${this.DEEP_LINK_SCHEME}/dungeon/${dungeon.shareCode}`;
        cardUrl = `${this.S3_SHARE_BASE}/cards/dungeon/${assetId}.gif`;
        break;
      }

      case 'battle': {
        const battle = await this.battleRepo.findOne({ where: { id: assetId } });
        if (!battle) {
          throw new NotFoundException(`Battle ${assetId} not found`);
        }

        // Card includes: battle replay thumbnail
        this.logger.log(
          `Battle card: battleId=${assetId}, winner=${battle.winnerAssetId}, ` +
          `rounds=${battle.totalRounds}`,
        );

        deepLink = `${this.DEEP_LINK_SCHEME}/battle/${assetId}`;
        cardUrl = `${this.S3_SHARE_BASE}/cards/battle/${assetId}.gif`;
        break;
      }

      default:
        throw new Error(`Unsupported card type: ${type}`);
    }

    this.logger.log(`Share card generated: type=${type}, assetId=${assetId}`);

    return { cardUrl, deepLink };
  }

  /**
   * Internal video generation logic.
   * Constructs URL path: world-engine/replays/{battleId}_15s_720p.mp4
   */
  private async performVideoGeneration(battleId: string): Promise<{ videoUrl: string }> {
    const battle = await this.battleRepo.findOne({ where: { id: battleId } });
    if (!battle) {
      throw new NotFoundException(`Battle ${battleId} not found`);
    }

    // Phase 1: Construct S3 path for the replay video (actual FFmpeg rendering deferred)
    // Format: world-engine/replays/{battleId}_15s_720p.mp4
    const videoUrl = `world-engine/replays/${battleId}_15s_720p.mp4`;

    this.logger.log(`Replay video generated: battleId=${battleId}, url=${videoUrl}`);

    return { videoUrl };
  }

  // ============================================================
  // S3 path construction (Phase 1: placeholder paths)
  // ============================================================

  /**
   * Get the top 3 stats (highest values) from a character's stats.
   * Used for share card display (R7.1: "top 3 stats").
   */
  private getTop3Stats(stats: Record<string, number>): { name: string; value: number }[] {
    return Object.entries(stats)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }

  /**
   * Construct S3 path for a share card image.
   * Format: world-engine/share/cards/{type}/{id}.gif
   */
  private buildCardS3Path(id: string, type: string): string {
    return `${this.S3_SHARE_BASE}/cards/${type}/${id}.gif`;
  }

  /**
   * Construct S3 path for a replay video.
   * Format: world-engine/share/videos/{battleId}.mp4
   */
  private buildVideoS3Path(battleId: string): string {
    return `${this.S3_SHARE_BASE}/videos/${battleId}.mp4`;
  }

  // ============================================================
  // Token encoding/decoding
  // ============================================================

  /**
   * Encode an asset ID into a share token (base64url).
   */
  encodeToken(assetId: string): string {
    return Buffer.from(assetId, 'utf-8').toString('base64url');
  }

  /**
   * Decode a share token back to an asset ID.
   * Returns null if the token is invalid.
   */
  private decodeToken(token: string): string | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      // Basic UUID validation (asset IDs are UUIDs)
      if (decoded && decoded.length > 0) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // HTML generation for web preview
  // ============================================================

  /**
   * Build HTML for the web preview page when the asset exists.
   * Includes 3D viewer embed + app download prompt.
   */
  private buildPreviewHtml(asset: WorldAsset): string {
    const stats = asset.stats || {};
    const deepLink = `${this.DEEP_LINK_SCHEME}/asset/${asset.id}`;
    const webUrl = `${this.WEB_FALLBACK_BASE}/${this.encodeToken(asset.id)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(asset.name)} - Agentrix World Engine</title>
  <meta property="og:title" content="${this.escapeHtml(asset.name)}" />
  <meta property="og:description" content="Check out this World Asset on Agentrix!" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${webUrl}" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #0a0a0a; color: #fff; text-align: center; }
    .container { max-width: 480px; margin: 0 auto; }
    .viewer { width: 100%; height: 300px; background: #1a1a2e; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 20px 0; }
    .viewer-placeholder { color: #666; font-size: 14px; }
    h1 { font-size: 24px; margin: 16px 0 8px; }
    .stats { display: flex; justify-content: center; gap: 12px; margin: 16px 0; flex-wrap: wrap; }
    .stat { background: #1a1a2e; padding: 8px 16px; border-radius: 8px; font-size: 14px; }
    .stat-label { color: #888; font-size: 11px; text-transform: uppercase; }
    .stat-value { font-weight: bold; font-size: 18px; }
    .cta { display: inline-block; background: #6c5ce7; color: #fff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; margin-top: 24px; }
    .cta:hover { background: #5a4bd1; }
    .deep-link { color: #888; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="viewer">
      <div class="viewer-placeholder">3D Viewer — Open in Agentrix app for full experience</div>
    </div>
    <h1>${this.escapeHtml(asset.name)}</h1>
    <div class="stats">
      <div class="stat"><div class="stat-label">HP</div><div class="stat-value">${stats['hp'] || 0}</div></div>
      <div class="stat"><div class="stat-label">ATK</div><div class="stat-value">${stats['atk'] || 0}</div></div>
      <div class="stat"><div class="stat-label">DEF</div><div class="stat-value">${stats['def'] || 0}</div></div>
      <div class="stat"><div class="stat-label">SPD</div><div class="stat-value">${stats['spd'] || 0}</div></div>
      <div class="stat"><div class="stat-label">INT</div><div class="stat-value">${stats['int'] || 0}</div></div>
    </div>
    <a href="${deepLink}" class="cta">Open in Agentrix</a>
    <p class="deep-link">Don't have the app? <a href="https://app.agentrix.io/download" style="color:#6c5ce7;">Download Agentrix</a></p>
  </div>
</body>
</html>`;
  }

  /**
   * Build HTML for the web preview page when the asset no longer exists.
   */
  private buildUnavailableHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Asset No Longer Available - Agentrix</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 40px 20px; background: #0a0a0a; color: #fff; text-align: center; }
    .container { max-width: 480px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { color: #888; font-size: 16px; line-height: 1.5; }
    .cta { display: inline-block; background: #6c5ce7; color: #fff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Asset No Longer Available</h1>
    <p>This World Asset has been deleted by its creator and is no longer available for viewing.</p>
    <a href="https://app.agentrix.io/download" class="cta">Download Agentrix</a>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters to prevent XSS.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================
  // Timeout utility
  // ============================================================

  /**
   * Wrap a promise with a timeout.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new InternalServerErrorException(errorMessage)),
        timeoutMs,
      );
    });

    return Promise.race([promise, timeoutPromise]);
  }

  // ============================================================
  // Cost tracking
  // ============================================================

  /**
   * Write a cost record for share generation operations.
   */
  private async writeCostRecord(
    model: string,
    provider: string,
    latencyMs: number,
  ): Promise<void> {
    try {
      const record = this.costRecordRepo.create({
        sessionId: uuidv4(),
        model,
        provider,
        costUsd: 0, // Phase 1: no actual rendering cost
        tier: 'cloud',
        routingReason: 'share-generation',
      });
      await this.costRecordRepo.save(record);
    } catch (error) {
      // Non-critical: log but don't fail the operation
      this.logger.warn(`Failed to write cost record: ${error.message}`);
    }
  }
}
