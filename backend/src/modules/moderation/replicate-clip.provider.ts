import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationResult } from './moderation.service';

/**
 * Replicate CLIP NSFW classifier provider — Phase 2 W3 BE-T2.7.
 *
 * Wraps Replicate's `lucataco/nsfw_image_detection` (or a compatible CLIP
 * image classifier). Public surface returns the same `ModerationResult` shape
 * as ModerationService.checkPromptSync, so call sites are interchangeable.
 *
 * Behavior in different environments:
 *   - REPLICATE_API_TOKEN missing  → returns `{ allow, reason: 'classifier_unconfigured' }`
 *   - HTTP / network failure       → returns `{ allow, reason: 'classifier_error' }`
 *     (fail-open is intentional: a downed classifier should not block all uploads;
 *     escalate via alerting + the keyword pre-filter still applies on prompts.)
 *   - score >= DENY_THRESHOLD       → deny with reason 'nsfw_image'
 *   - DENY_THRESHOLD > score >= REVIEW_THRESHOLD → review with reason 'nsfw_image_review'
 *   - else                          → allow with reason null
 *
 * The Replicate API uses async predictions; this wrapper polls up to
 * MAX_POLL_MS for completion. If exceeded, returns 'classifier_timeout' (allow).
 */

const REPLICATE_BASE = 'https://api.replicate.com/v1';
const DEFAULT_MODEL_VERSION =
  // lucataco/nsfw_image_detection — small CLIP classifier, ~2s inference
  'b8b4e93e2c87e5b65fe97e6f1f6d1f0a4c5e3a78e3b3a73f9c5b8b3e3c5e3a78';
const POLL_INTERVAL_MS = 800;
const MAX_POLL_MS = 30_000;
const DENY_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.6;

export interface ReplicateClipOptions {
  /** Override the model version pinned in code (used for staging rollouts). */
  versionOverride?: string;
  /** For dependency injection in tests. */
  fetchImpl?: typeof fetch;
  /** For dependency injection in tests. */
  sleepImpl?: (ms: number) => Promise<void>;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: number | { nsfw?: number; score?: number } | Array<{ label: string; score: number }>;
  error?: string;
}

@Injectable()
export class ReplicateClipProvider {
  private readonly logger = new Logger(ReplicateClipProvider.name);
  private readonly token: string | undefined;
  private readonly modelVersion: string;

  constructor(private readonly config?: ConfigService) {
    this.token = this.config?.get<string>('REPLICATE_API_TOKEN');
    this.modelVersion =
      this.config?.get<string>('REPLICATE_NSFW_MODEL_VERSION') || DEFAULT_MODEL_VERSION;
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  /**
   * Classify an image. The image is identified by a public URL that Replicate's
   * predictor can fetch (e.g. our own object-storage URL).
   */
  async classify(
    imageUrl: string,
    opts: ReplicateClipOptions = {},
  ): Promise<ModerationResult> {
    if (!this.isConfigured()) {
      return { decision: 'allow', score: 0, reason: 'classifier_unconfigured' };
    }
    const fetchFn = opts.fetchImpl ?? globalThis.fetch;
    const sleep = opts.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const version = opts.versionOverride ?? this.modelVersion;

    try {
      const submitRes = await fetchFn(`${REPLICATE_BASE}/predictions`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version, input: { image: imageUrl } }),
      });
      if (!submitRes.ok) {
        this.logger.warn(`Replicate submit failed status=${submitRes.status}`);
        return { decision: 'allow', score: 0, reason: 'classifier_error' };
      }
      const submitJson = (await submitRes.json()) as ReplicatePrediction;
      let prediction = submitJson;

      const start = Date.now();
      while (
        prediction.status !== 'succeeded' &&
        prediction.status !== 'failed' &&
        prediction.status !== 'canceled'
      ) {
        if (Date.now() - start > MAX_POLL_MS) {
          this.logger.warn(`Replicate poll timeout id=${prediction.id}`);
          return { decision: 'allow', score: 0, reason: 'classifier_timeout' };
        }
        await sleep(POLL_INTERVAL_MS);
        const pollRes = await fetchFn(`${REPLICATE_BASE}/predictions/${prediction.id}`, {
          headers: { Authorization: `Token ${this.token}` },
        });
        if (!pollRes.ok) {
          return { decision: 'allow', score: 0, reason: 'classifier_error' };
        }
        prediction = (await pollRes.json()) as ReplicatePrediction;
      }

      if (prediction.status !== 'succeeded') {
        return { decision: 'allow', score: 0, reason: 'classifier_failed' };
      }

      const score = parseScore(prediction.output);
      if (score === null) {
        return { decision: 'allow', score: 0, reason: 'classifier_invalid_output' };
      }
      if (score >= DENY_THRESHOLD) {
        return { decision: 'deny', score, reason: 'nsfw_image' };
      }
      if (score >= REVIEW_THRESHOLD) {
        return { decision: 'review', score, reason: 'nsfw_image_review' };
      }
      return { decision: 'allow', score, reason: null };
    } catch (err: any) {
      this.logger.warn(`Replicate classify error: ${err?.message || err}`);
      return { decision: 'allow', score: 0, reason: 'classifier_error' };
    }
  }
}

/**
 * Normalize the predictor output. Different Replicate models return one of:
 *  - bare number (probability of NSFW)
 *  - object { nsfw } / { score }
 *  - array of label/score pairs (HF style); we look for label='nsfw'
 */
function parseScore(out: ReplicatePrediction['output']): number | null {
  if (out == null) return null;
  if (typeof out === 'number') return clamp01(out);
  if (Array.isArray(out)) {
    const nsfw = out.find((x) => x?.label?.toLowerCase?.() === 'nsfw');
    return nsfw ? clamp01(nsfw.score) : null;
  }
  if (typeof out === 'object') {
    if (typeof out.nsfw === 'number') return clamp01(out.nsfw);
    if (typeof out.score === 'number') return clamp01(out.score);
  }
  return null;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
