import { Injectable, Logger } from '@nestjs/common';

/**
 * VoiceABTestService — A/B testing framework for voice pipeline comparison.
 *
 * Compares:
 *   A) Hybrid Pipeline: Groq STT → LLM → Edge TTS (default, free)
 *   B) Gemini Live: End-to-end realtime voice (low latency, paid)
 *   C) Custom combos: Deepgram STT + Edge TTS, etc.
 *
 * Metrics tracked per session:
 *   - Time to first byte (TTFB) for STT and TTS
 *   - End-to-end latency (user stops speaking → agent starts speaking)
 *   - Transcription accuracy (WER proxy via user corrections)
 *   - TTS naturalness score (user feedback)
 *   - Session completion rate
 *   - Barge-in success rate
 *
 * Assignment: Consistent per-user (hash-based) so UX doesn't flip mid-session.
 */

export type VoicePipelineVariant = 'hybrid' | 'gemini-live' | 'custom';

export interface ABTestConfig {
  /** Test name for grouping */
  testName: string;
  /** Variants and their traffic weights (must sum to 100) */
  variants: Array<{
    name: VoicePipelineVariant;
    weight: number; // 0-100
    config?: Record<string, any>;
  }>;
  /** Whether the test is active */
  active: boolean;
  /** Start date (ISO string) */
  startDate?: string;
  /** End date (ISO string) */
  endDate?: string;
}

export interface ABTestMetrics {
  variant: VoicePipelineVariant;
  sessionId: string;
  userId: string;
  /** STT time to first result (ms) */
  sttTTFBMs?: number;
  /** TTS time to first audio byte (ms) */
  ttsTTFBMs?: number;
  /** Total end-to-end latency (ms) */
  e2eLatencyMs?: number;
  /** Number of turns in session */
  turnCount?: number;
  /** Session duration (ms) */
  sessionDurationMs?: number;
  /** Did user barge-in successfully? */
  bargeInSuccess?: boolean;
  /** User quality rating (1-5, if collected) */
  qualityRating?: number;
  /** Did user switch away from assigned variant? */
  userSwitchedAway?: boolean;
  timestamp: number;
}

@Injectable()
export class VoiceABTestService {
  private readonly logger = new Logger(VoiceABTestService.name);
  private config: ABTestConfig | null = null;
  private metricsLog: ABTestMetrics[] = [];

  constructor() {
    // Load default config
    this.config = this.getDefaultConfig();
    this.logger.log(`Voice A/B test initialized: ${this.config?.testName || 'none'}`);
  }

  /**
   * Assign a user to a variant (deterministic based on userId hash).
   */
  assignVariant(userId: string): VoicePipelineVariant {
    if (!this.config?.active || !this.config.variants.length) {
      return 'hybrid'; // Default fallback
    }

    // Check date range
    const now = Date.now();
    if (this.config.startDate && new Date(this.config.startDate).getTime() > now) return 'hybrid';
    if (this.config.endDate && new Date(this.config.endDate).getTime() < now) return 'hybrid';

    // Deterministic hash-based assignment
    const hash = this.simpleHash(userId + this.config.testName);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of this.config.variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        return variant.name;
      }
    }

    return this.config.variants[0]?.name || 'hybrid';
  }

  /**
   * Get variant config for a user.
   */
  getVariantConfig(userId: string): { variant: VoicePipelineVariant; config?: Record<string, any> } {
    const variantName = this.assignVariant(userId);
    const variantDef = this.config?.variants.find((v) => v.name === variantName);
    return {
      variant: variantName,
      config: variantDef?.config,
    };
  }

  /**
   * Record metrics for a voice session.
   */
  recordMetrics(metrics: ABTestMetrics): void {
    this.metricsLog.push(metrics);

    // Cap log size
    if (this.metricsLog.length > 10_000) {
      this.metricsLog = this.metricsLog.slice(-10_000);
    }
  }

  /**
   * Get aggregated results for the current test.
   */
  getResults(): Record<VoicePipelineVariant, {
    sessions: number;
    avgE2ELatencyMs: number;
    avgSTTTTFBMs: number;
    avgTTSTTFBMs: number;
    avgTurnCount: number;
    avgQualityRating: number;
    bargeInSuccessRate: number;
    switchAwayRate: number;
  }> {
    const byVariant = new Map<VoicePipelineVariant, ABTestMetrics[]>();

    for (const m of this.metricsLog) {
      if (!byVariant.has(m.variant)) byVariant.set(m.variant, []);
      byVariant.get(m.variant)!.push(m);
    }

    const results: any = {};
    for (const [variant, metrics] of byVariant.entries()) {
      const n = metrics.length;
      const avg = (arr: (number | undefined)[]) => {
        const valid = arr.filter((v): v is number => v !== undefined);
        return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
      };

      results[variant] = {
        sessions: n,
        avgE2ELatencyMs: avg(metrics.map((m) => m.e2eLatencyMs)),
        avgSTTTTFBMs: avg(metrics.map((m) => m.sttTTFBMs)),
        avgTTSTTFBMs: avg(metrics.map((m) => m.ttsTTFBMs)),
        avgTurnCount: avg(metrics.map((m) => m.turnCount)),
        avgQualityRating: avg(metrics.map((m) => m.qualityRating)),
        bargeInSuccessRate: n > 0
          ? Math.round((metrics.filter((m) => m.bargeInSuccess).length / n) * 100)
          : 0,
        switchAwayRate: n > 0
          ? Math.round((metrics.filter((m) => m.userSwitchedAway).length / n) * 100)
          : 0,
      };
    }

    return results;
  }

  /**
   * Update test configuration.
   */
  updateConfig(config: ABTestConfig): void {
    this.config = config;
    this.logger.log(`A/B test config updated: ${config.testName} (active: ${config.active})`);
  }

  /**
   * Reset metrics (start fresh test).
   */
  resetMetrics(): void {
    this.metricsLog = [];
    this.logger.log('A/B test metrics reset');
  }

  // ── Private ──

  private getDefaultConfig(): ABTestConfig {
    return {
      testName: 'voice-pipeline-v1',
      active: true,
      variants: [
        { name: 'hybrid', weight: 80, config: { stt: 'groq', tts: 'edge' } },
        { name: 'gemini-live', weight: 20, config: { model: 'gemini-2.0-flash-live-001' } },
      ],
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
