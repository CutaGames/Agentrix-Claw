import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * HunyuanVideoProvider — Tencent Cloud "腾讯混元生视频" official API.
 *
 * Endpoint:    https://vclm.tencentcloudapi.com/
 * Service:     vclm
 * API version: 2024-05-23
 * Region:      ap-guangzhou (overridable via env TENCENT_VCLM_REGION)
 *
 * Auth: TC3-HMAC-SHA256, computed from `TC_SecretId` / `TC_SecretKey`.
 *
 * Reference (official Node.js SDK):
 *   https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/vclm/v20240523/
 *
 * Asynchronous flow:
 *   1. submit() → X-TC-Action: SubmitHunyuanToVideoJob → returns { JobId }
 *   2. query()  → X-TC-Action: DescribeHunyuanToVideoJob
 *                 → returns { Status, ErrorCode, ErrorMessage, ResultVideoUrl }
 *
 * Tencent status values: WAIT, RUN, FAIL, DONE.
 *
 * Note: per the official SubmitHunyuanToVideoJob spec, only `Prompt`, `Image`,
 * `Resolution` (currently only "720p"), `LogoAdd`, `LogoParam` are supported.
 * Fields like Duration, AspectRatio, NegativePrompt, GenerateAudio, Seed are
 * NOT accepted by this action — they belong to other vclm actions
 * (SubmitTextToVideoJob / SubmitImageToVideoJob etc., which target Kling/Vidu
 * models, not Hunyuan). Such fields are silently ignored here.
 */

export interface HunyuanVideoSubmitInput {
  prompt: string;
  /** Optional reference image URL for image-to-video. */
  imageUrl?: string;
  /** Ignored by Hunyuan video API; kept for service-layer compat. */
  negativePrompt?: string;
  duration?: 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  generateAudio?: boolean;
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

const DEFAULT_HOST = 'vclm.tencentcloudapi.com';
const DEFAULT_SERVICE = 'vclm';
const DEFAULT_REGION = 'ap-guangzhou';
const DEFAULT_VERSION = '2024-05-23';

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

    // 200-utf-8-char limit per spec; truncate defensively.
    const prompt = input.prompt.trim().slice(0, 200);
    const payload: Record<string, unknown> = {
      Prompt: prompt,
      Resolution: '720p',
    };
    if (input.imageUrl) {
      payload.Image = { Url: input.imageUrl };
    }

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
      ResultVideoUrl?: string;
    }>(
      secretId,
      secretKey,
      'DescribeHunyuanToVideoJob',
      { JobId: jobId },
      options,
    );
    const status = (data.Status || 'WAIT') as HunyuanVideoJobStatus;
    const videos: HunyuanVideoResultFile[] = data.ResultVideoUrl
      ? [{ url: data.ResultVideoUrl }]
      : [];
    return {
      status,
      errorCode: data.ErrorCode,
      errorMessage: data.ErrorMessage,
      resultVideos: videos,
      raw: data as unknown as Record<string, unknown>,
    };
  }

  private async callAction<T extends object>(
    secretId: string,
    secretKey: string,
    action: string,
    payload: Record<string, unknown>,
    options?: { region?: string; version?: string },
  ): Promise<T> {
    const region = options?.region
      || process.env.TENCENT_VCLM_REGION
      || process.env.TENCENT_HUNYUAN_REGION
      || DEFAULT_REGION;
    const version = options?.version
      || process.env.TENCENT_VCLM_API_VERSION
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
