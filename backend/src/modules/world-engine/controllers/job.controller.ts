import {
  Controller,
  Get,
  Param,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { ReconstructionService } from '../reconstruction/reconstruction.service';
import type { JobStatusResponse } from '../../../../shared/types/world-engine-api';

@ApiTags('world-engine/jobs')
@Controller('v1/world-engine/jobs')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class JobController {
  constructor(private readonly reconstructionService: ReconstructionService) {}

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get the status of a generation job' })
  async getJobStatus(
    @Request() req: any,
    @Param('jobId') jobId: string,
  ): Promise<JobStatusResponse> {
    const jobStatus = await this.reconstructionService.getJobStatus(jobId);

    if (jobStatus.status === 'failed' && jobStatus.error === 'Job not found') {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return {
      status: jobStatus.status,
      progress: jobStatus.progress,
      result: jobStatus.result as any,
    };
  }
}
