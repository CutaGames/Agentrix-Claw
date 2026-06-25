import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Hunyuan3D provider — Tencent Cloud official AI3D API.
 *
 * Endpoint:    https://ai3d.tencentcloudapi.com/
 * Service:     ai3d
 * Region:      ap-guangzhou (default; overridable per call)
 * API version: 2025-05-13 (default; overridable via env TENCENT_AI3D_API_VERSION)
 *
 * Auth: TC3-HMAC-SHA256 signature, computed from
 *   SecretId / SecretKey provided as `TC_SecretId` and `TC_SecretKey` env
 *   variables on the backend (the user has these configured in backend/.env).
 *
 * Asynchronous flow:
 *   1. submit()  → POST X-TC-Action: SubmitHunyuanTo3DJob → returns JobId
 *   2. query()   → POST X-TC-Action: QueryHunyuanTo3DJob  → returns Status +
 *                  ResultFile3Ds[] when the job is DONE
 *
 * Status values returned by Tencent: WAIT, RUN, FAIL, DONE.
 */

export interface Hunyuan3DSubmitInput {
  /** Either Prompt or ImageUrl must be provided. */
  prompt?: string;
  imageUrl?: string;
  /** Output mesh format. Default 'GLB'. */
  resultFormat?: 'GLB' | 'OBJ' | 'STL' | 'USDZ' | 'FBX' | 'MP4';
  /** Whether to bake PBR textures. Default true. */
  enablePBR?: boolean;
}

export interface Hunyuan3DSubmitResult {
  jobId: string;
}

export type Hunyuan3DJobStatus = 'WAIT' | 'RUN' | 'FAIL' | 'DONE';

export interface Hunyuan3DResultFile {
  type?: string;
  url?: string;
  previewImageUrl?: string;
}

export interface Hunyuan3DQueryResult {
  status: Hunyuan3DJobStatus;
  errorCode?: string;
  errorMessage?: string;
  resultFile3Ds: Hunyuan3DResultFile[];
}

const DEFAULT_HOST = 'ai3d.tencentcloudapi.com';
const DEFAULT_SERVICE = 'ai3d';
const DEFAULT_REGION = 'ap-guangzhou';
const DEFAULT_VERSION = '2025-05-13';

@Injectable()
export class Hunyuan3DProvider {
  private readonly logger = new Logger(Hunyuan3DProvider.name);

  /** Submit a new 3D-generation job. Returns the JobId for polling. */
  async submit(
    secretId: string,
    secretKey: string,
    input: Hunyuan3DSubmitInput,
    options?: { region?: string; version?: string },
  ): Promise<Hunyuan3DSubmitResult> {
    if (!input.prompt && !input.imageUrl) {
      throw new Error('Hunyuan3D submit requires either prompt or imageUrl.');
    }
    const payload: Record<string, unknown> = {
      ResultFormat: input.resultFormat || 'GLB',
      EnablePBR: input.enablePBR !== false,
    };
    if (input.prompt) payload.Prompt = input.prompt;
    if (input.imageUrl) payload.ImageUrl = input.imageUrl;

    const data = await this.callAction<{ JobId?: string }>(
      secretId,
      secretKey,
      'SubmitHunyuanTo3DJob',
      payload,
      options,
    );
    if (!data.JobId) {
      throw new Error('Hunyuan3D SubmitHunyuanTo3DJob returned no JobId');
    }
    return { jobId: data.JobId };
  }

  /** Poll the job. Caller is expected to schedule retries until DONE/FAIL. */
  async query(
    secretId: string,
    secretKey: string,
    jobId: string,
    options?: { region?: string; version?: string },
  ): Promise<Hunyuan3DQueryResult> {
    const data = await this.callAction<{
      Status?: string;
      ErrorCode?: string;
      ErrorMessage?: string;
      ResultFile3Ds?: Array<{ Type?: string; Url?: string; PreviewImageUrl?: string }>;
    }>(
      secretId,
      secretKey,
      'QueryHunyuanTo3DJob',
      { JobId: jobId },
      options,
    );
    const status = (data.Status || 'WAIT') as Hunyuan3DJobStatus;
    return {
      status,
      errorCode: data.ErrorCode,
      errorMessage: data.ErrorMessage,
      resultFile3Ds: (data.ResultFile3Ds || []).map((f) => ({
        type: f.Type,
        url: f.Url,
        previewImageUrl: f.PreviewImageUrl,
      })),
    };
  }

  /**
   * Low-level Tencent Cloud API call with TC3-HMAC-SHA256 signing.
   * Throws on transport failure or when Tencent returns an Error in the
   * Response envelope. Returns the inner Response object (Tencent strips the
   * wrapper here).
   */
  private async callAction<T extends object>(
    secretId: string,
    secretKey: string,
    action: string,
    payload: Record<string, unknown>,
    options?: { region?: string; version?: string },
  ): Promise<T> {
    const region = options?.region || DEFAULT_REGION;
    const version = options?.version
      || process.env.TENCENT_AI3D_API_VERSION
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
        `Hunyuan3D ${action} returned non-JSON response (${response.status})`,
      );
    }

    if (!response.ok) {
      const code = body?.Response?.Error?.Code || `HTTP_${response.status}`;
      const message = body?.Response?.Error?.Message || JSON.stringify(body).slice(0, 400);
      throw new Error(`Hunyuan3D ${action} failed: ${code} — ${message}`);
    }
    if (body?.Response?.Error) {
      const { Code, Message } = body.Response.Error;
      throw new Error(`Hunyuan3D ${action} error: ${Code} — ${Message}`);
    }
    if (!body?.Response) {
      throw new Error(`Hunyuan3D ${action} returned malformed envelope`);
    }
    return body.Response as T;
  }

  /**
   * Build the TC3-HMAC-SHA256 Authorization header per the Tencent Cloud
   * common signing spec: https://cloud.tencent.com/document/api/213/30654
   */
  private buildAuthorization(
    secretId: string,
    secretKey: string,
    action: string,
    payloadStr: string,
    timestamp: number,
  ): string {
    const algorithm = 'TC3-HMAC-SHA256';
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // UTC date YYYY-MM-DD
    const service = DEFAULT_SERVICE;

    // Step 1: canonical request
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

    // Step 2: string to sign
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

    // Step 3: derived signing key
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

    // Step 4: build Authorization header
    return (
      `${algorithm} ` +
      `Credential=${secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`
    );
  }
}
