import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PetGenerationTask, PetGenerationStatusEnum } from '../../entities/pet-generation-task.entity';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';
import {
  DesktopTaskStatus,
  DesktopTimelineStatus,
  DesktopApprovalRiskLevel,
} from '../desktop-sync/dto/desktop-sync.dto';
import { MeshyProvider, type MeshyMode } from './meshy.provider';
import { Hunyuan3DProvider } from './hunyuan3d.provider';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage, MessageRole, MessageType } from '../../entities/agent-message.entity';
import { emitAgentSyncEvent } from '../agent-intelligence/agent-sync.events';
import type { ExecutionContext } from '../skill/skill-executor.service';

const POLL_INTERVAL_MS = 20_000;
const DEFAULT_PROVIDER = 'meshy';
const SUPPORTED_PROVIDERS = new Set(['meshy', 'hunyuan3d']);
const SUPPORTED_MODES = new Set(['text', 'image']);
const SUPPORTED_STYLES = new Set(['anime', 'realistic', 'chibi', 'sculpture', 'pbr', 'cartoon']);

type PetGenerateMode = 'text' | 'image';
type PetGenerateProvider = 'meshy' | 'hunyuan3d';

export interface PetGenerateParams {
  mode?: PetGenerateMode;
  prompt?: string;
  taskId?: string;
  provider?: PetGenerateProvider;
  model?: string;
  style?: string;
  negativePrompt?: string;
  referenceImageUrl?: string;
  imageUrl?: string;
  enableAnimation?: boolean;
  targetPolycount?: number;
}

@Injectable()
export class PetGenerationService {
  private readonly logger = new Logger(PetGenerationService.name);
  private pollInFlight = false;

  constructor(
    @InjectRepository(PetGenerationTask)
    private readonly taskRepo: Repository<PetGenerationTask>,
    @InjectRepository(AgentSession)
    private readonly sessionRepo: Repository<AgentSession>,
    @InjectRepository(AgentMessage)
    private readonly messageRepo: Repository<AgentMessage>,
    private readonly configService: ConfigService,
    private readonly aiProviderService: AiProviderService,
    private readonly desktopSyncService: DesktopSyncService,
    private readonly meshyProvider: MeshyProvider,
    private readonly hunyuanProvider: Hunyuan3DProvider,
  ) {}

  /**
   * Tool entry point. Two modes:
   *   - { taskId } only → poll status
   *   - { mode, prompt|referenceImageUrl, ... } → submit new task
   */
  async executeTool(params: PetGenerateParams, context: ExecutionContext): Promise<Record<string, unknown>> {
    const userId = context.userId;
    if (!userId) {
      throw new Error('pet_generate requires an authenticated user context');
    }

    if (params.taskId && !params.prompt && !params.referenceImageUrl && !params.imageUrl) {
      const task = await this.findTask(userId, params.taskId);
      return this.formatTaskResult(task);
    }

    const mode: PetGenerateMode = params.mode === 'image' ? 'image' : 'text';
    const referenceImageUrl = params.referenceImageUrl?.trim() || params.imageUrl?.trim() || undefined;
    if (mode === 'image' && !referenceImageUrl) {
      throw new Error('pet_generate mode=image requires referenceImageUrl');
    }
    const prompt = (params.prompt || '').trim();
    if (mode === 'text' && !prompt) {
      throw new Error('pet_generate mode=text requires a prompt');
    }
    if (!SUPPORTED_MODES.has(mode)) {
      throw new Error(`Unsupported pet_generate mode: ${mode}`);
    }

    const provider = ((params.provider || DEFAULT_PROVIDER) as string).toLowerCase() as PetGenerateProvider;
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      throw new Error(`Unsupported pet_generate provider: ${provider}. Supported: meshy (default, paid), hunyuan3d (HF Inference Endpoint).`);
    }
    const style = params.style && SUPPORTED_STYLES.has(params.style) ? params.style : 'anime';

    const inputPayload: Record<string, unknown> = {
      mode,
      prompt,
      style,
      referenceImageUrl,
      negativePrompt: params.negativePrompt?.trim() || undefined,
      enableAnimation: params.enableAnimation ?? true,
      targetPolycount: params.targetPolycount,
    };

    const task = this.taskRepo.create({
      userId,
      taskId: `pet-${randomUUID()}`,
      sessionId: context.sessionId,
      deviceId: this.extractDeviceId(context),
      provider,
      model: params.model,
      mode,
      style,
      title: this.buildTitle(prompt || 'Image-based pet', mode),
      prompt: prompt || `[image-to-3d] ${referenceImageUrl}`,
      negativePrompt: params.negativePrompt?.trim() || undefined,
      referenceImageUrl,
      status: PetGenerationStatusEnum.QUEUED,
      input: inputPayload,
      metadata: {
        platform: context.platform,
        source: context.metadata?.source,
        mode,
        provider,
      },
      startedAt: new Date(),
    });

    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);

    try {
      const submitted = await this.submitTask(saved);
      return {
        accepted: true,
        async: true,
        mode,
        provider: submitted.provider,
        model: submitted.model,
        taskId: submitted.taskId,
        status: submitted.status,
        message: 'Pet generation started in the background. Track progress in the Pet Creator panel, or call pet_generate again with this taskId to check status.',
      };
    } catch (error: any) {
      const failed = await this.markFailed(saved.taskId, error.message || 'Pet generation submit failed');
      return {
        accepted: false,
        async: false,
        taskId: failed.taskId,
        status: failed.status,
        error: failed.error,
      };
    }
  }

  /** Poll active tasks every 20s. */
  @Interval(POLL_INTERVAL_MS)
  async pollPendingTasks(): Promise<void> {
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const tasks = await this.taskRepo.find({
        where: {
          status: In([
            PetGenerationStatusEnum.QUEUED,
            PetGenerationStatusEnum.SUBMITTING,
            PetGenerationStatusEnum.PROCESSING,
            PetGenerationStatusEnum.REFINING,
          ]),
        },
        order: { updatedAt: 'ASC' },
        take: 8,
      });
      for (const task of tasks) {
        try {
          await this.refreshTask(task);
        } catch (error: any) {
          this.logger.warn(`Pet task ${task.taskId} refresh failed: ${error.message}`);
        }
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  /** List user's recent tasks for the desktop panel. */
  async listUserTasks(userId: string, limit = 30): Promise<PetGenerationTask[]> {
    return this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  // ─── private ──────────────────────────────────────────────────────

  private async findTask(userId: string, taskId: string): Promise<PetGenerationTask> {
    const task = await this.taskRepo.findOne({ where: { userId, taskId } });
    if (!task) {
      throw new Error(`Pet task not found: ${taskId}`);
    }
    return task;
  }

  private async submitTask(task: PetGenerationTask): Promise<PetGenerationTask> {
    if (task.provider === 'hunyuan3d') {
      return this.submitHunyuanTask(task);
    }
    return this.submitMeshyTask(task);
  }

  private async submitMeshyTask(task: PetGenerationTask): Promise<PetGenerationTask> {
    const apiKey = await this.resolveMeshyApiKey(task.userId);
    if (!apiKey) {
      throw new Error('Meshy provider is not configured. Set MESHY_API_KEY on the server, or save an API key under providerId="meshy" for this user.');
    }
    task.status = PetGenerationStatusEnum.SUBMITTING;
    task.providerStatus = 'SUBMITTING';
    task.error = null as any;
    await this.taskRepo.save(task);
    await this.syncDesktopTask(task);

    const input = (task.input || {}) as Record<string, unknown>;
    const requestId = await this.meshyProvider.submit(apiKey, {
      mode: task.mode as MeshyMode,
      prompt: task.prompt,
      imageUrl: task.referenceImageUrl,
      artStyle: (input.style as string) || task.style || 'realistic',
      negativePrompt: task.negativePrompt,
      targetPolycount: typeof input.targetPolycount === 'number' ? (input.targetPolycount as number) : undefined,
      enableAnimation: input.enableAnimation !== false,
      aiModel: task.model || undefined,
    });

    task.providerRequestId = requestId;
    task.providerStatus = 'PENDING';
    task.status = PetGenerationStatusEnum.PROCESSING;
    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);
    return saved;
  }

  private async submitHunyuanTask(task: PetGenerationTask): Promise<PetGenerationTask> {
    const endpointUrl = this.configService.get<string>('HUNYUAN3D_ENDPOINT_URL') || '';
    if (!endpointUrl) {
      throw new Error('Hunyuan3D provider is not configured. Set HUNYUAN3D_ENDPOINT_URL to a deployed HF Inference Endpoint.');
    }
    const apiKey = await this.resolveHfApiKey(task.userId);
    if (!apiKey) {
      throw new Error('Hunyuan3D requires HF_TOKEN (or saved providerId="huggingface" key) to authenticate the Inference Endpoint.');
    }

    task.status = PetGenerationStatusEnum.PROCESSING;
    task.providerStatus = 'IN_PROGRESS';
    task.error = null as any;
    const inflight = await this.taskRepo.save(task);
    await this.syncDesktopTask(inflight);

    // Hunyuan3D-2 endpoints are synchronous from the caller's perspective.
    // We await the result here, then transition to COMPLETED in one step.
    const result = await this.hunyuanProvider.generate(endpointUrl, apiKey, {
      mode: task.mode as 'text' | 'image',
      prompt: task.prompt,
      imageUrl: task.referenceImageUrl,
      style: task.style,
    });
    if (result.error || (!result.glb_url && !result.fbx_url)) {
      throw new Error(result.error || 'Hunyuan3D returned no mesh URL');
    }
    inflight.outputUrl = result.glb_url || result.fbx_url;
    inflight.thumbnailUrl = result.thumbnail_url;
    inflight.result = { ...result } as Record<string, unknown>;
    inflight.status = PetGenerationStatusEnum.COMPLETED;
    inflight.providerStatus = 'SUCCEEDED';
    inflight.completedAt = new Date();
    inflight.vrmUrl = inflight.outputUrl; // best-effort: VRM auto-rig handler not yet wired
    const saved = await this.taskRepo.save(inflight);
    await this.syncDesktopTask(saved);
    await this.emitCompletion(saved);
    return saved;
  }

  private async refreshTask(task: PetGenerationTask): Promise<void> {
    if (task.provider !== 'meshy') {
      // Hunyuan3D completes synchronously inside submitTask; nothing to poll.
      return;
    }
    if (!task.providerRequestId) {
      await this.submitTask(task);
      return;
    }
    const apiKey = await this.resolveMeshyApiKey(task.userId);
    if (!apiKey) {
      await this.markFailed(task.taskId, 'Meshy credentials are no longer available');
      return;
    }
    const status = await this.meshyProvider.getStatus(apiKey, task.mode as MeshyMode, task.providerRequestId);
    task.providerStatus = status.status;
    task.metadata = {
      ...(task.metadata || {}),
      progress: status.progress,
    };

    if (status.status === 'PENDING' || status.status === 'IN_PROGRESS') {
      task.status = status.status === 'PENDING'
        ? PetGenerationStatusEnum.QUEUED
        : PetGenerationStatusEnum.PROCESSING;
      await this.taskRepo.save(task);
      await this.syncDesktopTask(task);
      return;
    }

    if (status.status === 'FAILED' || status.status === 'CANCELED' || status.status === 'EXPIRED') {
      await this.markFailed(task.taskId, status.task_error?.message || `Meshy task ${status.status.toLowerCase()}`);
      return;
    }

    // SUCCEEDED
    const outputUrl = this.meshyProvider.extractMeshUrl(status);
    if (!outputUrl) {
      await this.markFailed(task.taskId, 'Meshy completed but returned no mesh URL');
      return;
    }
    task.outputUrl = outputUrl;
    task.thumbnailUrl = this.meshyProvider.extractThumbnail(status);
    task.result = status as unknown as Record<string, unknown>;
    task.vrmUrl = outputUrl; // VRM auto-rig step not yet wired; raw .glb URL is what desktop loads.
    task.status = PetGenerationStatusEnum.COMPLETED;
    task.completedAt = new Date();
    task.error = null as any;
    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);
    await this.emitCompletion(saved);
  }

  private async markFailed(taskId: string, errorMessage: string): Promise<PetGenerationTask> {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) throw new Error(`Pet task not found: ${taskId}`);
    task.status = PetGenerationStatusEnum.FAILED;
    task.error = errorMessage;
    task.completedAt = new Date();
    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);
    await this.emitFailure(saved);
    return saved;
  }

  private async emitCompletion(task: PetGenerationTask): Promise<void> {
    if (task.deviceId && task.sessionId) {
      await this.desktopSyncService.notifyAgentCompletion(
        task.userId,
        task.sessionId,
        task.deviceId,
        `3D pet generation completed: ${task.title}`,
      ).catch(() => {});
    }
    if (!task.sessionId || !task.outputUrl) return;
    const session = await this.sessionRepo.findOne({ where: { sessionId: task.sessionId } });
    if (!session) return;
    const sequenceNumber = (await this.messageRepo.count({ where: { sessionId: session.id } })) + 1;
    const content = [
      '🐾 3D pet generation completed.',
      `Prompt: ${task.prompt}`,
      `Mesh: ${task.outputUrl}`,
      task.vrmUrl && task.vrmUrl !== task.outputUrl ? `VRM: ${task.vrmUrl}` : null,
      `Task ID: ${task.taskId}`,
    ].filter(Boolean).join('\n\n');
    await this.messageRepo.save(this.messageRepo.create({
      sessionId: session.id,
      userId: task.userId,
      role: MessageRole.ASSISTANT,
      type: MessageType.TEXT,
      content,
      metadata: {
        source: 'pet-generation',
        petTaskId: task.taskId,
        outputUrl: task.outputUrl,
        vrmUrl: task.vrmUrl,
        thumbnailUrl: task.thumbnailUrl,
      },
      sequenceNumber,
    }));
    emitAgentSyncEvent(task.userId, 'agent:session_update', task.sessionId, {
      type: 'pet_task_completed',
      taskId: task.taskId,
      outputUrl: task.outputUrl,
      vrmUrl: task.vrmUrl,
      message: {
        id: `pet-task-${task.taskId}`,
        role: 'assistant',
        content,
        createdAt: Date.now(),
        meta: {
          petTaskId: task.taskId,
          outputUrl: task.outputUrl,
          vrmUrl: task.vrmUrl,
        },
      },
    });
  }

  private async emitFailure(task: PetGenerationTask): Promise<void> {
    if (task.deviceId && task.sessionId) {
      await this.desktopSyncService.notifyAgentCompletion(
        task.userId,
        task.sessionId,
        task.deviceId,
        `3D pet generation failed: ${task.title}`,
      ).catch(() => {});
    }
    if (!task.sessionId) return;
    emitAgentSyncEvent(task.userId, 'agent:session_update', task.sessionId, {
      type: 'pet_task_failed',
      taskId: task.taskId,
      error: task.error,
    });
  }

  private async syncDesktopTask(task: PetGenerationTask): Promise<void> {
    if (!task.deviceId) return;
    const status = this.toDesktopTaskStatus(task.status);
    const startedAt = task.startedAt?.getTime() || task.createdAt.getTime();
    const finishedAt = task.completedAt?.getTime();
    const timeline = [
      {
        id: `${task.taskId}:submit`,
        title: 'Submit pet generation',
        detail: `${task.mode} · ${task.provider} · ${task.style}`,
        kind: 'pet-generate',
        riskLevel: DesktopApprovalRiskLevel.L0,
        status: task.providerRequestId || task.status === PetGenerationStatusEnum.PROCESSING
          ? DesktopTimelineStatus.COMPLETED
          : DesktopTimelineStatus.RUNNING,
        startedAt,
        finishedAt: task.providerRequestId ? Number(task.updatedAt.getTime()) : undefined,
        output: task.providerRequestId || undefined,
      },
      {
        id: `${task.taskId}:render`,
        title: 'Render 3D mesh',
        detail: task.prompt,
        kind: 'pet-render',
        riskLevel: DesktopApprovalRiskLevel.L0,
        status: this.toDesktopTimelineStatus(task),
        startedAt,
        finishedAt,
        output: task.outputUrl || task.error || undefined,
      },
    ];
    await this.desktopSyncService.upsertTask(task.userId, {
      deviceId: task.deviceId,
      taskId: task.taskId,
      title: task.title,
      summary: task.status === PetGenerationStatusEnum.COMPLETED
        ? '3D pet ready'
        : task.status === PetGenerationStatusEnum.FAILED
          ? '3D pet generation failed'
          : 'Generating 3D pet in background',
      sessionId: task.sessionId,
      status,
      startedAt,
      finishedAt,
      timeline,
      context: {
        workspaceHint: task.model || task.style,
        fileHint: task.outputUrl,
        activeWindowTitle: task.title,
        processName: 'pet-generation',
        outputUrl: task.outputUrl,
        vrmUrl: task.vrmUrl,
        thumbnailUrl: task.thumbnailUrl,
        prompt: task.prompt,
        mode: task.mode,
        provider: task.provider,
        providerStatus: task.providerStatus,
        referenceImageUrl: task.referenceImageUrl,
        error: task.error,
      } as any,
    });
  }

  private formatTaskResult(task: PetGenerationTask): Record<string, unknown> {
    return {
      accepted: true,
      taskId: task.taskId,
      status: task.status,
      provider: task.provider,
      mode: task.mode,
      model: task.model,
      outputUrl: task.outputUrl,
      vrmUrl: task.vrmUrl,
      thumbnailUrl: task.thumbnailUrl,
      ready: task.status === PetGenerationStatusEnum.COMPLETED,
      error: task.error,
      message: task.status === PetGenerationStatusEnum.COMPLETED
        ? '3D pet ready. Use vrmUrl in the desktop pet renderer.'
        : task.status === PetGenerationStatusEnum.FAILED
          ? `Pet generation failed: ${task.error}`
          : `Pet generation is ${task.status}.`,
    };
  }

  private toDesktopTaskStatus(status: PetGenerationStatusEnum): DesktopTaskStatus {
    switch (status) {
      case PetGenerationStatusEnum.COMPLETED:
        return DesktopTaskStatus.COMPLETED;
      case PetGenerationStatusEnum.FAILED:
      case PetGenerationStatusEnum.CANCELLED:
        return DesktopTaskStatus.FAILED;
      default:
        return DesktopTaskStatus.EXECUTING;
    }
  }

  private toDesktopTimelineStatus(task: PetGenerationTask): DesktopTimelineStatus {
    switch (task.status) {
      case PetGenerationStatusEnum.COMPLETED:
        return DesktopTimelineStatus.COMPLETED;
      case PetGenerationStatusEnum.FAILED:
      case PetGenerationStatusEnum.CANCELLED:
        return DesktopTimelineStatus.FAILED;
      default:
        return DesktopTimelineStatus.RUNNING;
    }
  }

  private buildTitle(prompt: string, mode: PetGenerateMode): string {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    const prefix = mode === 'image' ? '[Img→3D] ' : '[Pet] ';
    const titled = `${prefix}${normalized}`;
    return titled.length > 72 ? `${titled.slice(0, 69)}...` : titled;
  }

  private extractDeviceId(context: ExecutionContext): string | undefined {
    const v = context.metadata?.deviceId;
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  }

  private async resolveMeshyApiKey(userId: string): Promise<string | null> {
    const configured = this.configService.get<string>('MESHY_API_KEY');
    if (configured) return configured;
    const saved = await this.aiProviderService.getDecryptedKey(userId, 'meshy');
    return saved?.apiKey || null;
  }

  private async resolveHfApiKey(userId: string): Promise<string | null> {
    const configured = this.configService.get<string>('HF_TOKEN')
      || this.configService.get<string>('HUGGINGFACE_TOKEN')
      || this.configService.get<string>('HUGGINGFACE_API_KEY');
    if (configured) return configured;
    for (const providerId of ['huggingface', 'hf']) {
      const saved = await this.aiProviderService.getDecryptedKey(userId, providerId);
      if (saved?.apiKey) return saved.apiKey;
    }
    return null;
  }
}
