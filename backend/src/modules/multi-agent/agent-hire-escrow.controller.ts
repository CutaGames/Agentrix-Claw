import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentHireEscrowService } from './agent-hire-escrow.service';

interface AuthedRequest {
  user?: { id?: string; sub?: string; userId?: string; isAdmin?: boolean };
}

function userIdOf(req: AuthedRequest): string {
  const id = req.user?.id || req.user?.sub || req.user?.userId;
  if (!id) throw new Error('unauthenticated');
  return id;
}

/**
 * Multi-Agent v2 W7 — Hire escrow endpoints.
 *
 *   GET  /api/multi-agent/marketplace/escrows           — list mine (?role=hirer|seller|both)
 *   GET  /api/multi-agent/marketplace/escrows/by-task/:taskId
 *   POST /api/multi-agent/marketplace/escrows/:taskId/dispute
 *
 * Admin (req.user.isAdmin=true) endpoints:
 *   POST /api/multi-agent/marketplace/escrows/:escrowId/admin/uphold
 *   POST /api/multi-agent/marketplace/escrows/:escrowId/admin/reject
 *   POST /api/multi-agent/marketplace/escrows/admin/reconcile-stale
 */
@Controller('multi-agent/marketplace/escrows')
@UseGuards(JwtAuthGuard)
export class AgentHireEscrowController {
  constructor(private readonly escrow: AgentHireEscrowService) {}

  @Get()
  async listMine(
    @Req() req: AuthedRequest,
    @Query('role') role?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = userIdOf(req);
    const r = (role === 'hirer' || role === 'seller') ? role : 'both';
    const lim = limit ? parseInt(limit, 10) : 50;
    const data = await this.escrow.listForUser(userId, r, Number.isFinite(lim) ? lim : 50);
    return { success: true, data };
  }

  @Get('by-task/:taskId')
  async getByTask(@Req() req: AuthedRequest, @Param('taskId') taskId: string) {
    const userId = userIdOf(req);
    const e = await this.escrow.getByTaskId(taskId);
    if (!e) return { success: true, data: null };
    // Only the hirer or seller can read.
    if (e.hirerUserId !== userId && e.sellerUserId !== userId && !req.user?.isAdmin) {
      return { success: false, error: 'forbidden' };
    }
    return { success: true, data: e };
  }

  @Post(':taskId/dispute')
  async dispute(
    @Req() req: AuthedRequest,
    @Param('taskId') taskId: string,
    @Body() body: { reason: string },
  ) {
    const userId = userIdOf(req);
    const data = await this.escrow.dispute({
      taskId,
      hirerUserId: userId,
      reason: String(body?.reason || ''),
    });
    return { success: true, data };
  }

  @Post(':escrowId/admin/uphold')
  async adminUphold(@Req() req: AuthedRequest, @Param('escrowId') escrowId: string) {
    if (!req.user?.isAdmin) return { success: false, error: 'admin required' };
    const data = await this.escrow.adminUpholdDispute(escrowId);
    return { success: true, data };
  }

  @Post(':escrowId/admin/reject')
  async adminReject(@Req() req: AuthedRequest, @Param('escrowId') escrowId: string) {
    if (!req.user?.isAdmin) return { success: false, error: 'admin required' };
    const data = await this.escrow.adminRejectDispute(escrowId);
    return { success: true, data };
  }

  @Post('admin/reconcile-stale')
  async reconcileStale(@Req() req: AuthedRequest) {
    if (!req.user?.isAdmin) return { success: false, error: 'admin required' };
    const data = await this.escrow.reconcileStaleEscrows();
    return { success: true, data };
  }
}
