import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScanService } from './scan.service';

/**
 * Scan Controller — Multi-angle photo upload for 3D pet reconstruction.
 *
 * Endpoints:
 *   POST /api/v1/pet-generation/scan          — Submit photos for 3D scan
 *   GET  /api/v1/pet-generation/scan/:taskId  — Poll task status
 *   POST /api/v1/pet-generation/scan/:taskId/cancel — Cancel pending task
 *
 * Rate limit: max 3 scans per user per day.
 * Auth: JWT required (user must be logged in).
 */
@ApiTags('pet-generation/scan')
@Controller('pet-generation/scan')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  /**
   * POST /api/v1/pet-generation/scan
   * Submit multi-angle photos for 3D reconstruction.
   * Accepts multipart form data with photos[] field.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit photos for 3D pet scan reconstruction' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('photos', 12, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
      },
      fileFilter: (_req, file, cb) => {
        // Only accept image files
        if (!file.mimetype.startsWith('image/')) {
          cb(new Error('Only image files are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async submitScan(
    @Request() req: any,
    @UploadedFiles() photos: Express.Multer.File[],
  ) {
    const userId: string = req.user.id;
    const metadata = {
      platform: req.body?.platform || 'mobile',
      photoCount: req.body?.photoCount,
      userAgent: req.headers?.['user-agent'],
    };

    const result = await this.scanService.submitScan(userId, photos, metadata);

    return {
      taskId: result.taskId,
      status: result.status,
      provider: result.provider,
    };
  }

  /**
   * GET /api/v1/pet-generation/scan/:taskId
   * Poll current task status. Returns result URLs when complete.
   */
  @Get(':taskId')
  @ApiOperation({ summary: 'Get scan task status and results' })
  async getTaskStatus(
    @Request() req: any,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    const userId: string = req.user.id;
    return this.scanService.getTaskStatus(taskId, userId);
  }

  /**
   * POST /api/v1/pet-generation/scan/:taskId/cancel
   * Cancel a pending or processing scan task.
   */
  @Post(':taskId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending scan task' })
  async cancelTask(
    @Request() req: any,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    const userId: string = req.user.id;
    await this.scanService.cancelTask(taskId, userId);
    return { success: true, message: 'Scan task cancelled' };
  }
}
