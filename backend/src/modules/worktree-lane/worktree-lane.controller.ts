import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BulkImportDto,
  CreateLaneDto,
  UpdateLanePatch,
  WorktreeLaneService,
} from './worktree-lane.service';

interface AuthedRequest extends Request {
  user?: { sub?: string; userId?: string };
}

function getUserId(req: AuthedRequest): string {
  const id = req.user?.sub || req.user?.userId;
  if (!id) throw new Error('unauthenticated');
  return String(id);
}

/**
 * REST endpoints for desktop client lane sync.
 * Spec: design.md §6, tasks W1.2.
 */
@Controller('worktree-lanes')
@UseGuards(JwtAuthGuard)
export class WorktreeLaneController {
  constructor(private readonly service: WorktreeLaneService) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Query('workspaceDir') workspaceDir?: string) {
    const userId = getUserId(req);
    const lanes = await this.service.listLanes(userId, workspaceDir);
    return { lanes };
  }

  @Post('bulk-import')
  async bulkImport(@Req() req: AuthedRequest, @Body() body: { lanes: CreateLaneDto[] }) {
    const userId = getUserId(req);
    // Enforce userId from JWT, not from body — prevent cross-user smuggling.
    const dto: BulkImportDto = {
      userId,
      lanes: (body.lanes || []).map((l) => ({ ...l, userId })),
    };
    return this.service.bulkImport(dto);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: CreateLaneDto) {
    const userId = getUserId(req);
    const dto: CreateLaneDto = { ...body, userId };
    const lane = await this.service.createLane(dto);
    return { lane };
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') laneId: string,
    @Body() body: UpdateLanePatch,
  ) {
    const userId = getUserId(req);
    const lane = await this.service.updateLane(userId, laneId, body);
    return { lane };
  }

  @Delete(':id')
  async remove(@Req() req: AuthedRequest, @Param('id') laneId: string) {
    const userId = getUserId(req);
    await this.service.deleteLane(userId, laneId);
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Multi-Agent v1 W5.8/9 — lane rollback + attempt-merge (conflict detect)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * POST /api/worktree-lanes/:id/rollback
   * Soft-delete the lane,clear status. Worktree directory cleanup is
   * a desktop-side concern (we just remove the row).
   */
  @Post(':id/rollback')
  async rollback(@Req() req: AuthedRequest, @Param('id') laneId: string) {
    const userId = getUserId(req);
    const lane = await this.service.getById(userId, laneId);
    await this.service.deleteLane(userId, laneId);
    return { ok: true, rolledBack: lane.worktreeBranch };
  }

  /**
   * POST /api/worktree-lanes/:id/attempt-merge
   * Server-side conflict detection: if another lane on the same
   * baseBranch is in 'review' status, return `{ conflict: true,
   * conflictingLaneId }`. Otherwise mark this lane as 'merged' and
   * return `{ conflict: false }`.
   */
  @Post(':id/attempt-merge')
  async attemptMerge(@Req() req: AuthedRequest, @Param('id') laneId: string) {
    const userId = getUserId(req);
    return this.service.attemptMerge(userId, laneId);
  }
}
