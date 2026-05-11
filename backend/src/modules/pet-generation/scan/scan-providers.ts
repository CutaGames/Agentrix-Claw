import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ── Provider Interface ─────────────────────────────────────────────────────

export interface ScanProviderResult {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface ScanProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  submitScan(imageUrls: string[]): Promise<{ externalTaskId: string }>;
  pollStatus(externalTaskId: string): Promise<ScanProviderResult>;
}

// ── Provider 1: Meshy API (commercial, fast) ───────────────────────────────

/**
 * Meshy.ai image-to-3D provider.
 * API: POST https://api.meshy.ai/openapi/v1/image-to-3d
 * Env: MESHY_API_KEY
 *
 * Accepts a single image URL. For multi-photo scans, we use the first
 * (front-facing) photo as the primary input. Meshy handles the rest
 * via its internal reconstruction pipeline.
 */
@Injectable()
export class MeshyScanProvider implements ScanProvider {
  readonly id = 'meshy';
  readonly name = 'Meshy.ai';
  private readonly logger = new Logger(MeshyScanProvider.name);
  private readonly apiKey: string | undefined;

  private static readonly BASE_URL = 'https://api.meshy.ai/openapi/v1/image-to-3d';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('MESHY_API_KEY');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async submitScan(imageUrls: string[]): Promise<{ externalTaskId: string }> {
    if (!this.apiKey) {
      throw new Error('Meshy API key not configured (MESHY_API_KEY)');
    }

    // Meshy image-to-3D accepts a single image; use the first (front) photo
    const primaryImage = imageUrls[0];
    if (!primaryImage) {
      throw new Error('At least one image URL is required');
    }

    const response = await fetch(MeshyScanProvider.BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: primaryImage,
        ai_model: 'meshy-4',
        topology: 'quad',
        target_polycount: 30000,
        should_remesh: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`Meshy submit failed (${response.status}): ${errorText}`);
      throw new Error(`Meshy submit failed: ${response.status}`);
    }

    const json = (await response.json()) as { result?: string };
    if (!json?.result) {
      throw new Error('Meshy returned no task ID');
    }

    this.logger.log(`Meshy scan submitted: ${json.result}`);
    return { externalTaskId: json.result };
  }

  async pollStatus(externalTaskId: string): Promise<ScanProviderResult> {
    if (!this.apiKey) {
      return { status: 'failed', error: 'Meshy API key not configured' };
    }

    const response = await fetch(`${MeshyScanProvider.BASE_URL}/${externalTaskId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      return { status: 'failed', error: `Meshy poll failed: ${response.status}` };
    }

    const data = (await response.json()) as {
      status: string;
      progress?: number;
      model_urls?: { glb?: string; fbx?: string };
      thumbnail_url?: string;
      task_error?: { message?: string };
    };

    switch (data.status) {
      case 'SUCCEEDED':
        return {
          status: 'completed',
          progress: 100,
          outputUrl: data.model_urls?.glb || data.model_urls?.fbx,
          thumbnailUrl: data.thumbnail_url,
        };
      case 'FAILED':
      case 'EXPIRED':
        return {
          status: 'failed',
          error: data.task_error?.message || 'Meshy task failed',
        };
      case 'IN_PROGRESS':
        return {
          status: 'processing',
          progress: data.progress ?? 50,
        };
      default:
        return { status: 'pending', progress: data.progress ?? 0 };
    }
  }
}

// ── Provider 2: Tripo3D API (commercial, high quality) ─────────────────────

/**
 * Tripo3D image-to-3D provider.
 * API: POST https://api.tripo3d.ai/v2/openapi/task
 * Env: TRIPO3D_API_KEY
 */
@Injectable()
export class Tripo3DScanProvider implements ScanProvider {
  readonly id = 'tripo3d';
  readonly name = 'Tripo3D';
  private readonly logger = new Logger(Tripo3DScanProvider.name);
  private readonly apiKey: string | undefined;

  private static readonly BASE_URL = 'https://api.tripo3d.ai/v2/openapi';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('TRIPO3D_API_KEY');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async submitScan(imageUrls: string[]): Promise<{ externalTaskId: string }> {
    if (!this.apiKey) {
      this.logger.warn('Tripo3D not configured — TRIPO3D_API_KEY missing');
      throw new Error('Tripo3D API key not configured (TRIPO3D_API_KEY)');
    }

    const primaryImage = imageUrls[0];
    if (!primaryImage) {
      throw new Error('At least one image URL is required');
    }

    const response = await fetch(`${Tripo3DScanProvider.BASE_URL}/task`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'image_to_model',
        file: { type: 'url', url: primaryImage },
        model_version: 'v2.0-20240919',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`Tripo3D submit failed (${response.status}): ${errorText}`);
      throw new Error(`Tripo3D submit failed: ${response.status}`);
    }

    const json = (await response.json()) as { data?: { task_id?: string } };
    const taskId = json?.data?.task_id;
    if (!taskId) {
      throw new Error('Tripo3D returned no task ID');
    }

    this.logger.log(`Tripo3D scan submitted: ${taskId}`);
    return { externalTaskId: taskId };
  }

  async pollStatus(externalTaskId: string): Promise<ScanProviderResult> {
    if (!this.apiKey) {
      return { status: 'failed', error: 'Tripo3D API key not configured' };
    }

    const response = await fetch(
      `${Tripo3DScanProvider.BASE_URL}/task/${externalTaskId}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );

    if (!response.ok) {
      return { status: 'failed', error: `Tripo3D poll failed: ${response.status}` };
    }

    const json = (await response.json()) as {
      data?: {
        status?: string;
        progress?: number;
        output?: { model?: string; rendered_image?: string };
        task_error?: { message?: string };
      };
    };

    const data = json?.data;
    if (!data) {
      return { status: 'pending' };
    }

    switch (data.status) {
      case 'success':
        return {
          status: 'completed',
          progress: 100,
          outputUrl: data.output?.model,
          thumbnailUrl: data.output?.rendered_image,
        };
      case 'failed':
        return {
          status: 'failed',
          error: data.task_error?.message || 'Tripo3D task failed',
        };
      case 'running':
        return { status: 'processing', progress: data.progress ?? 50 };
      default:
        return { status: 'pending', progress: data.progress ?? 0 };
    }
  }
}

// ── Provider 3: TripoSR Self-hosted (AWS GPU, cheapest at scale) ───────────

/**
 * Self-hosted TripoSR on AWS EC2 g5.xlarge.
 * API: POST http://{TRIPOSR_HOST}/generate
 * Env: TRIPOSR_ENDPOINT_URL
 *
 * This is for self-deployed TripoSR inference server.
 * Cheapest at scale but requires GPU instance management.
 */
@Injectable()
export class TripoSRScanProvider implements ScanProvider {
  readonly id = 'triposr';
  readonly name = 'TripoSR (Self-hosted)';
  private readonly logger = new Logger(TripoSRScanProvider.name);
  private readonly endpointUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.endpointUrl = this.config.get<string>('TRIPOSR_ENDPOINT_URL');
  }

  isConfigured(): boolean {
    return !!this.endpointUrl;
  }

  async submitScan(imageUrls: string[]): Promise<{ externalTaskId: string }> {
    if (!this.endpointUrl) {
      this.logger.warn('TripoSR not configured — TRIPOSR_ENDPOINT_URL missing');
      throw new Error('TripoSR endpoint not configured (TRIPOSR_ENDPOINT_URL)');
    }

    const primaryImage = imageUrls[0];
    if (!primaryImage) {
      throw new Error('At least one image URL is required');
    }

    const response = await fetch(`${this.endpointUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: primaryImage,
        output_format: 'glb',
        foreground_ratio: 0.85,
        mc_resolution: 256,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`TripoSR submit failed (${response.status}): ${errorText}`);
      throw new Error(`TripoSR submit failed: ${response.status}`);
    }

    const json = (await response.json()) as { task_id?: string };
    if (!json?.task_id) {
      throw new Error('TripoSR returned no task ID');
    }

    this.logger.log(`TripoSR scan submitted: ${json.task_id}`);
    return { externalTaskId: json.task_id };
  }

  async pollStatus(externalTaskId: string): Promise<ScanProviderResult> {
    if (!this.endpointUrl) {
      return { status: 'failed', error: 'TripoSR endpoint not configured' };
    }

    const response = await fetch(`${this.endpointUrl}/status/${externalTaskId}`);

    if (!response.ok) {
      return { status: 'failed', error: `TripoSR poll failed: ${response.status}` };
    }

    const data = (await response.json()) as {
      status?: string;
      progress?: number;
      output_url?: string;
      thumbnail_url?: string;
      error?: string;
    };

    switch (data.status) {
      case 'completed':
        return {
          status: 'completed',
          progress: 100,
          outputUrl: data.output_url,
          thumbnailUrl: data.thumbnail_url,
        };
      case 'failed':
        return { status: 'failed', error: data.error || 'TripoSR task failed' };
      case 'processing':
        return { status: 'processing', progress: data.progress ?? 50 };
      default:
        return { status: 'pending', progress: data.progress ?? 0 };
    }
  }
}

// ── Provider Router ────────────────────────────────────────────────────────

/**
 * Routes scan requests to the configured provider.
 * Selection based on SCAN_PROVIDER env var (default: meshy).
 */
@Injectable()
export class ScanProviderRouter {
  private readonly logger = new Logger(ScanProviderRouter.name);
  private readonly selectedProviderId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly meshyProvider: MeshyScanProvider,
    private readonly tripo3dProvider: Tripo3DScanProvider,
    private readonly tripoSRProvider: TripoSRScanProvider,
  ) {
    this.selectedProviderId = this.config.get<string>('SCAN_PROVIDER') || 'meshy';
    this.logger.log(`Scan provider configured: ${this.selectedProviderId}`);
  }

  getProvider(): ScanProvider {
    switch (this.selectedProviderId) {
      case 'tripo3d':
        if (!this.tripo3dProvider.isConfigured()) {
          this.logger.warn('Tripo3D not configured, falling back to Meshy');
          return this.meshyProvider;
        }
        return this.tripo3dProvider;
      case 'triposr':
        if (!this.tripoSRProvider.isConfigured()) {
          this.logger.warn('TripoSR not configured, falling back to Meshy');
          return this.meshyProvider;
        }
        return this.tripoSRProvider;
      case 'meshy':
      default:
        return this.meshyProvider;
    }
  }

  getProviderId(): string {
    return this.getProvider().id;
  }

  getAllProviders(): ScanProvider[] {
    return [this.meshyProvider, this.tripo3dProvider, this.tripoSRProvider];
  }

  getConfiguredProviders(): ScanProvider[] {
    return this.getAllProviders().filter((p) => p.isConfigured());
  }
}
