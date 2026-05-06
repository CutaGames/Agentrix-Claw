import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetEnergyService } from './pet-energy.service';
import { PetRiskControlService } from './pet-risk-control.service';
import { PetReportService } from './pet-report.service';

/**
 * Pet Energy / Auto-Earn Telemetry API — Phase 4 W7.
 *
 *   GET  /api/v1/pet/energy/:petSkinId/state            → current energy + budget
 *   POST /api/v1/pet/energy/:petSkinId/consume          → consume energy + budget for a task
 *   POST /api/v1/pet/energy/:petSkinId/llm-event        → record an LLM call (risk control)
 *   GET  /api/v1/pet/energy/:petSkinId/risk             → 1h LLM call assessment
 *   POST /api/v1/pet/energy/:petSkinId/resume           → operator clears pause
 *   GET  /api/v1/pet/report/daily/:petSkinId            → 24h report
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet')
export class PetEnergyController {
  constructor(
    private readonly energyService: PetEnergyService,
    private readonly riskService: PetRiskControlService,
    private readonly reportService: PetReportService,
  ) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Get('energy/:petSkinId/state')
  async getState(@Req() req: any, @Param('petSkinId') petSkinId: string) {
    const state = await this.energyService.getState(this.uid(req), petSkinId);
    return { state: this.toDto(state) };
  }

  @Post('energy/:petSkinId/consume')
  async consume(
    @Req() req: any,
    @Param('petSkinId') petSkinId: string,
    @Body() body: { energy_cost?: number; est_cost_cents?: number; budget_cents?: number },
  ) {
    const state = await this.energyService.consume(this.uid(req), petSkinId, {
      energyCost: body.energy_cost,
      estCostCents: body.est_cost_cents,
      budgetCents: body.budget_cents,
    });
    return { state: this.toDto(state) };
  }

  @Post('energy/:petSkinId/llm-event')
  async llmEvent(
    @Req() req: any,
    @Param('petSkinId') petSkinId: string,
    @Body() body: { model: string; cost_cents?: number },
  ) {
    const assessment = await this.riskService.recordCall(
      this.uid(req),
      petSkinId,
      body.model,
      body.cost_cents ?? 0,
    );
    return { assessment };
  }

  @Get('energy/:petSkinId/risk')
  async risk(@Req() req: any, @Param('petSkinId') petSkinId: string) {
    return { assessment: await this.riskService.assess(this.uid(req), petSkinId) };
  }

  @Post('energy/:petSkinId/resume')
  async resume(@Req() req: any, @Param('petSkinId') petSkinId: string) {
    const state = await this.energyService.resume(this.uid(req), petSkinId);
    return { state: this.toDto(state) };
  }

  @Get('report/daily/:petSkinId')
  async dailyReport(@Req() req: any, @Param('petSkinId') petSkinId: string) {
    const report = await this.reportService.generateDailyReport(this.uid(req), petSkinId);
    return { report };
  }

  private toDto(state: any) {
    return {
      pet_skin_id: state.petSkinId,
      energy: state.energy,
      daily_llm_calls: state.dailyLlmCalls,
      daily_spend_cents: state.dailySpendCents,
      paused: state.paused,
      paused_reason: state.pausedReason,
      updated_at: state.updatedAt,
    };
  }
}
