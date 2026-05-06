import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DmcaService } from './dmca.service';
import { DmcaTargetKind } from '../../entities/dmca-report.entity';

interface SubmitBody {
  targetKind: DmcaTargetKind;
  targetId: string;
  uploaderUserId?: string;
  rightType?: string;
  description: string;
  evidenceUrls?: string[];
  claimantEmail: string;
  swornStatement: boolean;
}

interface ResolveBody {
  decision: 'upheld' | 'rejected';
  notes?: string;
}

/**
 * DMCA endpoints — Phase 2 W2 BE-T2.9.
 *
 *  POST /v1/dmca/report          — submit a takedown request (auth required)
 *  POST /v1/dmca/report/:id/withdraw   — claimant withdraws own report
 *  POST /v1/dmca/report/:id/resolve    — reviewer resolves (admin-only — TODO: AdminGuard)
 *  GET  /v1/dmca/report/:id      — fetch report
 *  GET  /v1/dmca/queue           — pending reports list
 */
@Controller('v1/dmca')
export class DmcaController {
  constructor(private readonly service: DmcaService) {}

  @UseGuards(JwtAuthGuard)
  @Post('report')
  async submit(@Req() req: any, @Body() body: SubmitBody) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const row = await this.service.createReport({
      claimantUserId: userId,
      claimantEmail: body.claimantEmail,
      targetKind: body.targetKind,
      targetId: body.targetId,
      uploaderUserId: body.uploaderUserId ?? null,
      rightType: body.rightType,
      description: body.description,
      evidenceUrls: body.evidenceUrls,
      swornStatement: body.swornStatement,
    });
    return this.service.toDto(row);
  }

  @UseGuards(JwtAuthGuard)
  @Post('report/:id/withdraw')
  async withdraw(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const row = await this.service.withdraw(id, userId);
    return this.service.toDto(row);
  }

  @UseGuards(JwtAuthGuard)
  @Post('report/:id/resolve')
  async resolve(@Req() req: any, @Param('id') id: string, @Body() body: ResolveBody) {
    const reviewerId = req.user?.userId || req.user?.sub || req.user?.id;
    const row = await this.service.resolve(id, reviewerId, body.decision, body.notes);
    return this.service.toDto(row);
  }

  @UseGuards(JwtAuthGuard)
  @Get('report/:id')
  async get(@Param('id') id: string) {
    const row = await this.service.findById(id);
    return row ? this.service.toDto(row) : null;
  }

  @UseGuards(JwtAuthGuard)
  @Get('queue')
  async queue() {
    const rows = await this.service.listPending();
    return { count: rows.length, items: rows.map((r) => this.service.toDto(r)) };
  }
}
