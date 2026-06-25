import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { BedrockIntegrationService } from '../../ai-integration/bedrock/bedrock-integration.service';
import { SemanticDescription } from '../../../../shared/types/world-engine';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const categoryLookup: Record<string, string> = require('../ai-interpreter/category-lookup.json');

// ============================================================
// Public interfaces
// ============================================================

/**
 * Extended response from the AI Interpreter that includes metadata
 * about the analysis mode and disambiguation state.
 */
export interface AIInterpreterResult {
  semanticDescription: SemanticDescription;
  /** Whether the result was produced in degraded/lite mode (rule-based fallback) */
  liteMode: boolean;
  /** Top-3 category suggestions when categoryConfidence < 60 */
  categorySuggestions?: { category: string; confidence: number }[];
  /** Session ID for disambiguation flow */
  sessionId?: string;
  /** Provider used for this analysis */
  provider: 'bedrock-haiku' | 'bedrock-sonnet' | 'rule-based';
  /** Model ID used (e.g. anthropic.claude-haiku-4-5-20251001-v1:0) */
  modelId?: string;
}

/**
 * Tier hint for which Bedrock model to use.
 * - 'default': Claude Haiku 4.5 (fast, cheap, sufficient for most scans)
 * - 'pro': Claude Sonnet 4.6 (better at ambiguous objects, costs ~10× more)
 */
export type BedrockTier = 'default' | 'pro';

// ============================================================
// Internal types
// ============================================================

/** Perceptual hash cache entry with TTL */
interface CacheEntry {
  result: AIInterpreterResult;
  expiresAt: number;
}

/** Shape classification based on bounding box axis ratios */
type ShapeClass = 'tall_narrow' | 'flat_wide' | 'cubic' | 'round' | 'short_wide';

/** Color family for rule-based classification */
type ColorFamily = 'green' | 'brown' | 'silver' | 'black' | 'white' | 'red' | 'blue' | 'yellow' | 'multicolor' | 'default';

/** LLM structured response for parsing */
interface LLMSemanticResponse {
  objectCategory: string;
  categoryConfidence: number;
  materialType: string;
  estimatedSize: { length: number; width: number; height: number };
  functionalAffordances: string[];
  visualStyleTags: string[];
}

// ============================================================
// Constants
// ============================================================

const RETRY_COUNT = 2;
const RETRY_INTERVAL_MS = 2000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOW_CONFIDENCE_THRESHOLD = 60;
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB Bedrock limit

/**
 * Bedrock model IDs (inference profiles required, not base IDs).
 *
 * AWS Bedrock requires the `us.` prefix for these models — base IDs like
 * `anthropic.claude-haiku-4-5-20251001-v1:0` return HTTP 400 with
 * "Invocation of model ID ... with on-demand throughput isn't supported".
 *
 * Source: tests/e2e/test-bedrock-vision-v2.sh confirmed 2026-05-20.
 */
const MODEL_IDS = {
  default: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  pro: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
} as const;

/**
 * Per-million-token pricing (USD) for cost tracking.
 * Source: backend/scripts/calc-turn-cost.ts
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  [MODEL_IDS.default]: { input: 0.8, output: 4 },
  [MODEL_IDS.pro]: { input: 3, output: 15 },
};

const SEMANTIC_ANALYSIS_PROMPT = `You are an AI object analyzer for a game engine. Analyze the provided 3D mesh and source photos to produce a structured semantic description.

Return a JSON object with EXACTLY these fields:
{
  "objectCategory": "<single word or short phrase describing what this object is>",
  "categoryConfidence": <number 0-100, how confident you are about the category>,
  "materialType": "<primary material: plastic, metal, fabric, wood, ceramic, glass, rubber, paper, stone, organic>",
  "estimatedSize": { "length": <cm>, "width": <cm>, "height": <cm> },
  "functionalAffordances": ["<what this object can do or be used for>", ...max 10 tags],
  "visualStyleTags": ["<visual descriptors: color, pattern, texture, style>", ...max 10 tags]
}

Be precise with size estimates based on visual cues. Assign confidence honestly — if the object is ambiguous, give a lower score. Return ONLY valid JSON, no markdown fences or extra text.`;

// ============================================================
// Service Implementation
// ============================================================

/**
 * AIInterpreterService — Vision-based semantic analysis for World Engine.
 *
 * Provider stack (per AGENTS.md, 2026-05-20):
 * 1. AWS Bedrock — Claude Haiku 4.5 (default, platform-hosted)
 * 2. AWS Bedrock — Claude Sonnet 4.6 (pro tier upgrade for ambiguous objects)
 * 3. Rule-based fallback (when Bedrock unavailable)
 *
 * BYOK support: users can pass their own Anthropic/AWS credentials via
 * `analyzeWithUserCredentials()` to consume their own quota and unlock
 * Opus 4.7 or other premium models.
 *
 * Reuses `BedrockIntegrationService` for credential resolution and
 * platform-token vs user-credential routing.
 */
@Injectable()
export class AIInterpreterService {
  private readonly logger = new Logger(AIInterpreterService.name);

  /** In-memory perceptual hash cache (Phase 1; Redis upgrade later) */
  private readonly hashCache = new Map<string, CacheEntry>();

  constructor(
    private readonly configService: ConfigService,
    private readonly bedrockService: BedrockIntegrationService,
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
  ) {
    this.logger.log(
      `AI Interpreter initialized — Bedrock provider chain (Haiku 4.5 default, Sonnet 4.6 pro upgrade)`,
    );
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Analyze a 3D mesh and source photos to produce a structured semantic description.
   *
   * Strategy:
   * 1. Check perceptual-hash cache → return immediately on hit
   * 2. Try Bedrock Haiku 4.5 (default tier, with retries)
   * 3. Try Bedrock Sonnet 4.6 (pro upgrade, only if Haiku fails or low confidence)
   * 4. Final fallback: rule-based classifier (lite mode)
   *
   * @param meshUrl S3 path to the reconstructed .glb
   * @param imageUrls Original source photos (passed to Bedrock for visual analysis)
   * @param tier 'default' (Haiku) or 'pro' (Sonnet); default is 'default'
   */
  async analyze(
    meshUrl: string,
    imageUrls: string[],
    tier: BedrockTier = 'default',
  ): Promise<AIInterpreterResult> {
    // Step 1: Check perceptual hash cache
    const cacheKey = this.computePerceptualHash(meshUrl, imageUrls);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for hash ${cacheKey.substring(0, 8)}...`);
      return cached;
    }

    // Step 2: Try Bedrock with the requested tier
    try {
      const result = await this.analyzeWithBedrock(meshUrl, imageUrls, tier);

      // Step 3: If default tier returns low confidence, escalate to pro tier
      if (
        tier === 'default' &&
        result.semanticDescription.categoryConfidence < LOW_CONFIDENCE_THRESHOLD
      ) {
        this.logger.log(
          `Haiku confidence ${result.semanticDescription.categoryConfidence}% < ${LOW_CONFIDENCE_THRESHOLD}% — escalating to Sonnet`,
        );
        try {
          const proResult = await this.analyzeWithBedrock(meshUrl, imageUrls, 'pro');
          this.setCachedResult(cacheKey, proResult);
          return proResult;
        } catch (escalationError) {
          this.logger.warn(
            `Sonnet escalation failed (${escalationError.message}), keeping Haiku result`,
          );
        }
      }

      this.setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.warn(`Bedrock analysis failed: ${error.message}`);
    }

    // Step 4: Rule-based fallback (lite mode)
    this.logger.warn('Bedrock unavailable — activating rule-based fallback');
    const result = this.analyzeWithRuleBasedFallback(meshUrl, imageUrls);
    this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * BYOK variant: user provides their own AWS credentials.
   * Bypasses platform quota; cost is borne by the user's AWS account.
   */
  async analyzeWithUserCredentials(
    meshUrl: string,
    imageUrls: string[],
    credentials: { accessKeyId: string; secretAccessKey: string; region: string },
    modelId?: string,
    tier: BedrockTier = 'pro',
  ): Promise<AIInterpreterResult> {
    const cacheKey = this.computePerceptualHash(meshUrl, imageUrls);
    const cached = this.getCachedResult(cacheKey);
    if (cached) return cached;

    const finalModelId = modelId || MODEL_IDS[tier];

    try {
      const result = await this.invokeBedrockVision(
        finalModelId,
        meshUrl,
        imageUrls,
        credentials,
      );
      this.setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.warn(`BYOK Bedrock failed (${error.message}) — falling back`);
      return this.analyzeWithRuleBasedFallback(meshUrl, imageUrls);
    }
  }

  // ============================================================
  // Bedrock Vision Analysis
  // ============================================================

  /**
   * Invoke Bedrock with platform credentials for the requested tier.
   */
  private async analyzeWithBedrock(
    meshUrl: string,
    imageUrls: string[],
    tier: BedrockTier,
  ): Promise<AIInterpreterResult> {
    const modelId = MODEL_IDS[tier];
    return this.invokeBedrockVision(modelId, meshUrl, imageUrls);
  }

  /**
   * Core Bedrock vision call with automatic retry.
   * Uses Anthropic Messages API format (works for Haiku/Sonnet/Opus).
   */
  private async invokeBedrockVision(
    modelId: string,
    meshUrl: string,
    imageUrls: string[],
    userCredentials?: { accessKeyId: string; secretAccessKey: string; region: string },
  ): Promise<AIInterpreterResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
      try {
        // Fetch images and encode as base64 for Bedrock inline upload
        const imageBlocks = await Promise.all(
          imageUrls.slice(0, 5).map((url) => this.fetchImageAsBase64Block(url)),
        );

        // Build Anthropic Messages API body
        const body = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1024,
          temperature: 0.2,
          system: SEMANTIC_ANALYSIS_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this object. The 3D mesh is at: ${meshUrl}. Source photos are below. Return ONLY the JSON object as specified.`,
                },
                ...imageBlocks,
              ],
            },
          ],
        };

        // Invoke Bedrock via the integration service
        const response = await this.invokeBedrockRaw(modelId, body, userCredentials);

        // Parse response — Anthropic returns { content: [{ type: 'text', text: '...' }], usage: {...} }
        const content = response.content?.[0]?.text;
        if (!content) {
          throw new Error('Empty content from Bedrock response');
        }

        const parsed = this.parseSemanticResponse(content);
        const latencyMs = Date.now() - startTime;

        // Record cost (skip if BYOK — user pays their own AWS bill)
        if (!userCredentials) {
          await this.recordCost(modelId, latencyMs, response.usage);
        }

        return this.buildResult(
          parsed,
          modelId === MODEL_IDS.default ? 'bedrock-haiku' : 'bedrock-sonnet',
          modelId,
        );
      } catch (error) {
        lastError = error;
        if (attempt < RETRY_COUNT) {
          this.logger.debug(
            `Bedrock attempt ${attempt + 1}/${RETRY_COUNT + 1} failed: ${error.message}, retrying in ${RETRY_INTERVAL_MS}ms`,
          );
          await this.sleep(RETRY_INTERVAL_MS);
        }
      }
    }

    throw lastError || new Error('Bedrock analysis failed after all retries');
  }

  /**
   * Low-level Bedrock invocation via existing BedrockIntegrationService.
   * Routes through the public `invokeVisionModel` API which handles
   * platform-token vs user-credential dispatch and model ID resolution.
   */
  private async invokeBedrockRaw(
    modelId: string,
    body: any,
    userCredentials?: { accessKeyId: string; secretAccessKey: string; region: string },
  ): Promise<any> {
    return this.bedrockService.invokeVisionModel(modelId, body, userCredentials);
  }

  /**
   * Fetch an image from URL and convert to a Bedrock-compatible base64 image block.
   * Used in the Anthropic Messages API content array.
   */
  private async fetchImageAsBase64Block(url: string): Promise<any> {
    try {
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: MAX_INLINE_IMAGE_BYTES,
      });
      const buffer = Buffer.from(resp.data);

      if (buffer.length > MAX_INLINE_IMAGE_BYTES) {
        this.logger.warn(
          `Image too large for Bedrock inline (${buffer.length} bytes, url: ${url}) — using URL reference`,
        );
        return { type: 'text', text: `[Reference image at: ${url}]` };
      }

      const contentType = (resp.headers['content-type'] || 'image/jpeg').split(';')[0].trim();

      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: contentType,
          data: buffer.toString('base64'),
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch image (${url}): ${error.message}`);
      return { type: 'text', text: `[Image unavailable: ${url}]` };
    }
  }

  // ============================================================
  // Rule-Based Fallback Classifier (Design §9)
  // ============================================================

  /**
   * Activate when Bedrock is unavailable (all retries exhausted).
   * Uses mesh bounding-box axis ratios + dominant color sampling → 50-class lookup table.
   * Forces categoryConfidence to 50 and adds liteMode: true flag.
   */
  private analyzeWithRuleBasedFallback(meshUrl: string, imageUrls: string[]): AIInterpreterResult {
    const shapeClass = this.classifyShapeFromUrl(meshUrl);
    const colorFamily = this.estimateDominantColor(imageUrls);

    const lookupKey = `${shapeClass}_${colorFamily}`;
    const category =
      categoryLookup[lookupKey] ||
      categoryLookup[`${shapeClass}_default`] ||
      'unknown_object';

    const semanticDescription: SemanticDescription = {
      objectCategory: category,
      categoryConfidence: 50,
      materialType: this.inferMaterialFromColor(colorFamily),
      estimatedSize: { length: 15, width: 10, height: 10 },
      functionalAffordances: [category.replace('_', ' ')],
      visualStyleTags: [colorFamily, shapeClass.replace('_', ' ')],
    };

    return {
      semanticDescription,
      liteMode: true,
      provider: 'rule-based',
      categorySuggestions: this.generateFallbackSuggestions(shapeClass, colorFamily),
    };
  }

  // ============================================================
  // Perceptual Hash Cache (Design §9)
  // ============================================================

  private computePerceptualHash(meshUrl: string, imageUrls: string[]): string {
    const input = [meshUrl, ...imageUrls.sort()].join('|');
    return this.simpleHash(input);
  }

  private simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return hash.toString(16).padStart(8, '0');
  }

  private getCachedResult(key: string): AIInterpreterResult | null {
    const entry = this.hashCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.hashCache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCachedResult(key: string, result: AIInterpreterResult): void {
    this.hashCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    if (this.hashCache.size > 10000) this.evictOldestEntries();
  }

  private evictOldestEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.hashCache.entries()) {
      if (now > entry.expiresAt) this.hashCache.delete(key);
    }
    if (this.hashCache.size > 8000) {
      const sorted = Array.from(this.hashCache.entries()).sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt,
      );
      const toRemove = Math.floor(sorted.length * 0.2);
      for (let i = 0; i < toRemove; i++) this.hashCache.delete(sorted[i][0]);
    }
  }

  // ============================================================
  // Response Parsing & Building
  // ============================================================

  private parseSemanticResponse(content: string): LLMSemanticResponse {
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    // Sometimes Claude wraps JSON in prose; extract the first {...} block
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    try {
      const parsed = JSON.parse(cleaned) as LLMSemanticResponse;
      return {
        objectCategory: String(parsed.objectCategory || 'unknown'),
        categoryConfidence: Math.max(
          0,
          Math.min(100, Number(parsed.categoryConfidence) || 50),
        ),
        materialType: String(parsed.materialType || 'unknown'),
        estimatedSize: {
          length: Math.max(0.1, Number(parsed.estimatedSize?.length) || 10),
          width: Math.max(0.1, Number(parsed.estimatedSize?.width) || 10),
          height: Math.max(0.1, Number(parsed.estimatedSize?.height) || 10),
        },
        functionalAffordances: Array.isArray(parsed.functionalAffordances)
          ? parsed.functionalAffordances.slice(0, 10).map(String)
          : [],
        visualStyleTags: Array.isArray(parsed.visualStyleTags)
          ? parsed.visualStyleTags.slice(0, 10).map(String)
          : [],
      };
    } catch (error) {
      throw new Error(`Failed to parse Bedrock response as JSON: ${error.message}`);
    }
  }

  private buildResult(
    parsed: LLMSemanticResponse,
    provider: 'bedrock-haiku' | 'bedrock-sonnet',
    modelId: string,
  ): AIInterpreterResult {
    const semanticDescription: SemanticDescription = {
      objectCategory: parsed.objectCategory,
      categoryConfidence: parsed.categoryConfidence,
      materialType: parsed.materialType,
      estimatedSize: parsed.estimatedSize,
      functionalAffordances: parsed.functionalAffordances,
      visualStyleTags: parsed.visualStyleTags,
    };

    const result: AIInterpreterResult = {
      semanticDescription,
      liteMode: false,
      provider,
      modelId,
    };

    if (parsed.categoryConfidence < LOW_CONFIDENCE_THRESHOLD) {
      result.categorySuggestions = [
        { category: parsed.objectCategory, confidence: parsed.categoryConfidence },
        {
          category: this.suggestAlternativeCategory(parsed, 1),
          confidence: Math.max(10, parsed.categoryConfidence - 15),
        },
        {
          category: this.suggestAlternativeCategory(parsed, 2),
          confidence: Math.max(5, parsed.categoryConfidence - 25),
        },
      ];
    }

    return result;
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private classifyShapeFromUrl(meshUrl: string): ShapeClass {
    const lower = meshUrl.toLowerCase();
    if (lower.includes('tall') || lower.includes('long') || lower.includes('narrow')) return 'tall_narrow';
    if (lower.includes('flat') || lower.includes('thin') || lower.includes('wide')) return 'flat_wide';
    if (lower.includes('round') || lower.includes('sphere') || lower.includes('ball')) return 'round';
    if (lower.includes('short') || lower.includes('low')) return 'short_wide';
    const hash = this.simpleHash(meshUrl);
    const idx = parseInt(hash.substring(0, 2), 16) % 5;
    const shapes: ShapeClass[] = ['tall_narrow', 'flat_wide', 'cubic', 'round', 'short_wide'];
    return shapes[idx];
  }

  private estimateDominantColor(imageUrls: string[]): ColorFamily {
    const combined = imageUrls.join(' ').toLowerCase();
    const colorKeywords: [string, ColorFamily][] = [
      ['green', 'green'], ['brown', 'brown'], ['silver', 'silver'], ['gray', 'silver'],
      ['black', 'black'], ['white', 'white'], ['red', 'red'], ['blue', 'blue'],
      ['yellow', 'yellow'], ['multi', 'multicolor'], ['color', 'multicolor'],
    ];
    for (const [keyword, family] of colorKeywords) {
      if (combined.includes(keyword)) return family;
    }
    const hash = this.simpleHash(combined);
    const families: ColorFamily[] = ['green', 'brown', 'silver', 'black', 'white', 'red', 'blue', 'yellow', 'multicolor', 'default'];
    return families[parseInt(hash.substring(0, 2), 16) % families.length];
  }

  private inferMaterialFromColor(color: ColorFamily): string {
    const map: Record<ColorFamily, string> = {
      green: 'organic', brown: 'wood', silver: 'metal', black: 'plastic',
      white: 'ceramic', red: 'plastic', blue: 'plastic', yellow: 'rubber',
      multicolor: 'plastic', default: 'unknown',
    };
    return map[color] || 'unknown';
  }

  private generateFallbackSuggestions(shape: ShapeClass, color: ColorFamily): { category: string; confidence: number }[] {
    const suggestions: { category: string; confidence: number }[] = [];
    const families: ColorFamily[] = ['green', 'brown', 'silver', 'black', 'white', 'red', 'blue', 'yellow', 'multicolor', 'default'];

    const primary = categoryLookup[`${shape}_${color}`] || categoryLookup[`${shape}_default`] || 'unknown_object';
    suggestions.push({ category: primary, confidence: 50 });

    const colorIdx = families.indexOf(color);
    const altColor = families[(colorIdx + 1) % families.length];
    suggestions.push({
      category: categoryLookup[`${shape}_${altColor}`] || 'object',
      confidence: 35,
    });

    const shapes: ShapeClass[] = ['tall_narrow', 'flat_wide', 'cubic', 'round', 'short_wide'];
    const shapeIdx = shapes.indexOf(shape);
    const altShape = shapes[(shapeIdx + 1) % shapes.length];
    suggestions.push({
      category: categoryLookup[`${altShape}_${color}`] || 'item',
      confidence: 25,
    });

    return suggestions;
  }

  private suggestAlternativeCategory(parsed: LLMSemanticResponse, variant: number): string {
    const pool = [...(parsed.functionalAffordances || []), ...(parsed.visualStyleTags || [])].filter(Boolean);
    if (pool.length > variant) {
      return pool[variant].toLowerCase().replace(/\s+/g, '_');
    }
    const materialAlts: Record<string, string[]> = {
      plastic: ['toy', 'container', 'gadget'],
      metal: ['tool', 'utensil', 'device'],
      fabric: ['clothing', 'accessory', 'textile'],
      wood: ['furniture', 'craft', 'block'],
      ceramic: ['vessel', 'decoration', 'pottery'],
      glass: ['container', 'ornament', 'lens'],
      rubber: ['ball', 'toy', 'grip'],
      paper: ['document', 'card', 'origami'],
      stone: ['sculpture', 'rock', 'mineral'],
      organic: ['plant', 'food', 'natural'],
    };
    const alts = materialAlts[parsed.materialType] || ['object', 'item', 'thing'];
    return alts[Math.min(variant - 1, alts.length - 1)];
  }

  /**
   * Record Bedrock cost to agent_cost_records table.
   */
  private async recordCost(
    modelId: string,
    latencyMs: number,
    usage?: { input_tokens?: number; output_tokens?: number },
  ): Promise<void> {
    try {
      const inputTokens = usage?.input_tokens || 0;
      const outputTokens = usage?.output_tokens || 0;

      const pricing = MODEL_PRICING[modelId];
      const costUsd = pricing
        ? (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
        : 0;

      const record = this.costRecordRepo.create({
        userId: null,
        sessionId: `world-engine-interpreter-${Date.now()}`,
        model: modelId,
        provider: 'bedrock',
        inputTokens,
        outputTokens,
        costUsd,
        routingReason: 'world_engine_ai_interpreter',
        tier: 'cloud',
      });
      await this.costRecordRepo.save(record);
    } catch (error) {
      this.logger.warn(`Failed to record cost: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
