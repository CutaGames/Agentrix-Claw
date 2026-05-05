import { Injectable, Logger } from '@nestjs/common';

/**
 * Hunyuan3D provider — Tencent Hunyuan3D-2 served via a HuggingFace
 * Inference Endpoint (operator-deployed; not on serverless Inference API).
 *
 * Required env: HF_TOKEN (or HUNYUAN3D_HF_TOKEN), HUNYUAN3D_ENDPOINT_URL
 * (something like https://<id>.endpoints.huggingface.cloud).
 *
 * The endpoint is expected to expose a synchronous inference handler that
 * accepts JSON `{ prompt?, image_b64?, mode: 'text'|'image' }` and returns
 * `{ glb_url: string, thumbnail_url?: string }`. Operators wrapping the
 * Hunyuan3D-2 reference repo with a custom handler.py should match this
 * shape; the alternative is to override the response parsing here.
 */

export interface Hunyuan3DInput {
  mode: 'text' | 'image';
  prompt?: string;
  imageUrl?: string;
  style?: string;
}

export interface Hunyuan3DResult {
  glb_url?: string;
  fbx_url?: string;
  thumbnail_url?: string;
  error?: string;
}

@Injectable()
export class Hunyuan3DProvider {
  private readonly logger = new Logger(Hunyuan3DProvider.name);

  /**
   * Synchronous call. HF Inference Endpoints handle both queued and live
   * requests behind one URL. Average Hunyuan3D-2 turn-around is ~60-180s on
   * an A10G/A100 endpoint, so we expect callers to await this from a polling
   * worker rather than from the request thread.
   */
  async generate(
    endpointUrl: string,
    apiKey: string,
    input: Hunyuan3DInput,
  ): Promise<Hunyuan3DResult> {
    const payload: Record<string, unknown> = { mode: input.mode };
    if (input.prompt) payload.prompt = input.prompt;
    if (input.imageUrl) payload.image_url = input.imageUrl;
    if (input.style) payload.style = input.style;

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ inputs: payload }),
    });

    if (!response.ok) {
      throw new Error(
        `Hunyuan3D endpoint failed (${response.status}): ${await this.readError(response)}`,
      );
    }

    const raw = (await response.json()) as Record<string, unknown> | Array<unknown>;
    return this.normalize(raw);
  }

  private normalize(raw: unknown): Hunyuan3DResult {
    if (Array.isArray(raw) && raw.length > 0) {
      return this.normalize(raw[0]);
    }
    if (!raw || typeof raw !== 'object') {
      return { error: 'Hunyuan3D endpoint returned an empty payload' };
    }
    const obj = raw as Record<string, unknown>;
    const glb_url =
      (obj.glb_url as string | undefined) ||
      (obj.glb as string | undefined) ||
      ((obj.outputs as Record<string, unknown> | undefined)?.glb_url as string | undefined);
    const fbx_url = (obj.fbx_url as string | undefined) || (obj.fbx as string | undefined);
    const thumbnail_url =
      (obj.thumbnail_url as string | undefined) ||
      (obj.preview_url as string | undefined) ||
      (obj.thumbnail as string | undefined);
    const error = (obj.error as string | undefined) || (obj.message as string | undefined);
    if (!glb_url && !fbx_url) {
      return { error: error || 'Hunyuan3D endpoint returned no mesh URL' };
    }
    return { glb_url, fbx_url, thumbnail_url };
  }

  private async readError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 400) || 'Unknown Hunyuan3D error';
    } catch {
      return 'Unknown Hunyuan3D error';
    }
  }
}
