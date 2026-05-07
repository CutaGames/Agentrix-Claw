import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * HunyuanVideoProvider — Tencent Cloud "混元生视频" official API.
 *
 * Endpoint:    https://hunyuan.tencentcloudapi.com/
 * Service:     hunyuan
 * Region:      ap-guangzhou (default; overridable per call / via env)
 * API version: 2023-09-01 (default; overridable via env TENCENT_HUNYUAN_API_VERSION)
 *
 * Auth: TC3-HMAC-SHA256, computed from `TC_SecretId` / `TC_SecretKey` env vars.
 *
 * Asynchronous flow (mirrors Hunyuan3D):
 *   1. submit() → POST X-TC-Action: SubmitHunyuanToVideoJob → returns JobId
 *   2. query()  → POST X-TC-Action: QueryHunyuanToVideoJob  → returns Status
 *                 + ResultVideos[] when DONE.
 *
 * Tencent status values: WAIT, RUN, FAIL, DONE.
 *
 * Note: the exact JSON field names for the submit payload (Prompt, Resolution,
 * Duration, ImageUrl) follow the conventions used by sibling Tencent Cloud
 * AIGC services (混元生图 / Hunyuan3D). If Tencent reports
 * `InvalidParameterValue`, the field names below are the first place to check.
 */

export interface HunyuanVideoSubmitInput {
  prompt: string;
  /** Optional reference image for image-to-video. */
  imageUrl?: string;
  /** Optional negative prompt. */
  negativePrompt?: string;
  /** Duration in seconds (5 or 10). Default 5. */
  duration?: 5 | 10;
  /** Aspect ratio. Default '16:9'. */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** Whether to also synthesise audio. Default false. */
  generateAudio?: boolean;
  /** Optional seed for reproducibility. */
  seed?: number;
}

export interface HunyuanVideoSubmitResult {
  jobId: string;
}

export type HunyuanVideoJobStatus = 'WAIT' | 'RUN' | 'FAIL' | 'DONE' | string;

export interface HunyuanVideoResultFile {
  url?: string;
  coverUrl?: string;
  resolution?: string;
  duration?: number;
}

export interface HunyuanVideoQueryResult {
  status: HunyuanVideoJobStatus;
  errorCode?: string;
  errorMessage?: string;
  resultVideos: HunyuanVideoResultFile[];
  raw?: Record<string, unknown>;
}

const DEFAULT_HOST = 'hunyuan.tencentcloudapi.com';
const DEFAULT_SERVICE = 'hunyuan';
const DEFAULT_REGION = 'ap-guangzhou';
const DEFAULT_VERSION = '2023-09-01';

@Injectable()
export class HunyuanVideoProvider {
  private readonly logger = new Logger(HunyuanVideoProvider.name);

  /** Submit a new video-generation job. Returns the JobId for polling. */
  async submit(
    secretId: string,
    secretKey: string,
    input: HunyuanVideoSubmitInput,
    options?: { region?: string; version?: string },
  ): Promise<HunyuanVideoSubmitResult> {
    if (!input.prompt?.trim()) {
      throw new Error('HunyuanVideo submit requires a non-empty prompt.');
    }

    const resolution = this.aspectRatioToResolution(input.aspectRatio);
    const payload: Record<string, unknown> = {
      Prompt: input.prompt.trim(),
      Resolution: resolution,
      Duration: input.duration === 10 ? 10 : 5,
    };
    if (input.imageUrl) payload.ImageUrl = input.imageUrl;
    if (input.negativePrompt) payload.NegativePrompt = input.negativePrompt;
    if (input.generateAudio) payload.GenerateAudio = true;
    if (typeof input.seed === 'number') payload.Seed = input.seed;

    const data = await this.callAction<{ JobId?: string; RequestId?: string }>(
      secretId,
      secretKey,
      'SubmitHunyuanToVideoJob',
      payload,
      options,
    );
    if (!data.JobId) {
      throw new Error('HunyuanVideo SubmitHunyuanToVideoJob returned no JobId');
    }
    return { jobId: data.JobId };
  }

  /** Poll the job. Caller schedules retries until DONE/FAIL. */
  async query(
    secretId: string,
    secretKey: string,
    jobId: string,
    options?: { region?: string; version?: string },
  ): Promise<HunyuanVideoQueryResult> {
    const data = await this.callAction<{
      Status?: string;
      ErrorCode?: string;
      ErrorMessage?: string;
      ResultVideos?: Array<{
        Url?: string;
        CoverUrl?: string;
        Resolution?: string;
        Duration?: number;
      }>;
      VideoUrl?: string; // some Tencent APIs return a flat URL
    }>(
      secretId,
      secretKey,
      'QueryHunyuanToVideoJob',
      { JobId: jobId },
      options,
    );
    const status = (data.Status || 'WAIT') as HunyuanVideoJobStatus;
    const videos: HunyuanVideoResultFile[] = (data.ResultVideos || []).map((f) => ({
      url: f.Url,
      coverUrl: f.CoverUrl,
      resolution: f.Resolution,
      duration: f.Duration,
    }));
    if (videos.length === 0 && data.VideoUrl) {
      videos.push({ url: data.VideoUrl });
    }
    return {
      status,
      errorCode: data.ErrorCode,
      errorMessage: data.ErrorMessage,
      resultVideos: videos,
      raw: data as unknown as Record<string, unknown>,
    };
  }

  private aspectRatioToResolution(ar?: '16:9' | '9:16' | '1:1'): string {
    switch (ar) {
      case '9:16':
        return '720x1280';
      case '1:1':
        return '960x960';
      case '16:9':
      default:
        return '1280x720';
    }
  }

  private async callAction<T extends object>(
    secretId: string,
    secretKey: string,
    action: string,
    payload: Record<string, unknown>,
    options?: { region?: string; version?: string },
  ): Promise<T> {
    const region = options?.region
      || process.env.TENCENT_HUNYUAN_REGION
      || DEFAULT_REGION;
    const version = options?.version
      || process.env.TENCENT_HUNYUAN_API_VERSION
      || DEFAULT_VERSION;
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadStr = JSON.stringify(payload);
    const authorization = this.buildAuthorization(
      secretId,
      secretKey,
      action,
      payloadStr,
      timestamp,
    );

    const response = await fetch(`https://${DEFAULT_HOST}/`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: DEFAULT_HOST,
        'X-TC-Action': action,
        'X-TC-Region': region,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': version,
      },
      body: payloadStr,
    });

    let body: any;
    try {
      body = await response.json();
    } catch {
      throw new Error(
        `HunyuanVideo ${action} returned non-JSON response (${response.status})`,
      );
    }

    if (!response.ok) {
      const code = body?.Response?.Error?.Code || `HTTP_${response.status}`;
      const message = body?.Response?.Error?.Message || JSON.stringify(body).slice(0, 400);
      throw new Error(`HunyuanVideo ${action} failed: ${code} — ${message}`);
    }
    if (body?.Response?.Error) {
      const { Code, Message } = body.Response.Error;
      throw new Error(`HunyuanVideo ${action} error: ${Code} — ${Message}`);
    }
    if (!body?.Response) {
      throw new Error(`HunyuanVideo ${action} returned malformed envelope`);
    }
    return body.Response as T;
  }

  /** TC3-HMAC-SHA256 (https://cloud.tencent.com/document/api/213/30654). */
  private buildAuthorization(
    secretId: string,
    secretKey: string,
    action: string,
    payloadStr: string,
    timestamp: number,
  ): string {
    const algorithm = 'TC3-HMAC-SHA256';
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const service = DEFAULT_SERVICE;

    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders =
      `content-type:application/json; charset=utf-8\n` +
      `host:${DEFAULT_HOST}\n` +
      `x-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const hashedRequestPayload = crypto
      .createHash('sha256')
      .update(payloadStr, 'utf8')
      .digest('hex');
    const canonicalRequest =
      `${httpRequestMethod}\n` +
      `${canonicalUri}\n` +
      `${canonicalQueryString}\n` +
      `${canonicalHeaders}\n` +
      `${signedHeaders}\n` +
      `${hashedRequestPayload}`;

    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto
      .createHash('sha256')
      .update(canonicalRequest, 'utf8')
      .digest('hex');
    const stringToSign =
      `${algorithm}\n` +
      `${timestamp}\n` +
      `${credentialScope}\n` +
      `${hashedCanonicalRequest}`;

    const kDate = crypto
      .createHmac('sha256', `TC3${secretKey}`)
      .update(date)
      .digest();
    const kService = crypto.createHmac('sha256', kDate).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign, 'utf8')
      .digest('hex');

    return (
      `${algorithm} ` +
      `Credential=${secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`
    );
  }
}
