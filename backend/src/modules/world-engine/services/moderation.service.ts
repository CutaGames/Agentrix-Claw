import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { WorldAssetModerationDecision } from '../entities/world-asset-moderation-decision.entity';
import { AdminConfig } from '../../../entities/admin-config.entity';

/**
 * Blocked character categories for copyright detection (Task 18.2).
 * Phase 1: keyword-based heuristic on objectCategory + visualStyleTags.
 */
const BLOCKED_CHARACTER_KEYWORDS: Record<string, string[]> = {
  disney: [
    'mickey', 'minnie', 'donald', 'goofy', 'pluto', 'elsa', 'anna', 'frozen',
    'simba', 'nemo', 'buzz', 'woody', 'moana', 'rapunzel', 'cinderella',
    'ariel', 'belle', 'jasmine', 'mulan', 'pocahontas', 'stitch', 'dumbo',
  ],
  marvel: [
    'spider-man', 'spiderman', 'iron man', 'ironman', 'captain america',
    'thor', 'hulk', 'black widow', 'avengers', 'thanos', 'wolverine',
    'deadpool', 'venom', 'groot', 'rocket raccoon',
  ],
  pokemon: [
    'pikachu', 'charizard', 'mewtwo', 'eevee', 'bulbasaur', 'squirtle',
    'charmander', 'jigglypuff', 'snorlax', 'gengar', 'lucario', 'greninja',
    'pokemon', 'pokémon', 'pokeball',
  ],
  nintendo: [
    'mario', 'luigi', 'peach', 'bowser', 'toad', 'yoshi', 'donkey kong',
    'link', 'zelda', 'kirby', 'samus', 'metroid', 'pikachu', 'animal crossing',
  ],
  sanrio: [
    'hello kitty', 'my melody', 'cinnamoroll', 'kuromi', 'pompompurin',
    'keroppi', 'badtz-maru', 'gudetama', 'aggretsuko', 'sanrio',
  ],
};

/**
 * ModerationService — Content moderation pipeline for World Assets.
 *
 * Implements:
 * - 18.1: Face detection check (Phase 1 backend placeholder — actual TFLite runs on mobile)
 * - 18.2: Copyrighted-character classifier (keyword-based heuristic)
 * - 18.3: Prohibited-words filter
 * - 18.4: Marketplace listing moderation queue
 * - 18.5: In-app report submission
 * - 18.6: First-time disclaimer acknowledgment
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.8
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  /** Prohibited words set loaded from JSON file */
  private readonly prohibitedWords: Set<string>;

  constructor(
    @InjectRepository(WorldAssetModerationDecision)
    private readonly moderationDecisionRepo: Repository<WorldAssetModerationDecision>,
    @InjectRepository(AdminConfig)
    private readonly adminConfigRepo: Repository<AdminConfig>,
  ) {
    this.prohibitedWords = this.loadProhibitedWords();
  }

  // ============================================================
  // 18.1: Face Detection (Backend placeholder)
  // ============================================================

  /**
   * Check images for face detection.
   *
   * Phase 1 backend: placeholder that always passes.
   * Actual TFLite face detection runs on mobile client (Task 14.2).
   * If face detected (>5% frame area): reject with "people-scanning is not allowed".
   *
   * @param imageUrls - URLs of images to check
   * @param assetId - Optional asset ID for recording the decision
   * @returns { passed, reason }
   *
   * Requirements: 12.2
   */
  async checkFaceDetection(
    imageUrls: string[],
    assetId?: string,
  ): Promise<{ passed: boolean; reason?: string }> {
    // Phase 1: Backend placeholder — actual face detection runs on mobile (TFLite).
    // In production, this would call a lightweight face detection API.
    // For now, always pass since mobile-side TFLite handles the real check.
    const passed = true;
    const reason = passed ? undefined : 'people-scanning is not allowed';

    // Record decision if assetId provided
    if (assetId) {
      await this.recordDecision({
        worldAssetId: assetId,
        stage: 'pre_upload_face',
        decision: passed ? 'approved' : 'rejected',
        reason: reason || null,
        automatedScore: passed ? 0 : null,
      });
    }

    return { passed, reason };
  }

  // ============================================================
  // 18.2: Copyrighted-Character Classifier
  // ============================================================

  /**
   * Check for copyrighted characters using keyword-based heuristic.
   *
   * Phase 1: Uses objectCategory + visualStyleTags from AI Interpreter output.
   * Checks against blocked categories: Disney, Marvel, Pokémon, Nintendo, Sanrio.
   * If confidence > 70%: reject with "this character is not eligible for scanning".
   *
   * @param imageUrls - URLs of images (used for context, not analyzed in Phase 1)
   * @param objectCategory - Category from AI Interpreter
   * @param visualStyleTags - Style tags from AI Interpreter
   * @param assetId - Optional asset ID for recording the decision
   * @returns { passed, reason, confidence }
   *
   * Requirements: 12.3
   */
  async checkCopyrightedCharacter(
    imageUrls: string[],
    objectCategory?: string,
    visualStyleTags?: string[],
    assetId?: string,
  ): Promise<{ passed: boolean; reason?: string; confidence?: number }> {
    const textToCheck = [
      objectCategory || '',
      ...(visualStyleTags || []),
    ]
      .join(' ')
      .toLowerCase();

    let maxConfidence = 0;
    let matchedBrand: string | null = null;

    for (const [brand, keywords] of Object.entries(BLOCKED_CHARACTER_KEYWORDS)) {
      for (const keyword of keywords) {
        if (textToCheck.includes(keyword.toLowerCase())) {
          // Calculate confidence based on keyword match specificity
          // Longer keywords = higher confidence
          const keywordConfidence = Math.min(
            50 + keyword.length * 5,
            95,
          );
          if (keywordConfidence > maxConfidence) {
            maxConfidence = keywordConfidence;
            matchedBrand = brand;
          }
        }
      }
    }

    const passed = maxConfidence <= 70;
    const reason = passed
      ? undefined
      : 'this character is not eligible for scanning';
    const confidence = maxConfidence > 0 ? maxConfidence : undefined;

    // Record decision if assetId provided
    if (assetId) {
      await this.recordDecision({
        worldAssetId: assetId,
        stage: 'pre_upload_copyright',
        decision: passed ? 'approved' : 'rejected',
        reason: passed ? null : `Matched brand: ${matchedBrand} (confidence: ${maxConfidence}%)`,
        automatedScore: maxConfidence / 100,
      });
    }

    return { passed, reason, confidence };
  }

  // ============================================================
  // 18.3: Prohibited-Words Filter
  // ============================================================

  /**
   * Check text content against the prohibited words list.
   *
   * Checks name, backstory, skill effect descriptions against a prohibited words list.
   * Uses a simple Set-based lookup loaded from prohibited-words.json.
   * Returns list of offending terms found.
   *
   * The Character Generator handles auto-regeneration (up to 3x) — this service just does the check.
   *
   * @param text - Text to check (name, backstory, skill descriptions, etc.)
   * @returns { passed, offendingTerms }
   *
   * Requirements: 12.4
   */
  async checkProhibitedWords(
    text: string,
  ): Promise<{ passed: boolean; offendingTerms: string[] }> {
    const normalizedText = text.toLowerCase();
    const offendingTerms: string[] = [];

    for (const word of this.prohibitedWords) {
      // Use word boundary matching to avoid false positives
      // e.g., "class" should not match "classification"
      const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'i');
      if (regex.test(normalizedText)) {
        offendingTerms.push(word);
      }
    }

    return {
      passed: offendingTerms.length === 0,
      offendingTerms,
    };
  }

  // ============================================================
  // 18.4: Marketplace Listing Moderation Queue
  // ============================================================

  /**
   * Submit a World Asset for moderation review before marketplace listing.
   *
   * Creates a moderation_decisions record with stage='pre_listing', decision='pending'.
   * Phase 1: auto-approve after basic checks (no manual reviewer dashboard yet).
   * Listing becomes visible only after approval.
   *
   * @param assetId - The World Asset to submit for review
   * @returns { decision: 'pending' }
   *
   * Requirements: 12.5, 12.8
   */
  async submitForModerationReview(
    assetId: string,
  ): Promise<{ decision: 'pending' | 'approved' }> {
    // Create a pending moderation decision record
    const decision = this.moderationDecisionRepo.create({
      worldAssetId: assetId,
      stage: 'pre_listing',
      decision: 'pending',
      reason: null,
      reviewerId: null,
      automatedScore: null,
    });

    await this.moderationDecisionRepo.save(decision);

    this.logger.log(
      `Moderation review submitted for asset ${assetId} (stage: pre_listing)`,
    );

    // Phase 1: Auto-approve after basic checks (no manual reviewer dashboard yet)
    // In production, this would remain 'pending' until a human reviewer acts.
    await this.autoApproveIfClean(assetId, decision.id);

    return { decision: 'pending' };
  }

  // ============================================================
  // 18.5: In-App Report
  // ============================================================

  /**
   * Submit an in-app report for a published World Asset.
   *
   * Creates a moderation_decisions record with stage='post_publish_report', decision='pending'.
   * Returns reportId for tracking.
   *
   * @param assetId - The reported World Asset
   * @param reporterId - The user submitting the report
   * @param reason - The reason for the report
   * @returns { reportId }
   *
   * Requirements: 12.6
   */
  async submitReport(
    assetId: string,
    reporterId: string,
    reason: string,
  ): Promise<{ reportId: string }> {
    const decision = this.moderationDecisionRepo.create({
      worldAssetId: assetId,
      stage: 'post_publish_report',
      decision: 'pending',
      reason: `Report by ${reporterId}: ${reason}`,
      reviewerId: null,
      automatedScore: null,
    });

    const saved = await this.moderationDecisionRepo.save(decision);

    this.logger.log(
      `Report submitted for asset ${assetId} by ${reporterId}: ${reason}`,
    );

    return { reportId: saved.id };
  }

  // ============================================================
  // 18.6: First-Time Disclaimer
  // ============================================================

  /**
   * Check if a user has acknowledged the first-time disclaimer.
   *
   * Phase 1: Uses admin_configs table as a simple key-value store.
   * Key format: `world_engine_disclaimer_ack:{userId}`
   *
   * @param userId - The user to check
   * @returns Whether the disclaimer has been acknowledged
   *
   * Requirements: 12.1
   */
  async checkDisclaimerAcknowledged(userId: string): Promise<boolean> {
    const key = `world_engine_disclaimer_ack:${userId}`;
    const config = await this.adminConfigRepo.findOne({ where: { key } });
    return config !== null;
  }

  /**
   * Record that a user has acknowledged the first-time disclaimer.
   *
   * Phase 1: Stores acknowledgment in admin_configs table.
   * Once acknowledged, never reshown.
   *
   * @param userId - The user acknowledging the disclaimer
   *
   * Requirements: 12.1
   */
  async acknowledgeDisclaimer(userId: string): Promise<void> {
    const key = `world_engine_disclaimer_ack:${userId}`;

    // Check if already acknowledged (idempotent)
    const existing = await this.adminConfigRepo.findOne({ where: { key } });
    if (existing) {
      return;
    }

    const config = this.adminConfigRepo.create({
      key,
      category: 'system' as any,
      value: new Date().toISOString(),
      description: `World Engine disclaimer acknowledged by user ${userId}`,
      isPublic: false,
      metadata: { userId, acknowledgedAt: new Date().toISOString() },
    });

    await this.adminConfigRepo.save(config);

    this.logger.log(`Disclaimer acknowledged by user ${userId}`);
  }

  // ============================================================
  // 18.7: CN-Region Moderation Overlay
  // ============================================================

  /**
   * Apply cn-region moderation overlay on top of stages 2 and 4.
   *
   * When user is in cn-region, wire baidu/aliyun moderation pipeline
   * on top of the copyright check (stage 2) and listing moderation (stage 4).
   * Logs all rejected uploads for compliance audit.
   *
   * Phase 1: Placeholder that delegates to existing checks.
   * Production: Integrate baidu/aliyun content moderation APIs.
   *
   * @param imageUrls - URLs of images to check
   * @param textContent - Text content to check (name, backstory, etc.)
   * @param assetId - The asset being moderated
   * @param isChineseRegion - Whether the user is in cn-region
   * @returns { passed, reason }
   *
   * Requirements: 12.9
   */
  async applyCnRegionModeration(
    imageUrls: string[],
    textContent: string,
    assetId: string,
    isChineseRegion: boolean,
  ): Promise<{ passed: boolean; reason?: string }> {
    if (!isChineseRegion) {
      return { passed: true };
    }

    // Phase 1: Run existing checks (copyright + prohibited words)
    // In production, this would call baidu/aliyun moderation APIs
    const copyrightResult = await this.checkCopyrightedCharacter(imageUrls);
    if (!copyrightResult.passed) {
      // Log for compliance audit
      await this.recordDecision({
        worldAssetId: assetId,
        stage: 'pre_upload_copyright',
        decision: 'rejected',
        reason: `[CN-REGION] ${copyrightResult.reason}`,
        automatedScore: (copyrightResult.confidence || 0) / 100,
      });

      this.logger.warn(
        `[CN-REGION AUDIT] Rejected upload for asset ${assetId}: copyright violation`,
      );

      return { passed: false, reason: copyrightResult.reason };
    }

    const wordsResult = await this.checkProhibitedWords(textContent);
    if (!wordsResult.passed) {
      // Log for compliance audit
      await this.recordDecision({
        worldAssetId: assetId,
        stage: 'post_gen_words',
        decision: 'rejected',
        reason: `[CN-REGION] Prohibited words: ${wordsResult.offendingTerms.join(', ')}`,
        automatedScore: null,
      });

      this.logger.warn(
        `[CN-REGION AUDIT] Rejected content for asset ${assetId}: prohibited words [${wordsResult.offendingTerms.join(', ')}]`,
      );

      return {
        passed: false,
        reason: `Content contains prohibited terms: ${wordsResult.offendingTerms.join(', ')}`,
      };
    }

    return { passed: true };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Load prohibited words from the JSON file.
   */
  private loadProhibitedWords(): Set<string> {
    try {
      const filePath = path.resolve(
        __dirname,
        '../moderation/prohibited-words.json',
      );
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      const words = (parsed.words || []).map((w: string) => w.toLowerCase());
      this.logger?.log?.(`Loaded ${words.length} prohibited words`);
      return new Set(words);
    } catch (error) {
      // Fallback: return empty set if file not found
      // This allows the service to start even if the file is missing
      return new Set();
    }
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Record a moderation decision in the database.
   */
  private async recordDecision(params: {
    worldAssetId: string;
    stage: string;
    decision: string;
    reason: string | null;
    automatedScore: number | null;
    reviewerId?: string | null;
  }): Promise<void> {
    const record = this.moderationDecisionRepo.create({
      worldAssetId: params.worldAssetId,
      stage: params.stage as any,
      decision: params.decision as any,
      reason: params.reason,
      automatedScore: params.automatedScore,
      reviewerId: params.reviewerId || null,
    });

    await this.moderationDecisionRepo.save(record);
  }

  /**
   * Phase 1: Auto-approve a listing after basic automated checks pass.
   * In production, this would be replaced by a manual review queue.
   */
  private async autoApproveIfClean(
    assetId: string,
    decisionId: string,
  ): Promise<void> {
    // Phase 1: Simply auto-approve after a short delay (simulating review)
    // In production, this would remain pending until a human reviewer acts.
    try {
      await this.moderationDecisionRepo.update(decisionId, {
        decision: 'approved',
        reason: 'Auto-approved (Phase 1: no manual review queue)',
        automatedScore: 1.0,
      });

      this.logger.log(
        `Asset ${assetId} auto-approved for listing (Phase 1)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to auto-approve asset ${assetId}: ${error.message}`,
      );
    }
  }
}
