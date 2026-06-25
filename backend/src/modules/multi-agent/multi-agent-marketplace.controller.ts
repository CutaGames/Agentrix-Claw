import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MultiAgentMarketplaceService } from './multi-agent-marketplace.service';

interface AuthedRequest {
  user?: { sub?: string; userId?: string; id?: string };
}

function userIdOf(req: AuthedRequest): string {
  const id = req.user?.id || req.user?.sub || req.user?.userId;
  if (!id) throw new Error('unauthenticated');
  return String(id);
}

/**
 * Multi-Agent v2 W7 — marketplace-hire endpoints.
 *
 *   GET  /api/multi-agent/marketplace/my-pets       — list my listed pets
 *   POST /api/multi-agent/marketplace/list/:petId   — toggle listing on/off
 *
 * Spec: tasks.md W7.1, W7.4
 */
@Controller('multi-agent/marketplace')
@UseGuards(JwtAuthGuard)
export class MultiAgentMarketplaceController {
  constructor(private readonly marketplace: MultiAgentMarketplaceService) {}

  @Get('my-pets')
  async myPets(@Req() req: AuthedRequest) {
    const userId = userIdOf(req);
    const data = await this.marketplace.listMyMarketplacePets(userId);
    return { success: true, data };
  }

  @Post('list/:livingPetId')
  async toggleListing(
    @Req() req: AuthedRequest,
    @Param('livingPetId') livingPetId: string,
    @Body() body: { listed: boolean; publishedHireCostUsd?: number },
  ) {
    const userId = userIdOf(req);
    const result = await this.marketplace.setListed(
      userId,
      livingPetId,
      body.listed,
      body.publishedHireCostUsd,
    );
    return { success: true, data: result };
  }
}
