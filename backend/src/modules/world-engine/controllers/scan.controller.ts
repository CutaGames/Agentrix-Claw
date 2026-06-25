import {
  Controller,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { ReconstructionService } from '../reconstruction/reconstruction.service';
import { AssetCreationService } from '../services/asset-creation.service';
import { AiProviderService } from '../../ai-provider/ai-provider.service';
import { ScanSession } from '../entities/scan-session.entity';
import type {
  StartScanRequest,
  StartScanResponse,
  UploadFrameResponse,
  PredictQualityResponse,
  GenerateFromScanRequest,
  GenerateFromScanResponse,
} from '../../../../shared/types/world-engine-api';
import type { QualityScore } from '../../../../shared/types/world-engine';

/** Maximum image file size: 10 MB. Phone cameras can produce 5-15MB
 *  HEIC/JPEG originals (quick scan = full-resolution frame); we used to
 *  cap at 2MB which routinely caused mobile uploads to fail with a
 *  generic "Network request failed" because nginx terminated the
 *  connection before the body finished. 10MB is plenty for our scan
 *  pipeline (typical 4032×3024 JPEG @ 80% quality ≈ 3-6MB). */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Upload directory for world-engine scan images */
const SCAN_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'world-engine', 'scans');

@ApiTags('world-engine/scan')
@Controller('v1/world-engine/scan')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(
    private readonly reconstructionService: ReconstructionService,
    @InjectRepository(ScanSession)
    private readonly scanSessionRepo: Repository<ScanSession>,
    private readonly assetCreationService: AssetCreationService,
    private readonly aiProviderService: AiProviderService,
  ) {
    // Ensure upload directory exists
    if (!fs.existsSync(SCAN_UPLOAD_DIR)) {
      fs.mkdirSync(SCAN_UPLOAD_DIR, { recursive: true });
    }
  }

  /**
   * Whether the user brought their own 3D provider key (tencent-3d / meshy).
   * BYO-key users may run 3D reconstruction even when the platform 3D path is
   * gated OFF (WORLD_ENGINE_3D_ENABLED!=true) — it runs on their account/quota.
   * Failure-safe: any lookup error → treated as "no key" (card-only).
   */
  private async userHasByo3dKey(userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
      const [tencent, meshy] = await Promise.all([
        this.aiProviderService.getDecryptedKey(userId, 'tencent-3d'),
        this.aiProviderService.getDecryptedKey(userId, 'meshy'),
      ]);
      return Boolean((tencent?.apiKey && tencent?.secretKey) || meshy?.apiKey);
    } catch (e) {
      this.logger.warn(`userHasByo3dKey lookup failed for ${userId}: ${(e as Error).message}`);
      return false;
    }
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a new scan session' })
  async startScan(
    @Request() req: any,
    @Body() body: StartScanRequest,
  ): Promise<StartScanResponse> {
    const userId = req.user.id ?? req.user.sub;
    const mode = body.mode;

    if (!['quick', 'detail', 'room'].includes(mode)) {
      throw new BadRequestException('Invalid scan mode. Must be "quick", "detail", or "room".');
    }

    const pipelineUsed = mode === 'detail' ? 'precision' : 'fast';

    const session = this.scanSessionRepo.create({
      userId,
      scanMode: mode,
      imageCount: 0,
      qualityScores: [],
      overallPredictionScore: null,
      status: 'capturing',
      resultAssetId: null,
      pipelineUsed,
      errorMessage: null,
    });

    const saved = await this.scanSessionRepo.save(session);
    return { sessionId: saved.id };
  }

  @Post(':sessionId/upload')
  @ApiOperation({ summary: 'Upload a captured frame to the scan session' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async uploadFrame(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<UploadFrameResponse> {
    const userId = req.user.id ?? req.user.sub;

    const session = await this.scanSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Scan session not found');
    }
    if (session.userId !== userId) {
      throw new NotFoundException('Scan session not found');
    }
    if (session.status !== 'capturing') {
      throw new BadRequestException('Scan session is no longer accepting uploads');
    }

    // Store image to local filesystem (simulating S3)
    const sessionDir = path.join(SCAN_UPLOAD_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const frameIndex = session.imageCount;
    // Wave 17 v6 (2026-05-24) — Hunyuan3D rejects images with any dimension
    // > 5000px ("InvalidParameterValue.InvalidImageResolution"). Phone cameras
    // routinely produce 6048×4032 or larger originals. We resize down to a
    // max edge of 4000px while preserving JPEG and aspect ratio so the
    // provider can accept the URL. Sharp also re-encodes at quality=82
    // which trims size further (typically 4032x3024 ~6MB → 4000x3000 ~1.2MB).
    let processedBuffer = file.buffer;
    let outputExt = path.extname(file.originalname) || '.jpg';
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const sharp = require('sharp');
      const meta = await sharp(file.buffer).metadata();
      const maxDim = Math.max(meta.width || 0, meta.height || 0);
      if (maxDim > 4000) {
        processedBuffer = await sharp(file.buffer)
          .rotate() // honor EXIF orientation so the resized image matches what the user saw
          .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        outputExt = '.jpg';
      } else if (meta.format && meta.format !== 'jpeg' && meta.format !== 'jpg') {
        // Convert PNG/WebP to JPEG too — Hunyuan3D ImageUrl accepts JPEG most
        // reliably and the provider docs say "JPG/PNG/WebP" but PNG/WebP
        // sometimes fail with "InvalidImageFormat".
        processedBuffer = await sharp(file.buffer)
          .rotate()
          .jpeg({ quality: 90 })
          .toBuffer();
        outputExt = '.jpg';
      }
    } catch (err) {
      // If sharp is unavailable or the image is malformed, fall back to the
      // raw upload — we'd rather try the bigger image and let Hunyuan reject
      // it than silently 500 the upload. The next reconstruction attempt
      // will surface a clear error.
      this.logger.warn(
        `[scan/upload] sharp resize skipped (sessionId=${sessionId} frameIndex=${frameIndex}): ${(err as Error).message}`,
      );
    }

    const fileName = `frame_${frameIndex}_${randomUUID()}${outputExt}`;
    const filePath = path.join(sessionDir, fileName);
    fs.writeFileSync(filePath, processedBuffer);

    // Compute basic quality score
    const qualityScore = this.computeQualityScore(processedBuffer, frameIndex, session.qualityScores as unknown as QualityScore[]);

    // Update session
    const updatedScores = [...(session.qualityScores as unknown as QualityScore[]), qualityScore];
    await this.scanSessionRepo.update(sessionId, {
      imageCount: frameIndex + 1,
      qualityScores: updatedScores as any,
    });

    return { frameIndex, qualityScore };
  }

  @Post(':sessionId/predict-quality')
  @ApiOperation({ summary: 'Get overall quality prediction for the scan session' })
  async predictQuality(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
  ): Promise<PredictQualityResponse> {
    const userId = req.user.id ?? req.user.sub;

    const session = await this.scanSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Scan session not found');
    }
    if (session.userId !== userId) {
      throw new NotFoundException('Scan session not found');
    }

    const scores = session.qualityScores as unknown as QualityScore[];
    if (scores.length === 0) {
      return { overallScore: 1, suggestions: ['Capture at least one image to get a quality prediction.'] };
    }

    // Compute overall 1-5 star prediction
    const { overallScore, suggestions } = this.computeOverallPrediction(scores, session.scanMode);

    // Persist the prediction score
    await this.scanSessionRepo.update(sessionId, { overallPredictionScore: overallScore });

    return { overallScore, suggestions };
  }

  @Post(':sessionId/generate')
  @ApiOperation({ summary: 'Submit scan session for 3D reconstruction' })
  async generate(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
    @Body() body: GenerateFromScanRequest,
  ): Promise<GenerateFromScanResponse> {
    const userId = req.user.id ?? req.user.sub;

    const session = await this.scanSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Scan session not found');
    }
    if (session.userId !== userId) {
      throw new NotFoundException('Scan session not found');
    }
    if (session.status !== 'capturing') {
      throw new BadRequestException('Scan session has already been submitted');
    }

    // Validate minimum frame count
    const minFrames = session.scanMode === 'quick' ? 1 : 8;
    if (session.imageCount < minFrames) {
      throw new BadRequestException(
        `Minimum ${minFrames} frame(s) required for ${session.scanMode} scan. Currently have ${session.imageCount}.`,
      );
    }

    // Validate style
    const validStyles = ['cartoon', 'pixel-art', 'fantasy', 'sci-fi', 'realistic'];
    if (!validStyles.includes(body.style)) {
      throw new BadRequestException(`Invalid style. Must be one of: ${validStyles.join(', ')}`);
    }

    // Mark session as submitted
    await this.scanSessionRepo.update(sessionId, { status: 'submitted' });

    // Collect image URLs from the upload directory
    const sessionDir = path.join(SCAN_UPLOAD_DIR, sessionId);
    let imageUrls: string[] = [];
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir);
      // Wave 17 v5 (2026-05-24) — Hunyuan3D's SubmitHunyuanTo3DJob requires a
      // fully-qualified, public-internet HTTPS URL ("InvalidParameterValue.UrlIllegal —
      // URL格式不合法" otherwise). Previously we returned `/api/uploads/...`
      // which the Tencent endpoint cannot fetch. Now we prefix with the
      // PUBLIC_URL env var so the provider can pull the bytes back.
      const publicBase = (process.env.PUBLIC_URL || 'https://api.agentrix.top').replace(/\/$/, '');
      imageUrls = files
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map((f) => `${publicBase}/api/uploads/world-engine/scans/${sessionId}/${f}`);
    }

    // 游客本地试用模式: 只生成 AI 角色卡返回给客户端本地展示, 不落库、不跑 3D
    // (省成本 + 符合"保存时才登录"的产品决策)。游客点"保存"→登录后重新走完整生成。
    const isGuest = req.user?.isGuest === true || req.user?.type === 'guest';
    if (isGuest) {
      try {
        const { profile, abilitySnapshot, portraitUrl } = await this.assetCreationService.generateCharacterCardOnly(imageUrls);
        await this.scanSessionRepo.update(sessionId, { status: 'completed' });
        return {
          jobId: `guest-${sessionId}`,
          estimatedSeconds: 0,
          characterCard: {
            name: profile.name,
            stats: profile.stats,
            skills: (profile.skills || []).map((s: any) => ({
              name: s.name,
              type: s.type,
              description: s.description ?? s.desc,
            })),
            personalityTraits: profile.personalityTraits || [],
            backstory: profile.backstory || '',
            category: 'character',
            thumbnailUrl: portraitUrl ?? undefined,
            ...(abilitySnapshot
              ? {
                  abilityBoost: {
                    multiplier: abilitySnapshot.multiplier,
                    effectiveStats: abilitySnapshot.effectiveStats,
                    breakdown: abilitySnapshot.breakdown,
                  },
                }
              : {}),
          },
          generationStatus: 'guest_preview',
        };
      } catch (guestErr: any) {
        this.logger.warn(`[scan/generate] guest preview failed (session ${sessionId}): ${guestErr.message}`);
        throw new BadRequestException('Guest preview generation failed, please try again.');
      }
    }

    // 方案 B (card-before-mesh): 先同步创建 card_ready 资产 — 仅凭照片跑 AI 属性
    // (秒级, 不等 3D), 让移动端立即显示角色卡。先创建 asset 再提交 3D job, 保证
    // worker 完成时 session.resultAssetId 已就绪, attachMeshBySession 能命中。
    // 若 AI 属性这一步失败, 不阻塞生成: worker 完成 3D 时会兜底创建资产。
    let assetId: string | undefined;
    let characterCard: GenerateFromScanResponse['characterCard'];
    try {
      const card = await this.assetCreationService.createCardReadyAsset(sessionId, imageUrls, {
        ownerId: userId,
        scanMode: session.scanMode as 'quick' | 'detail' | 'room',
        source: 'scanned',
      });
      assetId = card.assetId;
      characterCard = {
        name: card.profile.name,
        stats: card.profile.stats,
        skills: (card.profile.skills || []).map((s: any) => ({
          name: s.name,
          type: s.type,
          description: s.description ?? s.desc,
        })),
        personalityTraits: card.profile.personalityTraits || [],
        backstory: card.profile.backstory || '',
        category: 'character',
        thumbnailUrl: card.portraitUrl ?? undefined,
        ...(card.abilitySnapshot
          ? {
              abilityBoost: {
                multiplier: card.abilitySnapshot.multiplier,
                effectiveStats: card.abilitySnapshot.effectiveStats,
                breakdown: card.abilitySnapshot.breakdown,
              },
            }
          : {}),
      };
    } catch (cardErr: any) {
      this.logger.warn(
        `[scan/generate] card-ready asset creation failed (session ${sessionId}): ${cardErr.message} — ` +
          `falling back to mesh-only flow (worker will create asset on completion).`,
      );
    }

    // 3D 成本闸门 (2026-06-01): 拍照生成的核心玩法只依赖 card_ready 2D 资产
    // (AI 属性卡 + 首帧照片作为立绘), "我的世界"/"永曜城" 全程 2D 可玩。3D mesh
    // 只是异步增强 (Hunyuan3D 单任务串行 + 计费不低 + 30-90s 延迟)。
    //
    // 规则:
    //   - 平台 3D 默认关闭 (WORLD_ENGINE_3D_ENABLED!=true) — 省平台成本。
    //   - 但若用户自带 3D key (tencent-3d / meshy 订阅或 API), 用他自己的额度跑,
    //     不受平台开关限制 — "平台暂不开放, 你可以用自己的 provider"。
    const platform3dEnabled = String(process.env.WORLD_ENGINE_3D_ENABLED ?? '').toLowerCase() === 'true';
    const userHas3dKey = await this.userHasByo3dKey(userId);
    const meshEnabled = platform3dEnabled || userHas3dKey;
    if (!meshEnabled) {
      // 已经有 card_ready 资产: 直接完成会话, 不再等 mesh。
      if (assetId) {
        await this.scanSessionRepo.update(sessionId, { status: 'completed' });
      } else {
        // 极少数: card 创建失败 + 3D 又关闭 → 兜底再尝试一次 card-only。
        try {
          const fallback = await this.assetCreationService.createCardReadyAsset(sessionId, imageUrls, {
            ownerId: userId,
            scanMode: session.scanMode as 'quick' | 'detail' | 'room',
            source: 'scanned',
          });
          assetId = fallback.assetId;
          await this.scanSessionRepo.update(sessionId, { status: 'completed' });
        } catch (e: any) {
          this.logger.warn(`[scan/generate] 3D disabled + card fallback failed (session ${sessionId}): ${e.message}`);
        }
      }
      this.logger.log(`[scan/generate] WORLD_ENGINE_3D_ENABLED!=true → skip 3D mesh (session ${sessionId}, card-only).`);
      return {
        jobId: `card-${sessionId}`,
        estimatedSeconds: 0,
        assetId,
        characterCard,
        generationStatus: 'card_ready',
      };
    }

    // Submit to reconstruction service (background 3D mesh; non-blocking)
    const { jobId, estimatedSeconds } = await this.reconstructionService.submitJob({
      imageUrls,
      mode: session.scanMode as 'quick' | 'detail' | 'room',
      style: body.style,
      userId,
      sessionId,
    });

    return {
      jobId,
      estimatedSeconds,
      assetId,
      characterCard,
      generationStatus: assetId ? 'card_ready' : 'mesh_pending',
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Compute basic quality score for a frame.
   * Sharpness: estimated via Laplacian variance (simplified for server-side).
   * Exposure: estimated via histogram analysis of pixel brightness.
   * Angle novelty: approximated based on frame index diversity.
   */
  private computeQualityScore(
    buffer: Buffer,
    frameIndex: number,
    existingScores: QualityScore[],
  ): QualityScore {
    const sharpness = this.estimateSharpness(buffer);
    const exposure = this.estimateExposure(buffer);
    const angleNovelty = this.estimateAngleNovelty(frameIndex, existingScores);
    const overall = Math.round((sharpness + exposure + angleNovelty) / 3);

    return { frameIndex, sharpness, exposure, angleNovelty, overall };
  }

  /**
   * Estimate sharpness via a simplified Laplacian variance approach.
   * Samples pixel intensity differences to approximate edge strength.
   */
  private estimateSharpness(buffer: Buffer): number {
    // Simplified Laplacian variance: sample pixel intensity differences
    // In production, this would use a proper image processing library (sharp/opencv)
    if (buffer.length < 100) return 30;

    let variance = 0;
    const sampleSize = Math.min(buffer.length - 2, 1000);
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));

    for (let i = 1; i < buffer.length - 1 && i < sampleSize * step; i += step) {
      // Laplacian approximation: second derivative
      const laplacian = buffer[i - 1] + buffer[i + 1] - 2 * buffer[i];
      variance += laplacian * laplacian;
    }

    const avgVariance = variance / Math.min(sampleSize, Math.floor((buffer.length - 2) / step));
    // Normalize to 0-100 scale (empirical thresholds)
    const normalized = Math.min(100, Math.max(0, Math.round(Math.sqrt(avgVariance) * 2)));
    return Math.max(10, Math.min(100, normalized));
  }

  /**
   * Estimate exposure quality via histogram analysis.
   * Checks if pixel values are well-distributed (not too dark or too bright).
   */
  private estimateExposure(buffer: Buffer): number {
    if (buffer.length < 100) return 50;

    // Sample bytes and build a simplified brightness histogram
    const sampleSize = Math.min(buffer.length, 2000);
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    let sum = 0;
    let count = 0;
    let darkPixels = 0;
    let brightPixels = 0;

    for (let i = 0; i < buffer.length && count < sampleSize; i += step) {
      const val = buffer[i];
      sum += val;
      count++;
      if (val < 40) darkPixels++;
      if (val > 220) brightPixels++;
    }

    const mean = sum / count;
    const darkRatio = darkPixels / count;
    const brightRatio = brightPixels / count;

    // Ideal mean is around 128 (middle of 0-255 range)
    const meanScore = 100 - Math.abs(mean - 128) * 0.78;
    // Penalize if too many dark or bright pixels
    const distributionPenalty = (darkRatio + brightRatio) * 50;

    const score = Math.round(Math.max(10, Math.min(100, meanScore - distributionPenalty)));
    return score;
  }

  /**
   * Estimate angle novelty based on frame diversity.
   * First frame always gets high novelty; subsequent frames get decreasing novelty
   * unless there are enough frames to suggest good coverage.
   */
  private estimateAngleNovelty(frameIndex: number, existingScores: QualityScore[]): number {
    if (frameIndex === 0) return 90; // First frame is always novel

    // Diminishing novelty with more frames, but reward diversity
    const totalFrames = existingScores.length + 1;
    // Base novelty decreases with more frames from same session
    const baseNovelty = Math.max(30, 90 - (frameIndex * 8));
    // Bonus for having good coverage (more frames = better diversity approximation)
    const coverageBonus = Math.min(20, totalFrames * 3);

    return Math.min(100, Math.max(10, Math.round(baseNovelty + coverageBonus)));
  }

  /**
   * Compute overall 1-5 star quality prediction from all frames' scores.
   * Based on: average sharpness, exposure consistency, angle diversity approximation.
   */
  private computeOverallPrediction(
    scores: QualityScore[],
    scanMode: string,
  ): { overallScore: number; suggestions: string[] } {
    const suggestions: string[] = [];

    // Average sharpness
    const avgSharpness = scores.reduce((sum, s) => sum + s.sharpness, 0) / scores.length;

    // Exposure consistency (low std dev = consistent)
    const avgExposure = scores.reduce((sum, s) => sum + s.exposure, 0) / scores.length;
    const exposureVariance =
      scores.reduce((sum, s) => sum + Math.pow(s.exposure - avgExposure, 2), 0) / scores.length;
    const exposureConsistency = Math.max(0, 100 - Math.sqrt(exposureVariance) * 2);

    // Angle diversity approximation
    const avgAngleNovelty = scores.reduce((sum, s) => sum + s.angleNovelty, 0) / scores.length;

    // Weighted composite (sharpness 40%, exposure consistency 30%, angle diversity 30%)
    const composite = avgSharpness * 0.4 + exposureConsistency * 0.3 + avgAngleNovelty * 0.3;

    // Map composite (0-100) to stars (1-5)
    let stars: number;
    if (composite >= 80) stars = 5;
    else if (composite >= 65) stars = 4;
    else if (composite >= 50) stars = 3;
    else if (composite >= 35) stars = 2;
    else stars = 1;

    // Generate suggestions for improvement
    if (avgSharpness < 60) {
      suggestions.push('Some frames are blurry. Try holding the camera steadier or retaking blurry frames.');
    }
    if (exposureConsistency < 60) {
      suggestions.push('Lighting varies between frames. Try to maintain consistent lighting conditions.');
    }
    if (avgAngleNovelty < 50 && scanMode === 'detail') {
      suggestions.push('Add more side-angle shots to improve 3D coverage.');
    }
    if (scores.length < 8 && scanMode === 'detail') {
      const needed = 8 - scores.length;
      suggestions.push(`Add ${needed} more frame(s) for better detail scan results.`);
    }

    // Check for any red-flagged frames
    const poorFrames = scores.filter((s) => s.overall < 40);
    if (poorFrames.length > 0) {
      suggestions.push(
        `Retake frame(s) ${poorFrames.map((f) => `#${f.frameIndex}`).join(', ')} �?they scored below quality threshold.`,
      );
    }

    return { overallScore: stars, suggestions };
  }
}
