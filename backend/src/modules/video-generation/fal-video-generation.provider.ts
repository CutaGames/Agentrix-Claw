import { Injectable, Logger } from '@nestjs/common';

export interface FalVideoGenerationInput {
  prompt?: string;
  image_url?: string;
  tail_image_url?: string;
  video_url?: string;
  keep_original_sound?: boolean;
  character_orientation?: 'image' | 'video';
  negative_prompt?: string;
  duration?: '5' | '10';
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  cfg_scale?: number;
  generate_audio?: boolean;
}

export interface FalSubmitResponse {
  request_id: string;
  response_url?: string;
  status_url?: string;
  cancel_url?: string;
  queue_position?: number;
}

export interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
  request_id: string;
  queue_position?: number;
  response_url?: string;
  logs?: Array<{ message?: string; timestamp?: string }>;
  metrics?: Record<string, unknown>;
  error?: string;
  error_type?: string;
}

@Injectable()
export class FalVideoGenerationProvider {
  private readonly logger = new Logger(FalVideoGenerationProvider.name);

  async submit(
    apiKey: string,
    modelPath: string,
    input: FalVideoGenerationInput,
  ): Promise<FalSubmitResponse> {
    const response = await fetch(`https://queue.fal.run/${modelPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      throw new Error(`fal submit failed (${response.status}): ${await this.readError(response)}`);
    }

    return response.json() as Promise<FalSubmitResponse>;
  }

  async getStatus(
    apiKey: string,
    modelPath: string,
    requestId: string,
  ): Promise<FalStatusResponse> {
    const response = await fetch(`https://queue.fal.run/${modelPath}/requests/${requestId}/status?logs=1`, {
      headers: {
        Authorization: `Key ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`fal status failed (${response.status}): ${await this.readError(response)}`);
    }

    return response.json() as Promise<FalStatusResponse>;
  }

  async getResult(
    apiKey: string,
    modelPath: string,
    requestId: string,
    responseUrl?: string,
  ): Promise<Record<string, unknown>> {
    const url = responseUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Key ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`fal result failed (${response.status}): ${await this.readError(response)}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  extractVideoUrl(payload: Record<string, unknown>): string | undefined {
    const resolved = ((payload.data as Record<string, unknown> | undefined) || payload) as Record<string, unknown>;
    const directVideo = resolved.video as Record<string, unknown> | undefined;
    if (typeof directVideo?.url === 'string') {
      return directVideo.url;
    }

    const videos = resolved.videos;
    if (Array.isArray(videos)) {
      const first = videos[0] as Record<string, unknown> | undefined;
      if (typeof first?.url === 'string') {
        return first.url;
      }
    }

    return undefined;
  }

  extractThumbnailUrl(payload: Record<string, unknown>): string | undefined {
    const resolved = ((payload.data as Record<string, unknown> | undefined) || payload) as Record<string, unknown>;
    const thumbnail = resolved.thumbnail as Record<string, unknown> | undefined;
    if (typeof thumbnail?.url === 'string') {
      return thumbnail.url;
    }
    return undefined;
  }

  private async readError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.slice(0, 400) || 'Unknown provider error';
    } catch (error: any) {
      this.logger.warn(`Failed to read fal error body: ${error.message}`);
      return 'Unknown provider error';
    }
  }
}