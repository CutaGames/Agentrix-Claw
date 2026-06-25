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
import { PetA2ADispatchService } from './pet-a2a-dispatch.service';

/**
 * Pet A2A Dispatch API — Phase 4 W7 BE-7.4.
 *
 *   POST /api/v1/pet/a2a/dispatch                → pet issues a sub-task
 *   POST /api/v1/pet/a2a/:dispatchId/start       → executor marks running
 *   POST /api/v1/pet/a2a/:dispatchId/complete    → executor reports success
 *   POST /api/v1/pet/a2a/:dispatchId/fail        → executor reports failure
 *   POST /api/v1/pet/a2a/recover                 → admin sweep stale dispatches
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/a2a')
export class PetA2AController {
  constructor(private readonly dispatchService: PetA2ADispatchService) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('dispatch')
  async dispatch(
    @Req() req: any,
    @Body() body: {
      pet_skin_id: string;
      task_name: string;
      target_agent_id: string;
      payload?: Record<string, unknown>;
      reward_cents?: number;
    },
  ) {
    const d = await this.dispatchService.dispatch({
      userId: this.uid(req),
      petSkinId: body.pet_skin_id,
      taskName: body.task_name,
      targetAgentId: body.target_agent_id,
      payload: body.payload,
      rewardCents: body.reward_cents,
    });
    return { dispatch: d };
  }

  @Post(':dispatchId/start')
  async start(@Req() req: any, @Param('dispatchId') id: string) {
    return { dispatch: await this.dispatchService.markRunning(id, this.uid(req)) };
  }

  @Post(':dispatchId/complete')
  async complete(
    @Req() req: any,
    @Param('dispatchId') id: string,
    @Body() body: { result?: Record<string, unknown> },
  ) {
    return {
      dispatch: await this.dispatchService.complete(id, this.uid(req), body.result ?? {}),
    };
  }

  @Post(':dispatchId/fail')
  async fail(
    @Req() req: any,
    @Param('dispatchId') id: string,
    @Body() body: { error_message: string },
  ) {
    return {
      dispatch: await this.dispatchService.fail(id, this.uid(req), body.error_message || 'unknown'),
    };
  }

  @Post('recover')
  async recover(@Body() body: { timeout_ms?: number }) {
    const recovered = await this.dispatchService.recoverStale(body.timeout_ms);
    return { recovered };
  }
}
