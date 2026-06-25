import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MultiAgentSummaryService } from './multi-agent-summary.service';

interface AuthedRequest {
  user?: { sub?: string; userId?: string; id?: string };
}

function userIdOf(req: AuthedRequest): string {
  const id = req.user?.id || req.user?.sub || req.user?.userId;
  if (!id) throw new Error('unauthenticated');
  return String(id);
}

/**
 * Multi-Agent v1 W5 — weekly summary + CSV export.
 *
 * Spec: tasks.md W5.5, W5.7
 */
@Controller('multi-agent')
@UseGuards(JwtAuthGuard)
export class MultiAgentSummaryController {
  constructor(private readonly summary: MultiAgentSummaryService) {}

  @Get('weekly-summary')
  async weeklySummary(@Req() req: AuthedRequest) {
    const userId = userIdOf(req);
    const data = await this.summary.computeWeeklySummary(userId);
    return { success: true, data };
  }

  @Get('team-activity-report')
  async teamActivityReport(
    @Req() req: AuthedRequest,
    @Query('format') format: string | undefined,
    @Query('days') daysParam: string | undefined,
    @Res() res: Response,
  ) {
    const userId = userIdOf(req);
    const days = daysParam ? Math.max(1, Math.min(parseInt(daysParam, 10) || 30, 365)) : 30;

    if (format === 'csv') {
      const csv = await this.summary.exportTeamActivityCsv(userId, days);
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader(
          'Content-Disposition',
          `attachment; filename="agentrix-team-activity-${days}d.csv"`,
        )
        .send(csv);
      return;
    }

    // JSON fallback — same data, structured rows
    const csv = await this.summary.exportTeamActivityCsv(userId, days);
    const lines = csv.split('\n');
    const header = lines[0].split(',');
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',');
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = cells[i] ?? '';
      });
      return obj;
    });
    res.status(200).json({ success: true, data: { days, rows } });
  }
}
