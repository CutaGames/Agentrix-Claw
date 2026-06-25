import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * VrmAutoRigProvider — Phase 3 W2 BE-T3.1
 *
 * Wraps an external auto-rig pipeline that converts a raw `.glb` mesh into
 * a VRM 1.0 file with the 5 mandatory BlendShapes (happy/sad/angry/surprised/neutral)
 * and a humanoid bone hierarchy.
 *
 * Production target: Replicate model `lucataco/auto-rig-vrm` or self-hosted
 * Python service exposing `POST /rig` returning `{vrm_url, blendshapes[]}`.
 *
 * Behavior tiers:
 *   - VRM_RIG_ENDPOINT missing → returns `{success:false, reason:'rig_unconfigured'}`
 *     (callers MUST treat as soft failure; they can serve the raw `.glb` instead)
 *   - HTTP 5xx / network → `{success:false, reason:'rig_error'}` (caller re-queues)
 *   - HTTP 4xx → `{success:false, reason:'rig_rejected'}` (caller marks task FAILED)
 *   - 200 with valid output → `{success:true, vrmUrl, blendshapes[]}`
 *
 * The 95% success-rate target (BE-T3.1) is enforced upstream by sampling
 * `success===true / total` over a 100-task moving window via the scheduler;
 * this provider just reports per-call results truthfully.
 */

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_MS = 5 * 60_000;

export interface AutoRigInput {
  glbUrl: string;
  /** Optional bone-hint metadata (e.g. species='quadruped' suppresses humanoid rig) */
  hints?: { species?: 'humanoid' | 'quadruped' | 'mascot'; targetPolycount?: number };
}

export interface AutoRigResult {
  success: boolean;
  vrmUrl?: string;
  blendshapes?: string[];
  reason?: string;
  /** Wall time spent inside provider (for SLA dashboards) */
  elapsedMs: number;
}

export interface AutoRigOptions {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

interface RigJobResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  vrm_url?: string;
  blendshapes?: string[];
  error?: string;
}

@Injectable()
export class VrmAutoRigProvider {
  private readonly logger = new Logger(VrmAutoRigProvider.name);
  private readonly endpoint: string | undefined;
  private readonly token: string | undefined;

  constructor(private readonly config?: ConfigService) {
    this.endpoint = this.config?.get<string>('VRM_RIG_ENDPOINT');
    this.token = this.config?.get<string>('VRM_RIG_TOKEN');
  }

  isConfigured(): boolean {
    return !!this.endpoint;
  }

  async rig(input: AutoRigInput, opts: AutoRigOptions = {}): Promise<AutoRigResult> {
    const start = Date.now();
    if (!this.isConfigured()) {
      return { success: false, reason: 'rig_unconfigured', elapsedMs: 0 };
    }
    const fetchFn = opts.fetchImpl ?? globalThis.fetch;
    const sleep = opts.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    try {
      const submitRes = await fetchFn(`${this.endpoint}/rig`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          glb_url: input.glbUrl,
          species: input.hints?.species ?? 'humanoid',
          target_polycount: input.hints?.targetPolycount,
        }),
      });

      if (submitRes.status >= 400 && submitRes.status < 500) {
        return {
          success: false,
          reason: 'rig_rejected',
          elapsedMs: Date.now() - start,
        };
      }
      if (!submitRes.ok) {
        return { success: false, reason: 'rig_error', elapsedMs: Date.now() - start };
      }

      let job = (await submitRes.json()) as RigJobResponse;
      const pollStart = Date.now();
      while (job.status === 'queued' || job.status === 'processing') {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          return { success: false, reason: 'rig_timeout', elapsedMs: Date.now() - start };
        }
        await sleep(POLL_INTERVAL_MS);
        const pollRes = await fetchFn(`${this.endpoint}/rig/${job.job_id}`, {
          headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        });
        if (!pollRes.ok) {
          return { success: false, reason: 'rig_error', elapsedMs: Date.now() - start };
        }
        job = (await pollRes.json()) as RigJobResponse;
      }

      if (job.status !== 'succeeded' || !job.vrm_url) {
        return {
          success: false,
          reason: job.error || 'rig_failed',
          elapsedMs: Date.now() - start,
        };
      }

      return {
        success: true,
        vrmUrl: job.vrm_url,
        blendshapes: job.blendshapes ?? [],
        elapsedMs: Date.now() - start,
      };
    } catch (err: any) {
      this.logger.warn(`VRM rig error: ${err?.message || err}`);
      return {
        success: false,
        reason: 'rig_error',
        elapsedMs: Date.now() - start,
      };
    }
  }
}
