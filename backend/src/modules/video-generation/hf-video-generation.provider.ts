import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type HfVideoModelId = 'ltx' | 'cogvideox' | string;

export const HF_VIDEO_MODEL_PATHS: Record<string, string> = {
  ltx: 'Lightricks/LTX-Video',
  cogvideox: 'THUDM/CogVideoX-2b',
};

export function resolveHfVideoModel(modelHint?: string): { key: string; path: string } {
  const hint = (modelHint || 'ltx').trim().toLowerCase();
  if (hint.includes('/')) {
    return { key: hint, path: hint };
  }
  if (hint === 'cogvideo' || hint === 'cogvideox' || hint === 'cog') {
    return { key: 'cogvideox', path: HF_VIDEO_MODEL_PATHS.cogvideox };
  }
  return { key: 'ltx', path: HF_VIDEO_MODEL_PATHS.ltx };
}

interface InflightEntry {
  status: 'running' | 'done' | 'error';
  startedAt: number;
  modelPath: string;
  result?: Buffer;
  error?: string;
  promise: Promise<void>;
}

/**
 * Free-tier video provider backed by HuggingFace Inference API.
 *
 * HF Inference is synchronous and returns binary MP4 directly, so we manage
 * an in-memory inflight map. Tasks survive within a single backend process
 * lifetime; a pm2 restart loses in-progress jobs (acceptable for MVP — caller
 * can retry). Completed binaries are written to backend/uploads/video/ and
 * served via the existing /api/uploads/ static route.
 */
@Injectable()
export class HfVideoGenerationProvider {
  private readonly logger = new Logger(HfVideoGenerationProvider.name);
  private readonly inflight = new Map<string, InflightEntry>();

  submit(apiKey: string, modelPath: string, prompt: string): { request_id: string } {
    const requestId = `hf-${randomUUID()}`;
    const entry: InflightEntry = {
      status: 'running',
      startedAt: Date.now(),
      modelPath,
      promise: Promise.resolve(),
    };
    entry.promise = this.callInference(apiKey, modelPath, prompt)
      .then((buf) => {
        entry.status = 'done';
        entry.result = buf;
      })
      .catch((err: Error) => {
        entry.status = 'error';
        entry.error = err.message;
        this.logger.warn(`HF inference failed for ${modelPath}: ${err.message}`);
      });
    this.inflight.set(requestId, entry);
    return { request_id: requestId };
  }

  getStatus(requestId: string): { status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; elapsedMs: number; error?: string } {
    const entry = this.inflight.get(requestId);
    if (!entry) {
      return { status: 'FAILED', elapsedMs: 0, error: 'Unknown HF request_id (process may have restarted)' };
    }
    const elapsedMs = Date.now() - entry.startedAt;
    if (entry.status === 'running') {
      return { status: 'IN_PROGRESS', elapsedMs };
    }
    if (entry.status === 'done') {
      return { status: 'COMPLETED', elapsedMs };
    }
    return { status: 'FAILED', elapsedMs, error: entry.error };
  }

  /**
   * Write the generated video to disk and return the public URL + path.
   * Consumes the inflight entry so memory doesn't leak.
   */
  async saveResult(requestId: string, uploadsDir: string, apiBaseUrl: string): Promise<{ outputUrl: string; localPath: string }> {
    const entry = this.inflight.get(requestId);
    if (!entry || entry.status !== 'done' || !entry.result) {
      throw new Error(`HF request ${requestId} is not ready`);
    }
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const filename = `${requestId}.mp4`;
    const localPath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(localPath, entry.result);
    this.inflight.delete(requestId);
    const normalized = apiBaseUrl.replace(/\/$/, '');
    const outputUrl = `${normalized}/api/uploads/video/${filename}`;
    return { outputUrl, localPath };
  }

  private async callInference(apiKey: string, modelPath: string, prompt: string): Promise<Buffer> {
    const url = `https://api-inference.huggingface.co/models/${modelPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Wait for model cold-start instead of 503'ing.
        'x-wait-for-model': 'true',
        'x-use-cache': 'false',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          // Some HF video models accept these; ignored if not supported.
          num_frames: 48,
          guidance_scale: 7.5,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '<no body>');
      throw new Error(`HF inference ${response.status}: ${errText.slice(0, 400)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('video/') && !contentType.startsWith('application/octet-stream')) {
      // Some endpoints return JSON for errors even with 200.
      const text = await response.text().catch(() => '<binary>');
      if (text.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) {
            throw new Error(`HF inference error: ${parsed.error}`);
          }
        } catch { /* fall through */ }
      }
      throw new Error(`Unexpected HF response content-type: ${contentType}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /** Shared temp dir used by the composer for intermediate per-scene MP4s. */
  static getTempDir(): string {
    return path.join(os.tmpdir(), 'agentrix-video-composer');
  }
}
