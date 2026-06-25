import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PetScanTask, ScanTaskStatus } from '../../../entities/pet-scan-task.entity';
import { ScanProviderRouter } from './scan-providers';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScanSubmitResult {
  taskId: string;
  status: ScanTaskStatus;
  provider: string;
}

export interface ScanStatusResult {
  taskId: string;
  status: ScanTaskStatus;
  provider: string;
  progress: number;
  photoCount: number;
  outputUrl: string | null;
  vrmUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum scans per user per day */
const MAX_SCANS_PER_DAY = 3;

/** Maximum photos per scan submission */
const MAX_PHOTOS_PER_SCAN = 12;

/** Minimum photos for a quality scan */
const MIN_PHOTOS_PER_SCAN = 1;

/** Timeout for provider operations (ms) */
const PROVIDER_TIMEOUT_MS = 30_000;

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @InjectRepository(PetScanTask)
    private readonly scanTaskRepo: Repository<PetScanTask>,
    private readonly providerRouter: ScanProviderRouter,
    private readonly config: ConfigService,
  ) {}

  /**
   * Submit a new scan task.
   * Saves photo URLs, creates a task record, and dispatches to the provider.
   */
  async submitScan(
    userId: string,
    photos: Express.Multer.File[],
    metadata?: Record<string, unknown>,
  ): Promise<ScanSubmitResult> {
    // 1. Validate photo count
    if (!photos || photos.length < MIN_PHOTOS_PER_SCAN) {
      throw new BadRequestException(
        `At least ${MIN_PHOTOS_PER_SCAN} photo is required`,
      );
    }
    if (photos.length > MAX_PHOTOS_PER_SCAN) {
      throw new BadRequestException(
        `Maximum ${MAX_PHOTOS_PER_SCAN} photos allowed per scan`,
      );
    }

    // 2. Rate limit check: max 3 scans per user per day
    await this.checkDailyQuota(userId);

    // 3. Upload photos to S3 (or use pre-signed URLs)
    const photoUrls = await this.uploadPhotos(userId, photos);

    // 4. Create task record
    const provider = this.providerRouter.getProvider();
    const task = this.scanTaskRepo.create({
      userId,
      status: ScanTaskStatus.QUEUED,
      provider: provider.id,
      photoUrls,
      photoCount: photos.length,
      metadata: metadata || null,
    });
    const saved = await this.scanTaskRepo.save(task);

    // 5. Dispatch to provider (async, don't block response)
    this.dispatchToProvider(saved.id, photoUrls).catch((err) => {
      this.logger.error(
        `Failed to dispatch scan task ${saved.id}: ${err.message}`,
      );
    });

    return {
      taskId: saved.id,
      status: saved.status,
      provider: provider.id,
    };
  }

  /**
   * Get current task status.
   * If the task is still processing, polls the provider for updates.
   */
  async getTaskStatus(taskId: string, userId: string): Promise<ScanStatusResult> {
    const task = await this.scanTaskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Scan task not found: ${taskId}`);
    }
    if (task.userId !== userId) {
      throw new ForbiddenException('Access denied to this scan task');
    }

    // If still processing, poll provider for latest status
    if (
      task.status === ScanTaskStatus.PROCESSING ||
      task.status === ScanTaskStatus.UPLOADING
    ) {
      await this.pollAndUpdateTask(task);
    }

    return this.toStatusResult(task);
  }

  /**
   * Cancel a pending or processing task.
   */
  async cancelTask(taskId: string, userId: string): Promise<void> {
    const task = await this.scanTaskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Scan task not found: ${taskId}`);
    }
    if (task.userId !== userId) {
      throw new ForbiddenException('Access denied to this scan task');
    }

    // Can only cancel queued or processing tasks
    if (
      task.status !== ScanTaskStatus.QUEUED &&
      task.status !== ScanTaskStatus.UPLOADING &&
      task.status !== ScanTaskStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `Cannot cancel task in status: ${task.status}`,
      );
    }

    task.status = ScanTaskStatus.CANCELLED;
    task.completedAt = new Date();
    await this.scanTaskRepo.save(task);

    this.logger.log(`Scan task ${taskId} cancelled by user ${userId}`);
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  private async checkDailyQuota(userId: string): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayCount = await this.scanTaskRepo.count({
      where: {
        userId,
        createdAt: MoreThan(startOfDay),
      },
    });

    if (todayCount >= MAX_SCANS_PER_DAY) {
      throw new BadRequestException(
        `Daily scan limit reached (${MAX_SCANS_PER_DAY} per day). Try again tomorrow.`,
      );
    }
  }

  /**
   * Upload photos to S3 and return their URLs.
   * For now, stores as data URIs or assumes client pre-uploaded to S3.
   * TODO: Integrate with UploadModule for proper S3 multipart upload.
   */
  private async uploadPhotos(
    userId: string,
    photos: Express.Multer.File[],
  ): Promise<string[]> {
    // In production, this would upload to S3 via the upload module.
    // For now, if photos have a `location` field (from multer-s3), use that.
    // Otherwise, generate a placeholder URL pattern.
    const urls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const file = photos[i];
      // multer-s3 sets `location` on the file object
      const s3Url = (file as any).location;
      if (s3Url) {
        urls.push(s3Url);
      } else {
        // Fallback: construct a placeholder path
        // In production, replace with actual S3 upload logic
        const timestamp = Date.now();
        const key = `scans/${userId}/${timestamp}_${i}.jpg`;
        const bucketUrl = this.config.get<string>('S3_BUCKET_URL') || 'https://s3.amazonaws.com/agentrix-uploads';
        urls.push(`${bucketUrl}/${key}`);

        this.logger.warn(
          `Photo ${i} not uploaded to S3 — using placeholder URL. ` +
          `Configure multer-s3 or UploadModule for production.`,
        );
      }
    }

    return urls;
  }

  /**
   * Dispatch scan to the configured provider.
   * Updates task status as it progresses.
   */
  private async dispatchToProvider(
    taskId: string,
    photoUrls: string[],
  ): Promise<void> {
    const task = await this.scanTaskRepo.findOne({ where: { id: taskId } });
    if (!task || task.status === ScanTaskStatus.CANCELLED) return;

    const provider = this.providerRouter.getProvider();

    try {
      // Update status to uploading
      task.status = ScanTaskStatus.UPLOADING;
      task.startedAt = new Date();
      await this.scanTaskRepo.save(task);

      // Submit to provider with timeout
      const submitPromise = provider.submitScan(photoUrls);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider submit timeout')), PROVIDER_TIMEOUT_MS),
      );

      const result = await Promise.race([submitPromise, timeoutPromise]);

      // Update with external task ID
      task.status = ScanTaskStatus.PROCESSING;
      task.externalTaskId = result.externalTaskId;
      await this.scanTaskRepo.save(task);

      this.logger.log(
        `Scan task ${taskId} dispatched to ${provider.id}: ${result.externalTaskId}`,
      );
    } catch (err: any) {
      task.status = ScanTaskStatus.FAILED;
      task.error = err.message || 'Provider dispatch failed';
      task.completedAt = new Date();
      await this.scanTaskRepo.save(task);

      this.logger.error(`Scan dispatch failed for ${taskId}: ${err.message}`);
    }
  }

  /**
   * Poll provider for task updates and persist changes.
   */
  private async pollAndUpdateTask(task: PetScanTask): Promise<void> {
    if (!task.externalTaskId) return;

    const provider = this.providerRouter.getProvider();

    try {
      const result = await provider.pollStatus(task.externalTaskId);

      task.progress = result.progress ?? task.progress;

      switch (result.status) {
        case 'completed':
          task.status = ScanTaskStatus.COMPLETED;
          task.outputUrl = result.outputUrl || null;
          task.thumbnailUrl = result.thumbnailUrl || null;
          task.completedAt = new Date();
          task.progress = 100;
          break;
        case 'failed':
          task.status = ScanTaskStatus.FAILED;
          task.error = result.error || 'Provider task failed';
          task.completedAt = new Date();
          break;
        case 'processing':
          task.status = ScanTaskStatus.PROCESSING;
          break;
        // 'pending' — no change
      }

      await this.scanTaskRepo.save(task);
    } catch (err: any) {
      this.logger.warn(`Poll failed for task ${task.id}: ${err.message}`);
      // Don't fail the task on a single poll error
    }
  }

  private toStatusResult(task: PetScanTask): ScanStatusResult {
    return {
      taskId: task.id,
      status: task.status,
      provider: task.provider,
      progress: task.progress,
      photoCount: task.photoCount,
      outputUrl: task.outputUrl,
      vrmUrl: task.vrmUrl,
      thumbnailUrl: task.thumbnailUrl,
      error: task.error,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  }
}
