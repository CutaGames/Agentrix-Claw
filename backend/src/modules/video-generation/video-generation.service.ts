import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { VideoGenerationTask, VideoGenerationStatusEnum } from '../../entities/video-generation-task.entity';
import { AiProviderService } from '../ai-provider/ai-provider.service';
import { DesktopSyncService } from '../desktop-sync/desktop-sync.service';
import {
  DesktopTaskStatus,
  DesktopTimelineStatus,
  DesktopApprovalRiskLevel,
} from '../desktop-sync/dto/desktop-sync.dto';
import { FalVideoGenerationProvider, type FalVideoGenerationInput } from './fal-video-generation.provider';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage, MessageRole, MessageType } from '../../entities/agent-message.entity';
import { emitAgentSyncEvent } from '../agent-intelligence/agent-sync.events';
import type { ExecutionContext } from '../skill/skill-executor.service';

const DEFAULT_TEXT_TO_VIDEO_MODEL = 'fal-ai/kling-video/v1/standard/text-to-video';
const DEFAULT_IMAGE_TO_VIDEO_MODEL = 'fal-ai/kling-video/v2.1/master/image-to-video';
const DEFAULT_VIDEO_TO_VIDEO_MODEL = 'fal-ai/kling-video/v2.1/master/motion-control';
const DEFAULT_VIDEO_MODE = 'text_to_video';
const POLL_INTERVAL_MS = 15_000;

type VideoGenerationMode = 'text_to_video' | 'image_to_video' | 'video_to_video';

type VideoGenerateParams = {
  mode?: VideoGenerationMode;
  prompt?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  duration?: '5' | '10' | 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  negativePrompt?: string;
  cfgScale?: number;
  generateAudio?: boolean;
  referenceImageUrl?: string;
  imageUrl?: string;
  endImageUrl?: string;
  tailImageUrl?: string;
  referenceVideoUrl?: string;
  videoUrl?: string;
  keepOriginalSound?: boolean;
  characterOrientation?: 'image' | 'video';
};

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);
  private pollInFlight = false;

  constructor(
    @InjectRepository(VideoGenerationTask)
    private readonly taskRepo: Repository<VideoGenerationTask>,
    @InjectRepository(AgentSession)
    private readonly sessionRepo: Repository<AgentSession>,
    @InjectRepository(AgentMessage)
    private readonly messageRepo: Repository<AgentMessage>,
    private readonly configService: ConfigService,
    private readonly aiProviderService: AiProviderService,
    private readonly desktopSyncService: DesktopSyncService,
    private readonly falProvider: FalVideoGenerationProvider,
  ) {}

  async executeTool(params: VideoGenerateParams, context: ExecutionContext): Promise<Record<string, unknown>> {
    const userId = context.userId;
    if (!userId) {
      throw new Error('video_generate requires an authenticated user context');
    }

    if (params.taskId && !params.prompt) {
      const task = await this.findTask(userId, params.taskId);
      return this.formatTaskResult(task);
    }

    const mode = this.resolveMode(params.mode);
    const prompt = this.resolvePrompt(params, mode);
    if (!prompt) {
      throw new Error('video_generate requires a prompt or an existing taskId. Reference-driven modes also require their source media URLs.');
    }

    const provider = String(params.provider || 'fal').trim().toLowerCase();
    if (provider !== 'fal') {
      throw new Error(`Unsupported video provider: ${provider}`);
    }

    const inputPayload = (this.buildInput(mode, params, prompt) as unknown) as Record<string, unknown>;

    const task = this.taskRepo.create({
      userId,
      taskId: `video-${randomUUID()}`,
      sessionId: context.sessionId,
      deviceId: this.extractDeviceId(context),
      provider,
      model: this.resolveModel(mode, params.model),
      title: this.buildTitle(prompt, mode),
      prompt,
      negativePrompt: params.negativePrompt?.trim() || undefined,
      status: VideoGenerationStatusEnum.QUEUED,
      input: {
        mode,
        ...inputPayload,
      },
      metadata: {
        platform: context.platform,
        source: context.metadata?.source,
        mode,
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
        message: 'Video generation started in the background. Track progress in the Task Workbench, or call video_generate again with this taskId to check status.',
      };
    } catch (error: any) {
      const failed = await this.markFailed(saved.taskId, error.message || 'Video generation submit failed');
      return {
        accepted: false,
        async: false,
        taskId: failed.taskId,
        status: failed.status,
        error: failed.error,
      };
    }
  }

  @Interval(POLL_INTERVAL_MS)
  async pollPendingTasks(): Promise<void> {
    if (this.pollInFlight) {
      return;
    }

    this.pollInFlight = true;
    try {
      const tasks = await this.taskRepo.find({
        where: {
          status: In([
            VideoGenerationStatusEnum.QUEUED,
            VideoGenerationStatusEnum.SUBMITTING,
            VideoGenerationStatusEnum.PROCESSING,
          ]),
        },
        order: { updatedAt: 'ASC' },
        take: 12,
      });

      for (const task of tasks) {
        try {
          await this.refreshTask(task);
        } catch (error: any) {
          this.logger.warn(`Video task ${task.taskId} refresh failed: ${error.message}`);
        }
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  private async findTask(userId: string, taskId: string): Promise<VideoGenerationTask> {
    const task = await this.taskRepo.findOne({ where: { userId, taskId } });
    if (!task) {
      throw new Error(`Video task not found: ${taskId}`);
    }
    return task;
  }

  private async submitTask(task: VideoGenerationTask): Promise<VideoGenerationTask> {
    const credentials = await this.resolveFalApiKey(task.userId);
    if (!credentials) {
      throw new Error('FAL video provider is not configured. Set FAL_KEY or VIDEO_FAL_API_KEY on the server.');
    }

    task.status = VideoGenerationStatusEnum.SUBMITTING;
    task.providerStatus = 'SUBMITTING';
    task.error = null as any;
    await this.taskRepo.save(task);
    await this.syncDesktopTask(task);

    const input = ((task.input || {}) as unknown) as FalVideoGenerationInput;
    const response = await this.falProvider.submit(credentials, task.model, input);
    task.providerRequestId = response.request_id;
    task.responseUrl = response.response_url;
    task.statusUrl = response.status_url;
    task.providerStatus = 'IN_QUEUE';
    task.status = VideoGenerationStatusEnum.QUEUED;
    task.metadata = {
      ...(task.metadata || {}),
      queuePosition: response.queue_position,
      cancelUrl: response.cancel_url,
    };

    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);
    return saved;
  }

  private async refreshTask(task: VideoGenerationTask): Promise<void> {
    if (!task.providerRequestId) {
      await this.submitTask(task);
      return;
    }

    const credentials = await this.resolveFalApiKey(task.userId);
    if (!credentials) {
      await this.markFailed(task.taskId, 'FAL provider credentials are no longer available');
      return;
    }

    const status = await this.falProvider.getStatus(credentials, task.model, task.providerRequestId);
    task.providerStatus = status.status;
    task.metadata = {
      ...(task.metadata || {}),
      queuePosition: status.queue_position,
      logs: Array.isArray(status.logs) ? status.logs.slice(-8) : undefined,
      metrics: status.metrics,
      errorType: status.error_type,
    };

    if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
      task.status = status.status === 'IN_QUEUE'
        ? VideoGenerationStatusEnum.QUEUED
        : VideoGenerationStatusEnum.PROCESSING;
      await this.taskRepo.save(task);
      await this.syncDesktopTask(task);
      return;
    }

    if (status.error) {
      await this.markFailed(task.taskId, status.error);
      return;
    }

    const result = await this.falProvider.getResult(
      credentials,
      task.model,
      task.providerRequestId,
      status.response_url || task.responseUrl,
    );
    const outputUrl = this.falProvider.extractVideoUrl(result);
    if (!outputUrl) {
      await this.markFailed(task.taskId, 'Provider completed but returned no video URL');
      return;
    }

    task.status = VideoGenerationStatusEnum.COMPLETED;
    task.providerStatus = status.status;
    task.outputUrl = outputUrl;
    task.thumbnailUrl = this.falProvider.extractThumbnailUrl(result);
    task.result = result;
    task.completedAt = new Date();
    task.error = null as any;

    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);
    await this.emitCompletion(saved);
  }

  private async markFailed(taskId: string, errorMessage: string): Promise<VideoGenerationTask> {
    const task = await this.taskRepo.findOne({ where: { taskId } });
    if (!task) {
      throw new Error(`Video task not found: ${taskId}`);
    }

    task.status = VideoGenerationStatusEnum.FAILED;
    task.error = errorMessage;
    task.completedAt = new Date();
    const saved = await this.taskRepo.save(task);
    await this.syncDesktopTask(saved);
    await this.emitFailure(saved);
    return saved;
  }

  private async emitCompletion(task: VideoGenerationTask): Promise<void> {
    if (task.deviceId && task.sessionId) {
      await this.desktopSyncService.notifyAgentCompletion(
        task.userId,
        task.sessionId,
        task.deviceId,
        `Video generation completed: ${task.title}`,
      ).catch(() => {});
    }

    if (!task.sessionId || !task.outputUrl) {
      return;
    }

    const session = await this.sessionRepo.findOne({ where: { sessionId: task.sessionId } });
    if (!session) {
      return;
    }

    const sequenceNumber = (await this.messageRepo.count({ where: { sessionId: session.id } })) + 1;
    const content = [
      '🎬 Video generation completed.',
      `Prompt: ${task.prompt}`,
      `Video: ${task.outputUrl}`,
      `Task ID: ${task.taskId}`,
    ].join('\n\n');

    await this.messageRepo.save(this.messageRepo.create({
      sessionId: session.id,
      userId: task.userId,
      role: MessageRole.ASSISTANT,
      type: MessageType.TEXT,
      content,
      metadata: {
        source: 'video-generation',
        videoTaskId: task.taskId,
        outputUrl: task.outputUrl,
        thumbnailUrl: task.thumbnailUrl,
      },
      sequenceNumber,
    }));

    emitAgentSyncEvent(task.userId, 'agent:session_update', task.sessionId, {
      type: 'video_task_completed',
      taskId: task.taskId,
      outputUrl: task.outputUrl,
      message: {
        id: `video-task-${task.taskId}`,
        role: 'assistant',
        content,
        createdAt: Date.now(),
        meta: {
          videoTaskId: task.taskId,
          outputUrl: task.outputUrl,
        },
      },
    });
  }

  private async emitFailure(task: VideoGenerationTask): Promise<void> {
    if (task.deviceId && task.sessionId) {
      await this.desktopSyncService.notifyAgentCompletion(
        task.userId,
        task.sessionId,
        task.deviceId,
        `Video generation failed: ${task.title}`,
      ).catch(() => {});
    }

    if (!task.sessionId) {
      return;
    }

    emitAgentSyncEvent(task.userId, 'agent:session_update', task.sessionId, {
      type: 'video_task_failed',
      taskId: task.taskId,
      error: task.error,
    });
  }

  private async syncDesktopTask(task: VideoGenerationTask): Promise<void> {
    if (!task.deviceId) {
      return;
    }

    const status = this.toDesktopTaskStatus(task.status);
    const startedAt = task.startedAt?.getTime() || task.createdAt.getTime();
    const finishedAt = task.completedAt?.getTime();
    const providerLog = this.getLatestProviderLog(task);
    const timeline = [
      {
        id: `${task.taskId}:submit`,
        title: 'Submit video job',
        detail: `${this.formatModeLabel(this.getTaskMode(task))} · ${task.provider} · ${task.model}`,
        kind: 'video-generate',
        riskLevel: DesktopApprovalRiskLevel.L0,
        status: task.providerRequestId ? DesktopTimelineStatus.COMPLETED : DesktopTimelineStatus.RUNNING,
        startedAt,
        finishedAt: task.providerRequestId ? Number(task.updatedAt.getTime()) : undefined,
        output: task.providerRequestId || undefined,
      },
      {
        id: `${task.taskId}:render`,
        title: 'Render provider output',
        detail: providerLog || task.prompt,
        kind: 'video-render',
        riskLevel: DesktopApprovalRiskLevel.L0,
        status: this.toDesktopTimelineStatus(task),
        startedAt,
        finishedAt,
        output: task.outputUrl || task.error || providerLog || undefined,
      },
    ];

    await this.desktopSyncService.upsertTask(task.userId, {
      deviceId: task.deviceId,
      taskId: task.taskId,
      title: task.title,
      summary: task.status === VideoGenerationStatusEnum.COMPLETED
        ? `${this.formatModeLabel(this.getTaskMode(task))} ready`
        : task.status === VideoGenerationStatusEnum.FAILED
          ? `${this.formatModeLabel(this.getTaskMode(task))} failed`
          : `Generating ${this.formatModeLabel(this.getTaskMode(task)).toLowerCase()} in background`,
      sessionId: task.sessionId,
      status,
      startedAt,
      finishedAt,
      timeline,
      context: {
        workspaceHint: task.model,
        fileHint: task.outputUrl,
        activeWindowTitle: task.title,
        processName: 'video-generation',
        outputUrl: task.outputUrl,
        thumbnailUrl: task.thumbnailUrl,
        prompt: task.prompt,
        mode: this.getTaskMode(task),
        provider: task.provider,
        providerStatus: task.providerStatus,
        referenceImageUrl: this.readInputUrl(task, 'image_url', 'start_image_url'),
        referenceVideoUrl: this.readInputUrl(task, 'video_url'),
        endImageUrl: this.readInputUrl(task, 'tail_image_url', 'end_image_url'),
        error: task.error,
      } as any,
    });
  }

  private buildInput(mode: VideoGenerationMode, params: VideoGenerateParams, prompt: string): FalVideoGenerationInput {
    const duration = String(params.duration || '5') === '10' ? '10' : '5';
    const negativePrompt = params.negativePrompt?.trim() || undefined;
    const cfgScale = typeof params.cfgScale === 'number' ? params.cfgScale : 0.5;

    if (mode === 'image_to_video') {
      const referenceImageUrl = this.resolveReferenceImageUrl(params);
      if (!referenceImageUrl) {
        throw new Error('image_to_video requires referenceImageUrl (or imageUrl).');
      }

      return {
        prompt,
        image_url: referenceImageUrl,
        tail_image_url: this.resolveEndImageUrl(params),
        duration,
        negative_prompt: negativePrompt,
        cfg_scale: cfgScale,
      };
    }

    if (mode === 'video_to_video') {
      const referenceImageUrl = this.resolveReferenceImageUrl(params);
      const referenceVideoUrl = this.resolveReferenceVideoUrl(params);
      if (!referenceImageUrl) {
        throw new Error('video_to_video requires referenceImageUrl (or imageUrl) to preserve the target subject.');
      }
      if (!referenceVideoUrl) {
        throw new Error('video_to_video requires referenceVideoUrl (or videoUrl).');
      }

      return {
        prompt,
        image_url: referenceImageUrl,
        video_url: referenceVideoUrl,
        keep_original_sound: params.keepOriginalSound ?? true,
        character_orientation: params.characterOrientation === 'image' ? 'image' : 'video',
      };
    }

    return {
      prompt,
      negative_prompt: negativePrompt,
      duration,
      aspect_ratio: params.aspectRatio === '9:16' || params.aspectRatio === '1:1'
        ? params.aspectRatio
        : '16:9',
      cfg_scale: cfgScale,
      generate_audio: Boolean(params.generateAudio),
    };
  }

  private resolveModel(mode: VideoGenerationMode, model?: string): string {
    if (!model) {
      if (mode === 'image_to_video') {
        return this.configService.get<string>('VIDEO_FAL_IMAGE_MODEL') || DEFAULT_IMAGE_TO_VIDEO_MODEL;
      }
      if (mode === 'video_to_video') {
        return this.configService.get<string>('VIDEO_FAL_VIDEO_TO_VIDEO_MODEL') || DEFAULT_VIDEO_TO_VIDEO_MODEL;
      }
      return this.configService.get<string>('VIDEO_FAL_TEXT_MODEL') || DEFAULT_TEXT_TO_VIDEO_MODEL;
    }
    return model.includes('/') ? model : DEFAULT_TEXT_TO_VIDEO_MODEL;
  }

  private buildTitle(prompt: string, mode: VideoGenerationMode): string {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    const prefix = mode === 'image_to_video'
      ? '[I2V] '
      : mode === 'video_to_video'
        ? '[V2V] '
        : '';
    const titled = `${prefix}${normalized}`;
    return titled.length > 72 ? `${titled.slice(0, 69)}...` : titled;
  }

  private extractDeviceId(context: ExecutionContext): string | undefined {
    const metadataDeviceId = context.metadata?.deviceId;
    return typeof metadataDeviceId === 'string' && metadataDeviceId.trim()
      ? metadataDeviceId.trim()
      : undefined;
  }

  private async resolveFalApiKey(userId: string): Promise<string | null> {
    const configured = this.configService.get<string>('VIDEO_FAL_API_KEY') || this.configService.get<string>('FAL_KEY');
    if (configured) {
      return configured;
    }

    for (const providerId of ['fal', 'fal-video', 'video-fal']) {
      const saved = await this.aiProviderService.getDecryptedKey(userId, providerId);
      if (saved?.apiKey) {
        return saved.apiKey;
      }
    }

    return null;
  }

  private toDesktopTaskStatus(status: VideoGenerationStatusEnum): DesktopTaskStatus {
    switch (status) {
      case VideoGenerationStatusEnum.COMPLETED:
        return DesktopTaskStatus.COMPLETED;
      case VideoGenerationStatusEnum.FAILED:
      case VideoGenerationStatusEnum.CANCELLED:
        return DesktopTaskStatus.FAILED;
      default:
        return DesktopTaskStatus.EXECUTING;
    }
  }

  private toDesktopTimelineStatus(task: VideoGenerationTask): DesktopTimelineStatus {
    if (task.status === VideoGenerationStatusEnum.COMPLETED) {
      return DesktopTimelineStatus.COMPLETED;
    }
    if (task.status === VideoGenerationStatusEnum.FAILED || task.status === VideoGenerationStatusEnum.CANCELLED) {
      return DesktopTimelineStatus.FAILED;
    }
    return DesktopTimelineStatus.RUNNING;
  }

  private getLatestProviderLog(task: VideoGenerationTask): string | undefined {
    const logs = task.metadata?.logs;
    if (!Array.isArray(logs) || logs.length === 0) {
      return undefined;
    }
    const latest = logs[logs.length - 1] as Record<string, unknown> | undefined;
    return typeof latest?.message === 'string' ? latest.message : undefined;
  }

  private formatTaskResult(task: VideoGenerationTask): Record<string, unknown> {
    const mode = this.getTaskMode(task);
    return {
      taskId: task.taskId,
      mode,
      provider: task.provider,
      model: task.model,
      status: task.status,
      providerStatus: task.providerStatus,
      prompt: task.prompt,
      referenceImageUrl: this.readInputUrl(task, 'image_url', 'start_image_url'),
      referenceVideoUrl: this.readInputUrl(task, 'video_url'),
      endImageUrl: this.readInputUrl(task, 'tail_image_url', 'end_image_url'),
      outputUrl: task.outputUrl,
      thumbnailUrl: task.thumbnailUrl,
      error: task.error,
      ready: task.status === VideoGenerationStatusEnum.COMPLETED,
      message: task.status === VideoGenerationStatusEnum.COMPLETED
        ? `${this.formatModeLabel(mode)} is complete. The outputUrl contains the final video.`
        : task.status === VideoGenerationStatusEnum.FAILED
          ? `${this.formatModeLabel(mode)} failed: ${task.error || 'Unknown provider error'}`
          : `${this.formatModeLabel(mode)} is still running in the background.`,
      video: task.outputUrl
        ? {
            url: task.outputUrl,
            mimetype: 'video/mp4',
          }
        : undefined,
    };
  }

  private resolveMode(mode?: string): VideoGenerationMode {
    if (mode === 'image_to_video' || mode === 'video_to_video') {
      return mode;
    }
    return DEFAULT_VIDEO_MODE;
  }

  private resolvePrompt(params: VideoGenerateParams, mode: VideoGenerationMode): string {
    const explicitPrompt = String(params.prompt || '').trim();
    if (explicitPrompt) {
      return explicitPrompt;
    }

    if (mode === 'image_to_video' && this.resolveReferenceImageUrl(params)) {
      return 'Animate the provided reference image with cinematic motion while preserving the subject identity, composition, and overall style.';
    }

    if (mode === 'video_to_video' && this.resolveReferenceImageUrl(params) && this.resolveReferenceVideoUrl(params)) {
      return 'Follow the motion, pacing, and action cues from the reference video while preserving the subject and visual identity from the reference image.';
    }

    return '';
  }

  private resolveReferenceImageUrl(params: VideoGenerateParams): string | undefined {
    const candidate = params.referenceImageUrl || params.imageUrl;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
  }

  private resolveEndImageUrl(params: VideoGenerateParams): string | undefined {
    const candidate = params.endImageUrl || params.tailImageUrl;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
  }

  private resolveReferenceVideoUrl(params: VideoGenerateParams): string | undefined {
    const candidate = params.referenceVideoUrl || params.videoUrl;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
  }

  private getTaskMode(task: VideoGenerationTask): VideoGenerationMode {
    const inputMode = typeof task.input?.mode === 'string' ? task.input.mode : undefined;
    return this.resolveMode(inputMode);
  }

  private formatModeLabel(mode: VideoGenerationMode): string {
    switch (mode) {
      case 'image_to_video':
        return 'Image-to-video';
      case 'video_to_video':
        return 'Video-to-video';
      default:
        return 'Text-to-video';
    }
  }

  private readInputUrl(task: VideoGenerationTask, ...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = task.input?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}