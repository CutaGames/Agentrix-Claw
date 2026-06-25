/**
 * CompanionFeatureFlagController — `GET /v1/feature-flag/pet_companion_redesign`
 *
 * Mobile boot uses this to decide whether to render the legacy IA or
 * the P-9 4-tab IA. Returns `{ enabled, rolloutPercentage, cohort }`.
 *
 * Spec: requirements.md R12.9.
 */
import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanionFeatureFlagService } from './companion-feature-flag.service';

@ApiTags('feature-flag')
@Controller('v1/feature-flag')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CompanionFeatureFlagController {
  constructor(private readonly svc: CompanionFeatureFlagService) {}

  @Get('pet_companion_redesign')
  @ApiOperation({
    summary: 'Get pet_companion_redesign enable state for the authenticated user',
  })
  async getStatus(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub || req.user?.userId;
    return this.svc.describeForUser(userId);
  }
}
