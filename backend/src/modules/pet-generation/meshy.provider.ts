import { Injectable, Logger } from '@nestjs/common';

/**
 * Meshy.ai provider — text-to-3D and image-to-3D mesh generation.
 *
 * API reference (v2): https://docs.meshy.ai/
 *
 * Endpoints used:
 *   - POST   https://api.meshy.ai/openapi/v2/text-to-3d         (preview)
 *   - POST   https://api.meshy.ai/openapi/v2/text-to-3d         (refine, with preview_task_id)
 *   - POST   https://api.meshy.ai/openapi/v1/image-to-3d
 *   - GET    https://api.meshy.ai/openapi/v2/text-to-3d/{id}
 *   - GET    https://api.meshy.ai/openapi/v1/image-to-3d/{id}
 *
 * Auth: `Authorization: Bearer <MESHY_API_KEY>`.
 *
 * Pricing (May 2026): preview ~10 credits, refine ~10 credits per task,
 * starter plan from $20/mo for 200 credits.
 */

const TEXT_BASE = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const IMAGE_BASE = 'https://api.meshy.ai/openapi/v1/image-to-3d';

export type MeshyMode = 'text' | 'image';

export interface MeshySubmitInput {
  mode: MeshyMode;
  prompt?: string;
  imageUrl?: string;
  /** Anime / realistic / sculpture / pbr — provider-specific art style hint. */
  artStyle?: string;
  negativePrompt?: string;
  /** Polygon target for the preview mesh. Lower = faster + cheaper. */
  targetPolycount?: number;
  /** When true, return T-posed humanoid for animation (when supported). */
  shouldRemesh?: boolean;
  /** When true, request topology suitable for animation rigging. */
  enableAnimation?: boolean;
  aiModel?: string;
}

export interface MeshyTaskStatus {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'EXPIRED';
  progress?: number;
  model_urls?: { glb?: string; fbx?: string; usdz?: string; obj?: string };
  thumbnail_url?: string;
  preview_task_id?: string;
  task_error?: { message?: string };
}

@Injectable()
export class MeshyProvider {
  private readonly logger = new Logger(MeshyProvider.name);

  /** Submit a generation request. Returns provider request id. */
  async submit(apiKey: string, input: MeshySubmitInput): Promise<string> {
    const isImage = input.mode === 'image';
    const url = isImage ? IMAGE_BASE : TEXT_BASE;

    let body: Record<string, unknown>;
    if (isImage) {
      if (!input.imageUrl) {
        throw new Error('Meshy image-to-3D requires referenceImageUrl');
      }
      body = {
        image_url: input.imageUrl,
        ai_model: input.aiModel || 'meshy-4',
        topology: input.enableAnimation ? 'quad' : 'triangle',
        target_polycount: input.targetPolycount ?? 30000,
        should_remesh: input.shouldRemesh ?? true,
      };
    } else {
      if (!input.prompt) {
        throw new Error('Meshy text-to-3D requires a prompt');
      }
      body = {
        mode: 'preview',
        prompt: input.prompt,
        negative_prompt: input.negativePrompt,
        art_style: input.artStyle || 'realistic',
        ai_model: input.aiModel || 'meshy-4',
        topology: input.enableAnimation ? 'quad' : 'triangle',
        target_polycount: input.targetPolycount ?? 30000,
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Meshy submit failed (${response.status}): ${await this.readError(response)}`,
      );
    }

    const json = (await response.json()) as { result?: string };
    if (!json?.result) {
      throw new Error('Meshy submit returned no task id');
    }
    return json.result;
  }

  /** Poll task status by id. mode is required because text/image use different endpoints. */
  async getStatus(
    apiKey: string,
    mode: MeshyMode,
    requestId: string,
  ): Promise<MeshyTaskStatus> {
    const base = mode === 'image' ? IMAGE_BASE : TEXT_BASE;
    const response = await fetch(`${base}/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(
        `Meshy status failed (${response.status}): ${await this.readError(response)}`,
      );
    }
    return (await response.json()) as MeshyTaskStatus;
  }

  extractMeshUrl(status: MeshyTaskStatus): string | undefined {
    return status.model_urls?.glb || status.model_urls?.fbx || status.model_urls?.obj;
  }

  extractThumbnail(status: MeshyTaskStatus): string | undefined {
    return status.thumbnail_url;
  }

  private async readError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 400) || 'Unknown Meshy error';
    } catch {
      return 'Unknown Meshy error';
    }
  }
}
